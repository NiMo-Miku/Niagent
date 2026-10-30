import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import marketPlugin, { createMarketService } from '../bundled/market/index.js';
import communityPlugin from '../bundled/community/index.js';
import telemetryPlugin from '../bundled/telemetry/index.js';
import remindersPlugin from '../bundled/reminders/index.js';
import dialectPlugin from '../bundled/llm-dialects/index.js';
import { dialectProvider } from '../bundled/llm-dialects/dialects.js';
import { createTelemetry as bundledTelemetry } from '../bundled/telemetry/service.js';
import { createCommunityMarketAdapters as bundledMarketClient } from '../bundled/market/client.js';
import { createTelemetry } from '../src/kernel/telemetry.js';
import { createCommunityMarketAdapters } from '../src/console/community-market-adapters.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createReminderStore } from '../src/kernel/reminders.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { chatCompletion, detectDialect, buildThinkingParams } from '../src/kernel/llm.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createChatStore } from '../src/kernel/store.js';
import { createHttpServer } from '../src/kernel/http.js';
import { createServiceHost, serviceFacade } from '../src/kernel/service-host.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { COMMUNITY_BASE_URL } from '../bundled/market/client.js';

const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function temporary(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-default-services-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  return dataDir;
}
function context(t, { fixture = {}, config = {}, capabilities = {}, fetch = async () => new Response('{}') } = {}) {
  const dataDir = temporary(t);
  const registrations = new Map(), tasks = new Set(), stops = [], changes = new Set(), events = [], requests = [];
  const hostConfig = {
    get: () => structuredClone(config),
    update: (patch) => { Object.assign(config, patch); for (const fn of changes) fn(hostConfig.get()); },
    onChange: (fn) => { changes.add(fn); return () => changes.delete(fn); },
  };
  const schedule = (method, when, fn, options) => {
    const task = { method, when, fn, options }; tasks.add(task);
    return { stop: () => tasks.delete(task) };
  };
  const values = {
    'host.environment': { dataDir, appRoot: path.resolve('.'), version: '0.5.0', profile: { n: 1 } },
    'host.config': hostConfig, 'host.defaults': { communityMarket: fixture },
    'data.sessions': { peek: () => undefined }, 'tools.catalog': { list: () => [] },
    ...capabilities,
  };
  const ctx = {
    log: {}, capability: (name) => values[name],
    registerCapability: (name, provider, options) => registrations.set(name, { provider, options }),
    lifecycle: { onStop: (fn) => stops.push(fn) },
    scheduler: { every: (when, fn, opts) => schedule('every', when, fn, opts), at: (when, fn, opts) => schedule('at', when, fn, opts) },
    events: { emit: (name, payload) => events.push({ name, payload }) },
    http: { fetch: async (...args) => { requests.push(args); return fetch(...args); } },
  };
  const fire = async (task = [...tasks][0]) => { if (task.method === 'at') tasks.delete(task); await task.fn(); await tick(); };
  const stop = () => { for (const fn of stops) fn(); };
  t.after(stop);
  return { ctx, dataDir, registrations, tasks, changes, events, requests, config: hostConfig, fire, stop };
}
const success = () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'fixture' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });

test('default plugins declare a narrow host interface and setup only registers', (t) => {
  const fixture = { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) };
  const store = createReminderStore({ dataDir: temporary(t), log: {} });
  const runtimeCalls = [];
  const entries = [
    ['market', marketPlugin, 'market.client', []],
    ['community', communityPlugin, 'community.client', ['globalBlocklist', 'communityExemptions']],
    ['telemetry', telemetryPlugin, 'telemetry.service', ['telemetry']],
    ['reminders', remindersPlugin, 'reminders.service', []],
    ['llm-dialects', dialectPlugin, 'llm.dialect', []],
  ];
  for (const [id, plugin, name, hostConfig] of entries) {
    const manifest = JSON.parse(fs.readFileSync(path.join('bundled', id, 'plugin.json'), 'utf8'));
    assert.equal(manifest.kind, 'plugin'); assert.equal(manifest.enabledByDefault, true);
    assert.deepEqual(manifest.hostConfig, hostConfig); assert.deepEqual(manifest.capabilities, [name]);
    const e = context(t, { fixture, capabilities: { 'data.reminders': store, 'runtime.reminders': { start: () => runtimeCalls.push('start'), stop: () => runtimeCalls.push('stop') } } });
    plugin.setup(e.ctx);
    const registration = e.registrations.get(name);
    assert.equal(registration.options.default, true);
    if (id !== 'llm-dialects') assert.equal(registration.options.lifecycle, true);
    assert.equal(e.tasks.size, 0); assert.equal(e.requests.length, 0);
    assert.doesNotMatch(fs.readFileSync(path.join('bundled', id, 'index.js'), 'utf8'), /ctx\.kernel/);
  }
  assert.deepEqual(runtimeCalls, []);
});

test('market and community clients retain compatibility exports and separate methods', async (t) => {
  assert.equal(createTelemetry, bundledTelemetry);
  assert.equal(createCommunityMarketAdapters, bundledMarketClient);
  const calls = [];
  const e = context(t, { fixture: { login: async (input) => { calls.push(input); return { ok: true }; }, getBlocklist: () => ({ ok: true, ids: ['123'] }) } });
  const service = createMarketService(e.ctx);
  assert.equal(service.getBlocklist, undefined); assert.equal(service.syncGlobalBlocklist, undefined);
  assert.deepEqual(await service.login({ account: 'fixture' }), { ok: true });
  service.start(); service.start(); service.stop(); service.stop();
  assert.deepEqual(calls, [{ account: 'fixture' }]); assert.equal(e.requests.length, 0);
  communityPlugin.setup(e.ctx);
  const community = e.registrations.get('community.client').provider;
  assert.equal(community.install, undefined); assert.equal(community.login, undefined);
  assert.deepEqual(community.getBlocklist(), { ok: true, ids: ['123'] });
});

test('production market client uses its original storage with no setup networking', (t) => {
  const e = context(t, { fixture: null });
  marketPlugin.setup(e.ctx);
  const service = e.registrations.get('market.client').provider;
  assert.deepEqual(service.listAccounts(), { ok: true, accounts: [] });
  fs.writeFileSync(path.join(e.dataDir, 'account.json'), JSON.stringify({ accounts: [{ id: 'local', username: 'fixture', token: 'must-not-leak' }] }));
  const listing = service.listAccounts();
  assert.equal(listing.accounts.length, 1); assert.doesNotMatch(JSON.stringify(listing), /must-not-leak/);
  assert.equal(e.requests.length, 0);
});

test('community starts once, syncs through its owner scheduler, and stops completely', async (t) => {
  let syncs = 0;
  const e = context(t, { fixture: { syncGlobalBlocklist: async () => { syncs++; return { ok: true, ids: ['123', '456'] }; } } });
  communityPlugin.setup(e.ctx);
  const service = e.registrations.get('community.client').provider;
  assert.equal(syncs, 0);
  service.start(); service.start(); await tick();
  assert.equal(syncs, 1); assert.equal(e.tasks.size, 1);
  const task = [...e.tasks][0]; assert.equal(task.when, 300_000);
  assert.deepEqual(e.events[0], { name: 'blocklist-sync', payload: { ok: true, count: 2, error: null } });
  await e.fire(task); assert.equal(syncs, 2);
  service.stop(); service.stop(); assert.equal(e.tasks.size, 0);
  await task.fn(); assert.equal(syncs, 2);
  service.start(); await tick(); assert.equal(syncs, 3); assert.equal(e.tasks.size, 1);
  e.stop(); assert.equal(e.tasks.size, 0);
});

test('community suppresses pending results after stop and old generations cannot block restart', async (t) => {
  const pending = deferred(); let calls = 0;
  const e = context(t, { fixture: { syncGlobalBlocklist: () => ++calls === 1 ? pending.promise : Promise.resolve({ ok: true, ids: ['456'] }) } });
  communityPlugin.setup(e.ctx);
  const service = e.registrations.get('community.client').provider;
  service.start(); const stale = [...e.tasks][0]; service.stop();
  service.start(); await tick();
  assert.equal(calls, 2); assert.equal(e.events.length, 1);
  pending.resolve({ ok: true, ids: ['123'] }); await tick();
  assert.equal(e.events.length, 1); assert.equal(e.events[0].payload.count, 1);
  await stale.fn(); assert.equal(calls, 2);
  e.stop(); assert.equal(e.tasks.size, 0);
});

test('telemetry uses real session totals, owner timers, and an anonymous payload', async (t) => {
  const e = context(t, { fetch: async () => new Response('{}') });
  const sessions = createSessionRegistry({ dataDir: e.dataDir, log: {} }); t.after(() => sessions.stop());
  e.ctx.capability = ((base) => (name) => name === 'data.sessions' ? sessions : base(name))(e.ctx.capability);
  const s = sessions.create('group:123', {});
  sessions.finish(s.id, 'done', { traceVersion: 1, usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13, cachedTokens: 2, calls: 2 }, messages: [{ role: 'user', content: 'private-message-fixture' }, { role: 'tool', toolCall: { name: 'send_message' } }] });
  telemetryPlugin.setup(e.ctx);
  const service = e.registrations.get('telemetry.service').provider;
  service.start(); service.start(); assert.equal(e.tasks.size, 1);
  const first = [...e.tasks][0]; assert.ok(Math.abs(first.when.getTime() - Date.now() - 90_000) < 1000);
  await e.fire(first);
  const payload = JSON.parse(e.requests[0][1].body);
  // DSH-ARCH §10.4 preserves the 0.4 wire names; toolCounts remains local only.
  assert.deepEqual(Object.keys(payload).sort(), ['calls', 'inputTokens', 'installId', 'outputTokens', 'tools', 'totalTokens', 'version']);
  assert.equal(payload.calls, 2); assert.equal(payload.inputTokens, 10); assert.equal(payload.outputTokens, 3); assert.equal(payload.totalTokens, 13); assert.equal(payload.tools.send_message, 1);
  assert.ok(payload.installId); assert.doesNotMatch(JSON.stringify(payload), /private-message-fixture|group:123|cachedTokens/);
  assert.equal(e.tasks.size, 1);
  const periodic = [...e.tasks][0]; assert.ok(Math.abs(periodic.when.getTime() - Date.now() - 21_600_000) < 1000);
  service.stop(); assert.equal(e.tasks.size, 0); assert.equal(e.changes.size, 0);
  await periodic.fn(); assert.equal(e.requests.length, 1);
});

test('telemetry legacy enabled switch is live and plugin stop removes its subscription', (t) => {
  const e = context(t, { config: { telemetry: { enabled: false } } });
  telemetryPlugin.setup(e.ctx);
  const service = e.registrations.get('telemetry.service').provider;
  service.start(); assert.equal(e.tasks.size, 0); assert.equal(e.changes.size, 1);
  e.config.update({ telemetry: { enabled: true } }); assert.equal(e.tasks.size, 1);
  e.config.update({ telemetry: { enabled: false } }); assert.equal(e.tasks.size, 0);
  e.config.update({ telemetry: { enabled: true } }); assert.equal(e.tasks.size, 1);
  e.stop(); assert.equal(e.tasks.size, 0); assert.equal(e.changes.size, 0);
  e.config.update({ telemetry: { enabled: true } }); assert.equal(e.tasks.size, 0);
});

test('telemetry aborts pending HTTP and cannot schedule a late report after stop', async (t) => {
  const pending = deferred(); let signal;
  const e = context(t, { fetch: async (_, options) => { signal = options.signal; return pending.promise; } });
  // A pending report requires usage; zero-call installations intentionally skip.
  fs.writeFileSync(path.join(e.dataDir, 'telemetry-totals.json'), JSON.stringify({ calls: 1, promptTokens: 1, completionTokens: 0, totalTokens: 1, toolCounts: {} }));
  telemetryPlugin.setup(e.ctx);
  const service = e.registrations.get('telemetry.service').provider;
  service.start(); const firing = e.fire(); await tick();
  assert.equal(e.requests.length, 1); service.stop(); assert.equal(signal.aborted, true);
  pending.resolve(new Response('{}')); await firing;
  assert.equal(e.tasks.size, 0); assert.equal(e.requests.length, 1);
});

test('reminders use only the data/runtime capabilities and an idempotent lifecycle', (t) => {
  const store = createReminderStore({ dataDir: temporary(t), log: {} });
  const calls = [];
  const e = context(t, { capabilities: { 'data.reminders': store, 'runtime.reminders': { start: (actual) => calls.push(['start', actual]), stop: () => calls.push(['stop']) } } });
  remindersPlugin.setup(e.ctx);
  const service = e.registrations.get('reminders.service').provider;
  assert.equal(calls.length, 0); service.start(); service.start();
  assert.deepEqual(calls, [['start', store]]);
  service.stop(); service.stop(); e.stop(); assert.deepEqual(calls, [['start', store], ['stop']]);
  service.start(); e.stop(); assert.equal(calls.length, 4);
});

test('LLM core has no production dialect fallback; compatibility helpers still work', async (t) => {
  const e = context(t); dialectPlugin.setup(e.ctx);
  assert.equal(e.registrations.get('llm.dialect').provider, dialectProvider);
  assert.equal(detectDialect('https://api.deepseek.com', 'fixture'), 'deepseek');
  assert.deepEqual(buildThinkingParams({ dialect: 'deepseek', on: true }).params, { thinking: { type: 'enabled' } });
  const bodies = [];
  const args = { cfg: { api: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', thinkingEffort: 'off', thinkingMode: 'auto' } }, messages: [{ role: 'user', content: 'fixture' }], fetchFn: async (_, options) => { bodies.push(JSON.parse(options.body)); return success(); }, log: {} };
  await chatCompletion(args);
  assert.equal(bodies[0].thinking, undefined); assert.equal(bodies[0].temperature, 0.8);
  await chatCompletion({ ...args, capabilities: { providers: (name) => name === 'llm.dialect' ? [{ provider: dialectProvider }] : [] } });
  assert.deepEqual(bodies[1].thinking, { type: 'disabled' }, 'explicit effort off disables thinking through the selected dialect');
  assert.equal(bodies[1].temperature, 0.8, 'disabled thinking retains the configured sampling temperature');
});

test('a replacement dialect controls request shaping and rejection degradation', async () => {
  const bodies = [], methods = [];
  const registry = createCapabilityRegistry();
  registry.register('llm.dialect', 'replacement', {
    detect: async () => { methods.push('detect'); return 'fixture'; },
    build: async ({ dialect }) => { assert.equal(dialect, 'fixture'); methods.push('build'); return { params: { fixture_think: true }, omitTemperature: true }; },
    looksLikeRejection: async (text) => { methods.push('reject'); return text.includes('fixture_think'); },
  });
  const args = { cfg: { api: { baseUrl: 'https://fixture.invalid/v1', model: 'fixture' } }, messages: [{ role: 'user', content: 'fixture' }], capabilities: registry, fetchFn: async (_, options) => { bodies.push(JSON.parse(options.body)); return bodies.length === 1 ? new Response('unsupported fixture_think', { status: 400 }) : success(); }, log: {} };
  const result = await chatCompletion(args);
  assert.equal(result.degraded, true); assert.equal(bodies.length, 2);
  assert.equal(bodies[0].fixture_think, true); assert.equal(bodies[0].temperature, undefined);
  assert.equal(bodies[1].fixture_think, undefined); assert.equal(bodies[1].temperature, 0.8);
  assert.deepEqual(methods, ['detect', 'build', 'reject']);
  registry.unregister('llm.dialect', 'replacement');
  bodies.length = 0; await chatCompletion({ ...args, fetchFn: async (_, options) => { bodies.push(JSON.parse(options.body)); return success(); } });
  assert.equal(bodies[0].fixture_think, undefined);
});

test('without a dialect provider the core does not apply a hidden vendor rejection rule', async () => {
  let calls = 0;
  await assert.rejects(chatCompletion({ cfg: { api: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' } }, messages: [{ role: 'user', content: 'fixture' }], fetchFn: async () => { calls++; return new Response('unsupported thinking parameter', { status: 400 }); }, log: {} }), (error) => error.status === 400);
  assert.equal(calls, 1);
});

async function consoleFixture(t, prepare = async () => ({})) {
  const dataDir = temporary(t), appRoot = temporary(t), staticDir = temporary(t);
  const log = { error() {}, warn() {}, info() {} };
  const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log }); config.load();
  config.update({ server: { port: 0, token: 'default-service-fixture' } });
  const sessions = createSessionRegistry({ dataDir, log });
  const store = createChatStore({ dataDir, log });
  const base = { dataDir, appRoot, log, config, sessions, store, loader: { listEntries: () => [], promptSections: () => [] } };
  const deps = { ...base, ...await prepare(base) };
  const http = createHttpServer({ config, log, staticDir });
  registerConsoleRoutes(http, deps); const port = await http.listen();
  t.after(async () => { await http.close(); await deps.services?.stop?.(); });
  const request = async (method, pathname, body) => {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers: { 'x-console-token': 'default-service-fixture', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  return { ...deps, request };
}

test('console provider selection validates active implementations and waits for dynamic service switching', async (t) => {
  const lifecycle = [];
  const f = await consoleFixture(t, async ({ config, log }) => {
    const active = new Set(['default-market', 'custom-market', 'default-community']);
    const capability = createCapabilityRegistry({ isOwnerActive: (owner) => active.has(owner), selection: () => config.get().extensions?.providers ?? {} });
    const market = (ownerId) => ({ start: () => lifecycle.push(`start:${ownerId}`), stop: () => lifecycle.push(`stop:${ownerId}`), listAccounts: () => ({ ok: true, ownerId }), login: (body) => ({ ok: true, ownerId, body }) });
    capability.register('market.client', 'default-market', market('default-market'), { default: true, lifecycle: true });
    capability.register('market.client', 'custom-market', market('custom-market'), { lifecycle: true });
    capability.register('market.client', 'disabled', market('disabled'));
    capability.register('market.client', 'empty', null);
    capability.register('community.client', 'default-community', { getBlocklist: () => ({ ok: true, ids: ['123'] }) }, { default: true });
    config.update({ extensions: { providers: { 'community.client': 'default-community' } } });
    const services = createServiceHost({ capability, config, log }); await services.start();
    return { capability, services, marketClient: serviceFacade(() => services.get('market.client'), ['listAccounts', 'login']), communityClient: serviceFacade(() => services.get('community.client'), ['getBlocklist']) };
  });
  const getMarket = async () => (await f.request('GET', '/api/market/accounts')).data.ownerId;
  assert.equal(await getMarket(), 'custom-market');
  let result = await f.request('GET', '/api/skills/capabilities');
  let row = result.data.capabilities.find((item) => item.name === 'market.client');
  assert.equal(row.available, true); assert.equal(row.multi, false); assert.equal(row.selectedOwnerId, 'custom-market'); assert.equal(row.pinnedOwnerId, null);
  assert.equal(row.providers.find((item) => item.ownerId === 'default-market').default, true);
  assert.equal(row.providers.find((item) => item.ownerId === 'default-market').selectable, true, 'a standby implementation can still be chosen');
  assert.equal(row.providers.find((item) => item.ownerId === 'default-market').usable, false, 'a standby managed provider is not a running service');
  assert.equal(row.providers.find((item) => item.ownerId === 'custom-market').running, true);
  assert.equal(row.providers.find((item) => item.ownerId === 'custom-market').status, 'running');
  assert.equal(row.providers.find((item) => item.skillId === 'empty').usable, false);
  result = await f.request('PUT', '/api/skills/capabilities/provider', { name: 'market.client', ownerId: 'default-market' });
  assert.equal(result.status, 200); assert.equal(result.data.ok, true);
  assert.equal(result.data.capability.providers.find((item) => item.selected).ownerId, 'default-market');
  assert.equal(result.data.services.find((item) => item.name === 'market.client').running, true);
  assert.equal(await getMarket(), 'default-market');
  assert.deepEqual(lifecycle.slice(0, 3), ['start:custom-market', 'stop:custom-market', 'start:default-market']);
  result = await f.request('GET', '/api/skills/capabilities'); row = result.data.capabilities.find((item) => item.name === 'market.client');
  assert.equal(row.pinnedOwnerId, 'default-market');
  for (const ownerId of ['disabled', 'empty', 'unknown']) {
    result = await f.request('PUT', '/api/skills/capabilities/provider', { name: 'market.client', ownerId });
    assert.equal(result.status, 409); assert.equal(await getMarket(), 'default-market');
  }
  for (const body of [{ name: 'missing', ownerId: '' }, { name: 'market.client' }, { name: '__proto__', ownerId: 'default-market' }]) {
    result = await f.request('PUT', '/api/skills/capabilities/provider', body); assert.ok([400, 404].includes(result.status));
  }
  result = await f.request('PUT', '/api/skills/capabilities/provider', { name: 'market.client', ownerId: '' });
  assert.equal(result.status, 200); assert.equal(await getMarket(), 'custom-market');
  assert.deepEqual(f.config.get().extensions.providers, { 'community.client': 'default-community' });
  assert.deepEqual((await f.request('GET', '/api/community/blocklist')).data.ids, ['123']);
  f.capability.unregisterOwner('default-community'); await f.services.refresh();
  assert.equal((await f.request('GET', '/api/community/blocklist')).status, 503);
});

test('multi claim order ignores defaults and pins, and HTTP only allows clearing a legacy multi pin', async (t) => {
  const f = await consoleFixture(t, async ({ config, log }) => {
    const capability = createCapabilityRegistry({ selection: () => config.get().extensions?.providers ?? {} });
    capability.register('media.download', 'first', () => ({ from: 'first' }), { default: true });
    capability.register('media.download', 'second', () => ({ from: 'second' }));
    config.update({ extensions: { providers: { 'media.download': 'second' } } });
    const services = createServiceHost({ capability, config, log }); await services.start();
    return { capability, services };
  });
  assert.deepEqual(f.capability.providers('media.download').map((item) => item.ownerId), ['first', 'second']);
  assert.equal(f.capability.claim('media.download').ownerId, 'first');
  assert.equal((await f.capability.claimAsync('media.download')).ownerId, 'first');
  const row = (await f.request('GET', '/api/skills/capabilities')).data.capabilities.find((item) => item.name === 'media.download');
  assert.equal(row.multi, true); assert.equal(row.selectedOwnerId, null);
  assert.deepEqual(row.providers.map((item) => item.ownerId), ['first', 'second']); assert.ok(row.providers.every((item) => !item.selected && item.usable));
  assert.equal((await f.request('PUT', '/api/skills/capabilities/provider', { name: 'media.download', ownerId: 'first' })).status, 400);
  assert.equal(f.config.get().extensions.providers['media.download'], 'second');
  assert.equal((await f.request('PUT', '/api/skills/capabilities/provider', { name: 'media.download', ownerId: '' })).status, 200);
  assert.equal(f.config.get().extensions.providers['media.download'], undefined);
  assert.equal(f.capability.claim('media.download').ownerId, 'first');
});

test('managed provider DTO reports denied and failed services without marking them usable', async (t) => {
  let authorized = false, failStart = false;
  const f = await consoleFixture(t, async ({ config, log }) => {
    const capability = createCapabilityRegistry({ selection: () => config.get().extensions?.providers ?? {} });
    capability.register('fixture.managed', 'owner', { start() { if (failStart) throw new Error('受控启动失败'); }, stop() {} }, { lifecycle: true });
    const services = createServiceHost({ capability, config, log, authorize: () => authorized }); await services.start();
    return { capability, services };
  });
  let result = await f.request('PUT', '/api/skills/capabilities/provider', { name: 'fixture.managed', ownerId: 'owner' });
  let provider = result.data.capability.providers[0];
  assert.equal(result.status, 200); assert.equal(provider.selected, true); assert.equal(provider.selectable, true);
  assert.equal(provider.running, false); assert.equal(provider.usable, false); assert.equal(provider.status, 'error'); assert.match(provider.error, /尚未获得授权/);
  authorized = true; failStart = true; await f.services.refresh();
  provider = (await f.request('GET', '/api/skills/capabilities')).data.capabilities[0].providers[0];
  assert.equal(provider.running, false); assert.equal(provider.usable, false); assert.match(provider.error, /受控启动失败/);
  failStart = false; await f.services.refresh();
  provider = (await f.request('GET', '/api/skills/capabilities')).data.capabilities[0].providers[0];
  assert.equal(provider.running, true); assert.equal(provider.usable, true); assert.equal(provider.status, 'running'); assert.equal(provider.error, null);
});

test('managed provider stays unready in real HTTP DTO until its asynchronous start finishes', async (t) => {
  let releaseStart, enteredStart;
  const entered = new Promise((resolve) => { enteredStart = resolve; });
  const starting = new Promise((resolve) => { releaseStart = resolve; });
  const definition = { start() { enteredStart(); return starting; }, stop() {} };
  const f = await consoleFixture(t, ({ config, log }) => {
    const capability = createCapabilityRegistry();
    capability.register('fixture.managed', 'owner', definition, { lifecycle: true });
    return { capability, services: createServiceHost({ capability, config, log }) };
  });
  const activation = f.services.start(); await entered;
  try {
    assert.equal(f.services.get('fixture.managed'), definition, 'instance registration remains available to startup dependencies');
    assert.equal(f.services.status()[0].running, false);
    let row = (await f.request('GET', '/api/skills/capabilities')).data.capabilities[0];
    assert.equal(row.available, false); assert.equal(row.providers[0].selected, true); assert.equal(row.providers[0].selectable, true);
    assert.equal(row.providers[0].running, false); assert.equal(row.providers[0].usable, false); assert.notEqual(row.providers[0].status, 'running');
    releaseStart(); await activation;
    row = (await f.request('GET', '/api/skills/capabilities')).data.capabilities[0];
    assert.equal(row.available, true); assert.equal(row.providers[0].running, true); assert.equal(row.providers[0].usable, true); assert.equal(row.providers[0].status, 'running');
  } finally { releaseStart(); await activation; }
});

test('console with capabilities never creates a fixed legacy market or community fallback', async (t) => {
  let requests = 0;
  const f = await consoleFixture(t, () => ({ capability: createCapabilityRegistry(), fetchImpl: async () => { requests++; throw new Error('unexpected legacy network'); } }));
  assert.equal((await f.request('GET', '/api/market/accounts')).status, 503);
  assert.equal((await f.request('GET', '/api/community/blocklist')).status, 503);
  assert.equal((await f.request('POST', '/api/community/blocklist', { ids: ['123'] })).status, 503);
  assert.equal(requests, 0); assert.equal(fs.existsSync(path.join(f.dataDir, 'account.json')), false);
});

function storedZip(files) {
  const local = [], central = []; let offset = 0;
  for (const [filename, value] of Object.entries(files)) {
    const name = Buffer.from(filename), data = Buffer.from(value); let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
    local.push(header, name, data); central.push(entry, name); offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

test('default market installs through the route-bound safe ZIP capability and keeps new packages disabled', async (t) => {
  t.mock.method(dns, 'lookup', async () => [{ address: '203.0.113.8', family: 4 }]);
  let payload = storedZip({ 'plugin.json': JSON.stringify({ id: 'default-service-installed', kind: 'plugin', entry: 'index.js' }), 'index.js': 'export default {}' });
  const loads = [], requests = [];
  const f = await consoleFixture(t, ({ dataDir, appRoot, config }) => {
    let installZip;
    const e = context(t, { fixture: null, capabilities: { 'host.environment': { dataDir, appRoot }, 'extensions.installZip': { install: (...args) => installZip(...args) } }, fetch: async (url) => {
      requests.push(url);
      if (url === `${COMMUNITY_BASE_URL}/plugins`) return new Response(JSON.stringify({ok:true,items:[{id:'default-service-installed',type:'plugin',status:'approved',installCode:'ABC123'}]}));
      if (url === `${COMMUNITY_BASE_URL}/install/verify`) return new Response(JSON.stringify({ ok: true, results: [{ code: 'ABC123', ok: true, type: 'plugin', id:'default-service-installed' }] }));
      if (url === `${COMMUNITY_BASE_URL}/install/ABC123/download`) return new Response(payload);
      throw new Error(`unexpected request: ${url}`);
    } });
    const marketClient = createMarketService(e.ctx);
    return { capability: createCapabilityRegistry(), marketClient, bindInstallZip: (fn) => { installZip = fn; }, loader: { listEntries: () => [], loadDir: async (kind, dir) => { loads.push({ kind, dir, enabled: config.get().skills[path.basename(dir)]?.enabled }); } } };
  });
  let result = await f.request('POST', '/api/market/install', { id:'default-service-installed',kind:'plugin' });
  assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(result.data.installed, 'default-service-installed'); assert.equal(result.data.kind, 'plugin');
  assert.equal(fs.existsSync(path.join(f.appRoot, 'plugins', 'default-service-installed', 'plugin.json')), true);
  assert.equal(loads[0].enabled, false); assert.equal(requests.length, 3);
  payload = storedZip({ '../escaped.js': 'fixture' });
  result = await f.request('POST', '/api/market/install', { id:'default-service-installed',kind:'plugin' });
  assert.equal(result.status, 502); assert.equal(fs.existsSync(path.join(f.appRoot, 'escaped.js')), false); assert.equal(loads.length, 1);
});

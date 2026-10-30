// Actual default loader/SDK, protocol provider, ingress, prompts, runner and
// registered tools. Every transport/native boundary is owned and inert.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import dgram from 'node:dgram';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createApplication } from '../src/kernel/composition.js';
import { defaultComponents as defaults } from '../bundled/runtime-defaults/components.js';
import { OneBotClient } from '../bundled/transport-onebot/client.js';

const source = path.resolve(import.meta.dirname, '..'), unexpected = [], restores = [];
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; };
async function until(check) { for (let n = 0; n < 200; n++) { if (check()) return; await tick(); } assert.ok(check(), 'owned operation completed'); }
const finish = () => ({ message: { role: 'assistant', content: '', tool_calls: [{ id: 'finish235', type: 'function', function: { name: 'finish', arguments: '{"reason":"offline235 complete"}' } }] }, finishReason: 'tool_calls' });
function deny(object, key, label) { const value = object[key]; object[key] = () => { unexpected.push(label); throw new Error(`235 forbids ${label}`); }; restores.push(() => { object[key] = value; }); }
let fetchHandler = null;
class InertSocket extends EventEmitter {
  constructor(url) { super(); this.url = String(url); this.readyState = 0; }
  close() { this.readyState = 3; }
  terminate() { this.readyState = 3; }
}
test.before(() => {
  for (const name of ['connect', 'createConnection']) deny(net, name, `net.${name}`);
  deny(net.Socket.prototype, 'connect', 'socket'); deny(net.Server.prototype, 'listen', 'listener');
  deny(tls, 'connect', 'tls'); deny(dgram, 'createSocket', 'dgram');
  for (const object of [http, https]) for (const key of ['request', 'get']) deny(object, key, `HTTP ${key}`);
  for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCname', 'resolveNs', 'resolvePtr', 'resolveSrv', 'reverse']) {
    if (typeof dns[name] === 'function') deny(dns, name, `dns.${name}`);
    if (typeof dns.promises[name] === 'function') deny(dns.promises, name, `dns.promises.${name}`);
  }
  for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) deny(childProcess, key, `native ${key}`);
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => {
    const target = new URL(url);
    if (target.hostname !== 'fixture235.invalid' || options?.method !== 'POST' || !fetchHandler) { unexpected.push('fetch'); throw new Error('235 forbids unowned fetch'); }
    return fetchHandler(target, options);
  };
  restores.push(() => { globalThis.fetch = nativeFetch; });
  const original = OneBotClient.prototype._createSocket;
  OneBotClient.prototype._createSocket = function (url) { const socket = new InertSocket(url); socket.owner = this; return socket; };
  restores.push(() => { OneBotClient.prototype._createSocket = original; });
  syncBuiltinESMExports();
});
test.after(() => { for (const restore of restores.reverse()) restore(); syncBuiltinESMExports(); assert.deepEqual(unexpected, []); });
function timers() {
  const previous = { setTimeout, clearTimeout, setInterval, clearInterval }, tasks = new Map();
  const add = (fn, delay = 0) => { const handle = { unref() { return this; } }; tasks.set(handle, { fn, delay: Number(delay) }); return handle; };
  globalThis.setTimeout = add; globalThis.clearTimeout = handle => tasks.delete(handle);
  globalThis.setInterval = () => ({ unref() { return this; } }); globalThis.clearInterval = () => {};
  return { tasks, fire(delay) { const entry = [...tasks].find(([, task]) => task.delay === delay); assert.ok(entry, `real ${delay}ms timer registered`); tasks.delete(entry[0]); entry[1].fn(); }, restore() { Object.assign(globalThis, previous); } };
}
const response = data => ({ ok: true, status: 200, async json() { return { status: 'ok', retcode: 0, data }; } });
function removeTemporary(root) {
  const absolute = path.resolve(root); assert.equal(path.dirname(absolute).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(absolute).startsWith('qqa-transport235-')); fs.rmSync(absolute, { recursive: true, force: true });
}
async function fixture(t, { config: patch = {}, layer = null, sdk = false, model = null } = {}) {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-transport235-')), dataDir = path.join(appRoot, 'data'), clock = timers();
  let app, mid = 235000, ingestOptions;
  const models = [], calls = [], routes = new Map(), cache = new Map();
  const state = { account: '23599', nickname: 'QA_LIVE_NICK', member: null, sendError: null };
  for (const folder of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, folder), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
  fs.cpSync(path.join(source, 'bundled/core-tools'), path.join(appRoot, 'bundled/core-tools'), { recursive: true });
  const transportDir = path.join(appRoot, 'bundled/transport-onebot'); fs.mkdirSync(transportDir);
  fs.copyFileSync(path.join(source, 'bundled/transport-onebot/plugin.json'), path.join(transportDir, 'plugin.json'));
  fs.writeFileSync(path.join(transportDir, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(path.join(source, 'bundled/transport-onebot/index.js')).href)};`);
  if (sdk) {
    const dir = path.join(appRoot, 'plugins/probe235'); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'probe235', kind: 'plugin', apiVersion: 1, entry: 'index.js', enabledByDefault: true, permissions: ['data.sessions.read', 'net.outbound'] }));
    fs.writeFileSync(path.join(dir, 'index.js'), 'export default {setup(ctx){globalThis.__qaSdk235={lookup:(gid,uid,options)=>ctx.capability("transport.actions").getGroupMemberInfo(gid,uid,options),registerTransport:provider=>ctx.registerTransport({id:"probe235",create:()=>provider})};}};');
  }
  if (layer) {
    const dir = path.join(appRoot, 'overrides/names235'); fs.mkdirSync(dir, { recursive: true });
    const body = layer.mode === 'wrap'
      ? 'export default previous => options => previous({...options,resolveAtName:async()=>"QA_WRAPPED_NAME"});'
      : `import {createIngest} from ${JSON.stringify(pathToFileURL(path.join(source, 'src/kernel/ingest.js')).href)};export default options=>createIngest({...options,resolveAtName:async()=>"QA_REPLACED_NAME"});`;
    fs.writeFileSync(path.join(dir, 'index.mjs'), body);
    fs.writeFileSync(path.join(dir, 'composition.json'), JSON.stringify({ version: 2, id: 'names235', enabled: layer.enabled !== false, components: { 'core.ingest': { module: 'index.mjs', mode: layer.mode } } }));
  }
  fetchHandler = async (url, options) => {
    const action = url.pathname.split('/').at(-1), params = JSON.parse(options.body); calls.push({ action, params, signal: options.signal, redirect: options.redirect, token: url.searchParams.get('access_token') });
    if (action === 'get_login_info') return response({ user_id: Number(state.account), nickname: state.nickname });
    if (action === 'get_group_member_info') {
      if (String(params.user_id) === state.account) return response({ user_id: Number(state.account), shut_up_timestamp: 0 });
      return response(await (state.member ? state.member(params, options) : { user_id: params.user_id, card: `QA_COLD_${params.group_id}_${params.user_id}` }));
    }
    if (action === 'send_group_msg') { if (state.sendError) throw state.sendError; return response({ message_id: ++mid }); }
    throw new Error('unexpected action ' + action);
  };
  const components = {
    'runtime.logger': options => defaults['runtime.logger']({ ...options, mirrorConsole: false }),
    'runtime.http': options => {
      const server = defaults['runtime.http'](options), route = server.route, scope = server.createRouteScope;
      const observe = call => (method, pattern, handler, settings) => { routes.set(`${method} ${pattern}`, handler); return call(method, pattern, handler, settings); };
      server.route = observe(route);
      server.createRouteScope = options => { const selected = scope(options); return { ...selected, route: observe(selected.route) }; };
      return server;
    },
    'core.orchestrator': options => defaults['core.orchestrator']({ ...options, llmInvoker: async args => { models.push(structuredClone(args.messages)); return model ? model(args, models.length) : finish(); } }),
    ...(!layer ? { 'core.ingest': options => { ingestOptions = options; return defaults['core.ingest']({ ...options, atNameCache: cache }); } } : {}),
  };
  t.after(async () => { try { await app?.stop(); } finally { clock.restore(); removeTemporary(appRoot); } });
  app = await createApplication({ appRoot, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_MIGRATE_FROM: path.join(appRoot, 'absent-migration'), QQ_AGENT_PORT: '0' }, components,
    priceUpdates: { refresh: async () => ({ ok: true, remote: false }), resolve: () => null }, fetchImpl: async () => { throw new Error('235 has no generic SDK HTTP transport'); } });
  const save = value => { app.config.update(value); const disk = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')); app.config.load(); assert.deepEqual(app.config.get(), disk); return disk; };
  save({ api: { model: 'offline235', maxRounds: 3 }, allow: { groups: ['23501', '23502'] }, onebot: { wsUrl: 'ws://fixture235.invalid', httpUrl: 'http://fixture235.invalid', accessToken: 'QA_SECRET_235', httpAccessToken: 'QA_HTTP_SECRET_235' },
    telemetry: { enabled: false }, proactive: { enabled: false }, chatActive: { enabled: false }, memory: { consolidateEnabled: false }, sticker: { enabled: false }, sessionRetryAttempts: 0, wakeDelayMs: 200,
    store: { contextSliderPos: 100, historyCount: 80, peakSchedule: { enabled: false }, promptAnchor: { enabled: false } }, ...patch });
  await app.loader.loadAll();
  assert.deepEqual(app.loader.listEntries().map(entry => entry.id).sort(), ['core-tools', 'transport-onebot', ...(sdk ? ['probe235'] : [])].sort(), 'only this generation owns scanned plugin roots');
  for (const entry of app.loader.listEntries()) assert.equal(entry.status, 'active', `${entry.id}: ${entry.loadError}`);
  await app.services.start(); assert.equal(app.httpServer.port, null);
  async function openCurrent() {
    const provider = app.services.get('transport.provider'); provider.client.ws.emit('open'); clock.fire(0);
    await until(() => provider.selfId === state.account); return provider;
  }
  await openCurrent();
  async function ingest(userId, text, { groupId = '23501', card = null, segments = null, signal, run = true } = {}) {
    const accepted = await app.ingest.ingestMessage({ kind: 'group', id: groupId, signal, event: { user_id: userId, message_id: ++mid, time: Math.floor(Date.now() / 1000), sender: { nickname: `QA_${userId}`, ...(card ? { card } : {}) }, ...(segments ? { message: segments } : { raw_message: text }) } });
    if (accepted.accepted && run) {
      await app.orchestrator.onIncoming(accepted.chatKey, accepted.entry);
      const current = app.sessions.current(accepted.chatKey);
      if (current) { clock.fire(200); await until(() => !['waiting', 'running'].includes(app.sessions.peek(current.id)?.status)); assert.equal(app.sessions.get(current.id).error, null); }
    }
    return accepted;
  }
  async function route(method, endpoint) { const handler = routes.get(`${method} ${endpoint}`); assert.ok(handler, `actual default route ${endpoint} exists`); return handler({ query: {}, body: {}, params: {} }); }
  const invoke = (id, args, context = {}) => app.components['core.tools.bundle']({ c: app.config.get() }, { registry: app.registry, loader: app.loader }).invoke(id, args, { chatKey: 'group:23501', session: { sent: [] }, ...context });
  return { app, appRoot, dataDir, state, save, calls, cache, clock, ingestOptions: () => ingestOptions, ingest, models, route, invoke, openCurrent };
}
const mention = (id, text = ' hello') => [{ type: 'at', data: { qq: String(id) } }, { type: 'text', data: { text } }];

test('actual default provider identity wakes plain text; explicit names and ID authority remain', async t => {
  const f = await fixture(t, { config: { store: { contextSliderPos: 10 } } });
  assert.equal(f.app.transport.selfNickname, 'QA_LIVE_NICK');
  assert.equal((await f.route('GET', '/api/status')).onebot.selfNickname, 'QA_LIVE_NICK');
  const live = await f.ingest('111', '@QA_LIVE_NICK hello'); assert.equal(live.entry.atMe, true); assert.equal(f.models.length, 1);
  f.save({ persona: { selfNickname: 'QA_EXPLICIT_NICK', botName: 'QA_BOT_NAME' } });
  await f.ingest('111', '@QA_LIVE_NICK old nickname'); assert.equal(f.models.length, 1, 'configured nickname wins over the live fallback');
  await f.ingest('111', '@QA_EXPLICIT_NICK hello'); await f.ingest('111', '@QA_BOT_NAME hello'); assert.equal(f.models.length, 3);
  await f.ingest('111', '', { segments: mention('23598', ' @QA_EXPLICIT_NICK') }); assert.equal(f.models.length, 3);
  await f.ingest('111', '', { segments: mention('23599') }); assert.equal(f.models.length, 4);
  f.save({ store: { contextSliderPos: 15, keywords: ['QA_KEYWORD'] } }); await f.ingest('111', 'QA_KEYWORD hello'); assert.equal(f.models.length, 5);
  f.state.account = '23597'; f.state.nickname = 'QA_NEW_LIVE_NICK';
  f.save({ persona: { selfNickname: '' }, store: { contextSliderPos: 10 }, onebot: { accessToken: 'QA_NEW_CONNECTION' } });
  assert.equal(f.app.transport.selfId, null); assert.equal(f.app.transport.selfNickname, '');
  const old = await f.ingest('111', '', { segments: mention('23599') }); assert.equal(old.entry.atMe, false); assert.equal(f.models.length, 5, 'old account ID is not reused while the new scope has no identity');
  await f.openCurrent(); await f.ingest('111', '@QA_NEW_LIVE_NICK hello'); assert.equal(f.models.length, 6);
});

test('actual group-scoped names, cold single-member query and bounded cache reach LLM inputs', async t => {
  const f = await fixture(t);
  await f.ingest('77', 'A archive', { card: 'QA_CARD_A' });
  await f.ingest('77', 'B archive', { groupId: '23502', card: 'QA_CARD_B' });
  const a = await f.ingest('88', '', { segments: mention('77') }); assert.equal(a.entry.text, '@QA_CARD_A hello'); assert.ok(f.models.at(-1).at(-1).content.includes('@QA_CARD_A hello'));
  const b = await f.ingest('88', '', { groupId: '23502', segments: mention('77') }); assert.equal(b.entry.text, '@QA_CARD_B hello');
  const cold = await f.ingest('88', '', { segments: mention('99') }); assert.equal(cold.entry.text, '@QA_COLD_23501_99 hello');
  const count = f.calls.filter(call => call.action === 'get_group_member_info' && call.params.user_id === 99).length;
  await f.ingest('88', '', { segments: mention('99') }); assert.equal(f.calls.filter(call => call.action === 'get_group_member_info' && call.params.user_id === 99).length, count);
  assert.equal(f.calls.some(call => call.action === 'get_group_member_list'), false, 'cold mentions never fetch a whole group');
  for (let n = 1000; n < 1510; n++) await f.ingest(String(n), `seed ${n}`, { card: `QA_MEMBER_${n}`, run: false });
  assert.equal(f.cache.size, 500); assert.ok(![...f.cache.keys()].some(key => JSON.parse(key)[2] === '99'));
  f.state.member = async () => { throw new Error('synthetic lookup unavailable'); };
  const unavailable = await f.ingest('88', '', { segments: mention('909') }); assert.equal(unavailable.entry.text, '@909 hello');
});

test('held cold names cannot commit after account change, cancellation or same-object provider ABA', async t => {
  for (const mode of ['account', 'cancel', 'provider-aba', 'stop']) await t.test(mode, async t => {
    const f = await fixture(t), held = deferred(); let entered = false;
    f.state.member = async () => { entered = true; return held.promise; };
    const controller = new AbortController(), pending = f.ingest('88', '', { segments: mention('909'), signal: controller.signal, run: false });
    await until(() => entered);
    if (mode === 'account') f.app.services.get('transport.provider').client.selfId = '23598';
    if (mode === 'cancel') controller.abort();
    if (mode === 'stop') await f.app.services.stop();
    if (mode === 'provider-aba') {
      const provider = f.app.services.get('transport.provider');
      f.app.capability.register('transport.provider', 'kernel', provider, { lifecycle: true }); await f.app.services.refresh();
      f.app.capability.register('transport.provider', 'kernel', provider, { lifecycle: true }); await f.app.services.refresh();
    }
    held.resolve({ user_id: 909, card: 'QA_FORBIDDEN_LATE_NAME' });
    const result = await pending; assert.equal(result.accepted, false); assert.equal(f.app.store.recent('group:23501', Infinity).length, 0); assert.equal(f.cache.size, 0);
  });
});

test('whole core.ingest appended replacement/wrapping and disabled restoration remain actual defaults', async t => {
  for (const mode of ['replace', 'wrap']) for (const enabled of [true, false]) await t.test(`${mode}/${enabled}`, async t => {
    const f = await fixture(t, { layer: { mode, enabled } });
    const result = await f.ingest('88', '', { segments: mention('99') });
    const expected = enabled ? mode === 'wrap' ? 'QA_WRAPPED_NAME' : 'QA_REPLACED_NAME' : 'QA_COLD_23501_99';
    assert.equal(result.entry.text, `@${expected} hello`); assert.ok(f.models.at(-1).at(-1).content.includes(`@${expected} hello`));
    assert.equal(f.calls.filter(call => call.params.user_id === 99).length, enabled ? 0 : 1);
  });
});

test('selected transport names replace the default and disabling restores a fresh default scope', async t => {
  const f = await fixture(t), calls = [];
  const provider = { id: 'replacement235', selfId: '23599', selfNickname: 'QA_REPLACEMENT_NICK', start() {}, stop() {}, actions: {
    async getGroupMemberInfo(groupId, userId) { calls.push({ groupId, userId }); return { card: 'QA_SELECTED_PROVIDER_CARD' }; }, async getSelfMemberInfo() { return { muted: false }; },
  } };
  f.app.capability.register('transport.provider', 'kernel', provider, { lifecycle: true }); await f.app.services.refresh();
  const selected = await f.ingest('88', '', { segments: mention('99') }); assert.equal(selected.entry.text, '@QA_SELECTED_PROVIDER_CARD hello'); assert.equal(calls.length, 1);
  assert.ok(f.models.at(-1).at(-1).content.includes('@QA_SELECTED_PROVIDER_CARD hello'));
  f.app.capability.unregisterOwner('kernel'); await f.app.services.refresh(); await f.openCurrent();
  const restored = await f.ingest('88', '', { segments: mention('99') }); assert.equal(restored.entry.text, '@QA_COLD_23501_99 hello'); assert.equal(calls.length, 1);
});

test('provider-only permission denial and restoration invalidate a held name receipt', async t => {
  for (const mode of ['deny-allow', 'revoke', 'disable']) await t.test(mode, async t => {
    const f = await fixture(t, { sdk: true }), gate = deferred(); let entered = false;
    const owner = f.app.loader.hostEntry('probe235');
    assert.equal(f.app.permissions.setOverride('probe235', 'net.outbound', 'allow', { fingerprint: owner.fingerprint }), true);
    globalThis.__qaSdk235.registerTransport({ id: 'provider-lease235', selfId: '23599', start() {}, stop() {}, actions: {
      async getGroupMemberInfo() { entered = true; return gate.promise; }, async getSelfMemberInfo() { return { muted: false }; },
    } });
    await f.app.services.refresh();
    const pending = f.ingest('88', '', { segments: mention('909'), run: false }); await until(() => entered);
    if (mode === 'deny-allow') {
      assert.equal(f.app.permissions.setOverride('probe235', 'net.outbound', 'deny', { fingerprint: owner.fingerprint }), true);
      assert.equal(f.app.permissions.setOverride('probe235', 'net.outbound', 'allow', { fingerprint: owner.fingerprint }), true);
    } else if (mode === 'revoke') f.app.permissions.revokePlugin('probe235');
    else await f.app.loader.setEnabled('probe235', false);
    gate.resolve({ userId: '909', card: 'QA_INVALID_RECEIPT_NAME' }); const result = await pending;
    assert.ok(!result.accepted || result.entry.text === '@909 hello'); assert.ok(![...f.cache.values()].includes('QA_INVALID_RECEIPT_NAME'));
  });
});

test('SDK member method uses the narrow permissions, fixed third signal argument and cancellation', async t => {
  const f = await fixture(t, { sdk: true }), entry = f.app.loader.hostEntry('probe235');
  for (const scope of ['data.sessions.read', 'net.outbound']) f.app.permissions.setOverride('probe235', scope, 'allow', { fingerprint: entry.fingerprint });
  const member = await globalThis.__qaSdk235.lookup('23501', '99', { marker: 'kept' }); assert.equal(member.card, 'QA_COLD_23501_99');
  const call = f.calls.at(-1); assert.equal(call.params.user_id, 99); assert.ok(call.signal instanceof AbortSignal);
  f.app.permissions.setOverride('probe235', 'net.outbound', 'deny', { fingerprint: entry.fingerprint });
  const count = f.calls.length; await assert.rejects(globalThis.__qaSdk235.lookup('23501', '98'), /权限|拒绝/); assert.equal(f.calls.length, count);
  f.app.permissions.setOverride('probe235', 'net.outbound', 'allow', { fingerprint: entry.fingerprint });
  const gate = deferred(); let entered = false; f.state.member = async () => { entered = true; return gate.promise; };
  const controller = new AbortController(), pending = globalThis.__qaSdk235.lookup('23501', '97', { signal: controller.signal });
  await until(() => entered); controller.abort(new Error('owned cancelled')); await assert.rejects(pending, /cancel|取消|中止/i);
  gate.resolve({ user_id: 97, card: 'QA_LATE_SDK' }); await tick();
});

test('registered send failure reaches actual runner with bounded redacted cause and no fake success', async t => {
  const f = await fixture(t, { model: (_args, round) => round === 1 ? { message: { role: 'assistant', content: '', tool_calls: [{ id: 'send235', type: 'function', function: { name: 'send_message', arguments: '{"messages":"QA_DIAGNOSTIC"}' } }] }, finishReason: 'tool_calls' } : finish() });
  const cause = Object.assign(new Error('synthetic refused QA_SECRET_235 token=UNKNOWN_SECRET_235 http://user:password@fixture.invalid/'), { code: 'ECONNREFUSED' }); cause.cause = cause;
  f.state.sendError = new TypeError('fetch failed', { cause });
  await f.ingest('111', 'QA_DIAGNOSTIC_TRIGGER');
  const tool = f.models[1].find(message => message.role === 'tool'); assert.ok(tool);
  assert.match(tool.content, /send_group_msg.*ECONNREFUSED/); assert.doesNotMatch(tool.content, /QA_SECRET_235|UNKNOWN_SECRET_235|user:password/);
  const session = f.app.sessions.listSummaries()[0]; assert.deepEqual(session.sent, []); assert.equal(f.calls.filter(call => call.action === 'send_group_msg').length, 1);
  assert.equal(f.app.store.recent('group:23501', Infinity).filter(message => message.self).length, 0);
});

test('successful WS candidate is pinned only in its current scope; close and config cancel held HTTP', async t => {
  const clock = timers(); t.after(() => clock.restore());
  const client = new OneBotClient({ wsUrl: 'ws://fixture235.invalid', httpUrl: 'http://fixture235.invalid', accessToken: 'QA_BAD', tokenCandidates: () => ['QA_BAD', 'QA_GOOD'], log: {} });
  t.after(() => client.close()); await client.connect(); client.ws.emit('error', new Error('401')); clock.fire(5000);
  assert.equal(new URL(client.ws.url).searchParams.get('access_token'), 'QA_GOOD'); client.ws.emit('open');
  client.ws.emit('close', 1006, 'ordinary'); clock.fire(3000); assert.equal(new URL(client.ws.url).searchParams.get('access_token'), 'QA_GOOD');
  client.configure({ wsUrl: 'ws://fixture235.invalid/new', httpUrl: 'http://fixture235.invalid/new', accessToken: 'QA_NEW', candidateScope: 'new' });
  assert.equal(new URL(client.ws.url).searchParams.get('access_token'), 'QA_NEW'); client.ws.emit('error', new Error('401')); clock.fire(5000); assert.equal(new URL(client.ws.url).searchParams.get('access_token'), 'QA_NEW');
  const held = deferred(); let captured; fetchHandler = async (_url, options) => { captured = options.signal; return held.promise; };
  const pending = client.call('get_login_info'); await until(() => captured); await client.close(); assert.equal(captured.aborted, true); held.resolve(response({ user_id: 9 })); await assert.rejects(pending, /更改|关闭/);
});

test('HTTP diagnostic changes retain timeouts, manual redirects, 401 fallback and honest abort', async t => {
  const clock = timers(); t.after(() => clock.restore());
  const client = new OneBotClient({ wsUrl: 'ws://fixture235.invalid', httpUrl: 'http://fixture235.invalid', accessToken: 'QA_BAD', tokenCandidates: () => ['QA_BAD', 'QA_GOOD'], log: {} }); t.after(() => client.close());
  const attempts = [];
  fetchHandler = async (url, options) => { attempts.push({ token: url.searchParams.get('access_token'), redirect: options.redirect }); return url.searchParams.get('access_token') === 'QA_BAD' ? { status: 401 } : response({ user_id: 99 }); };
  await client.call('get_login_info'); assert.deepEqual(attempts, [{ token: 'QA_BAD', redirect: 'manual' }, { token: 'QA_GOOD', redirect: 'manual' }]);
  const rejected = status => async () => ({ status, ok: false, text: async () => 'synthetic response' });
  fetchHandler = rejected(426); await assert.rejects(client.call('get_login_info'), /HTTP 426.*WebSocket/);
  fetchHandler = rejected(302); const before = attempts.length; await assert.rejects(client.call('get_login_info'), /HTTP 302/); assert.equal(attempts.length, before);
  fetchHandler = async (_url, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  const fast = client.call('send_poke'); clock.fire(15000); await assert.rejects(fast, /send_poke 超时（15s）/);
  const slow = client.call('send_group_msg'); clock.fire(90000); await assert.rejects(slow, /send_group_msg 超时（90s）/);
  const control = new AbortController(), pending = client.call('get_login_info', {}, { signal: control.signal }); control.abort(); await assert.rejects(pending, /已取消/);
  await assert.rejects(client.call('get_login_info', {}, { signal: control.signal }), /已取消/);
});

test('effective selected community ids govern actual ingress/history/anchor, including cloud-only and fallback', async t => {
  for (const anchor of [false, true]) await t.test(`anchor=${anchor}`, async t => {
    const f = await fixture(t, { config: { globalBlocklist: ['333'], communityExemptions: ['333'], store: { promptAnchor: { enabled: anchor } } } });
    const state = { ids: ['444'] }, provider = { getBlocklist: async () => ({ ok: true, ids: state.ids }), start() {}, stop() {} };
    f.app.capability.register('community.client', 'kernel', provider, { lifecycle: true }); await f.app.services.refresh();
    assert.equal((await f.ingest('444', 'QA_CLOUD_ONLY_BLOCKED', { run: false })).reason, 'global-blocklist');
    await f.ingest('333', 'QA_EXEMPT_HISTORY_333'); await f.ingest('222', 'QA_ALLOWED_HISTORY_222'); await f.ingest('222', 'QA_ANCHOR_SEED_222'); await f.ingest('222', 'QA_NEXT_TRIGGER_222');
    assert.ok(f.models.at(-1).at(-1).content.includes('QA_EXEMPT_HISTORY_333')); assert.ok(f.models.at(-1).at(-1).content.includes('QA_ALLOWED_HISTORY_222'));
    state.ids = ['333', '444']; assert.equal((await f.ingest('333', 'QA_SELECTED_PROVIDER_BLOCKS', { run: false })).reason, 'global-blocklist');
    await f.ingest('222', 'QA_AFTER_SELECTED_BLOCK'); assert.ok(!f.models.at(-1).at(-1).content.includes('QA_EXEMPT_HISTORY_333'));
    state.ids = []; f.save({ communityExemptions: [] }); await f.ingest('333', 'QA_SELECTED_PROVIDER_ALLOWS'); await f.ingest('222', 'QA_AFTER_SELECTED_ALLOW');
    assert.ok(f.models.at(-1).at(-1).content.includes('QA_SELECTED_PROVIDER_ALLOWS'), 'selected effective list is authoritative even when raw config still blocks');
    f.app.capability.unregisterOwner('kernel'); await f.app.services.refresh();
    assert.equal((await f.ingest('333', 'QA_FALLBACK_BLOCK', { run: false })).reason, 'global-blocklist');
    f.save({ communityExemptions: ['333'] });
    await f.ingest('333', 'QA_FALLBACK_EXEMPT'); assert.ok(f.models.at(-1).at(-1).content.includes('QA_FALLBACK_EXEMPT'));
    f.save({ communityExemptions: [] }); assert.equal((await f.ingest('333', 'QA_FALLBACK_BLOCK', { run: false })).reason, 'global-blocklist');
  });
});

test('community async result from a replaced same-object registration cannot become effective ids', async t => {
  const f = await fixture(t), gate = deferred(); let calls = 0;
  const provider = { start() {}, stop() {}, getBlocklist() { return ++calls === 1 ? gate.promise : Promise.resolve({ ok: true, ids: ['555'] }); } };
  f.app.capability.register('community.client', 'kernel', provider, { lifecycle: true }); await f.app.services.refresh();
  const pending = f.ingest('555', 'QA_CLOUD_HELD', { run: false }); await until(() => calls === 1);
  f.app.capability.register('community.client', 'kernel', provider, { lifecycle: true }); await f.app.services.refresh(); gate.resolve({ ok: true, ids: [] });
  assert.equal((await pending).reason, 'global-blocklist'); assert.equal(calls, 2); assert.equal(f.app.store.recent('group:23501', Infinity).length, 0);
  provider.getBlocklist = async () => { throw new Error('synthetic unavailable'); }; f.save({ globalBlocklist: ['333'], communityExemptions: [] });
  assert.equal((await f.ingest('333', 'QA_EXCEPTION_FALLBACK', { run: false })).reason, 'global-blocklist');
});

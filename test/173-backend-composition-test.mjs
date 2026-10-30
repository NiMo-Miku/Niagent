// Private temporary HTTP servers only: no existing console, agents, transports,
// external HTTP, plugins or user data are used by these composition contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHttpServer, MAX_BODY_BYTES } from '../src/kernel/http.js';
import { buildDefaultConfig } from '../src/kernel/config.js';
import { registerConsoleRoutes, registerComposedConsoleRoutes, usageCost } from '../src/console/routes.js';

function fixture(t, { apiGuard } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa173-routes-'));
  const dataDir = path.join(root, 'data'), staticDir = path.join(root, 'ui');
  fs.mkdirSync(dataDir); fs.mkdirSync(staticDir);
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html>temporary 173');
  const state = buildDefaultConfig({ personaText: '' });
  state.server = { port: 0, token: 'synthetic-173-token' };
  const config = { get: () => state };
  const log = { info() {}, warn() {}, error() {} };
  const http = createHttpServer({ config, log, staticDir, apiGuard });
  const deps = { config, dataDir, appRoot: root, log, capability: { names: () => [] }, sessions: {}, store: {}, loader: {} };
  t.after(async () => {
    await http.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const request = (suffix, { authorized = true, headers = {}, ...options } = {}) => fetch(`http://127.0.0.1:${http.port}${suffix}`, {
    ...options, headers: { ...(authorized ? { 'x-console-token': state.server.token } : {}), ...headers },
  });
  return { http, deps, request };
}

test('composed modules add endpoints, explicitly replace defaults and recover previous handlers', async t => {
  const { http, deps, request } = fixture(t);
  let removeFirst, removeSecond, capturedScope;
  const events = [];
  deps.composition = { routes: [
    { id: 'first', config: { value: 173 }, async register(scope, context, config) {
      capturedScope = scope;
      assert.notEqual(context, deps);
      assert.equal(context.config, deps.config);
      assert.equal(context.loader, deps.loader);
      assert.equal(typeof context.lifecycle.onStop, 'function');
      assert.equal(typeof scope.listen, 'undefined');
      scope.onDispose(() => events.push('first resource'));
      await Promise.resolve();
      scope.route('GET', '/api/composition/new', ({ query }) => ({ value: config.value, query }));
      removeFirst = scope.route('GET', '/api/version', () => ({ version: 'first' }), { replace: true });
      return () => events.push('first module');
    } },
    { id: 'second', register(scope) {
      removeSecond = scope.route('GET', '/api/version', () => ({ version: 'second' }), { replace: true });
      return { dispose() { events.push('second module'); } };
    } },
  ] };
  const dispose = await registerComposedConsoleRoutes(http, deps);
  await http.listen();
  assert.deepEqual(await (await request('/api/composition/new?choice=appended')).json(), { value: 173, query: { choice: 'appended' } });
  assert.deepEqual(await (await request('/api/version')).json(), { version: 'second' });
  assert.equal((await request('/api/composition/new', { authorized: false })).status, 401);
  assert.equal((await request('/api/version', { authorized: false })).status, 401);
  assert.equal((await request('/api/version', { headers: { origin: 'https://outside.invalid' } })).status, 403);
  removeSecond(); removeSecond();
  assert.deepEqual(await (await request('/api/version')).json(), { version: 'first' });
  removeFirst();
  assert.equal((await (await request('/api/version')).json()).version, '0.5.0');
  const disposing = dispose();
  assert.throws(() => capturedScope.route('GET', '/api/too-late', () => ({})), /disposed/);
  await disposing; await dispose();
  assert.deepEqual(events, ['second module', 'first module', 'first resource']);
  assert.equal((await request('/api/composition/new')).status, 404);
  assert.equal((await request('/api/version')).status, 404);
});

test('scopes prevent accidental duplicate shadows, and replacement disposal affects only its owner', async t => {
  const { http, request } = fixture(t);
  http.route('GET', '/api/identity', () => ({ owner: 'host' }));
  const lower = http.createRouteScope({ id: 'lower' }), higher = http.createRouteScope({ id: 'higher' });
  assert.throws(() => lower.route('GET', '/api/identity', () => ({})), /replace: true/);
  assert.throws(() => lower.route('GET', '/api/identity/', () => ({})), /replace: true/);
  assert.throws(() => lower.route('*', '/api/identity', () => ({})), /replace: true/);
  assert.throws(() => lower.route('GET', '/api/mistyped', () => ({}), { replace: true }), /no existing route/);
  assert.throws(() => lower.route('GET', '/outside-api', () => ({})), /non-reserved \/api\//);
  assert.throws(() => lower.route('GET', '/api/events', () => ({})), /non-reserved \/api\//);
  lower.route('GET', '/api/identity', () => ({ owner: 'lower' }), { replace: true });
  higher.route('GET', '/api/identity', () => ({ owner: 'higher' }), { replace: true });
  http.route('GET', '/api/unrelated', () => ({ owner: 'unrelated' }));
  await http.listen();
  assert.deepEqual(await (await request('/api/identity')).json(), { owner: 'higher' });
  lower.dispose();
  assert.deepEqual(await (await request('/api/identity')).json(), { owner: 'higher' });
  higher.dispose(); higher.dispose();
  assert.deepEqual(await (await request('/api/identity')).json(), { owner: 'host' });
  assert.deepEqual(await (await request('/api/unrelated')).json(), { owner: 'unrelated' });
});

test('dynamic routes require intentional overlap and preserve named parameters without RegExp state', async t => {
  const { http, request } = fixture(t);
  http.route('GET', /^\/api\/items\/(?<id>\d+)$/, ({ params }) => ({ owner: 'host', id: params.id }));
  const scope = http.createRouteScope({ id: 'dynamic' });
  assert.throws(() => scope.route('GET', '/api/items/1', () => ({})), /replace: true/);
  assert.throws(() => scope.route('GET', /^\/api\/other\/(?<id>\d+)$/, () => ({})), /replace: true/);
  scope.route('GET', /^\/api\/items\/(?<id>\d+)$/g, ({ params }) => ({ owner: 'dynamic', id: params.id }), { replace: true });
  await http.listen();
  for (let attempt = 0; attempt < 2; attempt++) assert.deepEqual(await (await request('/api/items/173')).json(), { owner: 'dynamic', id: '173' });
  scope.dispose();
  assert.deepEqual(await (await request('/api/items/173')).json(), { owner: 'host', id: '173' });
});

test('partial module failure rolls back all owned routes and resources while recovering host defaults', async t => {
  const { http, deps, request } = fixture(t);
  const cleanup = [];
  http.route('GET', '/api/host', () => ({ owner: 'host' }));
  await assert.rejects(registerComposedConsoleRoutes(http, deps, { registerDefault: null, routes: [
    { id: 'ready', register(scope) {
      scope.route('GET', '/api/host', () => ({ owner: 'override' }), { replace: true });
      scope.route('GET', '/api/ready', () => ({}));
      return () => cleanup.push('ready');
    } },
    { id: 'broken', async register(scope) {
      scope.onDispose(() => cleanup.push('broken resource'));
      scope.route('GET', '/api/partial', () => ({}));
      await Promise.resolve();
      throw new Error('synthetic setup failure');
    } },
  ] }), /synthetic setup failure/);
  assert.deepEqual(cleanup, ['broken resource', 'ready']);
  await http.listen();
  assert.deepEqual(await (await request('/api/host')).json(), { owner: 'host' });
  assert.equal((await request('/api/ready')).status, 404);
  assert.equal((await request('/api/partial')).status, 404);
});

test('replaced controllers retain host JSON limits, authentication and both reset guard checks', async t => {
  let guardMode = 'allow', guardCalls = 0, handled = 0;
  const { http, deps, request } = fixture(t, { apiGuard() {
    guardCalls++;
    return guardMode === 'block' || (guardMode === 'after-body' && guardCalls > 1) ? { status: 409, body: { error: 'synthetic reset guard' } } : null;
  } });
  http.route('POST', '/api/controller', () => ({ owner: 'host' }));
  const dispose = await registerComposedConsoleRoutes(http, deps, { registerDefault: null, routes: [
    { id: 'controller', register(scope) {
      scope.route('POST', '/api/controller', ({ body }) => { handled++; return { owner: 'override', body }; }, { replace: true });
    } },
  ] });
  await http.listen();
  const post = (body, options = {}) => request('/api/controller', { method: 'POST', body, ...options });
  assert.equal((await post('{}', { authorized: false })).status, 401);
  assert.equal((await post('not-json')).status, 400);
  assert.equal((await post(JSON.stringify({ text: 'x'.repeat(MAX_BODY_BYTES) }))).status, 413);
  assert.equal(handled, 0);
  guardMode = 'block'; guardCalls = 0;
  assert.equal((await post('{}')).status, 409);
  assert.equal(guardCalls, 1);
  guardMode = 'after-body'; guardCalls = 0;
  assert.equal((await post('{}')).status, 409);
  assert.equal(guardCalls, 2);
  assert.equal(handled, 0);
  guardMode = 'allow';
  assert.deepEqual(await (await post('{"accepted":173}')).json(), { owner: 'override', body: { accepted: 173 } });
  await dispose();
  assert.deepEqual(await (await post('{}')).json(), { owner: 'host' });
});

test('legacy host callers retain first-match registration and can optionally dispose individual routes', async t => {
  const { http, request } = fixture(t);
  const remove = http.route('GET', '/api/legacy', () => ({ owner: 'first' }));
  http.route('GET', '/api/legacy', () => ({ owner: 'second' }));
  await http.listen();
  assert.deepEqual(await (await request('/api/legacy')).json(), { owner: 'first' });
  remove(); remove();
  assert.deepEqual(await (await request('/api/legacy')).json(), { owner: 'second' });
});

test('cancellation during an awaited registrar cleans its returned resources and skips later modules', async t => {
  const { http, deps, request } = fixture(t);
  const controller = new AbortController(), calls = [];
  deps.lifecycle = { signal: controller.signal };
  let finish;
  const ready = new Promise(resolve => { finish = resolve; });
  const registration = registerComposedConsoleRoutes(http, deps, {
    async registerDefault(scope) {
      scope.route('GET', '/api/pending-default', () => ({}));
      scope.onDispose(() => calls.push('default resource'));
      await ready;
      return () => calls.push('default returned cleanup');
    },
    routes: [{ id: 'never-mounted', register() { calls.push('unexpected later registrar'); } }],
  });
  controller.abort(new Error('synthetic constructor cancellation'));
  finish();
  await assert.rejects(registration, /synthetic constructor cancellation/);
  assert.deepEqual(calls, ['default returned cleanup', 'default resource']);
  await http.listen();
  assert.equal((await request('/api/pending-default')).status, 404);
});

test('quiescence recovers default diagnostics and overlaps final disposal without repeating resource cleanup', async t => {
  const { http, deps, request } = fixture(t);
  const calls = [];
  let release;
  const cleanupGate = new Promise(resolve => { release = resolve; });
  const dispose = await registerComposedConsoleRoutes(http, deps, {
    registerDefault(scope, context) {
      registerConsoleRoutes(scope, context);
      scope.onDispose(() => calls.push('default resource'));
      return () => calls.push('default returned cleanup');
    },
    routes: [{ id: 'resettable', register(scope) {
      scope.route('GET', '/api/version', () => ({ version: 'overridden' }), { replace: true });
      scope.route('GET', '/api/resettable', () => ({ added: true }));
      scope.onDispose(() => calls.push('contribution resource'));
      return async () => { calls.push('contribution returned cleanup'); await cleanupGate; };
    } }],
  });
  await http.listen();
  assert.deepEqual(await (await request('/api/version')).json(), { version: 'overridden' });
  const quiescing = dispose.quiesce();
  assert.equal(dispose.quiesce(), quiescing);
  assert.equal((await request('/api/resettable')).status, 404);
  assert.equal((await (await request('/api/version')).json()).version, '0.5.0');
  assert.equal((await request('/api/config')).status, 200);
  assert.deepEqual(calls, ['contribution returned cleanup']);
  const disposing = dispose();
  assert.equal(dispose(), disposing);
  release();
  await Promise.all([quiescing, disposing]);
  await dispose.quiesce(); await dispose();
  assert.deepEqual(calls, ['contribution returned cleanup', 'contribution resource', 'default returned cleanup', 'default resource']);
  assert.equal((await request('/api/version')).status, 404);
  assert.equal((await request('/api/config')).status, 404);
});

test('prompt preview awaits selected async policy and sections while retaining draft configuration and tool availability', async t => {
  const { http, deps, request } = fixture(t);
  const originalName = deps.config.get().persona.botName, sections = [{ title: 'Selected section', content: 'async fixture section' }];
  deps.loader.promptSections = async () => { await Promise.resolve(); return sections; };
  deps.registry = {
    list: () => [{ id: 'visible', name: 'Visible tool', category: 'fixture' }, { id: 'hidden', name: 'Hidden tool', category: 'disabled' }],
    availability: (id, context) => ({ ok: context.categoryEnabled(id === 'visible' ? 'fixture' : 'disabled') }),
  };
  deps.components = { 'core.prompt.system': async ({ cfg, skillSections }) => {
    await Promise.resolve();
    assert.equal(skillSections, sections);
    return `selected-system:${cfg.persona.botName}:${skillSections[0].content}`;
  } };
  const dispose = await registerComposedConsoleRoutes(http, deps);
  await http.listen();
  const response = await request('/api/prompt-preview', { method: 'POST', body: JSON.stringify({
    persona: { botName: 'Draft 173' }, tools: { categories: { fixture: true, disabled: false } },
  }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    systemPrompt: 'selected-system:Draft 173:async fixture section',
    tools: [{ id: 'visible', name: 'Visible tool', description: '', category: 'fixture' }],
  });
  assert.equal(deps.config.get().persona.botName, originalName);
  await dispose();
});

test('price APIs, status and historical usage consume the shared selected price adapter and cost policy', async t => {
  const { http, deps, request } = fixture(t);
  const calls = [], costCalls = [], startedAt = Date.now(), model = 'selected-price-model';
  const usage = { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000, cachedTokens: 0, calls: 1 };
  deps.config.get().api.model = model;
  deps.sessions = {
    todayUsage: () => usage,
    listSummaries: () => [{ id: 'price173', chatKey: 'private:173', model, startedAt, usage }],
  };
  deps.fetchImpl = async () => assert.fail('selected pricing must not use outside HTTP');
  const selected = {
    resolve(requested) { assert.equal(this, selected); calls.push(['resolve', requested]); return { in: 2, out: 3, cached: 1, source: 'selected-price', matched: requested }; },
    snapshot(requested) { assert.equal(this, selected); calls.push(['snapshot', requested]); return { selected: 'snapshot', model: requested }; },
    refresh(requested) { assert.equal(this, selected); calls.push(['refresh', requested]); return { selected: 'refresh', model: requested }; },
    updateCheck() { assert.equal(this, selected); calls.push(['update']); return { selected: 'update', ok: true }; },
  };
  deps.priceUpdates = selected;
  deps.components = { 'console.usageCost': (...args) => {
    costCalls.push({ ...args[0] });
    const original = usageCost(...args);
    return { ...original, source: 'selected-cost', cost: original.cost * 7,
      breakdown: Object.fromEntries(Object.entries(original.breakdown).map(([key, cost]) => [key, cost * 7])) };
  } };
  const dispose = await registerComposedConsoleRoutes(http, deps);
  await http.listen();
  assert.deepEqual(await (await request(`/api/model-prices?model=${model}`)).json(), { selected: 'snapshot', model });
  assert.deepEqual(await (await request(`/api/model-prices/refresh?model=${model}`, { method: 'POST', body: '{}' })).json(), { selected: 'refresh', model });
  assert.deepEqual(await (await request('/api/update-check')).json(), { selected: 'update', ok: true });
  const status = await (await request('/api/status')).json();
  assert.equal(status.cost.cost, 35);
  assert.equal(status.cost.source, 'selected-cost');
  assert.equal(status.cost.prices.in, 2);
  const stats = await (await request('/api/usage/stats?range=today')).json();
  assert.equal(stats.totals.cost, 35);
  assert.equal(stats.totals.source, 'selected-cost');
  const detail = await (await request('/api/usage/breakdown?range=today&by=session')).json();
  assert.equal(detail.rows[0].cost, 35);

  const date = new Date(startedAt), day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const archivedUsage = { ...usage, completionTokens: 0, totalTokens: 1_000_000 };
  const costInfo = { cost: 14, source: 'selected-cost', breakdown: { fresh: 14, cached: 0, output: 0 }, prices: { in: 2, out: 3, cached: 1 }, matched: model, peak: false, hasPeakTiers: false, peakTokens: 0, offPeakTokens: 1_000_000 };
  const archiveFile = path.join(deps.dataDir, 'usage-days', `${day}.json`);
  fs.mkdirSync(path.dirname(archiveFile));
  fs.writeFileSync(archiveFile, JSON.stringify({ version: 1, day, aggregates: {}, records: {
    price173: { id: 'price173', chatKey: 'private:173', model, startedAt, usage: archivedUsage, cost: 14, costInfo },
  } }));
  const recorded = fs.readFileSync(archiveFile, 'utf8');
  assert.equal((await (await request('/api/usage/stats?range=today')).json()).totals.cost, 35);
  assert.ok(costCalls.some(row => row.promptTokens === 0 && row.completionTokens === 1_000_000), 'archived increments also use the selected policy');
  assert.equal(fs.readFileSync(archiveFile, 'utf8'), recorded);
  assert.ok(calls.some(([method]) => method === 'resolve'));
  await dispose();
});

test('partial injected price adapters retain local per-method fallbacks and the default selected cost function avoids recursion', async t => {
  const { http, deps, request } = fixture(t);
  const calls = [];
  deps.sessions.todayUsage = () => ({ promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000 });
  deps.priceUpdates = {
    resolve: () => ({ in: 4, out: 0, cached: 0, source: 'partial', matched: 'partial' }),
    refresh: () => ({ selected: 'partial refresh' }),
  };
  deps.components = { 'console.usageCost': usageCost };
  deps.fetchImpl = async url => {
    calls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ version: '9.9.9' }) };
  };
  const dispose = await registerComposedConsoleRoutes(http, deps);
  await http.listen();
  assert.equal((await (await request('/api/status')).json()).cost.cost, 4);
  assert.equal((await request('/api/model-prices')).status, 200);
  assert.deepEqual(await (await request('/api/model-prices/refresh', { method: 'POST', body: '{}' })).json(), { selected: 'partial refresh' });
  assert.equal((await (await request('/api/update-check')).json()).latest, '9.9.9');
  assert.equal(calls.length, 1, 'only the missing updateCheck uses the synthetic fallback fetch');
  await dispose();
});

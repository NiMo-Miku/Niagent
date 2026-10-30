// Real loader/permissions/kernel and synthetic HTTP; no external service or child process.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createKernel } from '../src/kernel/kernel.js';
import mcpPlugin from '../bundled/mcp-bridge/index.js';
import { createCommunityService } from '../bundled/community/index.js';
import { createMarketService } from '../bundled/market/index.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-sdk-consumer129-'));
const captureKey = `qa129_${crypto.randomUUID().replaceAll('-', '')}`;
globalThis[captureKey] = {};
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
const scopes = ['net.outbound', 'data.sessions.read', 'data.memory.read', 'fs.outsideNamespace', 'proc.exec', 'mcp.connect'];
for (const [id, permissions] of [['observer', ['net.outbound']], ['no-scopes', []], ['business', scopes]]) {
  const dir = path.join(root, 'plugins', id); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id, kind: 'plugin', apiVersion: 1, enabledByDefault: true, permissions, entry: 'index.js' }));
  fs.writeFileSync(path.join(dir, 'index.js'), `export default { setup(ctx) { globalThis[${JSON.stringify(captureKey)}][ctx.id] = ctx; } };`);
}
const secret = 'SYNTHETIC_HOST_SECRET_129';
let requests = 0, holdResponse, responseEntered, activeResponse;
const held = [], fetches = [];
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/held/')) {
    const row = { url: req.url, res, disconnected: false }; held.push(row);
    res.on('close', () => { row.disconnected = !res.writableEnded; }); req.resume(); return;
  }
  assert.equal(req.url, '/v1/chat/completions'); assert.equal(req.headers.authorization, `Bearer ${secret}`);
  requests++; req.resume(); req.on('end', async () => {
    activeResponse = res; responseEntered?.(); if (holdResponse) await holdResponse;
    if (!res.destroyed) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'synthetic' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })); }
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
const kernel = createKernel({ appRoot: root, env: { QQ_AGENT_DATA_DIR: path.join(root, 'data') },
  priceUpdates: { refresh: async () => ({ ok: true }) }, fetchImpl: async (url, options) => {
    assert.equal(new URL(url).origin, new URL(baseUrl).origin, 'Only this synthetic local HTTP server is permitted');
    fetches.push({ url: new URL(url).pathname, signal: options.signal }); return fetch(url, options);
  } });
kernel.log.setLevel('error');
kernel.config.update({ api: { baseUrl, apiKey: secret, model: 'fixture' }, server: { token: 'synthetic-console129' }, telemetry: { enabled: false } });
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log(`✓ ${name}`); };
async function until(check, label) {
  for (let i = 0; i < 300; i++) { if (check()) return check(); await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error(`Timed out: ${label}`);
}
const answer = row => { row.res.writeHead(200, { 'content-type': 'application/json' }); row.res.end('{"ok":true,"ids":[]}'); };
const grant = id => {
  const entry = kernel.loader.hostEntry(id);
  for (const scope of entry.manifest.permissions) assert.equal(kernel.permissions.setOverride(id, scope, 'allow', { fingerprint: entry.fingerprint }), true);
};
let releaseResponse;
try {
  await kernel.loader.loadAll();
  const { observer, business, 'no-scopes': denied } = globalThis[captureKey];
  assert.ok(observer && business && denied); grant('observer'); grant('business');
  for (const ctx of [observer, business, denied]) {
    assert.equal(ctx.consumerSignal, undefined); assert.equal(ctx.withoutConsumerContext, undefined);
  }
  await test('Real LLM callback exposes only request metadata, while the actual HTTP still receives its credential', async () => {
    const notices = [];
    const result = await observer.capability('llm.client').complete({ messages: [{ role: 'user', content: 'Synthetic only' }], onRequest: event => notices.push(event) });
    assert.equal(requests, 1); assert.equal(notices.length, 1); assert.equal(notices[0].model, 'fixture'); assert.equal(notices[0].api.baseUrl, baseUrl);
    assert.equal(notices[0].api.apiKey, undefined); assert.doesNotMatch(JSON.stringify(notices), /SYNTHETIC_HOST_SECRET|synthetic-console|authorization|headers|kernel|env/);
    assert.equal(result._usedApi?.apiKey, undefined); assert.equal(result.message.content, 'synthetic');
    // The kernel-owned endpoint itself must not bypass the SDK callback boundary.
    let directNotice;
    await kernel.capability.providers('llm.client')[0].provider.complete({ messages: [{ role: 'user', content: 'Synthetic host call' }], onRequest: event => { directNotice = event; } });
    assert.equal(directNotice.api.apiKey, undefined); assert.equal(directNotice.api.model, 'fixture');
  });

  const registrations = new Map(), adapterCalls = [], approvals = [];
  const controlledAdapter = {
    startServer(_spec, handlers = {}) {
      const row = { stopped: false, handlers }; adapterCalls.push(row);
      return { async request(method) { return method === 'tools/list' ? { tools: [{ name: 'echo', inputSchema: { type: 'object', properties: {} } }] } : {}; }, notify() {}, stop() { row.stopped = true; } };
    }, stopAll() {}, redactError: () => 'controlled',
  };
  const fixtureCtx = { log: { warn() {} }, config: { get: key => key === 'servers' ? [{ id: 'controlled', command: 'not-executed' }] : undefined },
    capability: name => name === 'process.mcp' ? controlledAdapter : registrations.get(name),
    registerCapability: (name, provider, metadata) => { registrations.set(name, provider); kernel.capability.register(name, 'kernel', provider, metadata); },
    registerTool: def => { kernel.registry.register(def); return def.id; }, unregisterTool: id => kernel.registry.unregister(id, 'mcp-bridge'), lifecycle: { onStop() {} },
    permissions: { request: async scope => { approvals.push({ owner: 'mcp-bridge', scope }); return kernel.permissions.checkAsync('mcp-bridge', scope, { kind: 'bundled' }); } },
  };
  await mcpPlugin.setup(fixtureCtx);
  // Use the controlled process boundary for all public MCP calls too.
  kernel.capability.register('process.mcp', 'kernel', controlledAdapter);
  await kernel.services.start();
  await test('Zero-scope and approved consumers cannot control the actual default managed MCP lifecycle', async () => {
    assert.equal(adapterCalls.length, 1); assert.equal(kernel.registry.list().filter(tool => tool.source === 'mcp:controlled').length, 1);
    for (const ctx of [denied, business]) assert.throws(() => ctx.capability('mcp.service'), /宿主管理|生命周期/);
    assert.equal(adapterCalls[0].stopped, false); assert.equal(adapterCalls.length, 1);
    for (const name of ['reminders.service', 'telemetry.service']) {
      let mutations = 0; kernel.capability.register(name, 'kernel', { start() { mutations++; }, stop() { mutations++; } });
      assert.throws(() => denied.capability(name), /宿主管理|生命周期/); assert.equal(mutations, 0);
    }
    assert.equal(denied.capability('mcp.tools').stop, undefined);
    assert.ok(Array.isArray(await denied.capability('mcp.tools').list()));
    assert.ok(approvals.every(record => record.owner === 'mcp-bridge'));
  });
  await test('MCP error callbacks have a narrow DTO and cannot fire after the consumer is stopped', async () => {
    const notices = [], callback = event => notices.push(event);
    callback.apiKey = secret;
    const connection = await business.capability('process.mcp').startServer({ id: 'consumer', command: 'never-executed' }, { onError: callback });
    const row = adapterCalls.at(-1); assert.equal(row.handlers.onError.apiKey, undefined);
    row.handlers.onError({ category: 'protocol_error', fatal: true, apiKey: secret, headers: { authorization: secret }, env: { credential: secret }, child: {}, kernel: {} });
    assert.deepEqual(notices, [{ category: 'protocol_error', fatal: true }]);
    connection.stop();
    kernel.loader.unload('business', 'test-stopped');
    row.handlers.onError({ category: 'late_error', fatal: true }); assert.equal(notices.length, 1);
    await kernel.loader.loadDir('plugins', path.join(root, 'plugins', 'business')); grant('business');
  });
  const approved = globalThis[captureKey].business;
  await test('Market account/installation writes require the consumer permission, not the default owner permission', async () => {
    let writes = 0;
    const client = { listAccounts: () => [{ id: 'synthetic', token: secret }], listCatalog: async () => ({ ok: true }),
      login: async args => { writes++; assert.equal(args.password, 'consumer-owned-password'); return { ok: true, token: secret }; },
      logout: async () => { writes++; return { ok: true }; }, publish: async () => { writes++; return { ok: true }; }, install: async () => { writes++; return { ok: true }; } };
    const market = createMarketService({ capability: () => ({ communityMarket: client }) });
    kernel.capability.register('market.client', 'kernel', market);
    const api = approved.capability('market.client'); assert.equal(api.start, undefined); assert.equal(api.stop, undefined); assert.equal(api.verify, undefined);
    await assert.rejects(denied.capability('market.client').listCatalog({kind:'skill'}), /未声明权限/);
    await assert.rejects(observer.capability('market.client').login({ password: 'consumer-owned-password' }), /未声明权限/); assert.equal(writes, 0);
    assert.equal((await observer.capability('market.client').listCatalog({kind:'skill'})).ok, true);
    assert.equal((await api.listAccounts())[0].token, undefined); assert.equal((await api.login({ password: 'consumer-owned-password' })).token, undefined);
    await api.publish('synthetic'); await api.install('synthetic'); await api.logout('synthetic'); assert.equal(writes, 4);
  });
  let currentIds = ['90001'], globalWrites = 0;
  const injectedClient = { getBlocklist: () => ({ ok: true, ids: currentIds, apiKey: secret }), syncGlobalBlocklist: async () => ({ ok: true, ids: currentIds }),
    updateBlocklist: async ({ ids }) => { globalWrites++; currentIds = ids; return { ok: true, ids, token: secret }; } };
  const community = createCommunityService({ capability: name => name === 'host.defaults' ? { communityMarket: injectedClient } : name === 'host.config' ? { get: () => ({}) } : undefined,
    http: { fetch: async () => { throw new Error('No network'); } }, scheduler: { every: () => ({ stop() {} }) }, events: { emit() {} }, log: { warn() {} } });
  kernel.capability.register('community.client', 'kernel', community);
  await test('Community business facades use consumer scopes, clone/redact data and resolve replacements', async () => {
    const noRights = denied.capability('community.client'); assert.equal(noRights.start, undefined); assert.equal(noRights.stop, undefined);
    await assert.rejects(noRights.getBlocklist(), /未声明权限/); await assert.rejects(noRights.updateBlocklist({ ids: [] }), /未声明权限/); assert.equal(globalWrites, 0);
    const api = approved.capability('community.client'); const data = await api.getBlocklist(); assert.equal(data.apiKey, undefined);
    data.ids.push('forged'); assert.deepEqual(currentIds, ['90001']);
    await api.updateBlocklist({ ids: ['90002'] }); assert.equal(globalWrites, 1); assert.deepEqual(currentIds, ['90002']);
    kernel.capability.register('community.client', 'kernel', { getBlocklist: () => ({ ok: true, ids: ['replacement'] }) });
    assert.deepEqual((await api.getBlocklist()).ids, ['replacement']);
    kernel.capability.unregister('community.client', 'kernel'); await assert.rejects(api.getBlocklist(), /尚未就绪|未就绪/);
  });
  await test('Memory consolidation requires all read/write/network scopes and never lends its lifecycle methods', async () => {
    let consolidations = 0, stopped = 0;
    const consolidate = Object.assign(async ({ chatKey }) => { consolidations++; return { chatKey, members: [], apiKey: secret }; }, { start() {}, stop() { stopped++; } });
    kernel.capability.register('memory.consolidate', 'kernel', consolidate);
    await assert.rejects(Promise.resolve().then(() => denied.capability('memory.consolidate', { chatKey: 'group:90001' })), /未声明权限/);
    await assert.rejects(Promise.resolve().then(() => observer.capability('memory.consolidate', { chatKey: 'group:90001' })), /未声明权限/);
    assert.equal(consolidations, 0); const result = await approved.capability('memory.consolidate', { chatKey: 'group:90001' });
    assert.equal(consolidations, 1); assert.equal(result.apiKey, undefined); assert.equal(stopped, 0);
    kernel.capability.register('memory.consolidate', 'kernel', { consolidate: async () => ({ members: ['object-provider'] }), start() {}, stop() { stopped++; } });
    const api = approved.capability('memory.consolidate'); assert.equal(api.stop, undefined); assert.equal(api.start, undefined);
    assert.deepEqual((await api.consolidate({ chatKey: 'group:90001' })).members, ['object-provider']);
    let signal, finish;
    kernel.capability.register('memory.consolidate', 'kernel', async args => { signal = args.signal; await new Promise(resolve => { finish = resolve; }); return { members: ['late-result'] }; });
    const work = approved.capability('memory.consolidate', { chatKey: 'group:90001' }), rejected = assert.rejects(work, /授权|中止|失效/);
    await until(() => signal, 'consolidation received consumer signal');
    const entry = kernel.loader.hostEntry('business'); kernel.permissions.setOverride('business', 'fs.outsideNamespace', 'deny', { fingerprint: entry.fingerprint });
    await rejected; assert.equal(signal.aborted, true); finish(); grant('business');
  });
  const supplierDir = path.join(root, 'bundled', 'controlled-http');
  fs.mkdirSync(supplierDir, { recursive: true });
  fs.writeFileSync(path.join(supplierDir, 'plugin.json'), JSON.stringify({ id: 'controlled-http', kind: 'plugin', apiVersion: 1, permissions: ['net.outbound'], enabledByDefault: true, entry: 'index.js' }));
  fs.writeFileSync(path.join(supplierDir, 'index.js'), `export default { setup(ctx) {
    const fetchHeld = name => ctx.http.fetch(${JSON.stringify(new URL(baseUrl).origin)} + '/held/' + name);
    ctx.registerCapability('community.client', {
      start() {}, stop() {},
      async syncGlobalBlocklist(options = {}) {
        if (options.nested) return ctx.capability('llm.client').complete({ messages: [{ role: 'user', content: 'Nested local synthetic request' }] });
        if (options.spawnBackground) ctx.registerCapability('background129', {
          async create() { await fetchHeld('host-create'); return {
            async start() { await fetchHeld('host-start'); }, async stop() { await fetchHeld('host-stop'); }
          }; }
        }, { lifecycle: true, scopes: ['net.outbound'] });
        if (options.stopBackground) ctx.unregisterCapability('background129');
        const response = await fetchHeld('consumer'); return response.json();
      }
    }, { default: true, lifecycle: true, scopes: ['net.outbound'] });
  } };`);
  await kernel.loader.loadDir('bundled', supplierDir); await kernel.services.refresh();
  await test('Real HTTP requests inside a default provider abort on explicit abort, consumer revoke and unload', async () => {
    for (const mode of ['abort', 'revoke', 'unload']) {
      const ctx = globalThis[captureKey].business; grant('business'); const before = held.length;
      const controller = new AbortController();
      const work = ctx.capability('community.client').syncGlobalBlocklist({ signal: controller.signal }), rejected = assert.rejects(work, /授权|中止|失效|停止/);
      const row = await until(() => held.slice(before).find(item => item.url === '/held/consumer'), 'actual held consumer socket');
      if (mode === 'abort') controller.abort(new Error('Explicit consumer 中止'));
      else if (mode === 'revoke') { const entry = kernel.loader.hostEntry('business'); kernel.permissions.setOverride('business', 'net.outbound', 'deny', { fingerprint: entry.fingerprint }); }
      else kernel.loader.unload('business', 'dispose-held-http');
      await rejected; await until(() => row.disconnected, 'server observed consumer disconnect');
      assert.equal(fetches.at(-1).signal.aborted, true);
      if (mode === 'unload') await kernel.loader.loadDir('plugins', path.join(root, 'plugins', 'business'));
    }
    grant('business');
  });
  await test('A replacement provider nested SDK LLM call inherits consumer abort, revocation and unload', async () => {
    for (const mode of ['abort', 'revoke', 'unload']) {
      const ctx = globalThis[captureKey].business; grant('business');
      holdResponse = new Promise(resolve => { releaseResponse = resolve; });
      const entered = new Promise(resolve => { responseEntered = resolve; });
      const controller = new AbortController();
      const work = ctx.capability('community.client').syncGlobalBlocklist({ nested: true, signal: controller.signal });
      const rejected = assert.rejects(work, /授权|中止|失效|停止/);
      await entered;
      const response = activeResponse; let disconnected = false;
      response.once('close', () => { disconnected = !response.writableEnded; });
      if (mode === 'abort') controller.abort(new Error('Nested consumer 中止'));
      else if (mode === 'revoke') { const entry = kernel.loader.hostEntry('business'); kernel.permissions.setOverride('business', 'net.outbound', 'deny', { fingerprint: entry.fingerprint }); }
      else kernel.loader.unload('business', 'dispose-nested-http');
      await rejected; await until(() => disconnected, 'nested actual LLM socket closed after consumer cancellation');
      releaseResponse(); holdResponse = null; responseEntered = null;
      if (mode === 'unload') await kernel.loader.loadDir('plugins', path.join(root, 'plugins', 'business'));
    }
    grant('business');
  });
  await test('Host create/start/stop HTTP inherits its own lifetime, never the consumer that triggered reconciliation', async () => {
    for (const stopBackground of [false, true]) {
      const ctx = globalThis[captureKey].business; grant('business'); const before = held.length;
      const work = ctx.capability('community.client').syncGlobalBlocklist(stopBackground ? { stopBackground: true } : { spawnBackground: true });
      const rejected = assert.rejects(work, /授权|中止|失效/);
      const consumer = await until(() => held.slice(before).find(item => item.url === '/held/consumer'), 'consumer during host reconcile');
      const hostPath = stopBackground ? '/held/host-stop' : '/held/host-create';
      const host = await until(() => held.slice(before).find(item => item.url === hostPath), 'host lifecycle actual HTTP');
      const hostSignal = fetches.findLast(item => item.url === hostPath).signal;
      const entry = kernel.loader.hostEntry('business'); kernel.permissions.setOverride('business', 'net.outbound', 'deny', { fingerprint: entry.fingerprint });
      await rejected; await until(() => consumer.disconnected, 'only consumer disconnected');
      assert.equal(host.disconnected, false); assert.equal(hostSignal.aborted, false); answer(host);
      if (!stopBackground) {
        const started = await until(() => held.slice(before).find(item => item.url === '/held/host-start'), 'host start after consumer revoke');
        assert.equal(fetches.findLast(item => item.url === '/held/host-start').signal.aborted, false); assert.equal(started.disconnected, false); answer(started);
      }
      await kernel.services.idle();
    }
    grant('business');
  });
  await test('Third-party custom capabilities retain their own contract; caller revocation cancels outstanding LLM work', async () => {
    const custom = { vendorMethod: () => 'custom-contract', start: () => 'custom-owner' }; kernel.capability.register('custom.contract129', 'kernel', custom);
    assert.equal(denied.capability('custom.contract129'), custom); assert.equal(denied.capability('custom.contract129').vendorMethod(), 'custom-contract');
    holdResponse = new Promise(resolve => { releaseResponse = resolve; }); const entered = new Promise(resolve => { responseEntered = resolve; });
    const notices = [];
    const work = observer.capability('llm.client').complete({ messages: [{ role: 'user', content: 'Held local response' }], onRequest: event => notices.push(event) });
    const rejected = assert.rejects(work, /授权|中止|失效/); await entered;
    const entry = kernel.loader.hostEntry('observer'); kernel.permissions.setOverride('observer', 'net.outbound', 'deny', { fingerprint: entry.fingerprint });
    await rejected; assert.equal(notices.length, 1); assert.doesNotMatch(JSON.stringify(notices), /SYNTHETIC_HOST_SECRET/);
    releaseResponse(); holdResponse = null; activeResponse?.destroy();
  });
  console.log(`129 SDK consumer/callback boundaries: ${passed} scenarios passed; no external requests or actual spawned processes`);
} finally {
  releaseResponse?.(); activeResponse?.destroy();
  await kernel.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  delete globalThis[captureKey];
  const target = path.resolve(root); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('qqa-sdk-consumer129-'));
  fs.rmSync(target, { recursive: true, force: true });
}

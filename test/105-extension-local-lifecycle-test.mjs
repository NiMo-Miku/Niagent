// Real loader, config, storage, permissions and tool registry; controlled MCP
// requests reproduce lifecycle races without child processes or network calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPluginLoader } from '../src/kernel/plugin-loader.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createStorage } from '../src/kernel/storage.js';
import { Bus } from '../src/kernel/bus.js';
import { createCompatApi } from '../bundled/compat-04/index.js';
import { createMcpBridge } from '../bundled/mcp-bridge/index.js';

const log = { info() {}, warn() {}, error() {}, child() { return this; } };
const pause = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function until(check) { for (let i = 0; i < 100; i++) { if (check()) return; await pause(); } throw new Error('Controlled workflow did not advance'); }

async function localSdk() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-sdk-local105-')), stateKey = `__sdk105_${Date.now()}`;
  const state = globalThis[stateKey] = { contexts: [], cleaned: 0 };
  for (const name of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(root, name));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  const dir = path.join(root, 'skills/local-state'); fs.mkdirSync(dir);
  const manifest = { id: 'local-state', configSchema: { nested: { type: 'object' }, apiKey: { type: 'string', secret: true } },
    settings: { nested: { count: 1 }, legacyOnly: 'own-default', apiKey: '' } };
  fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'index.js'), `export default {setup(ctx){const s=globalThis[${JSON.stringify(stateKey)}];s.contexts.push(ctx);ctx.lifecycle.onStop(()=>s.cleaned++);}};`);
  const config = createConfig({ dataDir: path.join(root, 'data'), defaults: buildDefaultConfig(), log }); config.load();
  config.update({ api: { apiKey: 'QA_GLOBAL_SECRET' }, skills: { 'local-state': { settings: { nested: { count: 2 }, apiKey: 'QA_OWN_SECRET' } } } });
  const storage = createStorage({ dataDir: path.join(root, 'data'), log }), bus = new Bus(log);
  const permissions = createPermissions({ log, bus }), capabilities = createCapabilityRegistry({ log });
  const registry = createToolRegistry({ log, bus, permissions, capabilities }), scheduler = createScheduler({ log });
  const loader = createPluginLoader({ log, bus, appRoot: root, registry, capabilityRegistry: capabilities, permissions, scheduler, storage, config });
  try {
    await loader.loadAll(); assert.equal(loader.isActive('local-state'), true);
    const first = state.contexts[0];
    assert.equal(first.config.get('legacyOnly'), undefined, 'get stays schema-limited');
    const legacy = createCompatApi(first, manifest); assert.equal(legacy.config().legacyOnly, 'own-default', '0.4 config keeps all own defaults');
    assert.equal(legacy.config().apiKey, 'QA_OWN_SECRET'); assert.equal(legacy.config().api, undefined);
    const snapshot = first.config.get('nested'); snapshot.count = 40;
    const getMutated = config.get().skills['local-state'].settings.nested.count !== 2;
    config.update({ skills: { 'local-state': { settings: { nested: { count: 2 } } } } });
    const all = first.config.all(); all.nested.count = 50;
    const allMutated = config.get().skills['local-state'].settings.nested.count !== 2;
    first.storage.set('counter', 1);
    await loader.setEnabled('local-state', false);
    let stoppedWriteAccepted = false, stoppedReadAccepted = false;
    try { first.storage.set('counter', 99); stoppedWriteAccepted = true; } catch {}
    try { first.config.get('apiKey'); stoppedReadAccepted = true; } catch {}
    const before = { getMutated, allMutated, stoppedWriteAccepted, stoppedReadAccepted };
    console.log('  SDK observations', JSON.stringify(before));
    assert.deepEqual(before, { getMutated: false, allMutated: false, stoppedWriteAccepted: false, stoppedReadAccepted: false });
    assert.equal(storage.namespace('local-state').get('counter'), 1);
    for (const run of [() => first.config.all(), () => first.storage.get('counter'), () => first.storage.delete('counter'), () => first.storage.dir]) assert.throws(run, /失效/);
    assert.equal(first.lifecycle.signal.aborted, true); assert.equal(state.cleaned, 1);

    await loader.setEnabled('local-state', true); const second = state.contexts.at(-1);
    assert.notEqual(second, first); assert.equal(second.storage.get('counter'), 1);
    await loader.loadDir('skills', dir, { hot: true }); const third = state.contexts.at(-1);
    assert.notEqual(third, second); assert.equal(state.cleaned, 2);
    assert.throws(() => second.storage.set('counter', 500), /失效/);
    assert.throws(() => second.config.get('nested'), /失效/);
    third.storage.set('counter', 3); assert.equal(third.storage.get('counter'), 3);
    const own = createCompatApi(third, manifest).config(); own.nested.count = 700;
    assert.notEqual(third.config.get('nested').count, 700);
    third.storage.delete('counter'); assert.equal(third.storage.get('counter'), undefined);
  } finally {
    loader.stopAll(); scheduler.stop(); permissions.close(); delete globalThis[stateKey];
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true });
  }
}

function mcpFixture({ permissionGate = null, firstListing = null } = {}) {
  const permissions = createPermissions({ log }), registry = createToolRegistry({ log, permissions }), children = [];
  const ctx = { id: 'mcp-bridge', log, permissions: { async request(scope, detail) {
    if (permissionGate) await permissionGate.promise;
    return permissions.check('mcp-bridge', scope, { kind: 'bundled', detail });
  } }, registerCapability() {}, unregisterCapability() {},
  registerTool: def => registry.register(def), unregisterTool: id => registry.unregister(id) };
  const adapter = { startServer(_spec, opts) {
    const index = children.length, state = { stopped: false, listingStarted: false, opts,
      async request(method) {
        if (method === 'initialize') return {};
        if (method === 'tools/list') { state.listingStarted = true; return index === 0 && firstListing ? firstListing.promise
          : { tools: [{ name: 'echo', inputSchema: { type: 'object' }, scopes: [] }] }; }
        if (state.stopped) throw new Error('stopped');
        return { content: [{ type: 'text', text: `child-${index}` }] };
      }, notify() {}, stop() { state.stopped = true; } };
    children.push(state); return state;
  }, stopAll() { children.forEach(child => child.stop()); }, redactError: () => 'controlled_error' };
  return { bridge: createMcpBridge({ ctx, adapter, log }), children, registry, permissions };
}

async function duplicateConnect() {
  const gate = deferred(), fixture = mcpFixture({ permissionGate: gate });
  try {
    const a = fixture.bridge.connect({ id: 'same', command: 'controlled' });
    const b = fixture.bridge.connect({ id: 'same', command: 'controlled' });
    const completed = Promise.allSettled([a, b]);
    await pause(); assert.equal(fixture.children.length, 0, 'nothing starts while permissions are pending');
    gate.resolve(); const results = await completed;
    console.log('  Concurrent MCP observations', JSON.stringify({ children: fixture.children.length, fulfilled: results.filter(r => r.status === 'fulfilled').length }));
    assert.equal(fixture.children.length, 1, 'one server id must own at most one process');
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected').length, 1);
    assert.deepEqual(fixture.bridge.list(), ['same']); assert.equal(fixture.registry.list().length, 1);
    const tool = fixture.registry.list()[0]; assert.equal((await fixture.registry.invoke(tool.id, {})).result.content[0].text, 'child-0');
  } finally { gate.resolve(); await fixture.bridge.stop(); fixture.permissions.close(); }
}

async function reconnectCleanup() {
  const oldListing = deferred(), fixture = mcpFixture({ firstListing: oldListing });
  let oldHandled;
  try {
    oldHandled = fixture.bridge.connect({ id: 'same', command: 'controlled' }).then(() => false, () => true);
    await until(() => fixture.children[0]?.listingStarted);
    fixture.bridge.stopServer('same'); assert.equal(fixture.children[0].stopped, true);
    await fixture.bridge.connect({ id: 'same', command: 'controlled' });
    const newTool = fixture.registry.list()[0]; assert.ok(newTool);
    oldListing.reject(new Error('late old listing failure')); assert.equal(await oldHandled, true);
    console.log('  Reconnected MCP observations', JSON.stringify({ newStopped: fixture.children[1].stopped, tools: fixture.registry.list().length }));
    assert.equal(fixture.children[1].stopped, false, 'late old failure cannot kill the successor');
    assert.deepEqual(fixture.bridge.list(), ['same']); assert.ok(fixture.registry.get(newTool.id));
    assert.equal((await fixture.registry.invoke(newTool.id, {})).result.content[0].text, 'child-1');
    fixture.children[0].opts.onError({ fatal: true, category: 'late_old_error' });
    assert.equal(fixture.children[1].stopped, false);
  } finally { oldListing.reject(new Error('cleanup')); await oldHandled; await fixture.bridge.stop(); fixture.permissions.close(); }
}

const failures = [];
for (const [name, run] of [['Local SDK config/KV instance isolation', localSdk], ['MCP concurrent server-id reservation', duplicateConnect], ['MCP old connection cleanup isolation', reconnectCleanup]]) {
  console.log(`· ${name}`);
  try { await run(); console.log(`✓ ${name}`); } catch (error) { failures.push(error); console.error(`✗ ${name}: ${error.message}`); }
}
if (failures.length) throw new AggregateError(failures, '105 extension lifecycle regression failed');
console.log('✓ 105 real extension local lifecycle and MCP connection regression passed');

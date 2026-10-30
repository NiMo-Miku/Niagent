// 60：真实模块图热更新、原目录授权、逐代资源和 watcher 停机竞态；只执行临时 fixture。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPluginLoader, pluginFingerprint } from '../src/kernel/plugin-loader.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createStorage } from '../src/kernel/storage.js';
import { Bus } from '../src/kernel/bus.js';

const log = { info() {}, warn() {}, error() {}, child() { return this; } };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-hotreload-fixture-'));
for (const name of ['bundled', 'plugins', 'skills', 'src']) fs.mkdirSync(path.join(root, name));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
const stateKey = `__hotreload_${Date.now()}`;
const state = globalThis[stateKey] = { setups: [], disposed: [], deactivated: [], events: [], contexts: [], timerTicks: [], gates: {} };
const bus = new Bus(log), permissions = createPermissions({ log, headless: true });
const caps = createCapabilityRegistry({ log }), scheduler = createScheduler({ log });
const registry = createToolRegistry({ log, bus, permissions, capabilities: caps });
const schedulerOwners = [];
const trackedScheduler = { ...scheduler, every(ms, fn, opts) { schedulerOwners.push(opts.ownerId); return scheduler.every(ms, fn, opts); } };
let conf = { skills: {} };
const config = { get: () => conf, update: (next) => { conf = { ...conf, ...next }; } };
const loader = createPluginLoader({ appRoot: root, log, bus, registry, permissions, capabilityRegistry: caps,
  scheduler: trackedScheduler, storage: createStorage({ dataDir: path.join(root, 'data'), log }), config });
function fixture(id, kind = 'skills') {
  const dir = path.join(root, kind, id); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({ id, permissions: ['net.outbound'], panels: [{ id: 'main' }] }));
  return dir;
}
function source(id, version, { fail = false, wait = false } = {}) {
  return `const s = globalThis[${JSON.stringify(stateKey)}];
export default {
  async setup(ctx) {
    s.setups.push(${JSON.stringify(`${id}:${version}`)}); s.contexts.push(ctx);
    ctx.scheduler.every(10, () => s.timerTicks.push(${JSON.stringify(`${id}:${version}`)}));
    ctx.events.on('message.in', () => s.events.push(${JSON.stringify(`${id}:${version}`)}));
    ctx.registerCapability('${id}.version', () => ${JSON.stringify(version)});
    ctx.registerTool({id:'read',name:'Read',execute:async()=> (await import('./helper.js')).read()});
    ${wait ? `await s.gates[${JSON.stringify(id)}].promise;` : ''}
    ${fail ? "throw new Error('fixture update boom');" : ''}
  },
  deactivate() { s.deactivated.push(${JSON.stringify(`${id}:${version}`)}); },
  dispose() { s.disposed.push(${JSON.stringify(`${id}:${version}`)}); }
};`;
}
function writeGraph(dir, version) {
  fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'helper.js'), `// helper ${version}\nimport { value } from './sub/value.js'; export async function read(){const [json,cjs]=await Promise.all([import('./sub/value.json',{with:{type:'json'}}),import('./sub/value.cjs')]); return [value,json.default.value,cjs.default.value];}`);
  fs.writeFileSync(path.join(dir, 'sub', 'value.js'), `export const value = '${version}';`);
  fs.writeFileSync(path.join(dir, 'sub', 'value.json'), JSON.stringify({ value: `${version}-json` }));
  fs.writeFileSync(path.join(dir, 'sub', 'value.cjs'), `module.exports = {value:'${version}-cjs'};`);
}
function gate(id) { let release; const promise = new Promise((resolve) => { release = resolve; }); state.gates[id] = { promise, release }; return release; }
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, message) {
  const end = Date.now() + 6000;
  while (!predicate()) { assert.ok(Date.now() < end, message); await pause(20); }
}
const read = () => registry.invoke('graph__read', {});
const graph = fixture('graph');
try {
  console.log('· 实际 loader 首次加载静态/嵌套动态/JSON/CJS 模块图');
  writeGraph(graph, 'v1'); fs.writeFileSync(path.join(graph, 'index.js'), source('graph', 'v1'));
  await loader.loadAll();
  assert.equal(loader.isActive('graph'), true);
  assert.deepEqual((await read()).result, ['v1', 'v1-json', 'v1-cjs']);
  const first = loader.hostEntry('graph'), oldGeneration = first.generation;
  assert.equal(first.dir, graph); assert.equal(first.fingerprint, pluginFingerprint(graph));
  permissions.setOverride('graph', 'net.outbound', 'allow', { fingerprint: first.fingerprint });
  const runtimeV1 = first.runtime;

  console.log('· 默认保守拒绝变更依赖；显式 hot=true 更新完整图且清理旧代');
  writeGraph(graph, 'v2'); fs.writeFileSync(path.join(graph, 'index.js'), source('graph', 'v2'));
  await loader.loadDir('skills', graph);
  assert.match(loader.hostEntry('graph').loadError, /重启/);
  assert.equal((await read()).ok, false, '旧实例不得以更新后的原目录重新授权');
  await loader.loadDir('skills', graph, { hot: true });
  assert.deepEqual((await read()).result, ['v2', 'v2-json', 'v2-cjs']);
  const second = loader.hostEntry('graph');
  assert.notEqual(second.generation, oldGeneration); assert.equal(second.dir, graph);
  assert.equal(second.fingerprint, pluginFingerprint(graph));
  assert.equal(permissions.status('graph', 'net.outbound').override, null);
  assert.equal(permissions.setOverride('graph', 'net.outbound', 'allow', { fingerprint: first.fingerprint }), false);
  assert.equal(loader.contentCurrent('graph', first.fingerprint), false);
  assert.equal(fs.existsSync(runtimeV1), false);
  assert.ok(state.disposed.includes('graph:v1'));
  assert.equal(scheduler.count(), 1, '旧代回收不得删除同 owner 新定时器');
  assert.equal(bus.listenerCount('message.in'), 1);
  assert.ok(schedulerOwners.every((id) => id === 'graph'), '外部 scheduler ownerId 不变');
  bus.emit('message.in', {}); assert.deepEqual(state.events, ['graph:v2']);
  await until(() => state.timerTicks.includes('graph:v2'), '新定时器仍应运行');
  const staleCtx = state.contexts[0];
  assert.throws(() => staleCtx.scheduler.every(1, () => {}), /失效/);
  assert.equal(staleCtx.unregisterTool('graph__read'), false);

  console.log('· 失败更新回滚注册与旧模块，但原目录指纹不匹配时 fail-closed');
  const validV2 = source('graph', 'v2');
  fs.writeFileSync(path.join(graph, 'index.js'), source('graph', 'broken', { fail: true }));
  await loader.loadDir('skills', graph, { hot: true });
  assert.equal(loader.hostEntry('graph'), second); assert.match(second.loadError, /fixture update boom/);
  assert.equal(scheduler.count(), 1); assert.equal(bus.listenerCount('message.in'), 1);
  assert.ok(state.disposed.includes('graph:broken'));
  assert.equal((await read()).ok, false);
  fs.writeFileSync(path.join(graph, 'index.js'), validV2);
  assert.deepEqual((await read()).result, ['v2', 'v2-json', 'v2-cjs'], '恢复原内容后旧实例可继续使用');

  console.log('· bundled ../../src 保留共享模块身份与内部依赖热更新');
  const sharedPath = path.join(root, 'src', 'shared.js');
  fs.writeFileSync(sharedPath, 'export const singleton = {};');
  const shared = await import(pathToFileURL(sharedPath).href);
  const bundled = fixture('bundled-fixture', 'bundled');
  fs.writeFileSync(path.join(bundled, 'helper.js'), "export const value = 'b1';");
  fs.writeFileSync(path.join(bundled, 'index.js'), `import {singleton} from '../../src/shared.js'; import {value} from './helper.js'; export default {setup(ctx){ctx.registerTool({id:'bundled_read',name:'B',execute:()=>({singleton,value})});}};`);
  await loader.loadDir('bundled', bundled);
  assert.equal((await registry.invoke('bundled_read', {})).result.singleton, shared.singleton);
  fs.writeFileSync(path.join(bundled, 'helper.js'), "export const value = 'b2';");
  await loader.loadDir('bundled', bundled, { hot: true });
  const b2 = (await registry.invoke('bundled_read', {})).result;
  assert.equal(b2.singleton, shared.singleton); assert.equal(b2.value, 'b2');

  console.log('· 未变重扫不走生命周期；自动 fs.watch 500ms 后真正更新 helper');
  await loader.loadAll({ reason: 'fs-watch' });
  const beforeScan = state.setups.length;
  await loader.loadAll({ reason: 'fs-watch' }); assert.equal(state.setups.length, beforeScan);
  loader.startWatchers();
  writeGraph(graph, 'v3'); fs.writeFileSync(path.join(graph, 'index.js'), source('graph', 'v3'));
  await until(() => loader.hostEntry('graph').fingerprint === pluginFingerprint(graph), 'watch 应热更新 helper');
  assert.deepEqual((await read()).result, ['v3', 'v3-json', 'v3-cjs']);
  const unchangedSetups = state.setups.length;
  fs.writeFileSync(path.join(graph, 'sub', 'value.json'), JSON.stringify({ value: 'v3-json' }));
  await pause(700); assert.equal(state.setups.length, unchangedSetups, '内容未变 fs.watch 不重复 setup');

  console.log('· 重入时保留第二轮；停 watcher 不留 pending 重载');
  const releaseReentry = gate('graph');
  fs.writeFileSync(path.join(graph, 'index.js'), source('graph', 'blocked', { wait: true }));
  await until(() => state.setups.includes('graph:blocked'), 'watch 第一轮进入异步 setup');
  writeGraph(graph, 'v4'); fs.writeFileSync(path.join(graph, 'index.js'), source('graph', 'v4'));
  await pause(700); releaseReentry();
  await until(() => state.setups.includes('graph:v4') && loader.contentCurrent('graph'), 'watch 重入必须补第二轮');
  assert.deepEqual((await read()).result, ['v4', 'v4-json', 'v4-cjs']);
  loader.stopWatchers();
  const beforeStoppedWatch = state.setups.length;
  writeGraph(graph, 'v5'); await pause(700); assert.equal(state.setups.length, beforeStoppedWatch);
  await loader.loadDir('skills', graph, { hot: true });

  console.log('· watcher 正在 setup 时停止，不得提交新 generation');
  loader.startWatchers();
  const beforeWatchStop = loader.hostEntry('graph');
  const releaseStoppedWatch = gate('graph');
  fs.writeFileSync(path.join(graph, 'index.js'), source('graph', 'stop-watch-blocked', { wait: true }));
  await until(() => state.setups.includes('graph:stop-watch-blocked'), 'watch 停机测试进入 setup');
  loader.stopWatchers(); releaseStoppedWatch();
  await until(() => state.disposed.includes('graph:stop-watch-blocked'), 'stopWatchers 清理进行中加载');
  assert.equal(loader.hostEntry('graph'), beforeWatchStop);
  assert.equal(scheduler.count(), 1); assert.equal(bus.listenerCount('message.in'), 1);
  fs.writeFileSync(path.join(graph, 'index.js'), source('graph', 'v5'));
  await loader.loadDir('skills', graph, { hot: true });

  console.log('· 禁用与卸载走 deactivate/dispose 且回收资源和注册');
  await loader.setEnabled('graph', false);
  assert.equal(scheduler.count(), 0); assert.equal(bus.listenerCount('message.in'), 0);
  assert.equal(registry.get('graph__read'), undefined); assert.equal(caps.has('graph.version'), false);
  assert.equal(loader.hostEntry('graph').generation, null);
  await loader.setEnabled('graph', true);
  assert.equal(loader.isActive('graph'), true); assert.equal(scheduler.count(), 1);
  assert.equal(loader.unload('graph', 'fixture-unload'), true);
  assert.equal(scheduler.count(), 0); assert.equal(bus.listenerCount('message.in'), 0);

  console.log('· unload 阻止同 owner 进行中和已排队重载复活');
  const duringUnload = fixture('during-unload'); writeGraph(duringUnload, 'u1');
  const releaseUnload = gate('during-unload');
  fs.writeFileSync(path.join(duringUnload, 'index.js'), source('during-unload', 'blocked', { wait: true }));
  const unloadingFlight = loader.loadDir('skills', duringUnload, { hot: true });
  await until(() => state.setups.includes('during-unload:blocked'), '卸载测试进入 setup');
  const staleQueued = loader.loadDir('skills', duringUnload, { hot: true });
  loader.unload('during-unload', 'fixture-concurrent-unload');
  assert.equal(scheduler.count(), 0); assert.equal(bus.listenerCount('message.in'), 0);
  assert.equal(registry.get('during-unload__read'), undefined);
  releaseUnload(); await Promise.all([unloadingFlight, staleQueued]);
  assert.equal(loader.hostEntry('during-unload'), null);

  console.log('· stopAll 阻止 import/setup 中任务及排队任务复活');
  const pending = fixture('pending'); writeGraph(pending, 'pending');
  const releasePending = gate('pending');
  fs.writeFileSync(path.join(pending, 'index.js'), source('pending', 'blocked', { wait: true }));
  const inFlight = loader.loadDir('skills', pending, { hot: true });
  await until(() => state.setups.includes('pending:blocked'), '待停止 setup 已进入');
  const queued = loader.loadDir('skills', graph, { hot: true });
  loader.stopAll(); releasePending(); await Promise.all([inFlight, queued]);
  assert.deepEqual(loader.listEntries(), []); assert.equal(scheduler.count(), 0);
  assert.equal(bus.listenerCount('message.in'), 0); assert.equal(registry.get('pending__read'), undefined);
  assert.equal(registry.get('graph__read'), undefined); assert.ok(state.disposed.includes('pending:blocked'));
  assert.throws(() => state.contexts.at(-1).registerTool({ id: 'ghost', name: 'G', execute() {} }), /失效/);
  loader.startWatchers(); assert.deepEqual(loader.listEntries(), []);
  console.log('通过：60-plugin-hotreload-behavior（真实热更新/授权/回滚/逐代资源/watch/停机）');
} finally {
  for (const value of Object.values(state.gates)) value.release();
  loader.stopAll(); scheduler.stop(); permissions.close();
  delete globalThis[stateKey];
  fs.rmSync(root, { recursive: true, force: true });
}

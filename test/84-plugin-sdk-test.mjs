// SDK 接线与副作用权限：真实 loader/registry/config/permissions，HTTP 仅本机夹具。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createPluginLoader } from '../src/kernel/plugin-loader.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createStorage } from '../src/kernel/storage.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSendQueue } from '../src/kernel/send.js';
import { createPanelAdapters } from '../src/console/panel-adapters.js';
import { safeFetch } from '../src/kernel/safe-fetch.js';
import { Bus } from '../src/kernel/bus.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-sdk-84-'));
const warnings = [];
const log = { info() {}, warn(value) { warnings.push(value); }, error() {}, child() { return this; } };
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(root, directory));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
const stateKey = `__sdk84_${Date.now()}`;
const state = globalThis[stateKey] = { contexts: {}, changes: [], events: [], stopped: [], secret: 'must-not-reach-plugin' };
const config = createConfig({ dataDir: path.join(root, 'data'), defaults: buildDefaultConfig(), log }); config.load();
const bus = new Bus(log);
const permissions = createPermissions({ log, bus, dataDir: path.join(root, 'data'), headless: false });
const capabilities = createCapabilityRegistry({ log });
const registry = createToolRegistry({ log, bus, permissions, capabilities });
const scheduler = createScheduler({ log });
const metadataCalls = [];
const register = capabilities.register;
capabilities.register = (...args) => { metadataCalls.push(args); return register(...args); };
const deliveries = [], archives = [], fetches = [], accesses = [];
const resultEvents = [];
bus.on('blocklist-sync', (payload) => resultEvents.push(payload), { internal: true });
let slowSend = null;
const sendQueue = createSendQueue({ cfg: () => config.get(), log,
  transport: { async send(chatKey, segments, options) {
    deliveries.push({ chatKey, segments, options });
    if (slowSend) return slowSend(options.signal);
    return [{ msgId: deliveries.length }];
  } }, store: { appendSelf(chatKey, item) { archives.push({ chatKey, item }); } },
});
let localRequests = 0;
const server = http.createServer((_request, response) => {
  localRequests++; response.writeHead(200, { 'content-type': 'application/json', 'x-sdk-fixture': 'yes' });
  response.end(JSON.stringify({ fixture: true }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/fixture`;
const sdkHost = {
  send: (chatKey, segments, options) => sendQueue.sendSegments(chatKey, segments, options),
  fetch: async (target, options) => { fetches.push({ target, options }); return safeFetch(target, { ...options, allowPrivate: true, expectBinary: true }); },
  toolContext: (context, entry) => ({ chatKey: context?.chatKey, ownId: entry.manifest.id, signal: context?.signal }),
  capabilityAccess: (name, provider, { manifest, bundled }) => {
    accesses.push({ name, id: manifest.id, bundled });
    if (name === 'deferred.service') return { read: () => capabilities.consume(name) };
    if (name === 'host.config' && !bundled) return undefined;
    return provider;
  },
  emit: (name, payload, { bundled }) => {
    if (!bundled) throw new Error('宿主未授权此插件发布结果事件');
    return bus.emit(name, payload);
  },
};
let compatibilityInjectionCalls = 0;
const loader = createPluginLoader({ log, bus, appRoot: root, registry, capabilityRegistry: capabilities, permissions, scheduler,
  storage: createStorage({ dataDir: path.join(root, 'data'), log }), config, sdkHost,
  kernelDeps: { secret: state.secret }, bundledDepsFor: () => {
    compatibilityInjectionCalls++;
    return { kernel: { secret: state.secret }, compatibilityFixture: true, config: null, http: null, permissions: null, lifecycle: null, send: null };
  },
});
const setupSource = (version = 'v1') => `const state=globalThis[${JSON.stringify(stateKey)}];export default {
  async setup(ctx) {
    state.contexts[ctx.id]=ctx;
    ctx.config.onChange(value=>state.changes.push({id:ctx.id,value}));
    ctx.events.on('message.in',()=>state.events.push(ctx.id+':${version}'));
    ctx.lifecycle.onStop(()=>state.stopped.push(ctx.id+':${version}'));
    ctx.registerTool({name:'formal',description:'SDK format',params:{type:'object',properties:{}},handler:(_args,context)=>({id:context.ownId,chatKey:context.chatKey,keys:Object.keys(context)})});
    ctx.registerTool({id:'legacy',name:'Legacy format',execute:()=>42});
    ctx.registerCapability('fixture.echo',value=>({value}),{scopes:['scheduler'],priority:7});
    ctx.registerTransport({id:ctx.id+'-transport',default:true,scopes:['proc.exec'],create(){return {send(){return []},start(){},stop(){}}}});
    if(ctx.id==='user-sdk') state.panel=await ctx.ui.panel.register({title:'Dynamic',entry:'index.html',size:{width:400,height:300}});
  }
};`;
function plugin(kind, id, manifest = {}, source = setupSource()) {
  const dir = path.join(root, kind, id); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({ id, permissions: ['qq.send', 'net.outbound', 'ui.panel', 'proc.exec'], configSchema: { count: { type: 'number' }, nested: { type: 'object' } }, settings: { count: 1, nested: { value: 2 }, undeclared: 'own-but-not-declared' }, ...manifest }));
  fs.writeFileSync(path.join(dir, 'index.js'), source);
  fs.mkdirSync(path.join(dir, 'ui')); fs.writeFileSync(path.join(dir, 'ui', 'index.html'), '<html><body>SDK fixture</body></html>');
  return dir;
}
const userDir = plugin('skills', 'user-sdk', { hostConfig: ['api', 9, 'api'] });
plugin('bundled', 'bundled-sdk');
plugin('skills', 'undeclared', { permissions: [] }, `export default {setup(ctx){globalThis[${JSON.stringify(stateKey)}].contexts[ctx.id]=ctx;}};`);
let approvePanels = true;
permissions.onAsk((request) => { if (request.scope === 'ui.panel' && approvePanels) permissions.resolveAsk(request.id, 'always'); });
const grant = (id, scope, decision = 'allow', ownerLoader = loader) => assert.equal(permissions.setOverride(id, scope, decision, { fingerprint: ownerLoader.hostEntry(id).fingerprint }), true);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) { const end = Date.now() + 2000; while (!predicate()) { assert.ok(Date.now() < end, '受控异步操作未到达预期阶段'); await pause(5); } }

try {
  console.log('· 实际 loader：新旧工具格式、窄上下文、capability与transport元数据');
  await loader.loadAll();
  assert.equal(loader.isActive('user-sdk'), true); assert.equal(loader.isActive('bundled-sdk'), true);
  const user = state.contexts['user-sdk'], bundled = state.contexts['bundled-sdk'];
  for (const ctx of [user, bundled]) assert.equal(ctx.kernel, undefined);
  assert.equal(compatibilityInjectionCalls, 0);
  for (const ctx of [user, bundled]) {
    assert.equal(ctx.compatibilityFixture, undefined);
    for (const [object, method] of [['config', 'get'], ['http', 'fetch'], ['permissions', 'request'], ['lifecycle', 'onStop']]) assert.equal(typeof ctx[object][method], 'function');
    assert.equal(typeof ctx.send, 'function');
  }
  assert.deepEqual(loader.hostEntry('user-sdk').manifest.hostConfig, ['api']);
  assert.equal((await registry.invoke('user-sdk__legacy', {})).result, 42);
  const formal = await registry.invoke('user-sdk__formal', {}, { execCtx: { chatKey: 'group:84', kernel: { secret: state.secret }, store: {} } });
  assert.equal(formal.result.id, 'user-sdk'); assert.equal(formal.result.chatKey, 'group:84');
  assert.deepEqual(formal.result.keys.sort(), ['chatKey', 'ownId', 'signal']);
  assert.deepEqual(user.capability('fixture.echo', 'value'), { value: 'value' });
  capabilities.register('host.config', 'kernel', { secret: state.secret });
  assert.equal(user.capability('host.config'), undefined); assert.ok(accesses.some((entry) => entry.name === 'host.config' && entry.id === 'user-sdk' && entry.bundled === false));
  const deferred = user.capability('deferred.service'); assert.equal(user.hasCapability('deferred.service'), false); assert.equal(deferred.read(), undefined);
  capabilities.register('deferred.service', 'kernel', { ready: true });
  assert.deepEqual(deferred.read(), { ready: true }); assert.equal(user.hasCapability('deferred.service'), true);
  assert.equal(bundled.events.emit('blocklist-sync', { ok: true, count: 1 }), true); assert.deepEqual(resultEvents, [{ ok: true, count: 1 }]);
  assert.throws(() => user.events.emit('blocklist-sync', { ok: false }), /宿主未授权/);
  for (const event of ['message.out', 'permission.decision', 'config.change']) assert.throws(() => bundled.events.emit(event, {}), /不能发布事件/);
  assert.equal(resultEvents.length, 1);
  const transport = metadataCalls.find(([name, owner]) => name === 'transport.provider' && owner === 'user-sdk');
  assert.equal(transport[2].id, 'user-sdk-transport');
  assert.deepEqual(transport[3], { lifecycle: true, default: true, scopes: ['net.outbound', 'proc.exec'] });
  assert.deepEqual(loader.hostEntry('user-sdk').registeredCapabilities.find((item) => item.name === 'fixture.echo').options, { scopes: ['scheduler'], priority: 7 });
  assert.deepEqual(capabilities.snapshotOwner('user-sdk').find((item) => item.name === 'fixture.echo').options, { scopes: ['scheduler'], priority: 7 });

  console.log('· 动态面板进入真实宿主；路径限制、owner权限与dispose');
  const panels = createPanelAdapters({ loader, permissions, registry, config, log });
  assert.equal(panels.listPanels().some((panel) => panel.id === state.panel.id && panel.ownerId === 'user-sdk'), true);
  await assert.rejects(user.ui.panel.register({ title: 'Bad', entry: '../index.html' }), /相对 HTML/);
  state.panel.dispose(); state.panel.dispose(); assert.equal(panels.listPanels().some((panel) => panel.id === state.panel.id), false);

  console.log('· config.onChange只交付schema键、深拷贝并在停用后回收');
  config.update({ api: { apiKey: state.secret }, skills: { 'user-sdk': { settings: { count: 4, nested: { value: 8 }, unexpected: state.secret } } } });
  const changed = state.changes.findLast((item) => item.id === 'user-sdk').value;
  assert.deepEqual(changed, { count: 4, nested: { value: 8 } }); changed.nested.value = 99;
  assert.equal(config.get().skills['user-sdk'].settings.nested.value, 8);

  console.log('· SDK send/fetch：真实权限/发送队列/本机HTTP，未声明不得调用宿主');
  grant('user-sdk', 'qq.send'); grant('user-sdk', 'net.outbound');
  const sent = await user.send('group:84', [{ type: 'text', text: 'SDK message' }]);
  assert.equal(sent.ok, true); assert.equal(deliveries.length, 1); assert.equal(archives.length, 1);
  const response = await user.http.fetch(url, { maxBytes: 4096, timeoutMs: 1500 }); assert.equal(response.status, 200); assert.equal(response.url, url);
  assert.equal(response.headers.get('x-sdk-fixture'), 'yes'); assert.deepEqual(await response.json(), { fixture: true });
  assert.equal(fetches.length, 1); assert.equal(localRequests, 1);
  assert.equal(fetches[0].options.maxBytes, 4096); assert.equal(fetches[0].options.timeoutMs, 1500);
  await assert.rejects(state.contexts.undeclared.send('group:84', [{ type: 'text', text: 'denied' }]), /未声明/);
  await assert.rejects(state.contexts.undeclared.http.fetch(url), /未声明/);
  assert.equal(deliveries.length, 1); assert.equal(fetches.length, 1);

  console.log('· 旧HTTP桥绑定调用者身份，一次授权只检查一次');
  const bridgeCalls = [], bridgeAsks = [];
  capabilities.register('compat04.http', 'kernel', { fetchFor: async (target, options, detail) => {
    bridgeCalls.push({ target, options, detail }); return new Response(null, { status: 204 });
  } });
  grant('user-sdk', 'net.outbound', 'ask');
  const removeAsk = permissions.onAsk((request) => {
    if (request.pluginId === 'user-sdk' && request.scope === 'net.outbound') { bridgeAsks.push(request); permissions.resolveAsk(request.id, 'once'); }
  });
  const bridgeResponse = await user.capability('compat04.http').fetchFor(url, {}, { pluginId: 'spoofed', fingerprint: 'spoofed', authorized: false });
  removeAsk(); assert.equal(bridgeResponse.status, 204); assert.equal(bridgeAsks.length, 1); assert.equal(bridgeCalls.length, 1);
  assert.equal(bridgeCalls[0].detail.pluginId, 'user-sdk'); assert.equal(bridgeCalls[0].detail.fingerprint, loader.hostEntry('user-sdk').fingerprint);
  assert.equal(bridgeCalls[0].detail.authorized, true); assert.ok(bridgeCalls[0].options.signal instanceof AbortSignal);
  grant('user-sdk', 'net.outbound');

  console.log('· await期间源码指纹改变，宿主结果不能交付给旧SDK');
  const originalSource = fs.readFileSync(path.join(userDir, 'index.js'), 'utf8');
  const normalFetch = sdkHost.fetch;
  let finishFingerprintFetch, fingerprintSignal;
  sdkHost.fetch = (_target, options) => { fingerprintSignal = options.signal; return new Promise((resolve) => { finishFingerprintFetch = resolve; }); };
  const fingerprintRequest = user.http.fetch(url); const rejectedFingerprint = assert.rejects(fingerprintRequest, /授权已失效|指纹已失效/);
  await until(() => finishFingerprintFetch);
  fs.writeFileSync(path.join(userDir, 'index.js'), originalSource + '\n// changed during request\n');
  await assert.rejects(user.http.fetch(url), /指纹已失效/); assert.equal(fingerprintSignal.aborted, false);
  finishFingerprintFetch(new Response(null, { status: 204 })); await rejectedFingerprint;
  fs.writeFileSync(path.join(userDir, 'index.js'), originalSource); sdkHost.fetch = normalFetch;

  console.log('· 撤权立即中止在途发送；撤权后不能再调用宿主');
  let receivedSignal;
  slowSend = (signal) => { receivedSignal = signal; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); };
  const pendingSend = user.send('group:84', [{ type: 'text', text: 'pending revoke' }]);
  const rejectedSend = assert.rejects(pendingSend, /授权已失效/);
  await until(() => receivedSignal); grant('user-sdk', 'qq.send', 'deny'); await rejectedSend;
  assert.equal(receivedSignal.aborted, true); assert.equal(archives.length, 1);
  const beforeDenied = deliveries.length; await assert.rejects(user.send('group:84', [{ type: 'text', text: 'denied now' }]), /权限不足/); assert.equal(deliveries.length, beforeDenied);
  slowSend = null;

  console.log('· 调用者取消、等待授权期间停用与旧实例闸');
  grant('user-sdk', 'qq.send'); const aborted = new AbortController(); aborted.abort(new Error('caller cancelled'));
  await assert.rejects(user.send('group:84', [{ type: 'text', text: 'cancelled' }], { signal: aborted.signal }), /caller cancelled/);
  grant('user-sdk', 'net.outbound', 'ask');
  const cancelWaiting = new AbortController();
  const waitingRequest = user.http.fetch(url, { signal: cancelWaiting.signal }); const rejectedWaiting = assert.rejects(waitingRequest, /cancel waiting/);
  await until(() => permissions.pending().some((request) => request.pluginId === 'user-sdk' && request.scope === 'net.outbound'));
  cancelWaiting.abort(new Error('cancel waiting')); await rejectedWaiting; assert.equal(fetches.length, 1);
  // The shared permission request is host-owned; withdrawing this call cannot
  // approve another waiting operation, so reset it explicitly for the next case.
  grant('user-sdk', 'net.outbound', 'ask');
  const pendingFetch = user.http.fetch(url); const rejectedFetch = assert.rejects(pendingFetch, /权限不足|失效|插件实例已停止/);
  await until(() => permissions.pending().some((request) => request.pluginId === 'user-sdk' && request.scope === 'net.outbound'));
  const oldAsk = permissions.pending().find((request) => request.pluginId === 'user-sdk').id;
  user.lifecycle.onStop(async () => { throw new Error('cleanup fixture failure'); });
  await loader.setEnabled('user-sdk', false); await rejectedFetch;
  assert.ok(warnings.some((value) => String(value).includes('cleanup fixture failure')));
  assert.equal(permissions.resolveAsk(oldAsk, 'once').ok, false); assert.equal(fetches.length, 1);
  assert.equal(state.stopped.filter((value) => value === 'user-sdk:v1').length, 1);
  const beforeChanges = state.changes.filter((item) => item.id === 'user-sdk').length;
  config.update({ skills: { 'user-sdk': { settings: { count: 9 } } } });
  assert.equal(state.changes.filter((item) => item.id === 'user-sdk').length, beforeChanges);
  await assert.rejects(user.send('group:84', [{ type: 'text', text: 'old SDK' }]), /失效/);

  console.log('· 热更新回收旧代、更新源码并保持capability元数据');
  fs.writeFileSync(path.join(userDir, 'index.js'), setupSource('v2'));
  await loader.setEnabled('user-sdk', true); assert.equal(loader.isActive('user-sdk'), true);
  const v2 = state.contexts['user-sdk']; assert.notEqual(v2, user);
  bus.emit('message.in', {}); assert.ok(state.events.includes('user-sdk:v2')); assert.ok(!state.events.includes('user-sdk:v1'));
  await loader.loadDir('skills', userDir, { hot: true });
  assert.equal(state.stopped.filter((value) => value === 'user-sdk:v2').length, 1);
  assert.deepEqual(metadataCalls.findLast(([name, owner]) => name === 'transport.provider' && owner === 'user-sdk')[3].scopes, ['net.outbound', 'proc.exec']);
  assert.deepEqual(capabilities.options('transport.provider', 'user-sdk'), { lifecycle: true, default: true, scopes: ['net.outbound', 'proc.exec'] });
  grant('user-sdk', 'net.outbound');
  let lifecycleSignal;
  sdkHost.fetch = (_target, options) => { lifecycleSignal = options.signal; return new Promise(() => {}); };
  const lifecycleFetch = state.contexts['user-sdk'].http.fetch(url); const rejectedLifecycle = assert.rejects(lifecycleFetch, /插件实例已停止/);
  await until(() => lifecycleSignal); await loader.setEnabled('user-sdk', false); await rejectedLifecycle;
  assert.equal(lifecycleSignal.aborted, true); sdkHost.fetch = normalFetch;

  console.log('· 无fetch宿主时默认safe-fetch，不接受调用方放行内网参数');
  const fallbackDir = plugin('skills', 'fallback-fetch', { permissions: ['net.outbound'] }, `export default {setup(ctx){globalThis[${JSON.stringify(stateKey)}].contexts[ctx.id]=ctx;}};`);
  const fallbackLoader = createPluginLoader({ log, bus, appRoot: root, registry, capabilityRegistry: capabilities, permissions, scheduler,
    storage: createStorage({ dataDir: path.join(root, 'data'), log }), config });
  await fallbackLoader.loadDir('skills', fallbackDir);
  grant('fallback-fetch', 'net.outbound', 'allow', fallbackLoader);
  try { await assert.rejects(state.contexts['fallback-fetch'].http.fetch(url, { allowPrivate: true }), /内网|私有|回环/); assert.equal(localRequests, 1); }
  finally { fallbackLoader.stopAll(); }

  console.log('✓ 84-plugin-sdk：真实SDK行为全部通过');
} finally {
  approvePanels = false; loader.stopAll(); scheduler.stop(); permissions.close();
  await new Promise((resolve) => server.close(resolve)); delete globalThis[stateKey];
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true });
}

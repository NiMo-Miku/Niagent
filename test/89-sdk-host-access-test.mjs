// Real loader, permissions and repository modules; controlled host operations
// never spawn a process, connect QQ, or request an external server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { Bus } from '../src/kernel/bus.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createPluginLoader } from '../src/kernel/plugin-loader.js';
import { createSdkAccess } from '../src/kernel/sdk-services.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createStorage } from '../src/kernel/storage.js';
import { createServiceHost, serviceFacade } from '../src/kernel/service-host.js';
import { chatCompletion } from '../src/kernel/llm.js';

async function configuredMcpLifecycle() {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-configured-mcp-89-'));
  const dataDir = path.join(appRoot, 'data');
  for (const dir of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, dir));
  fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
  fs.cpSync(path.resolve(import.meta.dirname, '../bundled/mcp-bridge'), path.join(appRoot, 'bundled/mcp-bridge'), { recursive: true });
  const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log }); config.load();
  config.update({ skills: { 'mcp-bridge': { settings: { servers: [{ id: 'controlled', command: 'controlled-mcp' }] } } } });
  const bus = new Bus(log), permissions = createPermissions({ dataDir, log, bus });
  const capabilities = createCapabilityRegistry({ log }), registry = createToolRegistry({ permissions, capabilities, log, bus });
  const scheduler = createScheduler({ log }), storage = createStorage({ dataDir, log });
  let loader;
  const services = createServiceHost({ capability: capabilities, config, bus, log, authorize: async (name, provider) => {
    try {
      for (const scope of capabilities.options(name, provider.ownerId).scopes ?? []) await sdk.check(loader.hostEntry(provider.ownerId), true, scope);
      return true;
    } catch { return false; }
  } });
  const sdk = createSdkAccess({ config, permissions, bus, loaderOf: () => loader, facets: {
    'process.mcp': serviceFacade(() => services.get('process.mcp'), ['startServer', 'stopAll', 'redactError']),
  } });
  loader = createPluginLoader({ appRoot, log, bus, registry, capabilityRegistry: capabilities, permissions, scheduler, storage, config, sdkHost: sdk });
  const originalSpawn = childProcess.spawn, children = [], messages = [];
  // Actual adapter and JSON-RPC framing; replace the OS boundary only. Any
  // unexpected spawn is a test failure, and the original binding is restored.
  childProcess.spawn = (command, args, options) => {
    assert.equal(command, 'controlled-mcp'); assert.deepEqual(args, []); assert.equal(options.shell, false);
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kills = 0;
    child.kill = () => { child.kills++; };
    child.stdin = { write(line) {
      const request = JSON.parse(line); messages.push(request);
      if (request.id === undefined) return;
      const result = request.method === 'tools/list' ? { tools: [{ name: 'fixture', inputSchema: { type: 'object' } }] }
        : request.method === 'tools/call' ? { content: [{ type: 'text', text: 'controlled result' }] } : { capabilities: {} };
      queueMicrotask(() => child.stdout.emit('data', JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n'));
    } };
    children.push(child); return child;
  };
  syncBuiltinESMExports();
  try {
    await loader.loadAll();
    assert.equal(loader.hostEntry('mcp-bridge').status, 'active'); assert.equal(children.length, 0);
    assert.equal(registry.byOwner('mcp-bridge').length, 0); assert.deepEqual(capabilities.consume('mcp.tools').list(), []);
    await services.start(); await services.idle();
    assert.equal(children.length, 1); assert.deepEqual(capabilities.consume('mcp.tools').list(), ['controlled']);
    assert.deepEqual(messages.slice(0, 3).map((item) => item.method), ['initialize', 'notifications/initialized', 'tools/list']);
    const [toolId] = registry.byOwner('mcp-bridge'); assert.ok(toolId);
    const called = await registry.invoke(toolId, {}); assert.equal(called.ok, true); assert.equal(called.result.content[0].text, 'controlled result');
    const entry = loader.hostEntry('mcp-bridge');
    permissions.bindPlugin('mcp-bridge', { fingerprint: entry.fingerprint, scopes: entry.manifest.permissions, isCurrent: () => loader.hostEntry('mcp-bridge') === entry });
    assert.equal(permissions.setOverride('mcp-bridge', 'proc.exec', 'deny', { fingerprint: entry.fingerprint }), true);
    await new Promise(setImmediate); await services.idle();
    assert.equal(children[0].kills, 1); assert.equal(registry.byOwner('mcp-bridge').length, 0);
    assert.deepEqual(capabilities.consume('mcp.tools').list(), []);
    assert.equal(permissions.setOverride('mcp-bridge', 'proc.exec', 'allow', { fingerprint: entry.fingerprint }), true);
    await new Promise(setImmediate); await services.idle();
    assert.equal(children.length, 2); assert.deepEqual(capabilities.consume('mcp.tools').list(), ['controlled']);
    assert.equal((await registry.invoke(toolId, {})).result.content[0].text, 'controlled result');
    await loader.setEnabled('mcp-bridge', false); await services.idle();
    assert.equal(children[0].kills, 1); assert.equal(children[1].kills, 1); assert.equal(registry.byOwner('mcp-bridge').length, 0);
  } finally {
    loader.stopAll(); await services.stop(); scheduler.stop(); permissions.close();
    childProcess.spawn = originalSpawn; syncBuiltinESMExports();
    assert.equal(path.dirname(path.resolve(appRoot)), path.resolve(os.tmpdir())); fs.rmSync(appRoot, { recursive: true, force: true });
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-sdk-host-89-'));
const dataDir = path.join(root, 'data'), stateKey = '__sdkHost89_' + Date.now();
const contexts = globalThis[stateKey] = {};
const log = { info() {}, warn() {}, error() {}, child() { return this; } };
for (const name of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(root, name));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log }); config.load();
config.update({
  api: { baseUrl: 'https://direct.fixture/v1', apiKey: 'HOST_MODEL_KEY', model: 'fixture-model' },
  providers: [{ id: 'fixture', name: 'Fixture', baseURL: 'https://llm.fixture/v1', apiKey: 'HOST_PROVIDER_KEY', models: [{ id: 'fixture-model', apiKey: 'NESTED_KEY' }] }],
  webSearch: { provider: 'bocha', apiKey: 'OWNER_WEB_KEY' },
  onebot: { accessToken: 'OWNER_TRANSPORT_TOKEN' },
  memory: { enabled: true }, memberNotes: { 7: 'Fixture' },
});
const bus = new Bus(log), permissions = createPermissions({ dataDir, log, bus, headless: false });
const capabilities = createCapabilityRegistry({ log });
const registry = createToolRegistry({ permissions, capabilities, log, bus });
const scheduler = createScheduler({ log }), storage = createStorage({ dataDir, log });
const store = createChatStore({ dataDir, log }), memory = createMemoryStore({ dataDir, log });
const sessions = createSessionRegistry({ dataDir, log });
store.appendIncoming('group:89', { mid: 89, senderId: '7', ts: Date.now(), text: 'stored fixture', raw: { token: 'RAW_SECRET' }, localPath: path.join(dataDir, 'private.png') });
store.updateByMid('group:89', 89, { raw: { token: 'RAW_SECRET' }, localPath: path.join(dataDir, 'private.png') });
memory.append('group:89', { userId: '7', name: 'Fixture', content: 'memory fixture' });
let loader, mediaOperation, sends = 0, readCalls = 0, runtimeStops = 0, emojiWrites = 0, mcpControls = 0;
const modelCalls = [];
const connections = [];
const facets = {
  'host.environment': { appRoot: root, dataDir, version: '0.5.0', profile: { mode: 'fixture', localPath: dataDir } },
  'host.defaults': { communityMarket: { listAccounts: () => ({ accounts: [] }), getBlocklist: () => ({ ids: [] }), syncGlobalBlocklist: () => new Promise(() => {}), privateMutate() { throw new Error('private method must not be exposed'); } } },
  'data.messages': {
    recent(...args) { readCalls++; return store.recent(...args); }, findByMid: store.findByMid, updateByMid: store.updateByMid, listChats: store.listChats,
  },
  'data.memory': memory,
  'data.sessions': sessions,
  'data.stickers': { imagesDir: path.join(dataDir, 'stickers') },
  'core.send': { async sendTextBatch(_key, _text, options) { sends++; return { ok: true, options, apiKey: 'SEND_SECRET' }; } },
  'transport.actions': new Proxy({}, { get(_target, key) { return (...args) => ({ key, args, apiKey: 'ACTION_SECRET' }); } }),
  'media.reader': { image: (media, options) => mediaOperation ? mediaOperation(media, options) : { dataUrl: 'data:image/png;base64,fixture', token: 'MEDIA_SECRET' } },
  'process.mcp': {
    startServer() { const item = { stopped: 0, child: { env: { apiKey: 'PROCESS_SECRET' } }, request: () => new Promise(() => {}), notify() {}, stop() { this.stopped++; } }; connections.push(item); return item; },
    stopAll() { throw new Error('global process cleanup must never be used'); }, redactError() { return 'safe_error'; },
  },
  'runtime.reminders': { start() {}, stop() { runtimeStops++; } },
  'extensions.state': { isActive: (id) => loader.isActive(id), isEnabled: (id) => loader.isEnabled(id), videoFrames: () => ({ enabled: false, frames: 5 }) },
  'qq.emoji-favorites': { fetchCustomFaces: () => ['fixture'], addCustomFace: () => { emojiWrites++; return { emojiId: 'fixture' }; }, modifyCustomFace: () => { emojiWrites++; }, deleteCustomFace: () => { emojiWrites++; } },
  'mcp.tools': { list: () => ['fixture'], start() { mcpControls++; }, stop() { mcpControls++; }, connect() { mcpControls++; }, stopServer() { mcpControls++; }, registerTool() { mcpControls++; } },
  'tools.catalog': { list: () => [{ id: 'fixture', apiKey: 'CATALOG_SECRET', execute() {} }] },
  'llm.client': { complete(args) {
    modelCalls.push(args); return { message: { content: '{"impressions":[{"content":"memory fixture"}]}' }, usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 }, _usedApi: { provider: 'fixture', baseUrl: 'https://llm.fixture/v1', apiKey: 'HOST_MODEL_KEY' }, _usedModel: 'dedicated-model' };
  } },
};
const sdk = createSdkAccess({ config, permissions, bus, loaderOf: () => loader, facets });
loader = createPluginLoader({ appRoot: root, log, bus, registry, capabilityRegistry: capabilities, permissions, scheduler, storage, config, sdkHost: sdk });
function plugin(kind, id, manifest = {}) {
  const dir = path.join(root, kind, id); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({ id, ...manifest }));
  fs.writeFileSync(path.join(dir, 'index.js'), 'export default {setup(ctx){globalThis[' + JSON.stringify(stateKey) + '][ctx.id]=ctx;}};');
  if (id === 'memory-service') {
    const implementation = pathToFileURL(path.resolve(import.meta.dirname, '../bundled/memory-service/index.js')).href;
    fs.writeFileSync(path.join(dir, 'index.js'), 'import actual from ' + JSON.stringify(implementation) + ';export default {...actual,setup(ctx){globalThis[' + JSON.stringify(stateKey) + '][ctx.id]=ctx;return actual.setup(ctx);}};');
  }
  return dir;
}
for (const [id, manifest] of [
  ['query-tools', {}], ['memory-tools', {}], ['core-tools', { permissions: ['qq.send'] }],
  ['web-tools', { hostConfig: ['webSearch', 'api', 'providers'], permissions: ['net.outbound'] }],
  ['memory-service', { hostConfig: ['api', 'providers', 'memory', 'memberNotes'], permissions: ['net.outbound'] }],
  ['transport-onebot', { hostConfig: ['onebot', 'api'] }],
  ['mcp-bridge', { permissions: ['proc.exec', 'mcp.connect'] }], ['reminders', {}],
  ['market', { permissions: ['net.outbound'] }], ['community', { permissions: ['net.outbound'] }],
  ['other-bundled', { hostConfig: ['api', 'providers'], permissions: ['data.memory.read'] }],
]) plugin('bundled', id, manifest);
plugin('skills', 'sdk-user', { permissions: ['data.sessions.read', 'data.memory.read', 'fs.outsideNamespace', 'net.outbound', 'qq.send', 'proc.exec', 'mcp.connect'], hostConfig: ['api', 'providers', 'webSearch'], configSchema: { own: { type: 'string' }, apiKey: { type: 'string' } }, settings: { own: 'own setting', apiKey: 'USER_KEY', undeclared: 'extra setting' } });
plugin('skills', 'undeclared', { permissions: [] });
const providerDir = plugin('skills', 'provider-user', { configSchema: { own: { type: 'string' } }, settings: { own: 'provider-own' } });
fs.writeFileSync(path.join(providerDir, 'index.js'), `const state=globalThis[${JSON.stringify(stateKey)}];export default {setup(ctx){state['provider-user']=ctx;state.inputs={};
  for(const name of ['llm.request-params','llm.response','llm.usage','llm.retry-advisor','message.owner-check','media.download','reply.inline-calls','reply.local-policy','reply.grounded-select'])ctx.registerCapability(name,payload=>{state.inputs[name]=payload;if(name==='llm.request-params'){payload.body.marker='safe-transform';return null;}if(name==='llm.response'){payload.result.message.content='safe-response';return null;}return null;},{lifecycle:name==='llm.request-params'});
  ctx.registerCapability('tool.guard',(tool,args)=>{state.inputs.guard={tool,args};if(args)args.value='mutated copy';return null;});
  ctx.registerCapability('custom.contract',value=>value);
  ctx.events.on('message.in',value=>{state.eventCopy=value;value.text='changed copy';});
  ctx.events.on('log',value=>{state.logCopy=value;});
}};`);
const grant = (id, scope, decision = 'allow') => assert.equal(permissions.setOverride(id, scope, decision, { fingerprint: loader.hostEntry(id).fingerprint }), true);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) { const end = Date.now() + 2000; while (!predicate()) { assert.ok(Date.now() < end, 'fixture operation did not start'); await sleep(5); } }
try {
  await loader.loadAll();
  const user = contexts['sdk-user'];
  console.log('· Config binding: global/provider secrets hidden, domain owner keys retained');
  const model = contexts['memory-service'].capability('host.config').get();
  assert.equal(model.api.model, 'fixture-model'); assert.equal(model.api.hasApiKey, true);
  assert.doesNotMatch(JSON.stringify(model), /HOST_MODEL_KEY|HOST_PROVIDER_KEY|NESTED_KEY/);
  assert.deepEqual(Object.keys(model.providers[0]).sort(), ['baseURL', 'id', 'models', 'name']);
  assert.equal(contexts['web-tools'].capability('host.config').get().webSearch.apiKey, 'OWNER_WEB_KEY');
  assert.equal(contexts['web-tools'].capability('host.config').get().api, undefined);
  assert.equal(contexts['transport-onebot'].capability('host.config').get().onebot.accessToken, 'OWNER_TRANSPORT_TOKEN');
  assert.deepEqual(contexts['other-bundled'].capability('host.config').get(), {});
  assert.deepEqual(user.capability('host.config').get(), { own: 'own setting', apiKey: 'USER_KEY' });
  assert.throws(() => user.capability('host.config').update({ api: {} }), /宿主绑定/);
  assert.throws(() => contexts['memory-service'].capability('host.config').update({ webSearch: {} }), /宿主绑定/);
  const changed = contexts['memory-service'].capability('host.config').update({ memory: { enabled: false } });
  assert.equal(changed.memory.enabled, false); assert.doesNotMatch(JSON.stringify(changed), /HOST_MODEL_KEY|HOST_PROVIDER_KEY/);
  const environment = user.capability('host.environment'); assert.deepEqual(Object.keys(environment).sort(), ['profile', 'version']);
  assert.doesNotMatch(JSON.stringify(environment), new RegExp(root.replace(/[.*+?^${}()|[]\]/g, '\$&')));
  const exec = sdk.toolContext({ chatKey: 'group:89', cfg: config.get(), session: { raw: { apiKey: 'RAW_KEY' }, apiKey: 'SESSION_KEY', value: 2 } }, loader.hostEntry('sdk-user'));
  assert.deepEqual(exec.cfg, { own: 'own setting', hasApiKey: true }); assert.deepEqual(exec.session, { value: 2 });
  assert.equal(exec.registry, undefined); assert.equal(exec.loader, undefined); assert.equal(exec.cfg.api, undefined);
  assert.throws(() => user.capability('host.defaults'), /具名默认插件/);
  const injected = contexts.market.capability('host.defaults').communityMarket;
  assert.deepEqual(injected.listAccounts(), { accounts: [] }); assert.equal(injected.privateMutate, undefined); assert.equal(injected.getBlocklist, undefined);
  const communityClient = contexts.community.capability('host.defaults').communityMarket;
  const syncing = communityClient.syncGlobalBlocklist({ pushLocal: true }); const rejectedSync = assert.rejects(syncing, /插件实例已停止/);
  await loader.setEnabled('community', false); await rejectedSync;

  console.log('· Real repository reads: named bundled binding remains synchronous and narrow');
  const recent = contexts['query-tools'].capability('data.messages').recent('group:89', 1);
  assert.ok(Array.isArray(recent)); assert.equal(recent[0].text, 'stored fixture');
  assert.ok(Array.isArray(contexts['memory-tools'].capability('data.memory').query('group:89')));
  assert.equal(permissions.check('memory-tools', 'data.memory.read', { kind: 'bundled' }).decision, 'deny');
  assert.equal(permissions.check('sdk-user', 'data.memory.read', { hostBinding: true, notify: false }).decision, 'ask');
  assert.equal(permissions.check('memory-tools', 'net.raw', { kind: 'bundled', hostBinding: true }).decision, 'deny');
  assert.throws(() => contexts['other-bundled'].capability('data.memory').query('group:89'), /捆绑插件/);
  assert.throws(() => contexts['memory-tools'].capability('data.memory').clearChat('group:89'), /未声明|捆绑插件/);
  assert.equal(contexts['query-tools'].capability('data.messages').appendIncoming, undefined);

  console.log('· User approval uses decision=allow; one-use read is redacted and copied');
  const reading = user.capability('data.messages').recent('group:89', 1);
  await until(() => permissions.pending().some((item) => item.pluginId === 'sdk-user' && item.scope === 'data.sessions.read'));
  const request = permissions.pending().find((item) => item.pluginId === 'sdk-user');
  assert.equal(permissions.resolveAsk(request.id, 'once').ok, true);
  const data = await reading; assert.equal(data[0].text, 'stored fixture'); assert.equal(data[0].raw, undefined);
  assert.equal(data[0].localPath, '[REDACTED_PATH]'); data[0].text = 'changed copy'; assert.equal(store.findByMid('group:89', 89).text, 'stored fixture');
  grant('sdk-user', 'fs.outsideNamespace', 'deny');
  await assert.rejects(user.capability('data.messages').updateByMid('group:89', 89, { text: 'denied' }), /管理员关闭/);
  grant('sdk-user', 'fs.outsideNamespace');
  await user.capability('data.messages').updateByMid('group:89', 89, { text: 'allowed write' });
  assert.equal(store.findByMid('group:89', 89).text, 'allowed write');
  await assert.rejects(contexts.undeclared.capability('data.messages').recent('group:89', 1), /未声明/);

  console.log('· Public transport/read/send scopes cannot bypass declared permission');
  const beforeReads = readCalls;
  await assert.rejects(contexts.undeclared.capability('transport.actions').getForward(89), /未声明/);
  await assert.rejects(contexts.undeclared.capability('core.send').sendTextBatch('group:89', 'denied'), /未声明/);
  assert.equal(readCalls, beforeReads); assert.equal(sends, 0);
  grant('sdk-user', 'qq.send'); const sent = await user.capability('core.send').sendTextBatch('group:89', 'allowed');
  assert.equal(sent.ok, true); assert.equal(sent.apiKey, undefined); assert.equal(sends, 1);
  assert.equal(user.capability('transport.actions').call, undefined);
  grant('sdk-user', 'data.sessions.read'); const forward = await user.capability('transport.actions').getForward(89);
  assert.equal(forward.key, 'getForward'); assert.equal(forward.apiKey, undefined);

  console.log('· Actual memory-service traverses read/create/update/finish facets with a controlled model');
  config.update({ memory: { useChatModel: false, provider: 'fixture', model: 'dedicated-model' } });
  const result = await capabilities.consume('memory.consolidate', { chatKey: 'group:89' });
  assert.equal(result.members.length, 1); assert.equal(result.failures.length, 0); assert.equal(modelCalls.length, 1);
  assert.equal(modelCalls[0].overrides.provider, 'fixture'); assert.equal(modelCalls[0].overrides.model, 'dedicated-model');
  assert.equal(modelCalls[0].overrides.apiKey, ''); assert.equal(modelCalls[0].cfg.api.apiKey, undefined);
  const modelTrace = sessions.listSummaries().find((item) => item.activity === 'memory');
  assert.equal(modelTrace.status, 'done'); assert.equal(modelTrace.model, 'dedicated-model'); assert.equal(modelTrace.usage.totalTokens, 3);
  const completion = await contexts['memory-service'].capability('llm.client').complete({});
  assert.equal(completion._usedApi.apiKey, undefined);

  console.log('· Core capability inputs are narrow even with lifecycle metadata; LLM body/raw contracts survive');
  const cfg = config.get();
  capabilities.consume('message.owner-check', { chatKey: 'group:89', entries: [{ text: 'owner', raw: { token: 'RAW_SECRET' } }], cfg });
  assert.deepEqual(Object.keys(contexts.inputs['message.owner-check'].cfg).sort(), ['allow', 'deny', 'memberNotes', 'own', 'persona']);
  assert.equal(contexts.inputs['message.owner-check'].cfg.memberNotes[7], 'Fixture');
  assert.equal(contexts.inputs['message.owner-check'].cfg.api, undefined); assert.equal(contexts.inputs['message.owner-check'].entries[0].raw, undefined);
  capabilities.consume('media.download', { chatKey: 'group:89', entry: store.findByMid('group:89', 89), cfg });
  assert.deepEqual(Object.keys(contexts.inputs['media.download'].cfg).sort(), ['own', 'security', 'send', 'sticker']);
  const body = { model: 'fixture-model', messages: [{ role: 'user', content: 'fixture' }] };
  capabilities.consume('llm.request-params', { body, api: cfg.api, context: { api: cfg.api, cfg }, cfg });
  assert.equal(body.marker, 'safe-transform'); assert.equal(contexts.inputs['llm.request-params'].api.apiKey, undefined);
  assert.deepEqual(contexts.inputs['llm.request-params'].context.cfg, { own: 'provider-own' });
  contexts.inputs['llm.request-params'].body.marker = 'late mutation'; assert.equal(body.marker, 'safe-transform');
  let requestBody, requestHeaders;
  const modelResult = await chatCompletion({ cfg, messages: [{ role: 'user', content: 'fixture' }], capabilities, log,
    fetchFn: async (_url, options) => {
      requestBody = JSON.parse(options.body); requestHeaders = options.headers;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'original' }, finish_reason: 'stop' }], vendorFlag: 'raw JSON kept', usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    },
  });
  assert.equal(requestBody.marker, 'safe-transform'); assert.equal(requestHeaders.authorization, 'Bearer HOST_MODEL_KEY');
  assert.equal(modelResult.message.content, 'safe-response'); assert.equal(modelResult._usedApi.apiKey, 'HOST_MODEL_KEY');
  assert.equal(contexts.inputs['llm.response'].result.raw.vendorFlag, 'raw JSON kept');
  assert.equal(contexts.inputs['llm.response'].result._usedApi.apiKey, undefined); assert.equal(contexts.inputs['llm.response'].api.apiKey, undefined);
  assert.equal(contexts.inputs['llm.usage'].result._usedApi.apiKey, undefined);
  capabilities.consume('llm.retry-advisor', { body, api: cfg.api, context: { api: cfg.api }, requestHeaders: { authorization: 'HEADER_SECRET' } });
  assert.equal(contexts.inputs['llm.retry-advisor'].api.apiKey, undefined); assert.equal(contexts.inputs['llm.retry-advisor'].requestHeaders, undefined);
  for (const name of ['reply.inline-calls', 'reply.local-policy', 'reply.grounded-select']) {
    capabilities.consume(name, { response: modelResult, session: { apiKey: 'SESSION_SECRET', state: 'running' } });
    assert.equal(contexts.inputs[name].response._usedApi.apiKey, undefined); assert.equal(contexts.inputs[name].response.raw.vendorFlag, 'raw JSON kept');
    assert.deepEqual(contexts.inputs[name].session, { state: 'running' });
  }
  const guardedArgs = { value: 'original', apiKey: 'ARG_SECRET' };
  capabilities.consume('tool.guard', 'fixture', guardedArgs); assert.equal(guardedArgs.value, 'original'); assert.equal(contexts.inputs.guard.args.apiKey, undefined);
  const customContract = { apiKey: 'extension-owned', method() { return 42; } };
  assert.equal(capabilities.consume('custom.contract', customContract), customContract);

  console.log('· Event copies and callback DTOs cannot retain host secrets or mutate source objects');
  const event = { text: 'original event', apiKey: 'EVENT_SECRET', raw: { token: 'RAW_SECRET' } };
  bus.emit('message.in', event); assert.equal(event.text, 'original event'); assert.equal(contexts.eventCopy.apiKey, undefined); assert.equal(contexts.eventCopy.raw, undefined);
  bus.emit('log', 'literal log message'); assert.equal(contexts.logCopy, 'literal log message');
  const callbackAbort = new AbortController();
  const callbackInput = { chatKey: 'group:89', cfg, api: cfg.api, session: { apiKey: 'SESSION_SECRET', finishReason: null }, signal: callbackAbort.signal,
    messages: [{ role: 'user', content: 'original' }], triggerEntries: [{ text: 'original', raw: { token: 'RAW_SECRET' } }], response: modelResult,
    context: { cfg, api: cfg.api, apiKey: 'CONTEXT_SECRET' }, args: { value: 'original' } };
  const callback = sdk.callbackContext(callbackInput, loader.hostEntry('query-tools'), 'before-context');
  assert.deepEqual(callback.cfg, {}); assert.equal(callback.api, undefined); assert.equal(callback.response._usedApi.apiKey, undefined);
  assert.equal(callback.response.raw.vendorFlag, 'raw JSON kept'); assert.deepEqual(callback.context.cfg, {});
  callback.messages[0].content = 'changed'; callback.triggerEntries[0].text = 'changed'; callback.session.finishReason = 'changed';
  assert.equal(callbackInput.messages[0].content, 'original'); assert.equal(callbackInput.triggerEntries[0].text, 'original'); assert.equal(callbackInput.session.finishReason, null);
  callbackAbort.abort(new Error('callback finished')); assert.throws(() => callback.store.recent('group:89', 1), /callback finished/);

  console.log('· Known business capabilities expose scopes and metadata, never foreign MCP or transport controls');
  await assert.rejects(contexts.undeclared.capability('qq.emoji-favorites').addCustomFace('fixture'), /未声明/); assert.equal(emojiWrites, 0);
  const foreignMcp = user.capability('mcp.tools'); assert.deepEqual(await foreignMcp.list(), ['fixture']);
  for (const method of ['start', 'connect', 'stop', 'stopServer', 'registerTool']) assert.equal(foreignMcp[method], undefined);
  assert.equal(mcpControls, 0);
  const dynamicSdk = createSdkAccess({ config, permissions, bus, loaderOf: () => loader, resolveProvider: (name) => capabilities.consume(name) });
  const dynamic = (name) => dynamicSdk.capabilityAccess(name, facets[name], { entry: loader.hostEntry('sdk-user') });
  grant('sdk-user', 'net.outbound');
  capabilities.register('qq.emoji-favorites', 'kernel', { fetchCustomFaces: () => ['generation-a'] });
  const favoriteFacade = dynamic('qq.emoji-favorites'); assert.deepEqual(await favoriteFacade.fetchCustomFaces(), ['generation-a']);
  capabilities.register('qq.emoji-favorites', 'kernel', { fetchCustomFaces: () => ['generation-b'] });
  assert.deepEqual(await favoriteFacade.fetchCustomFaces(), ['generation-b']);
  capabilities.unregister('qq.emoji-favorites', 'kernel'); await assert.rejects(favoriteFacade.fetchCustomFaces(), /尚未就绪/);
  capabilities.register('mcp.tools', 'kernel', { list: () => ['generation-a'] });
  const mcpFacade = dynamic('mcp.tools'); assert.deepEqual(await mcpFacade.list(), ['generation-a']);
  capabilities.register('mcp.tools', 'kernel', { list: () => ['generation-b'] }); assert.deepEqual(await mcpFacade.list(), ['generation-b']);
  capabilities.unregister('mcp.tools', 'kernel'); await assert.rejects(mcpFacade.list(), /尚未就绪/);
  const transportDescriptor = { id: 'fixture-transport', segmentSupport: { image: true }, create() { throw new Error('must not leak'); }, actions: { secret() {} }, processes: { pid: 42 } };
  capabilities.register('transport.provider', 'kernel', transportDescriptor, { lifecycle: true });
  const metadata = user.capability('transport.provider'); assert.deepEqual(Object.keys(metadata).sort(), ['id', 'segmentSupport']);
  metadata.segmentSupport.image = false; assert.equal(transportDescriptor.segmentSupport.image, true);
  assert.deepEqual(await user.capability('extensions.state').videoFrames(), { enabled: false, frames: 5 });

  console.log('· User in-flight operations abort on revoke and suppress stale results');
  grant('sdk-user', 'net.outbound'); let receivedSignal;
  mediaOperation = (_media, options) => { receivedSignal = options.signal; return new Promise(() => {}); };
  const fetching = user.capability('media.reader').image({ url: 'https://image.fixture' }); const rejected = assert.rejects(fetching, /授权已失效/);
  await until(() => receivedSignal); grant('sdk-user', 'net.outbound', 'deny'); await rejected; assert.equal(receivedSignal.aborted, true);
  mediaOperation = null;
  grant('sdk-user', 'net.outbound'); grant('sdk-user', 'fs.outsideNamespace', 'deny');
  await assert.rejects(user.capability('media.reader').image({ localFile: path.join(root, 'private.png') }), /管理员关闭/);

  console.log('· MCP start stays synchronous for defaults; only own connection handles are exposed/cleaned');
  const bridge = contexts['mcp-bridge'], adapter = bridge.capability('process.mcp');
  const connection = adapter.startServer({ command: 'fixture' }); assert.equal(typeof connection.then, 'undefined');
  assert.deepEqual(Object.keys(connection).sort(), ['notify', 'request', 'stop']); assert.equal(connection.child, undefined);
  bridge.lifecycle.onStop(() => adapter.stopAll());
  const pending = connection.request('fixture', {}); const rejectedChild = assert.rejects(pending, /MCP 连接已停止/);
  await loader.setEnabled('mcp-bridge', false); await rejectedChild; assert.equal(connections[0].stopped, 1);
  adapter.stopAll(); assert.equal(connections[0].stopped, 1);
  await loader.setEnabled('mcp-bridge', true);
  const newAdapter = contexts['mcp-bridge'].capability('process.mcp'), newConnection = newAdapter.startServer({ command: 'fixture' });
  adapter.stopAll(); assert.equal(connections[1].stopped, 0); newConnection.stop(); assert.equal(connections[1].stopped, 1);
  grant('sdk-user', 'proc.exec'); grant('sdk-user', 'mcp.connect');
  const userConnection = await user.capability('process.mcp').startServer({ command: 'fixture' }); assert.equal(userConnection.child, undefined);
  const userPending = userConnection.request('fixture', {}); const rejectedUserChild = assert.rejects(userPending, /MCP 连接已停止/);
  grant('sdk-user', 'proc.exec', 'deny'); await rejectedUserChild; assert.equal(connections[2].stopped, 1);

  console.log('· Actual configured MCP waits for service activation, discovers tools, and cleans its controlled child');
  await configuredMcpLifecycle();

  console.log('· Default facets reject stale generations; cleanup still works after suspension');
  const reminders = contexts.reminders, runtime = reminders.capability('runtime.reminders');
  runtime.start(); reminders.lifecycle.onStop(() => runtime.stop()); await loader.setEnabled('reminders', false); assert.equal(runtimeStops, 1);
  const oldQuery = contexts['query-tools'].capability('data.messages');
  await loader.loadDir('bundled', path.join(root, 'bundled', 'query-tools'), { hot: true });
  assert.throws(() => oldQuery.recent('group:89', 1), /失效/);
  const stoppedUser = user.capability('data.messages'); await loader.setEnabled('sdk-user', false);
  assert.throws(() => stoppedUser.recent('group:89', 1), /失效/);
  permissions.close(); assert.throws(() => contexts['memory-tools'].capability('data.memory').query('group:89'), /权限服务已关闭/);
  console.log('✓ 89-sdk-host-access: real SDK host boundaries passed');
} finally {
  loader.stopAll(); scheduler.stop(); sessions.stop(); permissions.close(); delete globalThis[stateKey];
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true });
}

// 50 真 loader + 宿主权限 + HTTP 代理；不用伪造 manifest DTO 来遮蔽接线问题。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mktmp, section } from './helpers.mjs';
import { createPanelAdapters, registerPanelRoutes } from '../src/console/panel-adapters.js';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createPluginLoader } from '../src/kernel/plugin-loader.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createStorage } from '../src/kernel/storage.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { Bus } from '../src/kernel/bus.js';
const root = mktmp('qqa-panel-real-'), dataDir = mktmp('qqa-panel-data-');
const log = { error() {}, warn() {}, info() {}, child() { return this; } };
for (const name of ['bundled', 'plugins', 'skills', 'ui']) fs.mkdirSync(path.join(root, name));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
fs.mkdirSync(path.join(root, 'ui', 'shell')); fs.mkdirSync(path.join(root, 'ui', 'panels'));
fs.writeFileSync(path.join(root, 'ui', 'shell', 'index.html'), '<h1>shell</h1>');
fs.mkdirSync(path.join(root, 'ui', 'panels', 'sessions'));
fs.writeFileSync(path.join(root, 'ui', 'panels', 'sessions', 'index.html'), '<h1>sessions</h1>');
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log }); config.load();
config.update({ server: { port: 0, token: 'panel-host-test' } });
const bus = new Bus(log), permissions = createPermissions({ dataDir, log, bus });
const caps = createCapabilityRegistry({ log }), registry = createToolRegistry({ log, bus, permissions, capabilities: caps });
const scheduler = createScheduler({ log }), storage = createStorage({ dataDir, log });
const loader = createPluginLoader({ log, bus, appRoot: root, registry, capabilityRegistry: caps, permissions, scheduler, storage, config });
function fixture(id) {
  const dir = path.join(root, 'plugins', id); fs.mkdirSync(dir); fs.mkdirSync(path.join(dir, 'ui'));
  fs.writeFileSync(path.join(dir, 'ui', 'index.html'), `<p>${id} ui</p>`);
  fs.writeFileSync(path.join(dir, 'ui', 'style.css'), 'p{color:red}');
  fs.writeFileSync(path.join(dir, 'private.json'), '{"password":"secret-fixture"}');
  fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({
    id, kind: 'plugin', permissions: ['ui.panel', 'net.outbound'],
    panels: [{ id: `${id}_panel`, title: id, entry: 'index.html', permissions: ['ui.panel'], api: [] }],
    configSchema: { visible: { type: 'string' }, nested: { type: 'object', properties: { customField: { secret: true } } }, credential: { secret: true } },
    settings: { visible: 'value', hidden: 'not-schema', credential: 'do-not-return', nested: { apiKey: 'nested-secret', customField: 'custom-nested-secret', public: 'ok' } },
  }));
  fs.writeFileSync(path.join(dir, 'index.js'), `export default {setup(ctx){
    ctx.registerTool({id:'echo',name:'Echo',params:{type:'object',properties:{text:{type:'string',maxLength:10}},required:['text'],additionalProperties:false},execute:args=>({text:args.text,owner:ctx.id})});
    ctx.registerTool({id:'network',name:'Network',scopes:['net.outbound'],execute:()=>({ok:true})});
  }};`);
  return dir;
}
const aDir = fixture('alpha'); fixture('beta');
await loader.loadAll();
const adapters = createPanelAdapters({ loader, permissions, registry, config, log,
  bundledManifest: { panels: [{ id: 'sessions', title: '会话', permissions: [], api: [] }] },
});
const http = createHttpServer({ config, log, staticDir: path.join(root, 'ui', 'shell'), panelAssetResolver: (url) => adapters.resolveAsset(url) });
registerPanelRoutes(http, adapters);
const port = await http.listen(), base = `http://127.0.0.1:${port}`;
async function request(method, url, body, token = 'panel-host-test') {
  const res = await fetch(base + url, { method, headers: { 'x-console-token': token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, text: await res.text(), headers: res.headers };
}
try {
  section('真实聚合与宿主授权');
  assert.equal(adapters.listPanels().length, 1, '未授权用户面板不能出现');
  const grant = adapters.authorization('alpha');
  assert.match(grant.fingerprint, /^[a-f0-9]{64}$/);
  assert.throws(() => adapters.setAuthorization('alpha', { fingerprint: grant.fingerprint, scope: 'ui.panel', value: 'allow' }), /显式确认/);
  assert.throws(() => adapters.setAuthorization('alpha', { fingerprint: '0'.repeat(64), scope: 'ui.panel', value: 'allow', confirm: true }), /版本/);
  assert.throws(() => adapters.setAuthorization('alpha', { fingerprint: grant.fingerprint, scope: 'proc.exec', value: 'allow', confirm: true }), /未声明/);
  let res = await request('POST', '/api/plugins/alpha/permissions', { fingerprint: grant.fingerprint, scope: 'ui.panel', value: 'allow', confirm: true });
  assert.equal(res.status, 200);
  const panel = adapters.listPanels().find((p) => p.id === 'alpha_panel');
  assert.equal(panel.ownerId, 'alpha'); assert.match(panel.generation, /^[a-f0-9-]{36}$/);
  assert.equal(adapters.listPanels().length, 2);
  res = await request('GET', '/api/panels', undefined, ''); assert.equal(res.status, 401);
  res = await request('GET', '/api/panels'); assert.equal(JSON.parse(res.text).panels.length, 2);

  section('dedicated ui 资产，不暴露源码、清单或未授权插件');
  const url = `/panels/u/${panel.id}/${panel.generation}/`;
  res = await request('GET', `${url}index.html`); assert.equal(res.status, 200); assert.ok(res.text.includes('alpha ui'));
  assert.ok(res.headers.get('content-security-policy').includes("frame-ancestors 'self'"));
  res = await request('GET', `${url}style.css`); assert.equal(res.status, 200);
  for (const suffix of ['../index.js', '%2e%2e%2findex.js', 'private.json', 'skill.json', '..%5cprivate.json', '.hidden.js']) {
    res = await request('GET', `${url}${suffix}`); assert.equal(res.status, 404, suffix); assert.ok(!res.text.includes('secret-fixture'));
  }
  res = await request('GET', '/panels/u/alpha/index.js'); assert.equal(res.status, 404);
  res = await request('GET', '/panels/u/beta_panel/00000000-0000-0000-0000-000000000000/index.html'); assert.equal(res.status, 404);
  res = await request('GET', '/panels/sessions/index.html'); assert.equal(res.status, 200);
  // 符号链接若平台允许创建，不能逃出ui；拒绝建链权限时不伪称验过。
  const link = path.join(aDir, 'ui', 'leak.js');
  let linked = false;
  try { fs.symlinkSync(path.join(aDir, 'index.js'), link); linked = true; } catch { console.log('· 当前环境不允许 symlink，明确跳过建链用例'); }
  if (linked) { res = await request('GET', `${url}leak.js`); assert.equal(res.status, 404); fs.unlinkSync(link); }

  section('自身工具调用与参数/owner/权限校验');
  const call = (tool, args, generation = panel.generation) => request('POST', '/api/panels/alpha_panel/call', { tool, args, generation });
  res = await call('alpha__echo', { text: 'hello' }); assert.equal(res.status, 200); assert.deepEqual(JSON.parse(res.text).result, { text: 'hello', owner: 'alpha' });
  res = await call('beta__echo', { text: 'no' }); assert.equal(res.status, 403);
  res = await call('alpha__echo', { text: 5 }); assert.equal(res.status, 400);
  res = await call('alpha__echo', {}); assert.equal(res.status, 400);
  res = await call('alpha__echo', { text: '12345678901' }); assert.equal(res.status, 400);
  res = await call('alpha__echo', { text: 'x', ownerId: 'beta' }); assert.equal(res.status, 400);
  config.update({ tools: { enabled: false } }); res = await call('alpha__echo', { text: 'x' }); assert.equal(res.status, 409);
  config.update({ tools: { enabled: true } });
  permissions.setOverride('alpha', 'net.outbound', 'deny', { fingerprint: grant.fingerprint });
  res = await call('alpha__network', {}); assert.equal(res.status, 400); assert.ok(res.text.includes('权限'));

  section('配置仅自身schema且脱敏；不传 token 到 iframe');
  res = await request('POST', '/api/panels/alpha_panel/config', { generation: panel.generation });
  assert.equal(res.status, 200);
  const publicCfg = JSON.parse(res.text);
  assert.equal(publicCfg.visible, 'value'); assert.equal(publicCfg.hasCredential, true); assert.equal(publicCfg.hidden, undefined);
  assert.equal(publicCfg.nested.public, 'ok'); assert.equal(publicCfg.nested.apiKey, undefined);
  assert.equal(publicCfg.nested.customField, undefined); assert.equal(publicCfg.nested.hasCustomField, true);
  assert.ok(!res.text.includes('do-not-return') && !res.text.includes('nested-secret') && !res.text.includes('panel-host-test'));
  res = await request('POST', '/api/panels/alpha_panel/config', { generation: panel.generation, key: 'hidden' }); assert.equal(res.status, 403);

  section('异步before-tool等待时撤销网络授权，最终副作用不执行');
  permissions.setOverride('alpha','net.outbound','allow',{fingerprint:grant.fingerprint});
  let releaseHook, hookStarted, hookExecuted=0;
  const enteredHook=new Promise(resolve=>{hookStarted=resolve;});
  const hook=async()=>{hookStarted();await new Promise(resolve=>{releaseHook=resolve;});return null;};
  loader.hostEntry('alpha').hooks['before-tool']=[hook];
  registry.get('alpha__network').execute=()=>{hookExecuted++;return 'ran';};
  const hookCall=call('alpha__network',{});await enteredHook;
  permissions.setOverride('alpha','net.outbound','deny',{fingerprint:grant.fingerprint});
  releaseHook();res=await hookCall;assert.notEqual(res.status,200);assert.equal(hookExecuted,0);
  loader.hostEntry('alpha').hooks['before-tool']=[];

  section('授权等待过程中禁用，不能执行已失效工具');
  permissions.setOverride('alpha', 'net.outbound', 'ask', { fingerprint: grant.fingerprint });
  let executed = 0;
  registry.get('alpha__network').execute = () => { executed++; return 'ran'; };
  const pendingCall = call('alpha__network', {});
  for(let i=0;i<100&&!permissions.pending().length;i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.ok(permissions.pending().length,'权限请求应已建立');
  await loader.setEnabled('alpha', false);
  res = await pendingCall; assert.notEqual(res.status, 200); assert.equal(executed, 0);
  assert.equal(adapters.listPanels().some((p) => p.id === panel.id), false);
  res = await request('GET', `${url}index.html`); assert.equal(res.status, 404);

  section('重新启用/热重载使旧代际立即失效');
  await loader.setEnabled('alpha', true);
  const next = adapters.listPanels().find((p) => p.id === panel.id);
  assert.ok(next && next.generation !== panel.generation);
  res = await call('alpha__echo', { text: 'x' }, panel.generation); assert.equal(res.status, 403);
  res = await call('alpha__echo', { text: 'x' }, next.generation); assert.equal(res.status, 200);
  await loader.loadDir('plugins', aDir);
  const reload = adapters.listPanels().find((p) => p.id === panel.id);
  assert.notEqual(reload.generation, next.generation);
  res = await call('alpha__echo', { text: 'x' }, next.generation); assert.equal(res.status, 403);

  section('撤销ui授权/代码更新/卸载都关闭资源与代理');
  permissions.setOverride('alpha', 'ui.panel', 'deny', { fingerprint: grant.fingerprint });
  res = await call('alpha__echo', { text: 'x' }, reload.generation); assert.equal(res.status, 403);
  permissions.setOverride('alpha', 'ui.panel', 'allow', { fingerprint: grant.fingerprint });
  fs.appendFileSync(path.join(aDir, 'index.js'), '\n// updated without version change');
  res = await call('alpha__echo', { text: 'x' }, reload.generation); assert.equal(res.status, 403);
  res = await request('GET', `${url}index.html`); assert.equal(res.status, 404);
  loader.unload('alpha', 'test-uninstall'); assert.equal(adapters.listPanels().some((p) => p.id === panel.id), false);
  console.log('✓ 50-panel-runtime：真实loader/宿主授权/资产/owner/配置/等待竞态/重载/撤销全部通过');
} finally { loader.stopAll(); permissions.close(); scheduler.stop(); await http.close(); }

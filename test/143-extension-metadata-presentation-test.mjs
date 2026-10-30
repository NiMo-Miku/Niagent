// Real temporary loader → HTTP metadata, then the shared renderer and both panels.
// Synthetic settings only; browser layout remains a separate headed check.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createPluginLoader } from '../src/kernel/plugin-loader.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createStorage } from '../src/kernel/storage.js';

async function realLoaderDtos() {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-metadata-http-'));
  const dataDir = path.join(appRoot, 'synthetic-data');
  const log = { info() {}, warn() {}, error() {}, child() { return this; }, recent: () => [] };
  const extensions = ['plugin', 'skill'].map(kind => ({ kind, id: `qa-http-${kind}`, root: `${kind}s`, dir: path.join(appRoot, `${kind}s`, `qa-http-${kind}`), description: `真实 DTO ${kind} 合成说明` }));
  for (const root of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, root));
  fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
  for (const extension of extensions) {
    fs.mkdirSync(extension.dir);
    fs.writeFileSync(path.join(extension.dir, `${extension.kind}.json`), JSON.stringify({ id: extension.id, kind: extension.kind, name: `HTTP ${extension.kind}`, version: '1.0.0', description: extension.description, entry: 'index.js', permissions: [], configSchema: { apiKey: { type: 'string', secret: true }, count: { type: 'integer' } } }));
    fs.writeFileSync(path.join(extension.dir, 'index.js'), 'export default { setup() {} };');
  }
  const config = createConfig({ dataDir, defaults: buildDefaultConfig({ personaText: '' }), log });
  config.load();
  config.update({ server: { port: 0, token: 'qa-only-metadata-console' }, skills: Object.fromEntries(extensions.map(extension => [extension.id, { enabled: false, settings: { apiKey: `QA_ONLY_HTTP_KEY_${extension.kind}`, count: 4, unlistedSecret: 'QA_ONLY_UNLISTED' } }])) });
  const capability = createCapabilityRegistry({ log }), permissions = createPermissions({ log, dataDir, headless: true });
  const registry = createToolRegistry({ log, permissions, capabilities: capability }), scheduler = createScheduler({ log });
  const loader = createPluginLoader({ appRoot, config, log, registry, capabilityRegistry: capability, permissions, scheduler, storage: createStorage({ dataDir, log }) });
  const http = createHttpServer({ config, log, staticDir: appRoot });
  registerConsoleRoutes(http, { config, loader, permissions, registry, capability, log, dataDir, appRoot, sessions: {}, store: {}, onebot: {} });
  try {
    await loader.loadAll();
    const port = await http.listen();
    async function request(method, endpoint, payload) {
      const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, { method, headers: { 'x-console-token': 'qa-only-metadata-console', 'content-type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
      assert.equal(response.status, 200, `${method} ${endpoint} succeeds in the synthetic server`);
      return response.json();
    }
    function assertMetadata(data, active) {
      assert.equal(data.skills.length, 2, 'both kind values survive the real list route');
      for (const expected of extensions) {
        const raw = loader.listEntries().find(item => item.id === expected.id);
        assert.equal(raw.dir, expected.dir, 'loader DTO points to the actual extension directory');
        assert.equal(fs.statSync(raw.dir).isDirectory(), true);
        const item = data.skills.find(item => item.id === expected.id);
        assert.equal(item.dir, expected.dir, 'HTTP preserves the actual directory');
        assert.equal(item.description, expected.description);
        assert.equal(item.kind, expected.kind);
        assert.equal(item.root, expected.root);
        assert.equal(item.loaded, active);
        assert.equal(item.enabled, active);
        assert.deepEqual(item.settings, { apiKey: '******', count: 4 }, 'metadata does not bypass the existing schema-scoped secret masking');
      }
      assert.ok(!JSON.stringify(data).includes('QA_ONLY_HTTP_KEY_'), 'synthetic raw API keys are absent from the whole response');
      assert.ok(!JSON.stringify(data).includes('QA_ONLY_UNLISTED'), 'undeclared settings stay absent');
    }
    assertMetadata(await request('GET', '/api/skills'), false);
    await request('POST', '/api/skills/reload', {});
    assertMetadata(await request('GET', '/api/skills'), false);
    for (const extension of extensions) await request('POST', `/api/skills/${extension.id}`, { enabled: true });
    assertMetadata(await request('GET', '/api/skills'), true);
    await request('POST', '/api/skills/reload', {});
    const current = await request('GET', '/api/skills'); assertMetadata(current, true);
    console.log('143 real loader/HTTP: both directories and descriptions stable across rescan and activation; settings remain masked');
    return current.skills;
  } finally {
    await http.close(); await loader.stopAll(); scheduler.stop(); permissions.close();
    assert.equal(path.dirname(path.resolve(appRoot)), path.resolve(os.tmpdir()), 'cleanup target is the owned temporary fixture');
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
}

const {modelUiFixture}=await import('./model-ui-fixture.mjs');
const realDtos=await realLoaderDtos(),f=await modelUiFixture();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async check=>{for(let i=0;i<300;i++){if(await check())return;await pause(20);}throw Error('143 UI did not settle');};
let fixtureItems=[],reads=0,currentKind=null;
const dto={id:'qa-metadata',name:'合成测试插件',kind:'plugin',description:'可搜索的合成说明',version:'1.2.3',loaded:true,enabled:true,available:true,code:'active',root:'plugins',dir:'C:\\QA 合成副本\\plugins\\qa-metadata',fingerprint:'qa-only'};
async function render(items,kind='plugin'){
  fixtureItems=items;const previous=reads;
  if(currentKind!==kind){currentKind=kind;await f.page.locator('#nav button[data-panel='+ (kind==='plugin'?'plugins':'skills')+']').click();}
  else f.kernel.bus.emit('status',{metadata143:true});
  await until(()=>reads>previous);
  const ids=items.filter(item=>item.kind===kind).map(item=>item.id);
  await until(async()=>JSON.stringify(await f.frame.locator('#list [data-extension-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.extensionId).sort()))===JSON.stringify(ids.sort()));await pause(100);
}
const card=id=>f.frame.locator('[data-extension-id="'+id+'"]');
try{
  await f.page.route('**/api/skills',route=>{reads++;return route.fulfill({json:{skills:fixtureItems}});});
  await f.page.route('**/api/skills/capabilities',route=>route.fulfill({json:{capabilities:[]}}));
  await f.page.route('**/api/skills/reload',route=>route.fulfill({json:{ok:true}}));
  for(const kind of ['plugin','skill']){
    await render(realDtos.filter(item=>item.kind===kind),kind);const expected=realDtos.find(item=>item.kind===kind);
    assert.equal(await card(expected.id).locator('.extension-id').innerText(),expected.id);assert.equal(await card(expected.id).locator('.extension-root-path').textContent(),expected.dir);assert.equal(await card(expected.id).locator('.extension-root-path').evaluate(n=>n.localName),'code');
  }
  await render([dto,{...dto,id:'qa-other-kind',kind:'skill'}]);await card(dto.id).locator('details > summary').click();
  const handle=await card(dto.id).elementHandle(),pathHandle=await card(dto.id).locator('details').elementHandle();
  f.kernel.bus.emit('status',{metadata143:true});await pause(300);assert.equal(await handle.evaluate(n=>n.isConnected),true);assert.equal(await pathHandle.evaluate(n=>n.open),true);
  assert.match(await card(dto.id).innerText(),/已加载.*启用.*可用：是.*用户安装.*1\.2\.3/);
  await f.frame.locator('#search').fill('合成说明');assert.equal(await f.frame.locator('#list .list-item').count(),1);await f.frame.locator('#search').fill('');
  await render([{...dto,root:'bundled'}]);assert.equal(await card(dto.id).getByRole('button',{name:'卸载',exact:true,includeHidden:true}).count(),0,'a source change to a default entry removes the previous uninstall control');
  await render([dto]);assert.equal(await card(dto.id).getByRole('button',{name:'卸载',exact:true,includeHidden:true}).count(),1,'returning to an installed source restores one uninstall control');
  const broken={...dto,id:'qa-broken',loaded:false,available:false,code:'error',reason:'Error: 启动失败 apiKey="QA_ONLY secret with spaces" Bearer QA_ONLY_BEARER https://qa-user:QA_ONLY_PASSWORD@fixture.invalid/ | at setup (private-stack.js:4:2)\n at run (private-next.js:1:2)',lastError:'运行失败 token=QA_ONLY_TOKEN',lastErrorAt:1791947677706};
  await render([broken]);const brokenText=await card(broken.id).innerText();assert.match(brokenText,/加载失败：Error: 启动失败/);assert.match(brokenText,/最近运行错误 · .*运行失败 token=\[已隐藏\]/);
  for(const leaked of ['QA_ONLY secret','QA_ONLY_BEARER','QA_ONLY_PASSWORD','QA_ONLY_TOKEN','private-stack','private-next'])assert.ok(!brokenText.includes(leaked),leaked);
  await render([{...broken,reason:'授权失败 Authorization: Basic QA_ONLY_BASIC',lastError:'请求失败 Cookie: session=QA_ONLY_SESSION; other=QA_ONLY_COOKIE'}]);
  for(const leaked of ['QA_ONLY_BASIC','QA_ONLY_SESSION','QA_ONLY_COOKIE'])assert.ok(!(await card(broken.id).innerText()).includes(leaked),leaked);
  const fallback={...dto,id:'qa-unmet',code:'unmet',loaded:false,available:false,requires:['fixture.missing']},disabled={...dto,id:'qa-disabled',code:'disabled',loaded:false,enabled:false,dir:null,root:null},runtimeOnly={...dto,id:'qa-runtime',lastError:'合成回调失败',lastErrorAt:null};
  await render([fallback,disabled,runtimeOnly]);assert.match(await card(fallback.id).innerText(),/依赖未就绪：检查所需能力 fixture\.missing/);
  assert.match(await card(disabled.id).innerText(),/扩展已停用/);assert.match(await card(disabled.id).locator('.extension-root-path').textContent(),/暂未提供安装路径/);assert.match(await card(disabled.id).innerText(),/来源未提供/);assert.equal(await card(disabled.id).locator('.error').count(),0);
  assert.match(await card(runtimeOnly.id).innerText(),/最近运行错误：合成回调失败/);assert.doesNotMatch(await card(runtimeOnly.id).innerText(),/1970/);
  await render([{...dto,reason:'新版本 setup 失败：合成更新失败'}]);assert.match(await card(dto.id).innerText(),/加载说明：新版本 setup 失败/);assert.match(await card(dto.id).innerText(),/加载：已加载/);
  for(const kind of ['plugin','skill']){
    await render([{...runtimeOnly,kind},{...disabled,kind},{...broken,kind:kind==='plugin'?'skill':'plugin'}],kind);assert.match(await f.frame.locator('#meta').innerText(),/2 .*已加载 1 · 错误 1/);
    await f.frame.locator('#search').fill('qa-runtime');await f.frame.locator('#reload').click();await pause(200);assert.equal(await f.frame.locator('#search').inputValue(),'qa-runtime');assert.equal(await f.frame.locator('#list .list-item').count(),1);await f.frame.locator('#search').fill('');
    await render([{...dto,kind}],kind);assert.match(await f.frame.locator('#meta').innerText(),/1 .*已加载 1 · 错误 0/);
  }
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);
  console.log('✓ 143 real loader/HTTP plus browser metadata, stable paths/cards, safe diagnostics, filters and both panel counters passed');
}finally{await f.close();}

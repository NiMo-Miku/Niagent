// 53 真实 Chromium iframe→RpcBridge→宿主 API→registry/config，全部临时插件，不接 QQ。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mktmp } from './helpers.mjs';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createPluginLoader } from '../src/kernel/plugin-loader.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createStorage } from '../src/kernel/storage.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createHttpServer } from '../src/kernel/http.js';
import { createPanelAdapters, registerPanelRoutes } from '../src/console/panel-adapters.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { createSseBridge } from '../src/console/sse-bridge.js';
import { Bus } from '../src/kernel/bus.js';
let playwright;
for (const name of ['playwright', 'playwright-core']) {
  try { playwright = createRequire(import.meta.url)(name); console.log(`· 53 使用本地 ${name}`); break; }
  catch { /* 只探测已有模块，不安装依赖。 */ }
}
if (!playwright) { console.log('· 53 未配置 Playwright，明确跳过真实浏览器（50/52宿主行为测试仍需通过）'); process.exit(0); }

function chromiumExecutable() {
  const configured = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (configured) { assert.ok(fs.existsSync(configured), `配置的 Chromium 不存在：${configured}`); return configured; }
  const cacheRoots = [
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'),
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
  ];
  for (const cache of cacheRoots) {
    let versions;
    try { versions = fs.readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9))); }
    catch { continue; }
    for (const version of versions) {
      for (const relative of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const candidate = path.join(cache, version, relative);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  const bundled = playwright.chromium.executablePath();
  assert.ok(fs.existsSync(bundled), '未发现已安装的 Chromium；请设置 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH（测试不会下载浏览器）');
  return bundled;
}
const executablePath = chromiumExecutable();
const appRoot = path.resolve(import.meta.dirname, '..');
const root = mktmp('qqa-ui-browser-root-'), dataDir = mktmp('qqa-ui-browser-data-');
for (const dir of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(root, dir));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
const plugin = path.join(root, 'plugins', 'demo'); fs.mkdirSync(plugin); fs.mkdirSync(path.join(plugin, 'ui'));
fs.writeFileSync(path.join(plugin, 'skill.json'), JSON.stringify({
  id: 'demo', kind: 'plugin', permissions: ['ui.panel'], configSchema: { label: { type: 'string' }, credential: { secret: true } },
  settings: { label: 'browser-config', credential: 'DO-NOT-LEAK' },
  panels: [{ id: 'demo_panel', title: 'Demo', entry: 'index.html', permissions: ['ui.panel'], api: [] }],
}));
fs.writeFileSync(path.join(plugin, 'index.js'), `export default {setup(ctx){ctx.registerTool({id:'echo',name:'Echo',params:{type:'object',properties:{text:{type:'string'}},required:['text']},execute:args=>({text:args.text})});}};`);
fs.writeFileSync(path.join(plugin, 'ui', 'index.html'), '<!doctype html><meta charset="utf-8"><h1>Demo panel</h1><button id="call">Call</button><button id="config">Config</button><button id="cross">Cross owner</button><button id="api">Raw API</button><pre id="result"></pre><script type="module" src="panel.js"></script>');
fs.writeFileSync(path.join(plugin, 'ui', 'panel.js'), `import {ctx,request} from '/panels/panel-client.js';const out=document.querySelector('#result');const run=async fn=>{try{out.textContent=JSON.stringify(await fn())}catch(e){out.textContent='ERROR '+e.message}};document.querySelector('#call').onclick=()=>run(()=>ctx.call('demo__echo',{text:'browser-call'}));document.querySelector('#config').onclick=()=>run(()=>ctx.getConfig());document.querySelector('#cross').onclick=()=>run(()=>ctx.call('foreign__echo',{}));document.querySelector('#api').onclick=()=>run(()=>request('GET','/api/config'));`);
const log = { info() {}, warn() {}, error() {}, child() { return this; } };
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log }); config.load();
config.update({ server: { port: 0, token: 'browser-host-token' } });
const bus = new Bus(log), permissions = createPermissions({ dataDir, log, bus, headless: true });
const caps = createCapabilityRegistry({ log }), registry = createToolRegistry({ log, bus, permissions, capabilities: caps });
const scheduler = createScheduler({ log }), storage = createStorage({ dataDir, log });
const loader = createPluginLoader({ log, bus, appRoot: root, registry, capabilityRegistry: caps, permissions, scheduler, storage, config });
await loader.loadAll();
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'ui/panels/manifest.json'), 'utf8'));
const adapters = createPanelAdapters({ loader, permissions, registry, config, bundledManifest: manifest, log });
const http = createHttpServer({ config, log, bus, staticDir: path.join(appRoot, 'ui/shell'), panelAssetResolver: (url) => adapters.resolveAsset(url) });
registerPanelRoutes(http, adapters);
const sessions = createSessionRegistry({ dataDir, log, bus });
registerConsoleRoutes(http, { config, sessions, dataDir, log, bus, permissions, loader, registry, capability: caps, store: createChatStore({ dataDir, log }), memory: createMemoryStore({ dataDir, log }), orchestrator: { status: () => ({}), pause() {}, resume() {} }, transport: { status: () => ({ connected: false }) }, appRoot: root });
const bridge = createSseBridge({ bus, http });
const port = await http.listen(), base = `http://127.0.0.1:${port}`;
let browser;
try {
  console.log(`· 53 启动隔离 Chromium：${executablePath}`);
  browser = await playwright.chromium.launch({ headless: true, executablePath, timeout: 20000 });
  const page = await browser.newPage();
  await page.route('**/*', async (route) => {
    if (!route.request().url().startsWith(base)) return route.abort();
    return route.continue();
  });
  await page.goto(`${base}/?token=browser-host-token`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  // 面板数量跟随 manifest，不要写死 8：新增面板后这条断言曾静默失效（超时而非明确报错）。
  const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'ui/panels/manifest.json'), 'utf8'));
  await page.waitForFunction((n) => document.querySelectorAll('#nav button').length === n, manifest.panels.length, { timeout: 20000 });
  assert.equal(new URL(page.url()).searchParams.has('token'), false);
  console.log('· 53 真实 UI 手动授权，SSE 刷新插件面板');
  await page.locator('#nav button[data-panel="plugins"]').click();
  let frame = page.frameLocator('#panel-host iframe');
  // M3 串跑 41 个文件时浏览器实例密集，面板 iframe 挂载稍慢；
  // 先等插件列表真的渲染出来，再点授权，否则会偶发"找不到按钮"超时。
  await frame.locator('button', { hasText: '宿主授权' }).first().waitFor({ state: 'visible', timeout: 20000 });
  await frame.getByRole('button', { name: '宿主授权' }).first().click({ timeout: 20000 });
  await frame.getByRole('button', { name: '允许', exact: true }).first().waitFor({ state: 'visible', timeout: 20000 });
  await frame.getByRole('button', { name: '允许', exact: true }).first().click({ timeout: 20000 });
  await frame.getByRole('button', { name: '确认', exact: true }).first().click({ timeout: 20000 });
  await page.waitForFunction(() => !!document.querySelector('#nav button[data-panel="demo_panel"]'), null, { timeout: 20000 });
  await frame.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('#nav button[data-panel="demo_panel"]').click();
  frame = page.frameLocator('#panel-host iframe');
  await frame.locator('#call').click({ timeout: 20000 });
  await frame.locator('#result').filter({ hasText: 'browser-call' }).waitFor({ timeout: 20000 });
  const called = JSON.parse(await frame.locator('#result').innerText());
  assert.equal(called.ok, true); assert.equal(called.result.text, 'browser-call');
  assert.equal(await page.locator('#workspace-title').textContent(),'Demo');
  assert.equal(await page.locator('.workspace-context').evaluate(node=>node.getBoundingClientRect().width>1&&getComputedStyle(node).clipPath==='none'),true,'A user plugin retains its registered page title in the compact shell');
  console.log('· 53 工具与配置读成功，跨owner与任意API被拒');
  await frame.locator('#config').click();
  await frame.locator('#result').filter({ hasText: 'browser-config' }).waitFor();
  const cfgText = await frame.locator('#result').innerText();
  assert.deepEqual(JSON.parse(cfgText), { label: 'browser-config', hasCredential: true });
  assert.ok(cfgText.includes('hasCredential')); assert.ok(!cfgText.includes('DO-NOT-LEAK') && !cfgText.includes('browser-host-token'));
  await frame.locator('#cross').click(); await frame.locator('#result').filter({ hasText: 'ERROR' }).waitFor();
  assert.ok((await frame.locator('#result').innerText()).includes('所属插件'));
  await frame.locator('#api').click(); await frame.locator('#result').filter({ hasText: '用户面板仅允许' }).waitFor();
  assert.equal(await page.locator('#panel-host iframe').getAttribute('sandbox'), 'allow-scripts');
  const current = page.frames().find((f) => f.url().includes('/panels/u/'));
  const storage = await current.evaluate(() => { try { localStorage.getItem('x'); return 'accessible'; } catch { return 'opaque'; } });
  assert.equal(storage, 'opaque');
  const oldAsset = await page.locator('#panel-host iframe').getAttribute('src');
  const oldPluginFrame = await page.locator('#panel-host iframe').elementHandle();
  const oldGeneration = adapters.listPanels().find((panel) => panel.id === 'demo_panel').generation;
  console.log('· 53 禁用插件使导航/iframe立即失效');
  await loader.setEnabled('demo', false);
  await page.waitForFunction((oldSrc) => !document.querySelector('#nav button[data-panel="demo_panel"]') && ![...document.querySelectorAll('#panel-host iframe')].some(frame => frame.getAttribute('src') === oldSrc), oldAsset, { timeout: 20000 });
  assert.equal(await oldPluginFrame.evaluate(frame => frame.isConnected), false, 'The removed user frame is destroyed even when shell recovery mounts a bundled panel');
  assert.equal(Boolean(registry.get('demo__echo')), false);
  console.log('· 53 真实 UI 卸载插件，旧 generation 的资源与 RPC 均失效');
  await page.locator('#nav button[data-panel="plugins"]').click();
  frame = page.frameLocator('#panel-host iframe');
  const uninstall = await frame.getByRole('button', { name: '卸载', exact: true }).elementHandle();
  assert.equal(await uninstall.getAttribute('data-danger-clicks'), '4');
  const deletion = page.waitForResponse((response) => response.url() === `${base}/api/skills/demo/delete` && response.request().method() === 'POST', { timeout: 20000 });
  for (let i = 0; i < 3; i++) await uninstall.click({ timeout: 20000 });
  assert.equal(fs.existsSync(plugin), true, 'Three clicks only prepare uninstall');
  assert.equal(await frame.locator('dialog.confirm-panel').count(), 0, 'Uninstall feedback stays non-modal');
  await uninstall.click({ timeout: 20000 });
  const deleted = await deletion;
  assert.equal(deleted.status(), 200);
  const deletedBody = await deleted.json();
  assert.equal(deletedBody.ok, true); assert.equal(deletedBody.deleted, 'demo'); assert.equal(deletedBody.recoverable, true);
  await frame.locator('#list .extension-id').filter({ hasText: 'demo' }).waitFor({ state: 'detached', timeout: 20000 });
  assert.equal(fs.existsSync(plugin), false);
  assert.equal(fs.existsSync(path.join(root, deletedBody.quarantine)), true);
  assert.equal(config.get().skills?.demo, undefined);
  assert.equal(loader.listEntries().some((entry) => entry.id === 'demo'), false);
  assert.equal(await page.locator('#nav button[data-panel="demo_panel"]').count(), 0);
  assert.equal((await fetch(new URL(oldAsset, base))).status, 404);
  const staleCall = await fetch(`${base}/api/panels/demo_panel/call`, {
    method: 'POST', headers: { 'x-console-token': 'browser-host-token', 'content-type': 'application/json' },
    body: JSON.stringify({ generation: oldGeneration, tool: 'demo__echo', args: { text: '不能再调用' } }),
  });
  assert.equal(staleCall.status, 403);
  console.log('✓ 53-panel-browser-host：真实授权按钮/工具/RPC/配置脱敏/拒绝跨owner/任意API/token隔离/禁用刷新/真实卸载全部通过');
} finally { await browser?.close(); bridge.close(); loader.stopAll(); sessions.stop(); permissions.close(); scheduler.stop(); await http.close(); }

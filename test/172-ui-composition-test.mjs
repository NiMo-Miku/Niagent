// Trusted boot UI replaces defaults; downloaded pages retain their narrow host.
// Every HTTP request targets a new ephemeral loopback server with synthetic data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { createPanelAdapters, registerPanelRoutes } from '../src/console/panel-adapters.js';
import { createUiAssetResolver } from '../src/console/ui-composition.js';
import { createHttpServer } from '../src/kernel/http.js';
import { RpcBridge } from '../ui/shell/rpc-bridge.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-ui-composition172-'));
const appRoot = path.resolve(import.meta.dirname, '..');
const log = { info() {}, warn() {}, error() {} };
const config = { get: () => ({ server: { port: 0, token: 'test-ui-172-token' } }) };
const servers = [];
let browser;
function write(relative, text) {
  const target = path.join(temp, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  return target;
}
const shell = path.dirname(write('default/ui/shell/index.html', '<h1>default-shell</h1>'));
write('default/ui/shell/app.js', '// default-shell-script');
write('default/ui/panels/settings/index.html', '<h1>default-settings</h1>');
write('default/ui/panels/settings/default-only.css', '/* default-only */');
write('default/ui/panels/sessions/index.html', '<h1>default-sessions</h1>');
write('default/ui/panels/icons.js', 'export const icon = "default";');
const settingsRoot = path.dirname(write('overrides/ui/settings/index.html', '<h1 id="replacement">replacement-settings</h1><script type="module" src="panel.js"></script>'));
write('overrides/ui/settings/panel.js', 'import {icon} from "/panels/icons.js";document.querySelector("h1").dataset.icon=icon;');
const addedRoot = path.dirname(write('overrides/ui/status/index.html', '<h1>trusted-new-page</h1>'));
const icons = write('overrides/ui/shared/icons.js', 'export const icon = "replacement-icon";');
const bootstrap = write('overrides/ui/shared/app.js', '// replacement-shell-script');
const replacementShell = path.dirname(write('overrides/ui/shell/index.html', '<h1>replacement-shell</h1>'));
const bundledManifest = { panels: [
  { id: 'settings', title: 'Default settings', permissions: [], api: [{ method: 'GET', path: '/api/config' }] },
  { id: 'sessions', title: 'Default sessions', permissions: [], api: [] },
] };
const ui = {
  panels: [
    { id: 'settings', title: 'Operator settings', entry: 'index.html', permissions: [], api: [{ method: 'GET', path: '/api/config' }], assetRoot: settingsRoot },
    { id: 'status', title: 'Operator status', permissions: [], api: [], assetRoot: addedRoot },
  ],
  assets: { 'panels/icons.js': icons, 'shell/app.js': bootstrap },
};
const pluginDir = path.dirname(path.dirname(write('downloaded/evil/ui/index.html', '<h1>ordinary-user-page</h1>')));
const entry = {
  dir: pluginDir, status: 'active', fingerprint: 'synthetic-fingerprint', generation: '11111111-1111-1111-1111-111111111111',
  manifest: { panels: [
    { id: 'settings', title: 'Impersonation', kind: 'bundled', permissions: ['ui.panel'], api: [] },
    { id: 'evil_page', title: 'Ordinary page', kind: 'bundled', permissions: ['ui.panel'], api: [] },
  ] },
};
const loader = { listEntries: () => [{ id: 'evil' }], hostEntry: () => entry, contentCurrent: () => true };
const permissions = { isGranted: () => true };
async function serve(selectedUi = {}) {
  const adapters = createPanelAdapters({ loader, permissions, config, bundledManifest, ui: selectedUi, log });
  const http = createHttpServer({ config, log, staticDir: shell, panelAssetResolver: adapters.resolveAsset, uiAssetResolver: adapters.resolveUiAsset });
  registerPanelRoutes(http, adapters);
  http.route('GET', '/api/config', () => ({ marker: 'protected-config' }));
  const port = await http.listen();
  servers.push(http);
  return { adapters, http, base: `http://127.0.0.1:${port}` };
}
async function get(base, url, options = {}) {
  const response = await fetch(base + url, options);
  return { status: response.status, text: await response.text(), headers: response.headers };
}
function installedChromium(playwright) {
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, playwright.chromium.executablePath(),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe')];
  for (const cache of [path.join(process.env.LOCALAPPDATA || os.homedir(), 'ms-playwright'), path.join(os.homedir(), '.cache/ms-playwright')]) {
    try {
      for (const dir of fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort().reverse()) {
        for (const relative of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux64/chrome', 'chrome-linux/chrome']) candidates.push(path.join(cache, dir, relative));
      }
    } catch { /* An installed system browser is also sufficient. */ }
  }
  return candidates.find(candidate => candidate && fs.existsSync(candidate));
}

try {
  const initial = await serve();
  assert.match((await get(initial.base, '/')).text, /default-shell/);
  assert.match((await get(initial.base, '/panels/settings/index.html')).text, /default-settings/);
  const selected = await serve(ui);
  const panels = selected.adapters.listPanels();
  assert.deepEqual(panels.map(panel => panel.id), ['settings', 'sessions', 'status', 'evil_page']);
  assert.equal(panels[0].title, 'Operator settings');
  assert.equal(panels[0].kind, 'bundled');
  assert.equal(panels[0].assetRoot, undefined, 'server filesystem paths never reach iframe manifests');
  assert.equal(panels[3].kind, 'user', 'an ordinary manifest cannot choose its role');
  assert.equal(panels[3].ownerId, 'evil');
  panels[0].api.push({ method: 'POST', path: '/api/reset-data' });
  ui.panels[0].title = 'mutated after boot';
  assert.equal(selected.adapters.listPanels()[0].api.length, 1, 'public DTO mutations cannot enlarge the authoritative allowlist');
  assert.equal(selected.adapters.listPanels()[0].title, 'Operator settings', 'boot page selection is immutable');
  let result = await get(selected.base, '/panels/settings/index.html', { headers: { origin: 'null' } });
  assert.equal(result.status, 200); assert.match(result.text, /replacement-settings/);
  assert.match(result.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(result.headers.get('access-control-allow-origin'), 'null');
  assert.match((await get(selected.base, '/panels/settings/panel.js')).text, /icons\.js/);
  assert.equal((await get(selected.base, '/panels/settings/default-only.css')).status, 404, 'a replacement page never mixes missing files with the default page');
  assert.match((await get(selected.base, '/panels/sessions/index.html')).text, /default-sessions/);
  assert.match((await get(selected.base, '/panels/status/index.html')).text, /trusted-new-page/);
  assert.match((await get(selected.base, '/app.js')).text, /replacement-shell-script/);
  assert.match((await get(selected.base, '/panels/icons.js')).text, /replacement-icon/);
  result = await get(selected.base, '/api/panels'); assert.equal(result.status, 401);
  result = await get(selected.base, '/api/panels', { headers: { 'x-console-token': 'test-ui-172-token' } });
  assert.equal(result.status, 200); assert.equal(JSON.parse(result.text).panels[0].title, 'Operator settings');
  assert.equal((await get(selected.base, '/api/config', { headers: { 'x-console-token': 'test-ui-172-token', origin: 'https://untrusted.invalid' } })).status, 403);
  const user = panels[3];
  assert.match((await get(selected.base, `/panels/u/${user.id}/${user.generation}/index.html`)).text, /ordinary-user-page/);
  assert.equal((await get(selected.base, `/panels/u/${user.id}/00000000-0000-0000-0000-000000000000/index.html`)).status, 404);
  for (const invalid of [
    { assets: { 'shell/api/config.js': icons } }, { assets: { 'panels/u/evil/script.js': icons } },
    { assets: { 'shell/events/event.js': icons } }, { assets: { '../escape.js': icons } },
    { panels: [{ id: 'u', assetRoot: settingsRoot }] }, { shell: 'relative-path' },
  ]) assert.throws(() => createUiAssetResolver(invalid));
  assert.equal(selected.adapters.resolveUiAsset('/panels/settings/%2e%2e/shared/icons.js'), false);
  assert.equal(selected.adapters.resolveUiAsset('/panels/settings/..%5cshared/icons.js'), false);
  const shellSelected = await serve({ shell: replacementShell });
  assert.match((await get(shellSelected.base, '/')).text, /replacement-shell/);
  assert.equal((await get(shellSelected.base, '/app.js')).status, 404);
  assert.match((await get(shellSelected.base, '/panels/sessions/index.html')).text, /default-sessions/);

  const outside = path.dirname(write('outside/escape.js', '// outside-boundary'));
  const link = path.join(settingsRoot, 'linked');
  let linked = false;
  try { fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir'); linked = true; }
  catch (error) { if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; console.log('SKIP symlink creation unavailable:', error.code); }
  if (linked) {
    assert.equal((await get(selected.base, '/panels/settings/linked/escape.js')).status, 404);
    assert.throws(() => createUiAssetResolver({ shell: link }), /symlink/i);
    const swap = path.dirname(write('overrides/ui/swap/escape.js', '// selected-at-boot'));
    const resolver = createUiAssetResolver({ shell: swap });
    assert.equal(resolver('/escape.js'), path.join(swap, 'escape.js'));
    fs.renameSync(swap, `${swap}-old`);
    fs.symlinkSync(outside, swap, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(resolver('/escape.js'), false, 'post-boot junction replacement cannot escape the selected root');
  }

  // Exercise the unchanged capability host with server-generated trusted/user DTOs.
  const oldWindow = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
  try {
    const calls = [], sent = [];
    const frame = { contentWindow: { postMessage: message => sent.push(message) }, addEventListener() {} };
    const trusted = new RpcBridge({ frame, manifest: selected.adapters.listPanels()[0], api: { request: async (...args) => { calls.push(args); return { ok: true }; } } });
    const rpc = (bridge, method, requestPath) => bridge.handle({ source: frame.contentWindow, origin: 'null', data: { jsonrpc: '2.0', id: '172', method: 'api.request', params: { method, path: requestPath }, meta: { panel: bridge.manifest.id, nonce: bridge.nonce } } });
    await rpc(trusted, 'GET', '/api/config'); assert.equal(calls.length, 1);
    await rpc(trusted, 'POST', '/api/reset-data'); assert.equal(calls.length, 1); assert.ok(sent.at(-1).error);
    trusted.close();
    const ordinary = new RpcBridge({ frame, manifest: user, api: { request() { throw new Error('must not invoke'); } } });
    await rpc(ordinary, 'GET', '/api/config'); assert.match(sent.at(-1).error.message, /用户面板仅允许/);
    ordinary.close();
  } finally { globalThis.window = oldWindow; }

  if (process.argv.includes('--browser')) {
    const playwright = createRequire(import.meta.url)('playwright-core');
    const executablePath = installedChromium(playwright);
    assert.ok(executablePath, 'No installed Chromium; this test never downloads one');
    // Use the real sandbox host + panel client, with all assets served locally.
    write('default/ui/panels/panel-client.js', fs.readFileSync(path.join(appRoot, 'ui/panels/panel-client.js'), 'utf8'));
    for (const file of ['rpc-bridge.js', 'panel-registry.js', 'panel-view-state.js', 'settings-save-lifecycle.js']) write(`default/ui/shell/${file}`, fs.readFileSync(path.join(appRoot, 'ui/shell', file), 'utf8'));
    for (const file of ['theme.js', 'motion.js', 'request-timeouts.js', 'refresh-policy.js', 'destructive-action.js', 'destructive-layout.js', 'destructive-motion.js', 'destructive-snapshot.js', 'vendor/gsap-3.13.0.min.js', 'vendor/gsap-runtime.js']) write(`default/ui/panels/${file}`, fs.readFileSync(path.join(appRoot, 'ui/panels', file), 'utf8'));
    write('default/ui/shell/browser.html', '<!doctype html><main id="host"></main><script type="module" src="browser.js"></script>');
    write('default/ui/shell/browser.js', `import {PanelRegistry} from './panel-registry.js';const api={request:async(method,url,body,query,opts)=>{const response=await fetch(url,{method,headers:{'x-console-token':'test-ui-172-token'},signal:opts?.signal});return response.json();}};const {panels}=await api.request('GET','/api/panels');window.registry=new PanelRegistry({frameHost:document.querySelector('#host'),api});for(const panel of panels)window.registry.register(panel);await window.registry.mount('settings');`);
    write('overrides/ui/settings/panel.js', `import {request} from '/panels/panel-client.js';import {icon} from '/panels/icons.js';document.querySelector('h1').dataset.icon=icon;document.querySelector('h1').dataset.marker=(await request('GET','/api/config')).marker;`);
    browser = await playwright.chromium.launch({ headless: !process.argv.includes('--headed'), executablePath });
    const page = await browser.newPage();
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) browserErrors.push(`${response.status()} ${response.url()}`); });
    await page.route('**/*', route => route.request().url().startsWith(selected.base + '/') ? route.continue() : route.abort());
    await page.goto(`${selected.base}/browser.html`);
    const frame = page.frameLocator('#host iframe');
    try { await frame.locator('#replacement[data-icon="replacement-icon"][data-marker="protected-config"]').waitFor({ timeout: 15000 }); }
    catch (error) { throw new Error(`${error.message}\nBrowser errors: ${browserErrors.join('; ')}`, { cause: error }); }
    assert.equal(await page.locator('#host iframe').getAttribute('sandbox'), 'allow-scripts');
    const privilegedFrame = page.frames().find(candidate => candidate.url().includes('/panels/settings/'));
    assert.equal(await privilegedFrame.evaluate(() => { try { localStorage.getItem('x'); return false; } catch { return true; } }), true);
    console.log('PASS real Chromium: selected page/assets render and sandboxed trusted RPC reaches authenticated host');
  }

  fs.unlinkSync(path.join(settingsRoot, 'index.html'));
  assert.equal((await get(selected.base, '/panels/settings/index.html')).status, 404, 'removing active override files cannot leak back into default page files');
  const restarted = await serve();
  assert.equal(restarted.adapters.listPanels()[0].title, 'Default settings');
  assert.match((await get(restarted.base, '/panels/settings/index.html')).text, /default-settings/);
  assert.match((await get(restarted.base, '/app.js')).text, /default-shell-script/);
  console.log('PASS 172 UI composition: trusted page/shell/component replacement, immutable manifests, protected HTTP/RPC, user isolation, canonical boundaries and restart fallback');
} finally {
  await browser?.close();
  await Promise.all(servers.map(server => server.close()));
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith('qqa-ui-composition172-'));
  fs.rmSync(temp, { recursive: true, force: true });
}

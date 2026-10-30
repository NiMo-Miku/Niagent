// Disk layers -> production UI adapters/HTTP -> optional installed Chromium.
// Synthetic pages only; no running application, user data, agent or remote API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadComposition } from '../src/kernel/composition.js';
import { createPanelAdapters, registerPanelRoutes } from '../src/console/panel-adapters.js';
import { createHttpServer } from '../src/kernel/http.js';

const workspace = path.resolve(import.meta.dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-ui-conflicts177-'));
const token = 'synthetic-ui-conflicts-177-token';
const config = { get: () => ({ server: { port: 0, token } }) };
const log = { info() {}, warn() {}, error() {} };
const servers = [], forbiddenNetwork = [];
let browser, browserPage, pluginGranted = false, generations = 0;

function write(relative, content) {
  const filename = path.join(root, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content);
  return filename;
}
function panel(id, title, assetRoot) {
  return { id, title, assetRoot, permissions: [], api: [{ method: 'GET', path: `/api/fixture/${id}` }] };
}
function pageHtml(id, source) {
  return `<!doctype html><h1 id="page" data-source="${source}">${id}-${source}</h1><button id="exercise">Exercise feature</button><output id="count">0</output><script type="module" src="panel.js"></script>`;
}
function pageScript(id, source, badge = null) {
  return `import {request} from '/panels/panel-client.js';import {icon} from '/panels/icons.js';${badge ? `import {badge} from '/panels/badge-${badge}.js';` : ''}
const heading=document.querySelector('#page');heading.dataset.script=${JSON.stringify(source)};heading.dataset.icon=icon;${badge ? 'heading.dataset.badge=badge;' : ''}
heading.dataset.api=(await request('GET',${JSON.stringify(`/api/fixture/${id}`)})).marker;
document.querySelector('#exercise').addEventListener('click',()=>document.querySelector('#count').textContent=String(Number(document.querySelector('#count').textContent)+1));`;
}
function shellHtml(source) {
  return `<!doctype html><h1 id="shell" data-source="${source}">shell-${source}</h1><main id="host"></main><script type="module" src="app.js"></script>`;
}
function shellScript(source) {
  return `import {PanelRegistry} from './panel-registry.js';document.querySelector('#shell').dataset.script=${JSON.stringify(source)};
const api={request:async(method,url,body,query,options)=>{const response=await fetch(url,{method,headers:{'x-console-token':${JSON.stringify(token)}},signal:options?.signal});if(!response.ok)throw new Error('HTTP '+response.status);return response.json();}};
const {panels}=await api.request('GET','/api/panels');window.registry=new PanelRegistry({frameHost:document.querySelector('#host'),api});for(const item of panels)window.registry.register(item);window.fixtureReady=true;`;
}
function populateShell(relative, source) {
  write(`${relative}/index.html`, shellHtml(source));
  write(`${relative}/app.js`, shellScript(`shell-script-${source}`));
  for (const name of ['panel-registry.js', 'rpc-bridge.js', 'panel-view-state.js', 'settings-save-lifecycle.js']) write(`${relative}/${name}`, fs.readFileSync(path.join(workspace, 'ui/shell', name), 'utf8'));
}
function populatePage(relative, id, source, badge = null) {
  write(`${relative}/index.html`, pageHtml(id, source));
  write(`${relative}/panel.js`, pageScript(id, `panel-script-${source}`, badge));
  write(`${relative}/style.css`, `/* page-style-${source} */`);
}

populateShell('ui/shell', 'defaults');
populatePage('ui/panels/sessions', 'sessions', 'defaults');
populatePage('ui/panels/settings', 'settings', 'defaults');
write('ui/panels/icons.js', 'export const icon="icons-defaults";');
write('ui/panels/sessions/default-only.css', '/* default-only */');
for (const name of ['panel-client.js', 'theme.js', 'motion.js', 'request-timeouts.js', 'refresh-policy.js', 'destructive-action.js', 'destructive-layout.js', 'destructive-motion.js', 'destructive-snapshot.js', 'vendor/gsap-3.13.0.min.js', 'vendor/gsap-runtime.js']) write(`ui/panels/${name}`, fs.readFileSync(path.join(workspace, 'ui/panels', name), 'utf8'));

const layers = [
  { name: 'A', directory: '10-a', order: 10, feature: 'market', enabled: true },
  { name: 'B', directory: '20-b', order: 20, feature: 'reports', enabled: true },
  { name: 'C', directory: '30-c', order: 30, feature: 'diagnostics', enabled: false },
];
for (const layer of layers) {
  const relative = `overrides/${layer.directory}`;
  populateShell(`${relative}/shell`, layer.name);
  populatePage(`${relative}/sessions`, 'sessions', layer.name);
  populatePage(`${relative}/${layer.feature}`, layer.feature, layer.name, layer.name);
  write(`${relative}/icons.js`, `export const icon="icons-${layer.name}";`);
  write(`${relative}/badge.js`, `export const badge="badge-${layer.name}";`);
  layer.manifest = {
    version: 1, id: `ui-${layer.name.toLowerCase()}`, order: layer.order, enabled: layer.enabled,
    ui: {
      shell: './shell',
      panels: [panel('sessions', `Sessions ${layer.name}`, './sessions'), panel(layer.feature, `Independent ${layer.name}`, `./${layer.feature}`)],
      assets: { 'panels/icons.js': './icons.js', [`panels/badge-${layer.name}.js`]: './badge.js' },
    },
  };
  if (layer.name !== 'B') {
    write(`${relative}/explicit/panel.js`, pageScript('sessions', `panel-script-${layer.name}-explicit`));
    write(`${relative}/explicit/app.js`, shellScript(`shell-script-${layer.name}-explicit`));
    write(`${relative}/explicit/only.css`, `/* explicit-only-${layer.name} */`);
    layer.manifest.ui.assets['panels/sessions/panel.js'] = './explicit/panel.js';
    layer.manifest.ui.assets['shell/app.js'] = './explicit/app.js';
    layer.manifest.ui.assets['panels/sessions/lower-only.css'] = './explicit/only.css';
  }
}
function save(layer) { write(`overrides/${layer.directory}/composition.json`, JSON.stringify(layer.manifest)); }
layers.forEach(save);
const [a, b, c] = layers;

const pluginDir = path.dirname(path.dirname(write('downloaded/pretender/ui/index.html', '<!doctype html><h1 id="ordinary">ordinary-plugin</h1><script type="module" src="panel.js"></script>')));
write('downloaded/pretender/ui/panel.js', `import {request} from '/panels/panel-client.js';try{await request('GET','/api/fixture/sessions');document.querySelector('h1').dataset.result='unexpected-privilege';}catch(error){document.querySelector('h1').dataset.result='denied';document.querySelector('h1').dataset.error=error.message;}`);
const generation = '17717717-7177-4177-8177-177177177177';
const pluginEntry = {
  dir: pluginDir, status: 'active', generation, fingerprint: 'synthetic-fingerprint-177',
  manifest: { panels: [
    { id: 'sessions', title: 'Forged sessions', kind: 'bundled', permissions: ['ui.panel'], api: [] },
    { id: 'market', title: 'Forged market', kind: 'bundled', permissions: ['ui.panel'], api: [] },
    { id: 'ordinary', title: 'Ordinary plugin', kind: 'bundled', permissions: ['ui.panel'], api: [] },
  ] },
};
const loader = { listEntries: () => [{ id: 'pretender' }], hostEntry: () => pluginEntry, contentCurrent: () => true };
const permissions = { isGranted: () => pluginGranted };
const bundledManifest = { panels: [panel('sessions', 'Default sessions'), panel('settings', 'Default settings')] };

async function serve() {
  const { composition } = await loadComposition({ appRoot: root, defaults: {} });
  const adapters = createPanelAdapters({ config, log, loader, permissions, bundledManifest, ui: composition.ui });
  const http = createHttpServer({ config, log, staticDir: path.join(root, 'ui/shell'), uiAssetResolver: adapters.resolveUiAsset, panelAssetResolver: adapters.resolveAsset });
  registerPanelRoutes(http, adapters);
  for (const id of ['sessions', 'settings', 'market', 'reports', 'diagnostics']) http.route('GET', `/api/fixture/${id}`, () => ({ marker: `api-${id}-177` }));
  const port = await http.listen();
  servers.push(http);
  const base = `http://127.0.0.1:${port}`;
  return { http, adapters, composition, base, async get(url, authorized = true) {
    assert.ok(url.startsWith('/') && !url.startsWith('//'));
    const response = await fetch(base + url, { headers: authorized ? { 'x-console-token': token } : {} });
    return { status: response.status, text: await response.text(), headers: response.headers };
  } };
}
function installedChromium(playwright) {
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, playwright.chromium.executablePath(),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe')];
  for (const cache of [path.join(process.env.LOCALAPPDATA || os.homedir(), 'ms-playwright'), path.join(os.homedir(), '.cache/ms-playwright')]) {
    try { for (const directory of fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort().reverse()) for (const relative of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux64/chrome', 'chrome-linux/chrome']) candidates.push(path.join(cache, directory, relative)); }
    catch { /* Use an installed browser only; never download one. */ }
  }
  return candidates.find(candidate => candidate && fs.existsSync(candidate));
}
async function renderPanel(id, source, script, icon, badge = null) {
  await browserPage.evaluate(id => window.registry.mount(id), id);
  const frame = browserPage.frameLocator('#host iframe');
  await frame.locator(`#page[data-source="${source}"][data-script="${script}"][data-icon="${icon}"][data-api="api-${id}-177"]`).waitFor();
  if (badge) assert.equal(await frame.locator('#page').getAttribute('data-badge'), badge);
  await frame.locator('#exercise').click();
  assert.equal(await frame.locator('#count').textContent(), '1', `${id}'s independent feature remains interactive`);
  assert.equal(await browserPage.locator('#host iframe').getAttribute('sandbox'), 'allow-scripts');
  const child = browserPage.frames().find(candidate => candidate.url().includes(`/panels/${id}/`));
  assert.equal(await child.evaluate(() => { try { localStorage.getItem('x'); return false; } catch { return true; } }), true);
}
async function verify(label, { source, script = `panel-script-${source}`, shell = source, app = `shell-script-${shell}`, icon = source, active = [] }) {
  const selected = await serve();
  generations++;
  for (const [url, marker] of [
    ['/', `data-source="${shell}"`], ['/app.js', app], ['/panels/sessions/index.html', `data-source="${source}"`],
    ['/panels/sessions/panel.js', script], ['/panels/icons.js', `icons-${icon}`], ['/panels/settings/index.html', 'settings-defaults'],
  ]) { const response = await selected.get(url); assert.equal(response.status, 200, `${label}: ${url}`); assert.ok(response.text.includes(marker), `${label}: ${url} must contain ${marker}`); }
  const response = await selected.get('/api/panels');
  assert.equal(response.status, 200);
  const panels = JSON.parse(response.text).panels;
  assert.equal(panels.find(item => item.id === 'sessions').title, source === 'defaults' ? 'Default sessions' : `Sessions ${source}`);
  assert.equal(panels.find(item => item.id === 'sessions').kind, 'bundled');
  assert.equal(panels.some(item => item.assetRoot), false, 'filesystem paths stay on the server');
  for (const layer of layers) {
    const enabled = active.includes(layer.name), definition = panels.find(item => item.id === layer.feature);
    if (enabled) {
      assert.equal(definition.title, `Independent ${layer.name}`, `${label}: independently contributed page survives conflicts`);
      assert.equal(definition.kind, 'bundled');
      assert.match((await selected.get(`/panels/${layer.feature}/index.html`)).text, new RegExp(`${layer.feature}-${layer.name}`));
      assert.match((await selected.get(`/panels/badge-${layer.name}.js`)).text, new RegExp(`badge-${layer.name}`));
    } else {
      assert.equal(definition?.kind === 'bundled', false);
      assert.equal((await selected.get(`/panels/${layer.feature}/index.html`)).status, 404);
      assert.equal((await selected.get(`/panels/badge-${layer.name}.js`)).status, 404);
    }
  }
  assert.equal((await selected.get('/api/panels', false)).status, 401);
  if (source !== 'defaults') assert.equal((await selected.get('/panels/sessions/default-only.css')).status, 404);
  if (browserPage) {
    const errors = [], onError = error => errors.push(error.message);
    browserPage.on('pageerror', onError);
    await browserPage.route('**/*', route => {
      if (route.request().url().startsWith(selected.base + '/')) return route.continue();
      forbiddenNetwork.push(route.request().url()); return route.abort();
    });
    await browserPage.goto(selected.base + '/');
    await browserPage.waitForFunction(() => window.fixtureReady === true);
    assert.equal(await browserPage.locator('#shell').getAttribute('data-source'), shell);
    assert.equal(await browserPage.locator('#shell').getAttribute('data-script'), app);
    await renderPanel('sessions', source, script, `icons-${icon}`);
    for (const layer of layers.filter(item => active.includes(item.name))) await renderPanel(layer.feature, layer.name, `panel-script-${layer.name}`, `icons-${icon}`, `badge-${layer.name}`);
    await renderPanel('settings', 'defaults', 'panel-script-defaults', `icons-${icon}`);
    assert.deepEqual(errors, [], `${label}: rendered pages have no runtime errors`);
    await browserPage.evaluate(() => window.registry.unmount());
    browserPage.off('pageerror', onError);
    await browserPage.unroute('**/*');
  }
  console.log(`PASS 177 ${label}: selected page/shell/shared asset plus ${active.length} independent capabilities over HTTP${browserPage ? ' and Chromium' : ''}`);
  return selected;
}

try {
  if (process.argv.includes('--browser')) {
    const playwright = createRequire(import.meta.url)('playwright-core'), executablePath = installedChromium(playwright);
    assert.ok(executablePath, 'An installed Chromium is required; this test never downloads browsers');
    browser = await playwright.chromium.launch({ headless: !process.argv.includes('--headed'), executablePath });
    browserPage = await browser.newPage();
  }
  const two = await verify('two overlapping layers; newer roots suppress old explicit files', { source: 'B', active: ['A', 'B'] });
  assert.equal((await two.get('/panels/sessions/lower-only.css')).status, 404, 'a missing newer page asset must not leak an older explicit file');
  for (const [relative, url] of [['sessions/panel.js', '/panels/sessions/panel.js'], ['shell/app.js', '/app.js'], ['shell/index.html', '/']]) {
    const missing = path.join(root, 'overrides/20-b', relative), original = fs.readFileSync(missing);
    fs.unlinkSync(missing);
    assert.equal((await two.get(url)).status, 404, 'missing selected page/shell files cannot fall back to a lower layer');
    assert.match((await two.get('/panels/market/index.html')).text, /market-A/, 'an incomplete selected subtree does not disturb independent pages');
    fs.writeFileSync(missing, original);
  }
  c.manifest.enabled = true; save(c);
  const three = await verify('three overlapping layers; same-layer explicit assets win', { source: 'C', script: 'panel-script-C-explicit', app: 'shell-script-C-explicit', active: ['A', 'B', 'C'] });
  for (const [relative, url] of [['explicit/panel.js', '/panels/sessions/panel.js'], ['explicit/app.js', '/app.js'], ['icons.js', '/panels/icons.js'], ['sessions/index.html', '/panels/sessions/index.html']]) {
    const filename = path.join(root, 'overrides/30-c', relative), content = fs.readFileSync(filename);
    fs.unlinkSync(filename);
    assert.equal((await three.get(url)).status, 404, `missing selected ${relative} never falls back to an older layer or default`);
    await assert.rejects(() => loadComposition({ appRoot: root, defaults: {} }), /ENOENT/, 'the next boot rejects an incomplete active layer');
    fs.writeFileSync(filename, content);
  }
  c.manifest.ui.panels.shift(); delete c.manifest.ui.shell; save(c);
  await verify('newer explicit assets override a lower complete page and shell', { source: 'B', script: 'panel-script-C-explicit', app: 'shell-script-C-explicit', icon: 'C', active: ['A', 'B', 'C'] });
  c.manifest.ui.panels.unshift(panel('sessions', 'Sessions C', './sessions')); c.manifest.ui.shell = './shell';
  a.manifest.order = 30; b.manifest.order = 20; c.manifest.order = 10; layers.forEach(save);
  await verify('reverse priority changes only conflicted contributions', { source: 'A', script: 'panel-script-A-explicit', app: 'shell-script-A-explicit', active: ['A', 'B', 'C'] });
  layers.forEach(item => { item.manifest.order = 20; save(item); });
  await verify('equal priority uses deterministic directory order', { source: 'C', script: 'panel-script-C-explicit', app: 'shell-script-C-explicit', active: ['A', 'B', 'C'] });
  c.manifest.enabled = false; save(c);
  await verify('disabling upper layer restores middle; independent lower features remain', { source: 'B', active: ['A', 'B'] });
  c.manifest.enabled = true; save(c);
  const removed = path.join(root, 'removed-c');
  fs.renameSync(path.join(root, 'overrides', c.directory), removed);
  const withoutC = await verify('removing upper directory restores middle without base edits', { source: 'B', active: ['A', 'B'] });
  assert.equal(withoutC.adapters.listPanels().some(item => item.id === 'ordinary'), false);
  assert.equal((await withoutC.get(`/panels/u/ordinary/${generation}/index.html`)).status, 404, 'unapproved plugin remains inaccessible despite trusted layer conflicts');
  pluginGranted = true;
  const publicPanels = JSON.parse((await withoutC.get('/api/panels')).text).panels;
  assert.equal(publicPanels.find(item => item.id === 'sessions').title, 'Sessions B');
  assert.equal(publicPanels.find(item => item.id === 'market').title, 'Independent A');
  const ordinary = publicPanels.find(item => item.id === 'ordinary');
  assert.equal(ordinary.kind, 'user', 'a downloaded manifest cannot promote its role to bundled');
  assert.equal(ordinary.ownerId, 'pretender');
  assert.equal((await withoutC.get(`/panels/u/ordinary/${generation}/index.html`)).status, 200);
  if (browserPage) {
    await browserPage.route('**/*', route => route.request().url().startsWith(withoutC.base + '/') ? route.continue() : (forbiddenNetwork.push(route.request().url()), route.abort()));
    await browserPage.goto(withoutC.base + '/');
    await browserPage.waitForFunction(() => window.fixtureReady === true);
    await browserPage.evaluate(() => window.registry.mount('ordinary'));
    await browserPage.frameLocator('#host iframe').locator('#ordinary[data-result="denied"]').waitFor();
    assert.match(await browserPage.frameLocator('#host iframe').locator('#ordinary').getAttribute('data-error'), /用户面板仅允许/);
    assert.equal(await browserPage.locator('#host iframe').getAttribute('sandbox'), 'allow-scripts');
    await browserPage.evaluate(() => window.registry.unmount());
    await browserPage.unroute('**/*');
  }
  pluginGranted = false;
  b.manifest.enabled = false; save(b);
  await verify('disabling middle restores lower complete feature set', { source: 'A', script: 'panel-script-A-explicit', app: 'shell-script-A-explicit', active: ['A'] });
  a.manifest.enabled = false; save(a);
  await verify('disabling all layers restores default roots and shared assets', { source: 'defaults' });
  assert.deepEqual(forbiddenNetwork, [], 'every browser request stayed within the selected synthetic loopback server');
  console.log(`PASS 177 UI conflict stability: ${generations} disk generations; overlapping and independent capabilities, fail-closed files, role isolation${browserPage ? ', real sandboxed RPC and interactive Chromium rendering' : ''}`);
} finally {
  await browser?.close();
  await Promise.all(servers.map(server => server.close()));
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('qqa-ui-conflicts177-'));
  fs.rmSync(root, { recursive: true, force: true });
}

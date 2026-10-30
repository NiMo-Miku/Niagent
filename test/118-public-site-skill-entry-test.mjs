// Real bundled iframe -> fixed public target RPC -> host popup. No public traffic leaves Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';
import { isolateConsoleFixture } from './console-fixture-isolation.mjs';
import { RpcBridge } from '../ui/shell/rpc-bridge.js';
import { isSettingsLeaseOpenRequest } from './settings-save-observation.mjs';

const originalWindow = globalThis.window, sent = [], opened = [];
globalThis.window = { addEventListener() {}, removeEventListener() {} };
const frameStub = { contentWindow: { postMessage: message => sent.push(message) }, addEventListener() {} };
const guard = new RpcBridge({ frame: frameStub, manifest: { id: 'skills', kind: 'bundled', api: [] }, onOpenExternal: target => { opened.push(target);return { ok: true }; } });
function event(target) {
  return { source: frameStub.contentWindow, origin: 'null', data: { jsonrpc: '2.0', id: '118', method: 'ui.openExternal', params: { target }, meta: { nonce: guard.nonce, panel: guard.manifest.id } } };
}
try {
  console.log('· Only the designated bundled panel may request each fixed public target');
  await guard.handle(event('skill-market-btn'));assert.deepEqual(opened, ['skill-market-btn']);
  for (const target of ['open-site-btn', 'feedback-btn', 'plugin-market-btn', 'https://evil.invalid/?token=secret', '__proto__']) {
    await guard.handle(event(target));assert.equal(sent.at(-1).error.code, -32600);
  }
  guard.manifest.kind = 'user';await guard.handle(event('skill-market-btn'));
  assert.equal(sent.at(-1).error.code, -32003);
  guard.manifest = { id: 'community', kind: 'bundled', api: [] };
  await guard.handle(event('open-site-btn'));assert.deepEqual(opened, ['skill-market-btn', 'open-site-btn']);
  await guard.handle(event('skill-market-btn'));assert.equal(sent.at(-1).error.code, -32600);
  for (const id of ['settings', '__proto__', 'constructor']) {
    guard.manifest.id = id;await guard.handle(event('open-site-btn'));assert.equal(sent.at(-1).error.code, -32003);
  }
  guard.manifest = { id: 'skills', kind: 'bundled', api: [] };
  for (const patch of [e => { e.source = {}; }, e => { e.origin = 'https://evil.invalid'; }, e => { e.data.meta.nonce = 'wrong'; }, e => { e.data.meta.panel = 'community'; }]) {
    const forged = event('skill-market-btn');patch(forged);const before = sent.length;
    await guard.handle(forged);assert.equal(sent.length, before);
  }
  assert.deepEqual(opened, ['skill-market-btn', 'open-site-btn']);
} finally {
  guard.close();
  if (originalWindow === undefined) delete globalThis.window;else globalThis.window = originalWindow;
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-public118-')), token = 'public118-console';
// Keep the actual default provider closure, with no workspace/installed roots.
const isolation = isolateConsoleFixture(dataDir, '118');
fs.writeFileSync(path.join(isolation.appRoot, 'package.json'), JSON.stringify({type:'module'}));
fs.cpSync(new URL('../src', import.meta.url), path.join(isolation.appRoot, 'src'), {recursive:true});
for (const name of ["community","market"]) fs.cpSync(new URL(`../bundled/${name}`, import.meta.url), path.join(isolation.appRoot, 'bundled', name), {recursive:true});
function assertFixtureOwners(active = false) {
  assert.deepEqual(kernel.loader.listEntries().map(entry => entry.id).sort(), ["community","market"], 'only the actual declared default fixture owners are loaded');
  if (active) {
    for (const id of ["community","market"]) assert.equal(kernel.loader.isActive(id), true, id);
    assert.deepEqual(kernel.capability.providers('market.client').map(item => item.ownerId), ['market']);
    assert.deepEqual(kernel.capability.providers('community.client').map(item => item.ownerId), ['community']);
  }
}
function cleanupFixture() {
  try { isolation.restore(); } finally {
    const relative = path.relative(os.tmpdir(), dataDir);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    fs.rmSync(dataDir, {recursive:true, force:true});
  }
}

const kernel = createKernel({
  appRoot: isolation.appRoot, env: isolation.env, headless: true,
  fetchImpl: (...args) => fetch(...args),
  transport: { id: 'fixture', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },
  communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }), getBlocklist: () => ({ ok: true, ids: [] }), listAccounts: () => ({ ok: true, accounts: [] }), listCatalog: async ({kind}) => ({ok:true,kind,items:[],categories:{}}) },
});
kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false }, proactive: {enabled:false}, api: { apiKey: 'private-config-secret-118' } });
kernel.loader.startWatchers = () => {};
let browser;
try {
  const port = await kernel.start(), base = isolation.allowOrigin(`http://127.0.0.1:${port}`);assertFixtureOwners(true);
  const playwright = createRequire(import.meta.url)('playwright-core');
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(version => path.join(cache, version, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file));
  browser = await playwright.chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1360, height: 860 } }), publicRequests = [], writes = [], errors = [];
  const blockedBrowser = [], publicTargets = new Set(["https://www.kondius.cn/qq-agent/skill-market/","https://kondius.cn/qq-agent"]);
  await context.route('**/*', async route => {
    const request = route.request();
    if (new URL(request.url()).origin === base) return route.continue();
    if (request.method() !== 'GET' || !publicTargets.has(request.url())) { blockedBrowser.push(request.url());return route.abort(); }
    publicRequests.push({ url: request.url(), method: request.method(), headers: request.headers() });
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>118 Local Public Page</title><p>Only local dispatch verification. No remote API or account action.</p>' });
  });
  context.on('request', request => { if (!['GET', 'HEAD'].includes(request.method()) && !isSettingsLeaseOpenRequest(request, base)) writes.push(request.url()); });
  const configBeforePublicNavigation = fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8');
  const page = await context.newPage();page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?token=${token}`);
  async function select(id) {
    await page.locator(`#nav button[data-panel=${id}]`).click();
    const panel = page.frameLocator('#panel-host iframe');
    await panel.locator('h2').filter({ hasText: id === 'skills' ? '技能' : '社区' }).waitFor();
    assert.equal(await page.locator('#panel-host iframe').getAttribute('sandbox'), 'allow-scripts');
    assert.doesNotMatch(await page.locator('#panel-host iframe').getAttribute('src'), /public118-console|token=/);
    if(id==='skills')await panel.locator('#tab-market').click();
    return panel;
  }
  async function dispatch(panel, label, url, status) {
    const popupPromise = context.waitForEvent('page');
    await panel.getByRole('button', { name: label, exact: true }).click();
    const popup = await popupPromise;await popup.waitForLoadState('domcontentloaded');
    assert.equal(popup.url(), url);assert.equal(await popup.evaluate(() => window.opener), null);await popup.close();
    await panel.locator(status).filter({ hasText: '已请求在浏览器打开' }).waitFor();
    assert.equal(await panel.getByRole('button', { name: label, exact: true }).isEnabled(), true);
  }
  let panel = await select('skills');
  console.log('· Actual skill market and official site buttons dispatch their exact URLs without browser privileges in the iframe');
  await dispatch(panel, '市场网页版', 'https://www.kondius.cn/qq-agent/skill-market/', '#skill-market-status');
  await panel.locator('body').evaluate(async () => {
    const { openCommunityPage } = await import('/panels/panel-client.js');
    for (const target of ['open-site-btn', 'https://evil.invalid/']) {
      try { await openCommunityPage(target);throw new Error('cross-target request was accepted'); }
      catch (error) { if (error.code !== -32600) throw error; }
    }
  });
  panel = await select('community');
  await dispatch(panel, '打开官网', 'https://kondius.cn/qq-agent', '#community-link-status');
  await panel.locator('body').evaluate(async () => {
    const { openCommunityPage } = await import('/panels/panel-client.js');
    try { await openCommunityPage('skill-market-btn');throw new Error('cross-target request was accepted'); }
    catch (error) { if (error.code !== -32600) throw error; }
  });
  assert.equal(publicRequests.length, 2);

  console.log('· Launch failure is visible; retry opens once and neither link claims a remote operation succeeded');
  await page.evaluate(() => { window.qa118Open = window.open;window.open = () => { throw new Error('118 浏览器暂时不可用'); }; });
  for (const [id, label, status] of [['community', '打开官网', '#community-link-status'], ['skills', '市场网页版', '#skill-market-status']]) {
    panel = await select(id);await panel.getByRole('button', { name: label, exact: true }).click();
    await panel.locator(`${status} .error`).filter({ hasText: '118 浏览器暂时不可用' }).waitFor();
    assert.equal(await panel.getByRole('button', { name: label, exact: true }).isEnabled(), true);
  }
  assert.equal(publicRequests.length, 2);
  await page.evaluate(() => { window.open = window.qa118Open;delete window.qa118Open; });
  await dispatch(panel, '市场网页版', 'https://www.kondius.cn/qq-agent/skill-market/', '#skill-market-status');
  assert.equal(await panel.locator('#skill-market-status .error').count(), 0);

  console.log('· Both headers keep all buttons reachable at the minimum and wide window sizes');
  for (const viewport of [{ width: 960, height: 640 }, { width: 1360, height: 860 }]) {
    await page.setViewportSize(viewport);
    for (const id of ['skills', 'community']) {
      panel = await select(id);
      const geometry = await panel.locator('body').evaluate(body => {
        const doc = body.ownerDocument, width = doc.documentElement.clientWidth;
        return {
          overflow: Math.max(body.scrollWidth, doc.documentElement.scrollWidth) - width,
          buttons: [...doc.querySelectorAll('.head .actions button,.market-toolbar button')].filter(button=>button.getClientRects().length).map(button => {
            const rect = button.getBoundingClientRect();
            return { label: button.textContent, left: rect.left, right: rect.right, height: rect.height, reachable: button.contains(doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) };
          }),
        };
      });
      assert.equal(geometry.overflow, 0, `${id} ${viewport.width}px`);
      for (const button of geometry.buttons) {
        assert.ok(button.left >= 0 && button.right <= await panel.locator('body').evaluate(body => body.ownerDocument.documentElement.clientWidth) + 1, `${id}: ${button.label} stays inside its iframe`);
        assert.ok(button.height >= 27 && button.reachable, `${id}: ${button.label} remains clickable`);
      }
    }
  }
  assert.equal(publicRequests.length, 3);
  for (const request of publicRequests) {
    assert.equal(request.method, 'GET');assert.equal(new URL(request.url).search, '');assert.equal(request.headers.referer, undefined);
    assert.doesNotMatch(JSON.stringify(request), /public118-console|private-config-secret-118/);
  }
  assert.deepEqual(writes, [], 'entry dispatch never submits configuration, accounts or installation');
  assert.equal(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'), configBeforePublicNavigation, 'entry dispatch and presentation preserve the complete config file');
  assert.deepEqual(errors, []);assert.deepEqual(blockedBrowser, []);isolation.assertOffline();assertFixtureOwners();
  console.log('✓ 118 Skill/site public entries, per-panel target guards, exact safe dispatch, failure/retry and minimum-window reachability passed');
} finally {
  try { await browser?.close();await kernel.stop(); } finally { cleanupFixture(); }
}

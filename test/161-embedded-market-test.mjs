// Public catalog contract verified by GET on 2026-10-15. All tests below use
// synthetic upstream data, loopback HTTP and inert install results only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createCommunityMarketAdapters, COMMUNITY_BASE_URL } from '../bundled/market/client.js';
import { createMarketService } from '../bundled/market/index.js';
import { createKernel } from '../src/kernel/kernel.js';
import { isolateConsoleFixture } from './console-fixture-isolation.mjs';
import { createSdkAccess } from '../src/kernel/sdk-services.js';
import { hostApiRequestTimeout, panelApiRequestTimeout } from '../ui/panels/request-timeouts.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-market161-'));
// Keep the actual default provider closure, with no workspace/installed roots.
const isolation = isolateConsoleFixture(tmp, '161');
fs.writeFileSync(path.join(isolation.appRoot, 'package.json'), JSON.stringify({type:'module'}));
fs.cpSync(new URL('../src', import.meta.url), path.join(isolation.appRoot, 'src'), {recursive:true});
for (const name of ["market"]) fs.cpSync(new URL(`../bundled/${name}`, import.meta.url), path.join(isolation.appRoot, 'bundled', name), {recursive:true});
function assertFixtureOwners(active = false) {
  assert.deepEqual(kernel.loader.listEntries().map(entry => entry.id).sort(), ["market"], 'only the actual declared default fixture owners are loaded');
  if (active) {
    for (const id of ["market"]) assert.equal(kernel.loader.isActive(id), true, id);
    assert.deepEqual(kernel.capability.providers('market.client').map(item => item.ownerId), ['market']);
  }
}
function cleanupFixture() {
  try { isolation.restore(); } finally {
    const relative = path.relative(os.tmpdir(), tmp);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    fs.rmSync(tmp, {recursive:true, force:true});
  }
}

const catalog = kind => ({ ok: true, kind, categories: { utility: '工具', media: '媒体' }, items: [
  { id: `qa-${kind}-alpha`, name: `合成${kind} Alpha`, description: '可搜索说明 <img src=x onerror=alert(1)>', author: 'QA 作者', type: kind, status: 'approved', category: 'utility', categoryName: '工具', version: '1.2.3', installCode: kind === 'skill' ? 'SKILL161' : 'PLUGIN161' },
  { id: `qa-${kind}-beta`, name: `合成${kind} Beta`, description: '媒体测试条目', author: '另一位作者', type: kind, status: 'approved', category: 'media', categoryName: '媒体', version: '2.0.0', installCode: kind === 'skill' ? 'SKILL162' : 'PLUGIN162' },
  { id: `qa-${kind}-pending`, name: '等待审核', description: '尚未开放', type: kind, status: 'pending', category: 'utility', categoryName: '工具', installCode: 'PENDING1' },
] });

try {
  const calls = [];
  let upstream = catalog('skill'), responseStatus = 200, installed = 0;
  const client = createCommunityMarketAdapters({ dataDir: tmp, appRoot:isolation.appRoot, communityKey:'', config: { get: () => ({}) }, dnsLookup: async () => [{ address: '203.0.113.8', family: 4 }],
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, method: init.method, headers: init.headers });
      if (url.endsWith('/install/verify')) return new Response(JSON.stringify({ ok: true, results: [{ code: 'SKILL161', ok: true, type: 'plugin', id: 'qa-skill-alpha' }] }));
      return new Response(JSON.stringify(upstream), { status: responseStatus });
    }, installZip: async () => { installed++; return { ok: true, installed: 'inert' }; },
  });
  for (const kind of ['skill', 'plugin']) {
    upstream = catalog(kind);
    upstream.items.push({ id: 'qa-wrong-kind', type: kind === 'skill' ? 'plugin' : 'skill' }, { id: '../escape', type: kind });
    upstream.items[0].token = 'QA161_NOT_PUBLIC'; upstream.items[0].downloadUrl = 'https://untrusted.invalid/download';
    const data = await client.listCatalog({ kind, url: 'https://untrusted.invalid/' });
    assert.equal(calls.at(-1).url, `${COMMUNITY_BASE_URL}/${kind}s`);
    assert.equal(calls.at(-1).method, 'GET');
    assert.equal(new Headers(calls.at(-1).headers).has('x-account-token'), false);
    assert.equal(data.kind, kind); assert.equal(data.items.length, 3);
    assert.equal(data.items[0].categoryName, '工具');
    assert.equal(data.items[2].installCode, undefined, 'pending catalog cannot expose an install action');
    assert.doesNotMatch(JSON.stringify(data), /QA161_NOT_PUBLIC|untrusted\.invalid/);
  }
  const before = calls.length;
  await assert.rejects(client.listCatalog({ kind: '../../plugins' }), error => error.status === 400);
  assert.equal(calls.length, before);
  upstream = { ok: true, items: {} }; await assert.rejects(client.listCatalog({ kind: 'skill' }), error => error.status === 502);
  responseStatus = 503; await assert.rejects(client.listCatalog({ kind: 'plugin' }), error => error.status === 502);
  responseStatus = 200; upstream = catalog('skill');
  await assert.rejects(client.install({ id: 'qa-skill-alpha', kind: 'skill' }), error => error.status === 409);
  assert.equal(installed, 0); assert.equal(calls.filter(call => call.url.includes('/download')).length, 0, 'kind mismatch rejects before downloading');
  const legacy = createMarketService({ capability: name => name === 'host.defaults' ? { communityMarket: { listAccounts: () => ({ ok: true, accounts: [] }) } } : null });
  assert.deepEqual(legacy.listAccounts(), { ok: true, accounts: [] });
  assert.throws(() => legacy.listCatalog({ kind: 'skill' }), error => error.status === 503);
  for (const [method, endpoint] of [['GET', '/api/market/install'], ['POST', '/api/market/install/'], ['POST', '/api/market/verify'], ['GET', '/api/market/catalog']]) {
    assert.equal(hostApiRequestTimeout(method, endpoint), 15000); assert.equal(panelApiRequestTimeout(method, endpoint), 15000);
  }
  assert.equal(hostApiRequestTimeout('POST', '/api/market/install'), 180000);
  assert.equal(panelApiRequestTimeout('POST', '/api/market/install'), 185000);
  console.log('161 backend: fixed verified collection endpoints, public DTO, no credentials, errors, kind mismatch and bounded install waits passed');
} catch (error) { cleanupFixture(); throw error; }

const control = { mode: 'ok', catalogCalls: [], installCalls: [], delay: 180, installedListReads: 0, holdCatalog: false, releaseCatalog: null };
const kernel = createKernel({ appRoot:isolation.appRoot,env:{...isolation.env,QQ_AGENT_DATA_DIR:path.join(tmp,'data')}, headless: true,
  fetchImpl:(...args)=>fetch(...args),
  transport: { id: 'fixture', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },
  communityMarket: {
    syncGlobalBlocklist: async () => ({ ok: true, ids: [] }), getBlocklist: () => ({ ok: true, ids: [] }), listAccounts: () => ({ ok: true, accounts: [] }),
    async listCatalog({ kind }) {
      control.catalogCalls.push(kind);
      if (control.holdCatalog) await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('QA161 catalog gate was not released')), 5000);
        control.releaseCatalog = () => { clearTimeout(timeout); resolve(); };
      });
      else await new Promise(resolve => setTimeout(resolve, control.delay));
      if (control.mode === 'error') throw Object.assign(new Error('QA161 目录请求失败'), { status: 502, expose: true });
      if (control.mode === 'unavailable') throw Object.assign(new Error('QA161 扩展市场服务未就绪'), { status: 503, expose: true });
      return control.mode === 'empty' ? { ...catalog(kind), items: [] } : catalog(kind);
    },
    async install(body) {
      control.installCalls.push(body); await new Promise(resolve => setTimeout(resolve, 120));
      if (control.mode === 'install-error') throw Object.assign(new Error('QA161 已存在同名扩展'), { status: 409, expose: true });
      return { ok: true, installed: `qa-${body.kind}-alpha`, kind: body.kind, enabled: false, root: `${body.kind}s` };
    },
  },
});
const token = 'QA161_LOCAL_CONSOLE'; kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false },proactive:{enabled:false},});
kernel.loader.startWatchers=()=>{};
let browser;
try {
  const port = await kernel.start(), base = isolation.allowOrigin(`http://127.0.0.1:${port}`);assertFixtureOwners(true);
  const sdk = createSdkAccess({ config: kernel.config, permissions: kernel.permissions, loaderOf: () => kernel.loader,
    resolveProvider: name => kernel.capability.providers(name)[0]?.provider });
  const consumer = sdk.capabilityAccess('market.client', null, { entry: kernel.loader.hostEntry('market') });
  assert.equal(typeof consumer.listCatalog, 'function', 'public SDK includes the new catalog method');
  assert.equal((await consumer.listCatalog({ kind: 'skill' })).items.length, 3, 'actual kernel provider is readable with only the default market net.outbound scope');
  assert.equal(kernel.permissions.audit({n:1})[0].scope, 'net.outbound');
  assert.throws(() => consumer.install({ id: 'qa-skill-alpha', kind: 'skill' }), /未声明权限.*fs\.outsideNamespace/, 'catalog access does not acquire install filesystem scope');
  control.catalogCalls = [];
  const playwright = createRequire(import.meta.url)('playwright-core');
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9))).map(version => path.join(cache, version, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file));
  browser = await playwright.chromium.launch({ executablePath, headless: process.env.QA_HEADLESS !== '0' });
  const context = await browser.newContext({ viewport: { width: 1360, height: 860 } }), page = await context.newPage(), errors = [], publicRequests = [];
  await context.route('**/*', route => { if(new URL(route.request().url()).origin===base)return route.continue();publicRequests.push(route.request().url()); return route.abort(); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/skills') control.installedListReads++; });
  await page.goto(`${base}/?token=${token}`);
  for (const kind of ['skill', 'plugin']) {
    const id = `${kind}s`;
    await page.locator(`#nav button[data-panel=${id}]`).click();
    const panel = page.frameLocator('#panel-host iframe');
    await panel.locator('#list').waitFor();
    assert.equal(control.catalogCalls.filter(value => value === kind).length, 0, 'installed view is lazy');
    if (kind === 'plugin') control.mode = 'unavailable';
    control.holdCatalog = true;
    await panel.locator('#tab-market').click();
    await panel.locator('#market-status').filter({ hasText: '正在加载' }).waitFor({timeout:5000});
    for(let i=0;i<50&&!control.releaseCatalog;i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(typeof control.releaseCatalog,'function');
    control.holdCatalog = false; control.releaseCatalog(); control.releaseCatalog = null;
    if (kind === 'plugin') {
      await panel.locator('#market-status.error').filter({ hasText: '扩展市场服务未就绪' }).waitFor();
      assert.equal(await panel.locator('#market-refresh').isEnabled(), true);
      control.mode = 'ok'; await panel.locator('#market-refresh').click();
    }
    await panel.locator('.market-card').first().waitFor();
    assert.equal(await panel.locator('.market-card').count(), 3);
    assert.equal(await panel.locator('#installed-view').isHidden(), true);
    assert.equal(await panel.locator('#market-results img').count(), 0, 'remote descriptions remain text');
    assert.equal(await panel.locator('[data-market-id$="pending"] button').count(), 0, 'pending card has no install action');
    const count = control.catalogCalls.length;
    await panel.locator('#market-search').fill('可搜索说明');
    assert.equal(await panel.locator('.market-card').count(), 1);
    await panel.locator('#market-category').selectOption('media');
    await panel.locator('#market-results .empty').filter({ hasText: '没有匹配' }).waitFor();
    await panel.locator('#market-search').fill('');
    assert.equal(await panel.locator('.market-card').count(), 1);
    await panel.locator('#market-category').selectOption('');
    assert.equal(control.catalogCalls.length, count, 'search and categories do not refetch the collection');
    const reads = control.installedListReads;
    kernel.bus.emit('status', { qa161: true });
    for(let i=0;i<50&&control.installedListReads===reads;i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.ok(control.installedListReads > reads, 'status refresh reached the installed consumer');
    assert.equal(control.catalogCalls.length, count, 'SSE refresh does not fetch online catalog');
    await panel.locator('#tab-installed').click(); await panel.locator('#tab-installed').press('ArrowRight');
    assert.equal(await panel.locator('#tab-market').getAttribute('aria-selected'), 'true');
    assert.equal(control.catalogCalls.length, count, 'returning to loaded market reuses its collection');
    control.mode = 'error'; await panel.locator('#market-refresh').click();
    await panel.locator('#market-status.error').filter({ hasText: 'QA161 目录请求失败' }).waitFor();
    assert.equal(await panel.locator('.market-card').count(), 3, 'refresh failure preserves previous cards');
    control.mode = 'empty'; await panel.locator('#market-refresh').click();
    await panel.locator('#market-results .empty').filter({ hasText: '暂无条目' }).waitFor();
    control.mode = 'ok'; await panel.locator('#market-refresh').click(); await panel.locator('.market-card').first().waitFor();
    const install = panel.locator('.market-card').first().getByRole('button');
    await install.click(); await panel.locator('dialog[open]').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await install.evaluate(button=>button===button.ownerDocument.activeElement),true,'cancel restores focus to the original connected install button');
    await install.press('Enter'); await panel.locator('dialog[open]').press('Escape');
    assert.equal(await install.evaluate(button=>button===button.ownerDocument.activeElement),true,'Escape restores keyboard focus without replacing the card');
    assert.equal(control.installCalls.length, kind === 'skill' ? 0 : 2, 'cancellation does not submit an installation');
    control.mode = 'install-error'; await install.click(); await panel.locator('dialog[open]').getByRole('button', { name: '确认', exact: true }).click();
    await panel.locator('#market-install-status.error').filter({ hasText: 'QA161 已存在同名扩展' }).waitFor();
    control.mode = 'ok'; await install.click(); await panel.locator('dialog[open]').getByRole('button', { name: '确认', exact: true }).click();
    await panel.locator('#market-install-status').filter({ hasText: '默认停用，未执行代码' }).waitFor();
    assert.deepEqual(control.installCalls.at(-1), { id: `qa-${kind}-alpha`, kind });
    assert.equal(await panel.locator('.market-card').first().getByRole('button').isDisabled(), true, 'successful synthetic install cannot be resubmitted');
    for (const viewport of [{ width: 960, height: 640 }, { width: 1360, height: 860 }]) {
      await page.setViewportSize(viewport);
      assert.equal(await panel.locator('body').evaluate(body => Math.max(body.scrollWidth, body.ownerDocument.documentElement.scrollWidth) - body.ownerDocument.documentElement.clientWidth), 0);
    }
    if (process.env.QA_SCREENSHOT_DIR) { fs.mkdirSync(process.env.QA_SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.QA_SCREENSHOT_DIR, `161-${kind}-market.png`), fullPage: true }); }
  }
  assert.deepEqual(publicRequests, []); assert.deepEqual(errors, []);
  const manifest = JSON.parse(fs.readFileSync(new URL('../ui/panels/manifest.json', import.meta.url), 'utf8'));
  for (const id of ['skills', 'plugins']) {
    const entries = manifest.panels.find(panel => panel.id === id).api.filter(rule => rule.path.startsWith('/api/market/'));
    assert.deepEqual(entries, [{ method: 'GET', path: '/api/market/catalog' }, { method: 'POST', path: '/api/market/install' }]);
  }
  isolation.assertOffline();assertFixtureOwners();
  console.log('161 browser: both real sandbox panels, lazy catalog/search/categories, loading/errors/retry/empty, inert install confirmation and failures, SSE isolation, keyboard tabs and narrow-window layout passed');
} finally { try { await browser?.close();await kernel.stop(); } finally { cleanupFixture(); } }

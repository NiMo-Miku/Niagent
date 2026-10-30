// Real production aggregates + browser clicks must use each dimension's identity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-usage106-'));
// This fixture uses the actual default UI and imported kernel consumers, with
// no bundled or installed extensions. Data and migration roots are temporary.
const appRoot = path.join(dataDir, 'application'); fs.mkdirSync(appRoot);
fs.cpSync(path.resolve(import.meta.dirname, '../ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, directory));
let outbound = 0, dnsCalls = 0; const browserOutbound = [], ownedOrigins = new Set();
const nativeFetch = globalThis.fetch, nativeLookup = dns.lookup;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (ownedOrigins.has(url.origin)) return nativeFetch(input, options);
  outbound++; throw new Error('QA106 external fetch disabled');
};
dns.lookup = async () => { dnsCalls++; throw new Error('QA106 external DNS disabled'); };
const routeOwnedPage = (page, base) => page.route('**/*', route => {
  const url = route.request().url();
  if (new URL(url).origin === new URL(base).origin) return route.continue();
  browserOutbound.push(url); return route.abort();
});
function assertOffline() {
  assert.equal(outbound, 0, 'no external Node fetch was attempted');
  assert.equal(dnsCalls, 0, 'no external DNS was attempted');
  assert.deepEqual(browserOutbound, [], 'the browser requested only its owned console origin');
}

const token = 'usage106-console';
const kernel = createKernel({
  appRoot, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(dataDir, 'absent') }, headless: true,
  fetchImpl: async () => { outbound++; throw new Error('QA106 external traffic disabled'); },
  transport: { id: 'fixture', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },
  communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
});
kernel.loader.startWatchers = () => {};
kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false }, api: { useOfficialPrice: false, priceInputPerM: 10, priceOutputPerM: 20, priceCachedPerM: 2 } });
const longModel = `qa-model-${'long-model-name-'.repeat(8)}`;
const longProvider = `qa-provider-${'long-channel-name-'.repeat(8)}`;
const midnight = new Date(); midnight.setHours(0, 30, 0, 0);
function seed(chatKey, promptTokens, completionTokens, startedAt, model = longModel, providerId = longProvider) {
  const session = kernel.sessions.create(chatKey);
  kernel.sessions.update(session, { startedAt, model, providerId, usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, cachedTokens: 20, calls: 1 } });
  kernel.sessions.finish(session.id, 'done');
  return session.id;
}
const first = seed('group:10001', 100, 20, midnight.getTime());
const second = seed('group:10001', 200, 30, midnight.getTime() + 1000);
const third = seed('private:20001', 300, 40, midnight.getTime() + 3600000, 'qa-other-model', 'qa-other-provider');
let browser;
try {
  const port = await kernel.start(), base = `http://127.0.0.1:${port}`; ownedOrigins.add(base);
  assert.notEqual(port, 15967); assert.deepEqual(kernel.loader.listEntries(), []);
  async function api(url) {
    const response = await fetch(`${base}${url}`, { headers: { 'x-console-token': token } });
    assert.equal(response.status, 200); return response.json();
  }
  const stats = await api('/api/usage/stats?range=7');
  assert.equal(stats.sessions.length, 3);
  assert.deepEqual(new Set(stats.sessions.map(row => row.sessionId)), new Set([first, second, third]));
  assert.equal(stats.totals.totalTokens, 690);
  const firstStats = stats.sessions.find(row => row.sessionId === first);
  assert.equal(firstStats.chatKey, 'group:10001');
  assert.equal(firstStats.model, longModel);
  const actualSession = await api(`/api/usage/breakdown?range=7&dim=session&key=${encodeURIComponent(first)}&by=model`);
  assert.equal(actualSession.totals.totalTokens, 120, 'the production API already filters the exact session');
  assert.equal((await api('/api/usage/breakdown?range=7&dim=session&key=group%3A10001&by=model')).totals.totalTokens, 0);

  const playwright = createRequire(import.meta.url)('playwright-core');
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(version => path.join(cache, version, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file));
  browser = await playwright.chromium.launch({ executablePath, headless: process.env.QA_HEADLESS !== '0' });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await routeOwnedPage(page, base);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?token=${token}`);
  await page.locator('#nav button[data-panel=usage]').click();
  const frame = page.frameLocator('#panel-host iframe');
  await frame.locator('#advanced-dimensions > summary').click();
  await frame.locator('#sessions tbody tr').nth(2).waitFor();
  const closeBreakdown = async () => {
    const dialog = frame.locator('#breakdown');
    if (await dialog.isVisible()) {
      await dialog.getByRole('button', { name: '关闭明细', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
    }
  };
  async function clickBreakdown(locator, dim, key, expectedTokens) {
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/usage/breakdown');
    await locator.click();
    const response = await responsePromise, url = new URL(response.url()), data = await response.json();
    assert.equal(url.searchParams.get('dim'), dim);
    assert.equal(url.searchParams.get('key'), key, 'the clicked row sends its own dimension identity');
    assert.equal(data.totals.totalTokens, expectedTokens);
    await frame.locator('#breakdown h3').filter({ hasText: key }).waitFor();
    assert.match(await frame.locator('#breakdown > p').first().textContent(), /1 次运行|2 次运行|3 次运行/);
    return data;
  }
  console.log('· The same chat has two distinct session buttons; each returns its own recorded usage');
  const sessionButtons = await frame.locator('#sessions tbody button').allTextContents();
  console.log(`  Session labels: ${sessionButtons.join(', ')}`);
  assert.deepEqual(new Set(sessionButtons), new Set([first, second, third]));
  let result = await clickBreakdown(frame.locator('#sessions').getByRole('button', { name: first, exact: true }), 'session', first, 120);
  assert.equal(result.totals.cost, firstStats.cost);
  assert.equal(result.totals.cachedTokens, 20, 'session drilldown retains its recorded cached usage');
  await frame.locator('#breakdown-by').selectOption('chat');
  await frame.locator('#breakdown tbody button').filter({ hasText: 'group:10001' }).waitFor();
  await clickBreakdown(frame.locator('#breakdown').getByRole('button', { name: 'group:10001', exact: true }), 'chat', 'group:10001', 350);
  await frame.locator('#breakdown-by').selectOption('session');
  await frame.locator('#breakdown').getByRole('button', { name: second, exact: true }).waitFor();
  await clickBreakdown(frame.locator('#breakdown').getByRole('button', { name: second, exact: true }), 'session', second, 230);
  await closeBreakdown();

  console.log('· Model, provider, day, chat and hour-zero clicks retain their actual identities');
  await clickBreakdown(frame.locator('#models').getByRole('button', { name: `${longProvider}：${longModel}`, exact: true }), 'model', longModel, 350);
  await closeBreakdown();
  await clickBreakdown(frame.locator('#providers').getByRole('button', { name: longProvider, exact: true }), 'provider', longProvider, 350);
  await closeBreakdown();
  await clickBreakdown(frame.locator('#chats').getByRole('button', { name: 'private:20001', exact: true }), 'chat', 'private:20001', 340);
  await closeBreakdown();
  const day = stats.days.find(row => row.totalTokens === 690).day;
  await clickBreakdown(frame.locator('#days').getByRole('button', { name: day, exact: true }), 'day', day, 690);
  await closeBreakdown();
  await clickBreakdown(frame.locator('#hours').getByRole('button', { name: '0', exact: true }), 'hour', '0', 350);
  await closeBreakdown();

  console.log('· Long model/channel labels remain readable without widening the minimum-window page');
  await page.setViewportSize({ width: 960, height: 640 });
  const layout = await frame.locator('body').evaluate(body => {
    const doc = body.ownerDocument, width = doc.documentElement.clientWidth;
    return { overflow: Math.max(body.scrollWidth, doc.documentElement.scrollWidth) - width,
      outside: [...doc.querySelectorAll('.usage-table')].filter(node => node.getBoundingClientRect().right > width + 1).length };
  });
  assert.equal(layout.overflow, 0);
  assert.equal(layout.outside, 0);
  for (const [host, label] of [['models', longModel], ['providers', longProvider]]) {
    const accessibleName = host === 'models' ? `${longProvider}：${label}` : label;
    const labelBox = await frame.locator(`#${host}`).getByRole('button', { name: accessibleName, exact: true }).evaluate(button => ({ inner: button.clientWidth, content: button.scrollWidth }));
    assert.ok(labelBox.content <= labelBox.inner + 1, 'the full long label wraps inside its button instead of overlapping numeric columns');
  }
  // Full-width tables fit the 960px app window. At a smaller browser viewport,
  // the table itself must provide the horizontal reading surface.
  await page.setViewportSize({ width: 640, height: 640 });
  const dayTable = frame.locator('#days .usage-table');
  await dayTable.focus();
  await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 30 && await dayTable.evaluate(node => node.scrollLeft) === 0; i++) await page.waitForTimeout(20);
  assert.ok(await dayTable.evaluate(node => node.scrollLeft) > 0, 'keyboard users can scroll the focused table to read all columns');
  await page.setViewportSize({ width: 960, height: 640 });
  await clickBreakdown(frame.locator('#sessions').getByRole('button', { name: third, exact: true }), 'session', third, 340);
  const shotDir = path.resolve(process.env.QA_SCREENSHOT_DIR || '.shots');fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, 'usage-106-minimum.png') });
  assert.deepEqual(errors, []);
  console.log('✓ 106 Production dimension identities, nested drilldown, cache/cost subsets and narrow tables passed');
} finally {
  await browser?.close();
  await kernel.stop();
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(dataDir).startsWith('qqa-usage106-'));
  globalThis.fetch = nativeFetch; dns.lookup = nativeLookup;
  fs.rmSync(dataDir, { recursive: true, force: true });
  assertOffline(); assert.deepEqual(kernel.loader.listEntries(), []);
}

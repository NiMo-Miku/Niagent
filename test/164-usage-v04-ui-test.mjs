// The 0.4 usage presentation on the real 0.5 kernel, using disposable synthetic data.
// No QQ program, external model, cloud account, or existing profile is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-usage164-'));
// The real imported default kernel/UI is under test; no installed extension
// belongs in this regression's temporary application root.
const appRoot = path.join(dataDir, 'application'); fs.mkdirSync(appRoot);
fs.cpSync(path.resolve(import.meta.dirname, '../ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, directory));
let isolatedOutbound = 0, dnsCalls = 0; const browserOutbound = [], ownedOrigins = new Set();
const nativeFetch = globalThis.fetch, nativeLookup = dns.lookup;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (ownedOrigins.has(url.origin)) return nativeFetch(input, options);
  isolatedOutbound++; throw new Error('QA164 external fetch disabled');
};
dns.lookup = async () => { dnsCalls++; throw new Error('QA164 external DNS disabled'); };
const routeOwnedPage = (page, base, onBlocked = () => {}) => page.route('**/*', route => {
  const url = route.request().url();
  if (new URL(url).origin === new URL(base).origin) return route.continue();
  browserOutbound.push(url); onBlocked(url); return route.abort();
});
function assertOffline() {
  assert.equal(isolatedOutbound, 0, 'no external Node fetch was attempted');
  assert.equal(dnsCalls, 0, 'no external DNS was attempted');
  assert.deepEqual(browserOutbound, [], 'all browser pages used only their owned console origin');
}

const token = 'synthetic-usage164';
const kernel = createKernel({ appRoot,
  env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(dataDir, 'absent') },
  headless: true,
  transport: { id: 'offline164', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },
  communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
  fetchImpl: async () => { isolatedOutbound++; throw new Error('Usage UI tests must not make outbound requests'); },
});
kernel.config.update({
  server: { port: 0, token }, telemetry: { enabled: false }, proactive: { enabled: false },
  api: { useOfficialPrice: false, priceInputPerM: 10, priceOutputPerM: 20, priceCachedPerM: 2 },
});
kernel.log.setLevel('error');
kernel.loader.startWatchers = () => {};
const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
const dayAt = offset => { const date = new Date(midnight); date.setDate(date.getDate() + offset); return date.getTime() + 1000; };
function seed(offset, index = 0, promptTokens = 100 + Math.abs(offset)) {
  const session = kernel.sessions.create('group:164', { trigger: 'Synthetic usage UI fixture' });
  kernel.sessions.update(session, {
    startedAt: dayAt(offset), model: `qa-model-${String(index).padStart(2, '0')}`, providerId: 'qa-channel-164',
    webSearchCount: index === 0 ? 2 : 0,
    messages: index === 0 ? [
      { role: 'tool', toolCall: { name: 'search_web' } },
      { role: 'tool', toolCall: { name: 'search_web' } },
      { role: 'tool', toolCall: { name: 'fetch_url' } },
    ] : [],
    usage: { promptTokens, completionTokens: 20, totalTokens: promptTokens + 20, cachedTokens: Math.floor(promptTokens / 4), calls: index === 0 ? 3 : 2 },
  });
  kernel.sessions.finish(session.id, 'done');
  return session;
}
// 35 nonempty days make the all-time sparkline's last-30 clipping observable.
for (let offset = -34; offset < 0; offset++) seed(offset);
const current = Array.from({ length: 22 }, (_, index) => seed(0, index, index === 0 ? 10000 : 1000 + index));
const errors = [];
let browser;
const releases = new Set();

function chromiumExecutable(playwright) {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const roots = [
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'),
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
  ];
  for (const root of roots) {
    let versions;
    try { versions = fs.readdirSync(root).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9))); }
    catch { continue; }
    for (const version of versions) for (const relative of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const candidate = path.join(root, version, relative);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  const bundled = playwright.chromium.executablePath();
  assert.ok(fs.existsSync(bundled), 'Use an installed Chromium; this test never downloads a browser');
  return bundled;
}
async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(message || 'Timed out waiting for actual UI state');
}
function heldResponse() {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  releases.add(release);
  return { gate, release: () => { releases.delete(release); release(); }, ready: false };
}

try {
  const port = await kernel.start(), base = `http://127.0.0.1:${port}`; ownedOrigins.add(base);
  assert.notEqual(port, 15967); assert.deepEqual(kernel.loader.listEntries(), []);
  const api = async route => {
    const response = await fetch(`${base}${route}`, { headers: { 'x-console-token': token } });
    assert.equal(response.status, 200, route); return response.json();
  };
  const playwright = createRequire(import.meta.url)('playwright-core');
  browser = await playwright.chromium.launch({ executablePath: chromiumExecutable(playwright), headless: process.env.QA_HEADLESS !== '0' });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await routeOwnedPage(page, base);
  await page.goto(`${base}/?token=${token}`);
  await page.locator('#nav button[data-panel=usage]').click();
  const frame = page.frameLocator('#panel-host iframe');
  const rangeButton = range => frame.locator(`#usage-ranges button[data-range="${range}"]`);
  const metric = name => frame.locator(`.metric[data-metric="${name}"]`);
  const modelRowButton = name => frame.locator(`#models tbody tr[data-key="${name}"]`).getByRole('button');
  const spark = key => frame.locator(`.spark[data-spark-key="${key}"]`);
  const dialog = frame.locator('#breakdown');
  const backdropPoint = async modal => {
    const box = await modal.boundingBox(), host = await page.locator('#panel-host iframe').boundingBox();
    assert.ok(box && host);
    const point = [
      { x: host.x + 4, y: host.y + 4 },
      { x: host.x + host.width - 4, y: host.y + host.height - 4 },
    ].find(p => p.x < box.x || p.x > box.x + box.width || p.y < box.y || p.y > box.y + box.height);
    assert.ok(point, 'A real backdrop point is available inside the panel iframe');
    return point;
  };
  const clickBackdrop = async modal => { const point = await backdropPoint(modal); await page.mouse.click(point.x, point.y); };
  await frame.locator('h2').filter({ hasText: '用量与成本' }).waitFor();
  await frame.locator('#models tbody tr').nth(19).waitFor();

  console.log('· Range controls, five bar sparklines, full-width token tables, and model expansion');
  assert.deepEqual(await frame.locator('#usage-ranges button').evaluateAll(buttons => buttons.map(button => button.dataset.range)), ['today', '24h', '7', '30', 'all']);
  assert.equal(await rangeButton('7').getAttribute('aria-pressed'), 'true');
  assert.equal(await frame.locator('#range').inputValue(), '7');
  assert.equal(await frame.locator('#metrics .metric').count(), 5);
  assert.equal(await frame.locator('#metrics svg').count(), 5);
  assert.equal(await frame.locator('#metrics polyline').count(), 0, 'The port uses bar charts');
  for (const id of ['days', 'chats', 'models']) {
    const headers = await frame.locator(`#${id} th`).allTextContents();
    for (const expected of ['输入', '输出', '成本']) assert.ok(headers.some(header => header.includes(expected)), `${id}: ${expected} column`);
    assert.ok(headers.some(header => /缓存|命中/.test(header)), `${id}: cache column`);
  }
  assert.equal(await frame.locator('#advanced-dimensions').evaluate(details => details.open), false);
  assert.equal(await frame.locator('#models tbody tr').count(), 20);
  await frame.locator('#models-expand').click();
  assert.equal(await frame.locator('#models tbody tr').count(), 22);
  await frame.locator('#models-expand').click();
  assert.equal(await frame.locator('#models tbody tr').count(), 20);

  await rangeButton('all').click();
  await waitFor(async () => await spark('cost').locator('[data-spark-index]').count() === 30);
  const allStats = await api('/api/usage/stats?range=all');
  assert.equal(allStats.days.length, 35);
  const allPoints = await spark('cost').locator('[data-spark-index]').evaluateAll(points => points.map(point => ({ value: Number(point.dataset.sparkValue), label: point.dataset.sparkLabel })));
  assert.equal(allPoints.length, 30, 'All-time sparklines retain the latest 30 daily points');
  assert.deepEqual(allPoints.map(point => point.value), allStats.days.slice(-30).map(day => day.cost));
  assert.ok(allPoints.at(-1).label.includes(allStats.days.at(-1).day));
  assert.equal(await frame.locator('#range').inputValue(), 'all');

  console.log('· Today uses all 24 hourly points; hover and keyboard preview then restore totals');
  await rangeButton('today').click();
  await waitFor(async () => await spark('cost').locator('[data-spark-index]').count() === 24);
  const todayStats = await api('/api/usage/stats?range=today');
  assert.equal(todayStats.totals.runs, 22);
  assert.equal(todayStats.totals.exactCalls, 45, 'Runs remain distinct from exact model calls');
  const todayPoints = await spark('cost').locator('[data-spark-index]').evaluateAll(points => points.map(point => ({ value: Number(point.dataset.sparkValue), label: point.dataset.sparkLabel })));
  assert.deepEqual(todayPoints.map(point => point.value), todayStats.hours.map(hour => hour.cost));
  const totalValue = await metric('cost').locator('.uc-value').textContent();
  const totalSub = await metric('cost').locator('.uc-sub').textContent();
  await spark('cost').locator('[data-spark-index="23"]').hover();
  assert.notEqual(await metric('cost').locator('.uc-value').textContent(), totalValue);
  assert.ok((await metric('cost').locator('.uc-sub').textContent()).includes(todayPoints[23].label));
  await frame.locator('h2').hover();
  assert.equal(await metric('cost').locator('.uc-value').textContent(), totalValue);
  assert.equal(await metric('cost').locator('.uc-sub').textContent(), totalSub);
  await spark('cost').focus();
  await page.keyboard.press('Home');
  assert.ok((await metric('cost').locator('.uc-sub').textContent()).includes(todayPoints[0].label));
  await page.keyboard.press('End');
  assert.ok((await metric('cost').locator('.uc-sub').textContent()).includes(todayPoints[23].label));
  await frame.locator('#reload').focus();
  assert.equal(await metric('cost').locator('.uc-value').textContent(), totalValue);
  assert.equal(await metric('cost').locator('.uc-sub').textContent(), totalSub);

  const rollingResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/usage/stats' && new URL(response.url()).searchParams.get('range') === '24h');
  await rangeButton('24h').click();
  const rollingStats = await (await rollingResponse).json();
  await frame.locator('#status').filter({ hasText: /过去\s*24\s*小时/ }).waitFor();
  assert.equal(await rangeButton('24h').getAttribute('aria-pressed'), 'true');
  assert.equal(await frame.locator('#range').inputValue(), '24h');
  const rollingPoints = await spark('cost').locator('[data-spark-index]').evaluateAll(points => points.map(point => Number(point.dataset.sparkValue)));
  assert.ok(Math.abs(rollingPoints.reduce((sum, value) => sum + value, 0) - rollingStats.totals.cost) < 1e-9, 'The rolling range chart agrees with actual API usage');

  console.log('· A delayed old range response cannot replace a newer range');
  const oldStats = heldResponse();
  const statsRoute = async route => {
    if (new URL(route.request().url()).searchParams.get('range') !== '30') return route.continue();
    const response = await route.fetch(); oldStats.ready = true;
    await oldStats.gate; await route.fulfill({ response });
  };
  await page.route('**/api/usage/stats?*', statsRoute);
  await rangeButton('30').click();
  await waitFor(() => oldStats.ready, 'The old range response was not captured');
  await rangeButton('7').click();
  await waitFor(async () => await spark('cost').locator('[data-spark-index]').count() === 7);
  const latestValue = await metric('cost').locator('.uc-value').textContent();
  const oldStatsDone = page.waitForResponse(response => new URL(response.url()).pathname === '/api/usage/stats' && new URL(response.url()).searchParams.get('range') === '30');
  oldStats.release(); await (await oldStatsDone).finished();
  await page.unroute('**/api/usage/stats?*', statsRoute);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await rangeButton('7').getAttribute('aria-pressed'), 'true');
  assert.equal(await frame.locator('#range').inputValue(), '7');
  assert.equal(await spark('cost').locator('[data-spark-index]').count(), 7);
  assert.equal(await metric('cost').locator('.uc-value').textContent(), latestValue);

  console.log('· Native detail dialog rejects stale dimension responses and stays closed after a late response');
  await modelRowButton('qa-model-00').click();
  await dialog.locator('tbody tr').first().waitFor();
  assert.equal(await dialog.evaluate(node => node instanceof HTMLDialogElement && node.open && node.matches(':modal')), true);
  await dialog.locator('h3').click();
  assert.equal(await dialog.isVisible(), true, 'Content clicks do not dismiss the detail');
  const detailBounds = await dialog.boundingBox(), outside = await backdropPoint(dialog);
  await page.mouse.click(detailBounds.x + 5, detailBounds.y + 5);
  assert.equal(await dialog.isVisible(), true, 'Dialog padding is not the backdrop');
  await page.mouse.move(detailBounds.x + 5, detailBounds.y + 5);
  await page.mouse.down();
  await page.mouse.move(outside.x, outside.y, { steps: 5 });
  await page.mouse.up();
  assert.equal(await dialog.isVisible(), true, 'Dragging from the dialog into the backdrop does not dismiss it');
  const delayedDay = heldResponse(), delayedHour = heldResponse();
  const detailRoute = async route => {
    const by = new URL(route.request().url()).searchParams.get('by');
    const held = by === 'day' ? delayedDay : by === 'hour' ? delayedHour : null;
    if (!held) return route.continue();
    const response = await route.fetch(); held.ready = true;
    await held.gate; await route.fulfill({ response });
  };
  await page.route('**/api/usage/breakdown?*', detailRoute);
  await frame.locator('#breakdown-by').selectOption('day');
  await waitFor(() => delayedDay.ready);
  await frame.locator('#breakdown-by').selectOption('chat');
  await dialog.getByRole('button', { name: 'group:164', exact: true }).waitFor();
  const oldDayDone = page.waitForResponse(response => new URL(response.url()).pathname === '/api/usage/breakdown' && new URL(response.url()).searchParams.get('by') === 'day');
  delayedDay.release(); await (await oldDayDone).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await frame.locator('#breakdown-by').inputValue(), 'chat');
  assert.equal(await dialog.getByRole('button', { name: 'group:164', exact: true }).count(), 1);
  await frame.locator('#breakdown-by').selectOption('hour');
  await waitFor(() => delayedHour.ready);
  await clickBackdrop(dialog);
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await modelRowButton('qa-model-00').evaluate(button => button === document.activeElement), true, 'Backdrop dismissal restores the originating row focus');
  const oldHourDone = page.waitForResponse(response => new URL(response.url()).pathname === '/api/usage/breakdown' && new URL(response.url()).searchParams.get('by') === 'hour');
  delayedHour.release(); await (await oldHourDone).finished();
  await page.unroute('**/api/usage/breakdown?*', detailRoute);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await dialog.count(), 0, 'The disposed detail dialog is not resurrected by a late response');

  console.log('· Tool statistics open in their own dialog, and SSE preserves focused rows and reading position');
  await frame.getByRole('button', { name: '查看工具调用', exact: true }).click();
  await frame.locator('#tool-breakdown').waitFor();
  assert.equal(await frame.locator('#tool-breakdown').evaluate(node => node instanceof HTMLDialogElement && node.matches(':modal')), true);
  assert.match(await frame.locator('#tools').textContent(), /search_web/);
  assert.match(await frame.locator('#tools').textContent(), /fetch_url/);
  await frame.locator('#tool-breakdown h3').click();
  assert.equal(await frame.locator('#tool-breakdown').isVisible(), true);
  await clickBackdrop(frame.locator('#tool-breakdown'));
  await frame.locator('#tool-breakdown').waitFor({ state: 'hidden' });
  assert.equal(await frame.getByRole('button', { name: '查看工具调用', exact: true }).evaluate(button => button === document.activeElement), true);
  await frame.getByRole('button', { name: '查看工具调用', exact: true }).click();
  await frame.locator('#tool-breakdown').waitFor();
  await page.keyboard.press('Escape');
  await frame.locator('#tool-breakdown').waitFor({ state: 'hidden' });
  console.log('· Backdrop clicks dismiss both dialogs; content/padding/drag do not; focus and Escape remain intact');
  await frame.locator('#models-expand').click();
  assert.equal(await frame.locator('#models tbody tr').count(), 22);
  await page.setViewportSize({ width: 640, height: 680 });
  const modelButton = modelRowButton('qa-model-00');
  await modelButton.focus();
  const stableBefore = await modelButton.evaluate(button => {
    const viewport = button.closest('.usage-table');
    window.__qaUsage164 = { button, row: button.closest('tr'), viewport, rowText: button.closest('tr').textContent };
    viewport.scrollLeft = 55;
    window.scrollTo(0, Math.max(0, button.getBoundingClientRect().top + window.scrollY - 170));
    return { x: viewport.scrollLeft, y: window.scrollY, rowText: button.closest('tr').textContent };
  });
  assert.ok(stableBefore.x > 0, 'The compact table is horizontally scrollable');
  assert.ok(stableBefore.y > 0, 'The reading position is below the top of the page');
  const refreshResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/usage/stats');
  const previous = current[0].usage;
  kernel.sessions.update(current[0], { usage: { ...previous, promptTokens: previous.promptTokens + 101, totalTokens: previous.totalTokens + 101 } });
  kernel.bus.emit('status', { fixture: 'usage164-refresh' });
  await (await refreshResponse).finished();
  await waitFor(async () => await modelButton.evaluate(button => button.closest('tr').textContent !== window.__qaUsage164.rowText).catch(() => false));
  const stableAfter = await modelButton.evaluate(button => {
    const state = window.__qaUsage164;
    return { sameButton: button === state.button, sameRow: button.closest('tr') === state.row,
      sameViewport: button.closest('.usage-table') === state.viewport, focused: button === document.activeElement,
      x: state.viewport.scrollLeft, y: window.scrollY };
  });
  assert.deepEqual(stableAfter, { sameButton: true, sameRow: true, sameViewport: true, focused: true, x: stableBefore.x, y: stableBefore.y });
  assert.equal(await frame.locator('#models tbody tr').count(), 22, 'SSE retains the model expansion choice');
  if (process.env.QA_SCREENSHOT_DIR) {
    const shotDir = path.resolve(process.env.QA_SCREENSHOT_DIR); fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: path.join(shotDir, 'usage-164-reading-state.png') });
  }

  console.log('· A new nested identity clears the previous totals and rows before loading or failure');
  await page.setViewportSize({ width: 1360, height: 900 });
  const todayKey = todayStats.days[0].day;
  await frame.locator('#days').getByRole('button', { name: todayKey, exact: true }).click();
  await frame.locator('#breakdown-by').selectOption('chat');
  await dialog.getByRole('button', { name: 'group:164', exact: true }).waitFor();
  const previousHeading = await dialog.locator('h3').textContent();
  const previousSummary = await dialog.locator('.summary').textContent();
  assert.match(previousSummary, /成本.*输入/);
  const failedNested = heldResponse();
  const nestedError = 'QA164_SYNTHETIC_NESTED_FAILURE';
  const failingNestedRoute = async route => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get('dim') !== 'chat' || query.get('key') !== 'group:164') return route.continue();
    failedNested.ready = true; await failedNested.gate;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: nestedError }) });
  };
  await page.route('**/api/usage/breakdown?*', failingNestedRoute);
  await dialog.getByRole('button', { name: 'group:164', exact: true }).click();
  await waitFor(() => failedNested.ready);
  assert.notEqual(await dialog.locator('h3').textContent(), previousHeading);
  assert.match(await dialog.locator('h3').textContent(), /group:164/);
  assert.ok(!(await dialog.innerText()).includes(previousSummary), 'The pending chat heading never displays the previous day total');
  assert.equal(await dialog.locator('.detail-rows tbody button:visible').count(), 0, 'Previous day rows are not available under the new chat heading');
  assert.equal(await dialog.locator('.peak-split').isVisible(), false);
  failedNested.release();
  await dialog.locator('.detail-feedback').filter({ hasText: nestedError }).waitFor();
  assert.ok(!(await dialog.innerText()).includes(previousSummary), 'A failed nested request does not restore totals from its parent');
  assert.equal(await dialog.locator('.detail-rows tbody button:visible').count(), 0);
  await page.unroute('**/api/usage/breakdown?*', failingNestedRoute);
  await dialog.getByRole('button', { name: '关闭明细', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });

  console.log('· A nested known-provider drill retains its provider intersection');
  await modelRowButton('qa-model-00').click();
  await dialog.getByRole('button', { name: 'group:164', exact: true }).waitFor();
  const scopedChatResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/usage/breakdown' && url.searchParams.get('dim') === 'chat';
  });
  await dialog.getByRole('button', { name: 'group:164', exact: true }).click();
  const scopedChat = await scopedChatResponse;
  assert.equal(new URL(scopedChat.url()).searchParams.get('provider'), 'qa-channel-164');
  const scopedChatData = await scopedChat.json();
  assert.equal(scopedChatData.rows.length, 22);
  await dialog.locator('.detail-rows tbody button').nth(21).waitFor();
  await dialog.getByRole('button', { name: '关闭明细', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });

  console.log('· Legacy model totals keep their unassigned scope and disable unsupported nested day navigation');
  const legacyAt = new Date(dayAt(-40));
  const legacyDay = `${legacyAt.getFullYear()}-${String(legacyAt.getMonth() + 1).padStart(2, '0')}-${String(legacyAt.getDate()).padStart(2, '0')}`;
  const legacyModel = 'qa-legacy-only164';
  const legacyTotals = { cost: .17, promptTokens: 100, completionTokens: 50, cachedTokens: 25, totalTokens: 150, token: 150, runs: 2, exactCalls: 3 };
  fs.writeFileSync(path.join(dataDir, 'usage-days', `${legacyDay}.json`), JSON.stringify({
    version: 1, day: legacyDay, savedAt: Date.now(), aggregates: {
      totals: legacyTotals,
      models: [{ model: legacyModel, vendor: 'qa-ambiguous-old-vendor', ...legacyTotals }],
      chats: [], hours: [], searchCount: 0, toolCounts: {},
    },
  }));
  await rangeButton('all').click();
  const legacyModelButton = frame.locator(`#models tbody tr[data-key="${legacyModel}"][data-provider=""]`).getByRole('button');
  await legacyModelButton.waitFor();
  const legacyResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/usage/breakdown' && url.searchParams.get('key') === legacyModel;
  });
  await legacyModelButton.click();
  const legacy = await legacyResponse;
  const legacyQuery = new URL(legacy.url()).searchParams;
  assert.equal(legacyQuery.get('dim'), 'model');
  assert.equal(legacyQuery.has('provider'), true);
  assert.equal(legacyQuery.get('provider'), '', 'The legacy row explicitly requests only its unassigned baseline');
  assert.equal(legacyQuery.get('by'), 'day');
  const legacyData = await legacy.json();
  assert.equal(legacyData.totals.totalTokens, 150);
  assert.equal(legacyData.totals.cost, .17);
  const legacyDayButton = dialog.getByRole('button', { name: legacyDay, exact: true });
  await legacyDayButton.waitFor();
  assert.equal(await legacyDayButton.isDisabled(), true);
  const legacyHeading = await dialog.locator('h3').textContent();
  const legacySummary = await dialog.locator('.summary').textContent();
  const unexpectedDrills = [];
  const captureLegacyDrill = request => { if (new URL(request.url()).pathname === '/api/usage/breakdown') unexpectedDrills.push(request.url()); };
  page.on('request', captureLegacyDrill);
  await legacyDayButton.locator('..').locator('..').locator('td').nth(1).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  page.off('request', captureLegacyDrill);
  assert.deepEqual(unexpectedDrills, [], 'A legacy day row cannot navigate to a broader all-model day scope');
  assert.equal(await dialog.locator('h3').textContent(), legacyHeading);
  assert.equal(await dialog.locator('.summary').textContent(), legacySummary);
  assert.equal(await frame.locator('#breakdown-by').inputValue(), 'day');
  await dialog.getByRole('button', { name: '关闭明细', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('✓ 164: usage charts, races, reading state, truthful failures, and scoped known/legacy drilldowns passed');
} finally {
  for (const release of releases) release();
  await browser?.close();
  await kernel.stop();
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(dataDir).startsWith('qqa-usage164-'));
  globalThis.fetch = nativeFetch; dns.lookup = nativeLookup;
  fs.rmSync(dataDir, { recursive: true, force: true });
  assertOffline(); assert.deepEqual(kernel.loader.listEntries(), []);
}

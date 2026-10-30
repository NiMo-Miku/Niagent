import {settingsSection,settingsEditor,openSettingsFold} from './settings-navigation.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';
import { parseProviderCatalog } from '../src/console/provider-catalog.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-spec83-')), token = 'spec83-token';
// This regression calls real default routes/stores/price resolution and browser
// assets, not extension tools. Only the default UI belongs in its appRoot; the
// formal source imports above retain the real kernel/default business closure.
const appRoot = path.join(dataDir, 'application'); fs.mkdirSync(appRoot);
fs.cpSync(path.resolve(import.meta.dirname, '../ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, directory));
let outbound = 0, dnsCalls = 0; const browserOutbound = [], ownedOrigins = new Set();
const nativeFetch = globalThis.fetch, nativeLookup = dns.lookup;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (ownedOrigins.has(url.origin)) return nativeFetch(input, options);
  outbound++; throw new Error('QA83 external fetch disabled');
};
dns.lookup = async () => { dnsCalls++; throw new Error('QA83 external DNS disabled'); };
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

function recentTodayAt(now) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  return Math.max(start.getTime(), now - 3600000);
}
// The fixture must be historical, inside this calendar day and the last hour.
// Check these properties around midnight rather than repeating its calculation.
const previousDay = new Date(); previousDay.setDate(previousDay.getDate() - 1);
for (const [hour, minute, second, millisecond] of [[0, 0, 0, 0], [0, 0, 0, 1], [0, 30, 0, 0], [1, 0, 0, 0], [1, 30, 0, 0], [23, 59, 59, 999]]) {
  const boundary = new Date(previousDay); boundary.setHours(hour, minute, second, millisecond);
  const at = recentTodayAt(boundary.getTime()), recent = new Date(at);
  assert.deepEqual([recent.getFullYear(), recent.getMonth(), recent.getDate()], [boundary.getFullYear(), boundary.getMonth(), boundary.getDate()], 'recent today stays in the selected calendar day, including its first hour');
  assert.ok(at <= boundary.getTime(), 'recent today cannot be in the future');
  assert.ok(boundary.getTime() - at <= 3600000, 'recent today remains in the last hour');
}
let forwardCalls = 0;
const kernel = createKernel({ appRoot, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(dataDir, 'absent') }, headless: true,
  fetchImpl: async () => { outbound++; throw new Error('QA83 external traffic disabled'); },
  transport: { id: 'fixture', selfId: '99', start() {}, stop() {}, status: () => ({ connected: true }), actions: {
    listGroups: async () => [{ id: '123', name: '验收群' }], getGroupName: async () => '验收群', listFriends: async () => [],
    getForward: async () => { forwardCalls++; return { messages: [{ sender: { nickname: '<img onerror=oops>', user_id: 123 }, message: [{ type: 'text', data: { text: '转发文本' } }] }] }; },
  } }, priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) }, communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) } });
kernel.loader.startWatchers = () => {};
kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false }, allowAllWhenEmpty: true,
  providers: [{ id: 'first', displayName: 'First', baseUrl: 'https://first.example/v1', models: ['model-a', 'model-b'] }], dshProviderKeys: { first: 'keep-existing' },
  store: { unifiedTier: false, groupSliderPos: { '123': 25 }, groupPeakPos: { '123': { peak: 10, valley: 100 } } }, memberNotes: { '123': '旧备注', '456': '保留备注' },
  api: { modelPrices: { 'model-a': { in: 1, out: 2 }, 'obsolete-model': { in: 3, out: 4 } } } });
const port = await kernel.start(), base = `http://127.0.0.1:${port}`; ownedOrigins.add(base);
assert.notEqual(port, 15967);
assert.deepEqual(kernel.loader.listEntries(), [], 'this regression needs no bundled or installed extension owners');
async function request(method, url, body) { const response = await fetch(base + url, { method, headers: { 'x-console-token': token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, data: await response.json() }; }
let browser;
try {
  console.log('· 渠道 YAML 数据解析、密钥隔离与无效输入原子拒绝');
  assert.throws(() => parseProviderCatalog('!!js/function >\n  function(){return 1}'));
  assert.throws(() => parseProviderCatalog('providers: [{id: same, baseURL: https://one.example}, {id: same, baseURL: https://two.example}]'));
  assert.throws(() => parseProviderCatalog('providers: [{id: invalid, baseURL: file:///secret}]'));
  let result = await request('POST', '/api/providers/import', { source: 'providers:\n  - id: imported\n    name: Imported\n    baseURL: https://imported.example/v1\n    apiKey: pasted-secret-83\n    models: [model-c]' });
  assert.equal(result.status, 200); assert.equal(result.data.imported, 1); assert.equal(JSON.stringify(result.data).includes('pasted-secret'), false);
  assert.equal(kernel.config.get().dshProviderKeys.imported, 'pasted-secret-83'); assert.equal(kernel.config.get().dshProviderKeys.first, 'keep-existing');
  assert.equal((await request('GET', '/api/providers')).data.source.includes('pasted-secret'), false);
  const before = kernel.config.get().providers.length; assert.equal((await request('POST', '/api/providers/import', { source: 'not: [valid' })).status, 400); assert.equal(kernel.config.get().providers.length, before);
  kernel.config.update({ api: { provider: 'first', baseUrl: 'https://first.example/v1', model: 'model-a' } });
  await request('POST', '/api/providers/import', { source: 'providers: [{id: first, baseURL: https://updated.example/v1, models: [model-a, model-b]}]' });
  assert.equal(kernel.config.get().api.baseUrl, 'https://updated.example/v1'); assert.equal(kernel.config.get().api.model, 'model-a');
  await request('POST', '/api/providers/import', { source: 'providers: [{id: first, baseURL: https://updated.example/v1, models: [model-b]}]' });
  assert.equal(kernel.config.get().api.model, '');
  await request('POST', '/api/providers/import', { source: 'providers: [{id: first, baseURL: https://updated.example/v1, models: [model-a, model-b]}]' });

  console.log('· 搜索源修改地址保留身份/密钥，删除备注实际落盘');
  result = await request('POST', '/api/search-providers', { name: 'old', baseUrl: 'https://search.example/query', apiKey: 'search-secret', count: 6 }); const sourceId = result.data.provider.id;
  result = await request('POST', '/api/search-providers', { id: sourceId, name: 'edited', type: 'bing', baseUrl: 'https://search.example/updated', count: 8, timeoutMs: 12000 });
  assert.equal(result.data.provider.id, sourceId); assert.equal(kernel.config.get().webSearch.providers.length, 1); assert.equal(kernel.config.get().webSearch.providers[0].apiKey, 'search-secret');
  await request('PUT', '/api/memory-files/group_123/members/123', { name: '甲', impressions: ['喜欢数学'], note: '' }); assert.equal(kernel.config.get().memberNotes['123'], undefined); assert.equal(kernel.config.get().memberNotes['456'], '保留备注');

  console.log('· 聊天超过500条的双向分页、forward缓存以及入库类型');
  for (let i = 0; i < 610; i++) kernel.store.appendIncoming('group:123', { mid: i + 1, senderId: '123', senderName: '甲', text: `第${i + 1}条` });
  result = await request('GET', '/api/chats/group_123/messages?limit=500'); assert.equal(result.data.messages.length, 500); assert.equal(result.data.hasMore, true); assert.equal(result.data.total, 610);
  const oldest = result.data.messages[0].id; result = await request('GET', `/api/chats/group_123/messages?beforeId=${oldest}&limit=200`); assert.equal(result.data.messages.length, 110); assert.equal(result.data.hasMore, false); assert.equal(result.data.messages[0].text, '第1条');
  assert.equal((await request('GET', '/api/chats/group_123/messages?offset=600&limit=20')).data.messages.length, 10);
  const incoming = await kernel.ingest.ingestMessage({ kind: 'group', id: '123', event: { user_id: '123', message_id: 900, message: [{ type: 'forward', data: { id: 'res' } }] } });
  assert.equal(incoming.accepted, true); assert.equal(incoming.entry.media[0].kind, 'forward');
  result = await request('GET', `/api/chats/group_123/messages/${incoming.entry.id}/forward`); assert.equal(result.data.messages[0].text, '转发文本');
  assert.equal((await request('GET', `/api/chats/group_123/messages/${incoming.entry.id}/forward`)).data.cached, true); assert.equal(forwardCalls, 1);

  console.log('· 全历史包含一年以前；过去24小时与渠道/会话下钻实际子集');
  const seed = (at, provider, tokens) => { const s = kernel.sessions.create('group:123'); Object.assign(s, { startedAt: at, provider, model: 'model-a', usage: { promptTokens: tokens, completionTokens: 0, totalTokens: tokens, cachedTokens: 0, calls: 1 } }); kernel.sessions.finish(s.id, 'done'); return s.id; };
  const old = seed(Date.now() - 500 * 86400000, 'first', 100), recent = seed(recentTodayAt(Date.now()), 'imported', 20); seed(Date.now() - 25 * 3600000, 'first', 30);
  result = await request('GET', '/api/usage/stats?range=all'); assert.equal(result.data.totals.totalTokens, 150); assert.ok(result.data.sessions.some((row) => row.sessionId === old));
  assert.equal((await request('GET', '/api/usage/stats?range=24h')).data.totals.totalTokens, 20);
  result = await request('GET', '/api/usage/breakdown?range=all&dim=provider&key=imported&by=session'); assert.equal(result.data.totals.totalTokens, 20); assert.equal(result.data.rows[0].key, recent);
  console.log('· 会话保留清理后历史用量、下钻与手填缓存价格仍正确');
  kernel.sessions.setKeepFiles(1); kernel.sessions.clearFinished();
  assert.equal(kernel.sessions.listSummaries().length, 0);
  assert.equal((await request('GET', '/api/usage/stats?range=all')).data.totals.totalTokens, 150);
  result = await request('GET', '/api/usage/breakdown?range=all&dim=provider&key=imported&by=session'); assert.equal(result.data.rows[0].key, recent); assert.equal(result.data.totals.totalTokens, 20);
  kernel.config.update({ api: { useOfficialPrice: false, priceInputPerM: 10, priceOutputPerM: 0, priceCachedPerM: 0 } });
  for (let i = 0; i < 2; i++) { const session = kernel.sessions.create('group:123'); Object.assign(session, { model: 'manual-cache', providerId: 'manual-provider', usage: { promptTokens: 1000000, completionTokens: 0, totalTokens: 1000000, cachedTokens: 1000000, calls: 1 } }); kernel.sessions.finish(session.id, 'done'); }
  result = await request('GET', '/api/usage/breakdown?range=today&dim=provider&key=manual-provider&by=session'); assert.equal(result.data.totals.cost, 20); assert.equal(result.data.rows.length, 2);

  console.log('· 当天日档不遮盖实时/重试用量；历史成本不随新价格改变');
  const running = kernel.sessions.create('group:123');
  kernel.sessions.update(running, { model: 'manual-cache', providerId: 'manual-provider', usage: { promptTokens: 500000, completionTokens: 0, totalTokens: 500000, cachedTokens: 0, calls: 1 }, messages: [{ role: 'tool', toolCall: { name: 'running-tool' } }] });
  result = await request('GET', '/api/usage/stats?range=today'); assert.equal(result.data.totals.totalTokens, 2500020); assert.equal(result.data.toolCounts['running-tool'], 1);
  kernel.sessions.finish(running.id, 'done'); const archivedCost = (await request('GET', '/api/usage/stats?range=today')).data.totals.cost;
  assert.equal(archivedCost, 25.00002);
  kernel.config.update({ api: { priceInputPerM: 30 } });
  result = await request('GET', '/api/usage/stats?range=today'); assert.equal(result.data.totals.cost, archivedCost);
  assert.equal((await request('GET', '/api/usage/breakdown?range=today&dim=provider&key=manual-provider&by=session')).data.totals.cost, 25);
  kernel.sessions.update(running, { status: 'running', usage: { promptTokens: 600000, completionTokens: 0, totalTokens: 600000, cachedTokens: 0, calls: 2 }, messages: [...running.messages, { role: 'tool', toolCall: { name: 'running-tool' } }] });
  result = await request('GET', '/api/usage/stats?range=today'); assert.equal(result.data.totals.totalTokens, 2600020); assert.equal(result.data.totals.cost, archivedCost + 3); assert.equal(result.data.totals.runs, 4); assert.equal(result.data.toolCounts['running-tool'], 2);
  kernel.sessions.finish(running.id, 'done'); assert.equal((await request('GET', '/api/usage/stats?range=today')).data.totals.cost, archivedCost + 3);

  console.log('· 旧匿名汇总与有身份日档共存时仅累加新差值');
  const legacyAt = Date.now() - 3 * 86400000, date = new Date(legacyAt), legacyDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  fs.writeFileSync(path.join(dataDir, 'usage-days', `${legacyDay}.json`), JSON.stringify({ version: 1, day: legacyDay, aggregates: { totals: { totalTokens: 100, promptTokens: 100, exactCalls: 1, runs: 1, cost: 1 }, toolCounts: { 'legacy-tool': 1 } } }));
  const legacy = kernel.sessions.create('group:123');
  kernel.sessions.update(legacy, { startedAt: legacyAt, providerId: 'legacy-provider', model: 'legacy', usage: { promptTokens: 150, completionTokens: 0, totalTokens: 150, cachedTokens: 0, calls: 2 }, accountedUsage: { promptTokens: 100, totalTokens: 100, calls: 1, counted: true }, accountedTotals: { toolCounts: { 'legacy-tool': 1 } }, messages: [{ toolCall: { name: 'legacy-tool' } }, { toolCall: { name: 'legacy-tool' } }] });
  result = await request('GET', '/api/usage/breakdown?range=all&dim=day&key=' + legacyDay + '&by=day'); assert.equal(result.data.totals.totalTokens, 150); assert.equal(result.data.totals.runs, 1); assert.equal(result.data.totals.exactCalls, 2);
  result = await request('GET', '/api/usage/stats?range=all'); assert.equal(result.data.toolCounts['legacy-tool'], 2);
  kernel.sessions.finish(legacy.id, 'done'); result = await request('GET', '/api/usage/breakdown?range=all&dim=day&key=' + legacyDay + '&by=day'); assert.equal(result.data.totals.totalTokens, 150); assert.equal(result.data.totals.runs, 1); assert.equal(result.data.totals.exactCalls, 2);
  const zero = kernel.sessions.create('group:123'); kernel.sessions.update(zero, { providerId: 'zero-retry', model: 'manual-cache' }); kernel.sessions.finish(zero.id, 'noreply');
  kernel.sessions.update(zero, { status: 'running', usage: { promptTokens: 3, completionTokens: 0, totalTokens: 3, cachedTokens: 0, calls: 1 } });
  result = await request('GET', '/api/usage/breakdown?range=today&dim=provider&key=zero-retry&by=session'); assert.equal(result.data.totals.runs, 1); assert.equal(result.data.rows[0].runs, 1);
  kernel.sessions.finish(zero.id, 'done'); assert.equal((await request('GET', '/api/usage/breakdown?range=today&dim=provider&key=zero-retry&by=session')).data.totals.runs, 1);

  if (process.argv.includes('--http-only')) {
    assert.deepEqual(kernel.loader.listEntries(), []); assert.equal(outbound, 0); assert.equal(dnsCalls, 0);
    console.log('✓ 83 isolated HTTP/disk assertions passed; browser assertions not run (--http-only)');
  } else {
  console.log('· 真实Chromium：分群、备选顺序、价格清除、搜索编辑、YAML导入完整保存链');
  const playwright = createRequire(import.meta.url)('playwright-core');
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map((version) => path.join(cache, version, 'chrome-win64/chrome.exe')).find((file) => fs.existsSync(file));
  browser = await playwright.chromium.launch({ executablePath, headless: process.env.QA_HEADLESS !== '0' }); const page = await browser.newPage({ viewport: { width: 1360, height: 900 } }); const errors = []; page.on('pageerror', (err) => errors.push(err.message));
  await page.route('**/*', route => { const url = route.request().url(); if (new URL(url).origin === new URL(base).origin) return route.continue(); browserOutbound.push(url); return route.abort(); });
  await page.goto(`${base}/?token=${token}`); await page.locator('#nav button[data-panel="settings"]').click(); const frame = page.frameLocator('#panel-host iframe'); await frame.locator('#status').filter({ hasText: '配置已读取' }).waitFor();
  async function openSection(id) { await settingsSection(frame,id);if(id==='models')await openSettingsFold(frame,'layout-fallback');if(id==='search')await settingsEditor(frame,'search-manager'); }
  const modal = () => frame.locator('dialog.settings-spec-dialog');
  async function commit() { await modal().getByRole('button', { name: '保存', exact: true }).click(); await modal().waitFor({ state: 'detached' }); }
  await openSection('wake'); await frame.getByRole('button', { name: '管理分群档位' }).click(); await modal().getByLabel('平时滑条 0~100（空白跟随）').fill('70'); await modal().getByLabel('高峰滑条 0~100（空白跟随）').fill(''); await commit(); assert.equal(kernel.config.get().store.groupSliderPos['123'], 70); assert.equal(kernel.config.get().store.groupPeakPos['123'].peak, undefined);
  await openSection('models'); await frame.getByRole('button', { name: '管理备选模型' }).click(); await modal().getByRole('button', { name: '添加备选模型' }).click(); await modal().getByLabel('模型 ID').fill('model-b'); await modal().locator('select').selectOption('first'); await commit(); assert.deepEqual(kernel.config.get().api.fallbackModels, [{ model: 'model-b', provider: 'first' }]);
  await openSection('prices'); await frame.getByRole('button', { name: '批量编辑模型价格' }).click(); const obsolete = modal().locator('fieldset').filter({ hasText: 'obsolete-model' });
  await obsolete.getByRole('button', { name: '清除自定义价', exact: true }).evaluate(button => {
    window.qa83PriceAfterClicks = []; button.addEventListener('click', () => window.qa83PriceAfterClicks.push(document.querySelector('[data-model="obsolete-model"][data-price="in"]').value));
  });
  await obsolete.getByRole('button', { name: '清除自定义价', exact: true }).click({ clickCount: 2, delay: 30 });
  assert.deepEqual(await modal().evaluate(() => window.qa83PriceAfterClicks), ['3', ''], '第一次真实点击保留自定义价，第二次才清除草稿');
  await modal().locator('[data-model="model-a"][data-price="in"]').fill('0'); await commit(); assert.equal(kernel.config.get().api.modelPrices['obsolete-model'], undefined); assert.equal(kernel.config.get().api.modelPrices['model-a'].in, 0);
  await openSection('search'); await frame.locator('#search-provider-list').getByRole('button', { name: '编辑', exact: true }).click(); await modal().getByLabel('接口地址').fill('https://edited.example/search'); await commit(); assert.equal(kernel.config.get().webSearch.providers[0].baseUrl, 'https://edited.example/search'); assert.equal(kernel.config.get().webSearch.providers[0].apiKey, 'search-secret');
  await settingsEditor(frame,'model-manager'); await frame.getByRole('button', { name: '导入渠道 YAML' }).click(); await modal().locator('textarea').fill('providers:\n  - id: ui-import\n    baseURL: https://ui.example/v1\n    models: [ui-model]'); await commit(); assert.ok(kernel.config.get().providers.some((provider) => provider.id === 'ui-import'));
  assert.deepEqual(kernel.loader.listEntries(), [], 'no extension owner was loaded during the UI workflow'); assert.equal(outbound, 0); assert.equal(dnsCalls, 0); assert.deepEqual(browserOutbound, []);
  assert.deepEqual(errors, []); console.log('✓ 83 配置/控制台规格补齐全部通过');
  }
} finally { await browser?.close(); await kernel.stop(); globalThis.fetch = nativeFetch; dns.lookup = nativeLookup; assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dataDir).startsWith('qqa-spec83-')); fs.rmSync(dataDir, { recursive: true, force: true }); }

// R-71: real kernel HTTP + temporary disk. Chromium is a headless regression,
// not a substitute for the separate headed Electron acceptance record.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-memory-list102-'));
const appRoot = path.join(dataDir, 'application'), sourceRoot = path.resolve(import.meta.dirname, '..'); fs.mkdirSync(appRoot);
fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
for (const directory of ['ui', 'src']) fs.cpSync(path.join(sourceRoot, directory), path.join(appRoot, directory), { recursive: true });
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, directory));
// Real consolidation imports llm.js; keep the actual default memory/dialect
// extension closure rather than mocking the behavior under regression.
for (const id of ['llm-dialects', 'memory-service', 'memory-tools']) fs.cpSync(path.join(sourceRoot, 'bundled', id), path.join(appRoot, 'bundled', id), { recursive: true });
let outbound = 0, dnsCalls = 0; const browserOutbound = [], ownedOrigins = new Set();
const nativeFetch = globalThis.fetch, nativeLookup = dns.lookup;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (ownedOrigins.has(url.origin)) return nativeFetch(input, options);
  outbound++; throw new Error('QA102 external fetch disabled');
};
dns.lookup = async () => { dnsCalls++; throw new Error('QA102 external DNS disabled'); };
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
const memoryDir = path.join(dataDir, 'memory'), token = 'qa-memory-list102';
const dates = { 'group:10001': Date.UTC(2025, 0, 2, 3, 4, 5), 'private:20001': Date.UTC(2025, 0, 1), 'group:33333': Date.UTC(2025, 0, 3) };
for (const [key, updatedAt] of Object.entries(dates)) {
  const dir = path.join(memoryDir, key.replace(':', '_')); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '20001.json'), JSON.stringify({ userId: '20001', name: 'QA 已有成员', updatedAt, lastConsolidatedAt: 0,
    impressions: [{ content: 'QA 保留印象', createdAt: updatedAt - 1 }, { content: 'QA 原印象二', createdAt: updatedAt }] }));
}
function tree(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory()
    ? [`${item.name}/`, ...tree(path.join(dir, item.name)).map(name => `${item.name}/${name}`)] : [item.name]).sort();
}
const requests = [], pending = [];
const model = http.createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8'))); pending.push(res);
});
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
const modelOrigin = `http://127.0.0.1:${model.address().port}`; ownedOrigins.add(modelOrigin);
let kernel, port, browser;
async function start({ initialize = false } = {}) {
  kernel = createKernel({ appRoot, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(dataDir, 'absent') }, headless: true,
    fetchImpl: async (input, options) => { if (new URL(String(input)).origin === modelOrigin) return fetch(input, options); outbound++; throw new Error('QA102 external traffic disabled'); },
    transport: { id: 'qa-memory102', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
    priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) }, communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) } });
  kernel.loader.startWatchers = () => {};
  if (initialize) kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false }, proactive: { enabled: false },
    api: { baseUrl: `http://127.0.0.1:${model.address().port}/v1`, model: 'qa-memory' }, memory: { useChatModel: true },
    allow: { groups: [10001, '10001', '10002', ' 10002 ', 0, -1, 'abc', 'group:9', '0009', '9007199254740992', null, {}, '../evil', '1000000000000000', 1.5],
      private: [20001, '20002', ' 20002 ', '20002', true] } });
  port = await kernel.start(); ownedOrigins.add(`http://127.0.0.1:${port}`);
  assert.notEqual(port, 15967);
  const entries = kernel.loader.listEntries();
  assert.deepEqual(entries.map(entry => entry.id).sort(), ['llm-dialects', 'memory-service', 'memory-tools']);
  assert.ok(entries.every(entry => entry.root === 'bundled' && entry.status === 'active'), JSON.stringify(entries));
}
async function request(method, url, body) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'x-console-token': token, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
async function waitUntil(check) {
  for (let i = 0; i < 500; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Timed out waiting for memory list workflow');
}
const keys = result => result.files.map(file => file.chatKey);
try {
  await start({ initialize: true });
  const before = tree(memoryDir);
  console.log('· R-71 unions stored files and valid allow entries without duplicate rows or disk creation');
  let response = await request('GET', '/api/memory-files'); assert.equal(response.status, 200);
  assert.equal(response.data.files.length, 5);
  assert.deepEqual(keys(response.data).slice(0, 3), ['group:33333', 'group:10001', 'private:20001'], 'stored records stay sorted by updatedAt, including stored chats outside allow');
  assert.deepEqual(new Set(keys(response.data)), new Set([...Object.keys(dates), 'group:10002', 'private:20002']));
  assert.deepEqual(response.data.consolidating, []);
  for (const key of ['group:10002', 'private:20002']) assert.deepEqual(response.data.files.find(file => file.chatKey === key),
    { chatKey: key, impressionCount: 0, memberCount: 0, updatedAt: 0, consolidating: false });
  assert.equal(response.data.files.filter(file => file.chatKey === 'group:10001').length, 1);
  await request('GET', '/api/memory-files'); assert.deepEqual(tree(memoryDir), before, 'listing and refreshing do not materialize allow-only chats');

  console.log('· Live config removes unused placeholders, retains stored files and ignores malformed allow collections');
  kernel.config.update({ allow: { __replace__: { groups: [], private: [] } } });
  response = await request('GET', '/api/memory-files'); assert.deepEqual(keys(response.data), ['group:33333', 'group:10001', 'private:20001']);
  kernel.config.update({ allow: { __replace__: { groups: { unsafe: '10002' }, private: '20002' } } });
  response = await request('GET', '/api/memory-files'); assert.equal(response.data.files.length, 3);
  kernel.config.update({ allow: { __replace__: { groups: ['10001', '10002'], private: ['20001', '20002'] } } });
  assert.deepEqual(tree(memoryDir), before);

  console.log('· Actual in-flight consolidation flags survive the union and clear on completion');
  response = await request('POST', '/api/memory-files/consolidate', { chatKey: 'group:10001', userIds: ['20001'] }); assert.equal(response.status, 202);
  await waitUntil(() => pending.length === 1);
  response = await request('GET', '/api/memory-files'); assert.deepEqual(response.data.consolidating, ['group:10001']);
  assert.equal(response.data.files.find(file => file.chatKey === 'group:10001').consolidating, true);
  assert.equal(response.data.files.find(file => file.chatKey === 'private:20002').consolidating, false);
  pending.shift().end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ impressions: ['QA 保留印象'] }) } }],
    usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } }));
  await waitUntil(async () => (await request('GET', '/api/memory-files')).data.consolidating.length === 0);
  assert.equal(requests.length, 1);

  console.log('· Real headless Chromium renders dates and opens an allow-only private chat to create a member');
  const playwright = createRequire(import.meta.url)('playwright-core');
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.existsSync(cache) ? fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9))) : [];
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(version => path.join(cache, version, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file));
  assert.ok(executablePath, 'installed local Chromium is required; do not download a browser');
  browser = await playwright.chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  await routeOwnedPage(page, `http://127.0.0.1:${port}`);
  await page.goto(`http://127.0.0.1:${port}/?token=${token}`); await page.locator('#nav button[data-panel=memory]').click();
  const frame = page.frameLocator('#panel-host iframe');
  assert.equal(await frame.locator('[data-memory-chat="group:33333"]').count(),0,'stored chats outside the whitelist are hidden from the default memory browser');
  const stored = frame.locator('#list article').filter({ has: frame.locator('strong').filter({ hasText: 'private:20001' }) });
  await stored.waitFor();
  const storedText = await stored.textContent(); assert.match(storedText, new RegExp(`更新于.*${new Date(dates['private:20001']).getFullYear()}`)); assert.doesNotMatch(storedText, new RegExp(String(dates['private:20001'])));
  const empty = frame.locator('#list article').filter({ has: frame.locator('strong').filter({ hasText: 'private:20002' }) });
  assert.match(await empty.textContent(), /0 位成员 · 0 条印象 · 暂无更新/);
  await empty.locator('strong').click();
  await frame.locator('#detail').getByText('暂无成员印象', { exact: true }).waitFor();
  assert.equal(await frame.locator('#detail').getByRole('button', { name: '成员列表', exact: true }).count(), 0);
  await frame.locator('#detail').getByRole('button', { name: '新增成员', exact: true }).click();
  await frame.locator('dialog input[name=userId]').fill('20004');
  await frame.locator('dialog input[name=name]').fill('QA 空档成员');
  await frame.locator('dialog textarea[name=impressions]').fill('QA 空档新增印象');
  await frame.locator('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await frame.locator('.member-cards article').filter({ hasText: 'QA 空档新增印象' }).waitFor();
  const memberFile = path.join(memoryDir, 'private_20002', '20004.json');
  assert.equal(JSON.parse(fs.readFileSync(memberFile, 'utf8')).impressions[0].content, 'QA 空档新增印象');
  response = await request('GET', '/api/memory-files'); assert.equal(response.data.files.filter(file => file.chatKey === 'private:20002').length, 1);
  assert.equal(response.data.files.find(file => file.chatKey === 'private:20002').memberCount, 1);
  assert.deepEqual(errors, []);

  console.log('· Restart preserves both stored rows and unmaterialized allow-only rows');
  await browser.close(); browser = null; await kernel.stop(); kernel = null; await start();
  response = await request('GET', '/api/memory-files'); assert.equal(response.data.files.length, 5);
  assert.equal(response.data.files.find(file => file.chatKey === 'private:20002').memberCount, 1);
  assert.equal(response.data.files.find(file => file.chatKey === 'group:10002').updatedAt, 0);
  assert.equal(fs.existsSync(path.join(memoryDir, 'group_10002')), false);
  assertOffline();
  assert.deepEqual(kernel.loader.listEntries().map(entry => entry.id).sort(), ['llm-dialects', 'memory-service', 'memory-tools']);
  console.log('✓ 102 real memory allow-list, persistence and headless UI regression passed');
} finally {
  for (const res of pending) res.destroy(); await browser?.close(); await kernel?.stop();
  model.closeAllConnections(); await new Promise(resolve => model.close(resolve));
  globalThis.fetch = nativeFetch; dns.lookup = nativeLookup;
  const target = path.resolve(dataDir), allowed = path.resolve(os.tmpdir());
  assert.ok(target.startsWith(`${allowed}${path.sep}`) && path.basename(target).startsWith('qqa-memory-list102-'));
  fs.rmSync(target, { recursive: true, force: true });
}

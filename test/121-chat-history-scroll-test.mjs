// Real archive/store/routes + isolated Chromium. Waiting for an old read is
// cancelled on a chat switch; its existing read-only HTTP GET may still finish.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';
import { isolateConsoleFixture } from './console-fixture-isolation.mjs';
import { createChatHistory } from '../ui/panels/chats/history.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async check => { for (let i = 0; i < 200; i++) { if (await check()) return; await pause(25); } assert.fail('history state did not settle'); };
console.log('· Generation cancellation, protocol/local identity dedup and coalescing use actual history helper');
{
  let release, entered; const started = new Promise(resolve => entered = resolve), changes = [];
  const history = createChatHistory({ request: async (key, query) => {
    if (key === 'old') { entered(); return new Promise(resolve => release = resolve); }
    return { messages: [{ id: 1, mid: 11, text: key }], hasMore: false };
  }, onChange: value => changes.push(value) });
  const old = history.select('old'); await started; await history.select('new');
  await old; release({ messages: [{ id: 7, mid: 77, text: 'stale' }], hasMore: true }); await pause(0);
  assert.deepEqual(changes.map(change => change.key), ['new']); assert.equal(history.messages[0].text, 'new'); history.dispose();
}
{
  const history = createChatHistory({ request: async () => ({ messages: [
    { id: 3, mid: 30, text: 'old' }, { id: 3, mid: 30, text: 'updated' }, { id: 4, mid: 30, text: 'new representation' },
    { id: 1, mid: null, text: 'unknown one' }, { id: 2, mid: null, text: 'unknown two' },
  ], hasMore: false }), onChange() {} });
  await history.select('dedup'); assert.deepEqual(history.messages.map(row => row.id), [1, 2, 4]); history.dispose();
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-history121-')), key = 'group:12101', uiKey = 'group_12101';
const isolation = isolateConsoleFixture(dataDir, '121');
const token = 'history121', kernel = createKernel({appRoot:isolation.appRoot,env:isolation.env,headless:true,
  transport: { id: 'fixture', start() {}, stop() {}, status: () => ({ connected: true }), actions: { getGroupName: async () => 'QA history' } },
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) }, communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) } });
let browser;
kernel.loader.startWatchers=()=>{};
try {
  kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false }, proactive: { enabled: false },allow:{groups:['12101','12102']} });
  const start = Date.now() - 900000;
  for (let i = 1; i <= 805; i++) kernel.store.appendIncoming(key, { mid: 121000 + i, ts: start + i * 1000,
    senderId: '21201', senderName: 'QA history member', text: `QA-HISTORY-${String(i).padStart(4, '0')}${i % 7 === 0 ? '\nsecond line\nthird line' : ''}`, atMe: false });
  for (let i = 1; i <= 3; i++) kernel.store.appendIncoming('group:12102', { mid: 221000 + i, senderId: '21202', text: `QA-OTHER-${i}`, atMe: false });
  const port = await kernel.start(), base = `http://127.0.0.1:${port}`; kernel.orchestrator.pause();
  isolation.allowOrigin(base);isolation.assertEmpty(kernel);
  const read = async query => (await (await fetch(`${base}/api/chats/${uiKey}/messages?${new URLSearchParams(query)}`, { headers: { 'x-console-token': token } })).json());
  let result = await read({ limit: 500 }); assert.equal(result.messages.length, 500); assert.equal(result.total, 805); assert.equal(result.messages[0].id, 306);
  result = await read({ limit: 200, beforeId: 306 }); assert.equal(result.messages.length, 200); assert.equal(result.hasMore, true); assert.equal(result.messages[0].id, 106);
  result = await read({ limit: 200, beforeId: 106 }); assert.equal(result.messages.length, 105); assert.equal(result.hasMore, false); assert.equal(result.messages[0].id, 1);

  const playwright = createRequire(import.meta.url)('playwright-core'), cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter(v => /^chromium-\d+$/.test(v)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(v => path.join(cache, v, 'chrome-win64/chrome.exe')).find(f => fs.existsSync(f)), headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } }), errors = [], reads = [];
  await isolation.bindPage(page,base);
  page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === `/api/chats/${uiKey}/messages`) reads.push({ limit: url.searchParams.get('limit'), beforeId: url.searchParams.get('beforeId') }); });
  await page.goto(`${base}/?token=${token}`); await page.locator('#nav button[data-panel=chats]').click();
  const frame = page.frameLocator('#panel-host iframe'), chat = frame.locator(`[data-chat="${uiKey}"]`), host = frame.locator('#detail .messages'), lines = host.locator(':scope > .message');
  await chat.click(); await waitFor(async () => await lines.count() === 500);
  const ids = () => lines.evaluateAll(nodes => nodes.map(node => Number(node.dataset.message)));
  assert.deepEqual(await ids(), Array.from({ length: 500 }, (_, i) => i + 306));
  await frame.locator('#detail').getByRole('button', { name: '选择消息', exact: true }).click();
  await host.locator('[data-message="630"] input[type=checkbox]').check();
  console.log('· Scroll-to-top automatically loads 200; the visible anchor and selected message survive');
  let release, notify, held = false;
  const blocked = new Promise(resolve => release = resolve), entered = new Promise(resolve => notify = resolve);
  const delayOlder = async route => {
    const url = new URL(route.request().url());
    if (!held && url.searchParams.get('limit') === '200') { held = true; const response = await route.fetch(); notify(); await blocked; await route.fulfill({ response }); }
    else await route.continue();
  };
  await page.route(`**/api/chats/${uiKey}/messages?*`, delayOlder);
  try {
    await host.evaluate(node => { node.scrollTop = 0; }); await waitFor(() => held); await entered;
    const anchor = await host.evaluate(node => { const bounds = node.getBoundingClientRect(), first = [...node.children].find(row => row.getBoundingClientRect().bottom > bounds.top); return { id: first.dataset.message, offset: first.getBoundingClientRect().top - bounds.top }; });
    const before = reads.length;
    await host.evaluate(node => { for (let i = 0; i < 12; i++) node.dispatchEvent(new Event('scroll')); });
    for (let i = 0; i < 8; i++) kernel.bus.emit('chat.update', key);
    await pause(150); assert.equal(reads.length, before, 'in-flight page and SSE refreshes are not duplicated');
    release(); await waitFor(async () => await lines.count() === 700); await pause(150);
    assert.deepEqual(await ids(), Array.from({ length: 700 }, (_, i) => i + 106));
    const after = await host.evaluate((node, id) => { const row = [...node.children].find(row => row.dataset.message === id); return row.getBoundingClientRect().top - node.getBoundingClientRect().top; }, anchor.id);
    assert.ok(Math.abs(after - anchor.offset) <= 1, `anchor moved by ${after - anchor.offset}px`);
    assert.equal(await host.locator('[data-message="630"] input[type=checkbox]').isChecked(), true);
    assert.equal(reads.filter(read => read.limit === '200' && read.beforeId === '306').length, 2, 'one older load plus one coalesced full-window revalidation, never concurrent duplicate loads');
  } finally { release(); await page.unroute(`**/api/chats/${uiKey}/messages?*`, delayOlder); }

  console.log('· The final short page has no gaps/duplicates and end-of-history stops scrolling requests');
  let releaseEnd, notifyEnd, endHeld = false;
  const endBlocked = new Promise(resolve => releaseEnd = resolve), endEntered = new Promise(resolve => notifyEnd = resolve);
  const delayEnd = async route => { const url = new URL(route.request().url()); if (!endHeld && url.searchParams.get('beforeId') === '106') { endHeld = true; const response = await route.fetch(); notifyEnd(); await endBlocked; await route.fulfill({ response }); } else await route.continue(); };
  await page.route(`**/api/chats/${uiKey}/messages?*`, delayEnd);
  try {
    await host.evaluate(node => { node.scrollTop = 0; }); await waitFor(() => endHeld); await endEntered;
    const beforeEndY = await host.locator('[data-message="106"]').evaluate(node => node.getBoundingClientRect().top);
    releaseEnd(); await waitFor(async () => await lines.count() === 805);
    const afterEndY = await host.locator('[data-message="106"]').evaluate(node => node.getBoundingClientRect().top);
    assert.ok(Math.abs(afterEndY - beforeEndY) <= 1, `EOF hiding its load button moved the screen anchor by ${afterEndY - beforeEndY}px`);
  } finally { releaseEnd(); await page.unroute(`**/api/chats/${uiKey}/messages?*`, delayEnd); }
  assert.deepEqual(await ids(), Array.from({ length: 805 }, (_, i) => i + 1));
  assert.equal(await frame.locator('.load-older').isVisible(), false);
  const beforeEnd = reads.filter(read => read.limit === '200').length;
  await host.evaluate(node => { for (let i = 0; i < 12; i++) node.dispatchEvent(new Event('scroll')); }); await pause(150);
  assert.equal(reads.filter(read => read.limit === '200').length, beforeEnd);

  console.log('· SSE appends a new message without losing loaded history, anchor, selection or draft');
  await host.evaluate(node => { const row = node.querySelector('[data-message="450"]'); node.scrollTop = row.offsetTop - node.offsetTop + 5; });
  const stable = await host.locator('[data-message="450"]').evaluate(row => row.getBoundingClientRect().top - row.parentElement.getBoundingClientRect().top);
  await frame.locator('#test-send-text').fill('QA-UNSENT-DRAFT');
  kernel.store.appendIncoming(key, { mid: 121806, ts: Date.now(), senderId: '21201', text: 'QA-HISTORY-0806', atMe: false }); kernel.bus.emit('chat.update', key);
  await waitFor(async () => await lines.count() === 806);
  assert.equal(await frame.locator('#test-send-text').inputValue(), 'QA-UNSENT-DRAFT');
  assert.equal(await host.locator('[data-message="630"] input[type=checkbox]').isChecked(), true);
  const moved = await host.locator('[data-message="450"]').evaluate(row => row.getBoundingClientRect().top - row.parentElement.getBoundingClientRect().top);
  assert.ok(Math.abs(stable - moved) <= 1); assert.deepEqual(await ids(), Array.from({ length: 806 }, (_, i) => i + 1));

  console.log('· Selection for quote upload also survives an SSE append in the cached older prefix');
  await frame.locator('.selection-toggle').click();
  await frame.locator('.selection-toggle').click();
  await host.locator('[data-message="200"] input[type=checkbox]').check();
  kernel.store.appendIncoming(key, { mid: 121807, ts: Date.now(), senderId: '21201', text: 'QA-HISTORY-0807', atMe: false }); kernel.bus.emit('chat.update', key);
  await waitFor(async () => await lines.count() === 807);
  assert.equal(await host.locator('[data-message="200"] input[type=checkbox]').isChecked(), true);
  assert.match(await frame.locator('.selection-count').innerText(), /已选 1 条/);

  console.log('· Explicit Mark-read/Ignore updates every loaded row, including the older 300+ prefix');
  await frame.locator('.selection-toggle').click();
  const allRead = () => lines.evaluateAll(nodes => nodes.every(node => !node.querySelector('.meta').textContent.includes('未读')));
  await chat.getByRole('button', { name: '标读', exact: true }).click(); await waitFor(allRead);
  assert.equal(await lines.count(), 807); assert.equal(kernel.store.unread(key).length, 0);
  kernel.store.markEntriesUnread(key, kernel.store.recent(key, 1000).map(row => row.id)); kernel.bus.emit('chat.update', key);
  await waitFor(async () => await lines.evaluateAll(nodes => nodes.every(node => node.querySelector('.meta').textContent.includes('未读'))));
  await chat.getByRole('button', { name: '忽略当前未读', exact: true }).click(); await waitFor(allRead);
  assert.equal(kernel.store.unread(key).length, 0); assert.equal(await lines.count(), 807);

  console.log('· SSE revalidates older-prefix recall, media/text mutation and deletion without discarding history');
  kernel.store.markRecalled(key, 121002);
  kernel.store.updateByMid(key, 121003, { text: 'QA-HISTORY-0003-MUTATED', media: [{ kind: 'face', faceId: '121' }] });
  kernel.store.removeByLocalIds(key, [4]); kernel.bus.emit('chat.update', key);
  await waitFor(async () => await lines.count() === 806);
  assert.match(await host.locator('[data-message="2"] .meta').innerText(), /已撤回/);
  assert.equal(await host.locator('[data-message="3"] .body').innerText(), 'QA-HISTORY-0003-MUTATED');
  assert.match(await host.locator('[data-message="3"] .message-media').innerText(), /表情 121/);
  assert.deepEqual(await ids(), Array.from({ length: 807 }, (_, i) => i + 1).filter(id => id !== 4));

  console.log('· A late older-page reply cannot populate a different chat');
  await page.locator('#nav button[data-panel=settings]').click(); await page.locator('#nav button[data-panel=chats]').click();
  await chat.click(); await waitFor(async () => await lines.count() === 500);
  let releaseLate, notifyLate, taken = false;
  const lateBlocked = new Promise(resolve => releaseLate = resolve), lateEntered = new Promise(resolve => notifyLate = resolve);
  const lateOlder = async route => { const url = new URL(route.request().url()); if (!taken && url.searchParams.get('limit') === '200') { taken = true; const response = await route.fetch(); notifyLate(); await lateBlocked; await route.fulfill({ response }); } else await route.continue(); };
  await page.route(`**/api/chats/${uiKey}/messages?*`, lateOlder);
  try {
    await host.evaluate(node => { node.scrollTop = 0; }); await waitFor(() => taken); await lateEntered;
    await frame.locator('[data-chat="group_12102"]').click(); await waitFor(async () => await lines.count() === 3);
    releaseLate(); await pause(150);
    assert.deepEqual(await ids(), [1, 2, 3]); assert.match(await host.innerText(), /QA-OTHER-1/); assert.doesNotMatch(await host.innerText(), /QA-HISTORY/);
    assert.equal(await host.locator('input[type=checkbox]:checked').count(), 0);
  } finally { releaseLate(); await page.unroute(`**/api/chats/${uiKey}/messages?*`, lateOlder); }
  assert.deepEqual(errors, []);
  console.log('✓ 121 805+2 real archive rows, 500/200/105 paging, scroll/anchor/coalescing/selection/quote/draft/all-read/older-mutation/generation pass');
} finally {
  await browser?.close(); await kernel.stop();isolation.assertEmpty(kernel);isolation.restore();
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); fs.rmSync(dataDir, { recursive: true, force: true });
}

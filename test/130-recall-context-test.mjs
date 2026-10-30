// Temporary real kernels, normalized transport events, loopback HTTP models and
// headless Chromium. No current headed QA, real QQ or external model is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';
import { createChatStore } from '../src/kernel/store.js';
import { buildTriggerBlock, buildPastState, buildUserPrompt } from '../src/kernel/prompt.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async check => { for (let n = 0; n < 250; n++) { if (await check()) return; await pause(20); } assert.fail('130 fixture did not settle'); };
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-recall130-'));
const cleanup = folder => { assert.equal(path.dirname(path.resolve(folder)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase()); assert.ok(path.basename(folder).startsWith('qqa-recall130-')); fs.rmSync(folder, { recursive: true, force: true }); };
const choice = (name = 'finish', args = { reason: '130 controlled finish' }) => ({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `130-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }, model: 'offline130' });

async function runtime(t, { handler = () => choice(), maxMessages = 0 } = {}) {
  const root = temporary(), appRoot = path.join(root, 'app'), dataDir = path.join(root, 'data'), requests = [], actions = [];
  const workspace = path.resolve(import.meta.dirname, '..');
  const expectedEntries = ['core-tools', 'query-tools', 'llm-dialects'].sort();
  for (const kind of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, kind), { recursive: true });
  for (const name of ['src', 'ui']) fs.cpSync(path.join(workspace, name), path.join(appRoot, name), { recursive: true });
  for (const name of expectedEntries) fs.cpSync(path.join(workspace, 'bundled', name), path.join(appRoot, 'bundled', name), { recursive: true });
  fs.copyFileSync(path.join(workspace, 'package.json'), path.join(appRoot, 'package.json'));
  const blocked = [], browserBlocked = [], ownedOrigins = new Set(), browsers = [], dnsOriginals = [];
  const nativeFetch = globalThis.fetch;
  let loopbackLookups = 0, loadedEntries = [];
  globalThis.fetch = (input, init = {}) => {
    const url = new URL(input?.url ?? input);
    if (!ownedOrigins.has(url.origin)) { blocked.push({ kind: 'fetch', url: url.href }); return Promise.reject(new Error('130 forbids unowned HTTP')); }
    return nativeFetch(input, { ...init, redirect: 'error' });
  };
  for (const target of [dns, dnsPromises]) for (const key of Object.keys(target).filter(key => /^(lookup|resolve|reverse)/.test(key) && typeof target[key] === 'function')) {
    dnsOriginals.push([target, key, target[key]]);
    target[key] = (hostname, ...args) => {
      if (key === 'lookup' && ['127.0.0.1', '::1'].includes(hostname)) {
        loopbackLookups++;
        const address = { address: hostname, family: hostname === '::1' ? 6 : 4 }, options = args.find(value => value && typeof value === 'object');
        if (target === dnsPromises) return Promise.resolve(options?.all ? [address] : address);
        queueMicrotask(() => args.at(-1)(null, ...(options?.all ? [[address]] : [address.address, address.family]))); return;
      }
      blocked.push({ kind: 'dns', method: key }); throw new Error('130 forbids DNS');
    };
  }
  syncBuiltinESMExports();
  let kernel;
  const model = http.createServer(async (req, res) => {
    assert.equal(req.method, 'POST'); assert.equal(req.url, '/v1/chat/completions');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    const payload = await handler(body, requests.length);
    if (!res.destroyed) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); }
  });
  t.after(async () => {
    try {
      for (const browser of browsers) await browser.close();
      await kernel?.stop();
      model.closeAllConnections();
      if (model.listening) await new Promise(resolve => model.close(resolve));
      assert.deepEqual(blocked, [], 'actual Node fetch/DNS and host HTTP never left owned origins');
      assert.deepEqual(browserBlocked, [], 'browser requests never left the owned app origin');
      console.log(JSON.stringify({ isolation: 130, entries: loadedEntries, blocked, loopbackLookups, ownedOrigins: [...ownedOrigins], browserCount: browsers.length, browserBlocked }));
    } finally {
      globalThis.fetch = nativeFetch;
      for (const [target, key, original] of dnsOriginals) target[key] = original;
      syncBuiltinESMExports();
      cleanup(root);
    }
  });
  await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
  ownedOrigins.add(`http://127.0.0.1:${model.address().port}`);
  let event;
  kernel = createKernel({ appRoot, headless: true, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_PROFILE: '1', QQ_AGENT_MIGRATE_FROM: path.join(root, 'absent-migration-source') },
    transport: { id: 'local130', actions: { getSelfMemberInfo: async () => ({ muted: false }), getGroupName: async () => 'QA recall130' },
      bind({ onEvent, onStatus }) { event = onEvent; this.statusCallback = onStatus; },
      start() { this.statusCallback?.({ connected: true, selfId: '999' }); }, stop() {}, status: () => ({ connected: true, selfId: '999' }),
      async send(chatKey, segments) { actions.push({ chatKey, segments }); return { msgId: 900000 + actions.length }; } },
    priceUpdates: { resolve: () => null, refresh: async () => ({ ok: true }), updateCheck: async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },
    communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
    fetchImpl: async url => { blocked.push({ kind: 'host-fetch', url: String(url) }); throw new Error(`130 rejects external service: ${url}`); },
  });
  kernel.config.update({ server: { port: 0, token: 'qa130-owned' }, allow: { groups: ['13001', '13002'] },
    api: { baseUrl: `http://127.0.0.1:${model.address().port}/v1`, model: 'offline130', maxRounds: 4, thinkingMode: 'off', timeoutMs: 5000 },
    telemetry: { enabled: false }, proactive: { enabled: false }, memory: { consolidateEnabled: false },
    wakeDelayMs: 200, drainDelayMs: 200, sessionRetryAttempts: 0,
    store: { contextSliderPos: 100, historyCount: 50, maxMessagesPerChat: maxMessages, promptAnchor: { enabled: true, maxExtraRead: 4 } },
    send: { minGapMs: 0, maxGapMs: 0, byLengthMs: 0, dedupeWindowMs: 0 },
  });
  kernel.log.setLevel('error'); await kernel.start();
  loadedEntries = kernel.loader.listEntries().map(entry => entry.id).sort();
  assert.deepEqual(loadedEntries, expectedEntries);
  assert.ok(kernel.loader.listEntries().every(entry => entry.status === 'active'));
  for (const id of ['finish', 'send_message', 'get_message_detail', 'get_recent_messages', 'get_chats', 'read_forward', 'get_message_images', 'read_video']) assert.ok(kernel.registry.get(id), `actual bundled tool ${id} is registered`);
  const base = `http://127.0.0.1:${kernel.httpServer.port}`;
  ownedOrigins.add(base);
  const api = async (method, route, body) => {
    const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json', 'x-console-token': 'qa130-owned' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  const incoming = async (mid, text, replyMid = null, group = '13001') => { await event({ kind: 'group', id: group, type: 'message', event: {
    message_id: mid, time: Math.floor(Date.now() / 1000), user_id: 213001, sender: { user_id: 213001, nickname: 'QA source130' },
    message: [...(replyMid === null ? [] : [{ type: 'reply', data: { id: replyMid } }]), { type: 'text', data: { text } }],
  } }); await until(() => kernel.store.findByMid(`group:${group}`, mid)); };
  const recall = async (mid, group = '13001') => { await event({ kind: 'group', id: group, type: 'recall', event: { message_id: mid, group_id: Number(group) } }); await until(() => kernel.store.findByMid(`group:${group}`, mid)?.recalled); };
  const invoke = async (id, args = {}) => {
    const result = await kernel.registry.invoke(id, args, { execCtx: { chatKey: 'group:13001', session: { pastStateCount: 0 }, signal: new AbortController().signal } });
    assert.equal(result.ok, true, result.error); return result.result;
  };
  return { kernel, dataDir, requests, actions, base, api, incoming, recall, invoke, browserBlocked, ownBrowser: browser => browsers.push(browser), baselineWakeTimers: kernel.orchestrator.status().wakeTimers };
}

test('paused seed/reply/recall/resume filters future real HTTP prompts and updates visible archive references', async t => {
  const e = await runtime(t); await e.api('POST', '/api/pause', { paused: true });
  const secret = 'QA-RECALLED-130-<script>literal';
  await e.incoming('1300101', secret); await e.incoming(1300102, 'QA-SURVIVING-REPLY-130', '1300101');
  const rawReply = e.kernel.store.findByMid('group:13001', 1300102).reply;
  assert.equal(rawReply.mid, 1300101); assert.equal(rawReply.text, secret);

  const playwright = createRequire(import.meta.url)('playwright-core');
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(name => path.join(cache, name, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file)) });
  e.ownBrowser(browser);
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === e.base) return route.continue();
    e.browserBlocked.push(url.href); return route.abort('blockedbyclient');
  });
  await page.goto(`${e.base}/?token=qa130-owned`); await page.locator('#nav button[data-panel=chats]').click();
  const frame = page.frameLocator('#panel-host iframe'); await frame.locator('[data-chat="group_13001"]').click();
  const referenced = frame.locator('.message[data-message="2"] blockquote'); await referenced.filter({ hasText: secret }).waitFor();
  await e.recall(1300101);
  await referenced.filter({ hasText: '引用消息已撤回' }).waitFor(); assert.ok(!(await referenced.textContent()).includes(secret));
  assert.equal(await frame.locator('.message[data-message="1"] .body').textContent(), secret, 'original archive stays visible and is only marked recalled');
  await frame.locator('.message[data-message="1"] .meta').filter({ hasText: '已撤回' }).waitFor();
  await e.api('POST', '/api/pause', { paused: false }); await until(() => e.requests.length === 1 && !e.kernel.sessions.running().length);
  assert.ok(!JSON.stringify(e.requests[0].messages).includes(secret));
  assert.match(JSON.stringify(e.requests[0].messages), /QA-SURVIVING-REPLY-130/); assert.match(JSON.stringify(e.requests[0].messages), /引用消息已撤回/);
  assert.deepEqual(e.kernel.store.unread('group:13001'), []);
  const detail = await e.invoke('get_message_detail', { messageId: 1300101 }); assert.equal(detail.ok, false);
  const safeReply = await e.invoke('get_message_detail', { messageId: 1300102 }); assert.equal(safeReply.result.reply.status, 'recalled'); assert.ok(!JSON.stringify(safeReply).includes(secret));
  const recent = await e.invoke('get_recent_messages', { limit: 100 }); assert.ok(!JSON.stringify(recent).includes(secret));
  for (const id of ['read_forward', 'get_message_images', 'read_video']) assert.equal((await e.invoke(id, { messageId: 1300101 })).ok, false);
  await e.incoming(1300103, 'QA-RECALLED-LAST-130'); await e.recall(1300103);
  const chats = await e.invoke('get_chats'); assert.ok(!JSON.stringify(chats).includes('QA-RECALLED-LAST-130'));
  const disk = JSON.parse(fs.readFileSync(path.join(e.dataDir, 'messages', 'group_13001.json'), 'utf8'));
  assert.equal(disk.messages[0].text, secret); assert.equal(disk.messages[1].reply.text, secret, 'cached original is retained only in the archive');
});

test('missing, legacy, deleted and duplicate protocol references degrade safely and survive restart', () => {
  const root = temporary(); try {
    const store = createChatStore({ dataDir: root, log: {} }); const chat = 'group:13001';
    const first = store.appendIncoming(chat, { mid: '-1301', text: 'DUPLICATE-PRIVATE-130', senderName: 'A' });
    store.appendIncoming(chat, { mid: -1301, text: 'DUPLICATE-PRIVATE-130', senderName: 'A' });
    const reply = store.appendIncoming(chat, { mid: 1302, text: 'safe reply', reply: { mid: -1301, sender: 'A', text: 'DUPLICATE-PRIVATE-130' } });
    const legacy = store.appendIncoming(chat, { mid: null, text: '[引用 A：LEGACY-PRIVATE-130[图片]] legacy body', reply: { sender: 'A', text: 'LEGACY-PRIVATE-130[图片]' } });
    const missing = store.appendIncoming(chat, { mid: 1303, text: 'missing body', reply: { mid: 777, sender: 'A', text: 'MISSING-PRIVATE-130' } });
    for (const invalid of [null, undefined, '', ' ', 0, '0', NaN]) assert.equal(store.markRecalled(chat, invalid), false);
    assert.equal(store.recent(chat, Infinity).some(row => row.mid === null && row.recalled), false);
    assert.equal(store.markRecalled(chat, -1301), true); assert.equal(store.recent(chat, Infinity).filter(row => row.recalled).length, 2);
    assert.equal(store.findByMid(chat, 1302, { forContext: true }).reply.status, 'recalled');
    assert.equal(store.markEntriesUnread(chat, [first.id]), 0); assert.equal(store.markUnreadInWindow(chat, 0, Infinity), 0);
    const projected = store.recent(chat, Infinity, { forContext: true });
    assert.equal(projected.find(row => row.id === legacy.id).reply.status, 'legacy'); assert.equal(projected.find(row => row.id === missing.id).reply.status, 'missing');
    const prompt = buildPastState(projected).text; assert.ok(!/PRIVATE-130/.test(prompt)); assert.match(prompt, /旧引用来源无法核实/); assert.match(prompt, /引用消息不存在或已移除/);
    assert.ok(!buildTriggerBlock(store.recent(chat, Infinity)).text.includes('LEGACY-PRIVATE-130'), 'raw legacy formatting also strips the generated inline summary');
    assert.equal(store.recent(chat, Infinity).find(row => row.id === legacy.id).text, '[引用 A：LEGACY-PRIVATE-130[图片]] legacy body');
    assert.equal(buildTriggerBlock(store.recent(chat, Infinity)).text.includes('DUPLICATE-PRIVATE-130'), false);
    assert.equal(buildTriggerBlock([{ ...first, recalled: true }]).count, 0);
    assert.ok(!buildUserPrompt({ triggerEntries: [{ ...first, recalled: true }], anchorState: { mode: 'anchor', extraMessages: [{ ...first, recalled: true }] } }).includes('DUPLICATE-PRIVATE-130'));
    store.removeByLocalIds(chat, [first.id, first.id + 1]);
    assert.equal(store.findByMid(chat, 1302, { forContext: true }).reply.status, 'missing');
    const restarted = createChatStore({ dataDir: root, log: {} });
    assert.equal(restarted.findByMid(chat, 1302).reply.text, 'DUPLICATE-PRIVATE-130');
    assert.equal(restarted.findByMid(chat, 1302, { forContext: true }).reply.status, 'missing');
    assert.equal(restarted.findByMid(chat, 1303, { forContext: true }).reply.status, 'missing');
    assert.equal(restarted.recent(chat, Infinity, { forContext: true }).find(row => row.id === legacy.id).reply.status, 'legacy');
  } finally { cleanup(root); }
});

test('all recalled trigger batches discard without a model call; later anchors exclude source and stale quote', async t => {
  const e = await runtime(t); await e.api('POST', '/api/pause', { paused: true });
  await e.incoming(1300201, 'ALL-RECALLED-130', null, '13002'); await e.recall(1300201, '13002');
  await e.api('POST', '/api/pause', { paused: false }); await pause(350); assert.equal(e.requests.length, 0);
  assert.equal(e.kernel.orchestrator.status().waiting.length, 0);
  await e.incoming(1300205, 'WAITING-ALL-RECALLED-130', null, '13002');
  await until(() => e.kernel.orchestrator.status().waiting.some(row => row.chatKey === 'group:13002'));
  await e.recall(1300205, '13002'); await until(() => !e.kernel.orchestrator.status().waiting.length);
  assert.equal(e.requests.length, 0, 'the already scheduled waiting batch is discarded when every trigger is recalled');
  await e.incoming(1300202, 'ANCHOR-SOURCE-130'); await until(() => e.requests.length === 1 && !e.kernel.sessions.running().length);
  await e.incoming(1300203, 'ANCHOR-REPLY-130', 1300202); await until(() => e.requests.length === 2 && !e.kernel.sessions.running().length);
  await e.recall(1300202); await e.incoming(1300204, 'ANCHOR-NEW-130'); await until(() => e.requests.length === 3 && !e.kernel.sessions.running().length);
  assert.ok(!JSON.stringify(e.requests[2].messages).includes('ANCHOR-SOURCE-130')); assert.match(JSON.stringify(e.requests[2].messages), /引用消息已撤回/);
  const rows = await e.api('GET', '/api/sessions'); const latest = rows.sessions[0];
  const detail = await e.api('GET', `/api/sessions/${latest.id}`); assert.equal(detail.promptAnchorMode, 'reset');
});

test('recall during a tool round cancels the old conversation and drains only independent new unread messages', async t => {
  let release, reached; const hold = new Promise(resolve => release = resolve), entered = new Promise(resolve => reached = resolve);
  const e = await runtime(t, { handler: (_body, count) => count === 1 ? choice('get_message_detail', { messageId: 1300300 }) : choice() });
  e.kernel.config.update({ store: { historyCount: 1 } });
  e.kernel.store.appendIncoming('group:13001', { mid: 1300300, senderName: 'A', text: 'TOOL-ONLY-RECALLED-130' });
  e.kernel.store.appendIncoming('group:13001', { mid: 1300299, senderName: 'A', text: 'NEAREST-READ-130' });
  e.kernel.store.markAllRead('group:13001');
  const hooks = e.kernel.loader.hooksOf.bind(e.kernel.loader);
  e.kernel.loader.hooksOf = name => [...hooks(name), ...(name === 'after-tool' ? [{ ownerId: '130-local-gate', fn: async () => { reached(); await hold; } }] : [])];
  await e.incoming(1300301, 'RUNNING-TRIGGER-130'); await entered;
  assert.ok(!JSON.stringify(e.requests[0].messages).includes('TOOL-ONLY-RECALLED-130'), 'the source was outside the initial prompt and entered only through the real query tool');
  const oldId = e.kernel.sessions.running()[0].id;
  await e.recall(1300300); await e.incoming(1300302, 'INDEPENDENT-NEW-130'); release();
  await until(() => e.requests.length === 2 && !e.kernel.sessions.running().length);
  assert.equal(e.kernel.sessions.get(oldId).status, 'aborted');
  assert.ok(!JSON.stringify(e.requests[1].messages).includes('TOOL-ONLY-RECALLED-130'));
  assert.match(JSON.stringify(e.requests[1].messages), /INDEPENDENT-NEW-130/);
  assert.equal(e.requests[1].messages.some(row => row.role === 'tool'), false, 'new safe run cannot inherit old tool results');
  assert.equal(e.actions.length, 0); assert.equal(e.kernel.orchestrator.status().waiting.length, 0); assert.equal(e.kernel.orchestrator.status().wakeTimers, e.baselineWakeTimers);
});

test('withdrawing an old message outside the prompt and tool reads does not cancel an unrelated active run', async t => {
  let release; const hold = new Promise(resolve => release = resolve);
  const e = await runtime(t, { handler: async () => { await hold; return choice(); } });
  e.kernel.config.update({ store: { historyCount: 1 } });
  e.kernel.store.appendIncoming('group:13001', { mid: 1300500, senderName: 'A', text: 'UNUSED-OLD-130' });
  e.kernel.store.appendIncoming('group:13001', { mid: 1300501, senderName: 'A', text: 'NEAREST-CONTEXT-130' });
  e.kernel.store.markAllRead('group:13001');
  await e.incoming(1300502, 'UNRELATED-CURRENT-130'); await until(() => e.requests.length === 1);
  const id = e.kernel.sessions.running()[0].id;
  assert.ok(!JSON.stringify(e.requests[0].messages).includes('UNUSED-OLD-130'));
  await e.recall(1300500); assert.equal(e.kernel.sessions.peek(id).status, 'running');
  release(); await until(() => !e.kernel.sessions.running().length);
  assert.equal(e.kernel.sessions.get(id).status, 'noreply'); assert.equal(e.requests.length, 1);
});

test('successful self archive trimming keeps sent accounting and never causes a resend', async t => {
  const e = await runtime(t, { maxMessages: 1, handler: (_body, count) => count === 1 ? choice('send_message', { messages: 'QA-SEND-TRIM-130' }) : choice() });
  await e.incoming(1300401, 'SEND-TRIM-TRIGGER-130'); await until(() => e.requests.length === 2 && !e.kernel.sessions.running().length);
  assert.equal(e.actions.length, 1); assert.equal(e.kernel.store.recent('group:13001', Infinity).length, 1);
  const rows = await e.api('GET', '/api/sessions'), session = await e.api('GET', `/api/sessions/${rows.sessions[0].id}`);
  assert.equal(session.status, 'done'); assert.equal(session.sent.length, 1);
  await pause(300); assert.equal(e.requests.length, 2); assert.equal(e.actions.length, 1);
});

test('a later recall of a source already trimmed from disk still cancels its active context without losing sent accounting', async t => {
  let release, entered; const held = new Promise(resolve => release = resolve), reached = new Promise(resolve => entered = resolve);
  const e = await runtime(t, { maxMessages: 1, handler: (_body, count) => count === 1 ? choice('send_message', { messages: 'QA-SENT-BEFORE-RECALL-130' }) : choice() });
  const hooks = e.kernel.loader.hooksOf.bind(e.kernel.loader);
  e.kernel.loader.hooksOf = name => [...hooks(name), ...(name === 'after-tool' ? [{ ownerId: '130-trim-gate', fn: async () => { entered(); await held; } }] : [])];
  await e.incoming(1300601, 'TRIMMED-SOURCE-130'); await reached;
  assert.equal(e.actions.length, 1); assert.equal(e.kernel.store.findByMid('group:13001', 1300601), null);
  const id = e.kernel.sessions.running()[0].id;
  assert.equal(e.kernel.store.markRecalled('group:13001', 1300601), false, 'the archive does not create a fake message for an unknown recall');
  release(); await until(() => !e.kernel.sessions.running().length); await pause(300);
  const session = e.kernel.sessions.get(id); assert.equal(session.status, 'aborted'); assert.equal(session.sent.length, 1);
  assert.equal(e.requests.length, 1); assert.equal(e.actions.length, 1);
});

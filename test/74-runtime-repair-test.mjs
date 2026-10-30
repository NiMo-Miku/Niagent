// 运行链回归：实际存储/入站/工具/队列，注入 LLM，不连接 QQ 或外部 API。
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { mktmp, sleep } from './helpers.mjs';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createIngest } from '../src/kernel/ingest.js';
import { createSendQueue } from '../src/kernel/send.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createOrchestrator } from '../src/kernel/orchestrator.js';
import coreTools from '../bundled/core-tools/index.js';
import { fixtureCapability } from './bundled-fixture-sdk.mjs';

const chatKey = 'group:100';
let nextCallId = 0;
const call = (name, args = {}) => ({ id: `${name}-${++nextCallId}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const reply = (calls = [], usage = { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }) => ({
  message: { role: 'assistant', content: '', ...(calls.length ? { tool_calls: calls } : {}) },
  finishReason: calls.length ? 'tool_calls' : 'stop', usage, raw: { usage },
});

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function makeEnv({ config = {}, llm = () => reply(), capability = null, onWarn = () => {}, onSend = null, getSelfMemberInfo = null, isPaused = () => false } = {}) {
  const dataDir = mktmp('qqa-runtime-repair-');
  const cfg = {
    api: { model: 'fixture', maxRounds: 3 },
    store: { contextTier: 1, historyCount: 20, randomPercent: 100, keywords: [], promptAnchor: { enabled: false } },
    persona: { botName: '机器人', selfNickname: '小机器人', roleText: '全局角色', participation: 'medium', customRules: '全局规则' },
    allow: { groups: ['100'], private: ['123456'] }, deny: {}, allowAllWhenEmpty: true,
    wakeDelayMs: 1, sessionRetryAttempts: 1, maxConcurrentRuns: 2,
    send: { minGapMs: 200, maxGapMs: 200, byLengthMs: 1, dedupeWindowMs: 0 },
    memory: { consolidateEnabled: false }, chatActive: { enabled: false },
    commandMute: { enabled: true, command: '/安静', active: {} },
    ...config,
  };
  const log = { warn: onWarn, error() {}, info() {} };
  const store = createChatStore({ dataDir, log });
  const memory = createMemoryStore({ dataDir, log });
  const sessions = createSessionRegistry({ dataDir, log });
  const sent = [], requests = [];
  let sendAttempts = 0;
  const transport = { selfId: '999', actions: { getSelfMemberInfo }, async send(key, segments) { await onSend?.(key, segments, ++sendAttempts); sent.push({ key, segments }); return [{ msgId: sent.length }]; } };
  const send = createSendQueue({ transport, store, cfg: () => cfg, log });
  const registry = createToolRegistry({ log });
  coreTools.setup({ capability: fixtureCapability({ cfg: () => cfg, store, send }), registerTool: (tool) => registry.register({ ...tool, ownerId: 'core-tools', bundled: true }) });
  const orch = createOrchestrator({
    cfg: () => cfg, store, memory, sessions, send, registry, capability, transport, log, isPaused,
    loader: { promptSections: () => [], hooksOf: () => [] },
    buildToolsFor: () => ({
      tools: registry.list().map((tool) => ({ type: 'function', function: { name: tool.id, parameters: tool.params } })),
      invoke: (name, args, execCtx) => registry.invoke(name, args, { execCtx }), excludedTools: [],
    }),
    execContextFor: ({ session }) => ({ chatKey, session, send }),
    llmInvoker: async (args) => { requests.push(structuredClone(args.messages)); return llm(args, requests.length); },
  });
  const ingest = createIngest({ cfg: () => cfg, store, selfIdOf: () => '999', log });
  const incoming = (text = '@机器人 在吗', extra = {}) => ingest.ingestMessage({ kind: 'group', id: '100', event: {
    user_id: '123456', message_id: store.recent(chatKey, 500).length + 1,
    sender: { nickname: '甲' }, message: [{ type: 'text', data: { text } }], ...extra,
  } });
  const terminal = async (id) => {
    for (let i = 0; i < 400; i++) {
      const s = sessions.peek(id);
      if (s && !['waiting', 'running'].includes(s.status)) return s;
      await sleep(5);
    }
    throw new Error(`会话 ${id} 未结束`);
  };
  const trigger = async (entry) => {
    await orch.onIncoming(chatKey, entry);
    const id = orch.status().waiting[0]?.sessionId;
    assert.ok(id, '入站应安排唤醒');
    return terminal(id);
  };
  const direct = (entry) => {
    const s = sessions.create(chatKey, { waitUntil: Date.now() + 1 });
    return { s, work: orch.wake(chatKey, { waitingSessionId: s.id, verified: true }) };
  };
  return { dataDir, cfg, store, sessions, orch, ingest, send, registry, sent, requests, incoming, trigger, direct, terminal,
    close() { orch.stop(); sessions.stop(); } };
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { failed++; console.error(`✗ ${name}: ${error.stack}`); }
}

await test('中止等待后的旧未读可留历史，运行摘要必须指向真正的新触发批', async () => {
  const e = makeEnv({ config: { wakeDelayMs: 60000 }, llm: () => reply([call('finish', { reason: 'fresh batch' })]) });
  try {
    const old = (await e.incoming('@机器人 旧等待已中止')).entry;
    await e.orch.onIncoming(chatKey, old);
    const abortedId = e.orch.status().waiting[0].sessionId;
    assert.match(e.sessions.peek(abortedId).trigger, /旧等待已中止/);
    assert.equal(e.orch.abortSession(abortedId).ok, true);
    assert.equal(old.read, false, 'waiting 中止不消费原入站消息');
    assert.equal(e.sessions.peek(abortedId), null);
    assert.equal(fs.existsSync(path.join(e.dataDir, 'sessions', abortedId + '.json')), false);
    old.ts = Date.now() - 120000;
    e.cfg.wakeDelayMs = 200;
    const fresh = (await e.incoming('@机器人 真正的新触发')).entry;
    await e.orch.onIncoming(chatKey, fresh);
    const id = e.orch.status().waiting[0].sessionId;
    assert.notEqual(id, abortedId);
    assert.match(e.sessions.peek(id).trigger, /旧等待已中止/, 'waiting 仍遵守首条未读快照规格');
    const final = await e.terminal(id);
    assert.equal(final.trigger, `甲：${fresh.text.slice(0, 40)}`);
    assert.deepEqual(final.triggerEntryIds, [fresh.id]);
    const readBlock = final.userPrompt.split('【已读信息】')[1].split('【未读信息】')[0];
    const unreadBlock = final.userPrompt.split('【未读信息】')[1].split('【当前时间】')[0];
    assert.match(readBlock, /旧等待已中止/);
    assert.doesNotMatch(unreadBlock, /旧等待已中止/);
    assert.match(unreadBlock, /真正的新触发/);
    assert.equal(old.read, true);
    assert.equal(fresh.read, true);
    assert.equal(e.sessions.peek(abortedId), null, '旧中止 id 不复活');
    assert.equal(e.requests.length, 1);
    assert.equal(final.usage.calls, 1);
    assert.equal(e.sent.length, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(e.dataDir, 'sessions', id + '.json'), 'utf8')).trigger, final.trigger);
  } finally { e.close(); }
});

await test('机械批跳过非触发积压后，标题和触发 ids 一起指向实际消费的消息', async () => {
  const e = makeEnv({ config: { wakeDelayMs: 200, drainDelayMs: 60000 }, llm: () => reply([call('finish')]) });
  try {
    const old = e.store.appendIncoming(chatKey, { senderId: '123456', senderName: '甲', text: '普通积压不触发', ts: Date.now() - 4000, atMe: false });
    const fresh = e.store.appendIncoming(chatKey, { senderId: '123456', senderName: '甲', text: '@机器人 机械批真正触发', ts: Date.now(), atMe: true });
    const id = e.orch.scheduleWake(chatKey, 200, { verified: false });
    assert.match(e.sessions.peek(id).trigger, /普通积压不触发/);
    const final = await e.terminal(id);
    assert.equal(final.trigger, `甲：${fresh.text.slice(0, 40)}`);
    assert.deepEqual(final.triggerEntryIds, [fresh.id]);
    assert.equal(old.read, true, '机械补判定未触发的前缀立即沉历史，不能留待下一轮重掷');
    const readBlock = final.userPrompt.split('【已读信息】')[1].split('【未读信息】')[0];
    const unreadBlock = final.userPrompt.split('【未读信息】')[1].split('【当前时间】')[0];
    assert.match(readBlock, /普通积压不触发/);
    assert.doesNotMatch(unreadBlock, /普通积压不触发/);
    assert.match(unreadBlock, /机械批真正触发/);
    const reopened = createChatStore({ dataDir: e.dataDir, log: { warn() {}, error() {} } });
    assert.equal(reopened.recent(chatKey, 20).find(entry => entry.id === old.id).read, true, '归档判定在实际磁盘重读后仍保持');
    assert.equal(fresh.read, true);
    assert.equal(e.requests.length, 1);
    assert.equal(e.sent.length, 0);
  } finally { e.close(); }
});

await test('固定等待窗口的两条新消息仍用首条批消息为标题，倒计时和会话 id 不重置', async () => {
  const e = makeEnv({ config: { wakeDelayMs: 200 }, llm: () => reply([call('finish')]) });
  try {
    const first = (await e.incoming('@机器人 第一条新消息')).entry;
    await e.orch.onIncoming(chatKey, first);
    const id = e.orch.status().waiting[0].sessionId;
    const deadline = e.sessions.peek(id).waitUntil;
    const second = (await e.incoming('@机器人 第二条新消息')).entry;
    await e.orch.onIncoming(chatKey, second);
    assert.equal(e.orch.status().waiting[0].sessionId, id);
    assert.equal(e.sessions.peek(id).waitUntil, deadline);
    const final = await e.terminal(id);
    assert.equal(final.trigger, `甲：${first.text.slice(0, 40)}`);
    assert.deepEqual(final.triggerEntryIds, [first.id, second.id]);
    assert.equal(e.requests.length, 1);
    assert.equal(e.sent.length, 0);
  } finally { e.close(); }
});

await test('主动空触发批从补充等待摘要转成主动开话题，保持同一会话 id', async () => {
  const e = makeEnv({ config: { wakeDelayMs: 200 }, llm: () => reply([call('finish')]) });
  try {
    const id = e.orch.scheduleWake(chatKey, 200, { proactive: true });
    assert.equal(e.sessions.peek(id).trigger, '（补充处理）');
    const final = await e.terminal(id);
    assert.equal(final.id, id);
    assert.equal(final.trigger, '主动开话题');
    assert.deepEqual(final.triggerEntryIds, []);
    assert.equal(final.proactive, true);
    assert.equal(e.requests.length, 1);
    assert.equal(e.sent.length, 0);
  } finally { e.close(); }
});

await test('文字 @ 回退和精确 @ 段共存，指令禁言复用同一判定', async () => {
  const e = makeEnv();
  try {
    const plain = await e.incoming('@机器人 /安静');
    assert.equal(plain.entry.atMe, true);
    const other = await e.incoming(' @机器人', { message: [{ type: 'at', data: { qq: '111' } }, { type: 'text', data: { text: ' @机器人' } }] });
    assert.equal(other.entry.atMe, false);
    e.store.markEntryRead(chatKey, other.entry.id);
    const s = await e.trigger(plain.entry);
    assert.equal(s.status, 'noreply');
    assert.equal(e.requests.length, 1);
  } finally { e.close(); }
});

await test('拍我跨档位进入实际运行，仍不占 UI 未读、不进入历史', async () => {
  for (const tier of [1, 2, 3, 4]) {
    const e = makeEnv({ config: { store: { contextTier: tier, historyCount: 20, randomPercent: 0, keywords: [], promptAnchor: { enabled: false } } } });
    try {
      const poke = await e.ingest.ingestPoke({ group_id: '100', user_id: '123456', target_id: '999' });
      assert.equal(e.store.unread(chatKey).length, 0);
      const s = await e.trigger(poke.entry);
      assert.equal(s.status, 'noreply');
      assert.equal(e.requests.length, 1);
      assert.match(e.requests[0][1].content, /拍了拍/);
      assert.equal(poke.entry.read, true);
    } finally { e.close(); }
  }
});

await test('活跃期普通消息绕过档位且不再掷骰', async () => {
  const e = makeEnv({ config: { chatActive: { enabled: true } } });
  const oldRandom = Math.random;
  try {
    e.orch._active.set(chatKey, { topic: '猫', until: Date.now() + 60000 });
    const m = (await e.incoming('普通聊天')).entry;
    let dice = 0; Math.random = () => { dice++; return 0.9; };
    const s = await e.trigger(m);
    assert.equal(s.status, 'noreply'); assert.equal(e.requests.length, 1); assert.equal(dice, 0);
    assert.match(e.requests[0][1].content, /猫/);
  } finally { Math.random = oldRandom; e.close(); }
});

await test('分群和主人 persona 同时进入两侧提示，账号名字保持全局', async () => {
  for (const owner of [false, true]) {
    const role = owner ? '主人角色' : '分群角色';
    const e = makeEnv({
      config: { personaUnified: false, personaByChat: { 100: { roleText: '分群角色', participation: 'high', customRules: '分群规则', systemPromptOverride: '分群覆盖 {roleText} {participation}' } } },
      capability: owner ? { providers: (name) => name === 'message.owner-check' ? [{ provider: () => ({ persona: { roleText: role, customRules: '主人规则', systemPromptOverride: '主人覆盖 {roleText}', botName: '错误名字', selfNickname: '错误昵称' } }) }] : [] } : null,
    });
    try {
      const s = await e.trigger((await e.incoming()).entry);
      assert.match(s.systemPrompt, new RegExp(role)); assert.match(s.userPrompt, new RegExp(role));
      assert.match(s.systemPrompt, owner ? /主人规则/ : /分群规则/); assert.doesNotMatch(s.systemPrompt, /全局规则/);
      assert.doesNotMatch(s.systemPrompt, /错误名字|错误昵称/);
      assert.equal(e.requests.length, 1);
    } finally { e.close(); }
  }
});

await test('finish 终止同批剩余工具并保留结束原因和 activeTopic', async () => {
  const e = makeEnv({ config: { chatActive: { enabled: true } }, llm: () => reply([call('finish', { reason: '说完了', activeTopic: '猫' }), call('send_message', { messages: '不该发' })]) });
  try {
    const s = await e.trigger((await e.incoming()).entry);
    assert.equal(e.requests.length, 1); assert.equal(e.sent.length, 0);
    assert.equal(s.finishReason, '说完了'); assert.equal(s.activeTopic, '猫');
    assert.equal(e.orch.status().activeTopics[0]?.topic, '猫');
    assert.equal(s.messages.filter((m) => m.role === 'tool').length, 1);
  } finally { e.close(); }
});

await test('活跃期 finish 话题结束立即退出', async () => {
  const e = makeEnv({ config: { chatActive: { enabled: true } }, llm: () => reply([call('finish', { reason: '话题结束' })]) });
  try {
    e.orch._active.set(chatKey, { topic: '猫', until: Date.now() + 60000 });
    const s = await e.trigger((await e.incoming('普通聊天')).entry);
    assert.equal(s.finishReason, '话题结束'); assert.equal(e.orch.status().activeTopics.length, 0); assert.equal(e.requests.length, 1);
  } finally { e.close(); }
});

await test('标准 messages 参数实际发送；执行轨迹与 raw 落盘，请求不带日志元数据', async () => {
  const e = makeEnv({ llm: (_args, n) => n === 1 ? reply([call('send_message', { messages: '在的' })]) : reply([call('finish', { reason: '说完了' })]) });
  try {
    for (let i = 0; i < 3; i++) {
      const entry = e.store.appendIncoming(chatKey, { senderId: '123456', senderName: '甲', text: `历史 ${i}`, ts: Date.now() - 10000 + i });
      e.store.markEntryRead(chatKey, entry.id);
    }
    const s = await e.trigger((await e.incoming()).entry);
    assert.equal(s.status, 'done'); assert.equal(e.sent.length, 1); assert.equal(s.sent.length, 1);
    assert.equal(s.usage.calls, 2); assert.equal(s.rounds, 2);
    assert.equal(s.pastStateCount, 3, '历史翻页补偿使用实际进入提示词的已读条数');
    assert.ok(s.messages.some((m) => m.role === 'assistant' && m.raw?.usage));
    assert.deepEqual(s.messages.filter((m) => m.role === 'tool').map((m) => m.toolCall?.name), ['send_message', 'finish']);
    const disk = JSON.parse(fs.readFileSync(path.join(e.dataDir, 'sessions', `${s.id}.json`), 'utf8'));
    assert.deepEqual(disk.messages, s.messages);
    assert.ok(e.requests.every((messages) => messages.every((m) => !m.raw && !m.toolCall)));
  } finally { e.close(); }
});

await test('失败和自动重试保留调用用量与两次尝试轨迹', async () => {
  const e = makeEnv({ llm: (_args, n) => { if (n === 1) throw new Error('network fixture'); return reply([call('finish', { reason: '已恢复' })]); } });
  try {
    const { s, work } = e.direct((await e.incoming()).entry); await work;
    assert.equal(s.status, 'noreply'); assert.equal(e.requests.length, 2); assert.equal(s.usage.calls, 2);
    assert.equal(s.messages.filter((m) => m.role === 'system').length, 2);
  } finally { e.close(); }
});

await test('退避期间中止会话，不能再请求模型或发送', async () => {
  let retry; const reached = new Promise((resolve) => { retry = resolve; });
  const e = makeEnv({ onWarn: () => retry(), llm: (_args, n) => { if (n === 1) throw new Error('network fixture'); return reply([call('send_message', { texts: '中止后不能发' })]); } });
  try {
    const { s, work } = e.direct((await e.incoming()).entry); await reached;
    assert.equal(e.orch.abortSession(s.id).ok, true); await work;
    assert.equal(s.status, 'aborted'); assert.equal(e.requests.length, 1); assert.equal(e.sent.length, 0);
    assert.equal(s.usage.calls, 1); assert.ok(s.messages.length >= 2);
  } finally { e.close(); }
});

await test('禁言慢查询期间中止等待会话，迟到结果不标读、不运行、不恢复文件', async () => {
  for (const muted of [false, true]) {
    const entered = deferred(), result = deferred();
    const e = makeEnv({ getSelfMemberInfo: () => { entered.resolve(); return result.promise; }, llm: () => reply([call('send_message', { messages: '不能发' })]) });
    try {
      const entry = (await e.incoming()).entry;
      const { s, work } = e.direct(entry); await entered.promise;
      assert.equal(e.orch.abortSession(s.id).ok, true);
      assert.equal(e.sessions.peek(s.id), null);
      result.resolve({ muted }); await work;
      assert.equal(e.requests.length, 0); assert.equal(e.sent.length, 0); assert.equal(entry.read, false);
      assert.equal(e.sessions.peek(s.id), null); assert.equal(e.sessions.current(chatKey), null);
      assert.equal(fs.existsSync(path.join(e.dataDir, 'sessions', `${s.id}.json`)), false);
      assert.equal(e.orch.status().wakeTimers, 0);
    } finally { result.resolve({ muted }); e.close(); }
  }
});

await test('禁言快查询期间全局中止，取消后不再启动 transport 慢查询', async () => {
  const entered = deferred(), result = deferred();
  let slowQueries = 0;
  const e = makeEnv({ getSelfMemberInfo: () => { slowQueries++; return { muted: false }; } });
  e.orch._inject.setBanStateProvider(() => ({ check: () => { entered.resolve(); return result.promise; } }));
  try {
    const entry = (await e.incoming()).entry;
    const { s, work } = e.direct(entry); await entered.promise;
    e.orch.abortAll(); result.resolve(false); await work;
    assert.equal(slowQueries, 0); assert.equal(e.requests.length, 0); assert.equal(entry.read, false);
    assert.equal(e.sessions.peek(s.id), null); assert.equal(e.sessions.current(chatKey), null);
    assert.equal(e.orch.status().wakeTimers, 0);
  } finally { result.resolve(false); e.close(); }
});

await test('禁言查询中暂停再恢复，积压只运行新会话，旧查询不能复活', async () => {
  const entered = deferred(), result = deferred();
  let queries = 0;
  const e = makeEnv({ getSelfMemberInfo: () => { if (++queries === 1) { entered.resolve(); return result.promise; } return { muted: false }; } });
  try {
    const entry = (await e.incoming()).entry;
    const { s, work } = e.direct(entry); await entered.promise;
    e.orch.pause(); assert.equal(e.sessions.current(chatKey), null); assert.equal(entry.read, false);
    e.orch.resume();
    const resumedId = e.orch.status().waiting[0]?.sessionId;
    assert.ok(resumedId); assert.notEqual(resumedId, s.id);
    const resumed = await e.terminal(resumedId);
    assert.equal(resumed.status, 'noreply'); assert.equal(e.requests.length, 1);
    result.resolve({ muted: true }); await work;
    assert.equal(e.requests.length, 1); assert.equal(e.sessions.peek(s.id), null);
    assert.equal(fs.existsSync(path.join(e.dataDir, 'sessions', `${s.id}.json`)), false);
    assert.equal(e.sessions.current(chatKey), null); assert.equal(e.orch.status().wakeTimers, 0);
  } finally { result.resolve({ muted: false }); e.close(); }
});

await test('无等待会话的机械唤醒查询中停止，不能创建幽灵会话或消费消息', async () => {
  const entered = deferred(), result = deferred();
  const e = makeEnv({ getSelfMemberInfo: () => { entered.resolve(); return result.promise; } });
  try {
    const entry = (await e.incoming()).entry;
    const work = e.orch.wake(chatKey); await entered.promise;
    e.orch.stop(); result.resolve({ muted: false }); await work;
    assert.equal(e.requests.length, 0); assert.equal(e.sent.length, 0); assert.equal(entry.read, false);
    assert.equal(e.sessions.listSummaries().length, 0); assert.equal(e.orch.status().wakeTimers, 0);
  } finally { result.resolve({ muted: false }); e.close(); }
});

await test('禁言查询期间外部暂停生效，迟到禁言结果也不能消费消息', async () => {
  const entered = deferred(), result = deferred();
  let externallyPaused = false;
  const e = makeEnv({ isPaused: () => externallyPaused, getSelfMemberInfo: () => { entered.resolve(); return result.promise; } });
  try {
    const entry = (await e.incoming()).entry;
    const { s, work } = e.direct(entry); await entered.promise;
    externallyPaused = true; result.resolve({ muted: true }); await work;
    assert.equal(s.status, 'aborted'); assert.match(s.error, /暂停/);
    assert.equal(e.requests.length, 0); assert.equal(entry.read, false); assert.equal(e.sessions.current(chatKey), null);
  } finally { result.resolve({ muted: false }); e.close(); }
});

await test('LLM 忽略取消信号返回工具时，中止仍阻止副作用', async () => {
  let release, started; const entered = new Promise((resolve) => { started = resolve; });
  const e = makeEnv({ llm: async () => { started(); await new Promise((resolve) => { release = resolve; }); return reply([call('send_message', { texts: '不能发' })]); } });
  try {
    const { s, work } = e.direct((await e.incoming()).entry); await entered;
    e.orch.abortSession(s.id); release(); await work;
    assert.equal(s.status, 'aborted'); assert.equal(e.sent.length, 0); assert.equal(s.usage.calls, 1);
    const totals = JSON.parse(fs.readFileSync(path.join(e.dataDir, 'telemetry-totals.json'), 'utf8'));
    assert.equal(totals.calls, 1); assert.equal(totals.totalTokens, 5, '中止后晚到的用量仍只累计一次');
  } finally { e.close(); }
});

await test('手动重试恢复原输入 id，不收进后来消息，也不重掷触发骰', async () => {
  const e = makeEnv({ llm: (_args, n) => { if (n === 1) throw new Error('fixture fatal input'); return reply([call('finish', { reason: '重试完成' })]); } });
  const oldRandom = Math.random;
  try {
    const m = (await e.incoming()).entry; m.ts -= 2000;
    const { s, work } = e.direct(m); await work; assert.equal(s.status, 'error');
    const originalId = s.id;
    assert.equal(s.trigger, `甲：${m.text.slice(0, 40)}`);
    const later = e.store.appendIncoming(chatKey, { senderId: '123456', senderName: '甲', text: '后来的历史', ts: Date.now(), atMe: false });
    e.store.markEntryRead(chatKey, later.id);
    const result = e.orch.retrySession(s.id); assert.equal(result.ok, true); assert.equal(result.restored, 1);
    let dice = 0; Math.random = () => { dice++; return 0.9; };
    await e.terminal(s.id); assert.equal(s.finishReason, '重试完成'); assert.equal(dice, 0);
    assert.equal(s.id, originalId);
    assert.equal(s.trigger, `甲：${m.text.slice(0, 40)}`);
    assert.deepEqual(s.triggerEntryIds, [m.id]); assert.equal(later.read, true);
    assert.equal(s.usage.calls, 2);
    const totals = JSON.parse(fs.readFileSync(path.join(e.dataDir, 'telemetry-totals.json'), 'utf8'));
    assert.equal(totals.calls, 2, '复用会话 id 不重复累加之前失败尝试');
    assert.equal(totals.totalTokens, 5);
  } finally { Math.random = oldRandom; e.close(); }
});

await test('失败的拍我会话按原 id 恢复并再次运行', async () => {
  const e = makeEnv({ llm: (_args, n) => { if (n === 1) throw new Error('fixture fatal input'); return reply([call('finish', { reason: '重试拍我' })]); } });
  try {
    const poke = await e.ingest.ingestPoke({ group_id: '100', user_id: '123456', target_id: '999' });
    const s = await e.trigger(poke.entry); assert.equal(s.status, 'error');
    assert.equal(e.orch.retrySession(s.id).ok, true); await e.terminal(s.id);
    assert.equal(s.finishReason, '重试拍我'); assert.equal(e.requests.length, 2);
    assert.deepEqual(s.triggerEntryIds, [poke.entry.id]); assert.equal(e.store.unread(chatKey).length, 0);
  } finally { e.close(); }
});

await test('活跃期失败后话题过期，手动重试仍复用原触发判定', async () => {
  const e = makeEnv({ config: { store: { contextTier: 3, randomPercent: 0, historyCount: 20 }, chatActive: { enabled: true } }, llm: (_args, n) => { if (n === 1) throw new Error('fixture fatal input'); return reply([call('finish')]); } });
  const oldRandom = Math.random;
  try {
    e.orch._active.set(chatKey, { topic: '猫', until: Date.now() + 60000 });
    const s = await e.trigger((await e.incoming('普通聊天')).entry); assert.equal(s.status, 'error');
    e.orch._active.delete(chatKey);
    let dice = 0; Math.random = () => { dice++; return 0.9; };
    assert.equal(e.orch.retrySession(s.id).ok, true); await e.terminal(s.id);
    assert.equal(s.status, 'noreply'); assert.equal(s.contextReason, '活跃期'); assert.equal(dice, 0);
  } finally { Math.random = oldRandom; e.close(); }
});

await test('批次部分发送失败后保留成功条，后续模型错误不能重试', async () => {
  const e = makeEnv({
    onSend: (_key, _segments, n) => { if (n === 2) throw new Error('fixture send failed'); },
    llm: (_args, n) => { if (n === 1) return reply([call('send_message', { messages: ['第一条', '第二条'] })]); throw new Error('network fixture'); },
  });
  try {
    const { s, work } = e.direct((await e.incoming()).entry); await work;
    assert.equal(s.status, 'error'); assert.equal(e.requests.length, 2); assert.equal(e.sent.length, 1); assert.equal(s.sent.length, 1);
    assert.equal(e.orch.retrySession(s.id).ok, false);
    assert.equal(s.messages.find((m) => m.toolCall?.name === 'send_message')?.toolCall.ok, false);
  } finally { e.close(); }
});

await test('发送批次真人停顿中中止，后续条不发送并保留已成功条', async () => {
  let started; const firstSent = new Promise((resolve) => { started = resolve; });
  const e = makeEnv({
    onSend: (_key, _segments, n) => { if (n === 1) setTimeout(started, 0); },
    llm: () => reply([call('send_message', { messages: ['第一条', '第二条'] }), call('send_message', { messages: '第三条' })]),
  });
  try {
    const { s, work } = e.direct((await e.incoming()).entry); await firstSent;
    e.orch.abortSession(s.id); await work;
    assert.equal(s.status, 'aborted'); assert.equal(e.sent.length, 1); assert.equal(s.sent.length, 1); assert.equal(e.requests.length, 1);
  } finally { e.close(); }
});

await test('模型运行中即可读取真实工具轨迹和发送记录', async () => {
  let started, release; const secondRound = new Promise((resolve) => { started = resolve; });
  const e = makeEnv({ llm: async (_args, n) => { if (n === 1) return reply([call('send_message', { messages: '先发一句' })]); started(); await new Promise((resolve) => { release = resolve; }); return reply([call('finish')]); } });
  try {
    const { s, work } = e.direct((await e.incoming()).entry); await secondRound;
    const live = e.sessions.get(s.id);
    assert.equal(live.status, 'running'); assert.equal(live.sent.length, 1);
    assert.ok(live.messages.some((m) => m.toolCall?.name === 'send_message')); assert.equal(live.usage.calls, 2);
    release(); await work;
  } finally { release?.(); e.close(); }
});

await test('texts 旧调用与标准 messages 都可用，已发后错误不会自动重试', async () => {
  const e = makeEnv({ llm: (_args, n) => { if (n === 1) return reply([call('send_message', { texts: '旧调用' })]); throw new Error('network fixture'); } });
  try {
    const { s, work } = e.direct((await e.incoming()).entry); await work;
    assert.equal(s.status, 'error'); assert.equal(e.requests.length, 2); assert.equal(e.sent.length, 1); assert.equal(s.sent.length, 1);
    assert.equal(e.orch.retrySession(s.id).ok, false);
    assert.equal(s.usage.calls, 2); assert.ok(s.messages.some((m) => m.toolCall?.name === 'send_message'));
  } finally { e.close(); }
});

await test('锚定后的已读历史继续过滤本群屏蔽成员，翻页补偿同步实际条数', async () => {
  const e = makeEnv({ config: { blocklist: { 100: ['555555'] }, store: { contextTier: 1, historyCount: 20, promptAnchor: { enabled: true, maxExtraRead: 5 } } } });
  try {
    for (const [senderId, text] of [['555555', '被屏蔽历史'], ['123456', '正常历史']]) {
      const entry = e.store.appendIncoming(chatKey, { senderId, senderName: '甲', text, ts: Date.now() - 10000 });
      e.store.markEntryRead(chatKey, entry.id);
    }
    const first = await e.trigger((await e.incoming('@机器人 第一轮')).entry);
    const second = await e.trigger((await e.incoming('@机器人 第二轮')).entry);
    assert.equal(second.promptAnchorMode, 'anchor');
    assert.doesNotMatch(first.userPrompt, /被屏蔽历史/);
    assert.doesNotMatch(second.userPrompt, /被屏蔽历史/);
    assert.equal(second.pastStateCount, 2);
  } finally { e.close(); }
});

console.log(`${failed ? '✗' : '✓'} 74-runtime-repair：${passed} 通过，${failed} 失败`);
if (failed) process.exitCode = 1;

// 18 · orchestrator：状态机 / 防抖不重置 / 已读语义 / 重试 / 中止 / drain
import { ok, eq, section, summary, mktmp, sleep } from './helpers.mjs';
import { createOrchestrator } from '../src/kernel/orchestrator.js';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createSendQueue } from '../src/kernel/send.js';
import { Bus } from '../src/kernel/bus.js';
import fs from 'node:fs';
import path from 'node:path';

function makeEnv({ cfgOverrides = {}, llmReply = null } = {}) {
  const dir = mktmp('qqa-orch-');
  const bus = new Bus({ error: () => {}, warn: () => {} });
  const store = createChatStore({ dataDir: dir, log: {} });
  const memory = createMemoryStore({ dataDir: dir, log: {} });
  const sessions = createSessionRegistry({ dataDir: dir, log: {}, bus });
  const sentOut = [];
  const transport = { async send(chatKey, segs) { sentOut.push({ chatKey, segs }); return [{ msgId: sentOut.length }]; } };
  const c = {
    api: { model: 'test-model', maxRounds: 12, timeoutMs: 5000 },
    store: { contextTier: 4, randomPercent: 10, keywords: [], historyCount: 80, promptAnchor: { enabled: true, maxExtraRead: 5 }, maxMessagesPerChat: 0 },
    wakeDelayMs: 60, drainDelayMs: 80, maxConcurrentRuns: 2, sessionRetryAttempts: 2,
    send: { minGapMs: 0, maxGapMs: 0, byLengthMs: 0, maxPerMinute: 80, maxPerHour: 500, hardSplitAt: 4000, dedupeWindowMs: 0 },
    persona: { botName: '小鲸鱼', roleText: '人设', participation: 'medium' },
    allow: { groups: ['100'], private: [] }, deny: { groups: [], private: [] }, allowAllWhenEmpty: true,
    memory: { consolidateEnabled: false },
    chatActive: { enabled: false },
    ...cfgOverrides,
  };
  const send = createSendQueue({ transport, store, log: {}, cfg: () => c, bus });
  // mock 工具集
  const toolCalls = [];
  const registry = { list: () => [], availability: () => ({ ok: true }) };
  const orch = createOrchestrator({
    cfg: () => c, store, sessions, memory, send, registry, log: {},
    loader: { promptSections: () => [], hooksOf: () => [], listEntries: () => [], isActive: () => true },
    onebot: { call: async () => ({ data: {} }), selfId: '999', connected: false },
    buildToolsFor: () => ({
      tools: [{ type: 'function', function: { name: 'send_message', description: '', parameters: {} } }],
      excludedTools: [],
      invoke: async (name, args) => {
        toolCalls.push({ name, args });
        if (name === 'send_message') {
          const res = await send.sendTextBatch('group:100', args.texts ?? args.text ?? 'hi', {});
          return { ok: true, result: 'sent', sent: res.sent };
        }
        return { ok: true, result: 'ok' };
      },
    }),
    execContextFor: () => ({ send }),
  });
  // mock LLM：注入 callLLM 不可行（runAgent 内部 import）——用 cfg 驱动 + 全局 stub 更复杂；
  // 这里通过替换 orchestrator 内部依赖不可行，改走"无工具调用"路径：模型返回无 tool_calls → noreply
  return { dir, orch, store, sessions, memory, send, sentOut, c, toolCalls, bus };
}

// 由于 runAgent 直接 import chatCompletionWithRetry，无法从外部 stub；
// 这里用一个最小可用的 mock：把 cfg.api.baseUrl 指向本地假服务器代价太高。
// 折中：测试 orchestrator 的**判定/状态机/闸门**逻辑（不跑真实 LLM），
// 通过发送一个"模型未设置"的配置验证闸 2，以及"不触发"路径验证已读语义。
// 真实 LLM 链路由 19-onebot-e2e 用 mock provider 覆盖。

section('闸 2：模型未设置 → 等待会话 aborted，消息保留未读');
const e1 = makeEnv({ cfgOverrides: { api: { model: '', maxRounds: 12, timeoutMs: 5000 } } });
e1.store.appendIncoming('group:100', { mid: 1, ts: Date.now(), senderId: '555', senderName: 'A', text: '@小鲸鱼 在吗', atMe: true, atNames: [] });
eq(e1.store.unread('group:100').length, 1, '入库未读');
const sess = e1.sessions.create('group:100', { trigger: 'x' });
await e1.orch.wake('group:100', { waitingSessionId: sess.id, verified: true });
eq(e1.sessions.peek(sess.id).status, 'aborted', '模型未设置 → aborted');
ok(String(e1.sessions.peek(sess.id).error).includes('模型未设置'), '错误文案');
eq(e1.store.unread('group:100').length, 1, '消息保留未读（配好模型后补处理）');

section('防抖不重置：倒计时中再入站不重排，稍后仍入批');
const e2 = makeEnv();
e2.store.appendIncoming('group:100', { mid: 1, ts: Date.now(), senderId: '555', senderName: 'A', text: 'n1' });
await e2.orch.onIncoming('group:100', e2.store.recent('group:100', 1)[0]);
const firstPending = e2.orch.status().waiting.find((x) => x.chatKey === 'group:100');
ok(firstPending, '首次触发排程成功');
const sid1 = firstPending.sessionId;
const t0 = Date.now();
e2.store.appendIncoming('group:100', { mid: 2, ts: Date.now(), senderId: '555', senderName: 'A', text: 'n2' });
await e2.orch.onIncoming('group:100', e2.store.recent('group:100', 1)[0]);
const secondPending = e2.orch.status().waiting.find((x) => x.chatKey === 'group:100');
eq(secondPending.sessionId, sid1, '倒计时中不重排（同一等待会话）');
void t0;
e2.orch.stop();

section('不触发 → 当场标已读（未读一闪即已读）');
const e3 = makeEnv({ cfgOverrides: { store: { contextTier: 1, randomPercent: 0, keywords: [], historyCount: 80, promptAnchor: { enabled: true, maxExtraRead: 5 }, maxMessagesPerChat: 0 } } });
const m = e3.store.appendIncoming('group:100', { mid: 1, ts: Date.now(), senderId: '555', senderName: 'A', text: '随便一句', atMe: false, atNames: [] });
await e3.orch.onIncoming('group:100', m);
eq(e3.store.unread('group:100').length, 0, '1 档未 @ 不触发 → 已读');
eq(e3.orch.status().waiting.length, 0, '无等待会话');
e3.orch.stop();

section('触发 → 保持未读');
const e4 = makeEnv();
const m4 = e4.store.appendIncoming('group:100', { mid: 1, ts: Date.now(), senderId: '555', senderName: 'A', text: '@小鲸鱼 在吗', atMe: true, atNames: [] });
await e4.orch.onIncoming('group:100', m4);
eq(e4.store.unread('group:100').length, 1, '触发后保持未读');
ok(e4.orch.status().waiting.find((x) => x.chatKey === 'group:100'), '有等待会话');
e4.orch.stop();

section('私聊恒响应');
const e5 = makeEnv();
const dm = e5.store.appendIncoming('private:555', { mid: 1, ts: Date.now(), senderId: '555', senderName: 'A', text: '随便', atMe: false, atNames: [] });
await e5.orch.onIncoming('private:555', dm);
ok(e5.orch.status().waiting.find((x) => x.chatKey === 'private:555'), '私聊触发');
e5.orch.stop();

section('全局暂停 → 入站不处理');
const e6 = makeEnv();
e6.orch.pause();
const m6 = e6.store.appendIncoming('group:100', { mid: 1, ts: Date.now(), senderId: '555', senderName: 'A', text: '@我', atMe: true, atNames: [] });
await e6.orch.onIncoming('group:100', m6);
eq(e6.orch.status().waiting.length, 0, '暂停时不排程');
eq(e6.sessions.running().length, 0, '暂停时无运行');
// 默认恢复会排入积压；本节只验证暂停期间不处理，显式跳过积压并清理调度器。
e6.orch.resume({ skipBacklog: true });
e6.orch.stop();

section('中止：waiting 会话干净消失 / abortAll 清定时器');
const e7 = makeEnv();
const m7 = e7.store.appendIncoming('group:100', { mid: 1, ts: Date.now(), senderId: '555', senderName: 'A', text: '@我', atMe: true, atNames: [] });
await e7.orch.onIncoming('group:100', m7);
const w7 = e7.orch.status().waiting.find((x) => x.chatKey === 'group:100');
const aborted = e7.orch.abortSession(w7.sessionId);
eq(aborted.ok, true, '中止 waiting 成功');
eq(e7.sessions.peek(w7.sessionId), null, '中止 waiting 后内存记录删除');
ok(!fs.existsSync(path.join(e7.dir, 'sessions', `${w7.sessionId}.json`)), '中止 waiting 后持久化文件删除');
e7.orch.stop();

section('指令禁言强制 1 档（storeConfigForChat）');
const e8 = makeEnv({ cfgOverrides: { commandMute: { enabled: true, command: '/安静', durationMin: 30, active: { 100: Date.now() + 60000 } } } });
const sc = e8.orch.storeConfigForChat('group:100', false);
eq(sc.commandMuteTier, 1, '禁言中 → commandMuteTier=1');
const e8b = makeEnv({ cfgOverrides: { commandMute: { enabled: true, command: '/安静', durationMin: 30, active: { 100: Date.now() - 60000 } } } });
eq(e8b.orch.storeConfigForChat('group:100', false).commandMuteTier, null, '过期禁言不生效');
const e8c = makeEnv({ cfgOverrides: { commandMute: { enabled: true, command: '/安静', durationMin: 0, active: { 100: 0 } } } });
eq(e8c.orch.storeConfigForChat('group:100', false).commandMuteTier, 1, '0 = 永久禁言');

section('峰谷窗口（跨零点支持）');
const e9 = makeEnv({ cfgOverrides: { store: { contextTier: 4, randomPercent: 10, keywords: [], historyCount: 80, promptAnchor: { enabled: true, maxExtraRead: 5 }, maxMessagesPerChat: 0, peakSchedule: { enabled: true, peak: { start: '00:00', end: '23:58', sliderPos: 10 }, valley: { sliderPos: 100 } } } } });
const RealDate = globalThis.Date;
function tierAt(hour, minute) {
  const fixed = new RealDate(2026, 9, 7, hour, minute).getTime();
  try {
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed; }
    };
    return e9.orch.storeConfigForChat('group:100', false).contextTier;
  } finally {
    globalThis.Date = RealDate;
  }
}
try {
  eq(tierAt(12, 0), 1, '高峰窗口内取 peak sliderPos=10 → 1 档');
  eq(tierAt(23, 58), 4, '结束边界不包含，使用谷时段');
  e9.c.store.peakSchedule.peak.start = '22:00';
  e9.c.store.peakSchedule.peak.end = '06:00';
  eq(tierAt(22, 0), 1, '跨零点窗口包含开始边界');
  eq(tierAt(0, 0), 1, '跨零点窗口包含午夜');
  eq(tierAt(5, 59), 1, '跨零点窗口结束前仍为高峰');
  eq(tierAt(6, 0), 4, '跨零点窗口不包含结束边界');
  eq(tierAt(12, 0), 4, '跨零点窗口外为谷时段');
} finally {
  e9.orch.stop();
}

summary('18-orchestrator');

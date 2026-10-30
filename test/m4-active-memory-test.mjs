// M4 active/proactive/prompt-anchor/memory consolidation contract checks.
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createSendQueue } from '../src/kernel/send.js';
import { createOrchestrator } from '../src/kernel/orchestrator.js';
import { createMemoryConsolidationAdapter } from '../src/console/memory-media-adapters.js';
import { Bus } from '../src/kernel/bus.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-m4-active-')); }

function makeEnv({ cfgOverrides = {}, topic = '', finishReason = 'stop' } = {}) {
  const dataDir = tempDir();
  const bus = new Bus({ error() {}, warn() {} });
  const store = createChatStore({ dataDir, log: {} });
  const memory = createMemoryStore({ dataDir, log: {} });
  const sessions = createSessionRegistry({ dataDir, log: {}, bus });
  const cfg = {
    api: { model: 'm4-test', maxRounds: 3, timeoutMs: 1000 },
    store: { contextTier: 4, randomPercent: 100, keywords: [], historyCount: 20, promptAnchor: { enabled: true, maxExtraRead: 5 } },
    wakeDelayMs: 1, drainDelayMs: 1, maxConcurrentRuns: 2, sessionRetryAttempts: 0,
    persona: { botName: '测试', roleText: '', participation: 'medium' },
    allow: { groups: ['100'], private: [] }, deny: { groups: [], private: [] }, allowAllWhenEmpty: true,
    memory: { consolidateEnabled: false }, chatActive: { enabled: true, ttlMinutes: 0 },
    proactive: { enabled: false, checkIntervalMinMs: 60000, checkIntervalMaxMs: 60000, idleThresholdMs: 300000, probability: 1 },
    ...cfgOverrides,
  };
  let llmCalls = 0;
  const orch = createOrchestrator({
    cfg: () => cfg, store, sessions, memory,
    send: createSendQueue({ transport: { async send() { return []; } }, store, log: {}, cfg: () => cfg, bus }),
    registry: { list: () => [] }, loader: { promptSections: () => [], hooksOf: () => [] },
    onebot: { selfId: '999', call: async () => ({ data: {} }) }, bus, log: {},
    buildToolsFor: ({ session }) => ({
      tools: [{ type: 'function', function: { name: 'set_active_topic', description: '', parameters: { type: 'object' } } }],
      excludedTools: [],
      invoke: async (name, args) => {
        if (name === 'set_active_topic') session.activeTopic = topic;
        return { ok: true, result: 'ok' };
      },
    }),
    llmInvoker: async () => {
      llmCalls += 1;
      if (llmCalls === 1 && topic) return { message: { content: '', tool_calls: [{ id: 't1', type: 'function', function: { name: 'set_active_topic', arguments: '{}' } }] }, finishReason: null };
      return { message: { content: '' }, finishReason };
    },
  });
  return { dataDir, cfg, store, memory, sessions, orch, bus };
}

async function runOne(env, text = '普通消息', atMe = false) {
  const msg = env.store.appendIncoming('group:100', { mid: Date.now(), ts: Date.now(), senderId: '1', senderName: '甲', text, atMe, atNames: [] });
  await env.orch.onIncoming('group:100', msg);
  await sleep(280);
}
function applyActive(env, topic, contextTier, finishReason = 'stop') {
  const session = { activeTopic: topic, contextTier };
  env.orch._applyChatActive({ session, result: { finishReason }, cfgChat: {}, chatKey: 'group:100', isPrivate: false });
}

console.log('· activeTopic 长度、tier、TTL 与 stop 清理');
const long = makeEnv();
applyActive(long, 'x'.repeat(61), 1);
assert.equal(long.orch.status().activeTopics.length, 0, 'activeTopic 超过 60 字不得进入活跃期');
long.orch.stop();

const tier4 = makeEnv();
applyActive(tier4, 'tier4', 4);
assert.equal(tier4.orch.status().activeTopics.length, 0, 'tier 4 不得进入活跃期');
tier4.orch.stop();

const active = makeEnv();
applyActive(active, '合法话题', 1);
const activeState = active.orch.status().activeTopics;
assert.equal(activeState.length, 1, 'tier 1 进入活跃期');
assert.ok(activeState[0].until - Date.now() >= 59000, 'TTL 至少 60 秒');
active.orch.stop();
assert.equal(active.orch.status().activeTopics.length, 0, 'stop 清理活跃期与 timer');

const ended = makeEnv();
applyActive(ended, '旧话题', 1);
applyActive(ended, '旧话题', 1, '话题结束');
assert.equal(ended.orch.status().activeTopics.length, 0, '话题结束退出活跃期');
ended.orch.stop();

console.log('· proactive 默认关闭');
const proactive = makeEnv();
proactive.orch.startProactiveLoop();
assert.equal(proactive.orch.status().wakeTimers, 1, '显式启动才创建主动检查 timer');
proactive.orch.stop();
assert.equal(proactive.orch.status().wakeTimers, 0, 'stop 清理主动检查 timer');

console.log('· memory consolidation capability 边界、只减不增、失败保留');
const memory = createMemoryStore({ dataDir: tempDir(), log: {} });
for (let i = 0; i < 5; i += 1) memory.append('group:100', { userId: '1', name: '甲', content: `印象${i}` });
const events = [];
const missing = createMemoryConsolidationAdapter({ memory, cfg: () => ({ api: {} }), emit: (...args) => events.push(args) });
assert.equal(missing.start({ chatKey: 'group:100' }).status, 503, '模型未配置返回 503');
const cfg = () => ({ api: { model: 'm4-test' } });
const running = createMemoryConsolidationAdapter({ memory, cfg, memoryConsolidator: async () => new Promise(() => {}), emit: (...args) => events.push(args) });
assert.equal(running.start({ chatKey: 'group:100' }).status, 202, '整理异步启动返回 202');
assert.equal(running.start({ chatKey: 'group:100' }).status, 409, '并发整理返回 409');
const before = memory.query('group:100')[0].impressions.length;
const shrink = createMemoryConsolidationAdapter({ memory, cfg, memoryConsolidator: async () => ({ members: [{ userId: '1', name: '甲', impressions: [{ content: '保留', createdAt: 1 }] }] }), emit: (...args) => events.push(args) });
assert.equal(shrink.start({ chatKey: 'group:100' }).status, 202, '缩减整理启动成功');
await sleep(30);
assert.equal(memory.query('group:100')[0].impressions.length, 1, `整理只能减少已有成员印象；${JSON.stringify(events.slice(-3))}`);
assert.ok(events.some((entry) => entry[1]?.phase === 'consolidate-done'), '整理完成发出事件');
void before;
const fail = createMemoryConsolidationAdapter({ memory, cfg, memoryConsolidator: async () => { throw new Error('provider down'); }, emit: (...args) => events.push(args) });
assert.equal(fail.start({ chatKey: 'group:100' }).status, 202, '失败整理仍异步启动');
await sleep(10);
assert.equal(memory.query('group:100')[0].impressions.length, 1, '失败时保留原记忆');
assert.ok(events.some((entry) => entry[1]?.phase === 'consolidate-error'), '失败发出错误事件');

console.log('· orchestrator 成功运行后真实触发共享整理 provider');
const automatic = makeEnv({ cfgOverrides: { memory: { consolidateEnabled: true, consolidateMinImpressions: 4, maxImpressionsPerMember: 5 } } });
for (let i = 0; i < 5; i += 1) automatic.memory.append('group:100', { userId: '1', name: '甲', content: `自动印象${i}` });
let automaticCalls = 0;
createMemoryConsolidationAdapter({
  memory: automatic.memory,
  cfg: () => automatic.cfg,
  memoryConsolidator: async ({ members }) => {
    automaticCalls += 1;
    return { members: members.map((member) => ({ ...member, impressions: member.impressions.slice(0, 2) })) };
  },
  emit: (name, payload) => automatic.bus.emit(name, payload),
});
const automaticEvents = [];
automatic.bus.on('memory.update', (payload) => automaticEvents.push(payload), { internal: true });
await runOne(automatic, '@测试 请回答', true);
await sleep(10);
assert.equal(automaticCalls, 1, 'orchestrator 达阈值后调用共享 provider');
assert.equal(automatic.memory.query('group:100')[0].impressions.length, 2, '自动整理写回缩减结果');
assert.ok(automaticEvents.some((event) => event.phase === 'consolidate-start'), '自动整理发 start SSE 事件');
assert.ok(automaticEvents.some((event) => event.phase === 'consolidate-done'), '自动整理发 done SSE 事件');
automatic.orch.stop();

console.log('✓ m4-active-memory：全部通过');

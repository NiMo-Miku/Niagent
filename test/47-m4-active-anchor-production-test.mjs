// M4 生产验收：主动循环所有闸门 + 连续真实运行的 prompt anchor。
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createSendQueue } from '../src/kernel/send.js';
import { createOrchestrator } from '../src/kernel/orchestrator.js';
import { buildUserPrompt, resolvePromptAnchor } from '../src/kernel/prompt.js';
import { Bus } from '../src/kernel/bus.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-m4-prod-'));

function makeEnv({ now = () => Date.now(), random = () => 0, cfgOverrides = {}, llmResponses = [] } = {}) {
  const dataDir = tempDir();
  const bus = new Bus({ error() {}, warn() {} });
  const cfg = {
    api: { model: 'm4-test', maxRounds: 2, timeoutMs: 1000 },
    store: { contextTier: 1, randomPercent: 100, keywords: [], historyCount: 20, promptAnchor: { enabled: true, maxExtraRead: 5 } },
    wakeDelayMs: 1, drainDelayMs: 1, maxConcurrentRuns: 2, sessionRetryAttempts: 0,
    persona: { botName: '测试', roleText: '', participation: 'medium' },
    contextTier: 1, randomPercent: 100,
    allow: { groups: ['100'], private: [] }, deny: { groups: [], private: [] }, allowAllWhenEmpty: true,
    memory: { consolidateEnabled: false }, chatActive: { enabled: false, ttlMinutes: 30 },
    proactive: { enabled: false, checkIntervalMinMs: 60000, checkIntervalMaxMs: 60000, idleThresholdMs: 300000, probability: 1 },
    ...cfgOverrides,
  };
  const store = createChatStore({ dataDir, log: {} });
  const memory = createMemoryStore({ dataDir, log: {} });
  const sessions = createSessionRegistry({ dataDir, log: {}, bus });
  const prompts = [];
  const responses = [...llmResponses];
  const orch = createOrchestrator({
    cfg: () => cfg, store, sessions, memory, now, random,
    send: createSendQueue({ transport: { async send() { return []; } }, store, log: {}, cfg: () => cfg, bus }),
    registry: { list: () => [] }, loader: { promptSections: () => [], hooksOf: () => [] },
    onebot: { selfId: '999', call: async () => ({ data: {} }) }, bus, log: {},
    buildToolsFor: () => ({ tools: [], excludedTools: [] }),
    llmInvoker: async ({ messages }) => {
      prompts.push(messages[1]?.content ?? '');
      return responses.shift() ?? { message: { content: '' }, finishReason: 'stop' };
    },
    setTimeoutFn: setTimeout, clearTimeoutFn: clearTimeout,
  });
  return { cfg, store, memory, sessions, orch, prompts };
}

function add(env, text, ts = Date.now(), senderId = '1') {
  return env.store.appendIncoming('group:100', { mid: `${ts}-${senderId}`, ts, senderId, senderName: `成员${senderId}`, text, atMe: true, atNames: [] });
}

console.log('· proactive fake-clock 全闸与排程先行');
let scheduled = [];
const env = makeEnv({ random: () => 0, cfgOverrides: { proactive: { enabled: false, checkIntervalMinMs: 60000, checkIntervalMaxMs: 60000, idleThresholdMs: 300000, probability: 1 } } });
env.orch.startProactiveLoop();
assert.equal(env.orch.status().wakeTimers, 1, '启动主动循环先安排 timer');
env.orch.stopProactiveLoop();
assert.equal(env.orch.status().wakeTimers, 0, '停止主动循环清理 timer');
env.cfg.proactive.enabled = true;
env.cfg.proactive.idleThresholdMs = 300000;
const old = Date.now() - 400000;
add(env, '旧消息', old);
env.store.markAllRead('group:100');
await env.orch._tickProactive();
await sleep(20);
assert.equal(env.prompts.length, 1, 'enabled+概率+白名单+无未读+静默+未运行才 wake');
env.orch.stop();

const disabled = makeEnv({ random: () => 0.5 });
await disabled.orch._tickProactive();
assert.equal(disabled.prompts.length, 0, 'disabled 不 wake');
disabled.cfg.proactive.enabled = true;
disabled.cfg.proactive.probability = 0;
await disabled.orch._tickProactive();
assert.equal(disabled.prompts.length, 0, '概率闸阻断');
disabled.cfg.proactive.probability = 1;
add(disabled, '未读', Date.now() - 400000);
await disabled.orch._tickProactive();
assert.equal(disabled.prompts.length, 0, '未读闸阻断');
disabled.store.markAllRead('group:100');
const running = disabled.sessions.create('group:100');
disabled.sessions.update(running, { status: 'running' });
await disabled.orch._tickProactive();
assert.equal(disabled.prompts.length, 0, '并发/运行中闸阻断');
disabled.orch.stop();

console.log('· 连续两轮真实 run：activeTopic 与 prompt anchor byte prefix');
const topicEnv = makeEnv({
  cfgOverrides: { chatActive: { enabled: true, ttlMinutes: 30 } },

  llmResponses: [
    { message: { content: '' }, finishReason: 'stop' },
    { message: { content: '' }, finishReason: 'stop' },
  ],
});
add(topicEnv, '第一轮', Date.now(), '1');
await topicEnv.orch.onIncoming('group:100', topicEnv.store.recent('group:100', 1)[0]);
await sleep(280);
assert.equal(topicEnv.sessions.running().length, 0, '第一轮真实 run 已结束');
assert.equal(topicEnv.orch.status().activeTopics.length, 0, '无 finish activeTopic 时不误入活跃');
add(topicEnv, '第二轮', Date.now() + 1, '1');
await topicEnv.orch.onIncoming('group:100', topicEnv.store.recent('group:100', 1)[0]);
await sleep(280);
assert.equal(topicEnv.prompts.length, 2, '连续两轮真实 run 完成');
const stablePrefix = topicEnv.prompts[0].slice(0, topicEnv.prompts[0].indexOf('【未读信息】'));
const stablePrefix2 = topicEnv.prompts[1].slice(0, topicEnv.prompts[1].indexOf('【未读信息】'));
assert.ok(stablePrefix2.includes('第一轮'), '第二轮稳定前缀包含第一轮已读历史');
assert.notEqual(stablePrefix, stablePrefix2, '首次建立锚点后下一轮前缀包含新增历史');
assert.ok(topicEnv.prompts[1].includes('第一轮'), '第二轮 prompt 复用了第一轮已读历史');
topicEnv.orch.stop();

console.log('· 新成员、锚头滚出、maxExtraRead reset');
const read = Array.from({ length: 3 }, (_, i) => ({ id: i + 1, ts: i + 1, senderId: '1', text: `m${i}` }));
const anchor = resolvePromptAnchor({ readMessages: read, allReadMessages: read, prevAnchor: null, maxExtraRead: 1 });
const memberReset = resolvePromptAnchor({ readMessages: [...read], allReadMessages: [...read, { id: 4, ts: 4, senderId: '2', text: '新人' }], prevAnchor: anchor.anchor, maxExtraRead: 5 });
assert.equal(memberReset.mode, 'reset', '新增成员触发 reset');
const overflow = resolvePromptAnchor({ readMessages: read, allReadMessages: [...read, { id: 4, ts: 4, senderId: '1', text: 'x' }, { id: 5, ts: 5, senderId: '1', text: 'y' }], prevAnchor: anchor.anchor, maxExtraRead: 1 });
assert.equal(overflow.mode, 'reset', 'maxExtraRead 超限触发 reset');
const rolled = resolvePromptAnchor({ readMessages: [read[2]], allReadMessages: [read[2]], prevAnchor: anchor.anchor, maxExtraRead: 5 });
assert.equal(rolled.mode, 'reset', '锚头滚出窗口触发 reset');
const built = buildUserPrompt({ pastState: { count: 1, text: '已读' }, triggerEntries: [], newMemberText: '【对群友的印象】\n- 成员2：新人' });
assert.ok(built.includes('【新加入成员】'), '提示词包含新加入成员易变段');
env.orch.stop();
console.log('✓ m4-active-anchor-production：全部通过');

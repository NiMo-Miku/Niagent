// 311 · ingest.intercept 端到端（本体开发移交引索.md 任务二验收）：
// 真实 trpg-dice 插件 + 真实内核（createApplication）+ 档位 1 群——
// .bot on / .r 1d100 被唤醒前拦截并零模型直发；普通消息不认领 → 原档位判定路径不变。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApplication } from '../src/kernel/composition.js';
import { defaultComponents } from '../bundled/runtime-defaults/components.js';

const workspace = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-ingest-intercept-311-'));
const dataDir = path.join(temporary, 'data'), appRoot = path.join(temporary, 'app');
fs.mkdirSync(appRoot);
fs.cpSync(path.join(workspace, 'ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const folder of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, folder));
// 真实 trpg-dice 插件原样复制进隔离实例（独立仓库目录,只读使用）。
fs.cpSync(path.join(workspace, 'plugins', 'trpg-dice'), path.join(appRoot, 'plugins', 'trpg-dice'), { recursive: true });

const llmCalls = [];
const sends = [];
let eventSink = null;
const inject = (event) => {
  if (!eventSink) throw new Error('transport 尚未绑定 onEvent');
  eventSink(event);
};
const groupEvent = (text, mid) => ({
  kind: 'group', id: '100', type: 'message',
  event: { message_type: 'group', user_id: 555, sender: { nickname: '小明' }, message_id: mid, time: Math.floor(Date.now() / 1000), message: [{ type: 'text', data: { text } }] },
});
async function until(predicate, label = '条件') {
  const end = Date.now() + 8000;
  while (!predicate()) {
    assert.ok(Date.now() < end, `等待超时：${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

let kernel, base;
try {
  kernel = await createApplication({
    appRoot, headless: true,
    env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_MIGRATE_FROM: path.join(temporary, 'absent') },
    transportFactory: () => ({
      id: 'fixture-311', selfId: '999999', selfNickname: '小鲸鱼',
      bind({ onEvent }) { eventSink = onEvent; },
      async start() {}, stop() {},
      status: () => ({ connected: true, selfId: '999999', everConnected: true }),
      async send(chatKey, segments, options) { sends.push({ chatKey, segments, options }); return [{ msgId: sends.length }]; },
    }),
    components: {
      'runtime.logger': (options) => defaultComponents['runtime.logger']({ ...options, mirrorConsole: false }),
      'llm.complete': async (args) => { llmCalls.push(args.messages?.map((m) => m.content)?.[0] ?? ''); return { message: { role: 'assistant', content: '模型回复' }, finishReason: 'stop' }; },
    },
    fetchImpl: async () => { throw new Error('外呼被禁用'); },
    priceUpdates: { resolve: () => null, refresh: async () => ({ ok: true }), updateCheck: async () => ({ ok: true, current: '0.5.0', latest: '0.5.0', hasUpdate: false }) },
    communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
  });
  const config = kernel.config;
  config.update({
    server: { port: 0, token: 'synthetic-311' },
    api: { model: 'mock-311', maxRounds: 1 },
    allow: { groups: ['100'], private: [] }, allowAllWhenEmpty: true,
    // 档位 1（仅艾特）：未 @ 的消息在原路径必然不触发——这正是本验收的前提。
    store: { contextTier: 1, randomPercent: 0, keywords: [], historyCount: 80, promptAnchor: { enabled: false }, maxMessagesPerChat: 0 },
    wakeDelayMs: 4000, sessionContinue: { enabled: false },
    memory: { consolidateEnabled: false }, telemetry: { enabled: false }, proactive: { enabled: false }, chatActive: { enabled: false },
    skills: { 'trpg-dice': { enabled: true } },
  });
  const port = await kernel.start();
  base = `http://127.0.0.1:${port}`;
  const entry = kernel.loader.hostEntry('trpg-dice');
  assert.ok(entry?.status === 'active', 'trpg-dice 已装载激活');
  assert.equal(kernel.permissions.setOverride('trpg-dice', 'qq.send', 'allow', { fingerprint: entry.fingerprint }), true, '预授权 qq.send');
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log('· .bot on：档位 1 未 @ 也被唤醒前拦截,零模型开启跑团模式');
  const sendsBefore = sends.length;
  inject(groupEvent('.bot on', 1));
  await until(() => sends.length > sendsBefore, '.bot on 直发');
  const botOn = sends.at(-1);
  assert.equal(botOn.chatKey, 'group:100');
  assert.ok(/骰子指令已启用/.test(botOn.segments.map((s) => s.text).join('')), `开启提示：${botOn.segments.map((s) => s.text).join('')}`);
  assert.equal(llmCalls.length, 0, '零模型调用');
  assert.equal(kernel.sessions.listSummaries().filter((s) => s.chatKey === 'group:100').length, 0, '不建会话');
  const archived = kernel.store.recent('group:100', 10);
  const botEntry = archived.find((item) => item.text === '.bot on');
  assert.ok(botEntry, '指令进存档留痕');
  assert.equal(botEntry.read, true, '拦截后宿主标已读(沉历史,不进唤醒上下文)');

  console.log('· .r 1d100：档位 1 群零模型直发（0.4 行为恢复）');
  const diceBefore = sends.length;
  inject(groupEvent('.r 1d100', 2));
  await until(() => sends.length > diceBefore, '.r 1d100 直发');
  const diceText = sends.at(-1).segments.map((s) => s.text).join('');
  assert.ok(/1d100\s*=/.test(diceText), `骰子结果：${diceText}`);
  assert.equal(llmCalls.length, 0, '仍是零模型调用');
  assert.equal(kernel.sessions.listSummaries().filter((s) => s.chatKey === 'group:100').length, 0, '仍无会话');

  console.log('· 普通消息不认领 → 原路径：档位 1 判定不触发、标已读、无会话');
  const normalBefore = sends.length;
  inject(groupEvent('今天天气不错', 3));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(sends.length, normalBefore, '普通消息不回复');
  assert.equal(llmCalls.length, 0, '普通消息零模型');
  assert.equal(kernel.sessions.listSummaries().filter((s) => s.chatKey === 'group:100').length, 0, '普通消息不建会话');
  assert.equal(kernel.store.unread('group:100').length, 0, '档位 1 不触发 → 当场标已读(原语义)');

  console.log('· 拦截消息与普通消息都在同一存档里(历史完整)');
  assert.ok(kernel.store.recent('group:100', 10).some((item) => item.text === '今天天气不错'), '普通消息也留档');

  console.log('✓ 311-trpg-dice-ingest-intercept：档位 1 隔离实例端到端通过');
} finally {
  try { await kernel?.stop(); } catch { /* 尽力 */ }
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
  fs.rmSync(temporary, { recursive: true, force: true });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore, createMemoryConsolidator, extractJsonObject } from '../src/kernel/memory.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createUsageDayStore } from '../src/kernel/usage-days.js';
import { createReminderStore } from '../src/kernel/reminders.js';
import { createSendQueue } from '../src/kernel/send.js';
import { createOrchestrator } from '../src/kernel/orchestrator.js';
import { chatCompletion, chatCompletionWithRetry, resolveApiKey } from '../src/kernel/llm.js';
import { runAgent } from '../src/kernel/agent-runner.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createMemoryConsolidationAdapter } from '../src/console/memory-media-adapters.js';
import { createPluginLoader } from '../src/kernel/plugin-loader.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createStorage } from '../src/kernel/storage.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { Bus } from '../src/kernel/bus.js';
import { buildSystemPrompt } from '../src/kernel/prompt.js';
import { createSdkAccess } from '../src/kernel/sdk-services.js';

const response = (content = '', usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }) => ({ message: { role: 'assistant', content }, usage, raw: { usage } });
const http = (content = 'ok', status = 200) => new Response(status === 200 ? JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }) : content, { status, headers: { 'content-type': 'application/json' } });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function temporary(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-runtime-completion-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
function timers() {
  const tasks = new Map(); let next = 0;
  return { tasks, set(fn, ms) { const id = { id: ++next, unref() {} }; tasks.set(id, { fn, ms }); return id; }, clear(id) { tasks.delete(id); }, async fire() { const [id, task] = tasks.entries().next().value; tasks.delete(id); await task.fn(); } };
}
function environment(t, { overrides = {}, llm = async () => response(), hooks = () => [], loader = null, transportSend = async () => [{ msgId: 1 }], clock = () => Date.now() } = {}) {
  const dataDir = temporary(t);
  const c = { api: { model: 'fixture', maxRounds: 2 }, persona: { botName: '机器人' }, store: { contextTier: 4, historyCount: 20, promptAnchor: { enabled: true, maxExtraRead: 2 } }, memory: { consolidateEnabled: false }, allow: { groups: ['100'] }, proactive: { enabled: false }, send: { minGapMs: 0, maxGapMs: 0, byLengthMs: 0, dedupeWindowMs: 0 }, ...overrides };
  const store = createChatStore({ dataDir, log: {} });
  const memory = createMemoryStore({ dataDir, log: {}, cfg: () => c });
  const sessions = createSessionRegistry({ dataDir, log: {} });
  const reminders = createReminderStore({ dataDir, log: {} });
  const fake = timers();
  const requests = [];
  const send = createSendQueue({ cfg: () => c, store, log: {}, transport: { send: transportSend } });
  const orch = createOrchestrator({ cfg: () => c, store, memory, sessions, send, log: {}, now: clock, setTimeoutFn: fake.set, clearTimeoutFn: fake.clear,
    random: () => 0, loader: loader ?? { hooksOf: hooks, promptSections: () => [] }, llmInvoker: async (args) => { requests.push(structuredClone(args.messages)); return llm(args); },
    buildToolsFor: () => ({ tools: [], invoke: async () => ({ ok: true }) }),
  });
  t.after(() => { orch.stop(); sessions.stop(); });
  const append = (text, extra = {}) => store.appendIncoming('group:100', { senderId: '123456', senderName: '甲', text, ts: clock(), ...extra });
  const run = async (text) => { const entry = append(text); const s = sessions.create('group:100', { waitUntil: clock() + 1 }); await orch.wake('group:100', { waitingSessionId: s.id, verified: true }); return s; };
  return { dataDir, c, cfg: () => c, store, memory, sessions, reminders, fake, send, orch, requests, append, run };
}

test('proactive wake includes an explicit optional conversation opportunity', async (t) => {
  const e = environment(t, { overrides: { proactive: { enabled: true, probability: 1, idleThresholdMs: 300000 } } });
  await e.orch._tickProactive();
  assert.equal(e.requests.length, 1);
  assert.match(e.requests[0][1].content, /主动开话题机会/);
  assert.match(e.requests[0][1].content, /也可以安静结束/);
  assert.equal(e.sessions.listSummaries()[0].contextTier, 0);
  e.c.proactive.probability = 0;
  await e.orch._tickProactive();
  assert.equal(e.requests.length, 1, '概率0即便随机数恰为0也不触发');
});

test('before-context runs once before memory and trigger prompt assembly', async (t) => {
  let loader;
  const e = environment(t, { loader: { hooksOf: (...args) => loader.hooksOf(...args), promptSections: (...args) => loader.promptSections(...args) } });
  const appRoot = temporary(t), dir = path.join(appRoot, 'plugins', 'context-fixture'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'context-fixture', kind: 'plugin', permissions: ['fs.outsideNamespace', 'data.sessions.read'] }));
  fs.writeFileSync(path.join(dir, 'index.js'), `export default { setup(ctx) { ctx.hooks.on('before-context', async ({ store, memory, triggerEntries }) => {
    ctx.storage.set('count', (ctx.storage.get('count') || 0) + 1);
    if (!(await store.recent('group:100', 1)).length) throw new Error('scoped store is missing');
    await memory.append('group:100', { userId: '123456', name: '甲', content: '钩子新增的印象' }); triggerEntries[0].text = '钩子加工后的发言';
  }); } };`);
  const log = { info() {}, warn() {}, error() {}, child() { return this; } }, bus = new Bus(log);
  const config = createConfig({ dataDir: e.dataDir, defaults: buildDefaultConfig(), log }); config.load();
  const permissions = createPermissions({ dataDir: e.dataDir, log, bus, headless: true });
  const capability = createCapabilityRegistry({ log }), registry = createToolRegistry({ log, permissions, capabilities: capability });
  const scheduler = createScheduler({ log }), storage = createStorage({ dataDir: e.dataDir, log });
  const sdk = createSdkAccess({ config, permissions, loaderOf: () => loader, bus, facets: { 'data.messages': e.store, 'data.memory': e.memory } });
  loader = createPluginLoader({ appRoot, log, bus, config, registry, capabilityRegistry: capability, permissions, scheduler, storage, sdkHost: sdk });
  t.after(() => { loader.stopAll(); scheduler.stop(); permissions.close(); });
  await loader.loadAll();
  assert.equal(loader.isActive('context-fixture'), true);
  for (const scope of ['fs.outsideNamespace', 'data.sessions.read']) assert.equal(permissions.setOverride('context-fixture', scope, 'allow'), true);
  const s = await e.run('原始发言');
  assert.equal(storage.namespace('context-fixture').get('count'), 1);
  assert.match(s.userPrompt, /钩子新增的印象/);
  assert.match(s.userPrompt, /钩子加工后的发言/);
  assert.equal(e.store.recent('group:100', 1)[0].text, '原始发言', '加工上下文只影响本轮，不覆写原始发言');
});

test('anchor base remains byte stable and the cumulative append budget resets', async (t) => {
  const e = environment(t);
  const history = e.append('基座'); e.store.markEntryRead('group:100', history.id);
  const first = await e.run('第一轮');
  const stable = first.userPrompt.split('【未读信息】')[0];
  const second = await e.run('第二轮');
  const third = await e.run('第三轮');
  assert.equal(second.promptAnchorMode, 'anchor'); assert.equal(third.promptAnchorMode, 'anchor');
  assert.equal(second.userPrompt.split('【新已读信息】')[0], stable);
  assert.equal(third.userPrompt.split('【新已读信息】')[0], stable);
  assert.match(third.userPrompt, /第一轮[\s\S]*第二轮/);
  assert.equal(third.pastStateCount, 3);
  const fourth = await e.run('第四轮');
  assert.equal(fourth.promptAnchorMode, 'reset', '累计新增3条超过预算2，不能无限吞入基座');
});

test('reminders retain failure and retry only remaining split messages after restart', async (t) => {
  const actual = []; let attempts = 0;
  const e = environment(t, { overrides: { send: { hardSplitAt: 3, minGapMs: 0, maxGapMs: 0, byLengthMs: 0, dedupeWindowMs: 0 } }, transportSend: async (_, parts) => {
    attempts++; if (attempts === 2) throw new Error('offline'); actual.push(parts[0].text); return [{ msgId: attempts }];
  } });
  const r = e.reminders.add({ chatKey: 'group:100', text: 'abcdefghi', dueAt: 1 });
  e.orch.startReminderLoop(e.reminders);
  assert.equal([...e.fake.tasks.values()][0].ms, 5000);
  await e.fake.fire();
  assert.deepEqual(actual, ['abc']);
  assert.equal(e.reminders.pending().length, 1);
  assert.deepEqual(e.reminders.load()[0].pendingTexts, ['def', 'ghi']);
  e.orch.stopReminderLoop();
  e.orch.startReminderLoop(createReminderStore({ dataDir: e.dataDir, log: {} }));
  await e.fake.fire();
  assert.deepEqual(actual, ['abc', 'def', 'ghi']);
  assert.equal(e.reminders.pending().length, 0);
  assert.equal(e.reminders.load().find((item) => item.id === r.id).fired, true);
  assert.equal([...e.fake.tasks.values()][0].ms, 20000);
});

test('stopping in-flight reminders prevents rescheduling; pause resumes both loops', async (t) => {
  let entered, release;
  const ready = new Promise((resolve) => { entered = resolve; });
  const e = environment(t, { transportSend: async () => { entered(); await new Promise((resolve) => { release = resolve; }); return [{ msgId: 1 }]; } });
  e.reminders.add({ chatKey: 'group:100', text: '提醒', dueAt: 1 });
  e.orch.startReminderLoop(e.reminders);
  const firing = e.fake.fire(); await ready;
  e.orch.stopReminderLoop(); release(); await firing;
  assert.equal(e.fake.tasks.size, 0);
  e.orch.startReminderLoop(e.reminders); e.orch.startProactiveLoop();
  assert.equal(e.fake.tasks.size, 2);
  e.orch.pause(); assert.equal(e.fake.tasks.size, 0);
  e.orch.resume({ skipBacklog: true }); assert.equal(e.fake.tasks.size, 2);
});

test('an active topic obeys absolute expiry before a delayed timer callback', async (t) => {
  let clock = Date.now();
  const e = environment(t, { clock: () => clock, overrides: { chatActive: { enabled: true, ttlMinutes: 1 }, store: { contextTier: 1 } } });
  e.orch._applyChatActive({ session: { activeTopic: '猫', contextTier: 1 }, result: { finishReason: 'finish' }, chatKey: 'group:100' });
  clock += 60001;
  const entry = e.append('普通发言');
  await e.orch.onIncoming('group:100', entry);
  assert.equal(e.orch.status().waiting.length, 0);
  assert.equal(e.orch.status().activeTopics.length, 0);
});

test('memory parser accepts fenced, single-quoted and trailing-comma data', () => {
  assert.deepEqual(extractJsonObject("说明\n```json\n{'impressions':[{'content':'喜欢猫',},],}\n```"), { impressions: [{ content: '喜欢猫' }] });
  assert.deepEqual(extractJsonObject('impressions: [{"content":"猫"},]'), { impressions: [{ content: '猫' }] });
  assert.throws(() => extractJsonObject('not data'), /无法解析/);
});

test('memory model workflow resolves names, preserves failed members and records consumption', async (t) => {
  const e = environment(t);
  e.c.memberNotes = { '123456': '甲' };
  const members = [{ userId: '', name: '甲', impressions: [{ content: '爱猫', createdAt: 1 }, { content: '也爱猫', createdAt: 2 }] }, { userId: '654321', name: '乙', impressions: [{ content: '保留原文', createdAt: 3 }] }];
  const models = []; let requests = 0;
  const service = createMemoryConsolidator({ ...e, callLLM: async (args) => { models.push(args); requests++; return response(requests === 1 ? "{'impressions':[{'content':'爱猫',},],}" : '无法解析'); }, log: {} });
  const result = await service({ chatKey: 'group:100', members });
  assert.equal(result.members.length, 1); assert.equal(result.failures.length, 1);
  assert.equal(result.members[0].userId, '123456'); assert.equal(result.members[0]._source.userId, '');
  assert.deepEqual(result.members[0].impressions, [{ content: '爱猫', createdAt: 1 }]);
  assert.equal(models[0].overrides, null);
  const s = e.sessions.listSummaries().find((item) => item.activity === 'memory');
  assert.equal(s.usage.calls, 2); assert.equal(s.usage.totalTokens, 10);
  assert.equal(e.sessions.current('group:100'), null);
});

test('memory uses a dedicated model and new impressions only use the last 40 real utterances', async (t) => {
  const e = environment(t, { overrides: { memory: { useChatModel: false, provider: 'memory', model: 'memory-model', maxImpressionsPerMember: 2 } } });
  e.c.providers = [{ id: 'memory', baseURL: 'https://memory.invalid/v1', apiKey: 'fixture-key' }];
  for (let i = 0; i < 45; i++) e.append(`发言${String(i).padStart(2, '0')}`);
  let args;
  const service = createMemoryConsolidator({ ...e, callLLM: async (value) => { args = value; return response(JSON.stringify({ impressions: [{ content: 'x'.repeat(130) }, { content: '保留2' }, { content: '超过上限' }] })); }, log: {} });
  const result = await service({ chatKey: 'group:100', members: [], userIds: ['123456'], create: true });
  assert.equal(args.overrides.model, 'memory-model'); assert.equal(args.overrides.apiKey, 'fixture-key');
  const sample = JSON.parse(args.messages[1].content.split('\n').at(-1)).messages;
  assert.equal(sample.length, 40); assert.equal(sample[0].text, '发言05');
  assert.equal(result.members[0].impressions.length, 2); assert.equal(result.members[0].impressions[0].content.length, 120);
  assert.equal(e.sessions.listSummaries().find((s) => s.activity === 'memory').providerId, 'memory');
  const empty = await service({ chatKey: 'group:100', members: [], userIds: ['777777'], create: true });
  assert.deepEqual(empty.members, []);
});

test('memory refuses expansion and canceled processing cannot replace existing facts', async (t) => {
  const e = environment(t);
  const original = [{ userId: '123456', name: '甲', impressions: [{ content: '原文', createdAt: 1 }] }];
  const service = createMemoryConsolidator({ ...e, callLLM: async () => response('{"impressions":["a","b"]}'), log: {} });
  const result = await service({ chatKey: 'group:100', members: original });
  assert.equal(result.members.length, 0); assert.match(result.failures[0].error, /增加/);
  assert.equal(original[0].impressions[0].content, '原文');
  const controller = new AbortController();
  const canceled = createMemoryConsolidator({ ...e, callLLM: async () => { controller.abort(new Error('cancel')); return response('{"impressions":[]}'); }, log: {} });
  await assert.rejects(canceled({ chatKey: 'group:100', members: original, signal: controller.signal }), /cancel/);
  assert.equal(e.sessions.todayUsage().totalTokens, 10, '已收到的取消响应也必须记账');
});

test('explicit LLM endpoint overrides survive retry and bypass chat fallbacks', async () => {
  const called = [];
  const result = await chatCompletionWithRetry({ cfg: { api: { model: 'chat', baseUrl: 'https://chat.invalid', fallbackModels: [{ model: 'fallback' }] } }, overrides: { baseUrl: 'https://memory.invalid/v1', model: 'memory', apiKey: 'memory-key' }, messages: [], fetchFn: async (url, init) => { called.push({ url, body: JSON.parse(init.body), headers: init.headers }); return http(); } }, 0);
  assert.equal(called.length, 1); assert.equal(called[0].url, 'https://memory.invalid/v1/chat/completions'); assert.equal(called[0].body.model, 'memory'); assert.equal(called[0].headers.authorization, 'Bearer memory-key');
  assert.equal(result._usedApi.model, 'memory');
});

test('fallback keys ignore masks and honor provider/environment precedence', async () => {
  const calls = [];
  const envName = 'QQA_RUNTIME_COMPLETION_FIXTURE'; const previous = process.env[envName]; process.env[envName] = 'environment-key';
  try {
    const cfg = { api: { model: 'primary', baseUrl: 'https://primary.invalid', fallbackModels: [{ model: 'fallback', provider: 'second' }] }, dshProviderKeys: { second: '******' }, providers: [{ id: 'second', baseUrl: 'https://second.invalid', apiKey: 'provider-key', apiKeyFrom: envName }] };
    assert.equal(resolveApiKey({ ...cfg, api: { provider: 'second' } }), 'provider-key');
    cfg.providers[0].apiKey = '******'; assert.equal(resolveApiKey({ ...cfg, api: { provider: 'second' } }), 'environment-key');
    await chatCompletionWithRetry({ cfg, messages: [], fetchFn: async (url, init) => { calls.push({ url, key: init.headers.authorization }); return calls.length === 1 ? http('unknown model', 404) : http(); } }, 0);
    assert.equal(calls[1].key, 'Bearer environment-key');
  } finally { if (previous == null) delete process.env[envName]; else process.env[envName] = previous; }
});

test('physical requests and all LLM usage extensions are accounted; abort retains response', async () => {
  const controller = new AbortController(); let physical = 0;
  const cfg = { api: { model: 'fixture', baseUrl: 'https://fixture.invalid', maxRounds: 1 } };
  const capabilities = { providers: (name) => name === 'llm.retry-advisor' ? [{ ownerId: 'fixture', provider: ({ body }) => ({ body }) }] : name === 'llm.usage' ? [{ ownerId: 'fixture', provider: () => ({ customTokens: 7 }) }] : [] };
  const result = await runAgent({ session: { usage: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0 }, sent: [] }, systemPrompt: '', userPrompt: '', cfg, tools: [], invokeTool: async () => ({ ok: true }), signal: controller.signal,
    callLLM: (args) => chatCompletionWithRetry({ ...args, capabilities, fetchFn: async () => ++physical === 1 ? http('reject body', 415) : http() }, 0), log: {},
  });
  assert.equal(physical, 2); assert.equal(result.usage.calls, 2); assert.equal(result.usage.extra.customTokens, 7);
  const aborted = await chatCompletion({ cfg, messages: [], signal: controller.signal, fetchFn: async () => http(), capabilities: { providers: (name) => name === 'llm.response' ? [{ ownerId: 'fixture', provider: () => { controller.abort(); return null; } }] : [] }, log: {} });
  assert.equal(aborted.usage.total_tokens, 5); assert.equal(aborted.raw.choices[0].message.content, 'ok');
});

test('runner snapshots record the actual fallback provider identity', async () => {
  const snapshots = [];
  const session = { usage: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }, sent: [] };
  await runAgent({ session, systemPrompt: '', userPrompt: '', tools: [], cfg: { api: { provider: 'primary', maxRounds: 1 } }, invokeTool: async () => ({ ok: true }),
    callLLM: async () => ({ ...response(), _usedModel: 'fallback-model', _usedApi: { provider: 'fallback', baseUrl: 'https://fallback.invalid' } }), onRound: (snapshot) => snapshots.push(snapshot), log: {} });
  assert.equal(session.providerId, 'fallback'); assert.equal(snapshots.at(-1).providerId, 'fallback');
  assert.equal(snapshots.at(-1).model, 'fallback-model'); assert.equal(snapshots.at(-1).vendor, 'https://fallback.invalid');
});

test('scheduler contains rejected async jobs and reclaims stopped owners', async (t) => {
  const errors = [];
  const scheduler = createScheduler({ log: { error: (message) => errors.push(message) } });
  t.after(() => scheduler.stop());
  scheduler.every(5, async () => { throw new Error('async fixture'); }, { ownerId: 'fixture' });
  await sleep(18);
  assert.ok(errors.some((message) => /async fixture/.test(message)));
  assert.equal(scheduler.disposeOwner('fixture'), 1);
  const count = errors.length; await sleep(12); assert.equal(errors.length, count);
});

async function complete(adapter) {
  for (let i = 0; i < 100 && adapter.running.size; i++) await sleep(5);
  assert.equal(adapter.running.size, 0, '异步整理应完成');
}

test('real memory adapter writes resolved QQ identity and removes only the old named record', async (t) => {
  const e = environment(t); e.c.memberNotes = { '123456': '甲' };
  e.memory.append('group:100', { name: '甲', content: '旧名字记录' });
  const service = createMemoryConsolidator({ ...e, callLLM: async () => response('{"impressions":["整理后的印象"]}'), log: {} });
  const events = [];
  const adapter = createMemoryConsolidationAdapter({ ...e, memoryConsolidator: service, emit: (_, event) => events.push(event) });
  assert.equal(adapter.start({ chatKey: 'group:100', userIds: ['123456'] }).status, 202);
  await complete(adapter);
  assert.equal(e.memory.query('group:100', { name: '甲' }).length, 0);
  assert.equal(e.memory.query('group:100', { userId: '123456' })[0].impressions[0].content, '整理后的印象');
  assert.ok(events.some((event) => event.phase === 'consolidate-done'));
  const reopened = createMemoryStore({ dataDir: e.dataDir, log: {} });
  assert.equal(reopened.query('group:100')[0].userId, '123456');
});

test('real adapter creates an explicitly selected member using the dedicated model', async (t) => {
  const e = environment(t, { overrides: { api: { model: '' }, memory: { useChatModel: false, provider: 'dedicated', model: 'memory-model' } } });
  e.c.providers = [{ id: 'dedicated', baseURL: 'https://memory.invalid' }];
  e.append('我很喜欢猫');
  let calls = 0;
  const service = createMemoryConsolidator({ ...e, callLLM: async (args) => { calls++; assert.equal(args.overrides.model, 'memory-model'); return response('{"impressions":["喜欢猫"]}'); }, log: {} });
  const adapter = createMemoryConsolidationAdapter({ ...e, memoryConsolidator: service });
  assert.equal(adapter.availability().available, true);
  assert.equal(adapter.start({ chatKey: 'group:100', userIds: ['123456'], create: true }).status, 202);
  await complete(adapter);
  assert.equal(calls, 1); assert.equal(e.memory.query('group:100', { userId: '123456' })[0].impressions[0].content, '喜欢猫');
});

test('identified and renamed records resolving to the same QQ merge without losing either impression', async (t) => {
  const e = environment(t); e.c.memberNotes = { '123456': '现在的名字' };
  e.memory.append('group:100', { userId: '123456', name: '以前的名字', content: 'QQ记录' });
  e.memory.append('group:100', { name: '现在的名字', content: '名称记录' });
  let calls = 0;
  const service = createMemoryConsolidator({ ...e, callLLM: async (args) => {
    calls++; const input = JSON.parse(args.messages[1].content.split('\n').at(-1));
    assert.equal(input.impressions.length, 2);
    return response(JSON.stringify({ impressions: input.impressions }));
  }, log: {} });
  const adapter = createMemoryConsolidationAdapter({ ...e, memoryConsolidator: service });
  adapter.start({ chatKey: 'group:100' }); await complete(adapter);
  assert.equal(calls, 1);
  assert.equal(e.memory.query('group:100').length, 1);
  assert.deepEqual(e.memory.query('group:100', { userId: '123456' })[0].impressions.map((item) => item.content).sort(), ['QQ记录', '名称记录']);
  assert.equal(fs.existsSync(path.join(e.dataDir, 'memory', 'group_100', '_n_现在的名字.json')), false);
});

test('model failures preserve original memory and do not start consolidation cooldown', async (t) => {
  const e = environment(t); e.memory.append('group:100', { userId: '123456', name: '甲', content: '保留' });
  const events = [];
  const service = createMemoryConsolidator({ ...e, callLLM: async () => response('bad JSON'), log: {} });
  const adapter = createMemoryConsolidationAdapter({ ...e, memoryConsolidator: service, emit: (_, event) => events.push(event) });
  adapter.start({ chatKey: 'group:100' }); await complete(adapter);
  assert.equal(e.memory.query('group:100')[0].impressions[0].content, '保留');
  assert.equal(e.memory.lastConsolidatedAt('group:100'), 0);
  assert.ok(events.some((event) => event.phase === 'consolidate-error'));
});

test('identity migration retains the old member when the replacement cannot persist', async (t) => {
  const e = environment(t); e.c.memberNotes = { '123456': '甲' };
  e.memory.append('group:100', { name: '甲', content: '必须保留' });
  const target = path.join(e.dataDir, 'memory', 'group_100', '123456.json'); fs.mkdirSync(target);
  const service = createMemoryConsolidator({ ...e, callLLM: async () => response('{"impressions":["新印象"]}'), log: {} });
  const adapter = createMemoryConsolidationAdapter({ ...e, memoryConsolidator: service });
  adapter.start({ chatKey: 'group:100' }); await complete(adapter);
  assert.equal(e.memory.query('group:100', { name: '甲' })[0].impressions[0].content, '必须保留');
  assert.equal(e.memory.query('group:100', { userId: '123456' }).length, 0);
  const reopened = createMemoryStore({ dataDir: e.dataDir, log: {} });
  assert.equal(reopened.query('group:100', { name: '甲' })[0].impressions[0].content, '必须保留');
});

test('real loader resolves dynamic context sections and records hook errors without disabling the plugin', async (t) => {
  const appRoot = temporary(t), dataDir = temporary(t);
  const dir = path.join(appRoot, 'bundled', 'dynamic'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'dynamic', kind: 'plugin', prompt: { sections: [{ content: '静态', priority: 50 }] } }));
  fs.writeFileSync(path.join(dir, 'index.js'), `export default { setup(ctx) { ctx.hooks.on('after-response', async () => { throw new Error('fixture runtime hook'); }); }, async promptSections(context) { return [{ content: '动态:' + context.chatKey, priority: 500 }, { content: '零优先级', priority: 0 }]; } };`);
  const log = { info() {}, warn() {}, error() {}, child() { return this; } }, bus = new Bus(log);
  const config = createConfig({ dataDir, defaults: buildDefaultConfig({ personaText: '' }), log }); config.load();
  const capability = createCapabilityRegistry({ log }); capability.register('memory.consolidate', 'kernel', () => 'builtin');
  const permissions = createPermissions({ dataDir, log, bus, headless: true });
  const registry = createToolRegistry({ log, permissions, capabilities: capability });
  const scheduler = createScheduler({ log });
  const storage = createStorage({ dataDir, log });
  const loader = createPluginLoader({ appRoot, log, bus, config, registry, capabilityRegistry: capability, permissions, scheduler, storage });
  t.after(() => { loader.stopAll(); scheduler.stop(); });
  await loader.loadAll({ reason: 'fixture' });
  assert.equal(loader.listEntries()[0]?.status, 'active', JSON.stringify(loader.listEntries()));
  const sections = await loader.promptSections({ chatKey: 'group:100' });
  assert.equal(sections[0].content, '动态:group:100'); assert.equal(sections[0].priority, 99);
  assert.equal(sections.at(-1).priority, 0);
  const system = buildSystemPrompt({ cfg: {}, skillSections: sections });
  assert.ok(system.indexOf('静态') < system.indexOf('零优先级'));
  assert.equal(loader.promptSections()[0].content, '静态', '旧同步调用仍可读取静态清单');
  assert.equal(capability.providers('memory.consolidate')[0].ownerId, 'kernel');
  const result = await runAgent({ session: { usage: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }, sent: [] }, systemPrompt: '', userPrompt: '', tools: [], cfg: { api: { maxRounds: 1 } }, callLLM: async () => response(), invokeTool: async () => ({ ok: true }), hooksOf: loader.hooksOf, log });
  assert.equal(result.error, null);
  assert.equal(loader.isActive('dynamic'), true);
  assert.match(loader.listEntries()[0].lastError, /fixture runtime hook/);
});

const usageFor = (tokens, calls = 1) => ({ promptTokens: tokens, completionTokens: 0, totalTokens: tokens, cachedTokens: 0, calls });
const dailyPrice = (rate = 1) => (s) => ({ cost: s.usage.totalTokens * rate, breakdown: { fresh: s.usage.totalTokens * rate, cached: 0, output: 0 }, peak: false, peakTokens: 0, offPeakTokens: s.usage.totalTokens, source: 'fixture' });
function readDay(dataDir, day) { return JSON.parse(fs.readFileSync(path.join(dataDir, 'usage-days', `${day}.json`), 'utf8')); }
function fixtureUsageSession(id, day, tokens) { return { id, chatKey: 'group:100', startedAt: new Date(`${day}T10:00:00`).getTime(), endedAt: Date.now(), status: 'done', model: 'fixture', providerId: 'fixture-provider', usage: usageFor(tokens), messages: [{ role: 'tool', toolCall: { name: 'send_message' } }], traceVersion: 1 }; }

test('daily usage survives retention, same-ID retry and late terminal responses after shutdown', (t) => {
  const dataDir = temporary(t);
  const days = createUsageDayStore({ dataDir, costFor: dailyPrice(), log: {} });
  const registry = createSessionRegistry({ dataDir, keepSessionFiles: () => 1, onFinishedSession: days.record, log: {} });
  t.after(() => registry.stop());
  const a = registry.create('group:100'); Object.assign(a, fixtureUsageSession(a.id, '2026-10-08', 5), { status: 'running' });
  registry.finish(a.id, 'done');
  registry.update(a, { status: 'running' }); registry.update(a, { usage: usageFor(8, 2) }); registry.finish(a.id, 'done');
  const b = registry.create('private:200'); Object.assign(b, fixtureUsageSession(b.id, '2026-10-08', 2), { status: 'running', chatKey: 'private:200' });
  registry.finish(b.id, 'done', { endedAt: a.endedAt + 100 });
  assert.equal(registry.peek(a.id), null); assert.equal(fs.existsSync(path.join(dataDir, 'sessions', `${a.id}.json`)), false);
  assert.equal(readDay(dataDir, '2026-10-08').aggregates.totals.totalTokens, 10);
  registry.stop(); registry.update(a, { usage: usageFor(11, 2) });
  const day = readDay(dataDir, '2026-10-08');
  assert.equal(day.aggregates.totals.totalTokens, 13); assert.equal(day.aggregates.totals.runs, 2); assert.equal(day.aggregates.totals.exactCalls, 3);
  assert.equal(day.records[a.id].usage.totalTokens, 11); assert.equal(day.records[a.id].cost, 11); assert.equal(day.records[a.id].providerId, 'fixture-provider');
  assert.equal(day.aggregates.toolCounts.send_message, 2); assert.equal(fs.existsSync(path.join(dataDir, 'sessions', `${a.id}.json`)), false);
});

test('legacy daily aggregates keep their baseline while cumulative detail records charge only new usage', (t) => {
  const dataDir = temporary(t), day = '2026-10-08'; fs.mkdirSync(path.join(dataDir, 'usage-days'));
  const aggregate = { totals: { totalTokens: 100, promptTokens: 100, cost: 50, runs: 5, exactCalls: 5 }, hours: [], chats: [{ chatKey: 'group:100', totalTokens: 100, cost: 50 }], models: [{ model: 'fixture', totalTokens: 100, cost: 50 }], searchCount: 7, toolCounts: { send_message: 7 } };
  fs.writeFileSync(path.join(dataDir, 'usage-days', `${day}.json`), JSON.stringify({ version: 1, day, aggregates: aggregate }));
  let rate = 1;
  let store = createUsageDayStore({ dataDir, costFor: (s) => dailyPrice(rate)(s), log: {} });
  const session = fixtureUsageSession('legacy-id', day, 12); session.webSearchCount = 2; session.messages.push({ role: 'tool', toolCall: { name: 'send_message' } });
  store.record(session, { ...usageFor(10), counted: true, webSearchCount: 1, toolCounts: { send_message: 1 } });
  let persisted = readDay(dataDir, day);
  assert.equal(persisted.aggregates.totals.totalTokens, 102); assert.equal(persisted.aggregates.totals.cost, 52); assert.equal(persisted.aggregates.totals.runs, 5);
  assert.equal(persisted.aggregates.chats[0].totalTokens, 102); assert.equal(persisted.aggregates.models[0].cost, 52);
  assert.equal(persisted.aggregates.searchCount, 8); assert.equal(persisted.aggregates.toolCounts.send_message, 8);
  assert.equal(persisted.records['legacy-id'].usage.totalTokens, 12); assert.equal(persisted.records['legacy-id'].cost, 12);
  store = createUsageDayStore({ dataDir, costFor: (s) => dailyPrice(rate)(s), log: {} }); rate = 2;
  session.usage = usageFor(15, 2); store.record(session); store.record(session);
  persisted = readDay(dataDir, day);
  assert.equal(persisted.aggregates.totals.totalTokens, 105); assert.equal(persisted.aggregates.totals.cost, 58);
  assert.equal(persisted.records['legacy-id'].cost, 18); assert.equal(persisted.records['legacy-id'].contributionCost, 8);
  assert.equal(persisted.records['legacy-id'].costInfo.breakdown.fresh, 18);
  assert.deepEqual(persisted.legacyAggregates, aggregate);
});

test('daily record moves across days once and failed destination writes preserve the old archive', (t) => {
  const dataDir = temporary(t), store = createUsageDayStore({ dataDir, costFor: dailyPrice(), log: {} });
  const session = fixtureUsageSession('moving-id', '2026-10-08', 5); store.record(session);
  const blocked = path.join(dataDir, 'usage-days', '2026-10-09.json'); fs.mkdirSync(blocked);
  session.startedAt = new Date('2026-10-09T10:00:00').getTime(); session.usage = usageFor(8, 2);
  assert.equal(store.record(session), false); assert.equal(readDay(dataDir, '2026-10-08').records[session.id].usage.totalTokens, 5);
  fs.rmdirSync(blocked); assert.ok(store.record(session));
  assert.equal(readDay(dataDir, '2026-10-08').aggregates.totals.totalTokens, 0);
  const next = readDay(dataDir, '2026-10-09'); assert.equal(next.aggregates.totals.totalTokens, 8); assert.equal(next.aggregates.totals.cost, 8); assert.equal(next.aggregates.totals.runs, 1);
  assert.equal(next.records[session.id].cost, 8);
});

test('legacy usage-daily migration and startup terminal backfill preserve aggregate history', async (t) => {
  const dataDir = temporary(t), day = '2026-10-08', session = fixtureUsageSession('startup-id', day, 5);
  fs.writeFileSync(path.join(dataDir, 'usage-daily.json'), JSON.stringify({ version: 1, days: { [day]: { aggregates: { totals: { totalTokens: 35, cost: 17 }, chats: [], models: [], hours: [] } } } }));
  fs.mkdirSync(path.join(dataDir, 'sessions')); fs.writeFileSync(path.join(dataDir, 'sessions', `${session.id}.json`), JSON.stringify(session));
  const store = createUsageDayStore({ dataDir, costFor: dailyPrice(), log: {} });
  const registry = createSessionRegistry({ dataDir, onFinishedSession: store.record, log: {} }); t.after(() => registry.stop());
  registry.reconcileInBackground(); await sleep(10);
  const saved = readDay(dataDir, day); assert.equal(saved.aggregates.totals.totalTokens, 35); assert.equal(saved.aggregates.totals.cost, 17);
  assert.equal(saved.records[session.id].usage.totalTokens, 5); assert.equal(saved.records[session.id].cost, 5);
  registry.clearFinished(); assert.equal(readDay(dataDir, day).records[session.id].usage.totalTokens, 5);
});

test('daily store recovers an interrupted cross-day move without duplicated aggregate contribution', (t) => {
  const dataDir = temporary(t), store = createUsageDayStore({ dataDir, costFor: dailyPrice(), log: {} });
  const session = fixtureUsageSession('duplicate-id', '2026-10-08', 5); store.record(session);
  const copied = readDay(dataDir, '2026-10-08'); copied.day = '2026-10-09'; copied.savedAt += 1000;
  copied.records[session.id].day = copied.day; copied.records[session.id].startedAt = new Date('2026-10-09T10:00:00').getTime();
  fs.writeFileSync(path.join(dataDir, 'usage-days', `${copied.day}.json`), JSON.stringify(copied));
  createUsageDayStore({ dataDir, costFor: dailyPrice(), log: {} });
  assert.equal(readDay(dataDir, '2026-10-08').aggregates.totals.totalTokens, 0);
  assert.equal(readDay(dataDir, '2026-10-09').records[session.id].usage.totalTokens, 5);
});

test('history callback errors do not prevent session completion or retention', (t) => {
  const dataDir = temporary(t), errors = [];
  const registry = createSessionRegistry({ dataDir, onFinishedSession: () => { throw new Error('history fixture'); }, log: { warn: (message) => errors.push(message) } }); t.after(() => registry.stop());
  const session = registry.create('group:100'); session.usage = usageFor(3);
  assert.equal(registry.finish(session.id, 'done').status, 'done');
  assert.ok(errors.some((message) => /history fixture/.test(message))); assert.equal(registry.get(session.id).usage.totalTokens, 3);
});

test('automatic retention protects sessions whose daily archive write failed until a successful retry', (t) => {
  const dataDir = temporary(t); let fail = true;
  const store = createUsageDayStore({ dataDir, costFor: dailyPrice(), log: {} });
  const registry = createSessionRegistry({ dataDir, keepSessionFiles: () => 1, onFinishedSession: (s, previous) => fail ? false : store.record(s, previous), log: {} }); t.after(() => registry.stop());
  const a = registry.create('group:100'); a.usage = usageFor(3); registry.finish(a.id, 'done');
  fail = false;
  const b = registry.create('group:100'); b.usage = usageFor(4); registry.finish(b.id, 'done', { endedAt: a.endedAt + 10 });
  assert.ok(registry.peek(a.id), '失败日档的老会话必须保留'); assert.ok(fs.existsSync(path.join(dataDir, 'sessions', `${a.id}.json`)));
  registry.update(a); registry.setKeepFiles(1);
  assert.equal(registry.peek(a.id), null); assert.equal(fs.existsSync(path.join(dataDir, 'sessions', `${a.id}.json`)), false);
  const saved = Object.values(JSON.parse(fs.readFileSync(path.join(dataDir, 'usage-days', fs.readdirSync(path.join(dataDir, 'usage-days'))[0]), 'utf8')).records);
  assert.equal(saved.find((record) => record.id === a.id).usage.totalTokens, 3);
});

test('consolidation keeps new impressions appended while the model was awaiting its response', async (t) => {
  const e = environment(t); e.memory.append('group:100', { userId: '123456', name: '甲', content: '旧事实' });
  let release, started; const inFlight = new Promise((resolve) => { started = resolve; });
  const service = createMemoryConsolidator({ ...e, callLLM: async () => { started(); return new Promise((resolve) => { release = resolve; }); }, log: {} });
  const events = [], adapter = createMemoryConsolidationAdapter({ ...e, memoryConsolidator: service, emit: (_, event) => events.push(event) });
  adapter.start({ chatKey: 'group:100' }); await inFlight;
  e.memory.append('group:100', { userId: '123456', name: '甲', content: '等待中新增的事实' });
  release(response('{"impressions":["模型整理的旧事实"]}')); await complete(adapter);
  assert.deepEqual(e.memory.query('group:100', { userId: '123456' })[0].impressions.map((item) => item.content).sort(), ['旧事实', '等待中新增的事实'].sort());
  assert.equal(e.memory.lastConsolidatedAt('group:100'), 0); assert.ok(events.some((event) => event.phase === 'consolidate-error'));
});

test('legacy daily write failure persists its original accounting baseline across restart', async (t) => {
  const dataDir = temporary(t), day = '2026-10-08'; fs.mkdirSync(path.join(dataDir, 'usage-days'));
  fs.writeFileSync(path.join(dataDir, 'usage-days', `${day}.json`), JSON.stringify({ version: 1, day, aggregates: { totals: { totalTokens: 10, promptTokens: 10, cost: 10, runs: 1, exactCalls: 1 }, hours: [], chats: [], models: [] } }));
  const initial = createSessionRegistry({ dataDir, log: {}, onFinishedSession: () => false });
  const session = initial.create('group:100'); Object.assign(session, fixtureUsageSession(session.id, day, 12), { status: 'running', accountedUsage: { ...usageFor(10), counted: true } });
  initial.finish(session.id, 'done'); initial.stop();
  const file = path.join(dataDir, 'sessions', `${session.id}.json`);
  assert.equal(JSON.parse(fs.readFileSync(file)).accountedUsage.totalTokens, 12);
  assert.equal(JSON.parse(fs.readFileSync(file)).usageArchiveBaseline.totalTokens, 10);
  const store = createUsageDayStore({ dataDir, costFor: dailyPrice(), log: {} });
  const reopened = createSessionRegistry({ dataDir, onFinishedSession: store.record, log: {} }); t.after(() => reopened.stop());
  reopened.reconcileInBackground(); await sleep(10);
  assert.equal(readDay(dataDir, day).aggregates.totals.totalTokens, 12); assert.equal(readDay(dataDir, day).aggregates.totals.cost, 12);
  assert.equal(reopened.peek(session.id).usageArchiveBaseline, undefined);
});

function readHistory(e, id, count, extra = {}) {
  for (let index = 0; index < count; index++) {
    const entry = e.append(`成员${id}的真实发言${index}`, { senderId: id, senderName: `成员${id}`, ...extra });
    e.store.markEntryRead('group:100', entry.id);
  }
}

test('automatic discovery obeys message and member limits, excludes existing identities, and shares cooldown', async (t) => {
  const e = environment(t, { overrides: { memory: { consolidateEnabled: true, discoverMinMessages: 20, discoverMaxMembers: 0 } } });
  e.memory.append('group:100', { userId: '123456', name: '甲', content: '已有印象' });
  e.memory.append('group:100', { name: '有名档', content: '已有名称印象' }); e.c.memberNotes = { '200001': '有名档' };
  readHistory(e, '200001', 20); readHistory(e, '200002', 19);
  const calls = [];
  const service = createMemoryConsolidator({ ...e, callLLM: async (args) => {
    const input = JSON.parse(args.messages[1].content.split('\n').at(-1)); calls.push(input);
    return response('{"impressions":["根据真实发言提炼的印象"]}');
  }, log: {} });
  const adapter = createMemoryConsolidationAdapter({ ...e, memoryConsolidator: service });
  await e.run('完成一次聊天'); await complete(adapter); assert.equal(calls.length, 0, '0关闭自动发现');
  e.c.memory.discoverMaxMembers = 2;
  await e.run('再次聊天'); await complete(adapter); assert.equal(calls.length, 0, '19条未达到20条且有名旧档不能重复发现');
  readHistory(e, '200002', 1); readHistory(e, '200003', 55); readHistory(e, '200004', 20);
  readHistory(e, '200005', 20, { isPoke: true }); readHistory(e, '200006', 20, { recalled: true });
  readHistory(e, '200007', 20); e.c.globalBlocklist = ['200007'];
  readHistory(e, 'invalid-qq', 20);
  await e.run('达到门槛的聊天'); await complete(adapter);
  assert.deepEqual(calls.map((item) => item.userId).sort(), ['200003', '200004']);
  assert.equal(calls.find((item) => item.userId === '200003').messages.length, 40, '达到发现门槛后实际提炼只看最近40条');
  assert.equal(e.memory.query('group:100', { userId: '200002' }).length, 0, '每轮至多2名新成员');
  assert.equal(e.memory.query('group:100', { userId: '200005' }).length, 0);
  assert.ok(e.memory.lastConsolidatedAt('group:100') > 0);
  await e.run('冷却期内聊天'); await complete(adapter); assert.equal(calls.length, 2, '成功发现与整理共用6h冷却');
});

test('automatic discovery uses the dedicated model; empty or malformed results do not create files or suppress retries', async (t) => {
  for (const bad of ['{"impressions":[]}', '{"impressions":[" "]}', 'bad JSON']) {
    let e;
    e = environment(t, { overrides: { memory: { consolidateEnabled: true, discoverMinMessages: 20, discoverMaxMembers: 3, useChatModel: false, provider: 'dedicated', model: 'memory-model' } }, llm: async () => { e.c.api.model = ''; return response(); } });
    e.c.providers = [{ id: 'dedicated', baseURL: 'https://memory.invalid' }];
    e.memory.append('group:100', { userId: '123456', name: '甲', content: '已有印象' }); readHistory(e, '200001', 20);
    let calls = 0;
    const service = createMemoryConsolidator({ ...e, callLLM: async (args) => { calls++; assert.equal(args.overrides.model, 'memory-model'); return response(calls === 1 ? bad : '{"impressions":["成功重试的印象"]}'); }, log: {} });
    const adapter = createMemoryConsolidationAdapter({ ...e, memoryConsolidator: service });
    await e.run('第一次聊天'); await complete(adapter);
    assert.equal(calls, 1); assert.equal(e.memory.query('group:100', { userId: '200001' }).length, 0); assert.equal(e.memory.lastConsolidatedAt('group:100'), 0);
    assert.equal(fs.existsSync(path.join(e.dataDir, 'memory', 'group_100', '200001.json')), false);
    e.c.api.model = 'fixture'; // 下一次聊天可开始；请求完成时再次清空，自动整理仍按专用模型判定。
    await e.run('失败后下一次聊天'); await complete(adapter);
    assert.equal(calls, 2); assert.equal(e.memory.query('group:100', { userId: '200001' })[0].impressions[0].content, '成功重试的印象');
  }
});

test('automatic consolidation and bounded discovery share one task; a failed candidate keeps retry eligibility', async (t) => {
  const e = environment(t, { overrides: { memory: { consolidateEnabled: true, discoverMinMessages: 20, discoverMaxMembers: 2 } } });
  for (let index = 0; index < 5; index++) e.memory.append('group:100', { userId: '123456', name: '甲', content: `已有印象${index}` });
  readHistory(e, '200001', 20); readHistory(e, '200002', 20); readHistory(e, '200003', 19);
  let firstFailure = true; const calls = [];
  const service = createMemoryConsolidator({ ...e, callLLM: async (args) => {
    const input = JSON.parse(args.messages[1].content.split('\n').at(-1)); calls.push(input.userId);
    if (input.userId === '200001' && firstFailure) { firstFailure = false; return response('{"impressions":[]}'); }
    return response(JSON.stringify({ impressions: input.impressions.length ? input.impressions : ['发现的新印象'] }));
  }, log: {} });
  const adapter = createMemoryConsolidationAdapter({ ...e, memoryConsolidator: service });
  await e.run('整理和发现'); await complete(adapter);
  assert.deepEqual(calls.sort(), ['123456', '200001', '200002']);
  assert.equal(e.memory.query('group:100', { userId: '200002' }).length, 1); assert.equal(e.memory.query('group:100', { userId: '200003' }).length, 0);
  assert.equal(e.memory.query('group:100', { userId: '200001' }).length, 0); assert.equal(e.memory.lastConsolidatedAt('group:100'), 0, '部分发现失败不能用成功旧成员整理挡住重试');
  await e.run('重试失败候选'); await complete(adapter);
  assert.equal(e.memory.query('group:100', { userId: '200001' }).length, 1); assert.ok(e.memory.lastConsolidatedAt('group:100') > 0);
});

test('automatic consolidation respects an explicit zero impression threshold without triggering for empty memory', async (t) => {
  const e = environment(t, { overrides: { memory: { consolidateEnabled: true, consolidateMinImpressions: 0, discoverMaxMembers: 0 } } });
  let calls = 0;
  const service = createMemoryConsolidator({ ...e, callLLM: async (args) => {
    calls++; const input = JSON.parse(args.messages[1].content.split('\n').at(-1));
    return response(JSON.stringify({ impressions: input.impressions }));
  }, log: {} });
  const adapter = createMemoryConsolidationAdapter({ ...e, memoryConsolidator: service });
  await e.run('空记忆时聊天'); await complete(adapter); assert.equal(calls, 0, '总数0未超过显式阈值0');
  e.memory.append('group:100', { userId: '123456', name: '甲', content: '唯一印象' });
  await e.run('有一条印象时聊天'); await complete(adapter); assert.equal(calls, 1, '总数1超过显式阈值0，不能回退成默认4');
});

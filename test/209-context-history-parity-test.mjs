// Offline production paths: saved/reloaded config, actual incoming batches,
// default prompt/runner/tool execution and disk sessions. No app or browser boot.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultComponents } from '../bundled/runtime-defaults/components.js';
import { loadComposition } from '../src/kernel/composition.js';
import coreTools from '../bundled/core-tools/index.js';
import webTools from '../bundled/web-tools/index.js';
import { fixtureCapability } from './bundled-fixture-sdk.mjs';

const log = { info() {}, warn() {}, error() {} }, key = 'group:20901';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { const end = Date.now() + 5000; while (!check()) { assert.ok(Date.now() < end, 'controlled runtime reached its terminal state'); await pause(5); } }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const finish = () => ({ message: { role: 'assistant', content: '', tool_calls: [{ id: 'finish-209', type: 'function', function: { name: 'finish', arguments: '{"reason":"offline context complete"}' } }] }, finishReason: 'tool_calls', usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } });
function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-history-parity-209-'));
  t.after(() => {
    const absolute = path.resolve(root);
    assert.equal(path.dirname(absolute).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(absolute).startsWith('qqa-history-parity-209-'));
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  return root;
}
let seedBytes;
function historyTokens(prompt) {
  const beforeTrigger = prompt.split('【未读信息】')[0];
  return [...beforeTrigger.matchAll(/HISTORY_\d{4}|TURN_[A-Z0-9_]+/g)].map(match => match[0]);
}
function runtime(t, { historyCount = 80, slider = 90, anchor = false, components = defaultComponents, llm = async () => finish() } = {}) {
  const dataDir = temporary(t), config = components['runtime.config']({ dataDir, defaults: components['runtime.config.defaults']({ personaText: 'Synthetic history persona.' }), log });
  config.load();
  config.update({ api: { model: 'offline-209', maxRounds: 2 }, persona: { botName: 'fixture bot' }, store: { contextSliderPos: slider, historyCount, promptAnchor: { enabled: anchor, maxExtraRead: 2 } }, memory: { consolidateEnabled: false }, chatActive: { enabled: false }, proactive: { enabled: false }, wakeDelayMs: 200, drainDelayMs: 200, sessionRetryAttempts: 0 });
  const save = patch => {
    config.update(patch);
    const disk = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
    config.load();
    assert.deepEqual(config.get().store, disk.store, 'runtime consumes the actual saved configuration after reload');
    return disk;
  };
  save({});
  const cfg = () => config.get(), store = components['data.messages']({ dataDir, log });
  if (seedBytes) fs.writeFileSync(path.join(dataDir, 'messages', 'group_20901.json'), seedBytes);
  else {
    const start = Date.now() - 700000;
    for (let i = 1; i <= 650; i++) store.appendIncoming(key, { mid: 10000 + i, ts: start + i * 1000, senderId: '20962', senderName: 'history member', text: `HISTORY_${String(i).padStart(4, '0')}`, atMe: false });
    store.markAllRead(key);
    seedBytes = fs.readFileSync(path.join(dataDir, 'messages', 'group_20901.json'));
  }
  assert.equal(store.recent(key, Infinity).length, 650); assert.equal(store.unread(key).length, 0);
  const sessions = components['data.sessions']({ dataDir, log }), registry = components['runtime.tools']({ log });
  const deliveries = [], runnerInputs = [], requests = [];
  const transport = { selfId: '20963', actions: { getSelfMemberInfo: async () => ({ muted: false }) }, async send(chatKey, segments) { deliveries.push({ chatKey, segments }); return { msgId: 209 }; } };
  const send = components['core.send']({ cfg, store, transport, log });
  coreTools.setup({ capability: fixtureCapability({ cfg, store, send }), registerTool: def => registry.register({ ...def, ownerId: 'core-tools', bundled: true }) });
  const loader = { isActive: () => true, hooksOf: () => [], promptSections: () => [] };
  const selected = { ...components, 'core.agentRunner': async args => {
    runnerInputs.push({ userPrompt: args.userPrompt, systemPrompt: args.systemPrompt, tools: structuredClone(args.tools), sessionId: args.session.id });
    return components['core.agentRunner'](args);
  } };
  const orch = selected['core.orchestrator']({ cfg, store, sessions, memory: {}, send, transport, registry, loader, log, components: selected,
    buildToolsFor: args => selected['core.tools.bundle'](args, { registry, loader }),
    execContextFor: ({ chatKey, session }) => ({ chatKey, session, send }),
    llmInvoker: async args => { requests.push({ messages: structuredClone(args.messages), tools: structuredClone(args.tools), cfg: structuredClone(args.cfg) }); return llm(args, requests.length); },
  });
  t.after(() => { orch.stop(); sessions.stop(); });
  let sequence = 0;
  const append = (text, extra = {}) => store.appendIncoming(key, { mid: 90000 + ++sequence, ts: Date.now() + sequence, senderId: '20962', senderName: 'trigger member', text, atMe: true, ...extra });
  return { dataDir, config, cfg, save, store, sessions, registry, send, orch, runnerInputs, requests, deliveries, append,
    async run(text, { tail = [], expectedStatus = 'noreply', expectedCalls = 1 } = {}) {
      const before = requests.length, entry = append(text);
      await orch.onIncoming(key, entry);
      for (const value of tail) { const addition = append(value); await orch.onIncoming(key, addition); }
      const waiting = sessions.current(key); assert.equal(waiting.status, 'waiting', 'default incoming path created the waiting batch');
      await until(() => !['waiting', 'running'].includes(sessions.peek(waiting.id)?.status));
      const session = sessions.get(waiting.id), disk = JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions', `${waiting.id}.json`), 'utf8'));
      assert.equal(session.status, expectedStatus, session.error ?? 'expected terminal business result'); assert.equal(disk.pastStateCount, session.pastStateCount);
      assert.deepEqual(disk.triggerEntryIds, session.triggerEntryIds);
      assert.equal(requests.length, before + expectedCalls, 'expected actual default runner/LLM boundary calls');
      const llmPrompt = requests.at(-1).messages.find(message => message.role === 'user').content;
      assert.equal(llmPrompt, runnerInputs.at(-1).userPrompt); assert.equal(llmPrompt, disk.userPrompt);
      assert.equal(historyTokens(llmPrompt).length, disk.pastStateCount, 'persisted count matches all history actually provided to the model');
      return disk;
    },
  };
}

test('saved 0/80/600 reaches the actual runner with anchor off independently of tiers 1/3/4', async t => {
  for (const historyCount of [0, 80, 600]) for (const [slider, tier] of [[10, 1], [55, 3], [90, 4]]) await t.test(`history=${historyCount}, tier=${tier}`, async t => {
    const e = runtime(t, { historyCount, slider });
    const disk = e.save({ store: { historyCount } }); assert.equal(disk.store.historyCount, historyCount);
    const session = await e.run('TRIGGER_ONLY_209');
    const tokens = historyTokens(session.userPrompt);
    assert.equal(tokens.length, historyCount); assert.equal(session.contextTier, tier);
    assert.equal(session.promptAnchorMode, null); assert.deepEqual(session.triggerEntryIds, [651]);
    assert.equal((session.userPrompt.match(/TRIGGER_ONLY_209/g) ?? []).length, 1);
    if (historyCount) { assert.equal(tokens[0], `HISTORY_${String(651 - historyCount).padStart(4, '0')}`); assert.equal(tokens.at(-1), 'HISTORY_0650'); }
    else assert.doesNotMatch(session.userPrompt, /HISTORY_\d{4}|【新已读信息】/);
    assert.equal(e.deliveries.length, 0);
  });
});

test('history count is applied after large excluded tails and a distinct multi-entry trigger batch', async t => {
  const e = runtime(t, { historyCount: 600 });
  e.save({ globalBlocklist: ['20966'], blocklist: { 20901: ['20967'] } });
  for (let i = 1; i <= 25; i++) e.store.markRecalled(key, 10000 + i);
  for (let i = 26; i <= 50; i++) e.store.updateByMid(key, 10000 + i, { isPoke: true });
  for (let i = 0; i < 550; i++) e.append(`EXCLUDED_${i}`, { senderId: i < 275 ? '20966' : '20967', atMe: false });
  e.store.markAllRead(key);
  const session = await e.run('TRIGGER_A_209', { tail: ['TRIGGER_B_209'] });
  const tokens = historyTokens(session.userPrompt);
  assert.equal(tokens.length, 600); assert.equal(tokens[0], 'HISTORY_0051'); assert.equal(tokens.at(-1), 'HISTORY_0650');
  assert.deepEqual(session.triggerEntryIds, [1201, 1202]);
  assert.doesNotMatch(session.userPrompt, /EXCLUDED_|HISTORY_00(?:0[1-9]|[1-4]\d|50)(?!\d)/);
  assert.equal((session.userPrompt.match(/TRIGGER_A_209/g) ?? []).length, 1); assert.equal((session.userPrompt.match(/TRIGGER_B_209/g) ?? []).length, 1);
});

test('large anchors keep a stable base, cumulative extra budget and tier independence, then reset on history limit change', async t => {
  const e = runtime(t, { historyCount: 600, slider: 10, anchor: true });
  const first = await e.run('TURN_A'); assert.equal(first.promptAnchorMode, 'reset'); assert.equal(first.pastStateCount, 600);
  const base = first.userPrompt.split('【未读信息】')[0];
  const second = await e.run('TURN_B'); assert.equal(second.promptAnchorMode, 'anchor'); assert.equal(second.pastStateCount, 601);
  assert.equal(second.userPrompt.split('【新已读信息】')[0], base);
  e.save({ store: { contextSliderPos: 90 } });
  const third = await e.run('TURN_C'); assert.equal(third.contextTier, 4); assert.equal(third.promptAnchorMode, 'anchor'); assert.equal(third.pastStateCount, 602);
  assert.equal(third.userPrompt.split('【新已读信息】')[0], base, 'tier change must not reset history policy');
  const fourth = await e.run('TURN_D'); assert.equal(fourth.promptAnchorMode, 'reset'); assert.equal(fourth.pastStateCount, 600);
  assert.equal(historyTokens(fourth.userPrompt)[0], 'HISTORY_0054');
  e.save({ store: { historyCount: 80 } });
  const fifth = await e.run('TURN_E'); assert.equal(fifth.promptAnchorMode, 'reset'); assert.equal(fifth.pastStateCount, 80);
  assert.equal(fifth.promptAnchorState.readIds.length, 80);
});

test('zero and anchor disable clear prior bases, and re-enabling rebuilds the configured window', async t => {
  const e = runtime(t, { historyCount: 600, anchor: true });
  assert.equal((await e.run('TURN_INITIAL')).pastStateCount, 600);
  e.save({ store: { historyCount: 0 } });
  for (const text of ['TURN_ZERO_A', 'TURN_ZERO_B']) {
    const zero = await e.run(text); assert.equal(zero.pastStateCount, 0); assert.equal(zero.promptAnchorMode, null); assert.equal(zero.promptAnchorState, null);
    assert.doesNotMatch(zero.userPrompt, /HISTORY_|【新已读信息】/);
  }
  e.save({ store: { historyCount: 80 } });
  const restored = await e.run('TURN_POSITIVE'); assert.equal(restored.promptAnchorMode, 'reset'); assert.equal(restored.pastStateCount, 80);
  e.save({ store: { promptAnchor: { enabled: false } } });
  const disabled = await e.run('TURN_DISABLED'); assert.equal(disabled.promptAnchorMode, null); assert.equal(disabled.promptAnchorState, null); assert.equal(disabled.pastStateCount, 80);
  e.save({ store: { promptAnchor: { enabled: true } } });
  assert.equal((await e.run('TURN_ENABLED')).promptAnchorMode, 'reset');
});

test('the expanded history still captures only actual prompt context for recall cancellation', async t => {
  const ready = deferred(), release = deferred();
  const e = runtime(t, { historyCount: 600, llm: async () => { ready.resolve(); await release.promise; return finish(); } });
  const running = e.run('TURN_INFLIGHT', { expectedStatus: 'aborted' }); await ready.promise;
  const current = e.sessions.current(key); assert.equal(current.status, 'running');
  e.store.markRecalled(key, 10001); assert.equal(current.status, 'running', 'archive data outside selected history is not captured');
  e.store.markRecalled(key, 10051); assert.equal(current.status, 'aborted', 'a selected message older than the old 500 cap invalidates this real run');
  release.resolve(); const saved = await running;
  assert.match(saved.error, /上下文已失效/); assert.equal(e.deliveries.length, 0);
  await pause(250); assert.equal(e.requests.length, 1, 'cancelled context does not resend or rerun an already-consumed trigger');
});

test('configured history stays intact through real search tools, later model rounds and default sending', async t => {
  for (const historyCount of [0, 600]) await t.test(`history=${historyCount}`, async t => {
    const tool = (name, args) => ({ message: { role: 'assistant', content: '', tool_calls: [{ id: `209-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finishReason: 'tool_calls' });
    const e = runtime(t, { historyCount, llm: async (_args, round) => round === 1 ? tool('web_search', { query: 'controlled evidence' }) : round === 2 ? tool('send_message', { messages: '受控搜索回复209' }) : finish() });
    e.save({ api: { maxRounds: 3 }, webSearch: { enabled: true, provider: 'bing' } });
    const capabilities = new Map(), httpCalls = [];
    const base = fixtureCapability({ cfg: e.cfg, store: e.store, send: e.send });
    webTools.setup({
      log, capability: name => capabilities.get(name) ?? base(name),
      registerCapability: (name, value) => capabilities.set(name, value),
      registerTool: def => e.registry.register({ ...def, ownerId: 'web-tools', bundled: true }),
      http: { async fetch(url) { httpCalls.push(String(url)); return new Response('<li class="b_algo"><h2><a href="https://fixture.invalid/evidence">SEARCH_EVIDENCE_209</a></h2><p>Controlled result.</p></li>', { status: 200 }); } },
    });
    const session = await e.run('TRIGGER_SEARCH_209', { expectedStatus: 'done', expectedCalls: 3 });
    assert.equal(httpCalls.length, 1); assert.match(httpCalls[0], /controlled\+evidence/);
    assert.equal(session.pastStateCount, historyCount);
    for (const request of e.requests) {
      const prompt = request.messages.find(message => message.role === 'user').content;
      assert.equal(prompt, session.userPrompt); assert.equal(historyTokens(prompt).length, historyCount);
    }
    assert.match(JSON.stringify(e.requests[1].messages.filter(message => message.role === 'tool')), /SEARCH_EVIDENCE_209/);
    assert.match(JSON.stringify(e.requests[2].messages.filter(message => message.role === 'tool')), /SEARCH_EVIDENCE_209/);
    assert.equal(e.deliveries.length, 1); assert.equal(e.deliveries[0].segments[0].text, '受控搜索回复209');
    assert.equal(session.sent.length, 1);
    assert.equal(defaultComponents['data.messages']({ dataDir: e.dataDir, log }).recent(key, 1)[0].text, '受控搜索回复209', 'default send still persists its self message');
  });
});

test('appended core.prompt.user and core.orchestrator files affect actual runner input and restore defaults', async t => {
  const appRoot = temporary(t), layer = path.join(appRoot, 'overrides', 'history209'); fs.mkdirSync(layer, { recursive: true });
  fs.writeFileSync(path.join(layer, 'user.mjs'), `export default previous => args => previous(args) + '\\nAPPENDED_USER_209';`);
  fs.writeFileSync(path.join(layer, 'orchestrator.mjs'), `export default previous => options => previous({ ...options, cfg: () => { const cfg = options.cfg(); return { ...cfg, persona: { ...cfg.persona, roleText: cfg.persona.roleText + '\\nAPPENDED_ORCH_209' } }; } });`);
  const manifest = { version: 2, id: 'history209', components: { 'core.prompt.user': { module: 'user.mjs', mode: 'wrap' }, 'core.orchestrator': { module: 'orchestrator.mjs', mode: 'wrap' } } };
  fs.writeFileSync(path.join(layer, 'composition.json'), JSON.stringify(manifest));
  const chosen = (await loadComposition({ appRoot })).components;
  assert.notEqual(chosen['core.prompt.user'], defaultComponents['core.prompt.user']); assert.notEqual(chosen['core.orchestrator'], defaultComponents['core.orchestrator']);
  const replaced = runtime(t, { historyCount: 600, components: chosen });
  const session = await replaced.run('TRIGGER_COMPOSED_209');
  assert.equal(session.pastStateCount, 600); assert.match(session.userPrompt, /APPENDED_USER_209/); assert.match(session.userPrompt, /APPENDED_ORCH_209/);
  replaced.orch.stop();
  fs.writeFileSync(path.join(layer, 'composition.json'), JSON.stringify({ ...manifest, enabled: false }));
  const restored = runtime(t, { historyCount: 0, components: (await loadComposition({ appRoot })).components });
  const plain = await restored.run('TRIGGER_DEFAULT_209');
  assert.equal(plain.pastStateCount, 0); assert.doesNotMatch(plain.userPrompt, /APPENDED_USER_209|APPENDED_ORCH_209|HISTORY_/);
});

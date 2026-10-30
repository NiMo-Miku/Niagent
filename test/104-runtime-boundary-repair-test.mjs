// Isolated production-module regressions: no socket, real QQ account or headed fixture.
import { strict as assert } from 'node:assert';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createSendQueue } from '../src/kernel/send.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createOrchestrator } from '../src/kernel/orchestrator.js';
import { createOneBotProvider } from '../bundled/transport-onebot/provider.js';
import coreTools from '../bundled/core-tools/index.js';
import { fixtureCapability } from './bundled-fixture-sdk.mjs';

const log = { info() {}, warn() {}, error() {} };
const chatKey = 'group:10001';
const unavailable = () => Object.assign(new Error('HTTP 503 fixture'), { status: 503 });
const finish = () => ({
  message: { role: 'assistant', content: '', tool_calls: [{ id: 'finish-104', type: 'function', function: { name: 'finish', arguments: '{"reason":"fixture complete"}' } }] },
  finishReason: 'tool_calls', usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
});

function runtime(t, { retryAttempts = 0, omitRetries = false, invokeLLM = () => { throw unavailable(); }, warn = () => {} } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-runtime-boundary-104-'));
  const cfg = {
    api: { model: 'offline-fixture', maxRounds: 2 },
    store: { contextTier: 4, historyCount: 20, promptAnchor: { enabled: false } },
    persona: { botName: 'fixture bot', roleText: 'fixture persona' },
    send: { minGapMs: 0, maxGapMs: 0, byLengthMs: 0, dedupeWindowMs: 0 },
    memory: { consolidateEnabled: false }, chatActive: { enabled: false }, maxConcurrentRuns: 1,
    ...(omitRetries ? {} : { sessionRetryAttempts: retryAttempts }),
  };
  const actions = [];
  class MemoryClient {
    async call(action, params) { actions.push({ action, params: structuredClone(params) }); return { status: 'ok', retcode: 0, data: { message_id: actions.length } }; }
    async close() {}
  }
  const transport = createOneBotProvider({ cfg: () => cfg, log, clientFactory: MemoryClient });
  const store = createChatStore({ dataDir, log });
  const memory = createMemoryStore({ dataDir, log });
  const sessions = createSessionRegistry({ dataDir, log });
  const send = createSendQueue({ transport, store, cfg: () => cfg, log });
  const registry = createToolRegistry({ log });
  coreTools.setup({ capability: fixtureCapability({ cfg: () => cfg, store, send }), registerTool: (def) => registry.register({ ...def, ownerId: 'core-tools', bundled: true }) });
  const requests = [];
  const orch = createOrchestrator({
    cfg: () => cfg, store, memory, sessions, send, registry, transport, log: { ...log, warn },
    loader: { hooksOf: () => [], promptSections: () => [] },
    buildToolsFor: () => ({ tools: registry.list().map((def) => ({ type: 'function', function: { name: def.id, parameters: def.params } })), invoke: (name, args, execCtx) => registry.invoke(name, args, { execCtx }), excludedTools: [] }),
    execContextFor: ({ session }) => ({ chatKey, session, send }),
    llmInvoker: (args) => { requests.push(structuredClone(args.messages)); return invokeLLM(args, requests.length); },
  });
  t.after(async () => {
    orch.stop(); sessions.stop(); await transport.stop();
    const absolute = path.resolve(dataDir);
    assert.equal(path.dirname(absolute).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(absolute).startsWith('qqa-runtime-boundary-104-'));
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  return { cfg, dataDir, store, sessions, requests, actions, registry, orch,
    async run() {
      const entry = store.appendIncoming(chatKey, { senderId: '20001', senderName: '甲', text: 'fixture trigger', ts: Date.now() });
      const session = sessions.create(chatKey, { trigger: entry.text, waitUntil: Date.now() + 1 });
      await orch.wake(chatKey, { waitingSessionId: session.id, verified: true });
      return session;
    },
    async poke(args, key = chatKey) {
      const response = await registry.invoke('send_poke', args, { execCtx: { chatKey: key, session: { sent: [] } } });
      return response.ok ? response.result : response;
    },
  };
}

test('explicit zero disables only session retries and preserves the failed attempt trace', async (t) => {
  for (const value of [0, '0']) {
    await t.test(`sessionRetryAttempts=${JSON.stringify(value)}`, async (t) => {
      const e = runtime(t, { retryAttempts: value });
      const session = await e.run();
      assert.equal(e.requests.length, 1, '0 means one initial run and no automatic rerun');
      assert.equal(session.status, 'error');
      assert.equal(session.usage.calls, 1);
      assert.equal(session.messages.filter((message) => message.role === 'system').length, 1);
      assert.equal(e.actions.length, 0);
      const saved = JSON.parse(fs.readFileSync(path.join(e.dataDir, 'sessions', `${session.id}.json`), 'utf8'));
      assert.equal(saved.status, 'error'); assert.equal(saved.usage.calls, 1);
      assert.deepEqual(saved.triggerEntryIds, session.triggerEntryIds);
      assert.deepEqual(saved.messages, session.messages);
    });
  }
});

test('positive and omitted retry budgets still recover in the same session and accumulate calls', async (t) => {
  for (const options of [{ retryAttempts: 1 }, { omitRetries: true }]) {
    await t.test(JSON.stringify(options), async (t) => {
      const e = runtime(t, { ...options, invokeLLM: (_args, call) => { if (call === 1) throw unavailable(); return finish(); } });
      const session = await e.run();
      assert.equal(e.requests.length, 2); assert.equal(session.status, 'noreply');
      assert.equal(session.usage.calls, 2); assert.equal(session.usage.totalTokens, 3);
      assert.equal(session.messages.filter((message) => message.role === 'system').length, 2);
      assert.equal(e.sessions.listSummaries().length, 1); assert.equal(e.actions.length, 0);
      const withoutClock = (messages) => messages.slice(0, 2).map((message) => ({ ...message, content: message.content.replace(/【当前时间】[^\n]*/g, '【当前时间】') }));
      assert.deepEqual(withoutClock(e.requests[0]), withoutClock(e.requests[1]), 'retry retains its trigger batch; only the current clock can advance');
    });
  }
});

test('send_poke rejects invalid target IDs before the default OneBot action', async (t) => {
  const e = runtime(t);
  for (const targetUserId of ['0', '-1', '1.5', 'abc', '', ' ', 'NaN', 'Infinity', '9007199254740993', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, true]) {
    const result = await e.poke({ targetUserId });
    assert.equal(result.ok, false, `reject target ${JSON.stringify(targetUserId)}`);
    assert.match(result.error, /QQ|类型/);
    assert.equal(e.actions.length, 0, 'invalid IDs must not reach a transport');
  }
  for (const userId of ['0', '-1', 'abc', '9007199254740993']) {
    assert.equal((await e.poke({ userId }, 'private:20001')).ok, false);
    assert.equal(e.actions.length, 0, 'legacy alias has the same validation');
  }
  assert.equal((await e.poke({ targetUserId: '0', userId: '20002' })).ok, false, 'invalid canonical parameter cannot fall back to legacy');
  assert.equal(e.actions.length, 0);
});

test('send_poke accepts integer/string targets and keeps private omission and legacy aliases', async (t) => {
  const e = runtime(t);
  assert.deepEqual(e.registry.get('send_poke').params.required, [], 'private omission remains part of the public contract');
  assert.equal((await e.poke({})).ok, false); assert.equal(e.actions.length, 0);
  for (const args of [{ targetUserId: '20002' }, { targetUserId: 20002 }, { userId: '20002' }]) assert.equal((await e.poke(args)).ok, true);
  assert.equal((await e.poke({}, 'private:20001')).ok, true);
  assert.equal((await e.poke({ targetUserId: '20002' }, 'private:20001')).ok, true);
  assert.deepEqual(e.actions, [
    ...Array.from({ length: 3 }, () => ({ action: 'send_poke', params: { group_id: 10001, user_id: 20002 } })),
    { action: 'friend_poke', params: { user_id: 20001 } },
    { action: 'friend_poke', params: { user_id: 20002 } },
  ]);
  assert.equal(e.store.recent(chatKey, 100).length, 0, 'poke is a light action, not a chat message');
});

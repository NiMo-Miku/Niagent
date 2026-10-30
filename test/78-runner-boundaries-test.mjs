import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../src/kernel/agent-runner.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import hello from '../bundled/hello/index.js';
import { sessionTelemetryTotals } from '../src/kernel/telemetry.js';

const usage = { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 };
const response = (toolCalls = []) => ({
  message: { role: 'assistant', content: '已收到', ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
  usage, raw: { usage },
});
const call = (name, args = {}) => ({ id: 'fixture-call', type: 'function', function: { name, arguments: JSON.stringify(args) } });
const options = (extra = {}) => ({
  session: { usage: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }, sent: [] },
  systemPrompt: 'fixture', userPrompt: 'fixture', tools: [], cfg: { api: { maxRounds: 2 } },
  log: {}, invokeTool: async () => ({ ok: true }), ...extra,
});

test('real hello registration preserves business text in tool result', async () => {
  const registry = createToolRegistry({ log: {} });
  const storage = new Map();
  hello.setup({
    log: { info() {} }, config: { get: () => '你好' }, storage,
    prompt: { add() {} }, registerTool: (tool) => registry.register({ ...tool, ownerId: 'hello', bundled: true }),
  });
  let calls = 0;
  const result = await runAgent(options({
    invokeTool: (name, args, execCtx) => registry.invoke(name, args, { execCtx }),
    callLLM: async () => ++calls === 1 ? response([call('hello_say', { name: 'Alice' })]) : response(),
  }));
  const tool = result.messages.find((message) => message.role === 'tool');
  assert.deepEqual(JSON.parse(tool.content), { ok: true, text: '你好，Alice' });
  assert.equal(storage.get('uses'), 1);
});

test('abort from after-response preserves received raw and usage, and stops tools', async () => {
  const controller = new AbortController();
  const snapshots = [];
  let invoked = 0;
  const result = await runAgent(options({
    signal: controller.signal, callLLM: async () => response([call('send_message')]),
    invokeTool: async () => { invoked++; return { ok: true }; },
    hooksOf: (name) => name === 'after-response' ? [{ ownerId: 'fixture', fn: () => controller.abort(new Error('fixture abort')) }] : [],
    onRound: (snapshot) => snapshots.push(structuredClone(snapshot)),
  }));
  assert.equal(invoked, 0);
  assert.equal(result.usage.calls, 1);
  assert.equal(result.usage.totalTokens, 5);
  assert.match(result.error.message, /fixture abort/);
  const assistants = result.messages.filter((message) => message.role === 'assistant');
  assert.equal(assistants.length, 1);
  assert.deepEqual(assistants[0].raw, { usage });
  assert.deepEqual(sessionTelemetryTotals({ ...result, traceVersion: 1 }).toolCounts, {}, '未执行的模型建议不得算作工具调用');
  assert.equal(snapshots.at(-1).messages.at(-1).raw.usage.total_tokens, 5);
});

test('abort during grounded response processing keeps the response trace', async () => {
  const controller = new AbortController();
  const result = await runAgent(options({
    signal: controller.signal, callLLM: async () => response(),
    capabilities: { providers: (name) => name === 'reply.grounded-select' ? [{ provider: async () => { controller.abort(); return null; } }] : [] },
  }));
  assert.equal(result.messages.filter((message) => message.role === 'assistant').length, 1);
  assert.deepEqual(result.messages.at(-1).raw, { usage });
  assert.ok(result.error);
});

test('abort while registry awaits before-tool hook blocks execution', async () => {
  const controller = new AbortController();
  const registry = createToolRegistry({ log: {} });
  let invoked = 0;
  registry.register({ id: 'effect', name: 'Fixture effect', description: 'Controlled side effect', ownerId: 'fixture', bundled: true, params: { type: 'object' }, execute: () => { invoked++; return 'sent'; } });
  let entered, release;
  const waiting = new Promise((resolve) => { entered = resolve; });
  const work = registry.invoke('effect', {}, {
    execCtx: { signal: controller.signal },
    beforeToolHooks: [async () => { entered(); await new Promise((resolve) => { release = resolve; }); }],
  });
  await waiting;
  controller.abort(new Error('fixture abort'));
  release();
  const result = await work;
  assert.equal(invoked, 0);
  assert.equal(result.ok, false);
  assert.match(result.error, /fixture abort/);
});

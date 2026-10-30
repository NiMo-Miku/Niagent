// 60 · 匿名遥测累计真实行为（SPEC C-tel-01 / notes/12-data §3.10-3.11）
//
// 这条链路曾经静默失效：sessions.finish 接线错误 + 全量重算互相覆盖，累计永远写 0。
// 本测试用真实 SessionRegistry 驱动，断言落盘数字，而不是只断言源码里"有这段代码"。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { loadTelemetryTotals, sessionTelemetryTotals, createTelemetry } from '../src/kernel/telemetry.js';
import { mktmp, eq, ok, section, summary } from './helpers.mjs';

const log = { warn() {}, error() {}, info() {}, debug() {} };
const totalsOf = (dataDir) => JSON.parse(fs.readFileSync(path.join(dataDir, 'telemetry-totals.json'), 'utf8'));

section('单会话口径：raw usage 优先，无 raw 时回退累计调用数');
{
  const withRaw = sessionTelemetryTotals({
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, calls: 3 },
    messages: [
      { raw: { usage: { prompt_tokens: 10, completion_tokens: 5 } }, toolCall: { name: 'send_message' } },
      { tool_calls: [{ function: { name: 'web_search' } }] },
    ],
  });
  eq(withRaw.calls, 1, 'raw usage 计 1 次调用');
  eq(withRaw.toolCounts.send_message, 1, 'toolCall.name 计入');
  eq(withRaw.toolCounts.web_search, 1, 'tool_calls[].function.name 计入');

  const noRaw = sessionTelemetryTotals({ usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10, calls: 2 }, messages: [{ role: 'assistant' }] });
  eq(noRaw.calls, 2, '无 raw 时回退 usage.calls');
}

section('会话终态累加进 telemetry-totals.json');
{
  const dataDir = mktmp('qqa-tel-');
  const sessions = createSessionRegistry({ dataDir, log });
  const a = sessions.create('group:1', { trigger: 't1' });
  sessions.finish(a.id, 'done', {
    usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10, calls: 2 },
    messages: [{ toolCall: { name: 'send_message' } }, { tool_calls: [{ function: { name: 'web_search' } }] }],
  });
  let t = totalsOf(dataDir);
  eq(t.calls, 2, '第一次累加 calls');
  eq(t.promptTokens, 5, '第一次累加 promptTokens');
  eq(t.toolCounts.send_message, 1, '第一次累加工具计数');

  // 幂等：重复 finish 不得二次累加
  sessions.finish(a.id, 'done');
  eq(totalsOf(dataDir).calls, 2, '重复 finish 不重复累加（终态只记一次）');

  const b = sessions.create('group:1', { trigger: 't2' });
  sessions.finish(b.id, 'done', {
    usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5, calls: 1 },
    messages: [{ toolCall: { name: 'send_message' } }],
  });
  t = totalsOf(dataDir);
  eq(t.calls, 3, '两会话累计 calls');
  eq(t.promptTokens, 8, '两会话累计 promptTokens');
  eq(t.completionTokens, 7, '两会话累计 completionTokens');
  eq(t.totalTokens, 15, '两会话累计 totalTokens');
  eq(t.toolCounts.send_message, 2, '工具计数跨会话累加');
  eq(t.toolCounts.web_search, 1, '另一工具计数保持');
}

section('loadTelemetryTotals：缓存存在直接复用，缺失才从留档重建');
{
  const dataDir = mktmp('qqa-tel2-');
  const sessions = createSessionRegistry({ dataDir, log });
  const a = sessions.create('group:1', { trigger: 't1' });
  sessions.finish(a.id, 'done', { usage: { promptTokens: 4, completionTokens: 4, totalTokens: 8, calls: 1 }, messages: [] });
  const cached = loadTelemetryTotals({ dataDir, sessions });
  eq(cached.promptTokens, 4, '复用已写缓存');
  // 重建路径：删掉缓存后应能从 sessions 留档恢复
  fs.rmSync(path.join(dataDir, 'telemetry-totals.json'));
  const rebuilt = loadTelemetryTotals({ dataDir, sessions });
  eq(rebuilt.promptTokens, 4, '缓存丢失后从留档重建');
}

section('上报：只发聚合数字，installId 稳定，失败静默');
{
  const dataDir = mktmp('qqa-tel3-');
  const sessions = createSessionRegistry({ dataDir, log });
  const a = sessions.create('group:1', { trigger: 't1' });
  sessions.finish(a.id, 'done', { usage: { promptTokens: 2, completionTokens: 2, totalTokens: 4, calls: 1 }, messages: [] });

  const sent = [];
  const tel = createTelemetry({
    dataDir, sessions, log,
    fetchImpl: async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true }; },
  });
  const firstId = tel.identity().installId;
  eq(tel.identity().installId, firstId, 'installId 多次读取保持一致（不会重复计数）');
  const result = await tel.report();
  eq(result.ok, true, '上报成功');
  eq(sent.length, 1, '发出一次请求');
  eq(sent[0].url, 'https://kondius.cn/qq-agent/api/telemetry', '上报到规格指定端点');
  eq(sent[0].body.installId, firstId, '载荷带 installId');
  ok(typeof sent[0].body.calls === 'number', '载荷含聚合 calls');
  // 原断言固化了内部累计字段名；DSH-ARCH §10.4 要求 wire 沿用 0.4 的七字段。
  eq(Object.keys(sent[0].body).sort(), ['calls', 'inputTokens', 'installId', 'outputTokens', 'tools', 'totalTokens', 'version'], '上报体只含 7 个聚合字段');
  eq([sent[0].body.calls, sent[0].body.inputTokens, sent[0].body.outputTokens, sent[0].body.totalTokens], [1, 2, 2, 4], '上报计数来自真实完成会话');
  ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sent[0].body.installId), 'installId 是稳定的随机 UUID');
  eq(sent[0].body.tools, {}, '无工具执行时仅上报空聚合');
  ok(!('apiKey' in sent[0].body) && !('token' in sent[0].body) && !('messages' in sent[0].body), '上报体不含密钥或消息原文');

  const failing = createTelemetry({ dataDir, sessions, log, fetchImpl: async () => { throw new Error('网络不可用'); } });
  const failed = await failing.report();
  eq(failed.ok, false, '上报失败返回 ok:false');
  eq(failing.totals().promptTokens, 2, '失败不影响本地累计（静默降级）');
}

section('周期：start 只调度一次，stop 后不再上报');
{
  const dataDir = mktmp('qqa-tel4-');
  const timers = [];
  let fired = 0;
  const tel = createTelemetry({
    dataDir, sessions: createSessionRegistry({ dataDir, log }), log,
    fetchImpl: async () => { fired++; return { ok: true }; },
    setTimeoutFn: (fn, ms) => { timers.push({ fn, ms }); return timers.length - 1; },
    clearTimeoutFn: () => {},
  });
  tel.start();
  eq(timers.length, 1, 'start 调度一个定时器');
  eq(timers[0].ms, 90_000, '首报延迟 90 秒');
  tel.start();
  eq(timers.length, 1, '重复 start 不重复调度');
  tel.stop();
  const before = fired;
  await timers[timers.length - 1].fn();
  eq(fired, before, 'stop 之后触发的定时器不再上报');
  eq(tel.report.name, 'report', '接口仍可用');
}

summary('60-telemetry-totals');

// Anonymous telemetry loop (SPEC C-tel-01 / notes/12-data §3.10-3.11).
// No message text, URLs, keys, or account identifiers leave the machine.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const TELEMETRY_URL = 'https://kondius.cn/qq-agent/api/telemetry';
const FIRST_DELAY_MS = 90_000;
const PERIOD_MS = 6 * 60 * 60 * 1000;
const TOOL_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_REPORTED_TOOLS = 200;

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function atomicWrite(file, value) { const tmp=`${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value), 'utf8'); fs.renameSync(tmp, file); }

function reportCount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

export function sessionTelemetryTotals(session) {
  const usage = session?.usage ?? {};
  const out = { calls: 0, promptTokens: Number(usage.promptTokens) || 0, completionTokens: Number(usage.completionTokens) || 0, totalTokens: Number(usage.totalTokens) || 0, toolCounts: {} };
  const messages = session?.messages ?? [];
  const executionTrace = session?.traceVersion >= 1 || messages.some((message) => message?.role === 'tool' && message?.toolCall?.name);
  let hasRawUsage = false;
  for (const message of messages) {
    if (message?.raw?.usage) hasRawUsage = true;
    if ((Number(message?.raw?.usage?.prompt_tokens) || 0) + (Number(message?.raw?.usage?.completion_tokens) || 0) > 0) out.calls++;
    const names = executionTrace
      ? (message?.role === 'tool' && message?.toolCall?.name ? [message.toolCall.name] : [])
      : (message?.toolCall?.name ? [message.toolCall.name] : (message?.tool_calls ?? []).map((call) => call?.function?.name).filter(Boolean));
    for (const name of names) out.toolCounts[name] = (Number(out.toolCounts[name]) || 0) + 1;
  }
  // raw 仅记录收到响应的调用；累计值还包含失败的尝试。兼容旧记录时取两者的最大值。
  if (session?.traceVersion >= 1) out.calls = Math.max(out.calls, Number(usage.calls) || 0);
  else if (!hasRawUsage) out.calls = Number(usage.calls) || 0;
  return out;
}

function addTotals(target, item) {
  for (const key of ['calls', 'promptTokens', 'completionTokens', 'totalTokens']) target[key] = (Number(target[key]) || 0) + (Number(item[key]) || 0);
  for (const [tool, count] of Object.entries(item.toolCounts)) target.toolCounts[tool] = (Number(target.toolCounts[tool]) || 0) + (Number(count) || 0);
  return target;
}

function readTotals(file) {
  const current = readJson(file, null);
  if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
  return { calls: Number(current.calls) || 0, promptTokens: Number(current.promptTokens) || 0, completionTokens: Number(current.completionTokens) || 0, totalTokens: Number(current.totalTokens) || 0, toolCounts: { ...(current.toolCounts || {}) } };
}

function emptyTotals() { return { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, toolCounts: {} }; }

/** 抬高下限：重建值不得低于已有缓存（留档清理/并发覆盖都不应让累计回退）。 */
function raiseToFloor(target, floor) {
  if (!floor) return target;
  for (const key of ['calls', 'promptTokens', 'completionTokens', 'totalTokens']) {
    target[key] = Math.max(Number(target[key]) || 0, Number(floor[key]) || 0);
  }
  for (const [tool, count] of Object.entries(floor.toolCounts || {})) {
    target.toolCounts[tool] = Math.max(Number(target.toolCounts[tool]) || 0, Number(count) || 0);
  }
  return target;
}

/**
 * 读取累计。正常路径直接返回缓存（增量口径，避免每次上报全量重扫 sessions）。
 * 缓存损坏或被清零时从 sessions 留档重建，并用缓存抬高下限防止统计回退。
 */
export function loadTelemetryTotals({ dataDir, sessions, verify = false } = {}) {
  const file = path.join(dataDir, 'telemetry-totals.json');
  const cached = readTotals(file);
  if (cached && !verify) return cached;
  const out = emptyTotals();
  const dir = path.join(dataDir, 'sessions');
  let files = [];
  try { files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')); } catch { /* 无留档目录 */ }
  for (const name of files) {
    const session = sessions?.peek?.(name.slice(0, -5)) ?? readJson(path.join(dir, name), null);
    if (!session || ['running', 'waiting'].includes(session.status)) continue;
    addTotals(out, sessionTelemetryTotals(session));
  }
  raiseToFloor(out, cached);
  atomicWrite(file, out);
  return out;
}export function createTelemetry({ dataDir, sessions, registry, version = '0.5.0', fetchImpl = fetch, log = console, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, now = () => Date.now() } = {}) {
  const identityFile = path.join(dataDir, 'telemetry.json');
  let timer = null;
  let running = false;
  let started = false;
  let generation = 0;

  function identity() {
    const old=readJson(identityFile,null);
    if(old?.installId) return old;
    const item={installId:crypto.randomUUID(),createdAt:now()};
    try { atomicWrite(identityFile,item); } catch (err) { log.warn?.(`[telemetry] identity write failed: ${err?.message ?? err}`); }
    return item;
  }
  function totals({ verify = false } = {}) { return loadTelemetryTotals({ dataDir, sessions, verify }); }
  async function report() {
    if(running) return {ok:false,skipped:true}; running=true;
    try {
      const t = totals();
      const calls = reportCount(t.calls);
      if (!calls) return { ok: false, skipped: true };
      // Keep the local totals schema. Only the wire follows the 0.4 contract.
      // Validate full modern IDs before applying the approved 200-tool budget.
      const tools = Object.fromEntries(Object.entries(t.toolCounts)
        .filter(([id]) => TOOL_ID_RE.test(id))
        .map(([id, count]) => [id, reportCount(count)])
        .filter(([, count]) => count > 0)
        .slice(0, MAX_REPORTED_TOOLS));
      const payload = {
        installId: identity().installId, version: String(version ?? '0.5.0'), calls,
        inputTokens: reportCount(t.promptTokens), outputTokens: reportCount(t.completionTokens),
        totalTokens: reportCount(t.totalTokens), tools,
      };
      const response=await fetchImpl(TELEMETRY_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      return {ok:Boolean(response?.ok)};
    } catch(err) { log.warn?.(`[telemetry] report failed: ${err?.message ?? err}`); return {ok:false}; }
    finally { running=false; }
  }
  function schedule(delay, epoch) {
    if (!started || epoch !== generation) return;
    if (timer != null) clearTimeoutFn(timer);
    timer = setTimeoutFn(async () => {
      if (!started || epoch !== generation) return;
      timer = null;
      await report();
      schedule(PERIOD_MS, epoch);
    }, delay);
    timer?.unref?.();
  }
  return {
    identity, totals, report,
    start() { if (started) return; started = true; schedule(FIRST_DELAY_MS, ++generation); },
    stop() { started = false; generation++; if (timer != null) clearTimeoutFn(timer); timer = null; },
  };
}

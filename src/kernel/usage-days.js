// Durable daily usage snapshots (notes/12-data §3.9). Records survive session retention.
import fs from 'node:fs';
import path from 'node:path';
import { sessionTelemetryTotals } from './telemetry.js';

const FIELDS = ['cost', 'peakCost', 'offPeakCost', 'peakTokens', 'offPeakTokens', 'promptTokens', 'completionTokens', 'totalTokens', 'cachedTokens', 'token', 'runs', 'exactCalls', 'searchCount'];
const USAGE_FIELDS = ['promptTokens', 'completionTokens', 'totalTokens', 'cachedTokens', 'calls'];
const number = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const dayKey = (at) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function readJson(file) { try { const raw = fs.readFileSync(file, 'utf8'); return JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { return null; } }
function atomicWrite(file, value) { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value), 'utf8'); fs.renameSync(tmp, file); }
function emptyRow(extra = {}) { return Object.assign(Object.fromEntries(FIELDS.map((key) => [key, 0])), extra); }
function mergeRow(target, source) {
  for (const key of FIELDS) target[key] = number(target[key]) + number(source?.[key]);
  target.hasPeakModel ||= Boolean(source?.hasPeakModel ?? source?.hasPeakTiers);
  target.hasPeakTiers = Boolean(target.hasPeakModel);
  target.cacheHitRate = target.promptTokens ? Math.min(1, target.cachedTokens / target.promptTokens) : 0;
  target.peakRatio = target.peakTokens + target.offPeakTokens ? target.peakTokens / (target.peakTokens + target.offPeakTokens) : 0;
}
function normalizeUsage(raw = {}) {
  const out = Object.fromEntries(USAGE_FIELDS.map((key) => [key, number(raw[key])]));
  if (raw.extra && typeof raw.extra === 'object') out.extra = Object.fromEntries(Object.entries(raw.extra).filter(([, value]) => Number.isFinite(Number(value))).map(([key, value]) => [key, number(value)]));
  return out;
}
function subtractUsage(full, before = {}) {
  const out = Object.fromEntries(USAGE_FIELDS.map((key) => [key, Math.max(0, full[key] - number(before[key]))]));
  if (full.extra) out.extra = Object.fromEntries(Object.entries(full.extra).map(([key, value]) => [key, Math.max(0, value - number(before.extra?.[key]))]));
  return out;
}
function subtractCounts(full, before = {}) { return Object.fromEntries(Object.entries(full).map(([key, count]) => [key, Math.max(0, number(count) - number(before[key]))]).filter(([, count]) => count)); }
function addCounts(target, counts) { for (const [name, count] of Object.entries(counts ?? {})) target[name] = number(target[name]) + number(count); }

export function createUsageDayStore({ dataDir, costFor = () => ({ cost: 0 }), log = console } = {}) {
  const dir = path.join(dataDir, 'usage-days');
  const days = new Map(), locations = new Map();
  fs.mkdirSync(dir, { recursive: true });
  const fileOf = (day) => path.join(dir, `${day}.json`);
  const valid = (item, day) => item?.version === 1 && item.day === day && item.aggregates && typeof item.aggregates === 'object';

  function load(day) {
    if (days.has(day)) return days.get(day);
    const item = readJson(fileOf(day));
    const out = valid(item, day) ? item : { version: 1, day, savedAt: 0, records: {}, aggregates: {} };
    // Old aggregates have no identities: retain them separately and charge unknown old IDs only above their accounted baseline.
    if (!out.records || typeof out.records !== 'object' || Array.isArray(out.records)) {
      out.legacyAggregates = structuredClone(out.aggregates);
      out.records = {};
    }
    days.set(day, out);
    return out;
  }

  function aggregates(item) {
    const legacy = item.legacyAggregates ?? {};
    const out = { ...structuredClone(legacy), totals: { ...structuredClone(legacy.totals ?? {}), ...emptyRow() }, hours: Array.from({ length: 24 }, (_, hour) => emptyRow({ hour })), chats: [], models: [], searchCount: number(legacy.searchCount), toolCounts: { ...(legacy.toolCounts ?? {}) } };
    mergeRow(out.totals, legacy.totals);
    for (const row of legacy.hours ?? []) if (out.hours[Number(row.hour)]) { Object.assign(out.hours[Number(row.hour)], row, emptyRow({ hour: Number(row.hour) })); mergeRow(out.hours[Number(row.hour)], row); }
    const chats = new Map(), models = new Map();
    const grouped = (map, key, identity, row) => { const target = map.get(key) ?? emptyRow(identity); mergeRow(target, row); map.set(key, target); };
    for (const row of legacy.chats ?? []) grouped(chats, row.chatKey ?? row.chat ?? 'unknown', { ...row, ...emptyRow({ chatKey: row.chatKey ?? row.chat ?? 'unknown' }) }, row);
    for (const row of legacy.models ?? []) grouped(models, row.model ?? 'unknown', { ...row, ...emptyRow({ model: row.model ?? 'unknown', vendor: row.vendor ?? '' }) }, row);
    for (const record of Object.values(item.records)) {
      const u = subtractUsage(record.usage, record.baselineUsage);
      const row = emptyRow({ cost: number(record.contributionCost), peakCost: number(record.contributionPeakCost), offPeakCost: number(record.contributionOffPeakCost), peakTokens: number(record.contributionPeakTokens), offPeakTokens: number(record.contributionOffPeakTokens), promptTokens: u.promptTokens, completionTokens: u.completionTokens, totalTokens: u.totalTokens, cachedTokens: u.cachedTokens, token: u.totalTokens, runs: Math.max(0, number(record.runs) - number(record.baselineRuns)), exactCalls: u.calls, searchCount: Math.max(0, number(record.webSearchCount) - number(record.baselineSearchCount)), hasPeakModel: Boolean(record.costInfo?.hasPeakTiers) });
      mergeRow(out.totals, row);
      mergeRow(out.hours[new Date(record.startedAt).getHours()], row);
      grouped(chats, record.chatKey ?? 'unknown', { chatKey: record.chatKey ?? 'unknown' }, row);
      grouped(models, record.model ?? 'unknown', { model: record.model ?? 'unknown', vendor: record.vendor ?? '' }, row);
      out.searchCount += row.searchCount;
      addCounts(out.toolCounts, subtractCounts(record.toolCounts, record.baselineToolCounts));
    }
    out.chats = [...chats.values()]; out.models = [...models.values()];
    return out;
  }

  function priced(s, usage) {
    const info = costFor({ ...s, usage });
    return typeof info === 'number' ? { cost: number(info), peak: false, peakTokens: 0, offPeakTokens: usage.totalTokens } : { ...(info ?? {}), cost: number(info?.cost) };
  }

  function record(s, previousAccountedUsage = {}) {
    if (!s?.id || ['running', 'waiting'].includes(s.status) || !Number.isFinite(Number(s.startedAt))) return false;
    const day = dayKey(Number(s.startedAt)), current = load(day), oldDay = locations.get(s.id), oldItem = oldDay ? load(oldDay) : null;
    const previous = oldItem?.records?.[s.id] ?? current.records[s.id];
    const usage = normalizeUsage(s.usage), toolCounts = sessionTelemetryTotals(s).toolCounts;
    // Reconciliation is a replay, not a new charge. Most startup records are
    // unchanged: avoid cloning, aggregating and rewriting the entire day per ID.
    const sameCounts = (a = {}, b = {}) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => a[key] === b[key]);
    const metadata = value => [value.day ?? dayKey(Number(value.startedAt)), value.chatKey, Number(value.startedAt), value.endedAt ?? null, value.status,
      value.model ?? null, value.vendor ?? null, value.providerId ?? value.provider ?? '', value.provider ?? value.providerId ?? '', Boolean(value.background), value.activity ?? null];
    const validAccounting = previous?.costInfo && previous.day === day && previous.runs === (usage.calls || usage.totalTokens ? 1 : 0) &&
      ['cost', 'peakCost', 'offPeakCost', 'peakTokens', 'offPeakTokens', 'contributionCost', 'contributionPeakCost', 'contributionOffPeakCost', 'contributionPeakTokens', 'contributionOffPeakTokens'].every(key => Number.isFinite(previous[key]) && previous[key] >= 0);
    if (validAccounting && previous.traceVersion === 1 && (!oldDay || oldDay === day) && sameCounts(previous.usage, usage) && sameCounts(previous.toolCounts, toolCounts) &&
        number(previous.webSearchCount) === number(s.webSearchCount) && JSON.stringify(metadata(previous)) === JSON.stringify(metadata(s))) return previous;
    const item = structuredClone(current);
    const baseline = previous?.baselineUsage ?? (item.legacyAggregates ? normalizeUsage(previousAccountedUsage) : normalizeUsage());
    const increment = subtractUsage(usage, previous?.usage ?? baseline);
    try {
      const price = priced(s, increment);
      const initialPrice = previous ? null : priced(s, usage);
      const contributionCost = number(previous?.contributionCost) + price.cost;
      const cost = previous ? number(previous.cost) + price.cost : initialPrice.cost;
      const peakCost = (previous ? number(previous.peakCost) : (initialPrice.peak ? initialPrice.cost : 0)) + (previous && price.peak ? price.cost : 0);
      const offPeakCost = (previous ? number(previous.offPeakCost) : (initialPrice.peak ? 0 : initialPrice.cost)) + (previous && !price.peak ? price.cost : 0);
      const peakTokens = (previous ? number(previous.peakTokens) : number(initialPrice.peakTokens)) + (previous ? number(price.peakTokens) : 0);
      const offPeakTokens = (previous ? number(previous.offPeakTokens) : number(initialPrice.offPeakTokens ?? (initialPrice.peak ? 0 : usage.totalTokens))) + (previous ? number(price.offPeakTokens ?? (price.peak ? 0 : increment.totalTokens)) : 0);
      const costInfo = { ...(previous?.costInfo ?? initialPrice), cost, peakTokens, offPeakTokens, peak: peakTokens > 0, hasPeakTiers: Boolean(previous?.costInfo?.hasPeakTiers || price.hasPeakTiers) };
      if (previous) {
        costInfo.breakdown = Object.fromEntries(['fresh', 'cached', 'output'].map((key) => [key, number(previous.costInfo?.breakdown?.[key]) + number(price.breakdown?.[key])]));
        if (price.source && costInfo.source && price.source !== costInfo.source) costInfo.source = 'mixed';
      }
      const next = {
        id: s.id, day, chatKey: s.chatKey, startedAt: Number(s.startedAt), endedAt: s.endedAt ?? null, status: s.status,
        model: s.model ?? null, vendor: s.vendor ?? null, providerId: s.providerId ?? s.provider ?? '', provider: s.provider ?? s.providerId ?? '', background: Boolean(s.background), activity: structuredClone(s.activity ?? null),
        usage, runs: usage.calls || usage.totalTokens ? 1 : 0, webSearchCount: number(s.webSearchCount), toolCounts,
        messages: Object.entries(toolCounts).flatMap(([name, count]) => Array.from({ length: count }, () => ({ role: 'tool', toolCall: { name } }))), traceVersion: 1,
        baselineUsage: baseline,
        baselineRuns: previous?.baselineRuns ?? (item.legacyAggregates && (previousAccountedUsage.counted || baseline.calls || baseline.totalTokens) ? 1 : 0),
        baselineSearchCount: previous?.baselineSearchCount ?? (item.legacyAggregates ? number(previousAccountedUsage.webSearchCount) : 0),
        baselineToolCounts: previous?.baselineToolCounts ?? (item.legacyAggregates ? { ...(previousAccountedUsage.toolCounts ?? {}) } : {}),
        cost, peakCost, offPeakCost, peakTokens, offPeakTokens,
        costInfo,
        contributionCost, contributionPeakCost: number(previous?.contributionPeakCost) + (price.peak ? price.cost : 0), contributionOffPeakCost: number(previous?.contributionOffPeakCost) + (price.peak ? 0 : price.cost),
        contributionPeakTokens: number(previous?.contributionPeakTokens) + number(price.peakTokens), contributionOffPeakTokens: number(previous?.contributionOffPeakTokens) + number(price.offPeakTokens ?? (price.peak ? 0 : increment.totalTokens)),
      };
      item.records[s.id] = next; item.savedAt = Date.now(); item.aggregates = aggregates(item);
      // Write the destination first; a failed write cannot remove the last durable copy.
      atomicWrite(fileOf(day), item);
      if (oldDay && oldDay !== day) {
        const oldNext = structuredClone(oldItem); delete oldNext.records[s.id]; oldNext.savedAt = Date.now(); oldNext.aggregates = aggregates(oldNext);
        try { atomicWrite(fileOf(oldDay), oldNext); } catch (error) { atomicWrite(fileOf(day), current); throw error; }
        days.set(oldDay, oldNext);
      }
      days.set(day, item); locations.set(s.id, day);
      return next;
    } catch (error) { log.warn?.(`[usage-days] 写入 ${day}/${s.id} 失败：${error?.message}`); return false; }
  }

  // Migrate legacy daily snapshots before new terminal records are charged.
  const legacy = readJson(path.join(dataDir, 'usage-daily.json'));
  if (legacy?.version === 1 && legacy.days && typeof legacy.days === 'object') {
    for (const [day, entry] of Object.entries(legacy.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !entry?.aggregates || valid(readJson(fileOf(day)), day)) continue;
      try { atomicWrite(fileOf(day), { version: 1, day, savedAt: Date.now(), aggregates: entry.aggregates }); } catch (error) { log.warn?.(`[usage-days] 迁移 ${day} 失败：${error?.message}`); }
    }
  }
  for (const name of fs.readdirSync(dir)) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
    const day = name.slice(0, -5), item = load(day);
    for (const id of Object.keys(item.records)) {
      const oldDay = locations.get(id);
      if (!oldDay || number(item.savedAt) >= number(load(oldDay).savedAt)) locations.set(id, day);
    }
  }
  // Recover an interrupted two-file move using the newest durable copy, without touching legacy aggregate baselines.
  for (const [day, item] of days) {
    const duplicates = Object.keys(item.records).filter((id) => locations.get(id) !== day);
    if (!duplicates.length) continue;
    const repaired = structuredClone(item);
    for (const id of duplicates) delete repaired.records[id];
    repaired.aggregates = aggregates(repaired);
    try { atomicWrite(fileOf(day), repaired); days.set(day, repaired); } catch (error) { log.warn?.(`[usage-days] 修复跨日重复 ${day} 失败：${error?.message}`); }
  }
  return { record };
}

import fs from 'node:fs';
import path from 'node:path';
import { BUILTIN_MODEL_PRICES, BUILTIN_PRICE_SNAPSHOT } from './builtin-model-prices.js';

export const PRICE_FEED_URL = 'https://kondius.cn/qq-agent/model-prices.json';
export const UPDATE_INFO_URL = 'https://kondius.cn/qq-agent/version.json';
export const FETCH_TIMEOUT_MS = 8_000;

const META_KEYS = new Set(['updated', 'version', 'meta', 'comment', 'url', 'fetchedAt']);

function rate(value, source) {
  // Remote feeds remain strict; legacy custom numeric strings are normalized once.
  const number = source === 'local' && typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeEntry(id, value, source = 'remote') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const normalizedId = String(id).trim().toLowerCase();
  if (!normalizedId) return null;
  const rawInput = value.in ?? value.input ?? value.inputPerM;
  const rawOutput = value.out ?? value.output ?? value.outputPerM;
  const rawCached = value.cached ?? value.cache ?? value.cachedPerM ?? null;
  const input = rate(rawInput, source), output = rate(rawOutput, source), cached = rawCached === null ? null : rate(rawCached, source);
  if (input === null && output === null || rawInput != null && input === null || rawOutput != null && output === null || rawCached !== null && cached === null) return null;
  const entry = { id: normalizedId, in: input ?? 0, out: output ?? 0, cached, src: typeof value.src === 'string' ? value.src : source, source: source === 'local' ? 'custom' : 'official', origin: source === 'local' ? 'custom' : source };
  if (value.peak && typeof value.peak === 'object') {
    entry.peak = {};
    for (const key of ['in', 'out', 'cached']) {
      const tier = value.peak[key];
      if (tier != null && rate(tier, source) === null) return null;
      entry.peak[key] = tier == null ? entry[key] : rate(tier, source);
    }
  }
  if (typeof value.note === 'string') entry.note = value.note;
  if (Object.hasOwn(value, 'image')) entry.image = value.image;
  if (source === 'remote') entry.remote = true;
  return entry;
}

export function normalizePrices(payload, source = 'remote') {
  let raw = payload;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.prices !== undefined) raw = raw.prices;
  const entries = [];
  let dropped = 0;
  if (Array.isArray(raw)) {
    for (const value of raw) {
      const id = value?.id ?? value?.model;
      const entry = id == null ? null : normalizeEntry(id, value, source);
      if (entry) entries.push(entry); else dropped++;
    }
  } else if (raw && typeof raw === 'object') {
    for (const [id, value] of Object.entries(raw)) {
      if (META_KEYS.has(id)) continue;
      const entry = normalizeEntry(id, value, source);
      if (entry) entries.push(entry); else dropped++;
    }
  }
  return { entries, dropped };
}

function localEntries(value) {
  return normalizePrices(value, 'local').entries;
}

const builtinEntries = normalizePrices(BUILTIN_MODEL_PRICES, 'builtin').entries;
function mergeEntries(...tables) {
  const map = new Map();
  // Whole rows replace lower-priority rows: custom rates must not inherit official peak tiers.
  for (const table of tables) for (const entry of table) map.set(entry.id, { ...entry });
  return [...map.values()];
}

function matchPrice(entries, model) {
  if (!model) return null;
  const name = String(model).trim().toLowerCase();
  const exact = entries.find((entry) => entry.id === name);
  if (exact) return { ...exact, matched: exact.id };
  const unprefixed = name.includes('/') ? name.slice(name.indexOf('/') + 1) : name;
  const prefixed = entries.find((entry) => entry.id === unprefixed);
  if (prefixed) return { ...prefixed, matched: prefixed.id };
  const candidates = entries.filter((entry) => [name, unprefixed].some(candidate => [ '/', '-', '@', ':' ].some((separator) => candidate.startsWith(`${entry.id}${separator}`))));
  candidates.sort((a, b) => b.id.length - a.id.length);
  return candidates[0] ? { ...candidates[0], matched: candidates[0].id } : null;
}

export function resolveCustomPrice(model, cfg) {
  return matchPrice(localEntries(cfg?.api?.modelPrices ?? {}), model);
}

export function manualModelPrice(cfg) {
  const api = cfg?.api ?? {};
  const input = rate(Number(api.priceInputPerM ?? 0), 'local') ?? 0;
  const output = rate(Number(api.priceOutputPerM ?? 0), 'local') ?? 0;
  // Global zero historically means "no separate cache rate", unlike a model
  // entry's explicit zero. Keep that conservative billing contract and expose
  // its effective rate to the UI as well as runtime cost calculation.
  const configuredCached = api.priceCachedPerM == null ? null : rate(Number(api.priceCachedPerM), 'local');
  const cached = configuredCached || input;
  return { in: input, out: output, cached, source: input || output || cached ? 'manual' : 'none', origin: 'manual', matched: null };
}

export function builtinModelPrice(model, cfg) {
  if (cfg?.api?.useOfficialPrice === false) return null;
  return matchPrice(builtinEntries, model);
}

function remoteStatus({ source = 'builtin', fetchedAt = 0, ok = true, count = 0, dropped = 0, error = '' } = {}) {
  const status = { url: PRICE_FEED_URL, enabled: true, source, fetchedAt, ok, count, dropped, builtinCount: builtinEntries.length, builtinVersion: BUILTIN_PRICE_SNAPSHOT.version };
  if (error) status.error = error;
  return status;
}

function readCache(dataDir) {
  if (!dataDir) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, 'price-feed-cache.json'), 'utf8'));
    if (parsed?.url !== PRICE_FEED_URL) return null;
    const normalized = normalizePrices(parsed?.prices ?? parsed, 'remote');
    if (!normalized.entries.length) return null;
    return { prices: normalized.entries, fetchedAt: Number(parsed?.fetchedAt) || 0, dropped: Number(parsed?.dropped) || normalized.dropped };
  } catch { return null; }
}

function writeCache(dataDir, prices, fetchedAt, dropped) {
  if (!dataDir) return;
  fs.mkdirSync(dataDir, { recursive: true });
  const target = path.join(dataDir, 'price-feed-cache.json');
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ url: PRICE_FEED_URL, fetchedAt, dropped, prices: Object.fromEntries(prices.map((entry) => [entry.id, { ...entry, remote: undefined }])) }, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

async function fetchJson(url, fetchImpl, timeoutMs = FETCH_TIMEOUT_MS) {
  const impl = fetchImpl ?? globalThis.fetch;
  if (typeof impl !== 'function') throw new Error('网络请求不可用');
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`请求超时（${timeoutMs / 1000}s）`));
    }, timeoutMs);
  });
  try {
    const request = (async () => {
      const response = await impl(url, { method: 'GET', signal: controller.signal, cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response || !response.ok && !(Number(response.status) >= 200 && Number(response.status) < 300)) throw new Error(`HTTP ${response?.status ?? '未知'}`);
      if (typeof response.json === 'function') return response.json();
      const body = typeof response.text === 'function' ? await response.text() : response.body;
      return JSON.parse(body);
    })();
    return await Promise.race([request, timeout]);
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`请求超时（${timeoutMs / 1000}s）`);
    throw err;
  } finally { clearTimeout(timer); }
}

export function createPriceUpdateAdapters({ dataDir, config, version = '0.0.0', fetchImpl } = {}) {
  let cacheStamp = null, cacheSnapshot = null, officialEntries = builtinEntries;
  function currentCache() {
    let stamp = '';
    if (dataDir) {
      try {
        const stat = fs.statSync(path.join(dataDir, 'price-feed-cache.json'));
        stamp = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      } catch { /* cold offline startup uses the historical builtin snapshot */ }
    }
    if (stamp !== cacheStamp) {
      cacheSnapshot = stamp ? readCache(dataDir) : null;
      officialEntries = mergeEntries(builtinEntries, cacheSnapshot?.prices ?? []);
      cacheStamp = stamp;
    }
    return cacheSnapshot;
  }
  // Runtime billing lookup: custom prices always win; remote-cache prices are used
  // only while the official-price switch is enabled. The latter intentionally keeps
  // the same matching rules as the console price list (exact → unprefixed → longest
  // separator-delimited prefix).
  function resolve(model, currentCfg = config?.get?.()) {
    const api = currentCfg?.api ?? {};
    const target = model ?? api.model ?? '';
    const custom = resolveCustomPrice(target, currentCfg);
    if (custom) return { ...custom, source: 'custom', matched: custom.matched ?? custom.id };
    if (api.useOfficialPrice === false) return null;
    currentCache();
    return matchPrice(officialEntries, target);
  }

  function reference(model) {
    currentCache();
    const entry = matchPrice(officialEntries, model);
    if (!entry) return null;
    const { in: input, out, cached, matched, origin, peak } = entry;
    return { in: input, out, cached, matched, origin, ...(peak ? { peak: { ...peak } } : {}) };
  }

  function snapshot(model, options = {}) {
    const cfg = config?.get?.();
    const local = localEntries(cfg?.api?.modelPrices ?? {});
    const cache = currentCache();
    const prices = mergeEntries(officialEntries, local);
    const target = model ?? cfg?.api?.model ?? '';
    // A selected factory may wrap this default object and replace resolve or
    // reference independently. Read through the selected receiver; HTTP may
    // additionally supply the exact billing consumer (custom -> resolver ->
    // builtin -> manual), without teaching the UI a second matching policy.
    const resolveFor = options.resolveModelPrice ?? (typeof this?.resolve === 'function' ? this.resolve.bind(this) : resolve);
    const referenceFor = typeof this?.reference === 'function' ? this.reference.bind(this) : reference;
    const quote = model => ({ model, current: resolveFor(model, cfg) ?? { id: String(model), ...manualModelPrice(cfg) }, reference: referenceFor(model) });
    const currentQuote = quote(target);
    let models = options.models ?? [];
    if (typeof models === 'string') { try { models = JSON.parse(models); } catch { throw Object.assign(new Error('models 需为模型 ID 数组'), {status:400,expose:true}); } }
    if (!Array.isArray(models) || models.length > 128 || models.some(id => typeof id !== 'string' || !id || id.length > 200)) throw Object.assign(new Error('每次最多查询128个模型 ID'), {status:400,expose:true});
    const remote = cache
      ? remoteStatus({ source: 'cache', fetchedAt: cache.fetchedAt, ok: true, count: cache.prices.length, dropped: cache.dropped })
      : remoteStatus({ source: 'builtin', count: builtinEntries.length });
    return { prices, current: currentQuote.current, reference: currentQuote.reference, quotes: [...new Set(models)].map(quote), remote, builtin: { ...BUILTIN_PRICE_SNAPSHOT } };
  }

  async function refresh(model, options = {}) {
    try {
      const payload = await fetchJson(PRICE_FEED_URL, fetchImpl, FETCH_TIMEOUT_MS);
      const normalized = normalizePrices(payload, 'remote');
      if (!normalized.entries.length) throw new Error('远程价格表没有有效条目');
      const fetchedAt = Date.now();
      writeCache(dataDir, normalized.entries, fetchedAt, normalized.dropped);
      const snapshotAfterSave = snapshot.call(this, model, options);
      return { ok: true, ...snapshotAfterSave, remote: remoteStatus({ source: 'remote', fetchedAt, ok: true, count: normalized.entries.length, dropped: normalized.dropped }) };
    } catch (err) {
      const fallback = snapshot.call(this, model, options);
      fallback.remote = remoteStatus({ ...fallback.remote, ok: false, error: String(err?.message ?? err) });
      return { ok: false, ...fallback };
    }
  }

  async function updateCheck() {
    try {
      const info = await fetchJson(UPDATE_INFO_URL, fetchImpl, FETCH_TIMEOUT_MS);
      if (!info?.version) throw new Error('version.json 缺少 version 字段');
      const latest = String(info.version);
      return { ok: true, current: String(version), latest, hasUpdate: compareSemver(latest, version) > 0, url: String(info.url || 'https://kondius.cn/qq-agent'), notes: String(info.notes || '') };
    } catch (err) { return { ok: false, current: String(version), error: String(err?.message ?? err) }; }
  }
  return { snapshot, resolve, reference, refresh, updateCheck };
}

export function compareSemver(a, b) {
  const pa = String(a ?? '').split('.').slice(0, 3).map((value) => Number.parseInt(value, 10) || 0);
  const pb = String(b ?? '').split('.').slice(0, 3).map((value) => Number.parseInt(value, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
  return 0;
}

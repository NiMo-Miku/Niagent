// StickerManager：data/stickers.json（顶层数组）+ data/sticker-images/。
// 契约：notes/12-data.md §3.14/§3.15（字段表 / md5 大写 / source 枚举 / normalize 丢运行期字段 /
// basename 搬家自愈 / 原子写）。
//
// 本地表情库独立保存图片、备注和使用记录。
// 可选 qq.emoji-favorites 插件可同步账号收藏；默认 OneBot 传输不提供此能力。
// 对显式远端操作保留确认成功后再写本地索引的失败语义。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { controlledMediaPath } from './media.js';
import { detectImageExt } from './safe-fetch.js';

const KEEP_FIELDS = ['id', 'resId', 'emojiId', 'qqFile', 'localFile', 'persistFailed', 'url', 'md5',
  'desc', 'localNote', 'tags', 'usage', 'source', 'useCount', 'lastUsedAt', 'lastContext', 'createdAt', 'updatedAt'];

// normalize：只保留持久化字段；运行期字段 sourceUrl/_persistTried 读回时丢弃
export function normalizeStickerEntry(raw) {
  const out = {};
  for (const k of KEEP_FIELDS) {
    if (raw?.[k] !== undefined) out[k] = raw[k];
  }
  out.id = String(out.id ?? raw?.emoji_id ?? raw?.resId ?? raw?.id ?? '');
  out.resId = String(out.resId ?? '');
  out.emojiId = String(out.emojiId ?? '');
  out.qqFile = String(out.qqFile ?? '');
  out.localFile = String(out.localFile ?? '');
  out.persistFailed = out.persistFailed === true;
  out.url = String(out.url ?? '');
  out.md5 = String(out.md5 ?? '').toUpperCase(); // md5 统一大写
  out.desc = String(out.desc ?? '');
  out.localNote = String(out.localNote ?? '');
  out.tags = Array.isArray(out.tags) ? out.tags.slice(0, 20) : [];
  out.usage = String(out.usage ?? '');
  out.source = ['qq', 'ai', 'manual'].includes(out.source) ? out.source : 'qq';
  out.useCount = Number(out.useCount) || 0;
  out.lastUsedAt = Number(out.lastUsedAt) || 0;
  out.lastContext = String(out.lastContext ?? '').slice(0, 200);
  out.createdAt = out.createdAt ?? new Date().toISOString();
  out.updatedAt = out.updatedAt ?? new Date().toISOString();
  return out;
}

function readJsonSafe(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch { return fallback; }
}

export function createStickerManager({ dataDir, log = console, capability = null, cfg, mediaReader = null, lifecycle = null, providerLease = null, now = () => Date.now() } = {}) {
  const file = path.join(dataDir, 'stickers.json');
  const imagesDir = path.join(dataDir, 'sticker-images');
  fs.mkdirSync(imagesDir, { recursive: true });
  const reader = () => typeof mediaReader === 'function' ? mediaReader() : mediaReader;
  const cachePath = (id, ext) => path.join(imagesDir, `${/^[a-z\d_-]{1,96}$/i.test(id) ? id : crypto.createHash('sha256').update(String(id)).digest('hex')}${['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext) ? ext : '.png'}`);
  const uri = (filename) => pathToFileURL(filename).href;
  let stopped = false, syncFlight = null, synced = null, collectionTail = Promise.resolve();
  const collectTimes = [];
  lifecycle?.onStop?.(() => { stopped = true; syncFlight?.controller.abort(new Error('表情库已停止')); });
  const cancelled = () => stopped || lifecycle?.signal?.aborted;
  const signalFor = signal => {
    const signals = [signal, lifecycle?.signal].filter(Boolean);
    return signals.length ? AbortSignal.any(signals) : undefined;
  };
  function waitFor(value, signal) {
    if (!signal) return Promise.resolve(value);
    if (signal.aborted) return Promise.reject(signal.reason ?? new Error('操作已中止'));
    let abort;
    const rejected = new Promise((_, reject) => { abort = () => reject(signal.reason ?? new Error('操作已中止')); signal.addEventListener('abort', abort, { once: true }); });
    return Promise.race([Promise.resolve(value), rejected]).finally(() => signal.removeEventListener('abort', abort));
  }
  function controlledLocal(value) { return controlledMediaPath(value, [imagesDir]); }

  function load() {
    const data = readJsonSafe(file, null);
    // 顶层数组（不是 {entries:[]}）——12-data §3.14 兼容注意 ①
    const arr = Array.isArray(data) ? data : [];
    return arr.map(normalizeStickerEntry).filter((x) => x.id);
  }

  function save(entries) {
    const tmp = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(entries.map(normalizeStickerEntry), null, 2), 'utf8');
      fs.renameSync(tmp, file);
    } finally { try { fs.unlinkSync(tmp); } catch { /* 已提交或写入未开始 */ } }
  }

  // basename 搬家自愈（12-data §3.14：换机器/换目录后 file:/// 必失效）
  function healLocalPaths(entries) {
    let changed = false;
    for (const e of entries) {
      if (!e.localFile) continue;
      let p;
      try { p = e.localFile.startsWith('file:') ? fileURLToPath(e.localFile) : e.localFile; } catch { continue; }
      if (fs.existsSync(p)) continue;
      const base = path.basename(p);
      const candidate = path.join(imagesDir, base);
      if (fs.existsSync(candidate)) {
        e.localFile = uri(candidate);
        e.url = e.localFile;
        changed = true;
      }
    }
    if (changed) save(entries);
    return entries;
  }

  function all() { return healLocalPaths(load()); }

  function get(id) { return all().find((x) => x.id === String(id)) ?? null; }

  function list({ limit = 24 } = {}) {
    const n = Math.max(1, Math.min(100, Number(limit) || 24)); // clamp 100（SUSPECT C-06 复刻）
    return all().slice(0, n);
  }

  function note(id, text) {
    const entries = all();
    const e = entries.find((x) => x.id === String(id));
    if (!e) return null;
    e.localNote = String(text ?? '').slice(0, 300);
    e.updatedAt = new Date().toISOString();
    save(entries);
    return e;
  }

  function markUsed(id, context = '') {
    const entries = all();
    const e = entries.find((x) => x.id === String(id));
    if (!e) return null;
    e.useCount = (e.useCount ?? 0) + 1;
    e.lastUsedAt = Date.now();
    e.lastContext = String(context).slice(0, 200);
    e.updatedAt = new Date().toISOString();
    save(entries);
    return e;
  }

  function collect({ id, url, file, desc = '', source = 'ai', buffer = null, ext = '.png' }) {
    const entries = all();
    const key = String(id ?? `collected_${Date.now()}`);
    const existing = entries.find((x) => x.id === key);
    const localPath = cachePath(key, ext);
    if (buffer) {
      try { fs.writeFileSync(localPath, buffer); } catch { /* 转存失败降级 */ }
    }
    const entry = normalizeStickerEntry({
      ...(existing ?? {}),
      id: key, resId: key, url: url ?? existing?.url ?? '',
      localFile: buffer && fs.existsSync(localPath) ? uri(localPath) : existing?.localFile,
      desc: desc || existing?.desc || '', source,
      md5: buffer ? crypto.createHash('md5').update(buffer).digest('hex').toUpperCase() : existing?.md5,
      createdAt: existing?.createdAt, updatedAt: new Date().toISOString(),
    });
    if (!existing) entries.push(entry);
    else entries[entries.indexOf(existing)] = entry;
    save(entries);
    return entry;
  }

  function mergedQQ(qqEntries, { complete = true, baseline = null } = {}) {
    const byId = new Map(load().map(entry => [entry.id, entry]));
    const fetched = new Set();
    for (const q of new Map(qqEntries.map(entry => [String(entry.id), entry])).values()) {
      const id = String(q.id), prev = byId.get(id), original = baseline?.get(id);
      fetched.add(id);
      const next = { ...(prev ?? {}), id, source: prev?.source ?? 'qq' };
      for (const key of ['resId', 'emojiId', 'qqFile', 'url', 'md5', 'desc']) {
        // An acknowledged local collect/rename during the read owns its newer fields.
        const locallyChanged = baseline && prev && (!original || prev[key] !== original[key]);
        if (q[key] !== undefined && !locallyChanged) next[key] = q[key];
      }
      next.updatedAt = new Date(now()).toISOString();
      byId.set(id, normalizeStickerEntry(next));
    }
    return [...byId.values()].filter(entry => !complete || entry.source !== 'qq' || fetched.has(entry.id)
      || (baseline && (!baseline.has(entry.id) || JSON.stringify(entry) !== JSON.stringify(baseline.get(entry.id)))));
  }

  // Explicit host merge remains a complete-snapshot operation for compatibility.
  // Remote synchronization below only permits pruning with positive completeness.
  function mergeFromQQ(qqEntries) {
    const entries = mergedQQ(qqEntries);
    save(entries);
    return entries;
  }

  // 可选账号收藏能力由独立插件注入；没有能力时不执行远端操作。
  function requireQQ() {
    const cap = typeof capability?.providers === 'function'
      ? capability.providers('qq.emoji-favorites')[0]?.provider
      : null;
    if (!cap) throw new Error('协议端未提供 qq.emoji-favorites 能力（无法写入 QQ 表情库）');
    return cap;
  }

  function qqLease(scopes = ['net.outbound']) {
    const selected = capability?.providers?.('qq.emoji-favorites')?.[0];
    if (!selected?.provider) throw new Error('协议端未提供 qq.emoji-favorites 能力（无法写入 QQ 表情库）');
    const cap = selected.provider, version = capability.version?.('qq.emoji-favorites', selected.ownerId);
    const authorization = providerLease?.(selected.ownerId, scopes);
    if (authorization && authorization.isValid?.() !== true) throw new Error('收藏表情提供者授权已失效');
    const account = typeof cap.getAccountIdentity === 'function' ? cap.getAccountIdentity() : null;
    return { cap, ownerId: selected.ownerId, version, account,
      current() {
        if (cancelled() || (authorization && authorization.isValid?.() !== true)) return false;
        if (typeof capability.version === 'function') {
          const current = capability.providers('qq.emoji-favorites')[0];
          if (current?.ownerId !== selected.ownerId || current?.provider !== cap || capability.version('qq.emoji-favorites', selected.ownerId) !== version) return false;
        }
        return typeof cap.getAccountIdentity !== 'function' || cap.getAccountIdentity() === account;
      },
    };
  }
  const sameLease = (a, b) => a && b && a.cap === b.cap && a.ownerId === b.ownerId && a.version === b.version && a.account === b.account;
  const cachedSync = (code, error, extra = {}) => ({ entries: load(), fromCache: true, degraded: true, code, error: String(error?.message ?? error), ...extra });
  async function syncFromQQ({ force = false, signal } = {}) {
    signal = signalFor(signal);
    if (signal?.aborted) throw signal.reason ?? new Error('表情同步已中止');
    if (cancelled()) return cachedSync('QQ_EMOJI_STOPPED', '表情库已停止');
    if (cfg?.()?.sticker?.enabled === false) return { entries: load(), fromCache: true, disabled: true };
    let lease;
    try { lease = qqLease(); } catch (error) { return cachedSync('QQ_EMOJI_UNAVAILABLE', error); }
    if (typeof lease.cap.fetchCustomFaceDetails !== 'function') return cachedSync('QQ_EMOJI_DETAILS_UNAVAILABLE', '协议端未提供收藏表情详情接口');
    if (!lease.account) return cachedSync('QQ_EMOJI_ACCOUNT_UNKNOWN', '尚未确认当前收藏表情账号');
    if (!sameLease(synced?.lease, lease)) synced = null;
    if (!force && synced && now() >= synced.at && now() - synced.at < 60_000) return { entries: load(), fromCache: true };
    if (syncFlight && !sameLease(syncFlight.lease, lease)) {
      syncFlight.controller.abort(new Error('收藏表情提供者或账号已更改'));
      syncFlight = null;
    }
    if (!syncFlight) {
      const flight = { lease, controller: new AbortController(), waiters: 0, done: false };
      const baseline = new Map(load().map(entry => [entry.id, entry]));
      const operationSignal = signalFor(flight.controller.signal);
      const valid = () => {
        if (operationSignal?.aborted || syncFlight !== flight || !lease.current()) throw new Error('收藏表情同步代际已失效');
      };
      flight.promise = Promise.resolve().then(async () => {
        try {
          valid();
          const count = Math.min(500, Math.max(1, Number(cfg?.()?.sticker?.promptMaxStickers) * 10 || 100));
          const result = await waitFor(lease.cap.fetchCustomFaceDetails({ limit: count, signal: operationSignal }), operationSignal);
          valid();
          if (!result || !Array.isArray(result.entries) || result.entries.length > 500) throw new Error('收藏表情详情返回格式不合法');
          const entries = result.entries.map(raw => {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !['string', 'number'].includes(typeof raw.id)) throw new Error('收藏表情详情身份不合法');
            const id = String(raw.id).trim();
            if (!id || id.length > 256 || /[\x00-\x1f]/.test(id)) throw new Error('收藏表情详情身份不合法');
            const out = { id, emojiId: id, resId: id };
            for (const [key, max] of [['resId', 256], ['qqFile', 2048], ['url', 8192], ['md5', 128], ['desc', 300]]) {
              if (raw[key] !== undefined) {
                if (typeof raw[key] !== 'string') throw new Error('收藏表情详情字段不合法');
                out[key] = raw[key].slice(0, max);
              }
            }
            if (out.url && !/^https?:\/\//i.test(out.url)) throw new Error('收藏表情详情图片地址不合法');
            return out;
          });
          const merged = mergedQQ(entries, { complete: result.complete === true, baseline });
          valid(); // Last check before the synchronous atomic commit.
          if (JSON.stringify(merged) !== JSON.stringify(load())) save(merged);
          synced = { lease, at: now() };
          return { entries: merged, fromCache: false, complete: result.complete === true };
        } catch (error) { return cachedSync('QQ_EMOJI_SYNC_FAILED', error); }
        finally { flight.done = true; if (syncFlight === flight) syncFlight = null; }
      });
      syncFlight = flight;
    }
    const flight = syncFlight;
    flight.waiters++;
    try { return await waitFor(flight.promise, signal); }
    finally {
      flight.waiters--;
      if (!flight.done && flight.waiters === 0) flight.controller.abort(new Error('收藏表情同步调用者已取消'));
    }
  }

  function collectionPolicy() {
    const settings = cfg?.()?.sticker ?? {};
    if (settings.collectEnabled === false) return { ok: false, code: 'QQ_EMOJI_COLLECT_DISABLED', error: '收藏表情功能未开启' };
    const value = Number(settings.maxCollectPerHour);
    const limit = Number.isFinite(value) ? Math.max(1, value || 10) : 10;
    const current = now();
    while (collectTimes.length && current - collectTimes[0] >= 3_600_000) collectTimes.shift();
    if (collectTimes.length >= limit) return { ok: false, code: 'QQ_EMOJI_RATE_LIMIT', error: '收藏太频繁了，一小时后再试' };
    return null;
  }

  /**
   * 收藏到 QQ 随账号表情包并写备注。
   * 严格顺序：① 写入 QQ 库拿 emoji_id → ② 写备注 → ③ 落本地索引。
   * 任一步失败都不落本地索引，避免"本地有、QQ 侧没有"的幽灵条目。
   * @returns {{ok:true, entry}|{ok:false, error, code}}
   */
  async function collectIntoQQ({ file, desc = '', buffer = null, ext = '.png', tags = [], usage = '', media = null, signal }) {
    signal = signalFor(signal);
    let addedId = '', addStarted = false;
    const cancellation = () => ({ ok: false, code: 'QQ_EMOJI_CANCELLED', error: addedId
      ? `收藏已中止，QQ 侧已收藏（${addedId}）；未写本地索引`
      : addStarted ? '收藏已中止，QQ 侧收藏结果未知；未写本地索引' : '收藏已中止' });
    if (signal?.aborted || cancelled()) return cancellation();
    const task = collectionTail.then(async () => {
      if (signal?.aborted || cancelled()) return cancellation();
      const refused = collectionPolicy();
      if (refused) return refused;
      const lease = qqLease(['net.outbound', 'qq.send']);
      const current = () => !signal?.aborted && lease.current();
      const cap = {
        addCustomFace: value => lease.cap.addCustomFace(value, { signal }),
        modifyCustomFace: (id, note) => lease.cap.modifyCustomFace(id, note, { signal }),
      };
      let downloaded;
      if (reader() && !buffer) {
        try { downloaded = await waitFor(reader().image(media ?? { url: /^https?:\/\//i.test(file) ? file : null, file }, { signal, maxBytes: 15 * 1024 * 1024, localRoots: [imagesDir] }), signal); }
        catch (err) { return signal?.aborted ? cancellation() : { ok: false, code: 'QQ_EMOJI_IMAGE_FAILED', error: `图片获取失败：${err?.message ?? err}` }; }
        buffer = downloaded.buffer; ext = detectImageExt(buffer); file = `base64://${buffer.toString('base64')}`;
      }
      if (!current()) return cancellation();
      const changedPolicy = collectionPolicy();
      if (changedPolicy) return changedPolicy;
      let added;
      try {
        addStarted = true;
        added = await cap.addCustomFace(file);
      } catch (err) {
        if (err?.remoteEffect === 'added') { addedId = String(err.emojiId ?? ''); collectTimes.push(now()); }
        // An ambiguous transport timeout is an attempt, not a fictitious rollback.
        // Conservatively retain its hourly slot, separately from confirmed adds.
        const unknown = !addedId && /timeout|超时|network|socket|ECONN|ENOTFOUND|fetch failed|aborted|取消|已停止/i.test(String(err?.message ?? err));
        if (unknown) collectTimes.push(now());
        if (!current() || err?.code === 'QQ_EMOJI_CANCELLED') return cancellation();
        if (err?.code === 'QQ_EMOJI_NO_ID') return { ok: false, code: 'QQ_EMOJI_NO_ID', error: String(err.message) };
        // 协议端错误原样归类：上限是最常见的一种，单独给 code 便于工具回话术
        const text = String(err?.message ?? err ?? '');
        const overLimit = /上限|limit|too many|1000|max/i.test(text);
        return {
          ok: false,
          code: overLimit ? 'QQ_EMOJI_LIMIT' : 'QQ_EMOJI_ADD_FAILED',
          error: overLimit
            ? `QQ 表情包已满（上限约 1000 个），收藏失败。请先在 QQ 里删掉不用的收藏表情。`
            : `写入QQ 表情库失败：${text}${unknown ? '；QQ 侧结果未知，本次保守计入小时额度' : ''}`,
        };
      }

      const rawId = added?.emojiId;
      const emojiId = ['string', 'number'].includes(typeof rawId) && !(typeof rawId === 'number' && !Number.isFinite(rawId)) ? String(rawId).trim() : '';
      if (!emojiId) return { ok: false, code: 'QQ_EMOJI_NO_ID', error: '协议端未返回 emoji_id，无法确认收藏结果' };
      addedId = emojiId;
      collectTimes.push(now());
      if (!current()) return cancellation();

      // 备注直接写 QQ 侧——QQ 客户端里就能看到，本地不再是唯一真相
      let noted = true;
      if (desc) {
        try { noted = (await cap.modifyCustomFace(emojiId, desc))?.ok === true; }
        catch { noted = false; }
      }
      if (!current()) return cancellation();
      if (!noted) {
        return {
          ok: false, code: 'QQ_EMOJI_NOTE_FAILED',
          error: `已收藏进 QQ 表情包（${emojiId}），但备注写入失败；未写入本地索引。QQ 侧表情可能没有备注。`,
        };
      }

      // 落本地索引（失败不影响 QQ 侧已收藏的事实，只是不进本地查询）
      try {
        const key = emojiId;
        const localPath = cachePath(key, ext);
        if (buffer) fs.writeFileSync(localPath, buffer);
        const currentEntries = all();
        const previous = currentEntries.find(x => String(x.emojiId ?? x.id) === key || x.id === key);
        const entry = normalizeStickerEntry({
          ...(previous ?? {}),
          id: key, resId: key, emojiId: key,
          url: buffer ? uri(localPath) : file, localFile: buffer ? uri(localPath) : previous?.localFile,
          desc, source: 'qq',
          md5: buffer ? crypto.createHash('md5').update(buffer).digest('hex').toUpperCase() : previous?.md5,
          tags: tags.length ? tags : previous?.tags, usage: usage || previous?.usage,
          createdAt: previous?.createdAt ?? new Date(now()).toISOString(), updatedAt: new Date(now()).toISOString(),
        });
        const entries = currentEntries.filter(x => String(x.emojiId ?? x.id) !== key && x.id !== key);
        entries.unshift(entry);
        if (!current()) return cancellation();
        save(entries);
        return { ok: true, entry, noted };
      } catch (err) {
        return { ok: true, entry: { id: emojiId, emojiId, desc, source: 'qq' }, noted, indexFailed: String(err?.message ?? err) };
      }
    });
    collectionTail = task.catch(() => {}); // A rejected attempt must not poison queued calls.
    try { return await waitFor(task, signal); }
    catch (error) { if (signal?.aborted) return cancellation(); throw error; }
  }

  async function ensureSendable(sticker, { signal } = {}) {
    const item = typeof sticker === 'string' ? get(sticker) : sticker;
    if (!item) throw new Error('找不到表情，请先用 list_stickers 获取有效 id');
    const local = item.localFile || (/^file:/i.test(item.url) ? item.url : '');
    let filename = local ? controlledLocal(local) : null;
    if (local && !filename) {
      let resolved;
      try { resolved = local.startsWith('file:') ? fileURLToPath(local) : local; } catch { throw new Error('表情本地路径不合法'); }
      const relative = path.relative(path.resolve(imagesDir), path.resolve(resolved));
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || fs.existsSync(resolved)) {
        throw new Error('表情本地图片不在受控收藏目录中，已拒绝发送');
      }
    }
    if (!filename && /^https?:\/\//i.test(item.url)) {
      if (!reader()) throw new Error('图片读取服务未装配，无法转存表情');
      const data = await reader().image({ url: item.url, file: item.qqFile || item.resId || item.emojiId }, { signal, maxBytes: 15 * 1024 * 1024, localRoots: [imagesDir] });
      if (signal?.aborted) throw signal.reason ?? new Error('发送已中止');
      filename = cachePath(item.id, detectImageExt(data.buffer));
      const tmp = `${filename}.${crypto.randomUUID()}.tmp`;
      try {
        fs.writeFileSync(tmp, data.buffer); fs.renameSync(tmp, filename);
        const entries = all(); const current = entries.find((entry) => entry.id === item.id);
        if (current) { current.localFile = uri(filename); current.persistFailed = false; save(entries); }
      } finally { try { fs.unlinkSync(tmp); } catch { /* 已重命名或写入失败 */ } }
    }
    const fileId = item.qqFile || item.resId || item.emojiId;
    if (!filename && !fileId) throw new Error('表情的本地图片已丢失，受控收藏目录里找不到它');
    return { id: item.id, localPath: filename, fileId, url: /^https?:\/\//i.test(item.url) ? item.url : null, imagesDir };
  }

  /** 改QQ 侧备注（QQ 客户端里同步可见）。 */
  async function renameInQQ(emojiId, desc) {
    const cap = requireQQ();
    const res = await cap.modifyCustomFace(emojiId, desc);
    if (res?.ok === false) return { ok: false, error: 'QQ 侧改备注失败' };
    const entries = all();
    const e = entries.find((x) => String(x.emojiId ?? x.id) === String(emojiId));
    if (e) { e.desc = String(desc ?? '').slice(0, 300); e.updatedAt = new Date().toISOString(); save(entries); }
    return { ok: true, entry: e ?? null };
  }

  /** 从 QQ 表情库删除（同时清本地索引）。 */
  async function removeFromQQ(emojiId) {
    const cap = requireQQ();
    const res = await cap.deleteCustomFace(emojiId);
    if (res?.ok === false) return { ok: false, error: 'QQ 侧删除失败' };
    const key = String(emojiId);
    save(all().filter((x) => String(x.emojiId ?? x.id) !== key));
    return { ok: true };
  }

  /** 通过可选能力拉取账号收藏表情列表。 */
  async function listFromQQ(limit = 48) {
    const cap = requireQQ();
    const urls = await cap.fetchCustomFaces(limit);
    return Array.isArray(urls) ? urls : [];
  }

  function buildPromptContext(max = 10) {
    const list = all().slice(0, Math.max(1, Math.min(30, Number(max) || 10)));
    if (list.length === 0) return '';
    // 不把 useCount 写进提示词（每次运行都变会挤出缓存前缀——06b §10.3 事故注）
    return list.map((e) => {
      const bits = [`#${e.id}`];
      if (e.desc) bits.push(`备注:${e.desc}`);
      if (e.localNote) bits.push(`笔记:${e.localNote}`);
      if (e.tags?.length) bits.push(`标签:${e.tags.join('/')}`);
      if (e.usage) bits.push(`用法:${e.usage}`);
      return `- ${bits.join(' ')}`;
    }).join('\n');
  }

  return { all, get, list, note, markUsed, collect, mergeFromQQ, buildPromptContext, imagesDir, controlledLocal, ensureSendable,
    collectIntoQQ, renameInQQ, removeFromQQ, listFromQQ, syncFromQQ };
}

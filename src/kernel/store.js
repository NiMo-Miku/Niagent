// ChatStore：data/messages/<group|private>_<id>.json 聊天存档仓。
// 契约：notes/12-data.md §3.4（字段表 + 0.5 兼容注意 ①-⑥ 全部照抄）。
// - 文件名 sanitize：非 [a-z0-9_] → '_'；目录 Pattern 允许可选平台前缀（<platform>_group_<id>.json，
//   兼容 parseChatKey 三段式；两段式 group_<id>.json 仍是主流）。只认数字 id
// - 顶层 { chatKey, nextLocalId, messages }；数组顺序即时间追加序不可重排
// - self 条目 senderId='self' / senderName='我'（字面量照抄）
// - atMe:null = 老存档未标（判定层回落文本匹配）
// - id 因 trim 被裁头部仍递增——不要假设从 1 连续
// - 原子写 <file>.<pid>.tmp → rename；读时剥 BOM；损坏当空重建
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// 组1 = 可选平台前缀（非贪婪，两段式文件不误吞）；组2/3 = kind + 数字 id
const FILE_RE = /^(?:([a-z][a-z0-9_]*?)_)?(group|private)_(\d+)\.json$/i;
const sanitize = (s) => String(s).replace(/[^a-z0-9_]/gi, '_');

// Protocol ids are signed integers, never local archive ids. Legacy null ids
// must not match each other; wire notices may serialize a numeric id as text.
function protocolMid(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !/^-?\d+$/.test(value.trim()))) return null;
  const mid = Number(value);
  return Number.isSafeInteger(mid) && mid !== 0 ? mid : null;
}

// Older normalized archives may have rendered a reply segment into text as
// well as caching reply.sender/text. Remove only leading structured reply
// markers in the model view; balanced brackets cover summaries containing [图片].
export function stripInlineReply(value, reply) {
  let text = String(value ?? '');
  if (!reply) return text;
  while (true) {
    const candidate = text.trimStart();
    if (!candidate.startsWith('[引用 ') && !candidate.startsWith('[引用消息]')) return text;
    let depth = 0, end = -1;
    for (let index = 0; index < candidate.length; index++) {
      if (candidate[index] === '[') depth++;
      if (candidate[index] === ']' && --depth === 0) { end = index + 1; break; }
    }
    if (end < 0) return '[引用摘要无法核实]';
    text = candidate.slice(end).trimStart();
  }
}

/** 文件名 → chatKey（两段式保持 0.4 口径；三段式带平台前缀还原）。 */
function chatKeyFromFile(name) {
  const m = name.match(FILE_RE);
  if (!m) return null;
  return m[1] ? `${m[1]}:${m[2]}:${m[3]}` : `${m[2]}:${m[3]}`;
}

function readJsonSafe(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return fallback; // 损坏当空重建（§7 损坏容错）
  }
}

function atomicWrite(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), 'utf8');
  fs.renameSync(tmp, file);
}

export function createChatStore({ dataDir, log = console, maxMessagesPerChat = () => 0 } = {}) {
  const dir = path.join(dataDir, 'messages');
  fs.mkdirSync(dir, { recursive: true });
  const states = new Map(); // chatKey -> state
  const summaries = new WeakMap(), messageIndexes = new WeakMap();
  const diskSummaries = new Map(); // summaries only; never retain cold message arrays
  function invalidateDerived(st) { summaries.delete(st); messageIndexes.delete(st); }
  function messageIndex(st) {
    let index = messageIndexes.get(st);
    if (index) return index;
    const byMid = new Map(); let ordered = true, previous = -Infinity;
    for (const entry of st.messages) {
      const mid = protocolMid(entry.mid);
      if (mid !== null && !byMid.has(mid)) byMid.set(mid, entry); // preserve first-match semantics
      if (!Number.isSafeInteger(entry.id) || entry.id < previous) ordered = false;
      previous = entry.id;
    }
    index = { byMid, ordered }; messageIndexes.set(st, index); return index;
  }
  // Host-only retry identities: clearing a chat or rebuilding the store changes
  // its incarnation, even when local ids are reused. Never persisted or in SDK.
  const readIncarnations = new WeakMap();
  function readIncarnation(st) {
    if (!readIncarnations.has(st)) readIncarnations.set(st, randomUUID());
    return readIncarnations.get(st);
  }
  const contextListeners = new Set();
  const contextScopes = new Map();
  function referenceKeys(chatKey, entries) {
    const keys = new Set();
    for (const entry of entries) {
      if (entry.id != null) keys.add(`${chatKey}/local/${entry.id}`);
      for (const raw of [entry.mid, entry.reply?.mid]) { const mid = protocolMid(raw); if (mid !== null) keys.add(`${chatKey}/mid/${mid}`); }
    }
    return keys;
  }
  function captureContext(sessionId, chatKey, entries) {
    const scope = contextScopes.get(sessionId);
    if (scope) for (const key of referenceKeys(chatKey, entries)) scope.references.add(key);
  }
  function invalidateContext(chatKey, entries) {
    for (const fn of contextListeners) { try { fn(chatKey); } catch (err) { log.error?.(`[store] 上下文失效通知失败：${err?.message}`); } }
    const changed = referenceKeys(chatKey, entries);
    for (const scope of contextScopes.values()) {
      if ([...changed].some(key => scope.references.has(key))) scope.invalidate();
    }
  }

  function fileOf(chatKey) {
    return path.join(dir, `${sanitize(chatKey)}.json`);
  }

  function ensure(chatKey) {
    let st = states.get(chatKey);
    if (st) return st;
    const file = fileOf(chatKey);
    const loaded = readJsonSafe(file, null);
    st = loaded && Array.isArray(loaded.messages) && typeof loaded.nextLocalId === 'number'
      ? loaded
      : { chatKey, nextLocalId: 1, messages: [] };
    if (!loaded) saveChat(chatKey, st); // 首次建文件
    states.set(chatKey, st);
    return st;
  }

  function saveChat(chatKey, st, { strict = false } = {}) {
    invalidateDerived(st);
    diskSummaries.delete(chatKey);
    try {
      atomicWrite(fileOf(chatKey), st);
    } catch (err) {
      log.error?.(`[store] 保存 ${chatKey} 失败：${err?.message}`);
      if (strict) {
        try { fs.unlinkSync(`${fileOf(chatKey)}.${process.pid}.tmp`); } catch { /* own temporary file only */ }
        throw err;
      }
    }
  }

  function trim(chatKey, st) {
    const max = Number(maxMessagesPerChat()) || 0; // 0 = 不限（SPEC §5.1）
    if (max > 0 && st.messages.length > max) {
      st.messages = st.messages.slice(-max); // id 不重排、nextLocalId 不回退
    }
  }

  /** 入库一条外来消息（§6.2.10）。返回入库条目。 */
  function appendIncoming(chatKey, entry) {
    const st = ensure(chatKey);
    const msg = {
      id: st.nextLocalId++,
      mid: entry.mid ?? null,          // QQ 消息 id（可为负数）
      ts: entry.ts ?? Date.now(),
      senderId: String(entry.senderId ?? ''),
      senderName: String(entry.senderName ?? ''),
      text: String(entry.text ?? ''),
      self: false,
      read: false,
      reply: entry.reply ?? null,       // 新引用 { mid, sender, text }；旧摘要原样留档
      media: entry.media ?? [],
      isPoke: entry.isPoke === true,
      atMe: entry.atMe === undefined ? null : entry.atMe, // null = 未标（老存档语义）
      atNames: (entry.atNames ?? []).slice(0, 20),
    };
    if (entry.recalled) msg.recalled = true;
    st.messages.push(msg);
    trim(chatKey, st);
    saveChat(chatKey, st);
    return msg;
  }

  /** 入库机器人自己发的（§6.10.6：self=true 留档——否则下次运行不知道自己发过什么）。 */
  function appendSelf(chatKey, entry) {
    const st = ensure(chatKey);
    const msg = {
      id: st.nextLocalId++,
      mid: entry.mid ?? null,
      ts: entry.ts ?? Date.now(),
      senderId: 'self',   // 字面量照抄（12-data §3.4 兼容注意 ②）
      senderName: '我',
      text: String(entry.text ?? ''),
      self: true,
      read: true,         // 自己发的视为已读
      reply: entry.reply ?? null,
      media: entry.media ?? [],
      isPoke: false,
      atMe: null,
      atNames: [],
    };
    st.messages.push(msg);
    trim(chatKey, st);
    saveChat(chatKey, st);
    return msg;
  }

  function resolveReply(chatKey, reply) {
    if (!reply || typeof reply !== 'object') return null;
    const mid = protocolMid(reply.mid);
    if (mid === null) return { sender: '', text: '[旧引用来源无法核实]', status: 'legacy' };
    const source = findByMid(chatKey, mid);
    if (!source) return { mid, sender: '', text: '[引用消息不存在或已移除]', status: 'missing' };
    if (source.recalled) return { mid, sender: '', text: '[引用消息已撤回]', status: 'recalled' };
    return { mid, sender: String(source.senderName ?? ''), text: stripInlineReply(source.text, source.reply).slice(0, 120), status: 'resolved' };
  }

  function project(chatKey, entry, forContext = false) {
    return { ...entry, ...(forContext ? { text: stripInlineReply(entry.text, entry.reply) } : {}), reply: resolveReply(chatKey, entry.reply) };
  }

  function recent(chatKey, n = 500, { forContext = false, resolveReplies = false, contextSessionId = null } = {}) {
    const st = ensure(chatKey);
    const entries = forContext ? st.messages.filter(m => !m.recalled) : st.messages;
    const slice = entries.slice(-n); // 先过滤再分页；原始存档读取仍保留撤回消息。
    if (forContext) captureContext(contextSessionId, chatKey, slice);
    return forContext || resolveReplies ? slice.map(entry => project(chatKey, entry, forContext)) : slice;
  }

  /** Optional host pagination. Slice raw entries before resolving visible replies. */
  function page(chatKey, { limit = 500, offset = 0, beforeId } = {}) {
    const st = ensure(chatKey), total = st.messages.length;
    limit = Math.min(500, Math.max(1, Math.floor(Number(limit) || 500)));
    offset = Math.max(0, Math.floor(Number(offset) || 0));
    let entries = st.messages, boundary = total;
    if (beforeId != null) {
      const cutoff = Number(beforeId);
      if (messageIndex(st).ordered && Number.isFinite(cutoff)) {
        let low = 0, high = total;
        while (low < high) { const mid = (low + high) >>> 1; if (entries[mid].id < cutoff) low = mid + 1; else high = mid; }
        boundary = low;
      } else { entries = entries.filter(entry => Number(entry.id) < cutoff); boundary = entries.length; }
    }
    const end = Math.max(0, boundary - offset), start = Math.max(0, end - limit);
    return { chatKey, messages: entries.slice(start, end).map(entry => project(chatKey, entry)), total, offset, hasMore: start > 0 };
  }

  function findByMid(chatKey, mid, { forContext = false, contextSessionId = null } = {}) {
    const st = ensure(chatKey);
    const target = protocolMid(mid);
    const entry = target === null ? null : messageIndex(st).byMid.get(target) ?? null;
    if (forContext && entry && !entry.recalled) captureContext(contextSessionId, chatKey, [entry]);
    return forContext ? entry && !entry.recalled ? project(chatKey, entry, true) : null : entry;
  }

  function markRecalled(chatKey, mid) {
    const st = ensure(chatKey);
    const target = protocolMid(mid);
    if (target === null) return false;
    const entries = st.messages.filter((m) => protocolMid(m.mid) === target);
    if (!entries.length) { invalidateContext(chatKey, [{ mid: target }]); return false; }
    const changed = entries.some(m => !m.recalled);
    for (const m of entries) { m.recalled = true; m.read = true; }
    saveChat(chatKey, st);
    if (changed) invalidateContext(chatKey, entries);
    return true;
  }

  function updateByMid(chatKey, mid, patch) {
    const st = ensure(chatKey);
    const m = findByMid(chatKey, mid);
    if (!m) return null;
    const wasRecalled = Boolean(m.recalled);
    Object.assign(m, patch); // 合并转发按 mid 幂等更新（12-data §6）
    saveChat(chatKey, st);
    if (Boolean(m.recalled) !== wasRecalled) invalidateContext(chatKey, [m]);
    return m;
  }

  function markEntryRead(chatKey, localId) {
    const st = ensure(chatKey);
    const m = st.messages.find((x) => x.id === localId);
    if (!m) return false;
    m.read = true;
    saveChat(chatKey, st);
    return true;
  }

  function markAllRead(chatKey, { strict = false, throughId = Infinity, incarnation } = {}) {
    if (incarnation !== undefined && !isReadBoundaryCurrent({ chatKey, throughId, incarnation })) {
      throw Object.assign(new Error('标读边界已失效，请开始新操作'), { code: 'READ_BOUNDARY_STALE' });
    }
    const st = ensure(chatKey);
    const changed = [];
    for (const m of st.messages) {
      if (!m.read && (throughId === Infinity || m.id <= throughId)) { changed.push({ m, owned: Object.hasOwn(m, 'read'), read: m.read }); m.read = true; }
    }
    try { if (changed.length > 0) saveChat(chatKey, st, { strict }); }
    catch (err) {
      for (const before of changed) { if (before.owned) before.m.read = before.read; else delete before.m.read; }
      invalidateDerived(st);
      throw err;
    }
    return changed.length;
  }

  function captureReadBoundary() {
    // The normal list reader is deliberately forgiving. A destructive host
    // action must not interpret unreadable archives as an empty backlog.
    const keys = new Set([...fs.readdirSync(dir).map(chatKeyFromFile).filter(Boolean), ...states.keys()]);
    return [...keys].flatMap(chatKey => {
      let st = states.get(chatKey);
      if (!st) {
        const raw = fs.readFileSync(fileOf(chatKey), 'utf8');
        st = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
        if (!st || !Array.isArray(st.messages) || !Number.isSafeInteger(st.nextLocalId) || st.nextLocalId < 1) throw new Error('无法确认聊天标读边界');
        states.set(chatKey, st);
      }
      if (!st.messages.some(m => !m.read)) return [];
      if (!Number.isSafeInteger(st.nextLocalId) || st.nextLocalId < 1 ||
        st.messages.some(m => !m.read && (!Number.isSafeInteger(m.id) || m.id < 1 || m.id >= st.nextLocalId))) throw new Error('无法确认聊天标读边界');
      return [{ chatKey, throughId: st.nextLocalId - 1, incarnation: readIncarnation(st) }];
    });
  }

  function isReadBoundaryCurrent(scope) {
    const st = scope && states.get(scope.chatKey);
    return Boolean(st && Number.isSafeInteger(scope.throughId) && scope.throughId >= 0 &&
      scope.throughId < st.nextLocalId && typeof scope.incarnation === 'string' &&
      readIncarnations.get(st) === scope.incarnation);
  }

  /** 拍一拍不占界面未读计数，但唤醒批必须消费这个即时召唤信号。 */
  function unread(chatKey, { includePokes = false } = {}) {
    return ensure(chatKey).messages.filter((m) => !m.read && !m.recalled && (includePokes || !m.isPoke));
  }

  /** 新会话按原触发 id 恢复，避免防抖前的消息落在 startedAt 时间窗之外。 */
  function markEntriesUnread(chatKey, ids) {
    const st = ensure(chatKey);
    const set = new Set(ids);
    let restored = 0;
    for (const m of st.messages) {
      if (!m.self && !m.recalled && set.has(m.id)) { m.read = false; restored++; }
    }
    if (restored > 0) saveChat(chatKey, st);
    return restored;
  }

  function markUnreadInWindow(chatKey, fromTs, toTs) {
    const st = ensure(chatKey);
    let n = 0;
    for (const m of st.messages) {
      if (!m.self && !m.isPoke && !m.recalled && m.ts >= fromTs && m.ts <= toTs && m.read) {
        m.read = false;
        n++;
      }
    }
    if (n > 0) saveChat(chatKey, st);
    return n; // 手动重试：按会话起止时间窗把触发批翻回未读（§6.13）
  }

  function removeByLocalIds(chatKey, ids) {
    const st = ensure(chatKey);
    const set = new Set(ids);
    const before = st.messages.length;
    const removed = st.messages.filter(m => set.has(m.id));
    st.messages = st.messages.filter((m) => !set.has(m.id));
    if (st.messages.length !== before) { saveChat(chatKey, st); invalidateContext(chatKey, removed); }
    return before - st.messages.length;
  }

  function clearChat(chatKey) {
    const removed = ensure(chatKey).messages;
    const st = { chatKey, nextLocalId: 1, messages: [] };
    states.set(chatKey, st);
    saveChat(chatKey, st);
    invalidateContext(chatKey, removed);
  }

  function listChats({ forContext = false, contextSessionId = null } = {}) {
    // 只认数字 id 的文件名 Pattern（12-data §3.4，放宽可选平台前缀）——其它名字不枚举
    const out = [];
    try {
      const live = new Set();
      for (const f of fs.readdirSync(dir)) {
        const chatKey = chatKeyFromFile(f);
        if (!chatKey) continue;
        live.add(chatKey);
        const loaded = states.get(chatKey);
        let fingerprint;
        if (!loaded && !forContext) {
          try { const s = fs.statSync(path.join(dir, f)); fingerprint = `${s.size}:${s.mtimeMs}:${s.ctimeMs}:${s.ino}`; } catch { continue; }
          const cached = diskSummaries.get(chatKey);
          if (cached?.fingerprint === fingerprint) { out.push({ ...cached.summary }); continue; }
        }
        if (loaded && !forContext && summaries.has(loaded)) { out.push({ ...summaries.get(loaded) }); continue; }
        const st = loaded ?? readJsonSafe(path.join(dir, f), null);
        if (!st || !Array.isArray(st.messages)) continue;
        const visible = forContext ? st.messages.filter(entry => !entry.recalled) : st.messages;
        const last = visible[visible.length - 1];
        if (forContext && last) captureContext(contextSessionId, chatKey, [last]);
        let unreadCount = 0;
        for (const message of st.messages) if (!message.read && !message.isPoke && !message.recalled) unreadCount++;
        const summary = {
          chatKey,
          lastActive: last?.ts ?? 0,
          lastText: last ? (forContext ? stripInlineReply(last.text, last.reply) : String(last.text ?? '')).slice(0, 30) : '',
          unread: unreadCount,
          count: st.messages.length,
        };
        if (!forContext) {
          if (loaded) summaries.set(loaded, summary);
          else diskSummaries.set(chatKey, { fingerprint, summary });
        }
        out.push({ ...summary });
      }
      for (const key of diskSummaries.keys()) if (!live.has(key)) diskSummaries.delete(key);
    } catch { /* 目录不可读 → 空列表 */ }
    return out.sort((a, b) => b.lastActive - a.lastActive);
  }

  return {
    appendIncoming, appendSelf, recent, page, findByMid, markRecalled, updateByMid,
    markEntryRead, markAllRead, unread, markEntriesUnread, markUnreadInWindow, removeByLocalIds,
    clearChat, listChats, captureReadBoundary, isReadBoundaryCurrent,
    onContextInvalidated(fn) { contextListeners.add(fn); return () => contextListeners.delete(fn); },
    watchContext(sessionId, invalidate) {
      const scope = { references: new Set(), invalidate };
      contextScopes.set(sessionId, scope);
      return { capture: (chatKey, entries) => captureContext(sessionId, chatKey, entries),
        stop() { if (contextScopes.get(sessionId) === scope) contextScopes.delete(sessionId); } };
    },
  };
}

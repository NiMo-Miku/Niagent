// MemoryStore：群友印象记忆仓（data/memory/）。
// 契约：notes/12-data.md §3.12（成员文件结构 / 文件名规则 / 容量约束 / 旧版迁移）。
// M1 落核心读写与 formatForPrompt；整理（consolidate）在 M4。
import fs from 'node:fs';
import path from 'node:path';

const sanitize = (s) => String(s).replace(/[^a-z0-9_]/gi, '_');
const CONTENT_MAX = 300;      // content 截断（12-data §3.12）
const PROMPT_MEMBERS_MAX = 15; // 提示词最多 15 成员
const PROMPT_IMPRESSIONS_MAX = 3; // 每成员最近 3 条

function memberFileName(userId, name) {
  if (userId && /^\d+$/.test(userId)) return `${userId}.json`;
  if (userId) return `u_${sanitize(userId)}.json`;
  const n = String(name ?? '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 40).replace(/[. ]+$/, '_');
  return `_n_${n}.json`;
}

function atomicWrite(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), 'utf8');
  fs.renameSync(tmp, file);
}

function readJsonSafe(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch { return fallback; }
}

// Keep a stable order for equal/unknown timestamps without changing the cached
// member map or each member's chronological impression order.
function recentMembers(members) {
  const time = member => { const value = Number(member.updatedAt); return Number.isFinite(value) && value > 0 ? value : 0; };
  return [...members.values()].sort((a, b) => time(b) - time(a));
}

export function createMemoryStore({ dataDir, log = console, cfg = () => ({}) } = {}) {
  const root = path.join(dataDir, 'memory');
  fs.mkdirSync(root, { recursive: true });
  const chats = new Map(); // chatKey -> Map<memberFile, member>

  function chatDirOf(chatKey) {
    return path.join(root, sanitize(chatKey));
  }

  function ensureChat(chatKey) {
    let members = chats.get(chatKey);
    if (members) { migrateLegacy(chatKey, members); return members; }
    members = new Map();
    const dir = chatDirOf(chatKey);
    try {
      fs.mkdirSync(dir, { recursive: true });
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json') || f === '_meta.json') continue;
        const m = readJsonSafe(path.join(dir, f), null);
        if (m && typeof m === 'object' && Array.isArray(m.impressions)) {
          members.set(f, { ...m, impressions: [...m.impressions].sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)) });
        }
      }
    } catch { /* 损坏当空 */ }
    migrateLegacy(chatKey, members);
    mergeNameDuplicates(chatKey, members);
    chats.set(chatKey, members);
    return members;
  }

  function mergeNameDuplicates(chatKey, members) {
    for (const [file, named] of [...members]) {
      if (named.userId || !named.name) continue;
      const identified = [...members.entries()].filter(([, member]) => member.userId && member.name === named.name);
      if (identified.length !== 1) continue; // 重名无法消歧时保留独立记忆。
      const [targetFile, target] = identified[0];
      const contents = new Set(target.impressions.map((item) => item.content));
      const merged = { ...target, impressions: [...target.impressions] };
      for (const item of named.impressions) {
        if (!contents.has(item.content)) { merged.impressions.push(item); contents.add(item.content); }
      }
      merged.impressions.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
      merged.updatedAt = Math.max(Number(target.updatedAt) || 0, Number(named.updatedAt) || 0);
      merged.lastConsolidatedAt = Math.max(Number(target.lastConsolidatedAt) || 0, Number(named.lastConsolidatedAt) || 0);
      try {
        atomicWrite(path.join(chatDirOf(chatKey), targetFile), merged);
        fs.unlinkSync(path.join(chatDirOf(chatKey), file));
        members.set(targetFile, merged);
        members.delete(file);
      } catch (err) { log.warn?.(`[memory] 合并同名记忆失败：${err?.message}`); }
    }
  }

  function migrateLegacy(chatKey, members) {
    const file = path.join(root, `${sanitize(chatKey)}.json`);
    if (!fs.existsSync(file)) return;
    const legacy = readJsonSafe(file, null);
    if (!Array.isArray(legacy?.memberImpression)) return; // 损坏或未知格式保留原文件。
    const notes = (typeof cfg === 'function' ? cfg() : cfg)?.memberNotes ?? {};
    const dirty = new Set();
    for (const item of legacy.memberImpression) {
      if (!item || typeof item.content !== 'string' || !item.content.trim()) continue;
      const target = String(item.target ?? '').trim();
      const matches = Object.entries(notes).filter(([id, name]) => /^\d{5,15}$/.test(id) && name === target);
      const userId = /^\d{5,15}$/.test(target) ? target : matches.length === 1 ? matches[0][0] : '';
      const name = userId ? String(notes[userId] ?? (target === userId ? '' : target)) : target;
      const memberFile = memberFileName(userId, name);
      const member = members.get(memberFile) ?? { userId, name, impressions: [], updatedAt: 0, lastConsolidatedAt: 0 };
      const content = item.content.slice(0, CONTENT_MAX);
      const createdAt = Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : Date.now();
      if (!member.impressions.some((impression) => impression.content === content)) member.impressions.push({ content, createdAt });
      member.impressions.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
      member.updatedAt = Math.max(Number(member.updatedAt) || 0, createdAt);
      members.set(memberFile, member);
      dirty.add(memberFile);
    }
    try {
      // 先确认成员文件全部成功写入，再移动旧文件；部分失败的重试按 content 去重。
      for (const memberFile of dirty) atomicWrite(path.join(chatDirOf(chatKey), memberFile), members.get(memberFile));
      const backupDir = path.join(root, 'backups'); fs.mkdirSync(backupDir, { recursive: true });
      let backup = path.join(backupDir, `${sanitize(chatKey)}.json`);
      for (let suffix = 1; fs.existsSync(backup); suffix++) backup = path.join(backupDir, `${sanitize(chatKey)}-${suffix}.json`);
      fs.renameSync(file, backup);
    } catch (err) { log.warn?.(`[memory] 旧记忆迁移未完成，保留原文件：${err?.message}`); }
  }

  function persist(chatKey, fileName, member) {
    try {
      const dir = chatDirOf(chatKey);
      fs.mkdirSync(dir, { recursive: true });
      atomicWrite(path.join(dir, fileName), member);
      return true;
    } catch (err) {
      log.error?.(`[memory] 写 ${chatKey}/${fileName} 失败：${err?.message}`);
      return false;
    }
  }

  /** 追加印象。同名去重：content 全等跳过（12-data §3.12 兼容注意 ③）。 */
  function append(chatKey, { userId, name, content }) {
    const members = ensureChat(chatKey);
    const file = memberFileName(userId, name);
    const m = members.get(file) ?? { userId: String(userId ?? ''), name: String(name ?? ''), impressions: [], updatedAt: 0, lastConsolidatedAt: 0 };
    const text = String(content ?? '').slice(0, CONTENT_MAX);
    if (m.impressions.some((x) => x.content === text)) return { ok: true, deduped: true }; // 同名去重
    m.impressions.push({ content: text, createdAt: Date.now() }); // 升序维护
    m.updatedAt = Date.now();
    if (userId && /^\d+$/.test(userId)) m.userId = String(userId);
    if (name) m.name = String(name);
    members.set(file, m);
    persist(chatKey, file, m);
    return { ok: true, deduped: false };
  }

  function remove(chatKey, { userId, name, content }) {
    const members = ensureChat(chatKey);
    const file = memberFileName(userId, name);
    const m = members.get(file);
    if (!m) return { ok: false, error: '没有这个人的记忆' };
    if (content) {
      const before = m.impressions.length;
      m.impressions = m.impressions.filter((x) => x.content !== String(content));
      if (m.impressions.length === before) return { ok: false, error: '没有这条记忆' };
      if (m.impressions.length === 0) {
        members.delete(file);
        try { fs.unlinkSync(path.join(chatDirOf(chatKey), file)); } catch { /* 尽力 */ }
      } else {
        m.updatedAt = Date.now();
        persist(chatKey, file, m);
      }
      return { ok: true, removed: before - m.impressions.length };
    }
    members.delete(file);
    try { fs.unlinkSync(path.join(chatDirOf(chatKey), file)); } catch { /* 尽力 */ }
    return { ok: true, removed: m.impressions.length };
  }

  /** 查询：降序返回（升序维护——顺序有语义，12-data 兼容注意 ②）。 */
  function query(chatKey, { userId, name } = {}) {
    const members = ensureChat(chatKey);
    if (userId || name) {
      const file = memberFileName(userId, name);
      const m = members.get(file);
      return m ? [{ ...m, impressions: [...m.impressions].reverse() }] : [];
    }
    return recentMembers(members).map((m) => ({ ...m, impressions: [...m.impressions].reverse() }));
  }

  /** 提示词段（06b §7.2）：【对群友的印象】每条 - <who>：<印象>；每成员最近 3 条、最多 15 成员。 */
  function formatForPrompt(chatKey, { userIds } = {}) {
    const members = ensureChat(chatKey);
    // Empty members remain queryable/countable, but cannot consume one of the
    // fifteen prompt slots ahead of a member with actual impressions.
    let list = recentMembers(members).filter((member) => member.impressions.length > 0);
    if (Array.isArray(userIds) && userIds.length > 0) {
      const wanted = new Set(userIds.map(String));
      list = list.filter((m) => wanted.has(String(m.userId)) || wanted.has(m.name));
    }
    list = list.slice(0, PROMPT_MEMBERS_MAX);
    if (list.length === 0) return '';
    const notes = (typeof cfg === 'function' ? cfg() : cfg)?.memberNotes ?? {};
    const lines = ['【对群友的印象】'];
    for (const m of list) {
      const who = notes[String(m.userId ?? '')] || m.name || m.userId || '未知';
      const tail = m.impressions.slice(-PROMPT_IMPRESSIONS_MAX);
      if (tail.length === 0) continue;
      for (const imp of tail) lines.push(`- ${who}：${imp.content}`);
    }
    return lines.length > 1 ? lines.join('\n') : '';
  }

  function stats(chatKey) {
    const members = ensureChat(chatKey);
    let total = 0;
    let maxPer = 0;
    for (const m of members.values()) {
      total += m.impressions.length;
      maxPer = Math.max(maxPer, m.impressions.length);
    }
    return { members: members.size, totalImpressions: total, maxPerMember: maxPer };
  }

  function markConsolidated(chatKey) {
    const dir = chatDirOf(chatKey);
    try {
      fs.mkdirSync(dir, { recursive: true });
      atomicWrite(path.join(dir, '_meta.json'), { lastConsolidatedAt: Date.now() });
    } catch { /* 尽力 */ }
  }

  function lastConsolidatedAt(chatKey) {
    const meta = readJsonSafe(path.join(chatDirOf(chatKey), '_meta.json'), null);
    return meta?.lastConsolidatedAt ?? 0;
  }

  function replaceMember(chatKey, { userId, name, impressions }) {
    const members = ensureChat(chatKey);
    const file = memberFileName(userId, name);
    const m = {
      userId: String(userId ?? ''), name: String(name ?? ''),
      impressions: (impressions ?? []).slice(0, 20).map((x) => ({
        content: String(x.content ?? x).trim().slice(0, CONTENT_MAX),
        createdAt: x.createdAt ?? Date.now(),
      })).filter((x) => x.content),
      updatedAt: Date.now(), lastConsolidatedAt: Date.now(),
    };
    if (!persist(chatKey, file, m)) return null;
    members.set(file, m);
    return { ...m, impressions: [...m.impressions].reverse() };
  }

  function removeMember(chatKey, userId) {
    const id = String(userId ?? '');
    if (!/^\d{1,15}$/.test(id)) return false;
    return remove(chatKey, { userId: id }).ok;
  }

  function clearChat(chatKey) {
    const members = ensureChat(chatKey);
    members.clear();
    try { fs.rmSync(chatDirOf(chatKey), { recursive: true, force: true }); } catch { /* 尽力 */ }
    try { fs.mkdirSync(chatDirOf(chatKey), { recursive: true }); } catch { /* 尽力 */ }
    return true;
  }

  function listFiles() {
    const keys = new Set(chats.keys());
    try {
      for (const name of fs.readdirSync(root)) {
        const m = name.match(/^(group|private)_(\d+)(?:\.json)?$/);
        if (m) keys.add(`${m[1]}:${m[2]}`);
      }
    } catch { /* 空目录 */ }
    return [...keys].map((chatKey) => {
      const members = ensureChat(chatKey);
      let impressionCount = 0;
      let updatedAt = 0;
      for (const member of members.values()) {
        impressionCount += member.impressions?.length ?? 0;
        updatedAt = Math.max(updatedAt, Number(member.updatedAt) || 0);
      }
      return { chatKey, impressionCount, memberCount: members.size, updatedAt };
    }).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return { append, remove, query, formatForPrompt, stats, markConsolidated, lastConsolidatedAt, replaceMember, removeMember, clearChat, listFiles };
}


// Old import path remains compatible; model workflow belongs to the provider.
export { createMemoryConsolidator, extractJsonObject } from '../../bundled/memory-service/consolidator.js';

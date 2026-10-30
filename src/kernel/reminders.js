// ReminderStore：data/reminders.json（{reminders:[]} 结构）。
// 契约：notes/12-data.md §3.16（id 规则 / fired 语义 / prune 保留 200 / 原子写）。
import fs from 'node:fs';
import path from 'node:path';

function readJsonSafe(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch { return fallback; }
}

export function createReminderStore({ dataDir, log = console } = {}) {
  const file = path.join(dataDir, 'reminders.json');

  function load() {
    const data = readJsonSafe(file, null);
    return Array.isArray(data?.reminders) ? data.reminders : [];
  }

  function save(reminders) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ reminders }, null, 2), 'utf8');
    fs.renameSync(tmp, file); // 原子写
  }

  function newId() {
    return `r_${Date.now().toString(36)}${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
  }

  function add({ chatKey, text, dueAt, createdBy = '' }) {
    const list = load();
    const r = { id: newId(), chatKey, text, dueAt, createdAt: Date.now(), createdBy, fired: false };
    list.push(r);
    save(list);
    return r;
  }

  // due/pending 都重新排序（数组顺序无语义）——12-data §3.16 兼容注意 ②
  function due(nowMs = Date.now()) {
    return load().filter((r) => !r.fired && Number(r.dueAt) <= nowMs).sort((a, b) => a.dueAt - b.dueAt);
  }

  function pending(chatKey) {
    return load().filter((r) => !r.fired && (!chatKey || r.chatKey === chatKey)).sort((a, b) => a.dueAt - b.dueAt);
  }

  function markFired(id) {
    const list = load();
    const r = list.find((x) => x.id === id);
    if (!r) return false;
    r.fired = true;
    r.firedAt = Date.now();
    save(prune(list));
    return true;
  }

  function cancel(id) {
    const list = load();
    const idx = list.findIndex((x) => x.id === id && !x.fired);
    if (idx < 0) return false;
    list.splice(idx, 1);
    save(list);
    return true;
  }

  function updatePendingTexts(id, texts) {
    const list = load();
    const item = list.find((r) => r.id === id && !r.fired);
    if (!item) return false;
    item.pendingTexts = texts.map(String);
    save(list);
    return true;
  }

  // prune：已触发按 firedAt 降序保留最近 200，未触发全保留（只在有 due 时跑）
  function prune(list) {
    const pendingList = list.filter((r) => !r.fired);
    const fired = list.filter((r) => r.fired).sort((a, b) => (b.firedAt ?? 0) - (a.firedAt ?? 0)).slice(0, 200);
    return [...pendingList, ...fired];
  }

  return { load, add, due, pending, markFired, cancel, updatePendingTexts, prune: () => save(prune(load())) };
}

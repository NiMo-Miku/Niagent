// migrator：0.4 data/ 导入器（D-4 六类只读导入，目标空 + detect 双闸）。
// 保留应用配置、记忆、表情库、提醒和聊天记录；外部协议端独立管理。
// 登录配置独立复制到新运行时，不复用会回写旧安装的目录；未具备双侧版本证据则 manual。
// 可弃：sessions/*.json（用量统计从迁移点起算）。0.4 目录只读，永不回写。
import fs from 'node:fs';
import path from 'node:path';

const OBSOLETE_KEYS = [
  ['api', 'stream'], ['api', 'priceRemoteUrl'], ['budget'], ['providersImported'],
  ['store', 'atCount'], ['store', 'keywordCount'], ['store', 'randomCount'], ['store', 'allCount'],
  ['store', 'peakSchedule', 'valley', 'start'], ['store', 'peakSchedule', 'valley', 'end'],
];
// 派生标记（hasXxx）不迁移
const DERIVED_RE = /^has[A-Z][A-Za-z0-9]*$/;

function stripKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const k of Object.keys(out)) {
    if (DERIVED_RE.test(k)) { delete out[k]; continue; }
    out[k] = stripKeys(out[k]);
  }
  return out;
}

function stripObsolete(obj) {
  const o = stripKeys(obj);
  for (const p of OBSOLETE_KEYS) {
    let cur = o;
    let ok = true;
    for (let i = 0; i < p.length - 1; i++) {
      cur = cur?.[p[i]];
      if (!cur || typeof cur !== 'object') { ok = false; break; }
    }
    if (ok && cur) delete cur[p[p.length - 1]];
  }
  return o;
}

function readJsonSafe(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch { return fallback; }
}

function atomicWrite(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function cpDir(src, dst, { count = { files: 0, bytes: 0 }, dryRun = false } = {}) {
  count.errors ??= [];
  try {
    if (fs.lstatSync(src).isSymbolicLink()) throw new Error('不支持迁移符号链接目录');
    if (!dryRun) fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name);
      const d = path.join(dst, e.name);
      if (e.isDirectory()) cpDir(s, d, { count, dryRun });
      else if (e.isFile()) {
        try {
          const size = fs.statSync(s).size;
          if (!dryRun) fs.copyFileSync(s, d);
          count.files += 1;
          count.bytes += size;
        } catch (err) {
          count.errors.push({ source: s, target: d, reason: String(err?.message ?? err) });
        }
      } else {
        count.errors.push({ source: s, target: d, reason: '不支持迁移符号链接或特殊文件' });
      }
    }
  } catch (err) {
    count.errors.push({ source: src, target: dst, reason: String(err?.message ?? err) });
  }
  return count;
}

function targetEmpty(targetDataDir) {
  try {
    if (fs.existsSync(path.join(targetDataDir, 'config.json'))) return false;
    if (!fs.existsSync(targetDataDir)) return true;
    if (fs.lstatSync(targetDataDir).isSymbolicLink()) return false;
    const empty = (dir) => fs.readdirSync(dir, { withFileTypes: true }).every(item => item.isDirectory() && !item.isSymbolicLink() && empty(path.join(dir, item.name)));
    const bootLogs = dir => fs.readdirSync(dir, { withFileTypes: true }).every(item => item.isFile() && !item.isSymbolicLink() && item.name.endsWith('.log'));
    return fs.readdirSync(targetDataDir, { withFileTypes: true }).every(item => ['qq-agent.lock', 'boot-diag.log'].includes(item.name) && item.isFile() || item.name === 'logs' && item.isDirectory() && !item.isSymbolicLink() && bootLogs(path.join(targetDataDir, item.name)) || item.isDirectory() && !item.isSymbolicLink() && empty(path.join(targetDataDir, item.name)));
  } catch { return false; }
}
const nestedPath = (target, root) => { const rel = path.relative(root, target); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };
function plainTarget(target) {
  try {
    let ancestor = target;
    while (!fs.existsSync(ancestor)) { const next = path.dirname(ancestor); if (next === ancestor) return false; ancestor = next; }
    return !fs.lstatSync(ancestor).isSymbolicLink() && path.relative(ancestor, fs.realpathSync(ancestor)) === '';
  } catch { return false; }
}
function sourceSafe(source, target) {
  try {
    if (!plainTarget(target)) return false;
    if (path.relative(source, fs.realpathSync(source)) !== '' || fs.lstatSync(source).isSymbolicLink()) return false;
    const file = path.join(source, 'config.json');
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) return false;
    return !nestedPath(target, source) && !nestedPath(source, target);
  } catch { return false; }
}
export function detectMigrationSource(targetDataDir, explicitSource = null) {
  // detect + selfDataEmpty 双闸
  if (typeof targetDataDir !== 'string' || !targetDataDir.trim()) return { eligible: false, reason: '目标 data 路径无效' };
  const selfEmpty = plainTarget(path.resolve(targetDataDir)) && targetEmpty(path.resolve(targetDataDir));
  if (!selfEmpty) return { eligible: false, reason: '目标 data/ 非空' };
  const candidates = [];
  if (explicitSource) {
    const source = path.resolve(explicitSource);
    return sourceSafe(source, path.resolve(targetDataDir)) ? { eligible: true, source, reason: '显式指定' } : { eligible: false, reason: '显式源不存在、包含链接或与目标重合' };
  }
  // 常见 0.4 落点
  candidates.push(path.resolve(targetDataDir, '..', '0.4', 'data'));
  candidates.push(path.resolve(targetDataDir, '..', 'data'));
  candidates.push(path.join(process.env.APPDATA ?? '', 'qq-agent', 'data'));
  for (const c of candidates) {
    if (c && sourceSafe(path.resolve(c), path.resolve(targetDataDir))) {
      return { eligible: true, source: path.resolve(c), reason: explicitSource ? '显式指定' : '自动探测' };
    }
  }
  return { eligible: false, reason: '未发现 0.4 数据目录' };
}

export function migrateFrom04({ source, targetDataDir, log = console, dryRun = false } = {}) {
  const report = { source, target: targetDataDir, at: new Date().toISOString(), sections: {}, errors: [], dryRun: !!dryRun };
  if (typeof source !== 'string' || !source.trim() || typeof targetDataDir !== 'string' || !targetDataDir.trim()) return { ...report, ok: false, requiresAction: true, eligible: false, sections: { preflight: { ok: false, requiresAction: true, status: 'blocked', note: '源或目标 data 路径无效' } } };
  const src = path.resolve(source);
  const target = path.resolve(targetDataDir);
  if (!sourceSafe(src, target) || !targetEmpty(target)) {
    return { ...report, ok: false, requiresAction: true, eligible: false, sections: { preflight: { ok: false, requiresAction: true, status: 'blocked', note: '源/目标路径不安全或目标 data 非空，未覆盖任何现有数据' } } };
  }
  if (!dryRun) fs.mkdirSync(targetDataDir, { recursive: true });

  // ① config.json（键迁移/废弃键剔除/派生标记丢弃/未知键忽略由 config.load 兜底）
  try {
    const raw = readJsonSafe(path.join(src, 'config.json'), null);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const cleaned = stripObsolete(stripKeys(raw));
      delete cleaned.$schema;
      if (!dryRun) atomicWrite(path.join(targetDataDir, 'config.json'), cleaned);
      report.sections.config = { ok: true, note: `已导入（废弃键剔除，派生标记丢弃）` };
    } else {
      report.sections.config = { ok: false, note: '源 config.json 缺失或损坏' };
    }
  } catch (err) { report.sections.config = { ok: false, note: String(err?.message) }; }

  // ② messages/（聊天记录整目录复制）
  try {
    const srcMsgs = path.join(src, 'messages');
    if (fs.existsSync(srcMsgs)) {
      const c = { files: 0, bytes: 0 };
      cpDir(srcMsgs, path.join(targetDataDir, 'messages'), { count: c, dryRun });
      report.sections.messages = { ...c, ok: c.errors.length === 0 };
    } else report.sections.messages = { ok: true, note: '无消息存档' };
  } catch (err) { report.sections.messages = { ok: false, note: String(err?.message) }; }

  // ③ memory/（含旧版单文件自动拆分——0.4 旧格式 <chatKey>.json 与成员目录并存）
  try {
    const srcMem = path.join(src, 'memory');
    if (fs.existsSync(srcMem)) {
      const c = { files: 0, bytes: 0 };
      cpDir(srcMem, path.join(targetDataDir, 'memory'), { count: c, dryRun });
      report.sections.memory = { ...c, ok: c.errors.length === 0, note: '旧版单文件由 memory 模块首次访问时自动拆分' };
    } else report.sections.memory = { ok: true, note: '无记忆' };
  } catch (err) { report.sections.memory = { ok: false, note: String(err?.message) }; }

  // ④ stickers.json + sticker-images/
  try {
    const c = { files: 0, bytes: 0 };
    const sj = path.join(src, 'stickers.json');
    if (fs.existsSync(sj)) {
      if (!dryRun) fs.copyFileSync(sj, path.join(targetDataDir, 'stickers.json'));
      c.files += 1; c.bytes += fs.statSync(sj).size;
    }
    const si = path.join(src, 'sticker-images');
    if (fs.existsSync(si)) {
      cpDir(si, path.join(targetDataDir, 'sticker-images'), { count: c, dryRun });
    }
    report.sections.stickers = { ...c, ok: (c.errors?.length ?? 0) === 0 };
  } catch (err) { report.sections.stickers = { ok: false, note: String(err?.message) }; }

  // ⑤ reminders.json
  try {
    const rf = path.join(src, 'reminders.json');
    if (fs.existsSync(rf)) {
      const data = readJsonSafe(rf, null);
      if (!Array.isArray(data?.reminders)) throw new Error('源 reminders.json 损坏或 reminders 不是数组');
      const pending = data.reminders.filter((r) => !r.fired);
      if (!dryRun && Array.isArray(data?.reminders)) {
        atomicWrite(path.join(targetDataDir, 'reminders.json'), { reminders: data.reminders });
      }
      report.sections.reminders = { ok: true, total: data?.reminders?.length ?? 0, pending: pending.length };
    } else report.sections.reminders = { ok: true, note: '无提醒' };
  } catch (err) { report.sections.reminders = { ok: false, note: String(err?.message) }; }

  // sessions/*.json 可弃（D-4）：只记录条数
  try {
    const ss = path.join(src, 'sessions');
    if (fs.existsSync(ss)) {
      const files = fs.readdirSync(ss).filter((f) => f.endsWith('.json'));
      report.sections.sessions = { ok: true, note: `可弃：共 ${files.length} 个会话文件，用量统计从迁移点起算（installId 仍沿用）`, count: files.length };
    }
  } catch { /* 尽力 */ }

  // telemetry installId 沿用（DSH §10.4）
  try {
    const tj = path.join(src, 'telemetry.json');
    const tel = fs.existsSync(tj) ? readJsonSafe(tj, null) : null;
    if (tel?.installId) {
      if (!dryRun) {
        fs.mkdirSync(targetDataDir, { recursive: true });
        atomicWrite(path.join(targetDataDir, 'telemetry.json'), { installId: tel.installId, createdAt: tel.createdAt ?? Date.now() });
      }
      report.sections.telemetry = { ok: true, note: 'installId 沿用（官网总览不清零）' };
    }
  } catch { /* 尽力 */ }

  for (const [section, result] of Object.entries(report.sections)) {
    if (result.errors?.length) {
      report.errors.push(...result.errors.map((error) => ({ section, ...error })));
    } else if (result.ok === false && !result.requiresAction) {
      report.errors.push({ section, reason: result.note ?? '迁移失败' });
    }
  }
  report.requiresAction = Object.values(report.sections).some((result) => result.requiresAction);
  report.ok = report.errors.length === 0 && !report.requiresAction;
  if (!dryRun) {
    fs.mkdirSync(targetDataDir, { recursive: true });
    atomicWrite(path.join(targetDataDir, 'migration-report.json'), report);
  }
  return report;
}

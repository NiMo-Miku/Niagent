// 分级日志：内存环 + 按天落盘 + 7 天保留 + bus/SSE 推送。
// 出处：SPEC §17.1（500 条环形缓冲 / 7 天日志保留）；prune 只在启动（0.4 行为，SUSPECT 复刻：
// 运行期不删过期日志文件）；setLevel 非法值不报错（notes/09b R-89：非法级别保持原级别返回 200）。
import fs from 'node:fs';
import path from 'node:path';
import { createLogPolicy } from './log-policy.js';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const RING_MAX = 500;          // SPEC §17.1：应用日志环形缓冲 / atNameCache 防膨胀

export function createLogger({ dataDir, bus = null, level = 'info', mirrorConsole = true, policy = createLogPolicy() } = {}) {
  if (policy !== null && (typeof policy?.diskLine !== 'function' || typeof policy?.prepare !== 'function')) {
    throw new TypeError('日志策略必须提供同步 diskLine(entry) 和 prepare({logsDir})，或明确传入 null');
  }
  let currentLevel = LEVELS[level] ?? LEVELS.info;
  const ring = [];
  let writesEnabled = true, recording = false;
  const logsDir = dataDir ? path.join(dataDir, 'logs') : null;
  try { if (logsDir) fs.mkdirSync(logsDir, { recursive: true }); }
  catch { /* disk preparation reports the failure; ring/bus remain usable */ }

  // Startup only: selected policy owns retention/large-file preparation.
  let startupMaintenance = null;
  const synchronous = (value, name) => {
    if (value && typeof value.then === 'function') {
      Promise.resolve(value).catch(() => {});
      throw new TypeError(`${name} 必须同步完成`);
    }
    return value;
  };
  try { if (logsDir && policy) startupMaintenance = synchronous(policy.prepare({ logsDir }), 'prepare'); }
  catch (error) { startupMaintenance = { failed: [{ file: '.', error: String(error.message) }] }; }

  const logFile = () => path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);

  function append(line) {
    // Do not follow a symlink or open a pipe/device, including during ordinary
    // daily appends. Hardlinks are skipped rather than mutating another name.
    const directory = fs.lstatSync(logsDir);
    if (!directory.isDirectory() || directory.isSymbolicLink()) return;
    const file = logFile();
    let stat;
    try { stat = fs.lstatSync(file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)) return;
    const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT
      | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0), 0o600);
    try {
      const opened = fs.fstatSync(fd), current = fs.lstatSync(file);
      if (!opened.isFile() || opened.nlink !== 1 || current.isSymbolicLink()
        || current.dev !== opened.dev || current.ino !== opened.ino) return;
      fs.writeFileSync(fd, line);
    } finally { fs.closeSync(fd); }
  }

  function record(levelName, source, args) {
    if (recording || LEVELS[levelName] < currentLevel) return;
    // SDK observers and bus error reports share this closure with every child.
    // Drop synchronous reentry; a later independent call still records normally.
    recording = true;
    try {
      const text = args.map((a) => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
      }).join(' ');
      const entry = { at: new Date().toISOString(), level: levelName, src: source, msg: text };
      ring.push(entry);
      if (ring.length > RING_MAX) ring.shift();
      if (logsDir && writesEnabled) {
        try {
          const line = policy ? synchronous(policy.diskLine({ ...entry }), 'diskLine') : JSON.stringify(entry) + '\n';
          if (typeof line !== 'string') throw new TypeError('diskLine 必须同步返回字符串');
          append(line);
        } catch { /* 磁盘失败不打崩；完整记录仍留在 ring/bus */ }
      }
      if (mirrorConsole) {
        const line = `[${entry.at.slice(11, 19)}] [${levelName}] [${source}] ${text}`;
        (levelName === 'error' ? console.error : levelName === 'warn' ? console.warn : console.log)(line);
      }
      bus?.emit('log', entry);
    } finally { recording = false; }
  }

  const logger = {
    setBus(nextBus) { bus = nextBus; },
    debug: (...a) => record('debug', 'app', a),
    info: (...a) => record('info', 'app', a),
    warn: (...a) => record('warn', 'app', a),
    error: (...a) => record('error', 'app', a),
    // 分级日志自动带来源前缀（DSH §3.1 模块 2）
    child(source) {
      return {
        debug: (...a) => record('debug', source, a),
        info: (...a) => record('info', source, a),
        warn: (...a) => record('warn', source, a),
        error: (...a) => record('error', source, a),
      };
    },
    // R-89 契约：非法级别不报错（保持原级别）；返回生效级别。
    // SUSPECT 复刻（notes/09b R-89）：只改内存不落盘，重启回 info。
    setLevel(name) {
      if (typeof name === 'string' && Object.hasOwn(LEVELS, name)) currentLevel = LEVELS[name];
      return Object.keys(LEVELS).find((k) => LEVELS[k] === currentLevel);
    },
    get level() {
      return Object.keys(LEVELS).find((k) => LEVELS[k] === currentLevel);
    },
    // 按级别过滤读环形缓冲（GET /api/logs；级别过滤立即生效——R-89）
    recent({ n = 200, minLevel = 'debug' } = {}) {
      const min = LEVELS[minLevel] ?? LEVELS.debug;
      const out = [];
      for (let i = ring.length - 1; i >= 0 && out.length < n; i--) {
        if (LEVELS[ring[i].level] >= min) out.push(ring[i]);
      }
      return out.reverse();
    },
    flush() { /* synchronous append 已即时落盘，无缓冲需要刷 */ },
    // Child loggers share this closure; late callbacks cannot append after a
    // host reset has frozen its snapshot. Ordinary shutdown is unchanged.
    stopWrites() { writesEnabled = false; },
    get startupMaintenance() { return structuredClone(startupMaintenance); },
  };
  // A failure report must not itself append to the original file whose
  // preparation failed (including today's file). Ring/console remain visible.
  writesEnabled = false;
  try {
    for (const failure of startupMaintenance?.failed ?? []) {
      logger.warn(`[logger] 启动整理失败，原日志文件未替换：${failure.file}：${failure.error}`);
    }
  } finally { writesEnabled = true; }
  return logger;
}

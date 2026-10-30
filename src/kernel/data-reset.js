// Host-only two-phase reset. No plugin capability exposes this coordinator.
// Chromium owns files below electron-user-data until the process exits. Keep the
// entire old directory intact until the next process can remove it safely.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const RECEIPT = '.qq-agent-reset-backup.json';
const pendingFile = (dataDir) => `${path.resolve(dataDir)}.reset-pending.json`;
const samePath = (a, b) => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
  : path.resolve(a) === path.resolve(b);
const failure = (message, status = 500) => Object.assign(new Error(message), { expose: true, status, code: 'DATA_RESET' });

export function assertResettableDataDir(dataDir, { existsSync = fs.existsSync, resolve = path.resolve, parse = path.parse, basename = path.basename, join = path.join } = {}) {
  const resolved = resolve(dataDir ?? '');
  if (resolved === parse(resolved).root || (!basename(resolved).toLowerCase().startsWith('data') && !existsSync(join(resolved, 'config.json')))) {
    throw failure(`数据目录不像 QQ Agent 数据目录，已拒绝重置：${resolved}`, 400);
  }
  return resolved;
}

export function backupDataDir(dataDir, { cpSync = fs.cpSync, existsSync = fs.existsSync, now = () => new Date() } = {}) {
  if (!dataDir || !existsSync(dataDir)) return null;
  const backup = `${dataDir}.backup-${now().toISOString().replace(/[:.]/g, '-')}`;
  cpSync(dataDir, backup, { recursive: true, force: false, filter: source => !samePath(source, path.join(dataDir, 'qq-agent.lock')) });
  return backup;
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}
function checkedDirectory(dir, fsImpl) {
  if (!fsImpl.existsSync(dir) || !fsImpl.statSync(dir).isDirectory() || !samePath(fsImpl.realpathSync(dir), dir)) throw failure('重置路径不是独立的真实目录');
}
function inventory(dir, fsImpl) {
  const entries = [];
  function scan(current) {
    for (const name of fsImpl.readdirSync(current).sort()) {
      if (current === dir && name === RECEIPT) continue;
      const file = path.join(current, name), stat = fsImpl.lstatSync(file);
      const relative = path.relative(dir, file).split(path.sep).join('/');
      if (stat.isSymbolicLink()) entries.push([relative, 'link', fsImpl.readlinkSync(file)]);
      else if (stat.isDirectory()) { entries.push([relative, 'dir']); scan(file); }
      else if (stat.isFile()) entries.push([relative, 'file', stat.size, createHash('sha256').update(fsImpl.readFileSync(file)).digest('hex')]);
      else throw failure('备份包含无法验证的文件类型');
    }
  }
  scan(dir);
  return entries;
}
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Called before any config, log, warehouse or Electron userData is opened. */
export function completePendingDataReset({ dataDir, defaults, fsImpl = fs, isProcessAlive = processAlive } = {}) {
  const resolved = path.resolve(dataDir ?? ''), marker = pendingFile(resolved);
  if (!fsImpl.existsSync(marker)) return { completed: false };
  // This lock lives outside the directory being removed. Never let two new
  // processes consume the same marker and delete each other's fresh stores.
  const claim = marker + '.claim';
  let claimed = false;
  try {
    const fd = fsImpl.openSync(claim, 'wx');
    claimed = true;
    try { fsImpl.writeSync(fd, String(process.pid)); } finally { fsImpl.closeSync(fd); }
  } catch (error) {
    if (claimed) { try { fsImpl.rmSync(claim, { force: true }); } catch { /* fail closed on an undeletable claim */ } }
    throw failure(`待重置清理锁无法独占，已拒绝启动并保留备份与标记：${error.message}。若是崩溃遗留锁，请先确认其进程已退出，再由管理员移除 ${claim}`);
  }
  let pending;
  try {
    if (!fsImpl.existsSync(marker)) return { completed: false };
    if (!fsImpl.lstatSync(marker).isFile() || fsImpl.lstatSync(marker).isSymbolicLink()) throw failure('待重置标记必须为普通文件');
    pending = JSON.parse(fsImpl.readFileSync(marker, 'utf8'));
    const suffix = pending?.backupDir?.slice(resolved.length + '.backup-'.length);
    if (resolved === path.parse(resolved).root || pending.version !== 1 || pending.state !== 'prepared' || !samePath(pending.dataDir, resolved)
      || !Number.isInteger(pending.pid) || pending.pid <= 0 || !/^[a-f0-9]{32}$/.test(pending.nonce ?? '')
      || typeof pending.backupDir !== 'string' || !pending.backupDir.startsWith(resolved + '.backup-')
      || !samePath(path.dirname(pending.backupDir), path.dirname(resolved))
      || !/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/.test(suffix ?? '')) throw failure('待重置标记无效或不属于此数据目录');
    checkedDirectory(pending.backupDir, fsImpl);
    const receipt = JSON.parse(fsImpl.readFileSync(path.join(pending.backupDir, RECEIPT), 'utf8'));
    if (receipt.version !== 1 || receipt.state !== 'prepared' || receipt.backupDir !== pending.backupDir || receipt.dataDir !== pending.dataDir || receipt.pid !== pending.pid || receipt.nonce !== pending.nonce
      || receipt.digest !== pending.digest || digest(inventory(pending.backupDir, fsImpl)) !== pending.digest) throw failure('待重置备份校验失败');
    // A released lock alone is insufficient: a late callback in the previous
    // process must never recreate files after the new process clears them.
    if (isProcessAlive(pending.pid)) throw failure('提交重置的旧进程仍在运行，请彻底退出应用后重新打开');
    if (fsImpl.existsSync(resolved)) {
      checkedDirectory(resolved, fsImpl);
      const lock = path.join(resolved, 'qq-agent.lock');
      if (fsImpl.existsSync(lock)) {
        const owner = Number(fsImpl.readFileSync(lock, 'utf8').trim());
        if (!Number.isInteger(owner) || owner !== pending.pid || isProcessAlive(owner)) throw failure('数据目录实例锁与待重置进程不一致，已拒绝清理');
      }
    }
    if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) throw failure('缺少受信的初始配置');
    fsImpl.rmSync(resolved, { recursive: true, force: true });
    fsImpl.mkdirSync(resolved, { recursive: true });
    const file = path.join(resolved, 'config.json');
    fsImpl.writeFileSync(file + '.tmp', JSON.stringify(defaults, null, 2), 'utf8');
    fsImpl.renameSync(file + '.tmp', file);
    fsImpl.rmSync(marker, { force: true });
    return { completed: true, backupDir: pending.backupDir };
  } catch (error) {
    throw failure(`待重置清理未完成，已保留备份与标记并拒绝启动：${error.message}`);
  } finally {
    if (claimed) fsImpl.rmSync(claim, { force: true });
  }
}

export function createDataResetCoordinator({ dataDir, quiesce, log = console, fsImpl = fs, now = () => new Date() } = {}) {
  let phase = 'idle', result = null, request = null;
  const assertWritable = () => { if (phase !== 'idle') throw failure('当前实例已暂停并等待重启，禁止继续写入业务数据', 409); };
  const canConfigure = () => phase === 'idle' || phase === 'failed';
  async function prepare() {
    const resolved = assertResettableDataDir(dataDir, { existsSync: fsImpl.existsSync });
    checkedDirectory(resolved, fsImpl);
    phase = 'preparing';
    try {
      await quiesce();
      const nonce = randomBytes(16).toString('hex');
      const backupDir = `${resolved}.backup-${now().toISOString().replace(/[:.]/g, '-')}-${nonce.slice(0, 8)}`;
      fsImpl.cpSync(resolved, backupDir, { recursive: true, force: false, filter: source => !samePath(source, path.join(resolved, 'qq-agent.lock')) });
      checkedDirectory(backupDir, fsImpl);
      const pending = { version: 1, state: 'prepared', dataDir: resolved, backupDir, pid: process.pid, nonce, digest: digest(inventory(backupDir, fsImpl)) };
      fsImpl.writeFileSync(path.join(backupDir, RECEIPT), JSON.stringify(pending, null, 2), { flag: 'wx' });
      const marker = pendingFile(resolved), tmp = `${marker}.tmp-${nonce}`;
      if (fsImpl.existsSync(marker)) throw failure('数据目录已有待重置任务');
      fsImpl.writeFileSync(tmp, JSON.stringify(pending, null, 2), { flag: 'wx' });
      fsImpl.renameSync(tmp, marker);
      phase = 'accepted';
      result = { ok: true, resetAccepted: true, resetCompleted: false, restartRequired: true, backupDir,
        message: `已备份并提交重置（备份：${backupDir}），请彻底退出并重新打开应用以完成全部数据清理；刷新页面不能完成重置` };
      return result;
    } catch (error) {
      phase = 'failed';
      log.error?.(`[reset] 提交失败：${error.message}`);
      throw failure(`重置未提交，原数据未删除：${error.message}。当前实例业务已暂停，请重启恢复`);
    }
  }
  return {
    request() { if (result) return Promise.resolve(result); if (request) return request; request = prepare().finally(() => { request = null; }); return request; },
    assertWritable, canConfigure,
    status: () => ({ phase, restartRequired: phase !== 'idle', resetAccepted: phase === 'accepted', resetCompleted: false, ...(result ? { backupDir: result.backupDir, message: result.message } : {}) }),
    apiGuard({ method, pathname }) {
      if (phase === 'idle') return null;
      pathname = pathname.replace(/\/$/, '');
      // GET is not synonymous with readonly: model/update/chat metadata reads
      // may fetch or populate caches. Only known in-memory/local views survive.
      const readOnly = new Set(['/api/version', '/api/status', '/api/events', '/api/config', '/api/panels', '/api/logs', '/api/skills',
        '/api/skills/capabilities', '/api/tools', '/api/tools/availability', '/api/tools/conflicts', '/api/sessions', '/api/providers']);
      if (method === 'GET' && (readOnly.has(pathname) || /^\/api\/sessions\/[A-Za-z0-9_-]+$/.test(pathname))) return null;
      if (pathname === '/api/reset-data' && method === 'POST') return null;
      if (phase === 'failed' && ['/api/config', '/api/config/lifecycle', '/api/config/lifecycle/open'].includes(pathname) && method === 'POST') return null;
      return { status: 409, body: { ok: false, error: '当前实例已暂停并等待重启，禁止继续写入；请彻底退出再打开应用', restartRequired: true } };
    },
  };
}

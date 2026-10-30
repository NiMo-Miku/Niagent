import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const prefix = 'qq-agent.lock.claim-';
const claimName = /^qq-agent\.lock\.claim-([1-9]\d*)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const pause = new Int32Array(new SharedArrayBuffer(4));
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

// Every acquisition, including normal first creation, enters this short
// filesystem transaction. Unique claims are never reused, so removing an
// exited claimant cannot unlink a replacement guard (the stale-lock ABA bug).
// Published tickets order concurrent live claimants; a new arrival chooses a
// later ticket. An empty/partial live claim is still choosing and must be waited
// for. A process that exits at any point leaves a recoverable unique claim.
export function withInstanceLockTransaction(dataDir, action) {
  const own = `${prefix}${process.pid}-${randomUUID()}`;
  const file = path.join(dataDir, own);
  let fd = fs.openSync(file, 'wx');
  const scan = () => {
    const rows = [];
    for (const name of fs.readdirSync(dataDir)) {
      if (name === own || !name.startsWith(prefix)) continue;
      const parsed = claimName.exec(name);
      if (!parsed) throw new Error('实例锁恢复记录无效，已拒绝并行启动');
      const other = path.join(dataDir, name);
      try {
        const stat = fs.lstatSync(other);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('实例锁恢复记录不是普通文件');
        const pid = Number(parsed[1]);
        if (!Number.isSafeInteger(pid)) throw new Error('实例锁恢复进程号无效');
        if (!alive(pid)) { fs.rmSync(other, { force: true }); continue; }
        const content = fs.readFileSync(other, 'utf8');
        const ticket = /^[1-9]\d*$/.test(content) ? Number(content) : 0;
        if (!Number.isSafeInteger(ticket)) throw new Error('实例锁恢复序号无效');
        rows.push({ name, ticket });
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return rows;
  };
  try {
    const maximum = scan().reduce((value, row) => Math.max(value, row.ticket), 0);
    if (maximum >= Number.MAX_SAFE_INTEGER) throw new Error('实例锁恢复序号已超出范围');
    const ticket = maximum + 1;
    fs.writeSync(fd, String(ticket));
    fs.closeSync(fd); fd = null;
    // Startup only: no timer or background watcher survives this operation.
    const deadline = performance.now() + 2000;
    for (;;) {
      const blocked = scan().some(row => row.ticket === 0 || row.ticket < ticket || (row.ticket === ticket && row.name < own));
      if (!blocked) return action();
      if (performance.now() >= deadline) throw new Error('已有实例正在运行或启动（实例锁恢复仍在进行）');
      Atomics.wait(pause, 0, 0, 5);
    }
  } finally {
    if (fd !== null) fs.closeSync(fd);
    fs.rmSync(file, { force: true });
  }
}

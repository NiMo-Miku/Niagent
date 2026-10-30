import fs from 'node:fs';
import { spawn as nodeSpawn } from 'node:child_process';
import { createDataResetCoordinator } from '../kernel/data-reset.js';
export { assertResettableDataDir, backupDataDir } from '../kernel/data-reset.js';

export function unavailable(feature, message = `${feature} 尚未配置，当前无法执行`) {
  const error = new Error(message);
  error.expose = true;
  error.status = 503;
  error.code = 'UNAVAILABLE';
  throw error;
}

/**
 * Standalone compatibility. Production supplies its private kernel coordinator
 * to stop all managed services and seal cached warehouses. Neither path deletes
 * a live Electron data directory: cleanup happens before the next boot opens it.
 */
export async function resetDataDir({ dataDir, orchestrator, onebot, fsImpl = fs, now }) {
  const coordinator = createDataResetCoordinator({ dataDir, fsImpl, now, quiesce: async () => {
    orchestrator?.abortAll?.();
    const closeOneBot = onebot?.close ?? onebot?.stop;
    await closeOneBot?.call(onebot);
  } });
  return coordinator.request();
}

/** R-02: launch Windows Explorer detached, preserving the exact DTO contract. */
export function openDataDir(dataDir, { spawn = nodeSpawn } = {}) {
  try {
    const child = spawn('explorer.exe', [dataDir], { detached: true, stdio: 'ignore' });
    child.unref();
    if (typeof child.once !== 'function') return { ok: true, dir: dataDir };
    return new Promise((resolve, reject) => {
      child.once('error', (err) => reject(Object.assign(new Error(err.message), { expose: true, status: 500 })));
      child.once('spawn', () => resolve({ ok: true, dir: dataDir }));
    });
  } catch (err) {
    throw Object.assign(new Error(err.message), { expose: true, status: 500 });
  }
}

export function usageUnavailable() {
  unavailable('用量统计', '用量统计服务尚未配置，无法提供统计数据');
}

/** R-90 validation: only HTTPS subdomains under aliyuncs/alicdn are accepted. */
export function assertForwardUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    const error = new Error('缺少或非法的 u 参数');
    error.expose = true;
    error.status = 400;
    throw error;
  }
  let url;
  try { url = new URL(raw); } catch {
    const error = new Error('缺少或非法的 u 参数');
    error.expose = true;
    error.status = 400;
    throw error;
  }
  const host = url.hostname;
  const allowed = /^[a-zA-Z0-9.-]+\.(aliyuncs|alicdn)\.com$/.test(host);
  if (url.protocol !== 'https:' || !allowed || url.username || url.password || host.includes(':')) {
    const error = new Error(`目标不在转发白名单（仅 https 的 aliyuncs/alicdn 域）：${host}`);
    error.expose = true;
    error.status = 403;
    throw error;
  }
  return url;
}

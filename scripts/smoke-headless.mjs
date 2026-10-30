// headless 冒烟：
// ① 跨进程：spawn src/server.js → 接口/静态/锁可用（SIGINT 优雅退出在 Windows 无法跨进程
//    投递——Node 对 Windows 子进程的信号是 TerminateProcess 模拟，不触发 handler；
//    0.4 的 Windows 优雅清理同样走 Electron before-quit，此处不强求）
// ② 同进程：createApplication → start → stop() 全清理链（锁释放 / 定时器停 / HTTP 关）
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const NODE = process.execPath;
let okCount = 0, failCount = 0;
const check = (cond, msg) => {
  if (cond) { okCount++; console.log(`  ✓ ${msg}`); }
  else { failCount++; console.error(`  ✗ ${msg}`); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- ① 跨进程：server.js 入口 ----
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-smoke-'));
const child = spawn(NODE, [path.join(ROOT, 'src', 'server.js')], {
  env: { ...process.env, QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '3987' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', (d) => { out += d; });

let up = false;
for (let i = 0; i < 30; i++) {
  await wait(500);
  try {
    const r = await fetch('http://127.0.0.1:3987/api/version', { signal: AbortSignal.timeout(1500) });
    if (r.ok) { up = true; break; }
  } catch { /* 还没起 */ }
}
check(up, 'server.js 起服务（headless 入口可用）');

if (up) {
  const ver = (await (await fetch('http://127.0.0.1:3987/api/version')).json());
  check(ver.version === '0.5.0', '/api/version → 0.5.0');
  const skills = (await (await fetch('http://127.0.0.1:3987/api/skills')).json());
  check(Array.isArray(skills.skills) && skills.skills.some((s) => s.id === 'hello' && (s.status === 'disabled' || s.code === 'disabled')),
    'hello 捆绑插件在列且默认停用');
  const home = await fetch('http://127.0.0.1:3987/');
  const html = await home.text();
  check(home.ok && html.includes('QQ Agent'), '控制台首页渲染');
  const logs = (await (await fetch('http://127.0.0.1:3987/api/logs')).json());
  check(logs.logs.length > 0, '内核日志可读');
  check(fs.existsSync(path.join(dataDir, 'qq-agent.lock')), '单实例锁文件存在');
  check(out.includes('控制台'), '就绪日志打印控制台地址（SPEC §4.3）');
}

child.kill();
await new Promise((r) => child.on('exit', r));

// ---- ② 同进程：start → stop 清理链 ----
const { pathToFileURL } = await import('node:url');
const { createApplication } = await import(pathToFileURL(path.join(ROOT, 'src', 'kernel', 'composition.js')).href);
const dataDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-smoke2-'));
const kernel = await createApplication({ env: { ...process.env, QQ_AGENT_DATA_DIR: dataDir2, QQ_AGENT_PORT: '3988' }, headless: true });
const port = await kernel.start();
check(port === 3988, `start() 返回真实端口（${port}）`);
const st = (await (await fetch(`http://127.0.0.1:${port}/api/status`)).json());
check(st.ok && st.dataDir === dataDir2, '/api/status 返回 dataDir');

await kernel.stop();
check(!fs.existsSync(path.join(dataDir2, 'qq-agent.lock')), 'stop() 释放单实例锁');
let closed = false;
try { await fetch(`http://127.0.0.1:${port}/api/version`, { signal: AbortSignal.timeout(1500) }); }
catch { closed = true; }
check(closed, 'stop() 关闭 HTTP 服务');

// 二次启动（验证锁已释放，可重启）
const kernel2 = await createApplication({ env: { ...process.env, QQ_AGENT_DATA_DIR: dataDir2, QQ_AGENT_PORT: '3988' }, headless: true });
try {
  const port2 = await kernel2.start();
  check(port2 === 3988, '锁释放后可再次启动');
  await kernel2.stop();
} catch (err) {
  check(false, `再次启动失败：${err.message}`);
}

console.log(`${failCount === 0 ? '✓' : '✗'} headless 冒烟：${okCount} 通过，${failCount} 失败`);
process.exit(failCount === 0 ? 0 : 1);

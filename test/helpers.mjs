// 测试基建：自绘 assert（0.4 风格：无测试框架，node xxx.mjs + 计数，SPEC §1.3）
let passed = 0, failed = 0;
const failures = [];
export function ok(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
}
export function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; return; }
  failed++;
  failures.push(`${msg}：期望 ${e}，实际 ${a}`);
  console.error(`  ✗ ${msg}：期望 ${e}，实际 ${a}`);
}
export function throws(fn, msg) {
  try { fn(); } catch { passed++; return; }
  failed++;
  failures.push(`${msg}：期望抛错但没抛`);
  console.error(`  ✗ ${msg}：期望抛错但没抛`);
}
export async function rejects(fn, msg) {
  try { await fn(); } catch { passed++; return; }
  failed++;
  failures.push(`${msg}：期望 reject 但没抛`);
  console.error(`  ✗ ${msg}：期望 reject 但没抛`);
}
export function section(name) { console.log(`· ${name}`); }
export function summary(name) {
  console.log(`${failed === 0 ? '✓' : '✗'} ${name}：${passed} 通过，${failed} 失败`);
  if (failed > 0) process.exitCode = 1;
  return { passed, failed, failures };
}
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export function mktmp(prefix = 'qqa-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

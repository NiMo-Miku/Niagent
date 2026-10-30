// M0 测试 runner：按序执行各测试文件，汇总结果。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const files = [
  '01-env-test.mjs',
  '02-bus-test.mjs',
  '03-config-test.mjs',
  '04-capability-test.mjs',
  '05-permissions-test.mjs',
  '06-tools-test.mjs',
  '07-scheduler-test.mjs',
  '08-loader-test.mjs',
  '09-http-test.mjs',
];

let totalPass = 0, totalFail = 0;
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join(HERE, f)], { stdio: 'inherit', timeout: 120000 });
  if (r.status !== 0) totalFail++;
  else totalPass++;
}
console.log(`\n${totalFail === 0 ? '✓ 全部通过' : '✗ 有失败'}：${totalPass}/${totalPass + totalFail} 个测试文件`);
process.exit(totalFail === 0 ? 0 : 1);

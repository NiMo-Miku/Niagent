// M2 测试 runner
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const files = [
  'run-m1.mjs',                  // M0+M1 回归
  '20-safefetch-test.mjs',
  '21-reminders-test.mjs',
  '22-stickers-test.mjs',
  '23-migrator-test.mjs',
  '24-webtools-test.mjs',
  '25-bundled-tools-test.mjs','57-sticker-qq-library-test.mjs',
];

let pass = 0, fail = 0;
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join(HERE, f)], { stdio: 'inherit', timeout: 240000 });
  if (r.status === 0) pass += 1; else fail += 1;
}
console.log(`\n${fail === 0 ? '✓ M2 全部通过' : '✗ 有失败'}：${pass}/${pass + fail} 个测试文件`);
process.exit(fail === 0 ? 0 : 1);

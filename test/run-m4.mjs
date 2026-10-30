import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = ['m4-electron-shell-test.mjs', 'm4-active-memory-test.mjs', '47-m4-active-anchor-production-test.mjs', '42-mcp-bridge-test.mjs', '43-compat-04-test.mjs', '44-m4-loader-assembly-test.mjs', '45-m4-permission-ask-test.mjs', '51-legacy-trust-test.mjs'];
let passed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(here, file)], { stdio: 'inherit', timeout: 120000 });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  else passed += 1;
}
console.log(`M4 runner：${passed}/${files.length} 个测试文件通过`);

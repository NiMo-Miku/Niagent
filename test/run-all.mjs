// Default regression entry point: console/runtime suites and the desktop/extension lifecycle suite.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let failed = false;
for (const name of ['run-m3.mjs', 'run-m4.mjs']) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], { stdio: 'inherit' });
  if (result.error) console.error(result.error);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;

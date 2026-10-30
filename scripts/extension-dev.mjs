#!/usr/bin/env node
import { checkExtension, packExtension, testExtension, TEST_NOTICE } from './lib/extension-dev.mjs';

const args = process.argv.slice(2), json = args.includes('--json');
const value = flag => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
const command = args[0], directory = args[1];
try {
  const supported = new Set(['--json', ...(command === 'pack' ? ['--out'] : command === 'test' ? ['--case'] : [])]);
  for (const argument of args.slice(2).filter(item => item.startsWith('--'))) if (!supported.has(argument)) throw new Error(`未知参数：${argument}`);
  if (!['check', 'test', 'pack'].includes(command) || !directory || directory.startsWith('--')) throw new Error('用法：node scripts/extension-dev.mjs check DIR [--json] | test DIR --case FILE [--json] | pack DIR --out FILE.zip [--json]');
  let result;
  if (command === 'check') result = checkExtension(directory);
  else if (command === 'pack') {
    if (!value('--out') || value('--out').startsWith('--')) throw new Error('pack 必须指定 --out FILE.zip');
    result = packExtension(directory, value('--out'));
  } else {
    if (!value('--case') || value('--case').startsWith('--')) throw new Error('test 必须指定 --case FILE.json');
    if (!json) process.stderr.write(`${TEST_NOTICE}\n`);
    result = await testExtension(directory, value('--case'));
  }
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'} ${command} ${result.id ?? directory}\n`);
    for (const issue of result.issues ?? result.check?.issues ?? []) process.stdout.write(`${issue.level.toUpperCase()} ${issue.code}: ${issue.message}\n`);
    for (const item of result.cases ?? []) process.stdout.write(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}\n${(item.errors ?? []).map(error => `  ${error}\n`).join('')}`);
    if (result.file) process.stdout.write(`${result.file} (${result.bytes} bytes)\n`);
    if (result.note) process.stdout.write(`${result.note}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  const result = { ok: false, command: command ?? null, error: error?.message ?? String(error) };
  process[json ? 'stdout' : 'stderr'].write(`${json ? JSON.stringify(result, null, 2) : `FAIL: ${result.error}`}\n`);
  process.exitCode = 2;
}

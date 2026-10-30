// Runs the shipped preservation helper against synthetic installation trees.
// Never invokes a delivered QQ Agent installer, registry setup, or live app.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'build', 'preserve-user-data.ps1');
const nsis = path.join(repo, 'build', 'installer.nsh');
const guardOnly = process.argv.includes('--nsis-guard-only');
let passed = 0, failed = 0;
const check = (name, run) => {
  if (guardOnly && !name.startsWith('native NSIS running-app guard ')) return;
  try { run(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
};
assert.ok(fs.existsSync(script), 'production preservation helper must exist');
check('builder integrates the production preservation include', () => {
  const config = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).build;
  assert.equal(config.nsis.include, 'build/installer.nsh');
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  const include = fs.readFileSync(nsis, 'utf8');
  assert.match(include, /!macro\s+customRemoveFiles\b/i);
  assert.match(include, /preserve-user-data\.ps1/i);
  const template = fs.readFileSync(path.join(repo, 'node_modules/app-builder-lib/templates/nsis/uninstaller.nsh'), 'utf8');
  assert.match(template, /!ifmacrodef customRemoveFiles\s+!insertmacro customRemoveFiles\s+!else[\s\S]*?RMDir \/r \$INSTDIR/);
});
check('the selected-directory preservation section precedes old uninstall and accounts for silent mode changes', () => {
  const include = fs.readFileSync(nsis, 'utf8');
  const template = fs.readFileSync(path.join(repo, 'node_modules/app-builder-lib/templates/nsis/installer.nsi'), 'utf8');
  const header = include.slice(include.indexOf('!macro customHeader'), include.indexOf('!macro customInstall'));
  assert.ok(template.indexOf('!insertmacro customHeader') >= 0 && template.indexOf('!insertmacro customHeader') < template.indexOf('Section "install"'), 'custom header sections run before the template install section');
  assert.match(header, /Section "-QQAgentPreserveUserData"/);
  assert.ok(header.indexOf('setInstallModePerAllUsers') >= 0 && header.indexOf('setInstallModePerAllUsers') < header.indexOf('StrCpy $QQAgentTargetInstallDir'), 'mode and directory must settle before taking the snapshot');
  assert.ok(header.indexOf('Call QQAgentCheckInstallRunning') >= 0 && header.indexOf('Call QQAgentCheckInstallRunning') < header.indexOf('Call QQAgentPreparePreservation'), 'configured running-app check precedes copy verification');
  assert.match(header, /QQAgentResolveOldInstallRoot SHELL_CONTEXT \$QQAgentOldInstallDir/);
  assert.match(header, /QQAgentResolveOldInstallRoot HKCU \$QQAgentAdditionalOldInstallDir/);
  const resolver = include.slice(include.indexOf('!macro QQAgentResolveOldInstallRoot'), include.indexOf('!macro customHeader'));
  assert.match(resolver, /InstallLocation/); assert.match(resolver, /UNINSTALL_REGISTRY_KEY.*UninstallString/);
  assert.match(resolver, /UNINSTALL_REGISTRY_KEY_2/); assert.match(resolver, /Call GetInQuotes/); assert.match(resolver, /Call GetFileParent/);
});
if (process.platform !== 'win32') {
  console.log('SKIP native preservation and NSIS execution: requires Windows; no installer was run');
  console.log(JSON.stringify({ test: '273-installer-user-data-preservation', passed, failed, nativeSkipped: true }));
  if (failed) process.exitCode = 1;
} else {
  const prefix = 'qq-agent-installer-preservation-';
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const withinFixture = target => {
    const absolute = path.resolve(target), relative = path.relative(fixture, absolute);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'operation must stay beneath owned fixture: ' + absolute);
    return absolute;
  };
  const write = (root, relative, value) => {
    const filename = withinFixture(path.join(root, relative));
    fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, value);
  };
  const hash = value => createHash('sha256').update(value).digest('hex');
  const tree = root => {
    const entries = {};
    if (!fs.existsSync(root)) return entries;
    const walk = (directory, relative = '') => {
      for (const name of fs.readdirSync(directory).sort()) {
        const filename = path.join(directory, name), key = relative ? relative + '/' + name : name;
        const stat = fs.lstatSync(filename);
        if (stat.isSymbolicLink()) entries[key] = { link: fs.readlinkSync(filename) };
        else if (stat.isDirectory()) { entries[key] = 'directory'; walk(filename, key); }
        else entries[key] = hash(fs.readFileSync(filename));
      }
    };
    walk(root); return entries;
  };
  const dataRoots = ['data', 'data-2', 'data-17', 'plugins', 'skills', 'overrides', 'resources/app/plugins', 'resources/app/skills', 'resources/app/overrides'];
  const retained = root => Object.fromEntries(dataRoots.map(relative => [relative, tree(path.join(root, relative))]));
  const seed = (root, label, { onlyProfile = false } = {}) => {
    fs.mkdirSync(root, { recursive: true });
    write(root, 'QQ Agent.exe', 'synthetic executable ' + label);
    write(root, 'LICENSE.electron.txt', 'synthetic Electron license ' + label);
    write(root, 'resources/app/package.json', JSON.stringify({ syntheticVersion: label }));
    write(root, 'resources/app/src/synthetic.js', 'synthetic payload ' + label);
    write(root, 'resources/app/bundled/synthetic-plugin/index.mjs', 'synthetic bundled plugin ' + label);
    if (onlyProfile) {
      write(root, 'data-17/独立账号.json', 'only profile: ' + label); return;
    }
    for (const relative of dataRoots) {
      write(root, relative + '/user-content.bin', Buffer.concat([Buffer.from('user data ' + relative + ' ' + label + '\n'), Buffer.from([0, 255, 128, 13, 10])]));
      fs.mkdirSync(withinFixture(path.join(root, relative, '空目录')), { recursive: true });
    }
    write(root, 'data-17/群成员/张 三.bin', Buffer.alloc(131073, 159));
    write(root, 'resources/app/overrides/runtime/composition.json', JSON.stringify({ id: 'fixture-custom-runtime', custom: label }));
  };
  const run = (mode, args) => {
    const command = process.env.QQ_AGENT_TEST_POWERSHELL || 'powershell.exe';
    const result = spawnSync(command, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Mode', mode, ...Object.entries(args).flatMap(([key, value]) => ['-' + key, value])], {
      encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024,
    });
    return { ...result, detail: result.error?.stack || result.stdout + result.stderr };
  };
  const ok = result => assert.equal(result.status, 0, result.detail);
  const rejected = result => assert.ok(result.status !== null && result.status !== 0, 'operation must reject: ' + result.detail);
  const paths = name => ({ root: path.join(fixture, name, '安装 目录'), backup: path.join(fixture, name, 'durable-backups'), receipt: path.join(fixture, name, 'receipt.ini') });
  const prepare = (item, oldRoot = item.root) => run('Prepare', { InstallRoot: item.root, OldRoot: oldRoot, BackupBase: item.backup, Receipt: item.receipt });
  const restore = item => run('Restore', { InstallRoot: item.root, Receipt: item.receipt });
  const receiptPath = item => {
    const bytes = fs.readFileSync(item.receipt);
    const contents = bytes.subarray(0, 2).equals(Buffer.from([255, 254])) ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8').replace(/^\uFEFF/, '');
    const match = /^BackupPath=(.+)$/mi.exec(contents);
    assert.ok(match, 'successful Prepare writes durable snapshot receipt');
    const result = withinFixture(match[1].trim());
    assert.ok(fs.existsSync(path.join(result, 'manifest.json')), 'snapshot has a manifest');
    return result;
  };
  const eraseSyntheticInstallation = root => fs.rmSync(withinFixture(root), { recursive: true, force: true });
  const waitForFile = filename => {
    const deadline = Date.now() + 10000, pause = new Int32Array(new SharedArrayBuffer(4));
    while (!fs.existsSync(filename) && Date.now() < deadline) Atomics.wait(pause, 0, 0, 25);
    assert.ok(fs.existsSync(filename), 'controlled lock peer must reach its bounded phase: ' + filename);
  };
  const nsisString = value => String(value).replace(/\$/g, '$$$$').replace(/"/g, '$\\"');
  const findMakensis = () => {
    if (process.env.QQ_AGENT_TEST_MAKENSIS) {
      assert.ok(fs.existsSync(process.env.QQ_AGENT_TEST_MAKENSIS), 'QQ_AGENT_TEST_MAKENSIS must identify an existing compiler');
      return process.env.QQ_AGENT_TEST_MAKENSIS;
    }
    const caches = [process.env.ELECTRON_BUILDER_CACHE, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache')].filter(Boolean);
    for (const cache of caches) {
      const directory = path.join(cache, 'nsis');
      if (!fs.existsSync(directory)) continue;
      for (const name of fs.readdirSync(directory).sort().reverse()) {
        const candidate = path.join(directory, name, 'makensis.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return null;
  };
  let nativeNsisSkipped = false;
  const runNsis = (compiler, directory, name, source, expectSuccess = true) => {
    fs.mkdirSync(directory, { recursive: true });
    const filename = withinFixture(path.join(directory, name + '.nsi'));
    fs.writeFileSync(filename, '\uFEFF' + source, 'utf8');
    const compiled = spawnSync(compiler, ['/V2', filename], { cwd: directory, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    assert.equal(compiled.status, 0, compiled.error?.stack || compiled.stdout + compiled.stderr);
    const executable = withinFixture(path.join(directory, name + '.exe'));
    const executed = spawnSync(executable, ['/S'], { cwd: directory, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    if (expectSuccess) assert.equal(executed.status, 0, executed.error?.stack || executed.stdout + executed.stderr);
    return executed;
  };
  try {
    check('ordinary uninstall removes owned payload and preserves all account and extension bytes', () => {
      const item = paths('uninstall'); seed(item.root, 'old');
      write(item.root, 'personal-backups/自留文件.txt', 'keep unknown root directory');
      write(item.root, 'resources/app/custom-user-dir/readme.txt', 'keep unknown application directory');
      write(item.root, 'user-note.txt', 'keep unknown root file');
      const expected = retained(item.root);
      ok(run('Remove', { InstallRoot: item.root }));
      assert.deepEqual(retained(item.root), expected);
      assert.equal(fs.existsSync(path.join(item.root, 'QQ Agent.exe')), false);
      assert.equal(fs.existsSync(path.join(item.root, 'LICENSE.electron.txt')), false);
      assert.equal(fs.existsSync(path.join(item.root, 'resources/app/src')), false);
      assert.equal(fs.readFileSync(path.join(item.root, 'personal-backups/自留文件.txt'), 'utf8'), 'keep unknown root directory');
      assert.equal(fs.readFileSync(path.join(item.root, 'resources/app/custom-user-dir/readme.txt'), 'utf8'), 'keep unknown application directory');
      assert.equal(fs.readFileSync(path.join(item.root, 'user-note.txt'), 'utf8'), 'keep unknown root file');
      ok(run('Remove', { InstallRoot: item.root }));
      assert.deepEqual(retained(item.root), expected, 'repeated uninstall is safe');
    });
    for (const legacy of [true, false]) check((legacy ? 'legacy destructive' : 'new selective') + ' same-directory overwrite upgrade restores all protected bytes', () => {
      const item = paths(legacy ? 'legacy-upgrade' : 'new-upgrade'); seed(item.root, 'v1');
      write(item.root, 'unknown-root/保留说明.txt', 'unknown root content');
      write(item.root, 'resources/app/unknown-extension/user.txt', 'unknown app content');
      const expected = retained(item.root); ok(prepare(item)); const backup = receiptPath(item);
      const copiedHashes = Object.values(tree(backup));
      assert.ok(!copiedHashes.includes(hash(Buffer.from('synthetic executable v1'))), 'owned executable is not part of the user snapshot');
      assert.ok(!copiedHashes.includes(hash(Buffer.from('synthetic Electron license v1'))), 'owned Electron license is not mistaken for user data');
      assert.ok(!copiedHashes.includes(hash(Buffer.from('synthetic payload v1'))), 'owned program source is not part of the user snapshot');
      assert.ok(!copiedHashes.includes(hash(Buffer.from('synthetic bundled plugin v1'))), 'bundled extensions are not mistaken for user-installed extensions');
      if (legacy) eraseSyntheticInstallation(item.root); else ok(run('Remove', { InstallRoot: item.root }));
      write(item.root, 'QQ Agent.exe', 'synthetic executable v2');
      write(item.root, 'LICENSE.electron.txt', 'synthetic Electron license v2');
      write(item.root, 'resources/app/src/synthetic.js', 'synthetic payload v2');
      ok(restore(item));
      assert.deepEqual(retained(item.root), expected);
      assert.equal(fs.readFileSync(path.join(item.root, 'QQ Agent.exe'), 'utf8'), 'synthetic executable v2');
      assert.equal(fs.readFileSync(path.join(item.root, 'LICENSE.electron.txt'), 'utf8'), 'synthetic Electron license v2');
      assert.equal(fs.readFileSync(path.join(item.root, 'resources/app/src/synthetic.js'), 'utf8'), 'synthetic payload v2');
      assert.equal(fs.readFileSync(path.join(item.root, 'unknown-root/保留说明.txt'), 'utf8'), 'unknown root content');
      assert.equal(fs.readFileSync(path.join(item.root, 'resources/app/unknown-extension/user.txt'), 'utf8'), 'unknown app content');
      assert.ok(fs.existsSync(backup), 'durable recovery snapshot is retained');
      ok(restore(item)); assert.deepEqual(retained(item.root), expected, 'identical restoration is idempotent');
    });
    check('changed installation directory merges disjoint existing target content without loss', () => {
      const item = paths('changed-directory'), oldRoot = path.join(fixture, 'changed-directory', 'old-install');
      seed(oldRoot, 'old'); write(item.root, 'data-31/new-target-only.txt', 'target only');
      write(item.root, 'resources/app/plugins/target-only/index.mjs', 'target custom plugin');
      const sourceBefore = retained(oldRoot), targetBefore = tree(path.join(item.root, 'data-31'));
      ok(prepare(item, oldRoot)); const backup = receiptPath(item);
      eraseSyntheticInstallation(oldRoot); eraseSyntheticInstallation(item.root);
      write(item.root, 'QQ Agent.exe', 'changed installation v2'); ok(restore(item));
      for (const relative of dataRoots.filter(value => value !== 'resources/app/plugins')) assert.deepEqual(tree(path.join(item.root, relative)), sourceBefore[relative]);
      assert.equal(fs.readFileSync(path.join(item.root, 'resources/app/plugins/user-content.bin')).toString('hex'), Buffer.concat([Buffer.from('user data resources/app/plugins old\n'), Buffer.from([0, 255, 128, 13, 10])]).toString('hex'));
      assert.equal(fs.readFileSync(path.join(item.root, 'resources/app/plugins/target-only/index.mjs'), 'utf8'), 'target custom plugin');
      assert.deepEqual(tree(path.join(item.root, 'data-31')), targetBefore);
      assert.ok(fs.existsSync(backup));
    });
    check('different source and target content rejects Prepare before either installation is changed', () => {
      const item = paths('prepare-conflict'), oldRoot = path.join(fixture, 'prepare-conflict', 'old-install');
      write(oldRoot, 'data-2/config.json', 'source account'); write(item.root, 'data-2/config.json', 'target account');
      const beforeSource = tree(oldRoot), beforeTarget = tree(item.root);
      rejected(prepare(item, oldRoot));
      assert.deepEqual(tree(oldRoot), beforeSource); assert.deepEqual(tree(item.root), beforeTarget);
    });
    check('file versus directory collisions reject Prepare without altering either retained tree', () => {
      const item = paths('type-conflict'), oldRoot = path.join(fixture, 'type-conflict', 'old-install');
      write(oldRoot, 'plugins/example', 'file owned by user'); write(item.root, 'plugins/example/index.mjs', 'directory owned by user');
      const beforeSource = tree(oldRoot), beforeTarget = tree(item.root);
      rejected(prepare(item, oldRoot)); assert.deepEqual(tree(oldRoot), beforeSource); assert.deepEqual(tree(item.root), beforeTarget);
    });
    check('both previous installation roots are protected when an upgrade removes per-user and per-machine installs', () => {
      const item = paths('additional-old-root'), oldRoot = path.join(fixture, 'additional-old-root', 'old-primary');
      const additional = path.join(fixture, 'additional-old-root', 'old-additional');
      write(oldRoot, 'data-2/config.json', 'primary profile'); write(additional, 'data-9/config.json', 'additional profile');
      write(additional, 'resources/app/plugins/additional/index.mjs', 'additional custom plugin'); write(item.root, 'data/target.json', 'target profile');
      ok(run('Prepare', { InstallRoot: item.root, OldRoot: oldRoot, AdditionalOldRoot: additional, BackupBase: item.backup, Receipt: item.receipt }));
      receiptPath(item); eraseSyntheticInstallation(oldRoot); eraseSyntheticInstallation(additional); eraseSyntheticInstallation(item.root); ok(restore(item));
      assert.equal(fs.readFileSync(path.join(item.root, 'data-2/config.json'), 'utf8'), 'primary profile');
      assert.equal(fs.readFileSync(path.join(item.root, 'data-9/config.json'), 'utf8'), 'additional profile');
      assert.equal(fs.readFileSync(path.join(item.root, 'resources/app/plugins/additional/index.mjs'), 'utf8'), 'additional custom plugin');
      assert.equal(fs.readFileSync(path.join(item.root, 'data/target.json'), 'utf8'), 'target profile');
    });
    check('conflicting additional installation data blocks upgrade before either old install is removed', () => {
      const item = paths('additional-conflict'), oldRoot = path.join(fixture, 'additional-conflict', 'old-primary');
      const additional = path.join(fixture, 'additional-conflict', 'old-additional');
      write(oldRoot, 'data-2/config.json', 'primary'); write(additional, 'data-2/config.json', 'additional');
      const beforePrimary = tree(oldRoot), beforeAdditional = tree(additional);
      rejected(run('Prepare', { InstallRoot: item.root, OldRoot: oldRoot, AdditionalOldRoot: additional, BackupBase: item.backup, Receipt: item.receipt }));
      assert.deepEqual(tree(oldRoot), beforePrimary); assert.deepEqual(tree(additional), beforeAdditional);
    });
    check('fresh install with no previous data prepares and restores an empty retained tree', () => {
      const item = paths('fresh-install');
      ok(run('Prepare', { InstallRoot: item.root, BackupBase: item.backup, Receipt: item.receipt }));
      receiptPath(item); write(item.root, 'QQ Agent.exe', 'fresh application'); ok(restore(item));
      assert.equal(fs.readFileSync(path.join(item.root, 'QQ Agent.exe'), 'utf8'), 'fresh application');
      for (const relative of dataRoots) assert.deepEqual(tree(path.join(item.root, relative)), {});
    });
    check('profile and custom modules survive when default data directory is absent', () => {
      const item = paths('profile-without-default'); seed(item.root, 'profile-only', { onlyProfile: true });
      fs.mkdirSync(path.join(item.root, 'data-21'));
      write(item.root, 'resources/app/overrides/custom/index.mjs', 'custom only'); const expected = retained(item.root);
      ok(prepare(item)); receiptPath(item); eraseSyntheticInstallation(item.root); ok(restore(item)); assert.deepEqual(retained(item.root), expected);
      assert.ok(fs.statSync(path.join(item.root, 'data-21')).isDirectory(), 'an empty account root is preserved too');
    });
    check('hidden read-only account files are included and retain their bytes and protected attributes', () => {
      const item = paths('hidden-readonly'); write(item.root, 'data-2/hidden-config.json', 'hidden readonly profile');
      const filename = path.join(item.root, 'data-2/hidden-config.json'), attributeScript = path.join(fixture, 'attributes.ps1');
      fs.writeFileSync(attributeScript, `param([string]$Filename,[string]$Action)
$ErrorActionPreference = 'Stop'
if ($Action -eq 'Set') { [IO.File]::SetAttributes($Filename, [IO.FileAttributes]::Hidden -bor [IO.FileAttributes]::ReadOnly) }
[int][IO.File]::GetAttributes($Filename)
`, 'ascii');
      const attributes = action => {
        const result = spawnSync(process.env.QQ_AGENT_TEST_POWERSHELL || 'powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', attributeScript, '-Filename', filename, '-Action', action], { cwd: repo, windowsHide: true, encoding: 'utf8', timeout: 10000 });
        assert.equal(result.status, 0, result.error?.stack || result.stdout + result.stderr); return Number(result.stdout.trim());
      };
      assert.equal(attributes('Set') & 3, 3); const expected = retained(item.root);
      ok(prepare(item)); receiptPath(item); eraseSyntheticInstallation(item.root); ok(restore(item));
      assert.deepEqual(retained(item.root), expected); assert.equal(attributes('Read') & 3, 3);
      ok(run('Remove', { InstallRoot: item.root })); assert.equal(attributes('Read') & 3, 3); assert.deepEqual(retained(item.root), expected);
    });
    check('independent consecutive snapshots never resurrect a file removed before the later upgrade', () => {
      const item = paths('consecutive'); write(item.root, 'data-2/removed-before-next-upgrade.json', 'removed'); write(item.root, 'plugins/current/index.mjs', 'one');
      ok(prepare(item)); const first = receiptPath(item);
      fs.unlinkSync(path.join(item.root, 'data-2/removed-before-next-upgrade.json')); write(item.root, 'plugins/current/index.mjs', 'two');
      const expected = retained(item.root); ok(prepare(item)); const second = receiptPath(item); assert.notEqual(first, second);
      eraseSyntheticInstallation(item.root); ok(restore(item)); assert.deepEqual(retained(item.root), expected);
      assert.equal(fs.existsSync(path.join(item.root, 'data-2/removed-before-next-upgrade.json')), false); assert.ok(fs.existsSync(first));
    });
    check('changed retained target file rejects Restore and keeps the recovery snapshot', () => {
      const item = paths('restore-conflict'); write(item.root, 'data/config.json', 'original'); ok(prepare(item)); const backup = receiptPath(item);
      write(item.root, 'data/config.json', 'newer target'); rejected(restore(item));
      assert.equal(fs.readFileSync(path.join(item.root, 'data/config.json'), 'utf8'), 'newer target'); assert.ok(fs.existsSync(backup));
    });
    check('corrupted snapshot fails verification and leaves a durable recovery copy', () => {
      const item = paths('corrupted-snapshot'); write(item.root, 'data/config.json', 'original'); ok(prepare(item)); const backup = receiptPath(item);
      const find = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? find(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
      const copied = find(backup).find(filename => path.basename(filename) === 'config.json'); assert.ok(copied, 'snapshot contains the real retained config');
      fs.writeFileSync(copied, 'corrupt copy'); eraseSyntheticInstallation(item.root); rejected(restore(item)); assert.ok(fs.existsSync(backup));
    });
    check('unwritable backup location rejects Prepare before legacy deletion can begin', () => {
      const item = paths('backup-failure'); seed(item.root, 'backup-failure'); const before = tree(item.root);
      write(path.dirname(item.backup), path.basename(item.backup), 'a file cannot become the backup directory');
      rejected(prepare(item)); assert.deepEqual(tree(item.root), before);
    });
    check('an exclusively locked account file aborts Prepare while retaining source bytes and the earlier verified snapshot', () => {
      const item = paths('locked-account'); write(item.root, 'data-2/config.json', 'locked profile bytes'); ok(prepare(item));
      const earlier = receiptPath(item), snapshotBefore = tree(earlier), sourceBefore = tree(item.root);
      const peerRoot = path.join(fixture, 'lock-peer'); fs.mkdirSync(peerRoot);
      const peerScript = path.join(peerRoot, 'hold.ps1'), ready = path.join(peerRoot, 'ready'), release = path.join(peerRoot, 'release'), done = path.join(peerRoot, 'done');
      fs.writeFileSync(peerScript, `param([string]$Filename,[string]$Ready,[string]$Release,[string]$Done)
$ErrorActionPreference = 'Stop'
$stream = [IO.File]::Open($Filename, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
  [IO.File]::WriteAllText($Ready, 'ready')
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while (-not [IO.File]::Exists($Release)) {
    if ([DateTime]::UtcNow -gt $deadline) { throw 'Controlled lock timed out' }
    [Threading.Thread]::Sleep(25)
  }
} finally {
  $stream.Dispose()
  [IO.File]::WriteAllText($Done, 'released')
}
`, 'ascii');
      const peer = spawn(process.env.QQ_AGENT_TEST_POWERSHELL || 'powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', peerScript,
        '-Filename', path.join(item.root, 'data-2/config.json'), '-Ready', ready, '-Release', release, '-Done', done], { cwd: repo, windowsHide: true, stdio: 'ignore' });
      peer.on('error', () => {});
      try { waitForFile(ready); rejected(prepare(item)); }
      finally {
        fs.writeFileSync(release, 'release');
        try { waitForFile(done); } finally { peer.kill(); }
      }
      assert.deepEqual(tree(item.root), sourceBefore); assert.deepEqual(tree(earlier), snapshotBefore);
    });
    check('a backup beneath an old installation is rejected before creating a snapshot that uninstall would erase', () => {
      const item = paths('backup-inside-old'), oldRoot = path.join(fixture, 'backup-inside-old', 'old-install');
      write(oldRoot, 'data/config.json', 'source profile'); const before = tree(oldRoot);
      item.backup = path.join(oldRoot, 'durable-backups');
      rejected(prepare(item, oldRoot)); assert.deepEqual(tree(oldRoot), before);
    });
    for (const missing of ['manifest.json', 'payload']) check('missing snapshot ' + missing + ' rejects Restore before writing any retained target data', () => {
      const item = paths('missing-' + missing.replace('.', '-')); write(item.root, 'data/config.json', 'original'); ok(prepare(item)); const backup = receiptPath(item);
      const damaged = withinFixture(path.join(backup, missing)); fs.rmSync(damaged, { recursive: true, force: true });
      eraseSyntheticInstallation(item.root); write(item.root, 'QQ Agent.exe', 'keep target executable'); const before = tree(item.root);
      rejected(restore(item)); assert.deepEqual(tree(item.root), before); assert.ok(fs.existsSync(backup));
    });
    check('missing receipt rejects Restore instead of reporting a successful empty restore', () => {
      const item = paths('missing-receipt'); seed(item.root, 'keep'); const before = tree(item.root);
      rejected(restore(item)); assert.deepEqual(tree(item.root), before);
    });
    check('retained junctions never cause backup or removal to follow an external directory', () => {
      const item = paths('junction'), external = path.join(fixture, 'junction-external');
      write(external, 'external-secret.txt', 'external sentinel'); fs.mkdirSync(path.join(item.root, 'data'), { recursive: true });
      fs.symlinkSync(external, path.join(item.root, 'data', 'linked-store'), 'junction');
      const expected = tree(external), result = prepare(item);
      rejected(result); assert.deepEqual(tree(external), expected);
      const removal = run('Remove', { InstallRoot: item.root });
      assert.ok(removal.status !== null, removal.detail); assert.deepEqual(tree(external), expected);
    });
    check('owned payload junctions never let uninstall delete files outside the installation', () => {
      const item = paths('payload-junction'), external = path.join(fixture, 'payload-junction-external');
      write(external, 'external-secret.txt', 'external sentinel'); fs.mkdirSync(path.join(item.root, 'resources/app'), { recursive: true });
      fs.symlinkSync(external, path.join(item.root, 'resources/app/src'), 'junction');
      const expected = tree(external); const result = run('Remove', { InstallRoot: item.root });
      assert.ok(result.status !== null, result.detail); assert.deepEqual(tree(external), expected);
    });
    check('an ancestor junction prevents Prepare and Remove from accessing another directory through the install path', () => {
      const item = paths('ancestor-junction'), external = path.join(fixture, 'ancestor-external'), alias = path.join(fixture, 'ancestor-alias');
      seed(path.join(external, 'nested-install'), 'external keep'); fs.symlinkSync(external, alias, 'junction');
      item.root = path.join(alias, 'nested-install'); const before = tree(external);
      rejected(prepare(item)); rejected(run('Remove', { InstallRoot: item.root })); assert.deepEqual(tree(external), before);
    });
    const compiler = findMakensis();
    if (!compiler) {
      nativeNsisSkipped = true;
      console.log('SKIP native NSIS macro execution: no cached compiler; set QQ_AGENT_TEST_MAKENSIS to require a specific compiler');
    } else {
      const guardCases = [
        ['empty directory', '', false],
        ['relative directory', 'relative-installation', false],
        ['drive-relative directory', path.parse(fixture).root.slice(0, 2) + 'relative-installation', false],
        ['root-relative directory', '\\relative-installation', false],
        ['drive root', path.parse(fixture).root, false],
        ['UNC share root', '\\\\qq-agent-preservation-fixture\\share\\', false],
        ['ordinary fixture directory', path.join(fixture, 'guard-valid-installation'), true],
      ];
      for (const [label, candidate, accepted] of guardCases) check('native NSIS running-app guard ' + label, () => {
        const directory = path.join(fixture, 'guard-' + label.replaceAll(' ', '-')), name = 'guard-probe';
        const marker = path.join(directory, 'original-check-called.txt'), completed = path.join(directory, 'completed.txt');
        if (accepted) fs.mkdirSync(withinFixture(candidate), { recursive: true });
        // The upstream process check is a controlled marker peer. No process is
        // enumerated, closed or killed; only the production path guard executes.
        const result = runNsis(compiler, directory, name, `Unicode true
Name "QQ Agent isolated running-app path guard"
OutFile "${nsisString(path.join(directory, name + '.exe'))}"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
!include LogicLib.nsh
!macro CHECK_APP_RUNNING
  FileOpen $9 "${nsisString(marker)}" w
  FileWrite $9 "original check called"
  FileClose $9
!macroend
!include "${nsisString(path.join(repo, 'build/check-app-running.nsh'))}"
Section
StrCpy $INSTDIR "${nsisString(candidate)}"
Call QQAgentCheckInstallRunning
FileOpen $9 "${nsisString(completed)}" w
FileWrite $9 "complete"
FileClose $9
SectionEnd
`, accepted);
        if (accepted) {
          assert.equal(fs.readFileSync(marker, 'utf8'), 'original check called');
          assert.equal(fs.readFileSync(completed, 'utf8'), 'complete');
        } else {
          assert.notEqual(result.status, null, result.error?.stack || 'guard executable timed out');
          assert.notEqual(result.status, 0, 'invalid path must stop installation with an error');
          assert.equal(fs.existsSync(marker), false, 'invalid path must never reach the upstream process check');
          assert.equal(fs.existsSync(completed), false, 'invalid path must stop the section');
        }
      });
      const header = (directory, name, uninstall = false) => `Unicode true
Name "QQ Agent isolated preservation regression"
OutFile "${nsisString(path.join(directory, name + '.exe'))}"
RequestExecutionLevel user
SilentInstall silent
SilentUnInstall silent
AutoCloseWindow true
!define BUILD_RESOURCES_DIR "${nsisString(path.join(repo, 'build'))}"
${uninstall ? '!define BUILD_UNINSTALLER\n' : ''}!include "${nsisString(nsis)}"
`;
      check('real NSIS Prepare and Restore functions protect a legacy destructive overwrite upgrade', () => {
        const item = paths('nsis-legacy'), directory = path.join(fixture, 'nsis-harness-upgrade'), name = 'upgrade-probe';
        seed(item.root, 'native NSIS'); const expected = retained(item.root);
        const marker = path.join(directory, 'completed.txt');
        runNsis(compiler, directory, name, header(directory, name) + `Section
StrCpy $INSTDIR "${nsisString(item.root)}"
StrCpy $QQAgentOldInstallDir "${nsisString(item.root)}"
StrCpy $QQAgentAdditionalOldInstallDir ""
StrCpy $QQAgentBackupRoot "${nsisString(item.backup)}"
StrCpy $QQAgentBackupReceipt "${nsisString(item.receipt)}"
Call QQAgentPreparePreservation
SetOutPath "$TEMP"
RMDir /r "$INSTDIR"
CreateDirectory "$INSTDIR"
FileOpen $0 "$INSTDIR\\QQ Agent.exe" w
FileWrite $0 "synthetic replacement from NSIS"
FileClose $0
Call QQAgentRestorePreservation
FileOpen $0 "${nsisString(marker)}" w
FileWrite $0 "complete"
FileClose $0
SectionEnd
`);
        assert.equal(fs.readFileSync(marker, 'utf8'), 'complete', 'both real production functions completed');
        assert.deepEqual(retained(item.root), expected);
        assert.equal(fs.readFileSync(path.join(item.root, 'QQ Agent.exe'), 'utf8'), 'synthetic replacement from NSIS');
      });
      check('real NSIS customRemoveFiles macro removes payload while retaining every account and extension root', () => {
        const item = paths('nsis-uninstall'), directory = path.join(fixture, 'nsis-harness-uninstall'), name = 'uninstall-launcher';
        seed(item.root, 'native uninstall'); const expected = retained(item.root);
        const uninstaller = withinFixture(path.join(directory, 'synthetic-uninstaller.exe'));
        const marker = path.join(directory, 'removed.txt');
        runNsis(compiler, directory, name, header(directory, name, true) + `Section
WriteUninstaller "${nsisString(uninstaller)}"
SectionEnd
Section "Uninstall"
StrCpy $INSTDIR "${nsisString(item.root)}"
!insertmacro customRemoveFiles
FileOpen $0 "${nsisString(marker)}" w
FileWrite $0 "complete"
FileClose $0
SectionEnd
`);
        const result = spawnSync(uninstaller, ['/S', '_?=' + directory], { cwd: directory, encoding: 'utf8', windowsHide: true, timeout: 60000 });
        assert.equal(result.status, 0, result.error?.stack || result.stdout + result.stderr);
        assert.equal(fs.readFileSync(marker, 'utf8'), 'complete', 'actual uninstaller macro completed');
        assert.deepEqual(retained(item.root), expected);
        assert.equal(fs.existsSync(path.join(item.root, 'QQ Agent.exe')), false);
        assert.equal(fs.existsSync(path.join(item.root, 'resources/app/src')), false);
      });
    }
  } finally {
    if (process.env.QQ_AGENT_KEEP_INSTALLER_FIXTURE === '1' || failed) console.log('Native fixture retained: ' + fixture);
    else {
      const absolute = path.resolve(fixture), temporary = path.resolve(os.tmpdir()), relative = path.relative(temporary, absolute);
      assert.ok(relative.startsWith(prefix) && !relative.includes(path.sep) && !path.isAbsolute(relative), 'cleanup owns one temporary directory');
      fs.rmSync(absolute, { recursive: true, force: true });
    }
  }
  console.log(JSON.stringify({ test: '273-installer-user-data-preservation', passed, failed, nativeSkipped: false, nativeNsisSkipped, nsisGuardOnly: guardOnly, fixtureRetained: failed > 0 || process.env.QQ_AGENT_KEEP_INSTALLER_FIXTURE === '1' }));
  if (failed) process.exitCode = 1;
}

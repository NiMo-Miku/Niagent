// Real atomic config + production Electron lifecycle with an OS-recording mock.
// Windows argument roundtrips use an ordinary Node child, never Electron or GUI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { loginItemSettings, resolveLoginItemEnvironment, startElectron, stopElectron } from '../electron/main.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-autostart128-'));
const dataDir = path.join(root, 'profile 3 synthetic data');
const appRoot = path.join(root, 'source app with spaces');
const originalArgv = [...process.argv], originalFetch = globalThis.fetch;
const originalEnv = Object.fromEntries(['QQ_AGENT_PROFILE', 'QQ_AGENT_DATA_DIR'].map(key => [key, process.env[key]]));
const configErrors = [];
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log: { error: value => configErrors.push(String(value)) } });
config.update({ server: { autoStart: false, closeToTray: true, token: 'synthetic-token128' } });
let subscriptions = 0, stops = 0, quits = 0, applyFailure = false;
const calls = [], dialogs = [];
const productionSubscribe = config.onChange;
config.onChange = fn => {
  subscriptions++;
  const dispose = productionSubscribe(fn);
  return () => { subscriptions--; dispose(); };
};
const disk = () => JSON.parse(fs.readFileSync(config.file, 'utf8'));
const handlers = new Map();
class Window extends EventEmitter {
  constructor() {
    super(); this.destroyed = false; this.hidden = 0;
    this.contents = new EventEmitter(); this.contents.mainFrame = { url: '' };
    this.contents.setWindowOpenHandler = () => {};
    this.contents.isDestroyed = () => this.destroyed;
  }
  get webContents() { if (this.destroyed) throw new TypeError('Object has been destroyed'); return this.contents; }
  isDestroyed() { return this.destroyed; }
  async loadURL(url) { this.contents.mainFrame = { url }; }
  show() {} focus() {} hide() { this.hidden++; }
  destroy() { if (!this.destroyed) { this.destroyed = true; this.contents.emit('destroyed'); this.emit('closed'); } }
}
class Tray extends EventEmitter {
  setToolTip(value) { this.tooltip = value; }
  setContextMenu(value) { this.menu = value; }
  destroy() { this.destroyed = true; }
}
const app = new EventEmitter();
Object.assign(app, {
  isPackaged: false, paths: { appData: path.join(root, 'empty app-data'), exe: process.execPath },
  getPath(name) { return this.paths[name] ?? root; }, setPath(name, value) { this.paths[name] = value; },
  requestSingleInstanceLock: () => true, whenReady: async () => {},
  setAppUserModelId(value) { this.modelId = value; }, quit() { quits++; },
  setLoginItemSettings(value) { calls.push(structuredClone(value)); if (applyFailure) { applyFailure = false; throw new Error('128 synthetic OS apply failure'); } },
});
const electron = {
  app, BrowserWindow: Window, Tray, Menu: { buildFromTemplate: value => value },
  nativeImage: { createFromDataURL: () => ({}) },
  ipcMain: { handle: (name, fn) => handlers.set(name, fn), removeHandler: name => handlers.delete(name), on() {}, removeListener() {} },
  session: { defaultSession: { setProxy: async () => {}, setPermissionRequestHandler() {} } },
  shell: { openExternal() {} }, dialog: { showErrorBox: (...args) => dialogs.push(args) },
};
const autostartItem = desktop => desktop.tray.menu.find(item => item.label === '开机自启');
async function roundtrip(settings) {
  const script = path.join(root, 'print actual argv.mjs');
  if (!fs.existsSync(script)) fs.writeFileSync(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
  // Electron writes already quoted args into the Windows Run command line.
  // Verbatim mode tests the real Windows argv parser rather than a test parser.
  const scriptArg = process.platform === 'win32' ? `"${script}"` : script;
  const child = spawn(process.execPath, [scriptArg, ...settings.args], { windowsHide: true,
    windowsVerbatimArguments: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => errors += chunk);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  assert.equal(code, 0, errors);
  return JSON.parse(output);
}

try {
  console.log('· Source/packaged login items recover profile and spaced paths through the real command line');
  for (const packaged of [false, true]) {
    const settings = loginItemSettings({ isPackaged: packaged }, { autoStart: true, profile: { n: 3 }, dataDir, appRoot });
    const args = await roundtrip(settings);
    assert.deepEqual(args, [...(!packaged ? [path.resolve(appRoot)] : []), '--qq-agent-profile=3', `--qq-agent-data-dir=${path.resolve(dataDir)}`]);
    const inherited = { QQ_AGENT_PROFILE: '1', QQ_AGENT_DATA_DIR: path.join(root, 'unrelated-global-data'), QQ_AGENT_PORT: '12345', OTHER: 'preserved' };
    const env = resolveLoginItemEnvironment(args, inherited);
    assert.equal(env.QQ_AGENT_PROFILE, '3'); assert.equal(env.QQ_AGENT_DATA_DIR, dataDir);
    assert.equal(env.QQ_AGENT_PORT, '12345'); assert.equal(env.OTHER, 'preserved');
    assert.equal(inherited.QQ_AGENT_PROFILE, '1', 'argument parsing must not mutate caller environment');
    assert.ok(!settings.args.some(value => value.includes('12345') || value.includes('token') || value.includes('--disable-gpu')));
    assert.equal(settings.name, 'cn.kondius.qq-agent.profile-3');
  }
  assert.equal(loginItemSettings({ isPackaged: true }, { profile: { n: 1 }, dataDir }).name, 'cn.kondius.qq-agent');
  assert.notEqual(loginItemSettings({ isPackaged: true }, { profile: { n: 2 }, dataDir }).name, loginItemSettings({ isPackaged: true }, { profile: { n: 3 }, dataDir }).name);
  assert.deepEqual(resolveLoginItemEnvironment(['--disable-gpu', '--force-renderer-accessibility', '--qq-agent-profile-other=9'], { QQ_AGENT_PROFILE: '2' }), { QQ_AGENT_PROFILE: '2' });
  for (const invalid of ['', '0', '-2', '1.5', 'NaN', 'Infinity', '1junk', '9007199254740992']) assert.throws(() => resolveLoginItemEnvironment([`--qq-agent-profile=${invalid}`], {}), /正整数/);
  for (const invalid of ['', '   ', 'bad\0path']) assert.throws(() => resolveLoginItemEnvironment([`--qq-agent-data-dir=${invalid}`], {}), /非空路径/);
  assert.throws(() => resolveLoginItemEnvironment(['--qq-agent-profile=2', '--qq-agent-profile=3'], {}), /重复/);
  assert.throws(() => resolveLoginItemEnvironment(['--qq-agent-data-dir=a', '--qq-agent-data-dir=b'], {}), /重复/);
  assert.throws(() => loginItemSettings({ isPackaged: false }, { profile: { n: 0 }, dataDir }), /身份无效/);

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: '0.5.0' }) });
  process.env.QQ_AGENT_DATA_DIR = path.join(root, 'must-not-create-inherited-data'); process.env.QQ_AGENT_PROFILE = '1';
  process.argv = [...originalArgv, '--qq-agent-profile=3', `--qq-agent-data-dir=${dataDir}`, '--disable-gpu'];
  const desktop = await startElectron(electron, { createKernel: () => ({
    config, start: async () => 43210, stop: async () => { stops++; }, bus: { emit() {} },
    orchestrator: { status: () => ({ paused: false }), pause() {}, resume() {} },
  }) });
  assert.equal(process.env.QQ_AGENT_PROFILE, '3'); assert.equal(process.env.QQ_AGENT_DATA_DIR, dataDir);
  assert.equal(app.paths.userData, path.join(dataDir, 'electron-user-data'));
  assert.equal(fs.existsSync(path.join(root, 'must-not-create-inherited-data')), false);
  assert.equal(subscriptions, 1); assert.equal(calls.length, 1); assert.equal(calls[0].openAtLogin, false);
  assert.equal(calls[0].name, 'cn.kondius.qq-agent.profile-3'); assert.equal(autostartItem(desktop).checked, false);
  assert.equal(desktop.tray.tooltip, 'QQ Agent (profile=3)');

  console.log('· A committed settings save updates the OS recorder and tray, once per change');
  config.update({ server: { autoStart: true } });
  assert.equal(disk().server.autoStart, true); assert.equal(calls.length, 2); assert.equal(calls.at(-1).openAtLogin, true); assert.equal(autostartItem(desktop).checked, true);
  config.update({ persona: { botName: 'unrelated save128' } }); config.update({ server: { autoStart: true } });
  assert.equal(calls.length, 2, 'unrelated and repeated saves cannot reapply the login item');
  autostartItem(desktop).click({ checked: false });
  assert.equal(disk().server.autoStart, false); assert.equal(calls.length, 3, 'tray update uses the same committed-config consumer exactly once'); assert.equal(autostartItem(desktop).checked, false);
  assert.deepEqual(calls.map(value => value.openAtLogin), [false, true, false]);

  console.log('· Failed atomic saves preserve the persisted flag and never apply or update the tray');
  const rename = fs.renameSync, before = disk(), callCount = calls.length;
  fs.renameSync = function(...args) { if (args[1] === config.file) throw new Error('128 synthetic config save failure'); return rename.apply(this, args); };
  try {
    assert.throws(() => config.update({ server: { autoStart: true } }), /config save failure/);
    assert.deepEqual(disk(), before); assert.equal(config.get().server.autoStart, false); assert.equal(calls.length, callCount); assert.equal(autostartItem(desktop).checked, false);
    const nativeItem = autostartItem(desktop);
    nativeItem.checked = true; // Electron toggles the actual MenuItem before click.
    assert.doesNotThrow(() => nativeItem.click(nativeItem));
    assert.deepEqual(disk(), before); assert.equal(calls.length, callCount); assert.equal(autostartItem(desktop).checked, false);
  } finally { fs.renameSync = rename; }
  assert.match(fs.readFileSync(path.join(dataDir, 'boot-diag.log'), 'utf8'), /autostart-update-failed.*config save failure/);

  console.log('· An OS failure is recorded and a later successful commit retries; closeToTray stays live');
  applyFailure = true; config.update({ server: { autoStart: true } });
  assert.equal(disk().server.autoStart, true); assert.equal(calls.length, 4); assert.equal(autostartItem(desktop).checked, true);
  assert.match(fs.readFileSync(path.join(dataDir, 'boot-diag.log'), 'utf8'), /autostart-apply-failed.*OS apply failure/);
  config.update({ persona: { botName: 'retry failed apply128' } }); assert.equal(calls.length, 5); assert.equal(calls.at(-1).openAtLogin, true);
  config.update({ persona: { botName: 'repeat successful apply128' } }); assert.equal(calls.length, 5);
  let prevented = false; desktop.window.emit('close', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(desktop.window.hidden, 1); assert.equal(stops, 0);
  config.update({ server: { closeToTray: false } }); assert.equal(calls.length, 5);
  desktop.window.emit('close', { preventDefault() {} }); await stopElectron(electron);
  assert.equal(stops, 1); assert.equal(quits, 1); assert.equal(subscriptions, 0); assert.equal(desktop.tray.destroyed, true);
  config.update({ server: { autoStart: false } }); assert.equal(calls.length, 5, 'late config updates after shutdown cannot touch the OS recorder');
  assert.deepEqual(dialogs, []); assert.deepEqual(configErrors, []);
  console.log('✓ 128 Config commits, tray consistency, save/OS failures, shutdown and instance-preserving login arguments passed (mock OS; no headed UI)');
} finally {
  await stopElectron(electron);
  globalThis.fetch = originalFetch; process.argv = originalArgv;
  for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  const absoluteRoot = path.resolve(root);
  assert.ok(path.basename(absoluteRoot).startsWith('qqa-autostart128-') && path.dirname(absoluteRoot) === path.resolve(os.tmpdir()));
  fs.rmSync(absoluteRoot, { recursive: true, force: true });
}

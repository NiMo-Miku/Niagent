// Native window destruction must still finish the production kernel shutdown.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { EventEmitter } from 'node:events';
import { startElectron, stopElectron } from '../electron/main.js';
import { createKernel } from '../src/kernel/kernel.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-electron101-'));
// The real imported default kernel/UI is under test; no installed extension
// belongs in this regression's temporary application root.
const appRoot = path.join(dataDir, 'application'); fs.mkdirSync(appRoot);
fs.cpSync(path.resolve(import.meta.dirname, '../ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, directory));
let isolatedOutbound = 0, dnsCalls = 0; const browserOutbound = [], ownedOrigins = new Set();
const nativeFetch = globalThis.fetch, nativeLookup = dns.lookup;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (ownedOrigins.has(url.origin)) return nativeFetch(input, options);
  isolatedOutbound++; throw new Error('QA101 external fetch disabled');
};
dns.lookup = async () => { dnsCalls++; throw new Error('QA101 external DNS disabled'); };
const routeOwnedPage = (page, base, onBlocked = () => {}) => page.route('**/*', route => {
  const url = route.request().url();
  if (new URL(url).origin === new URL(base).origin) return route.continue();
  browserOutbound.push(url); onBlocked(url); return route.abort();
});
function assertOffline() {
  assert.equal(isolatedOutbound, 0, 'no external Node fetch was attempted');
  assert.equal(dnsCalls, 0, 'no external DNS was attempted');
  assert.deepEqual(browserOutbound, [], 'all browser pages used only their owned console origin');
}

const originalAgentEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('QQ_AGENT_')));
const originalDataDir = process.env.QQ_AGENT_DATA_DIR;
for (const key of Object.keys(process.env)) if (key.startsWith('QQ_AGENT_')) delete process.env[key];
Object.assign(process.env, { QQ_AGENT_PROFILE: '1', QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(dataDir, 'absent') });
assert.equal(process.versions.electron, undefined, 'run the fake Electron test in plain Node only');
const originalFetch = globalThis.fetch;
process.env.QQ_AGENT_DATA_DIR = dataDir;

const handlers = new Map();
const ipcMain = new EventEmitter();
ipcMain.handle = (name, callback) => handlers.set(name, callback);
ipcMain.removeHandler = name => handlers.delete(name);
let destroyedGetterReads = 0, closedEvents = 0, destroyedEvents = 0, quits = 0, stops = 0;
const fatalErrors = [];
class BrowserWindow extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this._contents = new EventEmitter();
    this._contents.mainFrame = { url: '' };
    this._contents.isDestroyed = () => this.destroyed;
    this._contents.setWindowOpenHandler = () => {};
  }
  get webContents() {
    if (this.destroyed) { destroyedGetterReads++; throw new TypeError('Object has been destroyed'); }
    return this._contents;
  }
  isDestroyed() { return this.destroyed; }
  async loadURL(url) { assert.equal(ownedOrigins.has(new URL(url).origin), true, 'mock window only receives this owned console'); this._contents.mainFrame = { url }; }
  show() { assert.equal(this.destroyed, false, 'a late ready event cannot show a destroyed window'); }
  hide() { throw new Error('closeToTray=false must quit instead of hiding'); }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this._contents.emit('destroyed');
    this.emit('closed');
  }
}
const app = new EventEmitter();
Object.assign(app, {
  isPackaged: false,
  paths: { appData: path.join(dataDir, 'app-data') },
  getPath(name) { return this.paths[name] ?? dataDir; },
  setPath(name, value) { this.paths[name] = value; },
  requestSingleInstanceLock: () => true,
  whenReady: async () => {},
  quit() { quits++; },
  exit(code) { fatalErrors.push(`app.exit(${code})`); },
});
const electron = {
  app, BrowserWindow, ipcMain,
  session: { defaultSession: { setProxy: async () => {}, setPermissionRequestHandler() {} } },
  shell: { openExternal() { externalShellActions++; throw new Error('101 forbids native external navigation'); } },
  dialog: { showErrorBox(title, detail) { fatalErrors.push(`${title}: ${detail}`); } },
};
let externalShellActions = 0;
let productionKernel;
try {
  const desktop = await startElectron(electron, { createKernel: () => {
    productionKernel = createKernel({ appRoot,
      env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(dataDir, 'absent') }, headless: true,
      transport: { id: 'fixture', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
      priceUpdates: { refresh: async () => ({ ok: true }), updateCheck: async () => ({ ok: true, current: '0.5.0', latest: '0.5.0', hasUpdate: false }) },
      fetchImpl: async () => { isolatedOutbound++; throw new Error('101 forbids external HTTP'); },
      communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
    });
    productionKernel.config.update({ server: { port: 0, token: 'electron101-console', closeToTray: false }, telemetry: { enabled: false } });
    productionKernel.loader.startWatchers = () => {};
    const realStart = productionKernel.start;
    productionKernel.start = async () => { const port = await realStart(); assert.notEqual(port, 15967); ownedOrigins.add(`http://127.0.0.1:${port}`); assert.deepEqual(productionKernel.loader.listEntries(), []); return port; };
    const realStop = productionKernel.stop;
    productionKernel.stop = async () => { stops++; return realStop(); };
    return productionKernel;
  } });
  assert.equal(desktop.window instanceof BrowserWindow, true, 'only the local mock window is constructed'); assert.equal(desktop.tray, null);
  const win = desktop.window, contents = win.webContents;
  const bootstrap = handlers.get('qq-agent:get-console-token');
  assert.equal(bootstrap({ sender: contents, senderFrame: contents.mainFrame }), 'electron101-console');
  const lock = path.join(dataDir, 'qq-agent.lock');
  assert.equal(fs.existsSync(lock), true, 'production startup owns an instance lock');
  assert.equal((await originalFetch(`http://127.0.0.1:${desktop.port}/api/status`, { headers: { 'x-console-token': 'electron101-console' } })).status, 200);
  assert.ok(ipcMain.listenerCount('qq-agent:quit') > 0);
  contents.on('destroyed', () => { destroyedEvents++; });
  win.on('closed', () => { closedEvents++; });
  let prevented = false;
  console.log('· The registered close handler destroys the native window and stops the real isolated kernel');
  assert.doesNotThrow(() => win.emit('close', { preventDefault() { prevented = true; } }));
  assert.equal(prevented, true, 'shutdown owns the close event');
  assert.deepEqual(await stopElectron(electron), { ok: true });
  assert.equal(destroyedGetterReads, 0, 'cleanup never reads the destroyed BrowserWindow getter');
  assert.equal(destroyedEvents, 1, 'all WebContents destruction observers complete');
  assert.equal(closedEvents, 1, 'the closed notification completes after WebContents destruction');
  assert.doesNotThrow(() => win.emit('ready-to-show'));
  assert.equal(bootstrap({ sender: contents, senderFrame: contents.mainFrame }), '', 'a retained IPC callback rejects the destroyed sender');
  assert.equal(stops, 1);
  assert.equal(quits, 1);
  assert.equal(fs.existsSync(lock), false, 'shutdown releases the actual instance lock');
  assert.equal(handlers.size, 0, 'all desktop IPC handlers are removed');
  assert.equal(ipcMain.eventNames().length, 0, 'all desktop IPC listeners are removed');
  await assert.rejects(() => originalFetch(`http://127.0.0.1:${desktop.port}/api/status`, { signal: AbortSignal.timeout(1500) }), 'production console HTTP server is closed');
  assert.deepEqual(await stopElectron(electron), { ok: true });
  assert.equal(stops, 1, 'repeated shutdown is idempotent');
  assert.equal(quits, 1);
  assert.deepEqual(fatalErrors, []);
  assert.doesNotMatch(fs.readFileSync(path.join(dataDir, 'boot-diag.log'), 'utf8'), /uncaught-fatal|shutdown-failed/);
  console.log('✓ 101 Destroyed native getter, real kernel shutdown, HTTP release and instance lock release passed');
} finally {
  await stopElectron(electron);
  globalThis.fetch = nativeFetch; dns.lookup = nativeLookup;
  for (const key of Object.keys(process.env)) if (key.startsWith('QQ_AGENT_')) delete process.env[key];
  Object.assign(process.env, originalAgentEnv);
  if (originalDataDir === undefined) delete process.env.QQ_AGENT_DATA_DIR;
  else process.env.QQ_AGENT_DATA_DIR = originalDataDir;
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dataDir).startsWith('qqa-electron101-'));
  fs.rmSync(dataDir, { recursive: true, force: true });
  assertOffline(); if (productionKernel) assert.deepEqual(productionKernel.loader.listEntries(), []); assert.equal(externalShellActions, 0);
}

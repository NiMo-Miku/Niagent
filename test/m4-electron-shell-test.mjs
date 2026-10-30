import assert from 'node:assert/strict';
import { configureUserData, resolveElectronDataDir, isLoopbackConsoleUrl, createWindow, probeCaptchaNetwork, captchaInterceptorStatus, isElectronMainProcess } from '../electron/main.js';

const app = { isPackaged: false, paths: { userData: 'C:/AppData/QQ', appData: 'C:/AppData' }, getPath(name) { return this.paths[name]; }, setPath(name, value) { this.paths[name] = value; } };
const result = configureUserData(app, { QQ_AGENT_PROFILE: '2', QQ_AGENT_DATA_DIR: 'C:/Temp/qqa-data' }, 'C:/AppRoot');
assert.equal(result.profile.n, 2);
assert.equal(result.userData.split('\\').join('/'), 'C:/Temp/qqa-data/electron-user-data');
assert.equal(result.dataDir.split('\\').join('/'), 'C:/Temp/qqa-data');
assert.equal(resolveElectronDataDir(app, { QQ_AGENT_PROFILE: '3' }, 'C:/AppRoot').dataDir.split('\\').join('/'), 'C:/AppRoot/data-3');
assert.equal(isElectronMainProcess({ versions: { electron: '33.4.11' }, type: 'browser' }), true);
assert.equal(isElectronMainProcess({ versions: { node: '22.22.2' }, type: 'node' }), false);
assert.equal(isLoopbackConsoleUrl('http://127.0.0.1:3210/', 3210), true);
assert.equal(isLoopbackConsoleUrl('https://example.com/', 3210), false);
assert.equal(isLoopbackConsoleUrl('http://127.0.0.1:3211/', 3210), false);
let navigated = null;
let openHandler = null;
let loadedUrl = null;
const windowMock = {
  webContents: { setWindowOpenHandler(fn) { openHandler = fn; }, on(name, fn) { if (name === 'will-navigate') this.navigate = fn; } },
  once() {}, on() {}, hide() {}, loadURL(url) { loadedUrl = url; return Promise.resolve(); },
};
const electron = { BrowserWindow: class { constructor() { return windowMock; } }, shell: { openExternal(url) { windowMock.external = url; } }, session: { defaultSession: { setPermissionRequestHandler() {}, setProxy() { return Promise.resolve(); } } } };
createWindow(electron, 3210, { token: 'test-console-token' });
assert.equal(new URL(loadedUrl).searchParams.has('token'), false, 'Electron URL never carries console token');
assert.equal(openHandler({ url: 'https://example.com' }).action, 'deny');
assert.equal(windowMock.external, 'https://example.com');
assert.equal(openHandler({ url: 'http://127.0.0.1:3210/' }).action, 'deny');
assert.equal(windowMock.external, 'https://example.com');
windowMock.webContents.navigate({ preventDefault() { navigated = true; } }, 'https://example.com');
assert.equal(navigated, true);
const probe = await probeCaptchaNetwork(async (target, options) => ({ status: target.includes('aliyun.com') ? 204 : 200, ok: true, options }));
assert.equal(probe.targets.length, 4, 'captcha probe checks four targets');
assert.equal(probe.ok, true, 'captcha probe returns aggregate connectivity');
assert.equal(probe.targets.every((item) => item.ok && item.latencyMs >= 0 && !('body' in item)), true, 'captcha probe DTO is redacted');
const state = captchaInterceptorStatus();
assert.equal(typeof state.installed, 'boolean');
assert.equal('token' in state, false, 'captcha interceptor status does not expose secrets');
const preloadCjs = await import('node:fs').then(({ readFileSync }) => readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8'));
assert.equal(preloadCjs.includes("'qqa-captcha-net-probe'"), true, 'preload exposes captcha network probe');
assert.equal(preloadCjs.includes("'qqa-captcha-interceptor-status'"), true, 'preload exposes interceptor status');
console.log('✓ M4 Electron shell: lifecycle helpers and captcha diagnostics');

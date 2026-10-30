import {settingsSection,settingsSave,openSettingsFold} from './settings-navigation.mjs';
// Real kernel + reset HTTP + isolated Chromium settings. Only synthetic temporary data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createKernel } from '../src/kernel/kernel.js';
import {isSettingsSaveRequest,SETTINGS_SAVE_ROUTE} from './settings-save-observation.mjs';

const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-reset-ui136-'));
assert.equal(path.dirname(path.resolve(parent)), path.resolve(os.tmpdir())); assert.ok(path.basename(parent).startsWith('qqa-reset-ui136-'));
// The real imported default kernel/UI is under test; no installed extension
// belongs in this regression's temporary application root.
const appRoot = path.join(parent, 'application'); fs.mkdirSync(appRoot);
fs.cpSync(path.resolve(import.meta.dirname, '../ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, directory));
let isolatedOutbound = 0, dnsCalls = 0; const browserOutbound = [], ownedOrigins = new Set();
const nativeFetch = globalThis.fetch, nativeLookup = dns.lookup;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (ownedOrigins.has(url.origin)) return nativeFetch(input, options);
  isolatedOutbound++; throw new Error('QA136 external fetch disabled');
};
dns.lookup = async () => { dnsCalls++; throw new Error('QA136 external DNS disabled'); };
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

const errors = [], live = new Set();
const playwright = createRequire(import.meta.url)('playwright-core');
const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
const versions = fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(version => path.join(cache, version, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file));
assert.ok(executablePath, '136 requires an already installed Chromium; no downloads');
let browser;
const fixtureKernel = (dataDir, { stopGate } = {}) => createKernel({ appRoot, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(parent, 'absent') },
  transport: { id: 'local136', start() {}, stop() { return stopGate?.(); }, status: () => ({ connected: true }), actions: {} },
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) }, communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
  fetchImpl: async () => { isolatedOutbound++; throw new Error('136 forbids external HTTP'); },
});
const workerFile = path.join(parent, 'worker.mjs');
fs.writeFileSync(workerFile, `import {createKernel} from ${JSON.stringify(pathToFileURL(path.resolve(import.meta.dirname, '../src/kernel/kernel.js')).href)};
import path from 'node:path';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
const dataDir=process.argv[2],token=process.argv[3],appRoot=process.argv[4];
assert.equal(path.dirname(path.dirname(path.resolve(dataDir))),path.dirname(path.resolve(appRoot)));
assert.equal(path.basename(appRoot),'application');assert.equal(path.resolve(dataDir).startsWith(path.resolve(appRoot)+path.sep),false);
assert.equal(path.resolve(appRoot).startsWith(path.resolve(dataDir)+path.sep),false);
let outbound=0,dnsCalls=0;const nativeFetch=globalThis.fetch,nativeLookup=dns.lookup;
globalThis.fetch=async()=>{outbound++;throw new Error('136 worker forbids external fetch');};
dns.lookup=async()=>{dnsCalls++;throw new Error('136 worker forbids external DNS');};
const kernel=createKernel({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(dataDir,'absent')},
transport:{id:'local136',start(){},stop(){},status:()=>({connected:true}),actions:{}},
priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})},
fetchImpl:async()=>{outbound++;throw new Error('136 child forbids external HTTP');}});
kernel.config.update({server:{token},telemetry:{enabled:false},proactive:{enabled:false},persona:{botName:'QA-136-SAVED-success'}});
kernel.log.setLevel('error');kernel.loader.startWatchers=()=>{};
kernel.store.appendIncoming('group:136',{mid:13601,senderId:'136',senderName:'合成成员',text:'QA-136-ARCHIVE-success'});
const port=await kernel.start();assert.notEqual(port,15967);assert.deepEqual(kernel.loader.listEntries(),[]);process.send({port,owners:[],outbound,dnsCalls});
let stopping=false;async function stop(){if(stopping)return;stopping=true;try{await kernel.stop();assert.deepEqual(kernel.loader.listEntries(),[]);assert.equal(outbound,0);assert.equal(dnsCalls,0);process.send?.({type:'isolation',owners:[],outbound,dnsCalls});globalThis.fetch=nativeFetch;dns.lookup=nativeLookup;process.disconnect?.();}catch(error){console.error(error);process.exitCode=1;process.disconnect?.();}}
process.on('message',message=>{if(message==='stop')void stop();else if(message==='config-status')kernel.bus.emit('status',{configUpdated:true});});process.on('disconnect',()=>void stop());
`);
async function openCase(name, { childProcess = false, stopGate } = {}) {
  const dataDir = path.join(parent, name, 'data'), token = `synthetic-reset136-${name}`;
  assert.equal(path.dirname(path.dirname(path.resolve(dataDir))), path.resolve(parent));
  assert.equal(path.resolve(dataDir).startsWith(path.resolve(appRoot) + path.sep), false, 'reset profiles cannot contain the shared application root');
  assert.equal(path.resolve(appRoot).startsWith(path.resolve(dataDir) + path.sep), false, 'reset cannot remove the shared application root');
  const savedName = `QA-136-SAVED-${name}`;
  let kernel, child, childExit, childOutput = '', childIsolation = null, port;
  if (childProcess) {
    child = fork(workerFile, [dataDir, token, appRoot], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.on('message', message => { if (message.type === 'isolation') childIsolation = message; });
    child.stdout.on('data', data => { childOutput += data; }); child.stderr.on('data', data => { childOutput += data; });
    childExit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`136 child readiness timeout: ${childOutput}`)), 10000);
      child.once('message', message => { clearTimeout(timer); assert.deepEqual(message.owners, []); assert.equal(message.outbound, 0); assert.equal(message.dnsCalls, 0); resolve(message.port); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      childExit.then(({ code }) => { clearTimeout(timer); reject(new Error(`136 child exited before readiness: ${code} ${childOutput}`)); });
    });
  } else {
    kernel = fixtureKernel(dataDir, { stopGate });
    kernel.config.update({ server: { token }, telemetry: { enabled: false }, proactive: { enabled: false }, persona: { botName: savedName } });
    kernel.log.setLevel('error'); kernel.loader.startWatchers = () => {};
    kernel.store.appendIncoming('group:136', { mid: 13601, senderId: '136', senderName: '合成成员', text: `QA-136-ARCHIVE-${name}` });
    port = await kernel.start(); assert.deepEqual(kernel.loader.listEntries(), []);
  }
  assert.notEqual(port, 15967);
  const base = `http://127.0.0.1:${port}`; ownedOrigins.add(base);
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await routeOwnedPage(page, base);
  page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
  if (process.env.QA_RESET136_BASELINE_SOURCE) {
    const oldPanel = fs.readFileSync(process.env.QA_RESET136_BASELINE_SOURCE, 'utf8');
    await page.route('**/panels/settings/panel.js', route => route.fulfill({ contentType: 'text/javascript', body: oldPanel }));
  }
  const requests = []; page.on('request', request => requests.push({ method: request.method(), path: new URL(request.url()).pathname, body: request.postData(), settingsSave: isSettingsSaveRequest(request) }));
  await page.goto(`${base}/?token=${token}`); await page.locator('#nav button[data-panel=settings]').click();
  const frame = page.frameLocator('#panel-host iframe');
  await frame.locator('#status').filter({ hasText: '配置已读取' }).waitFor();
  await page.emulateMedia({reducedMotion:'reduce'});await settingsSection(frame,'persona');
  const input = frame.locator('#field-persona-botName');
  const record = { kernel, page, frame, dataDir, base, token, input, savedName, requests,
    emitConfigUpdated() { if (child) child.send('config-status'); else kernel.bus.emit('status', { configUpdated: true }); },
    disk: () => JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')),
    async close() {
      if (!live.has(record)) return;
      await page.close();
      if (child) {
        if (child.exitCode === null && child.connected) child.send('stop');
        const exited = await childExit; assert.equal(exited.code, 0, `136 child did not stop normally: ${childOutput}`);
        assert.deepEqual(childIsolation, { type: 'isolation', owners: [], outbound: 0, dnsCalls: 0 }, 'the real worker exits with isolated owners and zero outbound attempts');
      } else { assert.deepEqual(kernel.loader.listEntries(), []); await kernel.stop(); }
      live.delete(record);
    },
  };
  live.add(record); return record;
}
const resetRequests = c => c.requests.filter(request => request.method === 'POST' && request.path === '/api/reset-data');
async function waitForGate(gate, label) {
  let timer;
  try {
    await Promise.race([gate, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`136 timed out waiting for ${label}`)), 8000); })]);
  } finally { clearTimeout(timer); }
}
async function fillResetName(c,value){await settingsSection(c.frame,'persona');await c.input.fill(value);}
async function resetClick(c){if(!await c.frame.locator('#settings-sidebar a[data-target=desktop].is-active').count())await settingsSection(c.frame,'reset');else await openSettingsFold(c.frame,'layout-data');await c.frame.locator('#reset').click();}
async function chargeReset(c) { for (let i = 0; i < 6; i++) await resetClick(c); }
async function acceptReset(c) {
  const reply = c.page.waitForResponse(response => new URL(response.url()).pathname === '/api/reset-data' && response.request().method() === 'POST');
  reply.catch(() => {});
  await chargeReset(c);
  return reply;
}
try {
  browser = await playwright.chromium.launch({ executablePath, headless: process.env.QA_HEADLESS !== '0' });
  console.log('· Actual accepted reset retains backup/message/restart state without claiming completion or re-reading the form');
  {
    const c = await openCase('success', { childProcess: true });
    await c.page.clock.install(); await c.page.clock.pauseAt(new Date(Date.now() + 1000));
    const response = await acceptReset(c); assert.equal(response.status(), 200);
    const result = await response.json(); assert.equal(result.ok, true); assert.equal(result.restartRequired, true);
    assert.equal(result.resetAccepted, true); assert.equal(result.resetCompleted, false);
    console.log('  Actual HTTP 200:', JSON.stringify({ resetAccepted: result.resetAccepted, resetCompleted: result.resetCompleted, restartRequired: result.restartRequired, backupDir: result.backupDir, message: result.message }));
    assert.ok(result.backupDir); assert.equal(path.dirname(result.backupDir), path.dirname(c.dataDir));
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.backupDir, 'config.json'), 'utf8')).persona.botName, c.savedName);
    assert.match(fs.readFileSync(path.join(result.backupDir, 'messages', 'group_136.json'), 'utf8'), /QA-136-ARCHIVE-success/);
    assert.equal(c.disk().persona.botName, c.savedName, 'Accepted reset is pending until the old process exits');
    await c.frame.locator('#reset-result[data-state=accepted]').waitFor();
    assert.match(await c.frame.locator('#status').textContent(), /请重启/);
    const details = await c.frame.locator('#reset-result').innerText();
    assert.ok(details.includes(result.message)); assert.ok(details.includes(result.backupDir));
    assert.match(details, /等待重启完成/); assert.doesNotMatch(details, /已重置为初始形态|重置已完成|配置已读取/);
    assert.match(details, /桌面应用/); assert.match(details, /浏览器/); assert.match(details, /刷新.*重启|刷新.*不能/);
    assert.equal(await c.input.isDisabled(), true);
    assert.equal(await c.frame.locator('#save').isDisabled(), true);
    assert.equal(await c.frame.locator('#reload').isDisabled(), true);
    assert.equal(await c.frame.locator('#reset').isDisabled(), true, 'Accepted reset remains locked after the progress action finishes');
    const configPosts = c.requests.filter(request => request.settingsSave).length;
    c.emitConfigUpdated();
    await c.page.locator('#nav button[data-panel=sessions]').click();
    assert.equal(c.requests.filter(request => request.settingsSave).length, configPosts, 'Leaving the reset form cannot resurrect old settings');
    assert.equal(resetRequests(c).length, 1);
    await c.page.locator('#nav button[data-panel=settings]').click();
    await c.frame.locator('#reset-result[data-state=accepted]').waitFor();
    assert.ok((await c.frame.locator('#reset-result').innerText()).includes(result.backupDir));
    await settingsSection(c.frame,'persona');
    assert.equal(await c.input.isDisabled(), true, 'Remount restores the actual pending reset state');
    await c.page.reload(); await c.page.locator('#nav button[data-panel=settings]').click();
    await c.frame.locator('#reset-result[data-state=accepted]').waitFor();
    await settingsSection(c.frame,'persona');
    assert.equal(await c.input.isDisabled(), true, 'F5 does not advertise a reset-complete editable form');
    assert.match(await c.frame.locator('#status').textContent(), /等待重启完成/);
    assert.equal(c.requests.filter(request => request.settingsSave).length, configPosts);
    await c.close();
    const restarted = fixtureKernel(c.dataDir);
    try {
      restarted.log.setLevel('error'); restarted.loader.startWatchers = () => {};
      const freshPort = await restarted.start(); assert.notEqual(freshPort, 15967); ownedOrigins.add(`http://127.0.0.1:${freshPort}`); assert.deepEqual(restarted.loader.listEntries(), []);
      assert.notEqual(c.disk().persona.botName, c.savedName, 'A new kernel performs the committed reset before loading configuration');
      assert.equal(fs.existsSync(path.join(c.dataDir, 'messages', 'group_136.json')), false);
      assert.equal(restarted.store.recent('group:136', 10).length, 0, 'A first read may create a new empty archive, but it cannot bring old messages back');
      assert.equal(JSON.parse(fs.readFileSync(path.join(result.backupDir, 'config.json'), 'utf8')).persona.botName, c.savedName);
      const fresh = await browser.newPage(); await routeOwnedPage(fresh, `http://127.0.0.1:${freshPort}`); fresh.on('pageerror', error => errors.push(error.message));
      await fresh.goto(`http://127.0.0.1:${freshPort}/?token=${encodeURIComponent(restarted.config.get().server.token)}`);
      await fresh.locator('#nav button[data-panel=settings]').click();
      const freshFrame = fresh.frameLocator('#panel-host iframe');
      await freshFrame.locator('#status').filter({ hasText: '配置已读取' }).waitFor();
      await settingsSection(freshFrame,'persona');
      assert.equal(await freshFrame.locator('#field-persona-botName').isEnabled(), true);
      assert.equal(await freshFrame.locator('#reset-result').count(), 0, 'A genuinely restarted kernel is no longer pending reset');
      await fresh.close();
    } finally { await restarted.stop(); }
  }
  console.log('· Partial reset progress allows autosave; Escape and natural decay retain settings and leave reset unsubmitted');
  {
    const c = await openCase('cancel');
    await c.page.clock.install(); await c.page.clock.pauseAt(new Date(Date.now() + 1000));
    await fillResetName(c,'QA-136-CANCEL-DRAFT'); await c.page.clock.runFor(400); await resetClick(c);
    const autoSaved = c.page.waitForResponse(response => isSettingsSaveRequest(response.request())); autoSaved.catch(() => {});
    await c.page.clock.runFor(350); assert.equal((await autoSaved).status(), 200);
    assert.equal(c.disk().persona.botName, 'QA-136-CANCEL-DRAFT', 'Partial reset progress must not pause the existing ordinary autosave');
    assert.ok(Math.abs(Number(await c.frame.locator('#reset').getAttribute('data-danger-progress')) - 1 / 6) < .001, 'Progress is still within the 500ms hold when autosave commits');
    assert.equal(await c.frame.locator('dialog.confirm-panel').count(), 0, 'Partial progress uses no confirmation dialog');
    assert.equal(resetRequests(c).length, 0);
    await c.page.keyboard.press('Escape'); assert.equal(await c.frame.locator('#reset').getAttribute('data-danger-progress'), '0');
    assert.equal(await c.input.inputValue(), 'QA-136-CANCEL-DRAFT');
    await fillResetName(c,'QA-136-DECAY-DRAFT'); for (let i = 0; i < 3; i++) await resetClick(c);
    await c.page.clock.runFor(499); assert.ok(Math.abs(Number(await c.frame.locator('#reset').getAttribute('data-danger-progress')) - .5) < .001);
    const decaySaved = c.page.waitForResponse(response => isSettingsSaveRequest(response.request())); decaySaved.catch(() => {});
    await c.page.clock.runFor(1001); assert.equal((await decaySaved).status(), 200);
    assert.equal(await c.frame.locator('#reset').getAttribute('data-danger-progress'), '0'); assert.equal(c.disk().persona.botName, 'QA-136-DECAY-DRAFT'); assert.equal(resetRequests(c).length, 0);
    await fillResetName(c,'QA-136-CANCEL-MANUAL-DRAFT'); await resetClick(c); await c.page.keyboard.press('Escape');
    assert.equal(await c.input.inputValue(), 'QA-136-CANCEL-MANUAL-DRAFT'); assert.equal(await c.input.isEnabled(), true);
    const saved = c.page.waitForResponse(response => isSettingsSaveRequest(response.request()));
    saved.catch(() => {}); await settingsSave(c.frame); assert.equal((await saved).status(), 200);
    await c.frame.locator('#status').filter({ hasText: '已保存' }).waitFor();
    assert.equal(c.disk().persona.botName, 'QA-136-CANCEL-MANUAL-DRAFT'); assert.equal(resetRequests(c).length, 0);
    await c.close();
  }
  console.log('· Full progress waits for a real config response already in flight and excludes later unsaved drafts from the backup');
  {
    const c = await openCase('saving-race');
    await c.page.clock.install(); await c.page.clock.pauseAt(new Date(Date.now() + 1000));
    let releaseSave, saveSeen, held = false;
    const heldSave = new Promise(resolve => { releaseSave = resolve; }), saveEntered = new Promise(resolve => { saveSeen = resolve; });
    await c.page.route(SETTINGS_SAVE_ROUTE, async route => {
      if (!isSettingsSaveRequest(route.request()) || held) return route.continue(); held = true;
      const response = await route.fetch(); saveSeen(); await heldSave; await route.fulfill({ response });
    });
    try {
      await fillResetName(c,'QA-136-RACE-SAVED'); await settingsSave(c.frame); await waitForGate(saveEntered, 'the held config response');
      assert.equal(c.disk().persona.botName, 'QA-136-RACE-SAVED');
      await fillResetName(c,'QA-136-RACE-LATER-DRAFT');
      const resetReply = c.page.waitForResponse(response => new URL(response.url()).pathname === '/api/reset-data' && response.request().method() === 'POST'); resetReply.catch(() => {});
      await chargeReset(c); assert.equal(await c.frame.locator('#reset').isDisabled(), true);
      await c.page.clock.runFor(1000); assert.equal(resetRequests(c).length, 0, 'Reset cannot overtake the in-flight config response');
      assert.equal(c.requests.filter(request => request.settingsSave).length, 1, 'Only fully charged reset pauses the queued later autosave');
      releaseSave(); const response = await resetReply; assert.equal(response.status(), 200); const receipt = await response.json();
      assert.equal(JSON.parse(fs.readFileSync(path.join(receipt.backupDir, 'config.json'), 'utf8')).persona.botName, 'QA-136-RACE-SAVED', 'Backup includes the completed request and excludes the subsequent unsaved draft');
      await c.frame.locator('#reset-result[data-state=accepted]').waitFor(); assert.equal(await c.input.isDisabled(), true); assert.equal(await c.frame.locator('#reset').isDisabled(), true);
      assert.equal(c.disk().persona.botName, 'QA-136-RACE-SAVED'); assert.equal(resetRequests(c).length, 1);
    } finally { releaseSave(); await c.close(); }
  }
  console.log('· A real backup failure produces HTTP 500 and retains the unsaved input, with a persistent failure result');
  {
    const c = await openCase('failure');
    await c.page.clock.install(); await c.page.clock.pauseAt(new Date(Date.now() + 1000));
    await fillResetName(c,'QA-136-FAILED-DRAFT');
    const configBefore = fs.readFileSync(path.join(c.dataDir, 'config.json'), 'utf8');
    const messagesBefore = fs.readFileSync(path.join(c.dataDir, 'messages', 'group_136.json'), 'utf8');
    const originalCopy = fs.cpSync; let injected = 0;
    fs.cpSync = (source, ...args) => {
      if (path.resolve(source) === path.resolve(c.dataDir)) { injected++; throw Object.assign(new Error('QA-136 synthetic backup failure'), { code: 'EACCES' }); }
      return originalCopy(source, ...args);
    };
    try {
      const response = await acceptReset(c); assert.equal(response.status(), 500);
      const result = await response.json(); assert.match(result.error, /重置未提交，原数据未删除/); assert.match(result.error, /QA-136/); assert.equal(injected, 1);
      await c.frame.locator('#reset-result[data-state=error]').waitFor();
      assert.match(await c.frame.locator('#reset-result').innerText(), /重置未提交，原数据未删除/);
      assert.match(await c.frame.locator('#reset-result').innerText(), /QA-136/);
      assert.equal(await c.input.inputValue(), 'QA-136-FAILED-DRAFT'); assert.equal(await c.input.isEnabled(), true);
      assert.equal(await c.frame.locator('#save').isEnabled(), true); assert.equal(await c.frame.locator('#reload').isEnabled(), true);
      assert.equal(c.disk().persona.botName, c.savedName);
      assert.equal(fs.readFileSync(path.join(c.dataDir, 'config.json'), 'utf8'), configBefore, 'Backup failure leaves the original saved config byte-for-byte intact');
      assert.equal(fs.readFileSync(path.join(c.dataDir, 'messages', 'group_136.json'), 'utf8'), messagesBefore, 'Backup failure leaves the original messages byte-for-byte intact');
      assert.equal(c.kernel.store.recent('group:136', 10).at(-1).text, 'QA-136-ARCHIVE-failure');
      assert.equal(resetRequests(c).length, 1);
      const saved = c.page.waitForResponse(reply => isSettingsSaveRequest(reply.request()));
      saved.catch(() => {}); await settingsSave(c.frame); assert.equal((await saved).status(), 200);
      await c.frame.locator('#status').filter({ hasText: '已保存' }).waitFor();
      assert.equal(c.disk().persona.botName, 'QA-136-FAILED-DRAFT');
    } finally { fs.cpSync = originalCopy; await c.close(); }
  }
  console.log('· A newly opened preparing view receives real final SSE; a delayed preparing HTTP reply cannot relock the failed form');
  {
    let releaseStop, stopSeen, releaseStatus, statusSeen;
    const heldStop = new Promise(resolve => { releaseStop = resolve; });
    const stopEntered = new Promise(resolve => { stopSeen = resolve; });
    const heldStatus = new Promise(resolve => { releaseStatus = resolve; });
    const statusEntered = new Promise(resolve => { statusSeen = resolve; });
    const c = await openCase('peer-failure', { stopGate: () => { stopSeen(); return heldStop; } });
    // This case tests cross-window reset ordering, not wall-clock click decay.
    // Keep the intended six-click burst deterministic under a busy full runner.
    await c.page.clock.install(); await c.page.clock.pauseAt(new Date(Date.now() + 1000));
    const originalCopy = fs.cpSync; let peer, stale;
    fs.cpSync = (source, ...args) => {
      if (path.resolve(source) === path.resolve(c.dataDir)) throw Object.assign(new Error('QA-136 peer backup failure'), { code: 'EACCES' });
      return originalCopy(source, ...args);
    };
    const resetReply = acceptReset(c); resetReply.catch(() => {});
    try {
      await waitForGate(stopEntered, 'reset to enter transport.stop');
      peer = await browser.newPage(); await routeOwnedPage(peer, c.base); peer.setDefaultTimeout(8000); peer.on('pageerror', error => errors.push(error.message));
      await peer.goto(`${c.base}/?token=${c.token}`);
      await peer.locator('#sse').filter({ hasText: 'SSE 已连接' }).waitFor();
      await peer.locator('#nav button[data-panel=settings]').click();
      const f = peer.frameLocator('#panel-host iframe');
      await f.locator('#reset-result[data-state=preparing]').waitFor();
      await settingsSection(f,'persona');
      assert.equal(await f.locator('#field-persona-botName').isDisabled(), true);

      stale = await browser.newPage(); await routeOwnedPage(stale, c.base); stale.setDefaultTimeout(8000); stale.on('pageerror', error => errors.push(error.message));
      const firstStatus = stale.waitForResponse(response => new URL(response.url()).pathname === '/api/status' && response.request().method() === 'GET');
      firstStatus.catch(() => {});
      await stale.goto(`${c.base}/?token=${c.token}`); await firstStatus;
      await stale.locator('#sse').filter({ hasText: 'SSE 已连接' }).waitFor();
      // Startup recovery may already select settings when this paused instance
      // has no runnable panel. Ensure the next click is a real mount/read,
      // rather than assuming a click on the active tab will reload its status.
      await stale.locator('#nav button[data-panel=sessions]').click();
      await stale.locator('#nav button.active[data-panel=sessions]').waitFor();
      let held = false;
      await stale.route('**/api/status', async route => {
        if (held) return route.continue(); held = true;
        const response = await route.fetch();
        assert.equal((await response.json()).reset.phase, 'preparing'); statusSeen();
        await heldStatus; await route.fulfill({ response });
      });
      await stale.locator('#nav button[data-panel=settings]').click(); await waitForGate(statusEntered, 'the held preparing status response');
      const delayed = stale.frameLocator('#panel-host iframe');
      releaseStop(); assert.equal((await resetReply).status(), 500);
      await f.locator('#reset-result[data-state=error]').waitFor();
      await delayed.locator('#reset-result[data-state=error]').waitFor();
      releaseStatus();
      await settingsSection(delayed,'persona');
      assert.equal(await delayed.locator('#field-persona-botName').isEnabled(), true, 'Late preparing GET cannot replace the newer failed SSE state');
      assert.equal(await f.locator('#field-persona-botName').isEnabled(), true, 'A preparing view is unlocked by the real final failure event');
      await f.locator('#field-persona-botName').fill('QA-136-PEER-AFTER-FAILURE');
      const saved = peer.waitForResponse(response => isSettingsSaveRequest(response.request()));
      saved.catch(() => {}); await settingsSave(f); assert.equal((await saved).status(), 200);
      await f.locator('#status').filter({ hasText: '已保存' }).waitFor();
      assert.equal(c.disk().persona.botName, 'QA-136-PEER-AFTER-FAILURE');
      assert.match(fs.readFileSync(path.join(c.dataDir, 'messages', 'group_136.json'), 'utf8'), /QA-136-ARCHIVE-peer-failure/);
    } finally {
      releaseStop(); releaseStatus(); fs.cpSync = originalCopy;
      await peer?.close(); await stale?.close(); await c.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log('✓ 136 actual reset HTTP/backups, restart locking, partial-progress autosave/cancel/decay, save race and failed-reset drafts passed');
} catch (error) {
  for (const c of live) console.error('136 current reset consumer:', await c.frame.locator('#status').textContent().catch(() => ''), 'result cards:', await c.frame.locator('#reset-result').count().catch(() => 0));
  throw error;
} finally {
  for (const c of [...live]) await c.close();
  await browser?.close();
  assert.equal(path.dirname(path.resolve(parent)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(parent).startsWith('qqa-reset-ui136-'));
  globalThis.fetch = nativeFetch; dns.lookup = nativeLookup;
  fs.rmSync(parent, { recursive: true, force: true });
  assertOffline();
}

// Execute the unchanged automatic entry condition in an isolated Node child.
// Only the native Electron boundary is mocked; the ten-port failure uses the
// actual kernel/HTTP/lock implementation. No desktop, QQ or external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-electron131-'));
const productionMain = fileURLToPath(new URL('../electron/main.js', import.meta.url));
const productionKernel = new URL('../src/kernel/kernel.js', import.meta.url).href;
const mainSource = fs.readFileSync(process.env.QA131_SOURCE_MAIN || productionMain, 'utf8');
let passed = 0;
const servers = [];

async function occupiedRange() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const range = [];
    try {
      const first = http.createServer(); range.push(first);
      await new Promise((resolve, reject) => { first.once('error', reject); first.listen(0, '127.0.0.1', resolve); });
      const base = first.address().port;
      if (base > 65526) throw new Error('Need room for ten synthetic ports');
      for (let offset = 1; offset < 10; offset++) {
        const server = http.createServer(); range.push(server);
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(base + offset, '127.0.0.1', resolve); });
      }
      servers.push(...range); return base;
    } catch {
      await Promise.all(range.map(server => new Promise(resolve => server.listening ? server.close(resolve) : resolve())));
    }
  }
  throw new Error('Could not reserve ten local test ports');
}

async function runCase(phase, { exported = false, unhandled = false, args = [], port = 0, disableGpu = '0' } = {}) {
  const appRoot = path.join(root, `${phase}-${unhandled ? 'unhandled' : exported ? 'exported' : 'automatic'}`);
  const dataDir = path.join(appRoot, 'data');
  const eventsFile = path.join(appRoot, 'events.jsonl');
  fs.mkdirSync(path.join(appRoot, 'electron'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'src', 'kernel'), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(appRoot, 'electron', 'main.js'), mainSource);
  assert.equal(fs.readFileSync(path.join(appRoot, 'electron', 'main.js'), 'utf8'), mainSource, 'the automatic production entry is never rewritten');
  // Desktop preflight now selects the same default component closure as the
  // application. Preserve it verbatim; only the native launch factory remains
  // substituted below, and ten-ports still constructs the production kernel.
  const workspace = fileURLToPath(new URL('../', import.meta.url));
  const rendererLeaveSource = path.join(workspace, 'electron/renderer-leave.js'), rendererLeaveCopy = path.join(appRoot, 'electron/renderer-leave.js');
  fs.copyFileSync(rendererLeaveSource, rendererLeaveCopy);
  assert.deepEqual(fs.readFileSync(rendererLeaveCopy), fs.readFileSync(rendererLeaveSource), 'the real renderer leave dependency is copied byte-for-byte');
  for (const name of ['src', 'bundled']) fs.cpSync(path.join(workspace, name), path.join(appRoot, name), { recursive: true });
  fs.symlinkSync(path.join(workspace, 'node_modules'), path.join(appRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  if (phase === 'pending-reset-invalid') {
    // Real pre-userData reset validation fails before the kernel is created.
    // It must still enter the one-owner startup reporting/cleanup contract.
    fs.writeFileSync(dataDir + '.reset-pending.json', '{}');
  }
  const recordModule = path.join(appRoot, 'record.mjs');
  fs.writeFileSync(recordModule, `import fs from 'node:fs'; export function record(kind, data={}) { fs.appendFileSync(${JSON.stringify(eventsFile)}, JSON.stringify({kind,...data})+'\\n'); }`);
  const electronStub = path.join(appRoot, 'electron-stub.mjs');
  fs.writeFileSync(electronStub, `
    import fs from 'node:fs'; import path from 'node:path'; import {EventEmitter} from 'node:events'; import {record} from './record.mjs';
    const dataDir=${JSON.stringify(dataDir)}, root=${JSON.stringify(appRoot)}, phase=${JSON.stringify(phase)};
    export const windowError=new Error('131 synthetic window creation failure');
    export const app=new EventEmitter();
    Object.assign(app,{isPackaged:false,paths:{appData:path.join(root,'empty-app-data')},getPath(name){return this.paths[name]??root;},setPath(name,value){this.paths[name]=value;},
      disableHardwareAcceleration(){record('disable-gpu');},
      requestSingleInstanceLock(){return phase!=='single-instance';}, async whenReady(){record('ready');if(phase==='ready')throw new Error('131 synthetic readiness failure');},
      quit(){record('quit');},exit(code){record('exit',{code,lockPresent:fs.existsSync(path.join(dataDir,'qq-agent.lock'))});process.exitCode=code;setImmediate(()=>record('exit-tick'));},
      setLoginItemSettings(){record('login-item');}});
    export const dialog={showErrorBox(title,detail){record('dialog',{title,detail,lockPresent:fs.existsSync(path.join(dataDir,'qq-agent.lock'))});}};
    const handlers=new Map(); export const ipcMain=new EventEmitter(); ipcMain.handle=(name,fn)=>handlers.set(name,fn);ipcMain.removeHandler=name=>handlers.delete(name);
    export class BrowserWindow extends EventEmitter { constructor(){super();if(phase==='window')throw windowError;this.destroyed=false;this.contents=new EventEmitter();this.contents.mainFrame={url:''};this.contents.setWindowOpenHandler=()=>{};this.contents.isDestroyed=()=>this.destroyed;record('window');}
      get webContents(){return this.contents;} isDestroyed(){return this.destroyed;} async loadURL(url){this.contents.mainFrame={url};} show(){} hide(){} focus(){} destroy(){this.destroyed=true;this.contents.emit('destroyed');this.emit('closed');record('window-destroy');}}
    export const session={defaultSession:{setProxy:async()=>{},setPermissionRequestHandler(){}}};export const shell={openExternal(){throw new Error('No external navigation');}};
    process.on('exit',()=>record('ipc-at-exit',{handlers:handlers.size,listeners:ipcMain.eventNames().length}));
  `);
  const kernelStub = path.join(appRoot, 'kernel-stub.mjs');
  fs.writeFileSync(kernelStub, `
    import fs from 'node:fs';import path from 'node:path';import {record} from './record.mjs';
    const phase=${JSON.stringify(phase)},dataDir=${JSON.stringify(dataDir)};
    export const failureError=Object.assign(new Error('131 synthetic '+phase+' failure'),{code:'SYNTHETIC_STARTUP_131'});
    if(phase==='kernel-import')throw failureError;
    const realFactory=phase==='ten-ports'?(await import(${JSON.stringify(productionKernel)})).createKernel:null;
    export function createKernel(){record('factory');if(phase==='factory')throw failureError;
      if(realFactory){const kernel=realFactory({env:process.env,appRoot:${JSON.stringify(appRoot)},headless:true,priceUpdates:{refresh:async()=>({ok:true})}});const stop=kernel.stop;kernel.stop=async()=>{record('kernel-stop');return stop();};return kernel;}
      return {config:{get:()=>({server:{token:'synthetic131',autoStart:false,closeToTray:false}}),onChange(){return ()=>record('config-unsubscribe');}},bus:{emit(){}},
        async start(){record('kernel-start');fs.writeFileSync(path.join(dataDir,'qq-agent.lock'),'synthetic-owned-lock');if(['start','stop-fails'].includes(phase))throw failureError;return 43210;},
        async stop(){record('kernel-stop');fs.rmSync(path.join(dataDir,'qq-agent.lock'),{force:true});if(phase==='stop-fails')throw new Error('131 synthetic cleanup failure');}};
    }
  `);
  const compositionStub = path.join(appRoot, 'composition-stub.mjs');
  fs.writeFileSync(compositionStub, `
    import {createKernel} from './kernel-stub.mjs';
    import {defaultComponents} from './bundled/runtime-defaults/components.js';
    export async function loadComposition(){return {components:defaultComponents,composition:{layers:[],ui:{panels:[],assets:{}}}};}
    export async function createApplication(options){const application=createKernel();const stop=application.stop;application.stop=async()=>{try{return await stop();}finally{await options.lifecycle?.close();}};return application;}
  `);
  const electronImportError = path.join(appRoot, 'electron-import-error.mjs');
  fs.writeFileSync(electronImportError, `throw new Error('131 synthetic Electron import failure');`);
  const loader = path.join(appRoot, 'loader.mjs');
  fs.writeFileSync(loader, `export async function resolve(specifier,context,next){
    if(specifier==='electron')return {url:${JSON.stringify(pathToFileURL(phase === 'electron-import' ? electronImportError : electronStub).href)},shortCircuit:true};
    if(specifier==='../src/kernel/kernel.js'&&context.parentURL===${JSON.stringify(pathToFileURL(path.join(appRoot, 'electron', 'main.js')).href)})return {url:${JSON.stringify(pathToFileURL(kernelStub).href)},shortCircuit:true};
    if(specifier==='../src/kernel/composition.js'&&context.parentURL===${JSON.stringify(pathToFileURL(path.join(appRoot, 'electron', 'main.js')).href)})return {url:${JSON.stringify(pathToFileURL(compositionStub).href)},shortCircuit:true};
    return next(specifier,context);
  }`);
  const preload = path.join(appRoot, 'register.mjs');
  fs.writeFileSync(preload, `import {register} from 'node:module';register(${JSON.stringify(pathToFileURL(loader).href)});
    globalThis.fetch=async url=>{if(String(url)!=='https://kondius.cn/qq-agent/version.json')throw new Error('Unexpected external request');return {ok:true,json:async()=>({version:'0.5.0'})};};`);
  let script = path.join(appRoot, 'electron', 'main.js');
  if (exported) {
    script = path.join(appRoot, 'caller.mjs');
    fs.writeFileSync(script, `import {record} from './record.mjs';import * as electron from './electron-stub.mjs';import {createKernel,failureError} from './kernel-stub.mjs';import {startElectron,stopElectron} from './electron/main.js';
      ${unhandled ? `process.on('unhandledRejection',error=>record('unhandled-observed',{sameError:error===failureError}));void startElectron(electron,{createKernel});` : `
        try{const result=await startElectron(electron,{createKernel});record('resolved',{acquired:result.acquired});await stopElectron(electron);await stopElectron(electron);}
        catch(error){record('rejected',{sameError:error===failureError||error===electron.windowError,message:error.message,code:error.code});}
      `}
    `);
  }
  const env = { ...process.env, QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PROFILE: '99', QQ_AGENT_PORT: String(port), QQ_AGENT_MIGRATE_FROM: path.join(appRoot, 'absent-migration'), QQ_AGENT_DISABLE_GPU: disableGpu };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, script, ...args], { env, cwd: appRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
  const timeout = setTimeout(() => child.kill(), 15000);
  const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }).finally(() => clearTimeout(timeout));
  const events = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  const diagnostics = [path.join(dataDir, 'boot-diag.log'), path.join(appRoot, 'boot-diag.log')].filter(file => fs.existsSync(file)).map(file => fs.readFileSync(file, 'utf8')).join('\n');
  return { events, diagnostics, stderr, stdout, exitCode, dataDir, count: kind => events.filter(item => item.kind === kind).length };
}

function failed(result, { message, stops = 0, dialogs = 1, rejected = false, cleanupFailure = false } = {}) {
  console.log(`· failure: dialogs=${result.count('dialog')}, startup records=${(result.diagnostics.match(/ startup-failed /g) || []).length}, stops=${result.count('kernel-stop')}, exit=${result.exitCode}`);
  assert.equal(result.exitCode, 1, result.stderr || result.stdout);
  assert.equal(result.count('dialog'), dialogs, 'the actual automatic entry must not report the same error twice: ' + result.stderr);
  assert.equal((result.diagnostics.match(/ startup-failed /g) || []).length, 1, 'one startup diagnostic for the original error');
  assert.equal((result.stderr.match(/\[electron\] 启动失败：/g) || []).length, 1, 'the original failure is still logged once');
  assert.match(result.diagnostics, message); assert.match(result.stderr, message);
  assert.equal(result.count('kernel-stop'), stops);
  assert.equal(fs.existsSync(path.join(result.dataDir, 'qq-agent.lock')), false, 'cleanup releases the owned data lock before reporting');
  assert.equal((result.diagnostics.match(/ startup-stop-failed /g) || []).length, cleanupFailure ? 1 : 0);
  assert.doesNotMatch(result.diagnostics, /uncaught-fatal|shutdown-failed/);
  if (dialogs) {
    assert.equal(result.count('exit'), 1); assert.equal(result.events.find(item => item.kind === 'exit').code, 1);
    const dialog = result.events.find(item => item.kind === 'dialog');
    assert.equal(dialog.title, 'QQ Agent 启动失败'); assert.equal(dialog.lockPresent, false); assert.match(dialog.detail, message);
    assert.deepEqual(result.events.find(item => item.kind === 'ipc-at-exit'), { kind: 'ipc-at-exit', handlers: 0, listeners: 0 });
  }
  if (rejected) {
    assert.equal(result.count('rejected'), 1, 'exported callers receive a rejection instead of a swallowed error');
    const error = result.events.find(item => item.kind === 'rejected'); assert.equal(error.sameError, true); assert.match(error.message, message);
  }
  passed++;
}

try {
  failed(await runCase('start'), { message: /131 synthetic start failure/, stops: 1 });
  console.log('✓ Automatic main-module startup presents and exits once after kernel cleanup');
  failed(await runCase('start', { exported: true }), { message: /131 synthetic start failure/, stops: 1, rejected: true });
  failed(await runCase('stop-fails', { exported: true }), { message: /131 synthetic stop-fails failure/, stops: 1, rejected: true, cleanupFailure: true });
  const unhandled = await runCase('start', { exported: true, unhandled: true });
  failed(unhandled, { message: /131 synthetic start failure/, stops: 1 });
  assert.deepEqual(unhandled.events.find(item => item.kind === 'unhandled-observed'), { kind: 'unhandled-observed', sameError: true });
  console.log('✓ Exported calls keep the original error even when cleanup also fails');
  failed(await runCase('argv-preflight', { args: ['--qq-agent-profile=0'] }), { message: /profile 参数必须是正整数/ });
  failed(await runCase('pending-reset-invalid'), { message: /待重置标记无效/ });
  failed(await runCase('ready'), { message: /131 synthetic readiness failure/ });
  failed(await runCase('kernel-import'), { message: /131 synthetic kernel-import failure/ });
  failed(await runCase('factory', { exported: true }), { message: /131 synthetic factory failure/, rejected: true });
  failed(await runCase('electron-import'), { message: /131 synthetic Electron import failure/, dialogs: 0 });
  console.log('✓ Preflight, readiness, imports and factory failures have one reporting owner');
  failed(await runCase('window', { exported: true }), { message: /131 synthetic window creation failure/, stops: 1, rejected: true });
  console.log('✓ A post-start window failure cleans kernel, config subscription and desktop IPC');
  const port = await occupiedRange();
  failed(await runCase('ten-ports', { port }), { message: /EADDRINUSE/, stops: 1 });
  console.log('✓ Real kernel ten-port exhaustion releases its actual instance lock before the single dialog');
  const normal = await runCase('normal', { exported: true });
  assert.equal(normal.exitCode, 0, normal.stderr); assert.equal(normal.count('resolved'), 1);
  assert.equal(normal.count('disable-gpu'), 0, 'normal startup leaves supported GPU rendering enabled');
  assert.equal(normal.count('kernel-stop'), 1); assert.equal(normal.count('quit'), 1); assert.equal(normal.count('exit'), 0); assert.equal(normal.count('dialog'), 0);
  assert.equal(normal.count('config-unsubscribe'), 1); assert.equal(normal.count('window-destroy'), 1); assert.doesNotMatch(normal.diagnostics, /startup-failed|shutdown-failed|uncaught-fatal/);
  assert.equal(fs.existsSync(path.join(normal.dataDir, 'qq-agent.lock')), false); passed++;
  const fallback = await runCase('gpu-fallback', { exported: true, disableGpu: '1' });
  assert.equal(fallback.exitCode, 0, fallback.stderr); assert.equal(fallback.count('resolved'), 1);
  assert.equal(fallback.count('disable-gpu'), 1, 'the explicit compatibility opt-out disables acceleration once');
  assert.ok(fallback.events.findIndex(item => item.kind === 'disable-gpu') < fallback.events.findIndex(item => item.kind === 'ready'), 'software fallback is selected before Electron readiness');
  assert.equal(fallback.count('kernel-stop'), 1); assert.equal(fallback.count('window-destroy'), 1);
  assert.equal(fallback.count('dialog'), 0); assert.equal(fs.existsSync(path.join(fallback.dataDir, 'qq-agent.lock')), false); passed++;
  console.log('✓ Default GPU selection and explicit pre-ready software fallback both preserve normal cleanup');
  const secondary = await runCase('single-instance');
  assert.equal(secondary.exitCode, 0, secondary.stderr); assert.equal(secondary.count('factory'), 0); assert.equal(secondary.count('dialog'), 0); assert.equal(secondary.count('quit'), 1);
  assert.match(secondary.diagnostics, /single-instance-denied/); assert.doesNotMatch(secondary.diagnostics, /startup-failed/); passed++;
  console.log(`✓ 131 Startup reporting: ${passed} scenarios passed; automatic entry, real local HTTP/lock and mock native boundaries only`);
} finally {
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  const target = path.resolve(root);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir())); assert.ok(path.basename(target).startsWith('qqa-electron131-'));
  fs.rmSync(target, { recursive: true, force: true });
}

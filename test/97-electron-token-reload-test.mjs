// Exercise the real main-process IPC handler across renderer reload generations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { startElectron,stopElectron } from '../electron/main.js';

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-electron97-'));
const originalDataDir=process.env.QQ_AGENT_DATA_DIR,originalFetch=globalThis.fetch;
process.env.QQ_AGENT_DATA_DIR=dataDir;
globalThis.fetch=async()=>({ok:true,json:async()=>({version:'0.5.0'})});
const handlers=new Map(),windows=[];
class BrowserWindow extends EventEmitter {
  constructor(options){
    super();this.options=options;this.destroyed=false;
    this._contents=new EventEmitter();this._contents.mainFrame={url:''};
    this._contents.setWindowOpenHandler=()=>{};
    this._contents.isDestroyed=()=>this.destroyed;
    windows.push(this);
  }
  isDestroyed(){return this.destroyed;}
  get webContents(){if(this.destroyed)throw new TypeError('Object has been destroyed');return this._contents;}
  show(){}hide(){}focus(){}
  async loadURL(url){this.loadedUrl=url;this._contents.mainFrame={url};}
  destroy(){this.destroyed=true;this._contents.emit('destroyed');this.emit('closed');}
}
const app=new EventEmitter();Object.assign(app,{isPackaged:false,paths:{appData:path.join(dataDir,'app-data')},getPath(name){return this.paths[name]??dataDir;},setPath(name,value){this.paths[name]=value;},requestSingleInstanceLock:()=>true,whenReady:async()=>{},quit(){}});
const electron={app,BrowserWindow,ipcMain:{handle:(name,fn)=>handlers.set(name,fn),removeHandler:name=>handlers.delete(name),on(){},removeListener(){}},session:{defaultSession:{setProxy:async()=>{},setPermissionRequestHandler(){}}},shell:{openExternal(){}}};
let stops=0;
try{
  const desktop=await startElectron(electron,{createKernel:()=>({config:{get:()=>({server:{token:'reload-secret-97'}})},start:async()=>43210,stop:async()=>{stops++;},bus:{emit(){}}})});
  const win=desktop.window,contents=win.webContents,bootstrap=handlers.get('qq-agent:get-console-token');
  assert.equal(typeof bootstrap,'function');
  const event=()=>({sender:contents,senderFrame:contents.mainFrame});
  assert.equal(bootstrap(event()),'reload-secret-97','initial main-frame bootstrap succeeds');
  assert.equal(bootstrap(event()),'reload-secret-97','reading the token does not consume the credential');
  for(let i=0;i<3;i++){
    await win.loadURL('http://127.0.0.1:43210/');
    assert.equal(bootstrap(event()),'reload-secret-97','a new main-frame document receives its credential');
    assert.equal(new URL(win.loadedUrl).searchParams.has('token'),false);
  }

  console.log('· Token is restricted to the current main window and root console document');
  assert.equal(bootstrap({sender:contents}),'','missing frame rejected');
  assert.equal(bootstrap({sender:contents,senderFrame:{url:win.loadedUrl}}),'','iframe cannot impersonate the main frame by matching its URL');
  const staleFrame=contents.mainFrame;
  await win.loadURL(win.loadedUrl);
  assert.equal(bootstrap({sender:contents,senderFrame:staleFrame}),'','old document frame rejected after reload');
  for(const url of ['https://example.com/','http://127.0.0.1:43211/','http://localhost:43210/','http://127.0.0.1:43210/panels/sessions/index.html']){
    contents.mainFrame={url};assert.equal(bootstrap(event()),'',`unauthorized URL rejected: ${url}`);
  }
  contents.mainFrame={url:'http://127.0.0.1:43210/#settings'};
  assert.equal(bootstrap(event()),'reload-secret-97','local root hash is allowed');
  const other=new BrowserWindow({});await other.loadURL(win.loadedUrl);
  assert.equal(bootstrap({sender:other.webContents,senderFrame:other.webContents.mainFrame}),'','other windows rejected');

  console.log('· CommonJS preload reuses IPC on reload without storing a token in the renderer');
  for(let i=0;i<2;i++){
    let exposed;
    const require=()=>({contextBridge:{exposeInMainWorld(name,api){assert.equal(name,'qqAgentShell');exposed=api;}},ipcRenderer:{invoke(name){return Promise.resolve(handlers.get(name)(event()));},send(){}}});
    vm.runInNewContext(fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8'),{require});
    assert.equal(await exposed.getConsoleToken(),'reload-secret-97');
    assert.equal(Object.hasOwn(exposed,'token'),false);
    assert.equal(win.options.webPreferences.contextIsolation,true);
    assert.equal(win.options.webPreferences.sandbox,true);
  }
  assert.doesNotThrow(()=>win.destroy(),'destroy callbacks never read BrowserWindow.webContents after destruction');
  assert.throws(()=>win.webContents,/Object has been destroyed/,'mock enforces the native destroyed getter');
  assert.equal(bootstrap(event()),'','destroyed contents rejected and credential cleared');
  console.log('✓ 97 Electron token reload and main-frame boundaries passed');
}finally{
  await stopElectron(electron);assert.equal(stops,1);
  globalThis.fetch=originalFetch;
  if(originalDataDir===undefined)delete process.env.QQ_AGENT_DATA_DIR;else process.env.QQ_AGENT_DATA_DIR=originalDataDir;
  fs.rmSync(dataDir,{recursive:true,force:true});
}

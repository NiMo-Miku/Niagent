import {settingsSection,settingsSave,settingsBlocklist} from './settings-navigation.mjs';
// Synthetic default UI, owned random loopback port and disk only. No installed
// plugin, real account/QQ/model, external request, production port or packaging.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {createSettingsSaveLifecycleController} from '../src/console/settings-save-lifecycle.js';
import {createSettingsSaveLifecycle,SETTINGS_KEEPALIVE_BYTES,SETTINGS_LEASE_KEY} from '../ui/shell/settings-save-lifecycle.js';
import {createRendererLeave} from '../electron/renderer-leave.js';
import {RpcBridge} from '../ui/shell/rpc-bridge.js';
import {PanelRegistry} from '../ui/shell/panel-registry.js';
import {createApplication} from '../src/kernel/composition.js';
import {startElectron,stopElectron} from '../electron/main.js';

const source=path.resolve(import.meta.dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-save244-'));
const index=process.argv.indexOf('--evidence-dir'),evidence=index<0?path.join(source,'.qa-local/v04-parity-20261016/save244'):path.resolve(process.argv[index+1]);fs.mkdirSync(evidence,{recursive:true});
const pureOnly=process.argv.includes('--pure-only'),httpOnly=process.argv.includes('--http-only'),headed=process.argv.includes('--headed'),resetOnly=process.argv.includes('--reset-only');
const checks=[],errors=[],blocked=[],outbound=[],requests=[],identity={owner:'ui-'+'a'.repeat(60),generation:'b'.repeat(64)},lease='00000000-0000-4000-8000-000000000244';
const payload=(revision,patch,ticket=lease)=>({...identity,lease:ticket,revision,patch}),check=async(name,run)=>{await run();checks.push(name);console.log('✓ 244 '+name);};
const ticket=(controller,parentLease=null,retireParent=false)=>controller.open({...identity,parentLease,retireParent}).lease;
function memoryStorage(initial=null){const values=new Map(initial?[[SETTINGS_LEASE_KEY,initial]]:[]);return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};}
const manifest={id:'settings',kind:'bundled',title:'Settings',permissions:[],api:[],stateOwner:identity.owner,stateGeneration:identity.generation,saveLifecycle:{kind:'settings-v1'}};
let kernel,browser,base,appRoot,dataDir,completed=false;
let diskFailure=false,writeGate=null,baselineMode=false;
const nativeRename=fs.renameSync;
fs.renameSync=function(from,to){if(diskFailure&&String(to)===path.join(dataDir,'config.json'))throw Object.assign(Error('synthetic owned disk failure244'),{code:'EACCES'});return nativeRename.apply(this,arguments);};
const token='synthetic-save244',disk=()=>JSON.parse(fs.readFileSync(path.join(dataDir,'config.json'),'utf8'));
async function start(label,{baseline=false,mode=null}={}){
  baselineMode=baseline;
  appRoot=path.join(root,label,'app');dataDir=path.join(root,label,'data');fs.mkdirSync(appRoot,{recursive:true});fs.cpSync(path.join(source,'ui'),path.join(appRoot,'ui'),{recursive:true});for(const name of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,name));
  if(mode){const directory=path.join(appRoot,'overrides/lifecycle244');fs.mkdirSync(directory,{recursive:true});const replacement=mode!=='append';fs.writeFileSync(path.join(directory,'asset.js'),replacement?fs.readFileSync(path.join(source,'ui/panels/settings/save-lifecycle.js'),'utf8'):'export const unrelated244=true;');fs.writeFileSync(path.join(directory,'composition.json'),JSON.stringify({version:1,id:'lifecycle244',enabled:mode!=='disabled',order:244,ui:{assets:{[replacement?'panels/settings/save-lifecycle.js':'panels/extra244.js']:'./asset.js'}}}));}
  if(baseline){
    // Reconstructed lifecycle-only baseline, not an unmodified historical tree:
    // preserve the current default UI and restore the observed old leave/save
    // contract (700ms debounce, direct RPC, allSettled ack, 1s host timeout).
    fs.writeFileSync(path.join(appRoot,'ui/panels/settings/save-lifecycle.js'),"export function createSettingsSaveLifecycle({request}){return{enable(){},sync(){},save(snapshot){return request('POST','/api/config',snapshot.patch)},dispose(){}}}");
    const clientFile=path.join(appRoot,'ui/panels/panel-client.js');let client=fs.readFileSync(clientFile,'utf8');client=client.replace(/  if\(m.method==='panel.leaveCancelled'[\s\S]*?(?=  if\(Object.prototype.hasOwnProperty.call\(m,'id'\)\))/,"  if(m.method==='panel.leave'){if(leaving)return;leaving=true;Promise.allSettled([...beforeLeaveHandlers,...leaveHandlers].map(fn=>Promise.resolve().then(fn))).finally(()=>send({jsonrpc:'2.0',method:'panel.flushed',params:{flushId:m.params?.flushId}}));return;}\n");fs.writeFileSync(clientFile,client);
    const bridgeFile=path.join(appRoot,'ui/shell/rpc-bridge.js');let bridge=fs.readFileSync(bridgeFile,'utf8').replace('this.finishFlush(null,true),this.timeout)','this.finishFlush(null,true),1000)').replace('const failed=expired||params?.ok===false;','const failed=false;');fs.writeFileSync(bridgeFile,bridge);
    const shellFile=path.join(appRoot,'ui/shell/app.js');fs.writeFileSync(shellFile,fs.readFileSync(shellFile,'utf8').replace("window.addEventListener('beforeunload',event=>registry.beforeUnload(event));","window.addEventListener('beforeunload',()=>{void registry.unmount().catch(()=>{});});"));
    fs.writeFileSync(path.join(evidence,'baseline-provenance.json'),JSON.stringify({kind:'reconstructed lifecycle-only baseline',changes:['default save lifecycle adapter stub restores direct /api/config and no iframe unload guard','panel client restores parallel allSettled leave without failure acknowledgement','bridge restores 1000ms expire-and-resolve','host beforeunload starts asynchronous unmount; actual pagehide disposes frame']},null,2));
  }
  kernel=await createApplication({appRoot,headless:true,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},components:{'console.settingsSaveLifecycle':options=>createSettingsSaveLifecycleController({...options,applyPatch:async patch=>{if(writeGate){const gate=writeGate;gate.enter();await gate.promise;}return options.applyPatch(patch);}})},transport:{id:'inert244',start(){},stop(){},status:()=>({connected:false}),actions:{listGroups:async()=>[],listFriends:async()=>[]}},priceUpdates:{refresh:async()=>({ok:true}),updateCheck:async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false})},communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})},fetchImpl:async input=>{outbound.push(String(input));throw Error('No external IO244');}});
  kernel.log.setLevel('error');kernel.loader.startWatchers=()=>{};kernel.config.update({server:{port:0,token},telemetry:{enabled:false},proactive:{enabled:false},allowAllWhenEmpty:true,api:{baseUrl:'https://synthetic.invalid/v1',model:'synthetic244'},persona:{botName:'disk-before244'},ui:{refreshMs:3600000}});
  base=`http://127.0.0.1:${await kernel.start()}`;assert.notEqual(new URL(base).port,'15967');assert.deepEqual(kernel.loader.listEntries(),[]);
}
async function stop(){if(kernel)assert.deepEqual(kernel.loader.listEntries(),[]);await kernel?.stop();kernel=null;}
async function panels(){const response=await fetch(base+'/api/panels',{headers:{'x-console-token':token}});assert.equal(response.status,200);return(await response.json()).panels;}
const frame=page=>page.frameLocator('#panel-host iframe');
async function makePage(initialTicket=null){const context=await browser.newContext({viewport:{width:1360,height:950},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/'))requests.push({path:url.pathname,method:request.method()});});page.qaDecision='accept';page.qaDialogs=[];page.qaHeldKeepalive=null;await page.exposeFunction('qa244CaptureKeepalive',body=>{page.qaHeldKeepalive=body;});page.on('dialog',async dialog=>{page.qaDialogs.push(dialog.type());await dialog[page.qaDecision==='dismiss'?'dismiss':'accept']();});if(initialTicket)await context.addInitScript(({key,value})=>{if(window===top&&!sessionStorage.getItem(key))sessionStorage.setItem(key,value);},{key:SETTINGS_LEASE_KEY,value:initialTicket});await context.addInitScript(()=>{if(window!==top)return;window.qa244={stages:0,keepalives:[],dropStage:false,holdKeepalive:false};const nativeFetch=fetch.bind(window);window.fetch=(input,options)=>{if(options?.keepalive){window.qa244.keepalives.push({path:new URL(typeof input==='string'?input:input.url,location.href).pathname,bytes:new TextEncoder().encode(options.body??'').length});if(window.qa244.holdKeepalive)return window.qa244CaptureKeepalive(JSON.parse(options.body)).then(()=>new Promise(()=>{}));}return nativeFetch(input,options);};window.addEventListener('message',event=>{if(event.data?.method==='settings.saveState'){window.qa244.stages++;if(window.qa244.dropStage)event.stopImmediatePropagation();}});});await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base)return route.continue();blocked.push(url.href);return route.abort();});return page;}
async function settings(page){await page.goto(base);await page.locator('#nav button[data-panel=settings]').click();await frame(page).locator('#status').filter({hasText:'配置已读取'}).waitFor();await settingsSection(frame(page),'persona');return frame(page);}
async function fillName(page,value){const prior=await page.evaluate(()=>window.qa244.stages);await frame(page).locator('#field-persona-botName').click();await frame(page).locator('#field-persona-botName').fill(value);if(!baselineMode)await page.waitForFunction(prior=>window.qa244.stages>prior,prior);}
async function closePage(page){const closed=page.waitForEvent('close');await page.close({runBeforeUnload:true});await closed;}
async function cancelReload(page){page.qaDecision='dismiss';const dialog=page.waitForEvent('dialog');await page.evaluate(()=>location.reload());await dialog;}
async function waitDisk(value){for(let attempt=0;attempt<100;attempt++){if(disk().persona.botName===value)return;await new Promise(resolve=>setTimeout(resolve,25));}assert.equal(disk().persona.botName,value);}
try{
  await check('ordered same-lease receipts reject replays and retain failed writes for retry',async()=>{
    let config={},writes=0,release,entered;const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{entered=resolve;});
    const controller=createSettingsSaveLifecycleController({getIdentity:()=>identity,readConfig:()=>config,applyPatch:async patch=>{writes++;if(patch.hold){entered();await gate;}if(patch.fail)throw Error('synthetic disk failure244');config={...config,...patch};return{ok:true,config};}});
    const issued=ticket(controller),send=(revision,patch)=>controller.put(payload(revision,patch,issued));
    const first=send(1,{value:'older',hold:true});await ready;const latest=send(3,{value:'latest'});release();await Promise.all([first,latest]);assert.equal(config.value,'latest');
    const stale=await send(2,{value:'must not replay'});assert.equal(stale.stale,true);assert.equal(config.value,'latest');assert.equal(writes,2);
    const duplicate=await send(3,{value:'latest'});assert.equal(duplicate.config.value,'latest');assert.equal(writes,2);
    await assert.rejects(send(3,{value:'forged duplicate'}),error=>error.status===409);
    await assert.rejects(send(4,{fail:true}),/disk failure/);await send(4,{value:'retry'});assert.equal(config.value,'retry');
    await assert.rejects(controller.put({...payload(5,{},issued),generation:'c'.repeat(64)}),error=>error.status===409);
    await assert.rejects(send(5,{x:'x'.repeat(1024*1024)}),error=>error.status===413);
    controller.close();await assert.rejects(send(5,{}),error=>error.status===503);
  });
  await check('cancelled default unit recovers config drafts only during host-confirmed failed reset and never after disposal',async()=>{
    const cancellation=new AbortController(),disposers=[];let phase='idle',value='before',writes=0;const lifecycle={signal:cancellation.signal,onStop:dispose=>disposers.push(dispose)},controller=createSettingsSaveLifecycleController({lifecycle,canRecoverDraft:()=>phase==='failed',getIdentity:()=>identity,readConfig:()=>({value}),applyPatch:patch=>{writes++;value=patch.value;return{ok:true,config:{value}};}}),issued=ticket(controller);
    await controller.put(payload(1,{value:'saved-before-reset'},issued));phase='preparing';cancellation.abort(Error('synthetic reset quiescence244'));await assert.rejects(controller.put(payload(2,{value:'must-wait'},issued)),error=>error.status===503);assert.throws(()=>ticket(controller),error=>error.status===503);assert.equal(value,'saved-before-reset');
    phase='failed';await controller.put(payload(2,{value:'recovered-draft'},issued));assert.equal(value,'recovered-draft');assert.ok(ticket(controller));await assert.rejects(controller.put(payload(3,{server:{token:'must-remain-forbidden'}},issued)),error=>error.status===403);await assert.rejects(controller.put({...payload(3,{value:'forged-source'},issued),generation:'c'.repeat(64)}),error=>error.status===409);assert.equal(writes,2);
    phase='accepted';await assert.rejects(controller.put(payload(3,{value:'must-not-recover-accepted'},issued)),error=>error.status===503);assert.throws(()=>ticket(controller),error=>error.status===503);phase='failed';disposers[0]();await assert.rejects(controller.put(payload(3,{value:'must-stay-closed'},issued)),error=>error.status===503);assert.throws(()=>ticket(controller),error=>error.status===503);assert.equal(value,'recovered-draft');
    const explicit=createSettingsSaveLifecycleController({lifecycle:{signal:cancellation.signal},canRecoverDraft:()=>true,getIdentity:()=>identity,applyPatch:()=>({ok:true})});assert.ok(ticket(explicit));explicit.close();assert.throws(()=>ticket(explicit),error=>error.status===503);const strict=createSettingsSaveLifecycleController({lifecycle:{signal:cancellation.signal},getIdentity:()=>identity,applyPatch:()=>({ok:true})});assert.throws(()=>ticket(strict),error=>error.status===503);strict.close();
  });
  await check('only trusted default settings gets fixed authenticated bounded keepalive',async()=>{
    const calls=[],notices=[];const lifecycle=createSettingsSaveLifecycle({manifest,storage:memoryStorage(),api:{request:async(...args)=>{calls.push(args);return{ok:true,lease,expiresAt:Date.now()+1800000};}},notify:message=>notices.push(message)});await lifecycle.ready;calls.length=0;
    for(const def of [{...manifest,kind:'user'},{...manifest,id:'other'},{...manifest,saveLifecycle:undefined},{...manifest,stateGeneration:'forged'}])assert.equal(createSettingsSaveLifecycle({manifest:def}),null);
    const event=()=>({prevented:false,preventDefault(){this.prevented=true;}});
    lifecycle.stage({revision:1,patch:{botName:'late244'},error:'',guard:''});const close=event();assert.equal(lifecycle.beforeUnload(close),true);assert.equal(close.prevented,true);assert.equal(calls[0][1],'/api/config/lifecycle');assert.equal(calls[0][4].keepalive,true);assert.deepEqual(calls[0][2],payload(1,{botName:'late244'}));
    lifecycle.stage({revision:2,patch:{persona:{roleText:'汉'.repeat(SETTINGS_KEEPALIVE_BYTES)}},error:'',guard:''});lifecycle.beforeUnload(event());assert.equal(calls.length,1);assert.match(notices.at(-1),/上限/);
    lifecycle.stage({revision:3,patch:null,error:'invalid244',guard:''});lifecycle.beforeUnload(event());assert.equal(calls.length,1);assert.match(notices.at(-1),/invalid244/);
    lifecycle.stage({revision:4,patch:{botName:'ordinary244'},error:'',guard:'原始编辑未应用'});lifecycle.beforeUnload(event());assert.equal(calls.length,2);assert.match(notices.at(-1),/原始编辑/);
    lifecycle.stage({revision:5,patch:null,error:'',guard:''});assert.equal(lifecycle.beforeUnload(event()),false);lifecycle.close();
  });
  await check('asynchronous selected writer serializes actual arrival order across reload leases',async()=>{
    let release,enter,value='before';const promise=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{enter=resolve;});const controller=createSettingsSaveLifecycleController({getIdentity:()=>identity,readConfig:()=>({value}),applyPatch:async patch=>{if(patch.value==='old-document'){enter();await promise;}value=patch.value;return{ok:true,config:{value}};}});
    const oldTicket=ticket(controller),newTicket=ticket(controller);const older=controller.put(payload(1,{value:'old-document'},oldTicket));await entered;const newer=controller.put(payload(1,{value:'new-document'},newTicket));assert.equal(value,'before');release();await Promise.all([older,newer]);assert.equal(value,'new-document');controller.close();
  });
  await check('retired pagehide ticket fences a client-held old keepalive after new document commits',async()=>{
    let value='before',release,heldWrite;const held=new Promise(resolve=>{release=resolve;}),storage=memoryStorage(),controller=createSettingsSaveLifecycleController({getIdentity:()=>identity,readConfig:()=>({value}),applyPatch:patch=>{value=patch.value;return{ok:true,config:{value}};}});
    const request=async(_method,path,body,_query,options)=>path.endsWith('/open')?controller.open(body):options?.keepalive?(heldWrite=held.then(()=>controller.put(body))):controller.put(body);
    const old=createSettingsSaveLifecycle({manifest,storage,api:{request}});await old.ready;old.stage({revision:1,patch:{value:'old'},error:'',guard:''});old.beforeUnload({preventDefault(){}});
    assert.equal(JSON.parse(storage.getItem(SETTINGS_LEASE_KEY)).retired,false,'cancelled beforeunload alone never retires');old.close();assert.equal(JSON.parse(storage.getItem(SETTINGS_LEASE_KEY)).retired,true);
    const current=createSettingsSaveLifecycle({manifest,storage,api:{request}});await current.ready;await current.save({revision:1,patch:{value:'new'}});assert.equal(value,'new');release();await assert.rejects(heldWrite,error=>error.status===409);assert.equal(value,'new');current.close();controller.close();
  });
  await check('two active/clone tickets remain writable; expired/unknown tickets never revive; unavailable storage disables keepalive',async()=>{
    let value='before',time=0;const controller=createSettingsSaveLifecycleController({getIdentity:()=>identity,now:()=>time,ttl:10000,readConfig:()=>({value}),applyPatch:patch=>{value=patch.value;return{ok:true,config:{value}};}}),storage=memoryStorage();
    const api={request:async(_method,path,body)=>path.endsWith('/open')?controller.open(body):controller.put(body)},a=createSettingsSaveLifecycle({manifest,storage,api,now:()=>time});await a.ready;
    const copied=memoryStorage(storage.getItem(SETTINGS_LEASE_KEY)),b=createSettingsSaveLifecycle({manifest,storage:copied,api,now:()=>time});await b.ready;await a.save({revision:1,patch:{value:'a'}});await b.save({revision:1,patch:{value:'b'}});await a.save({revision:2,patch:{value:'a-still-active'}});assert.equal(value,'a-still-active');
    const old=JSON.parse(storage.getItem(SETTINGS_LEASE_KEY)).lease;time=11000;await assert.rejects(controller.put(payload(3,{value:'expired'},old)),error=>error.status===409);await assert.rejects(controller.put(payload(1,{value:'unknown'})),error=>error.status===409);const renewed=ticket(controller,old,true);await controller.put(payload(1,{value:'renewed'},renewed));await assert.rejects(controller.put(payload(4,{value:'must-not-revive'},old)),error=>error.status===409);assert.equal(value,'renewed');a.close();b.close();controller.close();
    const calls=[],notices=[],unavailable=createSettingsSaveLifecycle({manifest,storage:{getItem(){throw Error('disabled244');},setItem(){throw Error('disabled244');}},api:{request:async(...args)=>{calls.push(args);return{ok:true,lease,expiresAt:Date.now()+10000};}},notify:message=>notices.push(message)});await unavailable.ready;unavailable.stage({revision:1,patch:{value:'unavailable'},error:'',guard:''});assert.equal(unavailable.beforeUnload({preventDefault(){}}),true);assert.equal(calls.filter(call=>call[1]==='/api/config/lifecycle').length,0);assert.match(notices.at(-1),/存储不可用/);unavailable.close();
  });
  await check('late open receipt is retired without overwriting the newer document ticket',async()=>{
    let release;const held=new Promise(resolve=>{release=resolve;}),storage=memoryStorage(),calls=[];const stale=createSettingsSaveLifecycle({manifest,storage,api:{request:async(_method,path,body)=>{calls.push({path,body});if(body.retireOnly)return{ok:true,retired:true};await held;return{ok:true,lease,expiresAt:Date.now()+10000};}}});stale.close();const newer='00000000-0000-4000-8000-000000000245';storage.setItem(SETTINGS_LEASE_KEY,JSON.stringify({lease:newer,retired:false}));release();await assert.rejects(stale.ready,/已卸载/);assert.equal(calls.at(-1).body.retireOnly,true);assert.equal(calls.at(-1).body.parentLease,lease);assert.deepEqual(JSON.parse(storage.getItem(SETTINGS_LEASE_KEY)),{lease:newer,retired:false});
  });
  await check('self-renewal fences its still-live previous ticket after a cancelled unload',async()=>{
    let time=0,value='before',release,heldWrite;const held=new Promise(resolve=>{release=resolve;}),storage=memoryStorage(),controller=createSettingsSaveLifecycleController({getIdentity:()=>identity,now:()=>time,ttl:3000,readConfig:()=>({value}),applyPatch:patch=>{value=patch.value;return{ok:true,config:{value}};}}),api={request:async(_method,path,body,_query,options)=>path.endsWith('/open')?controller.open(body):options?.keepalive?(heldWrite=held.then(()=>controller.put(body))):controller.put(body)},host=createSettingsSaveLifecycle({manifest,storage,api,now:()=>time});await host.ready;
    time=1000;await host.save({revision:1,patch:{value:'first'}});const old=JSON.parse(storage.getItem(SETTINGS_LEASE_KEY)).lease;time=1900;host.stage({revision:2,patch:{value:'held-old'},error:'',guard:''});host.beforeUnload({preventDefault(){}});assert.equal(JSON.parse(storage.getItem(SETTINGS_LEASE_KEY)).retired,false);time=2500;await host.save({revision:3,patch:{value:'new'}});assert.notEqual(JSON.parse(storage.getItem(SETTINGS_LEASE_KEY)).lease,old);release();await assert.rejects(heldWrite,error=>error.status===409);assert.equal(value,'new');host.close();controller.close();
  });
  await check('actual default-frame RPC nonce never grants lifecycle token or root replacement authority',async()=>{
    const previous=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};const sent=[],calls=[],frame={contentWindow:{postMessage:message=>sent.push(message)},addEventListener(){}};const bridge=new RpcBridge({frame,manifest:{...manifest,api:[{method:'POST',path:'/api/config/lifecycle'},{method:'POST',path:'/api/config/lifecycle/open'}]},api:{request:async(...args)=>{calls.push(args);return{ok:true,lease,expiresAt:Date.now()+1800000};}}});await bridge.settingsSave.ready;calls.length=0;
    try{for(const patch of [{__replace__:{}},{server:null},{server:[]},{server:{token:'forged244'}},{server:{__replace__:{token:'forged244'}}}]){
      for(const method of ['settings.saveState','settings.save']){await bridge.handle({source:frame.contentWindow,origin:'null',data:{jsonrpc:'2.0',id:'forged244',method,params:method==='settings.saveState'?{revision:1,patch,error:'',guard:''}:{revision:1,patch},meta:{nonce:bridge.nonce,panel:'settings'}}});assert.equal(sent.at(-1).error.data.httpStatus,403);}
    }for(const path of ['/api/config/lifecycle','/api/config/lifecycle/open']){await bridge.handle({source:frame.contentWindow,origin:'null',data:{jsonrpc:'2.0',id:'direct244',method:'api.request',params:{method:'POST',path,body:{}},meta:{nonce:bridge.nonce,panel:'settings'}}});assert.ok(sent.at(-1).error);}assert.equal(calls.length,0);assert.equal(bridge.settingsSave.dirty,false);assert.equal(bridge.beforeUnload({preventDefault(){throw Error('must remain clean');}}),false);}finally{bridge.close();globalThis.window=previous;}
  });
  await check('failed or slow leave keeps its actual registry frame and supports a fresh flush id',async()=>{
    const previous=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};
    const sent=[],frame={contentWindow:{postMessage:message=>sent.push(message)},addEventListener(){},remove(){this.removed=true;}};
    const bridge=new RpcBridge({frame,manifest:{id:'settings',kind:'bundled',api:[]}}),registry=new PanelRegistry({api:{}});bridge.ready=true;registry.current={id:'settings',frame,bridge};
    const ack=(ok,error)=>bridge.handle({source:frame.contentWindow,origin:'null',data:{jsonrpc:'2.0',method:'panel.flushed',params:{flushId:sent.filter(message=>message.method==='panel.leave').at(-1).params.flushId,ok,error},meta:{nonce:bridge.nonce,panel:'settings'}}});
    try{
      const failed=registry.unmount(),rejected=assert.rejects(failed,/synthetic save failure244/);await ack(false,'synthetic save failure244');await rejected;assert.equal(registry.current.frame,frame);assert.equal(frame.removed,undefined);assert.equal(bridge.closed,false);
      const slow=registry.unmount();await new Promise(resolve=>setTimeout(resolve,1100));assert.equal(registry.current.frame,frame);assert.equal(frame.removed,undefined);await ack(true);await slow;assert.equal(frame.removed,true);assert.equal(registry.current,null);
    }finally{bridge.close();globalThis.window=previous;}
  });
  await check('default client preflight rejection does not acknowledge successful disposal',async()=>{
    const handlers=new Map(),sent=[],parent={postMessage:message=>sent.push(message)},window={addEventListener:(name,fn)=>handlers.set(name,fn),dispatchEvent:event=>handlers.get(event.type)?.(event)};
    const code=fs.readFileSync(path.join(source,'ui/panels/panel-client.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'')+';globalThis.client={onBeforeLeave,onLeave};';
    const context={window,parent,location:{origin:'http://synthetic244'},setTimeout,clearTimeout,Event,CustomEvent:class{},setRefreshInterval(){},panelApiRequestTimeout:()=>15000,resetDestructiveActions(){}};vm.runInNewContext(code,context);
    const receive=data=>handlers.get('message')({source:parent,origin:'http://synthetic244',data}),meta={nonce:'a'.repeat(32),panel:'settings'};receive({jsonrpc:'2.0',method:'panel.init',params:meta});let fails=true,disposed=0;context.client.onBeforeLeave(()=>{if(fails)throw Error('blocked244');});context.client.onLeave(()=>{disposed++;});
    receive({jsonrpc:'2.0',method:'panel.leave',params:{flushId:'one'},meta});await new Promise(resolve=>setImmediate(resolve));assert.equal(sent.at(-1).params.ok,false);assert.equal(disposed,0);
    fails=false;receive({jsonrpc:'2.0',method:'panel.leave',params:{flushId:'two'},meta});await new Promise(resolve=>setImmediate(resolve));assert.equal(sent.at(-1).params.ok,true);assert.equal(disposed,1);
  });
  await check('desktop handshake pins source/main-frame/request id and cancels failure or timeout',async()=>{
    const sent=[],contents={mainFrame:{},send:(...args)=>sent.push(args)},win={webContents:contents,isDestroyed:()=>false},controller=createRendererLeave({getWindow:()=>win,timeout:20}),event={sender:contents,senderFrame:contents.mainFrame};controller.register(event);
    const saving=controller.prepare('quit');controller.acknowledge({...event,senderFrame:{}},{requestId:sent.at(-1)[1].requestId,ok:true});controller.acknowledge(event,{requestId:'stale',ok:true});controller.acknowledge(event,{requestId:sent.at(-1)[1].requestId,ok:false,error:'disk244'});assert.deepEqual(await saving,{ok:false,error:'disk244'});
    const retry=controller.prepare('quit');controller.acknowledge(event,{requestId:sent.at(-1)[1].requestId,ok:true});assert.deepEqual(await retry,{ok:true});assert.equal((await controller.prepare('reload')).ok,false);
    const pending=controller.prepare('quit');contents.mainFrame={};controller.acknowledge({sender:contents,senderFrame:contents.mainFrame},{requestId:sent.at(-1)[1].requestId,ok:true});assert.equal((await pending).ok,false);
  });
  await check('production Electron quit waits for renderer receipt; failed receipt retains window and kernel; tray close keeps running',async()=>{
    const previous=process.env.QQ_AGENT_DATA_DIR;process.env.QQ_AGENT_DATA_DIR=path.join(root,'electron-data');const ipcMain=new EventEmitter();ipcMain.handle=()=>{};ipcMain.removeHandler=()=>{};const sent=[],order=[],dialogs=[];let stops=0,hides=0,closeToTray=true;
    class Window extends EventEmitter{constructor(){super();this.destroyed=false;this.contents=new EventEmitter();this.contents.mainFrame={url:''};this.contents.isDestroyed=()=>this.destroyed;this.contents.setWindowOpenHandler=()=>{};this.contents.send=(channel,body)=>{sent.push({channel,body});order.push('request');};}get webContents(){return this.contents;}isDestroyed(){return this.destroyed;}async loadURL(url){this.contents.mainFrame={url};}show(){}hide(){hides++;}destroy(){this.destroyed=true;order.push('destroy');this.contents.emit('destroyed');this.emit('closed');}}
    const app=new EventEmitter();Object.assign(app,{isPackaged:false,paths:{appData:path.join(root,'electron-appdata')},getPath(name){return this.paths[name]??root;},setPath(name,value){this.paths[name]=value;},requestSingleInstanceLock:()=>true,whenReady:async()=>{},quit(){order.push('quit');}});const electron={app,ipcMain,BrowserWindow:Window,session:{defaultSession:{setProxy:async()=>{},setPermissionRequestHandler(){}}},shell:{openExternal(){}},dialog:{showErrorBox:(...args)=>dialogs.push(args)}};
    try{
      const desktop=await startElectron(electron,{createKernel:()=>({config:{get:()=>({server:{token:'synthetic244',closeToTray}})},start:async()=>42440,stop:async()=>{stops++;order.push('stop');},bus:{emit(){}}})}),win=desktop.window,contents=win.webContents,event={sender:contents,senderFrame:contents.mainFrame};ipcMain.emit('qq-agent:leave-ready',event);
      let prevented=false;win.emit('close',{preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(hides,1);assert.equal(stops,0);assert.equal(sent.length,0);
      const failed=stopElectron(electron);assert.equal(win.destroyed,false);assert.equal(stops,0);ipcMain.emit('qq-agent:leave-result',event,{requestId:sent.at(-1).body.requestId,ok:false,error:'synthetic failure244'});assert.equal((await failed).ok,false);assert.equal(win.destroyed,false);assert.equal(stops,0);assert.match(dialogs.at(-1)[1],/synthetic failure244/);
      const success=stopElectron(electron);assert.equal(stops,0);assert.equal(win.destroyed,false);ipcMain.emit('qq-agent:leave-result',event,{requestId:sent.at(-1).body.requestId,ok:true});assert.deepEqual(await success,{ok:true});assert.equal(stops,1);assert.deepEqual(order.slice(-4),['request','destroy','stop','quit']);
    }finally{if(previous===undefined)delete process.env.QQ_AGENT_DATA_DIR;else process.env.QQ_AGENT_DATA_DIR=previous;}
  });
  if(httpOnly){
    await check('actual authenticated lifecycle HTTP uses ordinary guarded disk write and rejects stale/source/raw/token bypass',async()=>{
      await start('http');const settings=(await panels()).find(panel=>panel.id==='settings');assert.equal(settings.saveLifecycle.kind,'settings-v1');const leaseResponse=await fetch(base+'/api/config/lifecycle/open',{method:'POST',headers:{'x-console-token':token,'content-type':'application/json'},body:JSON.stringify({owner:settings.stateOwner,generation:settings.stateGeneration,parentLease:null,retireParent:false})});assert.equal(leaseResponse.status,200);const opened=await leaseResponse.json();const body={owner:settings.stateOwner,generation:settings.stateGeneration,lease:opened.lease,revision:1,patch:{persona:{botName:'HTTP244'}}};
      const post=async(value,credential=token)=>{const response=await fetch(base+'/api/config/lifecycle',{method:'POST',headers:{'x-console-token':credential,'content-type':'application/json'},body:JSON.stringify(value)});return{status:response.status,body:await response.json()};};
      assert.equal((await post(body)).status,200);assert.equal(disk().persona.botName,'HTTP244');assert.equal((await post(body)).status,200);assert.equal((await post({...body,patch:{persona:{botName:'same revision forged'}}})).status,409);
      assert.equal((await post({...body,revision:2,patch:{blocklist:{}}})).status,400);assert.equal((await post({...body,generation:'c'.repeat(64)})).status,409);assert.equal((await post({...body,revision:2},'wrong244')).status,401);
      for(const patch of [{__replace__:{}},{server:null},{server:[]},{server:{token:'forged244'}},{server:{__replace__:{token:'forged244'}}}]){assert.equal((await post({...body,revision:2,patch})).status,403);assert.equal(disk().server.token,token);assert.equal(disk().persona.botName,'HTTP244');}
      diskFailure=true;try{assert.equal((await post({...body,revision:2,patch:{persona:{botName:'retryHTTP244'}}})).status,500);assert.equal(disk().persona.botName,'HTTP244');}finally{diskFailure=false;}
      assert.equal((await post({...body,revision:2,patch:{persona:{botName:'retryHTTP244'}}})).status,200);assert.equal(disk().persona.botName,'retryHTTP244');await stop();
    });
    await check('actual HTTP issued tickets fence delayed old writes and preserve active clone branches',async()=>{
      await start('http-fence');const selected=(await panels()).find(panel=>panel.id==='settings'),identity={owner:selected.stateOwner,generation:selected.stateGeneration},call=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'x-console-token':token,'content-type':'application/json'},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};},open=async(parentLease=null,retireParent=false)=>(await call('/api/config/lifecycle/open',{...identity,parentLease,retireParent})).body.lease,put=(lease,revision,value)=>call('/api/config/lifecycle',{...identity,lease,revision,patch:{persona:{botName:value}}});
      const old=await open();assert.equal((await put(old,1,'old-http244')).status,200);const current=await open(old,true);assert.equal((await put(current,1,'new-http244')).status,200);assert.equal((await put(old,2,'late-old-http244')).status,409);assert.equal(disk().persona.botName,'new-http244');const clone=await open(current,false);assert.equal((await put(clone,1,'clone-http244')).status,200);assert.equal((await put(current,2,'current-still-active244')).status,200);assert.equal((await put(clone,2,'clone-still-active244')).status,200);assert.equal(disk().persona.botName,'clone-still-active244');assert.equal((await put(lease,1,'unknown244')).status,409);await stop();
    });
    await check('actual startup appends UI, revokes replaced default leaf, and disabled override restores lifecycle',async()=>{
      for(const mode of ['append','replacement','disabled']){await start('http-'+mode,{mode});const settings=(await panels()).find(panel=>panel.id==='settings');assert.equal(Boolean(settings.saveLifecycle),mode!=='replacement');await stop();}
    });
  }
  if(!pureOnly&&!httpOnly){
    const playwright=createRequire(import.meta.url)('playwright-core'),cache=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ms-playwright');const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9))).map(name=>path.join(cache,name,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));assert.ok(executablePath);browser=await playwright.chromium.launch({executablePath,headless:!headed});
    if(!resetOnly){
    await check('reconstructed old lifecycle actual close/reload baseline records reopened UI and disk',async()=>{
      await start('baseline',{baseline:true});const observations=[];
      for(const action of ['close','reload']){
        kernel.config.update({persona:{botName:'baseline-saved244'}});const page=await makePage();await settings(page);await page.screenshot({path:path.join(evidence,'baseline-'+action+'.png')});await fillName(page,'baseline-late-'+action+'244');
        if(action==='close')await closePage(page);else await page.reload();await new Promise(resolve=>setTimeout(resolve,850));
        const reopened=action==='close'?await makePage():page;await settings(reopened);observations.push({action,disk:disk().persona.botName,reopened:await frame(reopened).locator('#field-persona-botName').inputValue()});assert.equal(observations.at(-1).disk,observations.at(-1).reopened);await closePage(reopened);
      }
      fs.writeFileSync(path.join(evidence,'baseline-observations.json'),JSON.stringify(observations,null,2));await stop();
    });
    await start('fixed');
    await check('real selected default metadata grants lifecycle only to settings and HTTP rejects forged generations',async()=>{
      const list=await panels(),definition=list.find(panel=>panel.id==='settings');assert.equal(definition.saveLifecycle.kind,'settings-v1');assert.ok(list.filter(panel=>panel.id!=='settings').every(panel=>!panel.saveLifecycle));
      const response=await fetch(base+'/api/config/lifecycle',{method:'POST',headers:{'x-console-token':token,'content-type':'application/json'},body:JSON.stringify({owner:definition.stateOwner,generation:'f'.repeat(64),lease,revision:1,patch:{persona:{botName:'forged244'}}})});assert.equal(response.status,409);assert.equal(disk().persona.botName,'disk-before244');
      const page=await makePage();await settings(page);assert.equal(await page.locator('#panel-host iframe').getAttribute('sandbox'),'allow-scripts allow-modals');const boundary=await frame(page).locator('body').evaluate(async()=>{let parentBlocked=false,storageBlocked=false;try{void parent.document;}catch{parentBlocked=true;}try{void localStorage.length;}catch{storageBlocked=true;}const client=await import('/panels/panel-client.js');const deny=async path=>{try{await client.request('POST',path,{});return false;}catch{return true;}};return{opaque:window.origin==='null',parentBlocked,storageBlocked,preloadAbsent:!window.qqAgentShell,bootstrapDenied:await deny('/api/console/bootstrap'),endpointDenied:await deny('/api/config/lifecycle'),openDenied:await deny('/api/config/lifecycle/open')};});assert.deepEqual(boundary,{opaque:true,parentBlocked:true,storageBlocked:true,preloadAbsent:true,bootstrapDenied:true,endpointDenied:true,openDenied:true});await closePage(page);
    });
    await check('actual immediate close and reload keep latest small patch on disk and reopened default UI',async()=>{
      for(const action of ['close','reload']){
        const page=await makePage();await settings(page);const value='last-'+action+'244';await fillName(page,value);
        if(action==='close')await closePage(page);else await page.reload();await waitDisk(value);
        const reopened=action==='close'?await makePage():page;await settings(reopened);assert.equal(await frame(reopened).locator('#field-persona-botName').inputValue(),value);await closePage(reopened);
      }
    });
    await check('actual reload/new settings ticket rejects client-held previous-document keepalive after newer disk commit',async()=>{
      const page=await makePage();await settings(page);await fillName(page,'held-before-reload244');await page.evaluate(()=>{window.qa244.holdKeepalive=true;});await page.reload();assert.ok(page.qaHeldKeepalive);const held=page.qaHeldKeepalive;await settings(page);const current=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),SETTINGS_LEASE_KEY);assert.notEqual(current.lease,held.lease);await fillName(page,'new-document-wins244');await settingsSave(frame(page));await waitDisk('new-document-wins244');const response=await fetch(base+'/api/config/lifecycle',{method:'POST',headers:{'x-console-token':token,'content-type':'application/json'},body:JSON.stringify(held)});assert.equal(response.status,409);assert.equal(disk().persona.botName,'new-document-wins244');await closePage(page);
    });
    await check('actual two active browser editors with cloned nonretired ticket remain independently writable',async()=>{
      const a=await makePage();await settings(a);const row=await a.evaluate(key=>sessionStorage.getItem(key),SETTINGS_LEASE_KEY);assert.equal(JSON.parse(row).retired,false);const b=await makePage(row);await settings(b);for(const[page,value]of [[a,'active-a244'],[b,'active-b244'],[a,'active-a-again244']]){await fillName(page,value);await settingsSave(frame(page));await waitDisk(value);}await closePage(a);await closePage(b);
    });
    await check('actual delayed backend write survives ordinary leave longer than former one-second cutoff',async()=>{
      const page=await makePage();await settings(page);let enter,release;const entered=new Promise(resolve=>{enter=resolve;}),promise=new Promise(resolve=>{release=resolve;});writeGate={enter,promise};
      try{await fillName(page,'slow-leave244');await page.locator('#nav button[data-panel=sessions]').click();await entered;await new Promise(resolve=>setTimeout(resolve,1200));assert.equal(await page.locator('#panel-host iframe[src^="/panels/settings/"]').count(),1);assert.notEqual(disk().persona.botName,'slow-leave244');writeGate=null;release();await page.locator('#panel-host iframe[src^="/panels/sessions/"]').waitFor();assert.equal(disk().persona.botName,'slow-leave244');}finally{writeGate=null;release?.();await closePage(page);}
    });
    await check('actual failed atomic rename retains frame/input; cancelled native leave preserves a working shell',async()=>{
      const page=await makePage();await settings(page);const before=disk().persona.botName;diskFailure=true;
      try{await fillName(page,'failed-write244');await page.locator('#nav button[data-panel=sessions]').click();await frame(page).locator('#status.field-error').waitFor();assert.equal(await page.locator('#panel-host iframe[src^="/panels/settings/"]').count(),1);assert.equal(await frame(page).locator('#field-persona-botName').inputValue(),'failed-write244');assert.equal(disk().persona.botName,before);
        const leaseBefore=await page.evaluate(key=>sessionStorage.getItem(key),SETTINGS_LEASE_KEY);await cancelReload(page);assert.equal(await page.locator('#panel-host iframe[src^="/panels/settings/"]').count(),1);assert.equal(await frame(page).locator('#field-persona-botName').inputValue(),'failed-write244');assert.ok(page.qaDialogs.includes('beforeunload'));assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),SETTINGS_LEASE_KEY),leaseBefore);
      }finally{diskFailure=false;}
      await settingsSave(frame(page));await waitDisk('failed-write244');await page.locator('#nav button[data-panel=sessions]').click();await page.locator('#panel-host iframe[src^="/panels/sessions/"]').waitFor();page.qaDecision='accept';await closePage(page);
    });
    await check('actual >60KiB patch prompts and remains editable on cancel, then normal explicit save persists it',async()=>{
      const page=await makePage();await settings(page);const content='合成大草稿244'.repeat(7000),input=frame(page).locator('#field-persona-roleText'),before=await page.evaluate(()=>window.qa244.keepalives.length);await page.evaluate(()=>{window.qa244.dropStage=true;});await input.click();await input.fill(content);await cancelReload(page);assert.ok(page.qaDialogs.includes('beforeunload'));assert.equal(await input.inputValue(),content);assert.equal(await page.evaluate(()=>window.qa244.keepalives.length),before);await page.evaluate(()=>{window.qa244.dropStage=false;});await settingsSave(frame(page));await frame(page).locator('#status').filter({hasText:'已保存'}).waitFor();assert.equal(disk().persona.roleText,content);page.qaDecision='accept';await closePage(page);const reopened=await makePage();await settings(reopened);assert.equal(await frame(reopened).locator('#field-persona-roleText').inputValue(),content);await reopened.screenshot({path:path.join(evidence,'large-restored.png')});await closePage(reopened);
    });
    await stop();
    await check('actual additional/replaced/disabled UI composition grants only selected default lifecycle sources',async()=>{
      for(const mode of ['append','replacement','disabled']){
        await start(mode,{mode});const selected=(await panels()).find(panel=>panel.id==='settings');assert.equal(Boolean(selected.saveLifecycle),mode!=='replacement');
        const page=await makePage();await settings(page);const available=await frame(page).locator('body').evaluate(async()=>{const client=await import('/panels/panel-client.js');return client.settingsSaveAvailable();});assert.equal(available,mode!=='replacement');
        assert.equal(await page.locator('#panel-host iframe').getAttribute('sandbox'),mode==='replacement'?'allow-scripts':'allow-scripts allow-modals');
        if(mode==='replacement'){
          const denied=await frame(page).locator('body').evaluate(async()=>{const client=await import('/panels/panel-client.js');try{await client.saveSettings({revision:1,patch:{persona:{botName:'must-not-save244'}}});return'allowed';}catch(error){return error.message;}});assert.match(denied,/未获默认设置保存合同/);assert.equal(disk().persona.botName,'disk-before244');
        }else{await fillName(page,mode+'-last244');await closePage(page);await waitDisk(mode+'-last244');}
        if(!page.isClosed())await closePage(page);await stop();
      }
    });
    }
    await check('actual accepted reset clears host mirror and manual raw leave guard without writing either draft',async()=>{
      await start('accepted-reset');const page=await makePage();await settings(page);await settingsBlocklist(frame(page));await frame(page).locator('[data-raw-field=blocklist]:enabled').fill('{"244":["24499"]}');await settingsSection(frame(page),'persona');
      let enter,release;const entered=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});await page.route(base+'/api/reset-data',async route=>{enter();await held;const response=await route.fetch();await route.fulfill({response});});const before=requests.filter(row=>row.path==='/api/config/lifecycle'&&row.method==='POST').length,rawBefore=requests.filter(row=>row.path==='/api/blocklist-raw'&&row.method==='PUT').length;
      try{
        await frame(page).locator('body').evaluate(()=>{const input=document.querySelector('#field-persona-botName');input.value='must-not-replay-after-reset244';input.dispatchEvent(new Event('input',{bubbles:true}));for(let index=0;index<6;index++)document.querySelector('#reset').click();});await entered;const keepaliveBefore=await page.evaluate(()=>window.qa244.keepalives.length);await cancelReload(page);assert.equal(await page.evaluate(()=>window.qa244.keepalives.length),keepaliveBefore,'preparing reset must not replay a dirty patch');release();await frame(page).locator('#status').filter({hasText:'已接受重置'}).waitFor();const dialogs=page.qaDialogs.length;await closePage(page);assert.equal(page.qaDialogs.length,dialogs,'accepted reset leaves cleanly despite its discarded raw draft');assert.equal(requests.filter(row=>row.path==='/api/config/lifecycle'&&row.method==='POST').length,before);assert.equal(requests.filter(row=>row.path==='/api/blocklist-raw'&&row.method==='PUT').length,rawBefore);assert.equal(disk().persona.botName,'disk-before244');assert.deepEqual(disk().blocklist,{});
      }finally{release();if(!page.isClosed()){page.qaDecision='accept';await closePage(page);}await stop();}
    });
    assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.deepEqual(outbound,[]);
  }
  completed=true;
}catch(error){
  // The production Electron entry installs a fatal logger for native startup.
  // A test failure must still produce a failing process status.
  process.exitCode=1;console.error(error);
}finally{
  diskFailure=false;writeGate=null;await browser?.close();await kernel?.stop();fs.renameSync=nativeRename;fs.writeFileSync(path.join(evidence,headed?'headed.json':'headless.json'),JSON.stringify({completed,root,checks,errors,blocked,outbound,requests},null,2));
}

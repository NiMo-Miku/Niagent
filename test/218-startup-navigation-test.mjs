// Startup policy + actual temporary application/HTTP/disk/Chromium. No live data,
// extension code, QQ transport, model call, existing console or external origin.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chooseStartupTarget,createStartupNavigation} from '../ui/shell/startup-navigation.js';
import {createApplication} from '../src/kernel/composition.js';
import {createPanelAdapters} from '../src/console/panel-adapters.js';

const source=path.resolve(import.meta.dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-start218-')),appRoot=path.join(root,'app'),dataDir=path.join(root,'data');
const evidenceIndex=process.argv.indexOf('--evidence-dir'),evidence=evidenceIndex<0?path.join(source,'.qa-local/v04-parity-20261016/startup218'):path.resolve(process.argv[evidenceIndex+1]);
fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(appRoot);fs.cpSync(path.join(source,'ui'),path.join(appRoot,'ui'),{recursive:true});for(const name of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,name));
const headed=process.argv.includes('--headed')||process.env.QA_HEADED==='1'||process.env.QA_HEADLESS==='0',pureOnly=process.argv.includes('--pure-only');
const checks=[],pageErrors=[],outbound=[],blocked=[],requests=[],faults=[],entrySnapshots=[],releases=new Set(),token='synthetic-startup218';
let kernel,browser,base,panelMode='normal',panelCalls=0,completed=false,activeCase='initial';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
function gate(){const pending=deferred();releases.add(pending.resolve);return{promise:pending.promise,release(){releases.delete(pending.resolve);pending.resolve();}};}
const check=async(name,run)=>{activeCase=name;await run();checks.push(name);console.log('✓ 218 '+name);};
const write=(relative,text)=>{const file=path.join(appRoot,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);return file;};
const readyApi={baseUrl:'https://synthetic.invalid/v1',model:'synthetic218'},home={id:'sessions',kind:'bundled',navigation:{source:'defaults',home:true}},settings={id:'settings',kind:'bundled',navigation:{source:'defaults',role:'configuration',sections:['models','access']}},panels=[home,settings];
const baseline={api:{baseUrl:'',model:''},allow:{groups:[],private:[]},allowAllWhenEmpty:false,ui:{refreshMs:3600000}};
async function call(method,pathname,body){const response=await fetch(base+pathname,{method,headers:{'x-console-token':token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
async function configure(patch={}){
  const body={...baseline,...patch,api:{...baseline.api,...patch.api},allow:{...baseline.allow,...patch.allow}};await call('POST','/api/config',body);
  const disk=JSON.parse(fs.readFileSync(path.join(dataDir,'config.json'),'utf8'));assert.equal(disk.api.model,body.api.model);assert.equal(disk.api.baseUrl,body.api.baseUrl);assert.deepEqual(disk.allow.groups,body.allow.groups);assert.equal(disk.allowAllWhenEmpty,body.allowAllWhenEmpty);
}
async function start(initialize=false){
  panelCalls=0;
  kernel=await createApplication({appRoot,headless:true,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},components:{'console.panels':options=>{
    const adapter=createPanelAdapters(options);return{...adapter,listPanels(){++panelCalls;if(panelMode==='fail'||panelMode==='fail-once'&&panelCalls===1){faults.push({case:activeCase,kind:'panels503'});throw Object.assign(Error('synthetic218 panel outage'),{status:503,expose:true});}if(panelMode==='empty'||panelMode==='empty-once'&&panelCalls===1)return[];return adapter.listPanels();}};
  }},transport:{id:'inert218',start(){},stop(){},status:()=>({connected:false}),actions:{listGroups:async()=>[],listFriends:async()=>[]}},priceUpdates:{refresh:async()=>({ok:true}),updateCheck:async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false})},communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})},fetchImpl:async(...args)=>{outbound.push(String(args[0]));throw Error('No external IO218');}});
  kernel.log.setLevel('error');kernel.loader.startWatchers=()=>{};
  if(initialize)kernel.config.update({server:{port:0,token},telemetry:{enabled:false},proactive:{enabled:false},...baseline});
  base=`http://127.0.0.1:${await kernel.start()}`;assert.notEqual(new URL(base).port,'15967');const entries=kernel.loader.listEntries();entrySnapshots.push({phase:'start',entries});assert.deepEqual(entries,[]);
}
async function stop(){if(kernel){const entries=kernel.loader.listEntries();entrySnapshots.push({phase:'stop',entries});assert.deepEqual(entries,[]);}await kernel?.stop();kernel=null;}
const frame=page=>page.frameLocator('#panel-host iframe');
async function mounted(page,id,section=null){await page.locator(`#panel-host iframe[src^="/panels/${id}/"]`).waitFor();await frame(page).locator('body').waitFor();if(section){await frame(page).locator(`#section-${section}:visible`).waitFor();assert.equal(await frame(page).locator(`#settings-sidebar a[data-target="${section}"]`).evaluate(node=>node.classList.contains('is-active')),true);}return frame(page);}
const online=page=>page.locator('#status-dot.online').waitFor();
async function sameFrame(page,handle){assert.equal(await handle.evaluate(node=>node===document.querySelector('#panel-host iframe')&&node.isConnected),true);}
async function makePage(routeHook=null){
  const context=await browser.newContext({viewport:{width:1360,height:900},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',error=>pageErrors.push({case:activeCase,message:error.message}));
  page.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/'))requests.push({case:activeCase,path:url.pathname,method:request.method()});});
  await context.addInitScript(()=>{
    if(window!==top)return;window.qa218={fetches:[],configParsed:[],panelsParsed:0,mounts:[]};
    const nativeFetch=fetch.bind(window);
    window.fetch=async(input,options)=>{
      const request=new Request(input,options),pathname=new URL(request.url).pathname;window.qa218.fetches.push({path:pathname,method:request.method});
      const response=await nativeFetch(input,options);
      if(pathname==='/api/config'&&request.method==='GET'){
        const nativeJson=response.json.bind(response);response.json=async()=>{const data=await nativeJson();window.qa218.configParsed.push({model:data.api?.model??null,baseUrl:data.api?.baseUrl??null});return data;};
      }
      if(pathname==='/api/panels'){
        const nativeJson=response.json.bind(response);response.json=async()=>{const data=await nativeJson();window.qa218.panelsParsed++;return data;};
      }
      return response;
    };
    new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeName==='IFRAME')window.qa218.mounts.push(node.getAttribute('src'));}).observe(document,{childList:true,subtree:true});
  });
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin!==base){blocked.push(url.href);return route.abort();}
    if(routeHook&&await routeHook(route,url))return;await route.continue();
  });
  return{page,context,async close(){await context.close();}};
}
async function visit(task,hook=null){const owned=await makePage(hook);try{await owned.page.goto(base,{waitUntil:'commit'});await task(owned.page);}finally{await owned.close();}}
async function consumeLateConfig(page,gateValue){gateValue.release();await page.waitForFunction(()=>window.qa218.configParsed.length>0);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
function layer(id,ui,enabled=true){write(`overrides/${id}/composition.json`,JSON.stringify({version:1,id,enabled,order:218,ui}));}
function disable(id){const file=path.join(appRoot,'overrides',id,'composition.json'),body=JSON.parse(fs.readFileSync(file));body.enabled=false;fs.writeFileSync(file,JSON.stringify(body));}
const simpleHtml='<h1 id="custom-home">Synthetic custom home</h1><input id="draft" aria-label="Synthetic draft"><output id="api"></output><output id="event"></output><script type="module" src="panel.js"></script>';
const simpleScript="import{request,onShellEvent}from'/panels/panel-client.js';document.querySelector('#api').textContent=(await request('GET','/api/status'))?'actual-api-ready':'';onShellEvent((name,payload)=>{if(name==='status'&&payload?.configUpdated)document.querySelector('#event').textContent='actual-sse-update';});";
async function addStartupObserver(){
  write('overrides/observe218/startup-base.js',fs.readFileSync(path.join(appRoot,'ui/shell/startup-navigation.js'),'utf8'));
  write('overrides/observe218/startup.js',"import{createStartupNavigation as base}from'/startup218-base.js';export function createStartupNavigation(options){const p=base(options);window.qa218Policy={entered:0,settled:0,disposed:0};return{get attempted(){return p.attempted},get interacted(){return p.interacted},navigate(){return p.navigate()},async select(args){window.qa218Policy.entered++;try{return await p.select(args)}finally{window.qa218Policy.settled++}},dispose(){window.qa218Policy.disposed++;p.dispose()}};}");
  write('overrides/observe218/recovery-base.js',fs.readFileSync(path.join(appRoot,'ui/shell/panel-recovery.js'),'utf8'));
  write('overrides/observe218/recovery.js',"import{createPanelRecovery as base}from'/recovery218-base.js';export function createPanelRecovery(options){return base({...options,onRecovered:async data=>{window.qa218Recovered={entered:true,settled:false};try{return await options.onRecovered(data)}finally{window.qa218Recovered.settled=true}}});}");
  layer('observe218',{'assets':{'shell/startup-navigation.js':'./startup.js','shell/startup218-base.js':'./startup-base.js','shell/panel-recovery.js':'./recovery.js','shell/recovery218-base.js':'./recovery-base.js'}});
}

try{
  await check('pure policy checks model protocol, exact access values and explicit home/section provenance',async()=>{
    const choose=config=>chooseStartupTarget({panels,config});assert.deepEqual(choose({}),{id:'settings',section:'models'});
    for(const address of ['file:///tmp/local','javascript:alert(1)','not a URL',''])assert.equal(choose({api:{baseUrl:address,model:'x'}}).section,'models');
    assert.equal(choose({api:readyApi}).section,'access');for(const allow of [{groups:['218']},{private:['218']},{groups:[218]}])assert.equal(choose({api:readyApi,allow}),null);
    for(const id of ['0','-1','NaN','1.5','000218','1'.repeat(16)])assert.equal(choose({api:readyApi,allow:{groups:[id]}}).section,'access');
    assert.equal(choose({api:readyApi,allowAllWhenEmpty:true}),null);assert.equal(choose(null),null);
    for(const first of [{...home,navigation:undefined},{...home,kind:'user'},{...home,navigation:{source:'trusted',home:true}}])assert.equal(chooseStartupTarget({panels:[first,settings],config:{}}),null);
    assert.equal(chooseStartupTarget({panels:[home,{...settings,kind:'user'}],config:{}}),null);assert.equal(chooseStartupTarget({panels:[home,{...settings,navigation:{role:'configuration',sections:['other']}}],config:{}}),null);
  });
  await check('pure lifecycle performs one attempt and rejects manual, stale, failed or disposed decisions',async()=>{
    const options={panels,readConfig:async()=>({})};let policy=createStartupNavigation();assert.deepEqual(await policy.select(options),{id:'settings',section:'models'});assert.equal(await policy.select(options),null);
    policy=createStartupNavigation();policy.navigate();assert.equal(await policy.select(options),null);assert.equal(policy.attempted,false);
    for(const action of ['navigate','dispose']){policy=createStartupNavigation();const read=deferred(),entered=deferred(),pending=policy.select({...options,readConfig:()=>{entered.resolve();return read.promise;}});await entered.promise;policy[action]();assert.equal(await pending,null);read.resolve({});}
    policy=createStartupNavigation();assert.equal(await policy.select({...options,isCurrent:()=>false}),null);assert.equal(policy.attempted,false);
    assert.equal(await createStartupNavigation().select({...options,readConfig:async()=>{throw Error('real fault');}}),null);
    assert.equal(await createStartupNavigation({choose:()=>{throw Error('policy fault');}}).select(options),null);assert.equal(await createStartupNavigation({choose:()=>({id:'unknown'})}).select(options),null);
  });
  await check('the default policy timer is exactly 800ms and a timed-out read can never choose later',async()=>{
    const nativeSet=globalThis.setTimeout,nativeClear=globalThis.clearTimeout,timers=new Map();let timerId=0,calls=0;
    globalThis.setTimeout=(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;};globalThis.clearTimeout=id=>timers.delete(id);
    try{const entered=deferred(),read=deferred(),policy=createStartupNavigation({choose:()=>{calls++;return{id:'settings'};}}),pending=policy.select({panels,readConfig:()=>{entered.resolve();return read.promise;}});await entered.promise;assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,800);[...timers.values()][0].fn();assert.equal(await pending,null);read.resolve({});await Promise.resolve();await Promise.resolve();assert.equal(calls,0);}finally{globalThis.setTimeout=nativeSet;globalThis.clearTimeout=nativeClear;}
  });
  if(!pureOnly){
    await start(true);
    const playwright=createRequire(import.meta.url)('playwright-core'),cache=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ms-playwright');
    const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9))).map(name=>path.join(cache,name,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));assert.ok(executablePath);browser=await playwright.chromium.launch({executablePath,headless:!headed});
    for(const entry of [
      ['missing model guides to actual models section',{},'settings','models'],
      ['ready model with empty allow lists guides to access',{api:readyApi},'settings','access'],
      ['explicit allowAll keeps ordinary sessions',{api:readyApi,allowAllWhenEmpty:true},'sessions'],
      ['a valid group allow id keeps ordinary sessions',{api:readyApi,allow:{groups:['218']}},'sessions'],
      ['a valid private allow id keeps ordinary sessions',{api:readyApi,allow:{private:['218']}},'sessions'],
      ['an invalid configured address guides to models',{api:{baseUrl:'file:///invalid218',model:'synthetic218'},allowAllWhenEmpty:true},'settings','models'],
    ])await check(entry[0],async()=>{await configure(entry[1]);await visit(async page=>{await mounted(page,entry[2],entry[3]);await online(page);if(entry[3])await page.screenshot({path:path.join(evidence,entry[3]+'-'+checks.length+'.png'),fullPage:true});});});
    await check('an actual failed initial config GET falls back without adding a second host read',async()=>{
      await configure();let calls=0;await visit(async page=>{await mounted(page,'sessions');await online(page);assert.equal(calls,1);},async(route,url)=>{if(url.pathname==='/api/config'&&route.request().method()==='GET'){++calls;if(calls===1){faults.push({case:activeCase,kind:'config503'});await route.fulfill({status:503,contentType:'application/json',body:'{"error":"synthetic218 config outage"}'});return true;}}return false;});
    });
    await check('a real config response held past the startup bound cannot steal the mounted draft when it arrives',async()=>{
      await configure();const held=gate(),captured=deferred();let calls=0;await visit(async page=>{await captured.promise;await mounted(page,'sessions');await online(page);await frame(page).locator('#search').fill('late config draft218');const old=await page.locator('#panel-host iframe').elementHandle();assert.equal(calls,1);await consumeLateConfig(page,held);await page.locator('#ready-model[data-state=bad]').waitFor();await sameFrame(page,old);assert.equal(await frame(page).locator('#search').inputValue(),'late config draft218');},async(route,url)=>{if(url.pathname==='/api/config'&&route.request().method()==='GET'&&++calls===1){const response=await route.fetch();captured.resolve();await held.promise;await route.fulfill({response});return true;}return false;});
    });
    await check('manual navigation interrupts the pending initial decision and late config never replaces it',async()=>{
      await configure();const held=gate(),captured=deferred();let calls=0;await visit(async page=>{await captured.promise;await page.locator('#nav button[data-panel=chats]').click();await mounted(page,'chats');await frame(page).locator('#search').fill('manual draft218');const old=await page.locator('#panel-host iframe').elementHandle();await consumeLateConfig(page,held);await online(page);await sameFrame(page,old);assert.equal(await frame(page).locator('#search').inputValue(),'manual draft218');},async(route,url)=>{if(url.pathname==='/api/config'&&route.request().method()==='GET'&&++calls===1){const response=await route.fetch();captured.resolve();await held.promise;await route.fulfill({response});return true;}return false;});
    });
    await stop();
    await check('a custom home with no config reads proves one host initialization read and normal API/SSE/draft retention',async()=>{
      write('overrides/home218/page/index.html',simpleHtml);write('overrides/home218/page/panel.js',simpleScript);layer('home218',{panels:[{id:'sessions',title:'Custom home218',assetRoot:'./page',permissions:[],api:[{method:'GET',path:'/api/status'}]}]});await start();await configure();const dto=(await call('GET','/api/panels')).panels.find(panel=>panel.id==='sessions');assert.equal(dto.navigation,undefined);assert.equal(dto.kind,'bundled');
      let calls=0;await visit(async page=>{await mounted(page,'sessions');await frame(page).locator('#api').filter({hasText:'actual-api-ready'}).waitFor();await online(page);await page.locator('#ready-model[data-state=bad]').waitFor();assert.equal(calls,1);await frame(page).locator('#draft').fill('custom draft218');const old=await page.locator('#panel-host iframe').elementHandle();await configure({api:readyApi,allowAllWhenEmpty:true});await frame(page).locator('#event').filter({hasText:'actual-sse-update'}).waitFor();await page.locator('#ready-model[data-state=good]').waitFor();await sameFrame(page,old);assert.equal(await frame(page).locator('#draft').inputValue(),'custom draft218');assert.equal(calls,2);},async(_route,url)=>{if(url.pathname==='/api/config')++calls;return false;});await stop();disable('home218');
    });
    for(const type of ['whole','entry'])await check(`${type} settings replacement without a navigation declaration keeps ordinary home`,async()=>{
      const id='settings218-'+type;
      if(type==='whole'){write(`overrides/${id}/page/index.html`,simpleHtml);write(`overrides/${id}/page/panel.js`,simpleScript);layer(id,{panels:[{id:'settings',title:'Custom settings218',assetRoot:'./page',permissions:[],api:[{method:'GET',path:'/api/status'}]}]});}
      else{write(`overrides/${id}/panel.js`,"document.body.dataset.entry218='selected';");layer(id,{assets:{'panels/settings/panel.js':'./panel.js'}});}
      await start();await configure();const dto=(await call('GET','/api/panels')).panels.find(panel=>panel.id==='settings');assert.equal(dto.navigation,undefined);assert.ok(dto.stateGeneration);
      await visit(async page=>{await mounted(page,'sessions');await online(page);await page.locator('#nav button[data-panel=settings]').click();await mounted(page,'settings');if(type==='whole')await frame(page).locator('#custom-home').waitFor();else await frame(page).locator('body[data-entry218=selected]').waitFor();});await stop();disable(id);
    });
    await check('appending only the startup policy changes the actual mount, preserves live API/SSE draft and disables back to default',async()=>{
      write('overrides/policy218/policy.js',"export const chooseStartupTarget=()=>({id:'sessions'});export function createStartupNavigation(){document.documentElement.dataset.policy218='appended';let attempted=false,interacted=false,closed=false,epoch=0;return{get attempted(){return attempted},get interacted(){return interacted},navigate(){interacted=true;epoch++},async select({panels,readConfig,isCurrent=()=>true}){if(attempted||interacted||closed||!isCurrent())return null;attempted=true;const ticket=epoch;try{await readConfig()}catch{}return!closed&&!interacted&&ticket===epoch&&isCurrent()&&panels.some(p=>p.id==='sessions')?{id:'sessions'}:null},dispose(){closed=true;epoch++}};}");layer('policy218',{assets:{'shell/startup-navigation.js':'./policy.js'}});await start();await configure();
      await visit(async page=>{await mounted(page,'sessions');await online(page);assert.equal(await page.locator('html').getAttribute('data-policy218'),'appended');await frame(page).locator('#search').fill('policy draft218');const old=await page.locator('#panel-host iframe').elementHandle();await frame(page).locator('body').evaluate(async()=>{const{request,onShellEvent}=await import('/panels/panel-client.js');window.qa218API=Array.isArray((await request('GET','/api/sessions')).sessions);onShellEvent((name,payload)=>{if(name==='status'&&payload?.configUpdated)window.qa218SSE=true;});});await configure({api:readyApi,allowAllWhenEmpty:true});await page.frames().find(item=>item.url().startsWith(base+'/panels/sessions/')).waitForFunction(()=>window.qa218SSE===true);await sameFrame(page,old);assert.equal(await frame(page).locator('#search').inputValue(),'policy draft218');assert.equal(await frame(page).locator('body').evaluate(()=>window.qa218API),true);});await stop();disable('policy218');await start();await configure();await visit(async page=>{await mounted(page,'settings','models');assert.equal(await page.locator('html').getAttribute('data-policy218'),null);});await stop();
    });
    await start();
    for(const initial of ['fail-once','empty-once'])await check(`first manifest ${initial} recovery consumes the latest applied SSE configuration`,async()=>{
      await configure();panelMode=initial;panelCalls=0;const held=gate(),captured=deferred();let panelsRead=0;
      await visit(async page=>{await captured.promise;await online(page);await page.locator('#ready-model[data-state=bad]').waitFor();assert.equal(await page.locator('#panel-host iframe').count(),0);await configure({api:readyApi,allowAllWhenEmpty:true});await page.locator('#ready-model[data-state=good]').waitFor();held.release();await mounted(page,'sessions');assert.equal(await page.locator('#panel-host iframe[src*="settings"]').count(),0);},async(route,url)=>{if(url.pathname==='/api/panels'&&++panelsRead>1){const response=await route.fetch();captured.resolve();await held.promise;await route.fulfill({response});return true;}return false;});panelMode='normal';
    });
    await check('a late old prefetch cannot overwrite the newer SSE generation before first recovery',async()=>{
      await configure();panelMode='empty-once';panelCalls=0;const oldConfig=gate(),heldPanels=gate(),capturedPanels=deferred();let configs=0,manifests=0;
      await visit(async page=>{await capturedPanels.promise;await online(page);await configure({api:readyApi,allowAllWhenEmpty:true});await page.locator('#ready-model[data-state=good]').waitFor();oldConfig.release();await page.waitForFunction(()=>window.qa218.configParsed.some(item=>item.model===''));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('#ready-model').getAttribute('data-state'),'good');heldPanels.release();await mounted(page,'sessions');},async(route,url)=>{if(url.pathname==='/api/config'&&++configs===1){const response=await route.fetch();await oldConfig.promise;await route.fulfill({response});return true;}if(url.pathname==='/api/panels'&&++manifests>1){const response=await route.fetch();capturedPanels.resolve();await heldPanels.promise;await route.fulfill({response});return true;}return false;});panelMode='normal';
    });
    await check('an invalidated runtime snapshot is not reused while its SSE refresh is still pending',async()=>{
      await configure();panelMode='empty-once';panelCalls=0;const newConfig=gate(),heldPanels=gate(),capturedPanels=deferred(),capturedNew=deferred();let configs=0,manifests=0;
      await visit(async page=>{await capturedPanels.promise;await online(page);await page.locator('#ready-model[data-state=bad]').waitFor();await configure({api:readyApi,allowAllWhenEmpty:true});await capturedNew.promise;heldPanels.release();await mounted(page,'sessions');const old=await page.locator('#panel-host iframe').elementHandle();newConfig.release();await page.locator('#ready-model[data-state=good]').waitFor();await sameFrame(page,old);},async(route,url)=>{if(url.pathname==='/api/config'&&++configs>1){const response=await route.fetch();capturedNew.resolve();await newConfig.promise;await route.fulfill({response});return true;}if(url.pathname==='/api/panels'&&++manifests>1){const response=await route.fetch();capturedPanels.resolve();await heldPanels.promise;await route.fulfill({response});return true;}return false;});panelMode='normal';
    });
    await stop();await addStartupObserver();await start();
    await check('pagehide during real recovery selection cannot remount a default iframe or reopen SSE',async()=>{
      await configure();panelMode='fail';const held=gate(),captured=deferred();let configs=0;
      await visit(async page=>{await captured.promise;await online(page);await page.waitForFunction(()=>window.qa218.panelsParsed>=2&&window.qa218.panelsParsed===window.qa218.fetches.filter(call=>call.path==='/api/panels').length);await page.locator('#panel-recovery button[type=submit]:enabled').waitFor();panelMode='normal';await page.locator('#panel-recovery button[type=submit]').click();await page.waitForFunction(()=>window.qa218Recovered?.entered&&window.qa218Policy?.entered===1&&window.qa218Policy.settled===0);const sseBefore=await page.evaluate(()=>window.qa218.fetches.filter(call=>call.path==='/api/events').length);await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true})));assert.equal(await page.evaluate(()=>window.qa218Policy.disposed),0,'a cancelled beforeunload keeps the current shell policy alive');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.waitForFunction(()=>window.qa218Recovered?.settled===true&&window.qa218Policy.disposed===1&&window.qa218Policy.settled===1);await consumeLateConfig(page,held);assert.equal(await page.locator('#panel-host iframe').count(),0);assert.equal(await page.evaluate(()=>window.qa218.fetches.filter(call=>call.path==='/api/events').length),sseBefore);assert.deepEqual(await page.evaluate(()=>window.qa218.mounts),[]);},async(route,url)=>{if(url.pathname==='/api/config'&&++configs===1){const response=await route.fetch();captured.resolve();await held.promise;await route.fulfill({response});return true;}return false;});panelMode='normal';
    });
  }
  assert.deepEqual(pageErrors,[]);assert.deepEqual(outbound,[]);assert.deepEqual(blocked,[]);assert.deepEqual(requests.filter(request=>['/api/config','/api/config/lifecycle'].includes(request.path)&&request.method==='POST'),[],'navigation never writes configuration');completed=true;
}finally{
  for(const release of releases)release();releases.clear();await browser?.close();await stop();
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({at:new Date().toISOString(),ok:completed,headed,pureOnly,checks,pageErrors,outbound,blocked,requests,faults,entrySnapshots,boundary:'Owned synthetic app/data and random loopback only; actual config POST persisted/read from disk; route.fetch retains real delayed snapshots; no model/QQ/external service'},null,2));
  const resolved=path.resolve(root);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('qqa-start218-'));fs.rmSync(resolved,{recursive:true,force:true});
}

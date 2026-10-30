// Real temporary UI/data, owned random loopback port, inert transport/model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createPanelViewState} from '../ui/shell/panel-view-state.js';
import {RpcBridge} from '../ui/shell/rpc-bridge.js';
import {createPanelAdapters} from '../src/console/panel-adapters.js';
import {createPanelMetadata} from '../src/console/panel-metadata.js';
import {resolveCompositionSelection} from '../src/kernel/composition-selection.js';
import {createApplication} from '../src/kernel/composition.js';

const source=path.resolve(import.meta.dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-view217-')),appRoot=path.join(root,'app'),dataDir=path.join(root,'data');
const evidenceOption=process.argv.indexOf('--evidence-dir'),evidence=evidenceOption<0?path.join(source,'.qa-local/v04-parity-20261016/view-state217'):path.resolve(process.argv[evidenceOption+1]);
fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(appRoot);fs.cpSync(path.join(source,'ui'),path.join(appRoot,'ui'),{recursive:true});for(const directory of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,directory));
const checks=[],errors=[],outbound=[],token='synthetic-view217';
const headed=process.argv.includes('--headed')||process.env.QA_HEADED==='1'||process.env.QA_HEADLESS==='0',httpOnly=process.argv.includes('--http-only');
let kernel,browser,page,base,completed=false;
const check=async(name,run)=>{await run();checks.push(name);console.log('✓ 217 '+name);};
const definition=(id='memory',owner='defaults',generation='build-A')=>({id,title:id,kind:'bundled',entry:'index.html',permissions:[],api:[],stateOwner:owner,stateGeneration:generation,viewState:{keys:['navigation']}});
const snapshot={navigation:{schema:1,currentChatKey:'group:217',folds:[['group:217','21701',false]]}};
const write=(rel,text)=>{const file=path.join(appRoot,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);return file;};
const manifest=()=>JSON.parse(fs.readFileSync(path.join(appRoot,'ui/panels/manifest.json')));
const adapters=(extra={})=>createPanelAdapters({bundledManifest:manifest(),staticRoot:path.join(appRoot,'ui'),...extra});
async function start(initialize=false){
  kernel=await createApplication({appRoot,headless:true,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},transport:{id:'inert217',start(){},stop(){},status:()=>({connected:false}),actions:{getGroupName:()=> 'Synthetic217',getGroupMembers:()=>[]}},priceUpdates:{refresh:async()=>({ok:true}),updateCheck:async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false})},communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})},fetchImpl:async(...args)=>{outbound.push(String(args[0]));throw Error('No external IO217');}});
  kernel.log.setLevel('error');kernel.loader.startWatchers=()=>{};
  if(initialize){kernel.config.update({server:{port:0,token},telemetry:{enabled:false},proactive:{enabled:false},allow:{groups:['217','218']},api:{baseUrl:'https://synthetic.invalid/v1',model:'synthetic'},ui:{refreshMs:3600000}});for(const [chat,uid]of [['group:217','21701'],['group:217','21702'],['group:218','21801']])kernel.memory.replaceMember(chat,{userId:uid,name:'Synthetic '+uid,impressions:['Synthetic impression '+uid]});}
  const port=await kernel.start();assert.notEqual(port,15967);base=`http://127.0.0.1:${port}`;assert.deepEqual(kernel.loader.listEntries(),[]);
}
async function stop(){await kernel?.stop();kernel=null;}
const getPanels=()=>fetch(base+'/api/panels',{headers:{'x-console-token':token}}).then(async response=>{assert.equal(response.status,200);return(await response.json()).panels;});
const memoryFrame=()=>page.frameLocator('#panel-host iframe');
async function navigate(id){await page.locator(`#nav button[data-panel="${id}"]`).click();await page.locator(`#panel-host iframe[src^="/panels/${id}/"]`).waitFor();const frame=memoryFrame();if(id==='memory')await frame.locator('[data-memory-chat="group:217"]').waitFor();else await frame.locator('body').waitFor();return frame;}
async function selectChat(frame,chat){await frame.locator(`[data-memory-chat="${chat}"] strong`).click();await frame.locator('.memory-chat-title').filter({hasText:'成员印象'}).waitFor();await frame.locator(`[data-member="${chat==='group:217'?'21701':'21801'}"]`).waitFor();}
async function collapsed(frame,uid,value){assert.equal(await frame.locator(`[data-member="${uid}"] summary`).getAttribute('aria-expanded'),String(!value));}

try{
  await check('bounded leases isolate owners/ids, clone values, and reject old-frame/late-generation snapshots',async()=>{
    const store=createPanelViewState();const first=store.open(definition());store.leave(first,'flush');assert.equal(store.finish(first,'flush',snapshot),true);
    const next=store.open(definition()),copy=store.read(next);copy.navigation.folds[0][2]=true;assert.equal(store.read(next).navigation.folds[0][2],false);
    assert.deepEqual(store.read(store.open(definition('other'))),{});store.leave(next,'old');const replacement=store.open(definition('memory','append','build-B'));assert.equal(store.finish(next,'old',snapshot),false);assert.deepEqual(store.read(replacement),{});
    store.reconcile([]);assert.equal(store.finish(replacement,'old',snapshot),false);assert.deepEqual(store.read(store.open(definition())),{});
    assert.equal(store.open({...definition(),kind:'user'}),null);assert.equal(store.open({...definition(),viewState:undefined}),null);assert.deepEqual(store.read({}),{});
  });
  await check('strict JSON, declared keys, byte/depth/array quotas and TTL retain only bounded RAM snapshots',async()=>{
    let time=0;const store=createPanelViewState({now:()=>time,ttl:20,maxScopes:2,totalBytes:200});const save=value=>{const lease=store.open(definition());store.leave(lease,'x');return store.finish(lease,'x',value);};assert.equal(save(snapshot),true);
    const cycle={};cycle.cycle=cycle;const sparse=[];sparse[2]=true;const accessor={};Object.defineProperty(accessor,'bad',{enumerable:true,get(){throw Error('must not run');}});
    for(const value of [{foreign:{}},{navigation:cycle},{navigation:sparse},{navigation:accessor},{navigation:NaN},{navigation:new Date()},{navigation:new Map()},{navigation:'x'.repeat(257)},{navigation:Array(129).fill(0)},{navigation:JSON.parse('{"__proto__":{}}')},{navigation:'x'.repeat(200)}])assert.equal(save(value),false);
    assert.deepEqual(store.read(store.open(definition())),snapshot);store.open(definition('two'));assert.equal(store.open(definition('three')),null);time=21;assert.deepEqual(store.read(store.open(definition())),{});
  });
  await check('real bridge binds snapshot acknowledgements to source/origin/nonce and a fresh flush id',async()=>{
    const previous=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};
    const store=createPanelViewState(),lease=store.open(definition()),sent=[];const frame={contentWindow:{postMessage:message=>sent.push(message)},addEventListener(){}};
    const bridge=new RpcBridge({frame,manifest:definition(),viewState:{read:()=>store.read(lease),leave:id=>store.leave(lease,id),finish:(id,data)=>store.finish(lease,id,data),expire:()=>store.expire(lease)}});
    const event=params=>({source:frame.contentWindow,origin:'null',data:{jsonrpc:'2.0',method:'panel.flushed',params,meta:{nonce:bridge.nonce,panel:'memory'}}});
    try{
      bridge.ready=true;const flush=bridge.flush(),id=sent.at(-1).params.flushId;
      const wrongNonce=event({flushId:id,viewState:snapshot});wrongNonce.data.meta.nonce='forged';
      for(const forged of [{...event({flushId:id,viewState:snapshot}),source:{}},{...event({flushId:id,viewState:snapshot}),origin:'http://untrusted.invalid'},wrongNonce,event({flushId:'wrong',viewState:snapshot})])await bridge.handle(forged);
      assert.ok(bridge.flushResolve);await bridge.handle(event({flushId:id,viewState:snapshot}));await flush;assert.deepEqual(store.read(store.open(definition())),snapshot);
      await bridge.handle(event({flushId:id,viewState:{navigation:{schema:99}}}));assert.deepEqual(store.read(store.open(definition())),snapshot);
    }finally{bridge.close();globalThis.window=previous;}
  });
  await check('metadata is stable across constructions, cloned without fs work, path-free and conservative for missing UI roots',async()=>{
    const first=adapters().listPanels();assert.deepEqual(adapters().listPanels(),first);assert.equal(first.find(panel=>panel.id==='sessions').navigation.home,true);assert.deepEqual(first.find(panel=>panel.id==='settings').navigation.sections,['access','models','onebot']);assert.deepEqual(first.find(panel=>panel.id==='memory').viewState,{keys:['navigation']});
    const fileReads=new Map(),nativeRead=fs.readFileSync;fs.readFileSync=function(filename,...args){const file=String(filename);if(file.startsWith(path.join(appRoot,'ui')+path.sep))fileReads.set(file,(fileReads.get(file)??0)+1);return nativeRead.call(this,filename,...args);};try{adapters();}finally{fs.readFileSync=nativeRead;}assert.ok(fileReads.size>20);assert.ok([...fileReads.values()].every(count=>count===1),'shared selected assets are hashed once, not once per page');
    assert.ok(!JSON.stringify(first).includes(appRoot));const instance=adapters(),oldRead=fs.readFileSync;fs.readFileSync=()=>{throw Error('GET cannot read files');};try{for(let i=0;i<100;i++)assert.deepEqual(instance.listPanels(),first);}finally{fs.readFileSync=oldRead;}
    assert.ok(createPanelAdapters({bundledManifest:manifest(),staticRoot:path.join(root,'absent')}).listPanels().every(panel=>!panel.stateGeneration));
    assert.ok(adapters({metadataFactory:options=>createPanelMetadata({...options,maxBytes:1,log:{warn(){}}})}).listPanels().every(panel=>!panel.stateGeneration&&!panel.viewState&&!panel.navigation));
  });
  await check('actual resolver provenance excludes shadowed assets and revokes default navigation on entry/full-page replacement',async()=>{
    const low=write('probe/lower.js','// shadowed'),selectedRoot=path.dirname(write('probe/page/index.html','<h1>trusted page</h1><script src="panel.js"></script>'));write('probe/page/panel.js','// selected page');
    const replacement={...manifest().panels.find(panel=>panel.id==='sessions'),assetRoot:selectedRoot};delete replacement.navigation;
    const plan=[{layer:{id:'low',version:1,order:1},components:[],routes:[],ui:{panels:[],assets:{'panels/sessions/panel.js':low}}},{layer:{id:'page-owner',version:1,order:2},components:[],routes:[],ui:{panels:[replacement],assets:{}}}];
    const selection=resolveCompositionSelection(plan),options={ui:selection.ui,uiSelection:selection.selection.ui};const first=adapters(options).listPanels();assert.equal(first.find(panel=>panel.id==='sessions').navigation,undefined);assert.equal(adapters(options).resolveUiAsset('/panels/sessions/missing.js'),false);fs.writeFileSync(low,'// changed shadow');assert.deepEqual(adapters(options).listPanels(),first);
    const explicit=resolveCompositionSelection([{layer:{id:'entry-owner',version:1,order:1},components:[],routes:[],ui:{panels:[],assets:{'panels/settings/panel.js':low}}}]);assert.equal(adapters({ui:explicit.ui,uiSelection:explicit.selection.ui}).listPanels().find(panel=>panel.id==='settings').navigation,undefined);
  });
  await start(true);
  await check('real HTTP startup snapshots stay identical across independent application restart',async()=>{const before=await getPanels();await stop();await start();assert.deepEqual(await getPanels(),before);});
  if(!httpOnly){
    const playwright=createRequire(import.meta.url)('playwright-core'),cache=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ms-playwright');
    const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9))).map(name=>path.join(cache,name,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));assert.ok(executablePath);
    browser=await playwright.chromium.launch({executablePath,headless:!headed});page=await browser.newPage({viewport:{width:1360,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(12000);page.on('pageerror',reason=>errors.push(reason.message));await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());await page.goto(base);
    await check('actual destroyed/recreated memory iframe restores selected chat and logical collapse state',async()=>{
      let frame=await navigate('memory');await selectChat(frame,'group:217');await frame.locator('[data-member="21701"] summary').click();await collapsed(frame,'21701',true);const old=await page.locator('#panel-host iframe').elementHandle();
      await navigate('sessions');assert.equal(await old.evaluate(node=>node.isConnected),false);frame=await navigate('memory');await frame.locator('[data-member="21701"]').waitFor();await collapsed(frame,'21701',true);await collapsed(frame,'21702',false);assert.equal(await frame.locator('[data-memory-chat="group:217"]').evaluate(node=>node.classList.contains('selected')),true);
      await page.screenshot({path:path.join(evidence,'restored.png'),fullPage:true});
    });
    await check('folds remain isolated between chats and a second shell document has no first-shell state',async()=>{
      let frame=memoryFrame();await selectChat(frame,'group:218');await frame.locator('[data-member="21801"] summary').click();await navigate('sessions');frame=await navigate('memory');await frame.locator('[data-member="21801"]').waitFor();await collapsed(frame,'21801',true);await selectChat(frame,'group:217');await collapsed(frame,'21701',true);
      const other=await browser.newPage();try{await other.goto(base);await other.locator('#nav button[data-panel=memory]').click();const independent=other.frameLocator('#panel-host iframe');await independent.locator('[data-memory-chat="group:217"]').waitFor();assert.equal(await independent.locator('.member-cards').count(),0);await independent.locator('[data-memory-chat="group:217"] strong').click();await independent.locator('[data-member="21701"]').waitFor();await collapsed(independent,'21701',false);}finally{await other.close();}
    });
    await check('fresh restored data intersects removed members and successful own clear invalidates selection/folds',async()=>{
      await navigate('sessions');kernel.memory.removeMember('group:217','21701');let frame=await navigate('memory');await frame.locator('[data-member="21702"]').waitFor();assert.equal(await frame.locator('[data-member="21701"]').count(),0);await navigate('sessions');kernel.memory.replaceMember('group:217',{userId:'21701',name:'recreated after observed delete',impressions:['new']});frame=await navigate('memory');await frame.locator('[data-member="21701"]').waitFor();await collapsed(frame,'21701',false);
      const deletion=page.waitForResponse(response=>response.request().method()==='DELETE'&&new URL(response.url()).pathname==='/api/memory-files/group_217');const control=frame.locator('[data-memory-chat="group:217"]').getByRole('button',{name:'删除',exact:true});for(let i=0;i<4;i++)await control.click();assert.equal((await deletion).status(),200);await frame.getByText('记忆已清空',{exact:true}).waitFor();assert.equal(await frame.locator('[data-memory-chat="group:217"]').evaluate(node=>node.classList.contains('selected')),false);assert.equal(fs.existsSync(path.join(dataDir,'memory/group_217/21701.json')),false);await navigate('sessions');kernel.memory.replaceMember('group:217',{userId:'21701',name:'new after own clear',impressions:['new']});frame=await navigate('memory');assert.equal(await frame.locator('.member-cards').count(),0);await selectChat(frame,'group:217');await collapsed(frame,'21701',false);
    });
    await check('appended broker asset runs independently and disabling its layer returns to the default broker',async()=>{
      await page.close();await stop();
      write('overrides/view217/base.js',fs.readFileSync(path.join(source,'ui/shell/panel-view-state.js'),'utf8'));
      write('overrides/view217/broker.js',"import {createPanelViewState as base} from '/panels/view217-base.js';export function createPanelViewState(options){document.documentElement.dataset.view217='appended';return base(options);}");
      const declaration={version:1,id:'view217',order:217,ui:{assets:{'shell/panel-view-state.js':'./broker.js','panels/view217-base.js':'./base.js'}}};write('overrides/view217/composition.json',JSON.stringify(declaration));await start();page=await browser.newPage();page.on('pageerror',reason=>errors.push(reason.message));await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());await page.goto(base);await page.locator('html[data-view217="appended"]').waitFor();let frame=await navigate('memory');await selectChat(frame,'group:217');await frame.locator('[data-member="21701"] summary').click();await navigate('sessions');frame=await navigate('memory');await frame.locator('[data-member="21701"]').waitFor();await collapsed(frame,'21701',true);
      await page.close();await stop();write('overrides/view217/composition.json',JSON.stringify({...declaration,enabled:false}));await start();page=await browser.newPage();page.on('pageerror',reason=>errors.push(reason.message));await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());await page.goto(base);frame=await navigate('memory');assert.equal(await page.locator('html').getAttribute('data-view217'),null);assert.equal(await frame.locator('.member-cards').count(),0);await selectChat(frame,'group:217');await frame.locator('[data-member="21701"] summary').click();await navigate('sessions');frame=await navigate('memory');await frame.locator('[data-member="21701"]').waitFor();await collapsed(frame,'21701',true);
    });
  }
  assert.deepEqual(outbound,[]);assert.deepEqual(errors,[]);completed=true;
}finally{
  await browser?.close();await stop();fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({at:new Date().toISOString(),ok:completed,headed,httpOnly,checks,errors,outbound,limits:'RAM-only 8KiB scope,32 scopes,256KiB total,30min TTL; no proof for inactive delete/recreate of the same UID without a data epoch'},null,2));
  const resolved=path.resolve(root);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('qqa-view217-'));fs.rmSync(resolved,{recursive:true,force:true});
}

import {settingsSection,settingsSave,openSettingsFold} from './settings-navigation.mjs';
// Isolated real console/atomic config, selected composition factories, default
// orchestrator + runner, and opaque settings frame. No accounts/model network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createApplication} from '../src/kernel/composition.js';
import {defaultComponents} from '../bundled/runtime-defaults/components.js';
import {isSettingsSaveRequest,SETTINGS_SAVE_ROUTE} from './settings-save-observation.mjs';

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-persona211-')),appRoot=path.join(temporary,'app'),dataDir=path.join(temporary,'data');
fs.mkdirSync(appRoot);fs.cpSync(new URL('../ui',import.meta.url),path.join(appRoot,'ui'),{recursive:true});
for(const directory of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,directory));
const layer=(name,manifest,files)=>{const directory=path.join(appRoot,'overrides',name);fs.mkdirSync(directory,{recursive:true});for(const [file,source] of Object.entries(files))fs.writeFileSync(path.join(directory,file),source);fs.writeFileSync(path.join(directory,'composition.json'),JSON.stringify({version:1,id:name,...manifest}));return path.join(directory,'composition.json');};
// Exercise the retained editor as an explicit presentation override; test 281 covers the new default library.
layer('05-legacy-persona-ui',{ui:{assets:{'panels/settings/persona-library.js':'./legacy.mjs'}}},{'legacy.mjs':'export function mountPersonaLibrary(){return null;}'});
const selectedText='QA_SELECTED_RUNTIME_PERSONA_TEXT_211',token='synthetic-persona211',errors=[],calls=[],writes=[];
layer('10-persona-text',{components:{'runtime.persona.text':'./text.mjs'}},{'text.mjs':`export default ()=>${JSON.stringify(selectedText)};`});
let kernel,base,browser,page,release,outbound=0,renameFault=false;
const originalRename=fs.renameSync;
fs.renameSync=function(from,to,...rest){if(renameFault&&path.resolve(to)===path.join(dataDir,'config.json'))throw Object.assign(new Error('synthetic persona config rename failure'),{code:'EACCES'});return originalRename.call(this,from,to,...rest);};
const disk=()=>JSON.parse(fs.readFileSync(path.join(dataDir,'config.json'),'utf8'));
async function start(initialize=false){
  kernel=await createApplication({appRoot,headless:true,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_MIGRATE_FROM:path.join(temporary,'absent')},
    transport:{id:'passive-persona211',start(){},stop(){},status:()=>({connected:false}),actions:{}},
    components:{'runtime.logger':options=>defaultComponents['runtime.logger']({...options,mirrorConsole:false}),'llm.complete':async args=>{calls.push(structuredClone(args.messages));return{message:{role:'assistant',content:''},finishReason:'stop'};}},
    fetchImpl:async()=>{outbound++;throw new Error('External requests disabled');},
    priceUpdates:{resolve:()=>null,refresh:async()=>({ok:true}),updateCheck:async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false})},
    communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})}});
  kernel.loader.startWatchers=()=>{};
  if(initialize)kernel.config.update({server:{port:0,token},telemetry:{enabled:false},api:{baseUrl:'http://127.0.0.1:9/v1',model:'in-process-observer',maxRounds:1},allowAllWhenEmpty:true,proactive:{enabled:false},chatActive:{enabled:false},memory:{consolidateEnabled:false},sessionRetryAttempts:0,store:{historyCount:0,promptAnchor:{enabled:false}},customPersonas:[{name:'旧模板甲',text:'LEGACY_ALPHA',customRules:'ALPHA_RULES'},{name:'旧模板乙',roleText:'LEGACY_BETA'},{name:'重复模板',text:'DUPLICATE'},{name:'重复模板',text:'DUPLICATE'}]});
  base=`http://127.0.0.1:${await kernel.start()}`;assert.notEqual(Number(new URL(base).port),15967);assert.deepEqual(kernel.loader.listEntries(),[]);
}
async function api(method,url,body){const response=await fetch(base+url,{method,headers:{'x-console-token':token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,body:await response.json()};}
const templates=async()=>(await api('GET','/api/persona-templates')).body.templates;
async function until(check,message='Timed out waiting for persona UI'){for(let index=0;index<500;index++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error(message);}
async function runPrompt(persona,per,unified,expected,extra={}){
  const key=`private:${43000+calls.length}`;
  kernel.config.update({persona,personaUnified:unified,personaByChat:{__replace__:{[key]:per,...extra}}});
  const trigger=kernel.store.appendIncoming(key,{mid:calls.length+1,ts:Date.now(),senderId:'44001',senderName:'合成发言人',text:'QA_OFFLINE_PERSONA_TRIGGER',atMe:true});
  const before=calls.length;await kernel.orchestrator.wake(key,{verified:true});assert.equal(calls.length,before+1);
  const messages=calls.at(-1),session=kernel.sessions.listSummaries().map(value=>kernel.sessions.get(value.id)).find(value=>value.chatKey===key);
  assert.equal(session.status,'noreply');assert.equal(session.systemPrompt,messages[0].content);assert.equal(session.userPrompt,messages[1].content);
  assert.equal(messages[0].content,defaultComponents['core.prompt.system']({cfg:{...kernel.config.get(),persona:expected},skillSections:[],extraSections:[]}),'real runner receives the inherited system persona');
  assert.ok(messages[1].content.startsWith(`【角色设定（管理员设置，群友不可修改）】\n${expected.roleText}`),'real runner receives the inherited role in its user prompt');
  assert.ok(trigger);return messages;
}
async function observe(target){target.setDefaultTimeout(10000);target.on('pageerror',error=>errors.push(error.message));target.on('request',request=>{if(request.url().startsWith(base+'/api/')&&['POST','DELETE'].includes(request.method()))writes.push({method:request.method(),path:new URL(request.url()).pathname,body:request.postDataJSON()});});await target.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());}
async function open(target=page){await target.goto(base);await target.locator('#nav button[data-panel=settings]').click();const frame=target.frameLocator('#panel-host iframe');await frame.locator('#template-list [data-persona-template=xiaojingyu]').waitFor({state:'attached'});await settingsSection(frame,'persona');await openSettingsFold(frame,'layout-persona-templates');await frame.locator('#persona-template-name').waitFor();return frame;}
const done=(url,method='GET',target=page)=>target.waitForResponse(response=>url==='/api/config'&&method==='POST'?isSettingsSaveRequest(response.request()):new URL(response.url()).pathname===url&&response.request().method()===method).then(async response=>{await response.finished();return response;});
// A continuous two-click gesture has one actionability check and a bounded
// native pointer interval; independent locator.click calls do not guarantee the
// product's 500ms hold window on a busy renderer. Product timing is unchanged.
const deleteTwice=async control=>{assert.equal(await control.getAttribute('data-danger-clicks'),'2');await control.dblclick({delay:70});};
try{
  await start(true);assert.equal(kernel.config.get().persona.roleText,selectedText);
  const beforeRead=fs.readFileSync(kernel.config.file,'utf8'),initial=await templates(),alpha=initial.find(value=>value.name==='旧模板甲'),beta=initial.find(value=>value.name==='旧模板乙');
  assert.equal(initial[0].text,selectedText);assert.equal(initial[0].customRules,'');assert.equal(initial[0].builtin,true);
  assert.equal(new Set(initial.map(value=>value.id)).size,initial.length);assert.ok(initial.slice(1).every(value=>/^custom_[a-f0-9]{32}$/.test(value.id)&&typeof value.revision==='string'));
  assert.deepEqual(await templates(),initial);assert.equal(fs.readFileSync(kernel.config.file,'utf8'),beforeRead,'GET derives identities without a migration write');
  assert.equal((await api('DELETE','/api/persona-templates/custom_0',{expected:alpha.revision})).status,409);
  assert.equal((await api('DELETE',`/api/persona-templates/${alpha.id}`)).status,409);
  assert.equal((await api('DELETE','/api/persona-templates/xiaojingyu',{expected:initial[0].revision})).status,403);
  assert.equal((await api('DELETE',`/api/persona-templates/${alpha.id}`,{expected:alpha.revision})).status,200);
  assert.equal((await api('DELETE',`/api/persona-templates/${alpha.id}`,{expected:alpha.revision})).status,409,'a stale delete cannot target the next item');
  assert.equal((await templates()).find(value=>value.name===beta.name).id,beta.id);assert.equal(disk().customPersonas[0].id,beta.id,'first mutation persists surviving identities atomically');
  kernel.config.update({customPersonas:kernel.config.get().customPersonas.map(value=>value.id===beta.id?{...value,text:'UPDATED_BETA',roleText:undefined}:value)});
  assert.equal((await api('DELETE',`/api/persona-templates/${beta.id}`,{expected:beta.revision})).status,409,'same stable ID with changed content rejects stale CAS');
  assert.equal((await templates()).find(value=>value.id===beta.id).text,'UPDATED_BETA');
  let statusEvents=0;const off=kernel.bus.on('status',value=>{if(value?.personaTemplatesUpdated)statusEvents++;},{internal:true});
  for(const method of ['POST','DELETE']){
    const target=(await templates()).find(value=>!value.builtin),beforeMemory=structuredClone(kernel.config.get()),beforeDisk=fs.readFileSync(kernel.config.file,'utf8'),beforeEvents=statusEvents;
    renameFault=true;let result;try{result=await api(method,method==='POST'?'/api/persona-templates':`/api/persona-templates/${target.id}`,method==='POST'?{name:'失败草稿',text:'FAILED_CARD'}:{expected:target.revision});}finally{renameFault=false;}
    assert.equal(result.status,500);assert.deepEqual(kernel.config.get(),beforeMemory);assert.equal(fs.readFileSync(kernel.config.file,'utf8'),beforeDisk);assert.equal(statusEvents,beforeEvents,'failed atomic save publishes no template event');
  }
  const created=await api('POST','/api/persona-templates',{name:'  成功模板  ',text:'  CUSTOM_ROLE  ',customRules:'  CUSTOM_RULES  '});assert.equal(created.status,200);assert.match(created.body.created,/^custom_[a-f0-9]{32}$/);const custom=created.body.templates.find(value=>value.id===created.body.created);assert.equal(custom.name,'成功模板');assert.equal(custom.customRules,'CUSTOM_RULES');assert.equal(disk().customPersonas.at(-1).id,custom.id);assert.equal(statusEvents,1,'a real successful write proves the internal event observer is active');off();
  for(const invalid of [{name:'',text:'x'},{name:'x',text:1},{name:'x',text:'x',customRules:null}])assert.equal((await api('POST','/api/persona-templates',invalid)).status,400);
  const global={botName:'GLOBAL_IDENTITY',selfNickname:'ACCOUNT_NICK',roleText:'GLOBAL_ROLE',customRules:'GLOBAL_RULES',participation:'high',systemPromptOverride:''};
  for(const invalid of [null,'',' ','invalid',0,false,{},[]])await runPrompt(global,{roleText:'  ',customRules:null,systemPromptOverride:17,participation:invalid,botName:'FORBIDDEN_IDENTITY'},false,global);
  await runPrompt(global,{roleText:' LOCAL_ROLE ',customRules:' LOCAL_RULES ',participation:'low',botName:'FORBIDDEN_IDENTITY'},false,{...global,roleText:'LOCAL_ROLE',customRules:'LOCAL_RULES',participation:'low'});
  await runPrompt(global,{participation:'medium'},false,{...global,participation:'medium'});
  await runPrompt(global,{roleText:'LOCAL_ROLE',participation:'low'},'false',global);
  const overridden={...global,systemPromptOverride:'GLOBAL_OVERRIDE {botName} {roleText} {participation}'};await runPrompt(overridden,{roleText:null,customRules:'',systemPromptOverride:'   ',participation:'invalid'},false,overridden);
  const precedence=defaultComponents['core.prompt.persona']({persona:global,personaUnified:false,personaByChat:{43000:{roleText:'BARE_ID'},'group:43000':{roleText:'FULL_KEY'}}},'group:43000');assert.equal(precedence.roleText,'BARE_ID');assert.equal(precedence.botName,global.botName);assert.equal(precedence.selfNickname,undefined);assert.deepEqual(Object.keys(precedence).sort(),['botName','customRules','participation','roleText','systemPromptOverride']);
  console.log('✓ 211 actual API/disk: stable legacy/duplicate IDs, stale delete/CAS, selected builtin, atomic failure; default runner system/user inheritance');

  const controllerUrl=pathToFileURL(path.resolve(import.meta.dirname,'../src/console/persona-templates.js')).href,policyUrl=pathToFileURL(path.resolve(import.meta.dirname,'../src/kernel/persona.js')).href;
  const appended=layer('20-persona-controller',{components:{'console.personaTemplates':'./controller.mjs','core.prompt.persona':'./policy.mjs'}},{'controller.mjs':`import {createPersonaTemplateController} from ${JSON.stringify(controllerUrl)};export default options=>{const c=createPersonaTemplateController(options);return {...c,list:()=>({...c.list(),appendedController:true})};};`,'policy.mjs':`import {personaForChat} from ${JSON.stringify(policyUrl)};export default function(c,key){return {...personaForChat(c,key),roleText:'APPENDED_ROLE_211'};}`});
  await kernel.stop();kernel=null;await start();assert.equal((await api('GET','/api/persona-templates')).body.appendedController,true);await runPrompt(global,{},false,{...global,roleText:'APPENDED_ROLE_211'});
  const manifest=JSON.parse(fs.readFileSync(appended));manifest.enabled=false;fs.writeFileSync(appended,JSON.stringify(manifest));await kernel.stop();kernel=null;await start();assert.equal((await api('GET','/api/persona-templates')).body.appendedController,undefined);assert.equal((await templates()).find(value=>value.id===custom.id).text,'CUSTOM_ROLE');await runPrompt(global,{},false,global);
  console.log('✓ 211 actual appended controller + core.prompt.persona reach HTTP and both runner prompts; disabled layer restores defaults');

  kernel.config.update({persona:{...global,roleText:selectedText,customRules:''},personaUnified:true});
  const playwright=createRequire(import.meta.url)('playwright-core'),cache=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'ms-playwright');
  const versions=fs.readdirSync(cache).filter(value=>/^chromium-\d+$/.test(value)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9))),executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||versions.map(value=>path.join(cache,value,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));assert.ok(executablePath);
  browser=await playwright.chromium.launch({executablePath,headless:process.env.QA_HEADED!=='1'});page=await browser.newPage({viewport:{width:1360,height:1000}});await observe(page);let frame=await open();
  const item=id=>frame.locator(`[data-persona-template="${id}"]`),name=()=>frame.locator('#persona-template-name'),role=()=>frame.locator('#field-persona-roleText'),rules=()=>frame.locator('#field-persona-customRules'),notice=()=>frame.locator('#persona-template-manager [role=status]');
  let saved=done('/api/config','POST');await item(custom.id).getByRole('button',{name:'使用',exact:true}).click();assert.equal((await saved).status(),200);await until(()=>role().inputValue().then(value=>value==='CUSTOM_ROLE'));assert.equal(await rules().inputValue(),'CUSTOM_RULES');assert.equal(disk().persona.customRules,'CUSTOM_RULES');
  saved=done('/api/config','POST');await item('xiaojingyu').getByRole('button',{name:'使用',exact:true}).click();await saved;await until(()=>rules().inputValue().then(value=>value===''));assert.equal(disk().persona.roleText,selectedText);assert.equal(disk().persona.customRules,'','builtin selection explicitly resets custom rules');assert.equal(disk().persona.botName,global.botName);
  // Failed role persistence leaves the selected card visible as a retryable draft.
  const failConfig=route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'synthetic role save unavailable'})});await page.route(SETTINGS_SAVE_ROUTE,async route=>isSettingsSaveRequest(route.request())?failConfig(route):route.continue());
  const failedSave=done('/api/config','POST');await item(custom.id).getByRole('button',{name:'使用',exact:true}).click();assert.equal((await failedSave).status(),503);await notice().filter({hasText:'synthetic role save unavailable'}).waitFor();assert.equal(await role().inputValue(),'CUSTOM_ROLE');assert.equal(await rules().inputValue(),'CUSTOM_RULES');assert.equal(disk().persona.roleText,selectedText);await page.unroute(SETTINGS_SAVE_ROUTE);
  saved=done('/api/config','POST');await settingsSave(frame);await saved;await until(()=>Promise.resolve(disk().persona.roleText==='CUSTOM_ROLE'));
  // Name draft is independent of list reads and survives actual disk rename failure.
  await name().fill('保留的模板名称');renameFault=true;const failedCreate=done('/api/persona-templates','POST');await frame.getByRole('button',{name:'保存当前角色卡为模板',exact:true}).click();assert.equal((await failedCreate).status(),500);renameFault=false;await notice().filter({hasText:'服务器内部错误'}).waitFor();assert.equal(await name().inputValue(),'保留的模板名称');
  await frame.getByRole('button',{name:'重新读取模板',exact:true}).click();await until(()=>name().inputValue().then(value=>value==='保留的模板名称'));
  let createdResponse=done('/api/persona-templates','POST');await frame.getByRole('button',{name:'保存当前角色卡为模板',exact:true}).click();const uiCreated=(await (await createdResponse).json()).created;await item(uiCreated).waitFor();assert.equal(await name().inputValue(),'');
  const roleBeforeDelete=structuredClone(disk().persona),deleted=done(`/api/persona-templates/${uiCreated}`,'DELETE');await deleteTwice(item(uiCreated).getByRole('button',{name:'删除',exact:true}));assert.equal((await deleted).status(),200);await item(uiCreated).waitFor({state:'detached'});assert.deepEqual(disk().persona,roleBeforeDelete,'deleting a template preserves the active role');
  assert.equal(writes.find(value=>value.method==='DELETE'&&value.path.endsWith(uiCreated)).body.expected.length,64);

  // A real 409 is produced after a different writer edits the observed record.
  const stale=await api('POST','/api/persona-templates',{name:'冲突模板',text:'CONFLICT_CARD'}),staleId=stale.body.created;await item(staleId).waitFor();
  const staleGate=new Promise(resolve=>{release=resolve;}),swallowRead=async route=>{const response=await route.fetch();await staleGate;await route.fulfill({response});};
  let entered;const staleReadStarted=new Promise(resolve=>{entered=resolve;});const holdRead=async route=>{entered();return swallowRead(route);};await page.route(base+'/api/persona-templates',async route=>route.request().method()==='GET'?holdRead(route):route.continue());
  kernel.config.update({customPersonas:kernel.config.get().customPersonas.map(value=>value.id===staleId?{...value,text:'OTHER_WRITER_CARD'}:value)});kernel.bus.emit('status',{configUpdated:true,personaTemplatesUpdated:true});await staleReadStarted;
  await name().fill('冲突后保留名称');const rejected=done(`/api/persona-templates/${staleId}`,'DELETE');await deleteTwice(item(staleId).getByRole('button',{name:'删除',exact:true}));assert.equal((await rejected).status(),409);await notice().filter({hasText:'已变更'}).waitFor();assert.equal(await name().inputValue(),'冲突后保留名称');assert.ok(disk().customPersonas.some(value=>value.id===staleId));release();release=null;await page.unroute(base+'/api/persona-templates');

  // Capture an old list before a successful create. A late read cannot undo its
  // accepted receipt or clear a newer name draft typed while the request waits.
  let readEntered;const readStarted=new Promise(resolve=>{readEntered=resolve;}),oldGate=new Promise(resolve=>{release=resolve;});const oldRead=async route=>{readEntered();const response=await route.fetch();await oldGate;await route.fulfill({response});};await page.route(base+'/api/persona-templates',async route=>route.request().method()==='GET'?oldRead(route):route.continue());
  await frame.getByRole('button',{name:'重新读取模板',exact:true}).click();await readStarted;
  await name().fill('迟到读取期间创建');createdResponse=done('/api/persona-templates','POST');await frame.getByRole('button',{name:'保存当前角色卡为模板',exact:true}).click();const lateId=(await (await createdResponse).json()).created;await item(lateId).waitFor();
  await frame.locator('body').evaluate((_,id)=>{window.__qaOldListSettled=new Promise(resolve=>{const seen=event=>{const rows=event.data?.result?.templates;if(Array.isArray(rows)&&!rows.some(value=>value.id===id)){window.removeEventListener('message',seen);setTimeout(resolve,0);}};window.addEventListener('message',seen);});},lateId);
  release();release=null;await page.unroute(base+'/api/persona-templates');await frame.locator('body').evaluate(()=>window.__qaOldListSettled);await item(lateId).waitFor();assert.ok(disk().customPersonas.some(value=>value.id===lateId));
  // Old mutation receipt follows an even newer read from another writer.
  let postEntered;const postStarted=new Promise(resolve=>{postEntered=resolve;}),postGate=new Promise(resolve=>{release=resolve;});const heldPost=async route=>{const response=await route.fetch();postEntered();await postGate;await route.fulfill({response});};await page.route(base+'/api/persona-templates',async route=>route.request().method()==='POST'?heldPost(route):route.continue());
  await name().fill('晚到回执');await frame.getByRole('button',{name:'保存当前角色卡为模板',exact:true}).click();await postStarted;await name().fill('更新的名称草稿');const remote=await api('POST','/api/persona-templates',{name:'其他窗口更新',text:'REMOTE_CARD'});await item(remote.body.created).waitFor();release();release=null;await page.unroute(base+'/api/persona-templates');await notice().filter({hasText:'模板已保存'}).waitFor();await item(remote.body.created).waitFor();assert.equal(await name().inputValue(),'更新的名称草稿');
  // Disposal ignores late responses and cannot reinsert content in a new panel.
  let closedEntered;const closeStarted=new Promise(resolve=>{closedEntered=resolve;}),closeGate=new Promise(resolve=>{release=resolve;});const closePost=async route=>{const response=await route.fetch();closedEntered();await closeGate;await route.fulfill({response});};await page.route(base+'/api/persona-templates',async route=>route.request().method()==='POST'?closePost(route):route.continue());
  await name().fill('关闭期间提交');await frame.getByRole('button',{name:'保存当前角色卡为模板',exact:true}).click();await closeStarted;await page.locator('#nav button[data-panel=memory]').click();release();release=null;await page.unroute(base+'/api/persona-templates');const other=page.frameLocator('#panel-host iframe');await other.getByRole('heading',{name:'长期记忆',exact:true}).waitFor();assert.equal(await other.locator('#persona-template-manager').count(),0);frame=await open();await frame.getByText('关闭期间提交',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);assert.equal(outbound,0);
  // One appended UI file replaces only the template manager; settings fields,
  // HTTP controller and the configured role still use their production paths.
  await kernel.stop();kernel=null;const source=fs.readFileSync(new URL('../ui/panels/settings/persona-templates.js',import.meta.url),'utf8').replace('export function createPersonaTemplates','function defaultPersonaTemplates')+"\nexport function createPersonaTemplates(options){const manager=defaultPersonaTemplates(options);return {...manager,mount(host){manager.mount(host);host.dataset.appendedPersona='211';}};}\n";
  layer('30-persona-ui',{ui:{assets:{'panels/settings/persona-templates.js':'./templates.js'}}},{'templates.js':source});await start();frame=await open();assert.equal(await frame.locator('#persona-template-manager').getAttribute('data-appended-persona'),'211');assert.equal(await role().inputValue(),disk().persona.roleText);assert.equal(await frame.locator('#field-persona-botName').inputValue(),global.botName);assert.equal((await templates())[0].text,selectedText);
  assert.equal(outbound,0);assert.deepEqual(errors,[]);console.log('✓ 211 actual settings frame: use/reset, role/name drafts on failure, stable delete/CAS, late read/receipt, close/reopen, single-file appended UI');
  await browser.close();browser=null;await kernel.stop();kernel=null;
  layer('40-empty-persona-text',{components:{'runtime.persona.text':'./empty.mjs'}},{'empty.mjs':"export default ()=>'';"});await start();assert.equal((await templates())[0].text,'','an explicitly empty selected factory must not fall back to the repository asset');assert.equal((await templates())[0].customRules,'');assert.equal(outbound,0);
}finally{
  renameFault=false;fs.renameSync=originalRename;release?.();await browser?.close();await kernel?.stop();assert.equal(path.dirname(path.resolve(temporary)),path.resolve(os.tmpdir()));assert.ok(path.basename(temporary).startsWith('qqa-persona211-'));fs.rmSync(temporary,{recursive:true,force:true});
}

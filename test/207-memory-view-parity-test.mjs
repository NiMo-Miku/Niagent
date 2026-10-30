// Real composed console + normalized inert transport + Chromium. No QQ/account
// services, model requests, existing data or current console are involved.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createApplication} from '../src/kernel/composition.js';
import {createConfig,buildDefaultConfig} from '../src/kernel/config.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-memory-view207-')),appRoot=path.join(root,'app'),dataDir=path.join(root,'data');
fs.mkdirSync(appRoot);fs.cpSync(path.resolve(import.meta.dirname,'../ui'),path.join(appRoot,'ui'),{recursive:true});
for(const folder of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,folder));
const groupName='合成记忆群 <img src=x onerror=alert(1)>',note='独立备注 <b>纯文本</b>',names={'group:10001':groupName,'group:10002':'第二个合成群'};
const members=[{userId:'20001',nickname:'Alpha原昵称',card:'独立群名片',name:'额外原名'},{userId:'20002',nickname:'Beta原昵称',card:'另一张群名片'}];
const seed=(key,uid,updatedAt,impressions,name)=>{const dir=path.join(dataDir,'memory',key.replace(':','_'));fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,uid+'.json'),JSON.stringify({userId:uid,name,updatedAt,lastConsolidatedAt:0,impressions:impressions.map((content,i)=>({content,createdAt:i+1}))}));};
seed('group:10001','20001',Date.UTC(2024,0,1),['旧印象甲','旧印象乙'],'持久原名甲');
seed('group:10001','20002',Date.UTC(2025,0,1),['近期印象甲','近期印象乙'],'持久原名乙');
seed('group:10001','20003',0,[],'空成员仍可见');
seed('group:10002','20004',Date.UTC(2023,0,1),['另一聊天印象'],'第二群成员');
const token='synthetic-memory207',errors=[],writes=[];let kernel,browser,page,base,outbound=0,release;
const readConfig=()=>{const config=createConfig({dataDir,defaults:buildDefaultConfig(),log:{info(){},warn(){}}});config.load();return config.get();};
async function start(initialize=false){
  kernel=await createApplication({appRoot,headless:true,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},
    transport:{id:'inert-memory207',start(){},stop(){},status:()=>({connected:false}),actions:{getGroupName:key=>names[key]||'',getGroupMembers:()=>structuredClone(members)}},
    fetchImpl:async()=>{outbound++;throw new Error('External requests disabled');},
    priceUpdates:{refresh:async()=>({ok:true}),updateCheck:async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false})},
    communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})}});
  kernel.log.setLevel('error');kernel.loader.startWatchers=()=>{};
  if(initialize){kernel.config.update({server:{port:0,token},telemetry:{enabled:false},api:{baseUrl:'http://127.0.0.1:9/v1',model:'synthetic-memory207'},allow:{groups:['10001','10002'],private:['30001']},memberNotes:{20001:note,20002:'另一独立备注'}});for(const key of ['group:10001','group:10002'])kernel.store.appendIncoming(key,{senderId:'20001',senderName:'合成发言人',text:'只用于聊天标题索引'});}
  base=`http://127.0.0.1:${await kernel.start()}`;
}
async function open(targetPage=page){await targetPage.goto(base);await targetPage.locator('#nav button[data-panel=memory]').click();const frame=targetPage.frameLocator('#panel-host iframe');await frame.locator('[data-memory-chat="group:10001"]').waitFor();return frame;}
async function observe(targetPage){
  targetPage.setDefaultTimeout(10000);targetPage.on('pageerror',error=>errors.push(error.message));
  targetPage.on('request',request=>{if(request.url().startsWith(base+'/api/')&&['POST','PUT','DELETE'].includes(request.method()))writes.push({path:new URL(request.url()).pathname,method:request.method(),body:request.postDataJSON()});});
  await targetPage.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
}
const requestDone=(pathname,method='GET')=>page.waitForResponse(response=>new URL(response.url()).pathname===pathname&&response.request().method()===method).then(async response=>{await response.finished();return response;});
async function until(check,message){for(let n=0;n<300;n++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error(message||'Timed out waiting for memory view');}
try{
  await start(true);
  const playwright=createRequire(import.meta.url)('playwright-core'),cache=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'ms-playwright');
  const versions=fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9)));
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||versions.map(version=>path.join(cache,version,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));assert.ok(executablePath);
  browser=await playwright.chromium.launch({executablePath,headless:process.env.QA_HEADED!=='1'});page=await browser.newPage({viewport:{width:1360,height:900}});await observe(page);
  let frame=await open();
  const row=key=>frame.locator(`[data-memory-chat="${key}"]`),card=uid=>frame.locator(`.member-cards article[data-member="${uid}"]`);
  await row('group:10001').locator('strong').filter({hasText:groupName}).waitFor();assert.equal(await row('group:10001').locator('strong').textContent(),groupName);assert.equal(await row('group:10001').locator('img').count(),0);
  assert.match(await row('group:10001').textContent(),/3 位成员 · 4 条印象 · 更新于.*2025/);
  assert.match(await row('private:30001').textContent(),/0 位成员 · 0 条印象 · 暂无更新/);

  // Hold one real detail response: selected feedback must not wait for HTTP,
  // and its late completion must not replace the second selected chat.
  let entered;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const hold=async route=>{entered();const response=await route.fetch();await gate;await route.fulfill({response});};
  const detailUrl=base+'/api/memory-files/group_10001?scope=allowlist';await page.route(detailUrl,hold);
  await row('group:10001').locator('strong').click();let gateTimeout;try{await Promise.race([started,new Promise((_,reject)=>{gateTimeout=setTimeout(()=>reject(Error('Expected memory detail request was not intercepted')),10000);})]);}finally{clearTimeout(gateTimeout);}assert.equal(await row('group:10001').evaluate(node=>node.classList.contains('selected')),true);
  await row('group:10002').locator('strong').click();await card('20004').waitFor();assert.equal(await row('group:10002').evaluate(node=>node.classList.contains('selected')),true);assert.equal(await row('group:10001').evaluate(node=>node.classList.contains('selected')),false);
  const late=requestDone('/api/memory-files/group_10001');release();release=null;await late;await page.unroute(detailUrl,hold);
  assert.equal(await card('20001').count(),0,'late details cannot undo the current selection');
  await row('group:10001').locator('strong').click();await card('20001').waitFor();assert.equal(await frame.locator('.memory-chat-title').textContent(),groupName+' · 成员印象');
  assert.deepEqual(await frame.locator('.member-cards > article').evaluateAll(nodes=>nodes.map(node=>node.dataset.member)),['20002','20001','20003']);
  assert.deepEqual(await card('20001').locator('li').allTextContents(),['旧印象乙','旧印象甲']);
  assert.match(await card('20003').locator('summary').textContent(),/空成员仍可见.*0 条印象/);

  const summary=card('20001').locator('summary');await summary.focus();await page.keyboard.press('Enter');await until(()=>card('20001').locator('details').evaluate(node=>!node.open));
  await page.keyboard.press('Space');await until(()=>card('20001').locator('details').evaluate(node=>node.open&&!node.getAnimations().length));
  const closing=await card('20001').evaluate(async node=>{const fold=node.querySelector('details');fold.querySelector('summary').click();const animation=fold.getAnimations()[0];if(!animation)throw new Error('Expected actual member collapse animation');animation.pause();animation.currentTime=80;node.dataset.retained='true';return{native:fold.open,logical:(await import('/panels/collapsible.js')).collapsibleExpanded(fold)};});
  assert.deepEqual(closing,{native:true,logical:false});
  kernel.memory.replaceMember('group:10001',{userId:'20001',name:'持久原名甲',impressions:['刷新后印象']});
  const refreshed=requestDone('/api/memory-files/group_10001');await frame.locator('#reload').click();await refreshed;await card('20001').getByText('刷新后印象',{exact:true}).waitFor();
  assert.equal(await card('20001').getAttribute('data-retained'),'true','refresh reuses the member card');
  assert.equal(await card('20001').locator('details').evaluate(async node=>(await import('/panels/collapsible.js')).collapsibleExpanded(node)),false,'refresh preserves the closing target rather than temporary native open');
  await row('group:10002').locator('strong').click();await card('20004').waitFor();await row('group:10001').locator('strong').click();await card('20001').waitFor();
  assert.equal(await card('20001').locator('details').evaluate(node=>node.open),false,'returning within the memory panel restores the logical closed state');
  for(const label of ['编辑印象','编辑备注','重新整理','删除成员'])assert.equal(await card('20001').getByRole('button',{name:label,exact:true}).isVisible(),true,'member actions remain visible while only impressions are folded');
  await card('20001').locator('summary').click();await until(()=>card('20001').locator('details').evaluate(node=>node.open&&!node.getAnimations().length));
  await card('20001').getByRole('button',{name:'编辑印象',exact:true}).click();await frame.locator('dialog textarea[name=impressions]').fill('刷新期间保留的草稿');
  const draftRefresh=requestDone('/api/memory-files/group_10001');kernel.bus.emit('memory.update',{chatKey:'group:10001'});await draftRefresh;assert.equal(await frame.locator('dialog textarea[name=impressions]').inputValue(),'刷新期间保留的草稿');await frame.locator('dialog').getByRole('button',{name:'取消',exact:true}).click();
  const configBeforeManual=fs.readFileSync(path.join(dataDir,'config.json'),'utf8');await card('20001').getByRole('button',{name:'编辑印象',exact:true}).click();
  const manualSaved=requestDone('/api/memory-files/group_10001/members/20001','PUT');await frame.locator('dialog').getByRole('button',{name:'保存',exact:true}).click();assert.equal((await manualSaved).status(),200);assert.equal(Object.hasOwn((await manualSaved).request().postDataJSON(),'note'),false,'unchanged display notes are omitted from manual impression writes');await frame.locator('dialog').waitFor({state:'detached'});assert.equal(fs.readFileSync(path.join(dataDir,'config.json'),'utf8'),configBeforeManual);

  await frame.getByRole('button',{name:'成员列表',exact:true}).click();const memberDialog=frame.locator('dialog.group-members-dialog'),filter=memberDialog.getByRole('searchbox',{name:'搜索群成员'}),member=()=>memberDialog.locator('[data-group-member="20001"]');
  await member().waitFor();assert.equal(await member().locator('strong').textContent(),note);assert.equal(await member().locator('b').count(),0);assert.deepEqual(await member().locator('dd').allTextContents(),['20001','Alpha原昵称','独立群名片','额外原名',note]);
  for(const query of ['ALPHA','独立群名片','额外原名','20001','独立备注 <b>']){await filter.fill(query);assert.equal(await memberDialog.locator('[data-group-member]').count(),1);await member().waitFor();}
  await filter.fill('绝不会匹配');await memberDialog.getByText('没有匹配的群成员',{exact:true}).waitFor();await filter.fill('');
  await member().getByRole('button',{name:'编辑备注',exact:true}).click();const noteDialog=frame.locator('dialog:not(.group-members-dialog)');await noteDialog.locator('input[name=note]').fill('更新后的独立备注');
  const saved=requestDone('/api/member-notes/20001','PUT');await noteDialog.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await saved).status(),200);assert.deepEqual((await saved).request().postDataJSON(),{note:'更新后的独立备注',expected:note});await noteDialog.waitFor({state:'detached'});
  assert.equal(await member().locator('strong').textContent(),'更新后的独立备注');assert.deepEqual(await member().locator('dd').allTextContents(),['20001','Alpha原昵称','独立群名片','额外原名','更新后的独立备注']);
  await filter.fill('更新后的独立备注');assert.equal(await memberDialog.locator('[data-group-member]').count(),1);await filter.fill('独立备注 <b>');assert.equal(await memberDialog.locator('[data-group-member]').count(),0);
  assert.equal(readConfig().memberNotes['20001'],'更新后的独立备注');assert.equal(readConfig().memberNotes['20002'],'另一独立备注');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir,'memory','group_10001','20001.json'),'utf8')).name,'持久原名甲','note display writes never replace the original memory name');
  await filter.fill('');await page.setViewportSize({width:760,height:850});assert.equal(await memberDialog.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await memberDialog.getByRole('button',{name:'关闭',exact:true}).click();await page.setViewportSize({width:1360,height:900});

  // Two independent host windows read the same initial value. A stale writer
  // receives the actual 409 through opaque-frame RPC and retains its draft.
  const otherPage=await browser.newPage({viewport:{width:1360,height:900}});await observe(otherPage);const otherFrame=await open(otherPage),otherCard=uid=>otherFrame.locator(`.member-cards article[data-member="${uid}"]`);
  await otherFrame.locator('[data-memory-chat="group:10001"] strong').click();await otherCard('20001').waitFor();
  await card('20001').getByRole('button',{name:'编辑备注',exact:true}).click();await otherCard('20001').getByRole('button',{name:'编辑备注',exact:true}).click();
  assert.equal(await frame.locator('dialog input[name=note]').inputValue(),'更新后的独立备注');assert.equal(await otherFrame.locator('dialog input[name=note]').inputValue(),'更新后的独立备注');
  await frame.locator('dialog input[name=note]').fill('同UID第一窗口新备注');await otherFrame.locator('dialog input[name=note]').fill('同UID第二窗口未保存草稿');
  const firstSave=requestDone('/api/member-notes/20001','PUT');await frame.locator('dialog').getByRole('button',{name:'保存',exact:true}).click();assert.equal((await firstSave).status(),200);await frame.locator('dialog').waitFor({state:'detached'});
  const conflict=otherPage.waitForResponse(response=>new URL(response.url()).pathname==='/api/member-notes/20001'&&response.request().method()==='PUT');await otherFrame.locator('dialog').getByRole('button',{name:'保存',exact:true}).click();assert.equal((await conflict).status(),409);assert.equal((await conflict).request().postDataJSON().expected,'更新后的独立备注','expected remains the value read when the editor opened');
  await otherFrame.locator('dialog .error').filter({hasText:'输入已保留'}).waitFor();assert.equal(await otherFrame.locator('dialog input[name=note]').inputValue(),'同UID第二窗口未保存草稿');assert.equal(readConfig().memberNotes['20001'],'同UID第一窗口新备注');await otherFrame.locator('dialog').getByRole('button',{name:'取消',exact:true}).click();

  // Both requests are held until both editors have submitted. The real backend
  // then commits disjoint UIDs without a client-supplied replacement map.
  await card('20001').getByRole('button',{name:'编辑备注',exact:true}).click();await otherCard('20002').getByRole('button',{name:'编辑备注',exact:true}).click();
  await frame.locator('dialog input[name=note]').fill('异UID甲保留备注');await otherFrame.locator('dialog input[name=note]').fill('异UID乙保留备注');
  let arrived=0;const bothWrites=new Promise(resolve=>{release=resolve;});const holdWrites=async route=>{if(route.request().method()!=='PUT')return route.continue();arrived++;await bothWrites;return route.continue();};
  await page.route(base+'/api/member-notes/20001',holdWrites);await otherPage.route(base+'/api/member-notes/20002',holdWrites);
  const putA=requestDone('/api/member-notes/20001','PUT'),putB=otherPage.waitForResponse(response=>new URL(response.url()).pathname==='/api/member-notes/20002'&&response.request().method()==='PUT');
  await Promise.all([frame.locator('dialog').getByRole('button',{name:'保存',exact:true}).click(),otherFrame.locator('dialog').getByRole('button',{name:'保存',exact:true}).click()]);await until(()=>arrived===2,'both disjoint note writes must reach the request barrier');release();release=null;
  assert.equal((await putA).status(),200);assert.equal((await putB).status(),200);assert.equal((await putA).request().postDataJSON().expected,'同UID第一窗口新备注');assert.equal((await putB).request().postDataJSON().expected,'另一独立备注');
  await frame.locator('dialog').waitFor({state:'detached'});await otherFrame.locator('dialog').waitFor({state:'detached'});await page.unroute(base+'/api/member-notes/20001',holdWrites);await otherPage.unroute(base+'/api/member-notes/20002',holdWrites);await otherPage.close();
  assert.equal(readConfig().memberNotes['20001'],'异UID甲保留备注');assert.equal(readConfig().memberNotes['20002'],'异UID乙保留备注');

  await frame.getByRole('button',{name:'成员列表',exact:true}).click();await member().getByRole('button',{name:'编辑备注',exact:true}).click();await noteDialog.locator('input[name=note]').fill('');
  const cleared=requestDone('/api/member-notes/20001','PUT');await noteDialog.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await cleared).status(),200);assert.deepEqual((await cleared).request().postDataJSON(),{note:'',expected:'异UID甲保留备注'});await noteDialog.waitFor({state:'detached'});
  assert.equal(Object.hasOwn(readConfig().memberNotes,'20001'),false,'empty note deletes the key on disk');assert.equal(readConfig().memberNotes['20002'],'异UID乙保留备注');assert.equal(await member().locator('strong').textContent(),'独立群名片');assert.deepEqual(await member().locator('dd').allTextContents(),['20001','Alpha原昵称','独立群名片','额外原名','—']);
  await filter.fill('异UID甲保留备注');assert.equal(await memberDialog.locator('[data-group-member]').count(),0);await filter.fill('');await member().getByRole('button',{name:'编辑备注',exact:true}).click();assert.equal(await noteDialog.locator('input[name=note]').inputValue(),'','reopened editor rereads the actual GET note route');
  await noteDialog.locator('input[name=note]').fill('更新后的独立备注');const restored=requestDone('/api/member-notes/20001','PUT');await noteDialog.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await restored).status(),200);await noteDialog.waitFor({state:'detached'});assert.equal(await member().locator('strong').textContent(),'更新后的独立备注');await memberDialog.getByRole('button',{name:'关闭',exact:true}).click();

  // The new-member create flow snapshots existing notes when it opens, even
  // though the user enters the target UID afterwards. A conflicting note must
  // stop before consolidation and preserve all form input.
  await frame.getByRole('button',{name:'新增成员',exact:true}).click();const createDialog=frame.locator('dialog');await createDialog.locator('input[name=userId]').fill('20001');await createDialog.locator('select[name=mode]').selectOption('create');await createDialog.locator('input[name=note]').fill('提炼前冲突备注草稿');await createDialog.locator('textarea[name=impressions]').fill('提炼前保留的印象草稿');
  const remote=await fetch(base+'/api/member-notes/20001',{method:'PUT',headers:{'x-console-token':token,'content-type':'application/json'},body:JSON.stringify({note:'创建窗口打开后的服务器新备注',expected:'更新后的独立备注'})});assert.equal(remote.status,200);
  const beforeConsolidate=writes.filter(write=>write.path==='/api/memory-files/consolidate').length,createConflict=requestDone('/api/member-notes/20001','PUT');await createDialog.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await createConflict).status(),409);assert.equal((await createConflict).request().postDataJSON().expected,'更新后的独立备注');await createDialog.locator('.error').filter({hasText:'输入已保留'}).waitFor();assert.equal(await createDialog.locator('input[name=note]').inputValue(),'提炼前冲突备注草稿');assert.equal(await createDialog.locator('textarea[name=impressions]').inputValue(),'提炼前保留的印象草稿');assert.equal(writes.filter(write=>write.path==='/api/memory-files/consolidate').length,beforeConsolidate);assert.equal(readConfig().memberNotes['20001'],'创建窗口打开后的服务器新备注');await createDialog.getByRole('button',{name:'取消',exact:true}).click();
  await card('20001').getByRole('button',{name:'编辑备注',exact:true}).click();await noteDialog.locator('input[name=note]').fill('更新后的独立备注');const finalRestore=requestDone('/api/member-notes/20001','PUT');await noteDialog.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await finalRestore).status(),200);await noteDialog.waitFor({state:'detached'});

  // Inject a real HTTP task-submission failure after the actual note PUT has
  // committed. Retrying the preserved form must not conflict with its own note
  // or write that note again. The accepted retry is a transport-only task mock.
  const submissions=new Map();
  const submitFailure=route=>{
    const uid=route.request().postDataJSON().userIds[0],count=(submissions.get(uid)||0)+1;submissions.set(uid,count);
    return route.fulfill({status:uid==='20005'&&count===2?202:503,contentType:'application/json',body:JSON.stringify(uid==='20005'&&count===2?{ok:true,started:true}:{error:'synthetic consolidation submission unavailable'})});
  };
  await page.route(base+'/api/memory-files/consolidate',submitFailure);
  const noteWrites=uid=>writes.filter(write=>write.method==='PUT'&&write.path===`/api/member-notes/${uid}`);
  await frame.getByRole('button',{name:'新增成员',exact:true}).click();await createDialog.locator('input[name=userId]').fill('20005');await createDialog.locator('select[name=mode]').selectOption('create');await createDialog.locator('input[name=note]').fill('自身已确认的提炼备注');await createDialog.locator('textarea[name=impressions]').fill('503期间保留的印象草稿');
  const beforeRetryWrites=noteWrites('20005').length,firstSubmit=requestDone('/api/memory-files/consolidate','POST');await createDialog.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await firstSubmit).status(),503);await createDialog.locator('.error').filter({hasText:'synthetic consolidation submission unavailable'}).waitFor();assert.equal(await createDialog.locator('input[name=note]').inputValue(),'自身已确认的提炼备注');assert.equal(await createDialog.locator('textarea[name=impressions]').inputValue(),'503期间保留的印象草稿');assert.equal(readConfig().memberNotes['20005'],'自身已确认的提炼备注');assert.equal(noteWrites('20005').length,beforeRetryWrites+1);
  const retrySubmit=requestDone('/api/memory-files/consolidate','POST'),retryNoteRead=requestDone('/api/member-notes/20005');await createDialog.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await retryNoteRead).status(),200);assert.equal((await retrySubmit).status(),202);await createDialog.waitFor({state:'detached'});assert.equal(noteWrites('20005').length,beforeRetryWrites+1,'retrying task submission does not repeat the accepted note PUT');assert.equal(submissions.get('20005'),2);

  // A later remote edit is still a conflict. An unchanged retry compares with
  // the receipt without adopting the remote value; a changed draft then sends
  // that same receipt baseline and receives a genuine backend 409.
  await frame.getByRole('button',{name:'新增成员',exact:true}).click();await createDialog.locator('input[name=userId]').fill('20006');await createDialog.locator('select[name=mode]').selectOption('create');await createDialog.locator('input[name=note]').fill('第二个自身确认备注');await createDialog.locator('textarea[name=impressions]').fill('他人更新期间保留草稿');
  const anotherSubmit=requestDone('/api/memory-files/consolidate','POST');await createDialog.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await anotherSubmit).status(),503);await createDialog.locator('.error').filter({hasText:'synthetic consolidation submission unavailable'}).waitFor();
  const remoteAfterReceipt=await fetch(base+'/api/member-notes/20006',{method:'PUT',headers:{'x-console-token':token,'content-type':'application/json'},body:JSON.stringify({note:'成功回执后他人更新',expected:'第二个自身确认备注'})});assert.equal(remoteAfterReceipt.status,200);
  const confirmedWriteCount=noteWrites('20006').length,confirmedRead=requestDone('/api/member-notes/20006');await createDialog.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await confirmedRead).status(),200);await createDialog.locator('.error').filter({hasText:'输入已保留'}).waitFor();assert.equal(submissions.get('20006'),1,'a changed remote note stops the retry before task submission');assert.equal(noteWrites('20006').length,confirmedWriteCount);assert.equal(await createDialog.locator('input[name=note]').inputValue(),'第二个自身确认备注');
  await createDialog.locator('input[name=note]').fill('冲突后仍保留的新备注草稿');const laterConflict=requestDone('/api/member-notes/20006','PUT');await createDialog.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await laterConflict).status(),409);assert.equal((await laterConflict).request().postDataJSON().expected,'第二个自身确认备注','a validation GET never replaces the successful-receipt baseline');await createDialog.locator('.error').filter({hasText:'输入已保留'}).waitFor();assert.equal(await createDialog.locator('input[name=note]').inputValue(),'冲突后仍保留的新备注草稿');assert.equal(await createDialog.locator('textarea[name=impressions]').inputValue(),'他人更新期间保留草稿');assert.equal(readConfig().memberNotes['20006'],'成功回执后他人更新');assert.equal(submissions.get('20006'),1);await createDialog.getByRole('button',{name:'取消',exact:true}).click();await page.unroute(base+'/api/memory-files/consolidate',submitFailure);

  const failNames=route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'synthetic name lookup failure'})});
  const namesUrl=base+'/api/chats?scope=allowlist';await page.route(namesUrl,failNames);const failedNames=requestDone('/api/chats');await frame.locator('#reload').click();await failedNames;assert.equal(await row('group:10001').locator('strong').textContent(),groupName,'optional name failure retains the last successful title');
  frame=await open();await row('group:10001').waitFor();assert.equal(await row('group:10001').locator('strong').textContent(),'group:10001','first name lookup failure still leaves the memory list usable');await page.unroute(namesUrl,failNames);
  assert.deepEqual(errors,[]);assert.equal(outbound,0);assert.equal(writes.filter(write=>write.method==='POST'&&['/api/config','/api/config/lifecycle'].includes(write.path)).length,0,'note-only editors never replace the full config map');assert.ok(writes.filter(write=>write.path.startsWith('/api/member-notes/')).every(write=>typeof write.body?.expected==='string'&&!Object.hasOwn(write.body,'__replace__')));

  // Exercise an actual trusted single-file append through the production asset
  // resolver. Other memory assets and console routes stay on their defaults.
  await kernel.stop();kernel=null;const layer=path.join(appRoot,'overrides','10-memory-view');fs.mkdirSync(layer,{recursive:true});
  fs.writeFileSync(path.join(layer,'memory.js'),fs.readFileSync(new URL('../ui/panels/memory/panel.js',import.meta.url),'utf8')+"\ndocument.querySelector('h2').textContent='追加记忆页面';\n");
  fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify({version:1,id:'qa-memory-view207',ui:{assets:{'panels/memory/panel.js':'./memory.js'}}}));
  await start();frame=await open();await frame.getByRole('heading',{name:'追加记忆页面',exact:true}).waitFor();await row('group:10001').locator('strong').click();await card('20001').waitFor();assert.equal(await card('20001').locator('h3').textContent(),'更新后的独立备注');assert.equal(await frame.locator('.member-cards details[data-collapsible]').count(),3);
  assert.equal(outbound,0);assert.deepEqual(errors,[]);
  console.log('✓ 207 real memory UI: titles/plain text/fallback, immediate selection and late requests, ordered retained cards, keyboard/logical folds, drafts, searchable independent identities, per-UID writes/conflicts/disjoint concurrency/clearing/create guards/503 retry receipts, narrow layout and actual single-file append');
}finally{
  release?.();await browser?.close();await kernel?.stop();assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('qqa-memory-view207-'));fs.rmSync(root,{recursive:true,force:true});
}

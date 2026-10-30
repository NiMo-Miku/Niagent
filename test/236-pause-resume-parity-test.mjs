import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{createChatStore}from'../src/kernel/store.js';import{ownedBrowser,fixture,deferred}from'./pause-navigation-fixture.mjs';
function fault(operation,file,work){const native=fs[operation];let hits=0;fs[operation]=(...args)=>{if(operation==='renameSync'?String(args[1])===file:String(args[0])===`${file}.${process.pid}.tmp`){hits++;throw Object.assign(Error('synthetic owned disk failure'),{code:'EIO'});}return native(...args);};return Promise.resolve().then(work).finally(()=>{fs[operation]=native;assert.ok(hits>0,'fault reaches actual selected disk write');});}
// Both actual synchronous fault boundaries preserve disk and exact old flags,
// including legacy missing/undefined read properties. No rollback disk write.
for(const operation of['writeFileSync','renameSync']){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-236-store-'));try{
    const store=createChatStore({dataDir:dir,log:{}}),file=path.join(dir,'messages','group_1.json');
    const entries=[store.appendIncoming('group:1',{text:'false'}),store.appendIncoming('group:1',{text:'undefined'}),store.appendIncoming('group:1',{text:'missing'})];entries[1].read=undefined;delete entries[2].read;
    const archive=JSON.parse(fs.readFileSync(file,'utf8'));delete archive.messages[1].read;delete archive.messages[2].read;fs.writeFileSync(file,JSON.stringify(archive));
    for(const [name,target]of[['readdirSync',path.join(dir,'messages')],['readFileSync',file]]){
      const native=fs[name];fs[name]=(...args)=>{if(String(args[0])===target)throw Error('synthetic unreadable archive');return native(...args);};
      try{const reader=name==='readFileSync'?createChatStore({dataDir:dir,log:{}}):store;assert.throws(()=>reader.captureReadBoundary(),/synthetic unreadable archive/);}finally{fs[name]=native;}
    }
    const before=fs.readFileSync(file),flags=entries.map(entry=>({owned:Object.hasOwn(entry,'read'),read:entry.read})),[scope]=store.captureReadBoundary();
    await fault(operation,file,()=>assert.throws(()=>store.markAllRead('group:1',{...scope,strict:true}),/synthetic owned disk failure/));
    assert.deepEqual(entries.map(entry=>({owned:Object.hasOwn(entry,'read'),read:entry.read})),flags);assert.deepEqual(fs.readFileSync(file),before);assert.equal(fs.existsSync(`${file}.${process.pid}.tmp`),false);
    assert.equal(createChatStore({dataDir:dir,log:{}}).unread('group:1').length,3,'real rebuilt store retains failed unread flags');
    store.appendIncoming('group:1',{text:'after boundary'});assert.equal(store.markAllRead('group:1',{...scope,strict:true}),3);assert.deepEqual(store.unread('group:1').map(entry=>entry.text),['after boundary']);
    store.clearChat('group:1');store.appendIncoming('group:1',{text:'reused local id'});assert.equal(store.isReadBoundaryCurrent(scope),false);assert.throws(()=>store.markAllRead('group:1',{...scope,strict:true}),{code:'READ_BOUNDARY_STALE'});assert.equal(store.unread('group:1')[0].id,1);
    const [current]=store.captureReadBoundary(),rebuilt=createChatStore({dataDir:dir,log:{}});rebuilt.recent('group:1');assert.equal(rebuilt.isReadBoundaryCurrent(current),false,'recreated store cannot adopt old runtime tickets');
    const legacy=store.appendIncoming('group:1',{text:'legacy missing id'});delete legacy.id;assert.throws(()=>store.captureReadBoundary(),/无法确认/,'strict bounded action never silently skips malformed local ids');assert.equal(store.markAllRead('group:1'),2,'old unbounded default still marks entries without a local id');assert.equal(legacy.read,true);
  }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
}
if(process.argv.includes('--store-only')){console.log('✓236 strict store write/rename failures, exact flag rollback, bounded retry, incarnation and legacy default compatibility');process.exit(0);}
const source=fs.readFileSync(new URL('../ui/shell/pause-controls.js',import.meta.url),'utf8');
const replacement=source.replace("skip.textContent='恢复并全部标为已读'","skip.textContent='追加策略：恢复并全部标为已读'");assert.notEqual(source,replacement);
const browser=await ownedBrowser();let checks=0;
try{for(const mode of['default','appended','disabled']){const runs=[],f=await fixture(browser,'236',{mode,asset:'shell/pause-controls.js',replacement,agentRunner:async({session,userPrompt})=>{runs.push({chatKey:session.chatKey,userPrompt});return{sent:[],rounds:1,usage:{},finishReason:'stop'};}});try{
  const resume=f.kernel.orchestrator.resume,observed=[];f.kernel.orchestrator.resume=options=>{observed.push({options,unread:f.kernel.store.listChats().reduce((sum,chat)=>sum+f.kernel.store.unread(chat.chatKey).length,0)});return resume(options);};
  await f.goto();const pause=f.page.locator('#pause-btn'),skip=f.page.locator('#resume-read-btn');await skip.waitFor({state:'attached'});assert.equal(await skip.isVisible(),false);
  await pause.click();await f.page.waitForFunction(()=>document.querySelector('#pause-btn').getAttribute('aria-pressed')==='true');
  assert.equal(await skip.textContent(),mode==='appended'?'追加策略：恢复并全部标为已读':'恢复并全部标为已读');
  await f.receive('group:101',1,'旧积压甲');await f.receive('private:202',2,'旧积压乙');await f.page.waitForFunction(()=>document.querySelector('#resume-read-btn')?.disabled===false);
  assert.equal(f.kernel.store.unread('group:101').length,1);assert.equal(f.kernel.store.unread('private:202').length,1);
  // Normal resume is the original primary action and does not mark messages.
  await pause.click();await f.page.waitForFunction(()=>document.querySelector('#pause-btn').getAttribute('aria-pressed')==='false');assert.equal(f.kernel.store.unread('group:101').length,1);assert.equal(f.kernel.store.unread('private:202').length,1);assert.equal(observed.at(-1).unread,2);assert.equal(observed.at(-1).options.skipBacklog,false);
  await pause.click();await f.page.waitForFunction(()=>document.querySelector('#pause-btn').getAttribute('aria-pressed')==='true');
  // Hold only delivery of the genuine completed DELETE response. A new incoming
  // message after that server-side boundary must never join the old marked set.
  const entered=deferred(),release=deferred();let receipt;await f.page.route('**/api/pause',async route=>{if(route.request().method()!=='DELETE')return route.continue();const response=await route.fetch();receipt=await response.json();entered.resolve();await release.promise;await route.fulfill({response});});
  const counts=f.kernel.sessions.listSummaries().length;await skip.click();await entered.promise;assert.equal(await skip.isDisabled(),true);assert.equal(await pause.isDisabled(),true);assert.deepEqual(receipt.marked,{'group:101':1,'private:202':1});assert.equal(receipt.paused,false);assert.equal(f.kernel.store.unread('group:101').length,0);assert.deepEqual(observed.at(-1),{options:{skipBacklog:true},unread:0},'all old unread is marked before resuming any timer/wake path');
  await f.receive('group:101',3,'边界后的新消息');assert.equal(f.kernel.store.unread('group:101').length,1);assert.equal(f.kernel.sessions.listSummaries().length,counts,'skipped backlog does not create a run');release.resolve();
  await f.page.locator('.toast.good').filter({hasText:'2 条已有消息'}).waitFor();assert.equal(f.kernel.store.unread('group:101')[0].text,'边界后的新消息');
  const disk=JSON.parse(fs.readFileSync(path.join(f.dataDir,'messages','group_101.json'),'utf8'));const persisted=disk.messages??disk;assert.equal(persisted.find(item=>item.text==='旧积压甲').read,true);assert.equal(persisted.find(item=>item.text==='边界后的新消息').read,false);
  // The explicit POST contract has the same actual mark-before-resume receipt.
  await f.api('POST','/api/pause',{paused:true});const post=await f.api('POST','/api/pause',{paused:false,skipBacklog:true});assert.deepEqual(post.marked,{'group:101':1});assert.equal(f.kernel.store.unread('group:101').length,0);
  await f.api('POST','/api/pause',{paused:true});await f.page.waitForFunction(()=>document.querySelector('#pause-btn').getAttribute('aria-pressed')==='true');
  await f.page.unroute('**/api/pause');await f.page.route('**/api/pause',route=>route.request().method()==='DELETE'?route.fulfill({status:503,contentType:'application/json',body:'{"error":"synthetic mark-read failure"}'}):route.continue());
  await f.receive('private:202',4,'失败仍未读');await skip.click();await f.page.locator('.toast.error').filter({hasText:'synthetic mark-read failure'}).waitFor();assert.equal(f.kernel.orchestrator.status().paused,true);assert.equal(f.kernel.store.unread('private:202').length,1);assert.equal(await skip.isVisible(),true);checks++;
  assert.equal(await skip.isDisabled(),true,'unknown write outcome requires an explicit new intent');await f.page.unroute('**/api/pause');await f.page.locator('#resume-read-cancel-btn').click();
  let mid=10;
  for(const operation of['writeFileSync','renameSync']){
    await f.api('POST','/api/pause',{paused:true});await f.receive('group:101',mid++,'successful scope '+operation);
    const privateFile=path.join(f.dataDir,'messages','private_202.json'),groupFile=path.join(f.dataDir,'messages','group_101.json'),before=fs.readFileSync(privateFile),oldPrivate=f.kernel.store.unread('private:202').map(entry=>entry.id);
    const response=f.page.waitForResponse(response=>new URL(response.url()).pathname==='/api/pause'&&response.request().method()==='DELETE');
    await fault(operation,privateFile,async()=>{await skip.click();const actual=await response;assert.equal(actual.status(),207);const partial=await actual.json();assert.equal(partial.ok,false);assert.equal(partial.paused,true);assert.deepEqual(partial.marked,{'group:101':1});assert.equal(partial.remaining.length,1);assert.equal(partial.remaining[0].chatKey,'private:202');});
    await skip.filter({hasText:'重试未保存的标读'}).waitFor();await f.page.locator('.toast.error').filter({hasText:'部分标读未保存'}).last().waitFor();
    assert.equal(f.kernel.orchestrator.status().paused,true);assert.deepEqual(fs.readFileSync(privateFile),before);assert.deepEqual(f.kernel.store.unread('private:202').map(entry=>entry.id),oldPrivate);assert.equal(f.kernel.store.unread('group:101').length,0);assert.equal(fs.existsSync(`${privateFile}.${process.pid}.tmp`),false);
    await f.receive('private:202',mid++,'new after partial '+operation);
    const writes=[],nativeWrite=fs.writeFileSync;fs.writeFileSync=(file,...args)=>{if(String(file).endsWith(`.${process.pid}.tmp`))writes.push(String(file));return nativeWrite(file,...args);};
    try{const request=f.page.waitForRequest(request=>new URL(request.url()).pathname==='/api/pause'&&request.method()==='DELETE');const done=f.page.waitForResponse(response=>new URL(response.url()).pathname==='/api/pause'&&response.request().method()==='DELETE');await skip.click();assert.equal((await request).postDataJSON().remaining.length,1);assert.equal((await done).status(),200);await f.page.waitForFunction(()=>document.querySelector('#pause-btn').getAttribute('aria-pressed')==='false');}
    finally{fs.writeFileSync=nativeWrite;}
    assert.equal(writes.includes(`${groupFile}.${process.pid}.tmp`),false,'successful scope is never rewritten by retry');assert.equal(writes.filter(file=>file===`${privateFile}.${process.pid}.tmp`).length,1);assert.deepEqual(f.kernel.store.unread('private:202').map(entry=>entry.text),['new after partial '+operation]);assert.equal(createChatStore({dataDir:f.dataDir,log:{}}).unread('private:202').length,1,'real disk rebuild preserves only the later message');
  }
  // Every retry scope is validated before the first write, including when a
  // cleared/recreated chat reuses exactly the old local id.
  await f.api('POST','/api/pause',{paused:true});await f.receive('group:101',mid++,'scope before invalidation');const stale=f.kernel.store.captureReadBoundary();f.kernel.store.clearChat('private:202');await f.receive('private:202',mid++,'new incarnation id one');
  const groupBefore=fs.readFileSync(path.join(f.dataDir,'messages','group_101.json')),resumeCount=observed.length;
  const raw=async body=>{const response=await fetch(f.base+'/api/pause',{method:'DELETE',headers:{'content-type':'application/json','x-console-token':'synthetic-236'},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};};
  const invalid=await raw({remaining:stale});assert.equal(invalid.status,409);assert.equal(invalid.body.code,'READ_BOUNDARY_STALE');assert.deepEqual(fs.readFileSync(path.join(f.dataDir,'messages','group_101.json')),groupBefore);assert.equal(observed.length,resumeCount);assert.equal(f.kernel.store.unread('private:202')[0].id,1);assert.equal(f.kernel.orchestrator.status().paused,true);
  for(const remaining of[null,[stale[0],stale[0]],[{...stale[0],unexpected:'not accepted'}]])assert.equal((await raw({remaining})).status,400);
  const capture=f.kernel.store.captureReadBoundary;f.kernel.store.captureReadBoundary=undefined;
  try{assert.equal((await raw({})).status,503,'selected custom store without the host boundary contract cannot claim a successful mark');}finally{f.kernel.store.captureReadBoundary=capture;}
  const readdir=fs.readdirSync;fs.readdirSync=(dir,...args)=>{if(String(dir)===path.join(f.dataDir,'messages'))throw Error('synthetic unreadable message directory');return readdir(dir,...args);};
  try{assert.equal((await raw({})).status,503,'unreadable directory is not an empty successful backlog');}finally{fs.readdirSync=readdir;}
  assert.equal(f.kernel.orchestrator.status().paused,true);assert.equal(observed.length,resumeCount);
  assert.deepEqual(fs.readFileSync(path.join(f.dataDir,'messages','group_101.json')),groupBefore);
  // Actual automatic wake is positively controlled using a selected inert
  // runner: normal resume consumes old unread; skip creates no backlog run;
  // a genuinely new message after skip still creates and completes a run.
  f.kernel.config.update({api:{model:'synthetic-inert'},wakeDelayMs:200,memory:{enabled:false}});
  const runCompleted=async predicate=>{for(let index=0;index<400&&!predicate();index++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(predicate(),true,'actual selected runner completed');};
  await f.api('POST','/api/pause',{paused:false});await runCompleted(()=>runs.some(run=>run.chatKey==='private:202')&&f.kernel.sessions.running().length===0);assert.equal(f.kernel.store.unread('private:202').length,0);
  await f.api('POST','/api/pause',{paused:true});await f.receive('private:202',mid++,'skip old actual runner');const sessionsBefore=f.kernel.sessions.listSummaries().length,runsBefore=runs.length;const skipped=await f.api('DELETE','/api/pause');assert.equal(skipped.ok,true);assert.deepEqual(f.kernel.orchestrator.status().waiting,[]);assert.equal(f.kernel.sessions.listSummaries().length,sessionsBefore);assert.equal(runs.length,runsBefore);
  await f.receive('private:202',mid++,'new reaches actual runner');await runCompleted(()=>runs.length>runsBefore&&f.kernel.sessions.running().length===0);assert.ok(runs.at(-1).userPrompt.includes('new reaches actual runner'));assert.equal(f.kernel.store.unread('private:202').length,0);
  if(mode==='default'){
    await f.api('POST','/api/pause',{paused:true});await f.receive('private:202',mid++,'retry before real kernel restart');const beforeRestart=f.kernel.store.captureReadBoundary(),oldStore=f.kernel.store;await f.restart();assert.notEqual(f.kernel.store,oldStore);const restarted=await raw({remaining:beforeRestart});assert.equal(restarted.status,409);assert.equal(restarted.body.code,'READ_BOUNDARY_STALE');assert.equal(f.kernel.store.unread('private:202').length,1,'old ticket cannot mark a persisted message after real stop/recreate');
  }
}finally{await f.close();}}}finally{await browser.close();}
console.log(`✓236 ${checks} actual default/append/disabled UI modes + 2 strict store faults: receipts, partial bounded retry, later unread, actual runner positive/negative controls, write/rename persistence, clear/restart invalidation`);

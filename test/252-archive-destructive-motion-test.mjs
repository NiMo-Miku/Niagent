// Sample the real archive panel rather than only the shared effect demo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {modelUiFixture} from './model-ui-fixture.mjs';
const evidence=process.env.QA252_EVIDENCE;
if(evidence)fs.mkdirSync(evidence,{recursive:true});
const wait=async condition=>{for(let i=0;i<400;i++){if(await condition())return;await new Promise(r=>setTimeout(r,20));}throw Error('archive animation did not settle');};
const diagnosis=process.env.QA252_DIAGNOSE==='1';
const original=fs.readFileSync(new URL('../ui/panels/destructive-layout.js',import.meta.url),'utf8');
const f=await modelUiFixture({config:{ui:{refreshMs:60000},proactive:{enabled:false},allow:{groups:['25201']}},...(diagnosis?{uiAssetPath:'panels/destructive-layout.js',uiAsset:original.replace('function cancel(){cleanup();}',"function cancel(event){(window.__qa252Cancels??=[]).push({event:event?.type||'explicit',target:event?.target?.className,time:performance.now()});cleanup();}")}: {})});
const key='group:25201',routeKey='group_25201';
const capture=(host,{ids,previousId,nextId,duration=1400})=>host.evaluate((node,{ids,previousId,nextId,duration})=>new Promise(resolve=>{
  const doc=node.ownerDocument,start=performance.now(),out=[];
  function tick(time){
    const next=node.querySelector(`[data-message="${nextId}"]`),previous=node.querySelector(`[data-message="${previousId}"]`),ghost=doc.querySelector('.danger-removal-ghost'),shards=[...doc.querySelectorAll('.danger-removal-ghost .danger-motion-shard')].filter(s=>Number(getComputedStyle(s).opacity)>.02);
    out.push({time:time-start,selected:ids.some(id=>node.querySelector(`[data-message="${id}"]`)),nextY:next?.getBoundingClientRect().top,scroll:node.scrollTop,ghosts:doc.querySelectorAll('.danger-removal-ghost').length,ghostOpacity:ghost?Number(getComputedStyle(ghost).opacity):null,shards:shards.length,shardTransforms:shards.map(s=>getComputedStyle(s).transform).join('|'),nextTranslate:next?getComputedStyle(next).translate:null,previousTranslate:previous?getComputedStyle(previous).translate:null});
    if(time-start<duration)requestAnimationFrame(tick);else resolve({frames:out,cancels:window.__qa252Cancels||[]});
  }requestAnimationFrame(tick);
}),{ids,previousId,nextId,duration});
const exitFrames=samples=>{
  const removed=samples.filter(s=>!s.selected),ghosts=removed.filter(s=>s.ghosts>0);
  assert.ok(ghosts.length>=3,'deleted archive content must remain as an animated exit, not disappear immediately');
  const torn=ghosts.filter(s=>s.shards>0);assert.ok(torn.length>=3,'the actual archive exit must visibly tear content into shards');
  assert.ok(new Set(torn.map(s=>s.shardTransforms)).size>=3,'the real archive shards must keep moving across frames');
  return removed;
};
try{
  for(let i=1;i<=44;i++)f.kernel.store.appendIncoming(key,{mid:252000+i,ts:Date.now()-50000+i*1000,senderId:'25210',senderName:'示例成员',text:`QA252 存档消息 ${i}`,atMe:false});
  await f.page.locator('#nav button[data-panel=chats]').click();await f.frame.locator(`[data-chat="${routeKey}"] strong`).click();
  const host=f.frame.locator('.messages');await wait(async()=>await host.locator('.message').count()===44);
  await f.frame.getByRole('button',{name:'选择消息',exact:true}).click();
  await host.evaluate(n=>{n.scrollTop=n.scrollHeight;});
  await host.locator('[data-message="43"] input').check();
  await host.evaluate(async n=>{await Promise.allSettled(n.getAnimations({subtree:true}).map(a=>a.finished));});
  const frames=capture(host,{ids:[43],previousId:42,nextId:44});
  const remove=f.frame.getByRole('button',{name:'删除选中消息',exact:true});await remove.click();await remove.click();
  if(evidence){await wait(()=>f.frame.locator('.danger-removal-ghost .danger-motion-shard').evaluateAll(nodes=>nodes.some(n=>Number(getComputedStyle(n).opacity)>.02)));await f.page.screenshot({path:path.join(evidence,'bottom-exit.png'),fullPage:true});}
  const result=await frames;
  if(evidence)fs.writeFileSync(path.join(evidence,'bottom-delete.json'),JSON.stringify(result,null,2)+'\n');
  assert.equal(f.kernel.store.recent(key,100).some(m=>m.id===43),false,'the synthetic mutation really succeeded');
  const removed=exitFrames(result.frames);
  // At the bottom, scroll clamping holds the last row at the same viewport Y;
  // its preceding survivors must still ease into their new visible positions.
  const moving=removed.filter(s=>s.ghosts===0&&s.previousTranslate&&s.previousTranslate!=='none'&&s.previousTranslate!=='0px 0px');
  assert.ok(new Set(moving.map(s=>s.previousTranslate)).size>=3,'archive survivors must have multiple reflow frames');
  await wait(async()=>await f.frame.locator('.danger-removal-ghost').count()===0);
  console.log('✓ 252 actual bottom-of-archive deletion tears away content and animates surviving rows');

  await host.evaluate(n=>{n.scrollTop+=n.querySelector('[data-message="20"]').getBoundingClientRect().top-n.getBoundingClientRect().top-100;});
  await host.locator('[data-message="20"] input').check();await host.locator('[data-message="21"] input').check();
  await wait(async()=>await remove.isEnabled());
  const middle=capture(host,{ids:[20,21],previousId:19,nextId:22});await remove.click();await remove.click();
  if(evidence){await wait(()=>f.frame.locator('.danger-removal-ghost .danger-motion-shard').evaluateAll(nodes=>nodes.some(n=>Number(getComputedStyle(n).opacity)>.02)));await f.page.screenshot({path:path.join(evidence,'batch-exit.png'),fullPage:true});}
  const batch=await middle;if(evidence)fs.writeFileSync(path.join(evidence,'middle-batch-delete.json'),JSON.stringify(batch,null,2)+'\n');
  const batchExit=exitFrames(batch.frames);assert.ok(batchExit.some(s=>s.ghosts===2),'both selected rows keep their exit visual');
  const shifted=batchExit.filter(s=>s.ghosts===0&&s.nextTranslate&&s.nextTranslate!=='none'&&s.nextTranslate!=='0px 0px');
  assert.ok(new Set(shifted.map(s=>s.nextTranslate)).size>=3,'rows below the removed batch ease upward');
  assert.equal(f.kernel.store.recent(key,100).some(m=>[20,21].includes(m.id)),false);
  console.log('✓ 252 middle-of-archive batch removal animates two exits and eases the next row upward');

  // A real wheel remains an intentional cancellation, unlike anchor repair.
  await host.locator('[data-message="35"] input').check();await wait(async()=>await remove.isEnabled());
  let release,entered;const pending=new Promise(r=>release=r),received=new Promise(r=>entered=r),pattern=`**/api/chats/${routeKey}/delete-messages`;
  const hold=async route=>{const response=await route.fetch();entered();await pending;await route.fulfill({response});};
  await f.page.route(pattern,hold);
  try{
    await remove.click();await remove.click();await received;await f.frame.locator('.danger-removal-ghost').first().waitFor();
    const box=await host.boundingBox();await f.page.mouse.move(box.x+box.width/2,box.y+box.height/2);await f.page.mouse.wheel(0,120);
    await wait(async()=>await f.frame.locator('.danger-removal-ghost').count()===0);
  }finally{release();await f.page.unroute(pattern,hold);}
  assert.equal(f.kernel.store.recent(key,100).some(m=>m.id===35),false,'wheel cancels decoration, never rolls back or repeats the mutation');
  // Production archive windows load 500 rows, so the visible rows need not be
  // among the first 120 DOM children retained by the old snapshot loop.
  for(let i=45;i<=200;i++)f.kernel.store.appendIncoming(key,{mid:252000+i,ts:Date.now()+i*1000,senderId:'25210',senderName:'示例成员',text:`QA252 长存档消息 ${i}`,atMe:false});
  await f.frame.locator('#chat-refresh').click();await host.locator('[data-message="200"]').waitFor();await host.evaluate(n=>{n.scrollTop=n.scrollHeight;});
  await host.locator('[data-message="199"] input').check();await wait(async()=>await remove.isEnabled());
  const long=capture(host,{ids:[199],previousId:198,nextId:200});await remove.click();await remove.click();const tail=await long;
  if(evidence)fs.writeFileSync(path.join(evidence,'long-archive-delete.json'),JSON.stringify(tail,null,2)+'\n');
  const tailExit=exitFrames(tail.frames),tailMoves=tailExit.filter(s=>s.ghosts===0&&s.previousTranslate&&s.previousTranslate!=='none'&&s.previousTranslate!=='0px 0px');
  assert.ok(new Set(tailMoves.map(s=>s.previousTranslate)).size>=3,'long-archive visible rows preserve smooth layout');
  assert.equal(f.kernel.store.recent(key,500).some(m=>m.id===199),false);
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);
  console.log('✓ 252 genuine wheel input still releases pending decoration without repeating the deletion');
  console.log('✓ 252 visible messages beyond the first 120 archive rows retain exit and reflow');
  if(evidence)fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,headed:process.env.QA_HEADED==='1',at:new Date().toISOString(),realArchivePanel:true,scenarios:['bottom scroll clamp','middle batch exit','moving shards','smooth following rows','user wheel cancellation','long archive beyond first 120 rows'],externalRequests:f.outbound(),liveConsoleAccessed:false},null,2)+'\n');
}catch(error){if(evidence)await f.page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});throw error;}
finally{await f.close();}

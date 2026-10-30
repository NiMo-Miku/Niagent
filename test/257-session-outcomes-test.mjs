// Real default session UI, orchestrator, registry and runner. Inert local model
// and tool components only; no live console, real model, QQ or public service.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {createMemoryConsolidator} from '../bundled/memory-service/consolidator.js';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async fn=>{for(let i=0;i<400;i++){if(await fn())return;await pause(20);}throw Error('257 session state did not settle');};
const gate=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
const evidence=process.env.QA257_EVIDENCE;if(evidence)fs.mkdirSync(evidence,{recursive:true});
let plan=null,work=null;const requests=[],events=[];
const f=await modelUiFixture({config:{ui:{refreshMs:60000},allow:{groups:['25701','25702','25703'],private:[]},sessionRetryAttempts:0,drainDelayMs:600000,memory:{consolidateEnabled:false,discoverMaxMembers:0},proactive:{enabled:false}},components:{
  'llm.complete':async options=>{requests.push(structuredClone(options.messages));const round=plan.round++;await plan.model.promise;return{message:{role:'assistant',content:`合成思考 ${round+1}`,...(plan.send&&round===0?{tool_calls:[1,2].map(i=>({id:`send257-${i}`,type:'function',function:{name:'send_message',arguments:JSON.stringify({text:`固定消息 ${i}`})}}))}:{})},finishReason:'stop'};},
  'core.tools.bundle':()=>({tools:[{type:'function',function:{name:'send_message',description:'Synthetic receipts only',parameters:{type:'object',properties:{}}}}],excludedTools:[],invoke:async(name,args,{session})=>{const index=++plan.tools,receipt={msgId:`257-${index}`,text:args.text,at:Date.now()};session.sent.push(receipt);return index===1?{ok:true,result:{sent:[receipt]}}:{ok:false,error:'合成部分发送失败',sent:[receipt]};}}),
}});
const row=id=>f.frame.locator(`[data-session="${id}"]`),body=f.frame.locator('.session-body');
try{
  // Background metadata is present in the first event and first persisted file.
  const starts=[];const off=f.kernel.bus.on('session.start',event=>starts.push(event),{internal:true});
  const memoryGate=gate();const consolidate=createMemoryConsolidator({cfg:()=>f.kernel.config.get(),sessions:f.kernel.sessions,log:{warn(){}},callLLM:async()=>{await memoryGate.promise;return{message:{content:'{"impressions":[{"content":"合成印象"}]}'},usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}};}});
  const memoryRun=consolidate({chatKey:'group:25701',create:true,members:[],history:[{senderId:'25710',senderName:'合成成员',text:'最近喜欢散步',ts:Date.now()}],createUserIds:['25710']});
  const memory=f.kernel.sessions.listSummaries().find(s=>s.trigger==='新建群友印象');assert.ok(memory?.background);assert.equal(starts.find(s=>s.id===memory.id)?.background,true);assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'sessions',memory.id+'.json'))).background,true);
  await f.page.locator('#nav button[data-panel=sessions]').click();await f.frame.locator('#sessions-panel[data-ready=true]').waitFor();await f.frame.locator('#follow').uncheck();
  assert.equal(await row(memory.id).count(),0);memoryGate.resolve();await memoryRun;
  const completedMemory=f.kernel.sessions.get(memory.id);assert.ok(completedMemory.usage.totalTokens>0);assert.ok(f.kernel.sessions.todayUsage().totalTokens>0,'background work still contributes usage');
  await f.frame.locator('#reload').click();assert.equal(await row(memory.id).count(),0);off();events.push('memory tasks are background from create/event/persist, hidden in conversation stream and retained in usage');

  async function start(chatKey,{send=false}={}){
    plan={round:0,tools:0,model:gate(),send};f.kernel.store.appendIncoming(chatKey,{mid:Date.now(),senderId:'25710',text:'本地合成触发',atMe:true});
    const session=f.kernel.sessions.create(chatKey,{trigger:'合成中止与发送测试',waitUntil:Date.now()+60000});work=f.kernel.orchestrator.wake(chatKey,{waitingSessionId:session.id,verified:true});
    await wait(()=>session.activeStep?.kind==='generation');await row(session.id).locator('strong').click();await body.locator('.flow-think.flow-pending').waitFor();return session;
  }
  const aborted=await start('group:25701');await row(aborted.id).getByRole('button',{name:'中止',exact:true}).click();
  await row(aborted.id).locator('.session-state-label').filter({hasText:'已中止'}).waitFor();await body.locator('.flow-finish').filter({hasText:'用户中止'}).waitFor();
  assert.equal(aborted.status,'aborted');assert.equal(aborted.error,null);assert.equal(aborted.finishReason,'用户中止');assert.equal(await row(aborted.id).locator('.error').count(),0);assert.equal(await body.locator('[data-key="error"]').count(),0);
  plan.model.resolve();await work;work=null;assert.equal(aborted.status,'aborted');assert.equal(aborted.finishReason,'用户中止');
  if(evidence)await f.page.screenshot({path:path.join(evidence,'aborted.png'),fullPage:true});events.push('actual abort button preserves aborted state and displays the reason inside the same trace, including late model completion');

  // Hold the abort request after a real click; let the run finish first.
  const race=await start('group:25702'),entered=gate(),release=gate();
  const pattern=`**/api/sessions/${race.id}/abort`;await f.page.route(pattern,async route=>{entered.resolve();await release.promise;await route.continue();});
  try{await row(race.id).getByRole('button',{name:'中止',exact:true}).click();await entered.promise;plan.model.resolve();await work;work=null;assert.equal(race.status,'noreply');release.resolve();await f.frame.locator('#reload').click();await wait(async()=>await row(race.id).getByRole('button',{name:'中止',exact:true}).count()===0);
    const result=await f.request('POST',`/api/sessions/${race.id}/abort`);assert.equal(result.status,200);assert.equal(result.data.alreadyFinished,true);assert.equal(race.status,'noreply');assert.equal(await f.frame.locator('#list .error').count(),0);assert.equal(await f.frame.locator('#detail > .error').count(),0);
  }finally{release.resolve();await f.page.unroute(pattern);}
  events.push('completion/abort race is idempotent, truthful and never appends a list-level error');

  // No unread batch, a rejected mechanical batch, and an empty retry batch all
  // discard the unused wait, rather than persisting status=discarded.
  for(const mode of ['empty','rejected','retry']){
    const key='group:25703';f.kernel.store.markAllRead(key);if(mode!=='empty')f.kernel.store.appendIncoming(key,{mid:Date.now(),senderId:'25711',text:'ordinary no mention',atMe:false});
    const session=f.kernel.sessions.create(key,{trigger:`合成未运行 ${mode}`,waitUntil:Date.now()+60000});if(mode==='retry')f.kernel.sessions.update(session,{retryTriggerIds:[-1]});
    if(mode==='rejected')f.kernel.config.update({store:{contextSliderPos:0}});
    await f.kernel.orchestrator.wake(key,{waitingSessionId:session.id,verified:mode==='retry'});
    assert.equal(f.kernel.sessions.peek(session.id),null,mode);assert.equal(f.kernel.sessions.get(session.id),null,mode);
  }
  const oldDiscard=f.kernel.sessions.create('group:25703',{trigger:'旧内部标记'});f.kernel.sessions.finish(oldDiscard.id,'discarded');await f.frame.locator('#reload').click();await wait(async()=>await row(oldDiscard.id).count()===0);events.push('all three preflight discard branches leave no archive; old internal markers are excluded from the default list');

  f.kernel.config.update({store:{contextSliderPos:10}});const sent=await start('group:25703',{send:true});plan.model.resolve();await work;work=null;
  await wait(async()=>await body.locator('.flow-sent').count()===2);const tools=sent.messages.filter(m=>m.toolCall);assert.equal(tools.length,2);assert.deepEqual(tools.map(m=>m.toolCall.sent.map(s=>s.text)),[['固定消息 1'],['固定消息 2']]);
  const cards=await body.locator(':scope > .flow-card').evaluateAll(nodes=>nodes.map(n=>({key:n.dataset.key,kind:n.className,text:n.textContent})));const sends=cards.map((n,i)=>n.kind.includes('flow-sent')?i:-1).filter(i=>i>=0);
  assert.equal(sends.length,2);for(const i of sends){assert.match(cards[i-1].kind,/flow-tool/);assert.match(cards[i-1].text,/send_message/);}assert.match(cards[sends[0]].text,/固定消息 1/);assert.doesNotMatch(cards[sends[0]].text,/固定消息 2/);assert.match(cards[sends[1]].text,/固定消息 2/);assert.match(cards[sends[1]-1].kind,/flow-error/);
  assert.equal(await body.locator('.sent-message').count(),2);assert.doesNotMatch(await body.locator('.sent-message > small').first().innerText(),/^\d{13}$/);
  await body.locator('.flow-sent').first().evaluate(n=>{window.__receipt257=n;});await f.frame.locator('#reload').click();assert.equal(await body.locator('.flow-sent').first().evaluate(n=>n===window.__receipt257),true);
  if(evidence)await f.page.screenshot({path:path.join(evidence,'sent-by-call.png'),fullPage:true});events.push('multiple sends and partial failure retain exact receipts directly after each tool; next thinking follows them, refresh retains nodes and timestamps are formatted');

  // Existing archives: structured tool results, a single text-only send, and
  // ambiguous multiple text-only sends. Never invent a per-call attribution.
  for(const legacy of ['structured','single','ambiguous']){
    const receipt={msgId:'legacy257',text:`旧发送 ${legacy}`,at:Date.now()};const s=f.kernel.sessions.create('group:25703',{trigger:legacy});
    f.kernel.sessions.update(s,{messages:[{role:'tool',toolCall:{name:'send_message',ok:true,result:legacy==='structured'?JSON.stringify({sent:[receipt]}):'sent'}},...(legacy==='ambiguous'?[{role:'tool',toolCall:{name:'send_message',ok:true,result:'sent'}}]:[]),{role:'assistant',content:'发送之后的思考'}],sent:[receipt]});f.kernel.sessions.finish(s.id,'done');
    await row(s.id).locator('strong').click();await body.locator('.flow-sent').filter({hasText:receipt.text}).waitFor();const previous=await body.locator('.flow-sent').evaluate(n=>n.previousElementSibling.className);assert.match(previous,legacy==='ambiguous'?/flow-think/:/flow-tool/);
  }
  for(const request of requests)for(const message of request)assert.equal('toolCall'in message,false,'receipt provenance never enters the model payload');
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);
  if(evidence)fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,headed:process.env.QA_HEADED==='1',events,externalRequests:0,liveConsoleAccessed:false},null,2)+'\n');
  console.log('✓ 257 abort/race reasons, background memory, discarded waits, per-call actual/legacy receipts and stable UI');
}catch(error){if(evidence)await f.page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});throw error;}
finally{plan?.model.resolve();await work?.catch(()=>{});await f.close();}

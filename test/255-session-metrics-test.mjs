// Real runner metadata plus a real, isolated default session page. All tools
// return fixed local results; model, QQ, community and live console are unused.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {runAgent} from '../src/kernel/agent-runner.js';
import {sessionCacheRate,cacheTone,formatCacheRate,formatDuration,sessionDuration} from '../ui/panels/sessions/metrics.js';
import {modelUiFixture} from './model-ui-fixture.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async fn=>{for(let i=0;i<400;i++){if(await fn())return;await pause(20);}throw Error('255 metrics view did not settle');};
const evidence=process.env.QA255_EVIDENCE;if(evidence)fs.mkdirSync(evidence,{recursive:true});
for(const [percent,tone] of [[100,'good'],[90,'good'],[89.9,'good-soft'],[85,'good-soft'],[84.9,'warn-soft'],[80,'warn-soft'],[79.9,'warn'],[70,'warn'],[69.9,'bad'],[0,'bad']])assert.equal(cacheTone(sessionCacheRate({promptTokens:1000,cachedTokens:percent*10})),tone);
assert.equal(formatCacheRate({promptTokens:2000,cachedTokens:1900}),'95.0%');assert.equal(sessionCacheRate({promptTokens:0,cachedTokens:10}),0);assert.equal(sessionCacheRate({promptTokens:10,cachedTokens:20}),1);assert.equal(sessionCacheRate({promptTokens:10,cachedTokens:-1}),0);
assert.equal(formatDuration(undefined),'—');assert.equal(formatDuration(null),'—');assert.equal(formatDuration(-1),'—');assert.equal(formatDuration(0),'0 ms');assert.equal(formatDuration(213),'213 ms');assert.equal(formatDuration(1530),'1.53 秒');assert.equal(formatDuration(62500),'1 分 2.50 秒');assert.equal(sessionDuration({startedAt:1000,endedAt:34300}),33300);assert.equal(sessionDuration({startedAt:1000},1500),500);
let rounds=0;const requests=[],snapshots=[],invoked=[];
const names=['success255','failure255','throw255','blocked255'];
const trace=await runAgent({session:{chatKey:'group:25501',sent:[]},systemPrompt:'固定合成输入',userPrompt:'固定合成输入',tools:[],cfg:{api:{maxRounds:2}},log:{},
  callLLM:async options=>{requests.push(structuredClone(options.messages));await pause(25);return{message:{role:'assistant',content:'固定合成思考',...(++rounds===1?{tool_calls:names.map((name,index)=>({id:'call255-'+index,type:'function',function:{name,arguments:'{}'}}))}:{})}};},
  hooksOf:name=>name==='before-tool'?[{ownerId:'local255',fn:({toolName})=>toolName==='blocked255'?{block:true,reason:'固定拒绝'}:null}]:[],
  invokeTool:async name=>{invoked.push(name);await pause(25);if(name==='throw255')throw Error('固定合成异常');return name==='failure255'?{ok:false,error:'固定合成失败'}:{ok:true,result:'固定合成成功'};},
  onRound:value=>snapshots.push(structuredClone(value))});
const calls=trace.messages.filter(message=>message.toolCall);
assert.deepEqual(invoked,names.slice(0,3));assert.deepEqual(calls.map(m=>m.toolCall.ok),[true,false,false,false]);
for(const message of calls){assert.ok(Number.isFinite(message.toolCall.durationMs)&&message.toolCall.durationMs>=0);if(message.toolCall.name!=='blocked255')assert.ok(message.toolCall.durationMs>=15,'time encloses the actual delayed invocation');}
assert.equal(snapshots.at(-1).messages.filter(message=>message.toolCall).length,4);
for(const request of requests)for(const message of request.filter(m=>m.role==='tool')){assert.equal('toolCall'in message,false);assert.equal('durationMs'in message,false);}
const thoughts=trace.messages.filter(message=>message.role==='assistant');assert.equal(thoughts.length,2);for(const thought of thoughts)assert.ok(thought.generationDurationMs>=15,'generation time encloses the actual delayed model call');
for(const request of requests)for(const message of request)assert.equal('generationDurationMs'in message,false,'presentation timing never enters the standard model request');
assert.equal(snapshots.at(-1).messages.filter(message=>message.generationDurationMs>=15).length,2);
console.log('✓ 255 cache thresholds and actual success/failure/throw/veto elapsed metadata, no model-payload leakage');
if(process.argv.includes('--pure'))process.exit(0);
const f=await modelUiFixture({config:{ui:{refreshMs:60000},proactive:{enabled:false}}});
try{
  f.kernel.capability.register('transport.provider','kernel',{id:'local255',selfId:'25599',actions:{listGroups:async()=>[{group_id:25501,group_name:'示例指标群'}]}});
  const sessions=[];
  for(const [index,percent]of [90,89.9,85,84.9,80,79.9,70,69.9,0,100].entries()){
    const session=f.kernel.sessions.create('group:25501',{trigger:`阈值示例 ${percent}`});
    f.kernel.sessions.update(session,{usage:{calls:2,promptTokens:1000,cachedTokens:percent*10,completionTokens:100,totalTokens:1100},messages:index===0?[...trace.messages,{role:'tool',toolCall:{name:'historical255',args:{},result:'历史无耗时',ok:true}},{role:'assistant',content:'历史思考（无计时）'}]:[]});f.kernel.sessions.finish(session.id,index===7?'error':'done');f.kernel.sessions.update(session,{startedAt:1000+index,endedAt:34300+index});sessions.push(session);
  }
  await f.page.locator('#nav button[data-panel=sessions]').click();await f.frame.locator('#sessions-panel[data-ready=true]').waitFor();await f.frame.locator('#follow').uncheck();
  for(const [index,percent]of [90,89.9,85,84.9,80,79.9,70,69.9,0,100].entries()){
    const card=f.frame.locator(`[data-session="${sessions[index].id}"]`),cache=card.locator('.session-cache');
    assert.equal(await cache.getAttribute('data-tone'),cacheTone(percent/100));assert.equal(await cache.innerText(),`${percent.toFixed(1)}%`);assert.equal(await cache.getAttribute('aria-label'),`缓存命中率 ${percent.toFixed(1)}%`);
    assert.doesNotMatch(await card.innerText(),/group:25501/);
    assert.equal(await card.locator('.session-row-title .session-state-label').count(),0);
    assert.equal(await card.locator('.session-row-metrics').evaluate(n=>n.firstElementChild.classList.contains('session-state-label')&&n.lastElementChild.classList.contains('session-cache')),true);
    assert.equal(await card.locator('.session-state-label').innerText(),index===7?'失败':'已回复');
    const aligned=await card.locator('.session-row-metrics').evaluate(n=>{const state=n.firstElementChild.getBoundingClientRect(),rate=n.lastElementChild.getBoundingClientRect();return state.right<rate.left&&Math.abs(state.bottom-rate.bottom)<3;});assert.equal(aligned,true,'state and percentage stay adjacent on one line');
  }
  await f.frame.locator(`[data-session="${sessions[0].id}"] strong`).click();await f.frame.locator('.flow-tool').first().waitFor();
  assert.equal(await f.frame.locator('#detail h3').innerText(),'示例指标群');assert.equal(await f.frame.locator('main > .head').evaluate(n=>n.getBoundingClientRect().height<=40),true,'desktop page heading is compact without shrinking controls');
  const meta=f.frame.locator('.session-meta');assert.match(await meta.innerText(),/用时 33\.30 秒/);assert.doesNotMatch(await meta.innerText(),/结束 /);assert.match(await meta.locator('.cache-rate').innerText(),/缓存命中率 90\.0%/);
  assert.equal(await f.frame.locator('.flow-tool.flow-success').count(),2);assert.equal(await f.frame.locator('.flow-tool.flow-error').count(),3);
  for(const call of calls){const summary=f.frame.locator('.flow-tool > summary').filter({hasText:call.toolCall.name});assert.equal(await summary.locator('.flow-duration').innerText(),`用时 ${formatDuration(call.toolCall.durationMs)}`);}
  for(const [index,thought]of thoughts.entries())assert.equal(await f.frame.locator('.flow-think > summary .flow-duration').nth(index).innerText(),`用时 ${formatDuration(thought.generationDurationMs)}`);
  assert.equal(await f.frame.locator('.flow-think > summary .flow-duration').nth(thoughts.length).innerText(),'用时 —');
  assert.equal(await f.frame.locator('.flow-tool > summary').filter({hasText:'historical255'}).locator('.flow-duration').innerText(),'用时 —');
  // Theme variables, including the two intermediate shades, remain the source.
  await f.frame.locator('html').evaluate(n=>{n.style.setProperty('--good','#22aa66');n.style.setProperty('--warn','#cc9933');n.style.setProperty('--bad','#dd3344');});
  const color=selector=>f.frame.locator(selector).first().evaluate(n=>getComputedStyle(n).color);
  const border=selector=>f.frame.locator(selector).first().evaluate(n=>getComputedStyle(n).borderLeftColor);
  assert.equal(await border('.flow-tool.flow-success'),'rgb(34, 170, 102)');assert.equal(await border('.flow-tool.flow-error'),'rgb(221, 51, 68)');
  assert.equal(await color('.cache-rate[data-tone=good]'),'rgb(34, 170, 102)');assert.equal(await color('.cache-rate[data-tone=warn]'),'rgb(204, 153, 51)');assert.equal(await color('.cache-rate[data-tone=bad]'),'rgb(221, 51, 68)');
  assert.notEqual(await color('.cache-rate[data-tone=good-soft]'),await color('.cache-rate[data-tone=good]'));assert.notEqual(await color('.cache-rate[data-tone=warn-soft]'),await color('.cache-rate[data-tone=warn]'));
  await f.frame.locator('.flow-tool.flow-success > summary').first().click();await f.frame.locator('.flow-tool.flow-success').first().evaluate(async n=>{await Promise.allSettled(n.getAnimations().map(a=>a.finished));});
  await meta.evaluate(n=>{window.__meta255=n;window.__cache255=n.querySelector('.cache-rate');window.__tool255=document.querySelector('.flow-tool');});
  const changed=[...trace.messages,{role:'tool',toolCall:{name:'historical255',result:'历史无耗时',ok:true}}];
  f.kernel.sessions.update(sessions[0],{usage:{calls:3,promptTokens:1000,cachedTokens:695,completionTokens:100,totalTokens:1100},messages:changed});
  await meta.locator('.cache-rate').filter({hasText:'69.5%'}).waitFor();assert.equal(await meta.locator('.cache-rate').getAttribute('data-tone'),'bad');
  assert.equal(await meta.evaluate(n=>n===window.__meta255&&n.querySelector('.cache-rate')===window.__cache255&&document.querySelector('.flow-tool')===window.__tool255&&window.__tool255.open),true);
  assert.equal(await f.frame.locator('#detail').evaluate(n=>n.getAnimations().some(a=>a.playState==='running')),false);
  if(evidence)await f.page.screenshot({path:path.join(evidence,'session-metrics.png'),fullPage:true});
  await f.page.setViewportSize({width:540,height:850});await wait(()=>f.frame.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await f.frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);
  console.log('✓ 255 session elapsed, cache colors/thresholds, adjacent state/percentage, compact header, tool timings/status, theme and stable SSE nodes');
}catch(error){if(evidence){await f.page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});fs.writeFileSync(path.join(evidence,'failure-layout.json'),JSON.stringify(await f.frame.locator('body').evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).map(n=>({tag:n.tagName,className:n.className,right:n.getBoundingClientRect().right}))})),null,2));}throw error;}
finally{await f.close();}
const replacement=await modelUiFixture({uiAssetPath:'panels/sessions/metrics.js',uiAsset:"export const sessionCacheRate=()=>1,formatCacheRate=()=> '追加命中策略',cacheTone=()=> 'good',formatDuration=()=> '追加用时策略',sessionDuration=()=>0;"});
try{const s=replacement.kernel.sessions.create('group:25502',{trigger:'追加指标'});replacement.kernel.sessions.finish(s.id,'done');await replacement.page.locator('#nav button[data-panel=sessions]').click();await replacement.frame.locator(`[data-session="${s.id}"] .session-cache`).filter({hasText:'追加命中策略'}).waitFor();await replacement.frame.locator(`[data-session="${s.id}"] strong`).click();await replacement.frame.locator('.session-meta').filter({hasText:'追加用时策略'}).waitFor();assert.deepEqual(replacement.errors,[]);assert.equal(replacement.outbound(),0);}
finally{await replacement.close();}
if(evidence)fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,headed:process.env.QA_HEADED==='1',at:new Date().toISOString(),cacheThresholdsVerified:true,realRunnerTimingVerified:true,realThinkingTimingVerified:true,appendOnlyMetricsVerified:true,stableSseNodes:true,externalRequests:0,liveConsoleAccessed:false},null,2)+'\n');
console.log('✓ 255 append-only shared metrics override is consumed by real list and detail');

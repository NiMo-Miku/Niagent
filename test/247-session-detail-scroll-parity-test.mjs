import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSessionDetailScrollPolicy} from '../ui/panels/sessions/scroll-policy.js';

// Pure geometry fixtures do not start a kernel, listener or browser.
let pureChecks=0;
function check(name,run){run();pureChecks++;console.log(`· ${name}`);}
function surface({top=0,height=2000,view=400,keys=[['message-0',100],['message-1',400]],json=false}={}){
  const detail={scrollTop:top,scrollHeight:height,clientHeight:view,clientTop:0};
  const body={hidden:json},raw={hidden:!json,scrollTop:211,scrollLeft:17};
  let layout=keys;
  detail.getBoundingClientRect=()=>({top:100,bottom:100+view});
  detail.querySelector=selector=>selector==='.session-body'?body:selector==='.raw-json'?raw:null;
  detail.querySelectorAll=()=>layout.map(([key,at])=>({dataset:{key},getBoundingClientRect:()=>({top:100+at-detail.scrollTop,bottom:100+at+80-detail.scrollTop})}));
  return {detail,raw,layout:next=>{layout=next;}};
}
const policy=createSessionDetailScrollPolicy();
check('first open, including a completed session, starts at its newest content',()=>{
  const {detail}=surface({top:225});const snapshot=policy.capture(detail,{id:'new',renderedId:'old',status:'done'});
  policy.restore(detail,snapshot);assert.equal(detail.scrollTop,2000);
});
for(const distance of [0,48,49])check(`running detail bottom threshold ${distance}px`,()=>{
  const {detail}=surface({top:1600-distance,keys:[]});const previous=detail.scrollTop;
  const snapshot=policy.capture(detail,{id:'same',renderedId:'same',status:'running'});detail.scrollHeight=2600;
  policy.restore(detail,snapshot);assert.equal(detail.scrollTop,distance<=48?2600:previous);
});
check('terminal refresh does not turn a previous bottom position into a new follow command',()=>{
  const {detail}=surface({top:1600,keys:[]});const snapshot=policy.capture(detail,{id:'same',renderedId:'same',status:'done'});
  detail.scrollHeight=2600;policy.restore(detail,snapshot);assert.equal(detail.scrollTop,1600);
});
check('reading anchor survives a new header and browser scroll anchoring adjustment',()=>{
  const f=surface({top:430});const snapshot=policy.capture(f.detail,{id:'same',renderedId:'same',status:'running'});
  f.layout([['message-0',300],['message-1',600]]);f.detail.scrollTop=470;
  policy.restore(f.detail,snapshot);assert.equal(f.detail.scrollTop,630,'same card remains at the same viewport offset');
});
check('a removed anchor falls back to the captured absolute reading position',()=>{
  const f=surface({top:430});const snapshot=policy.capture(f.detail,{id:'same',renderedId:'same',status:'running'});
  f.layout([]);f.detail.scrollTop=0;policy.restore(f.detail,snapshot);assert.equal(f.detail.scrollTop,430);
});
check('same-session raw JSON retains its nested reading position and mode',()=>{
  const f=surface({top:300,json:true});const snapshot=policy.capture(f.detail,{id:'same',renderedId:'same',status:'running'});
  f.raw.scrollTop=0;f.raw.scrollLeft=0;policy.restore(f.detail,snapshot);
  assert.equal(f.detail.scrollTop,300);assert.equal(f.raw.scrollTop,211);assert.equal(f.raw.scrollLeft,17);assert.equal(f.raw.hidden,false);
});
check('a new session never inherits the previous JSON reading coordinates',()=>{
  const f=surface({json:true});const snapshot=policy.capture(f.detail,{id:'new',renderedId:'old',status:'running'});
  f.raw.scrollTop=0;policy.restore(f.detail,snapshot);assert.equal(f.raw.scrollTop,0);
});
check('an expired selection or leave generation performs no scroll writes',()=>{
  const f=surface({top:1600,json:true});const snapshot=policy.capture(f.detail,{id:'same',renderedId:'same',status:'running'});
  policy.restore(f.detail,snapshot,{isCurrent:()=>false});assert.equal(f.detail.scrollTop,1600);assert.equal(f.raw.scrollTop,211);
});
console.log(JSON.stringify({test:247,pureChecks}));

if(!process.argv.includes('--pure')){
  const {modelUiFixture}=await import('./model-ui-fixture.mjs');
  const wait=async condition=>{for(let i=0;i<500;i++){if(await condition())return;await new Promise(r=>setTimeout(r,20));}throw new Error('session scroll did not settle');};
  const gate=()=>{let release;return{promise:new Promise(resolve=>{release=resolve;}),release:()=>release()};};
  const messages=(count,prefix='trace')=>Array.from({length:count},(_,i)=>({role:'assistant',content:`${prefix}-${i} ${'synthetic reading content '.repeat(8)}`}));
  const baseline=process.env.QA247_BASELINE_PANEL;
  const f=await modelUiFixture({config:{ui:{refreshMs:60000}},...(baseline?{uiAssetPath:'panels/sessions/panel.js',uiAsset:fs.readFileSync(baseline,'utf8')}: {})});
  const selectedTitle=id=>baseline?f.frame.locator('#detail h3').filter({hasText:id}):f.frame.locator(`#detail[data-session-id="${id}"] h3`);
  let held=null,appended;
  try{
    await f.page.addInitScript(()=>{
      window.__qa247Intervals=new Map();const start=window.setInterval.bind(window),stop=window.clearInterval.bind(window);
      window.setInterval=(fn,ms,...args)=>{const id=start(fn,ms,...args);window.__qa247Intervals.set(id,ms);return id;};
      window.clearInterval=id=>{window.__qa247Intervals.delete(id);stop(id);};
      // Manual production GETs give each geometry assertion one known snapshot.
      window.addEventListener('message',event=>{if(event.data?.method==='shell.event'&&event.data.params?.name?.startsWith('session-'))event.stopImmediatePropagation();},{capture:true});
    });
    const a=f.kernel.sessions.create('group:24701',{trigger:'QA247 running trace'}),b=f.kernel.sessions.create('group:24702',{trigger:'QA247 other trace'});
    f.kernel.sessions.update(a,{messages:messages(42),systemPrompt:'synthetic system',userPrompt:'synthetic user'});
    f.kernel.sessions.update(b,{messages:messages(35,'other')});f.kernel.sessions.finish(b.id,'done');
    await f.page.goto(f.base);await f.page.locator('#nav button[data-panel=sessions]').click();await f.frame.locator('#sessions-panel[data-ready=true]').waitFor();
    await selectedTitle(a.id).waitFor();await f.frame.locator('[data-key="message-41"]').waitFor();
    const detail=f.frame.locator('#detail');
    const settle=()=>detail.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const position=()=>detail.evaluate(n=>({top:n.scrollTop,height:n.scrollHeight,view:n.clientHeight,gap:n.scrollHeight-n.scrollTop-n.clientHeight}));
    const toBottom=()=>detail.evaluate(n=>{n.scrollTop=n.scrollHeight;});
    const reload=async last=>{await f.frame.locator('#reload').click();await f.frame.locator(`[data-key="message-${last}"]`).waitFor();await settle();};
    await settle();const first=await position();assert.ok(first.height>first.view+300,'real default detail must overflow');
    if(!baseline)assert.ok(first.gap<=2,`first detail open follows newest content: ${JSON.stringify(first)}`);
    await toBottom();const before=await position();f.kernel.sessions.update(a,{messages:messages(62)});await reload(61);const after=await position();
    if(baseline){
      assert.ok(after.gap>48,'old default panel loses bottom after real session growth');assert.ok(Math.abs(after.top-before.top)<=2,'old panel restores its captured absolute top');
      assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);
      console.log(JSON.stringify({test:247,baseline:true,first,before,after,realDefaultPage:true,syntheticSessionId:a.id}));
    }else{
      assert.ok(after.gap<=2,`running bottom remains attached: ${JSON.stringify(after)}`);
      const anchor=f.frame.locator('[data-key="message-10"]');
      await anchor.evaluate(node=>{const host=node.closest('#detail');host.scrollTop+=node.getBoundingClientRect().top-host.getBoundingClientRect().top-20;});await settle();
      const offset=()=>anchor.evaluate(node=>node.getBoundingClientRect().top-node.closest('#detail').getBoundingClientRect().top);
      const readingOffset=await offset(),readingTop=(await position()).top;
      f.kernel.sessions.update(a,{messages:messages(72)});await reload(71);assert.ok(Math.abs(await offset()-readingOffset)<=2,'off-bottom append keeps the visible trace card');assert.ok(Math.abs((await position()).top-readingTop)<=2);
      f.kernel.sessions.finish(a.id,'error',{error:'QA247 terminal diagnostic '.repeat(25),finishReason:'synthetic terminal'});
      await f.frame.locator('#reload').click();await f.frame.locator('.session-body > .error').filter({hasText:'QA247 terminal diagnostic'}).waitFor();await settle();
      assert.ok(Math.abs(await offset()-readingOffset)<=2,'new terminal header keeps the reading card rather than jumping to bottom');
      assert.ok((await position()).gap>48);assert.equal(await f.frame.locator('#follow').isChecked(),true,'scroll policy does not change selection follow intent');
      await wait(async()=>await f.frame.locator('body').evaluate(()=>window.__qa247Intervals.size===0));

      await f.frame.locator('#json-mode').check();const raw=f.frame.locator('.raw-json');await raw.evaluate(n=>{n.scrollTop=211;n.scrollLeft=17;});const rawBefore=await raw.evaluate(n=>({top:n.scrollTop,left:n.scrollLeft}));
      assert.ok(rawBefore.top>0,'raw JSON has a real nested reading surface');
      f.kernel.sessions.update(a,{messages:messages(73,'json-refresh')});await f.frame.locator('#reload').click();await raw.filter({hasText:'json-refresh-72'}).waitFor();await settle();
      assert.equal(await f.frame.locator('#json-mode').isChecked(),true);assert.deepEqual(await raw.evaluate(n=>({top:n.scrollTop,left:n.scrollLeft})),rawBefore,'JSON mode and nested scroll survive refresh');
      await f.frame.locator('#json-mode').uncheck();

      const captured=gate(),released=gate();held=gate();let once=true;
      const delayed=async route=>{if(!once)return route.continue();once=false;const response=await route.fetch();captured.release();await held.promise;await route.fulfill({response});released.release();};
      await f.page.route(`${f.base}/api/sessions/${a.id}`,delayed);await f.frame.locator('#reload').click();await captured.promise;
      await f.frame.locator(`[data-session="${b.id}"]`).click();await selectedTitle(b.id).waitFor();await f.frame.locator('[data-key="message-34"]').waitFor();await settle();
      assert.ok((await position()).gap<=2,'switching to another completed session initially shows its newest content');
      await detail.evaluate(n=>{n.scrollTop=137;});const otherBefore=await position();held.release();await released.promise;await settle();
      assert.equal(await f.frame.locator('#detail').getAttribute('data-session-id'),b.id);assert.ok(Math.abs((await position()).top-otherBefore.top)<=2,'late old detail cannot scroll the new selection');assert.equal(await f.frame.locator('#follow').isChecked(),false);
      await f.page.unroute(`${f.base}/api/sessions/${a.id}`,delayed);
      assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);assert.equal(f.modelRequests.length,0);
      console.log(JSON.stringify({test:247,baseline:false,first,before,after,readingOffset,jsonReading:rawBefore,lateDetailRejected:true,idleIntervals:0}));
      await f.close();

      appended=await modelUiFixture({uiAssetPath:'panels/sessions/scroll-policy.js',uiAsset:`export function createSessionDetailScrollPolicy(){return{capture(detail,context){globalThis.__qa247Capture=(globalThis.__qa247Capture||0)+1;return{top:73}},restore(detail,snapshot,{isCurrent}){if(isCurrent()){detail.scrollTop=snapshot.top;detail.dataset.qa247Selected='yes';}}}}`});
      const custom=appended.kernel.sessions.create('group:24703',{trigger:'QA247 selected scroll module'});appended.kernel.sessions.update(custom,{messages:messages(42)});appended.kernel.sessions.finish(custom.id,'done');
      await appended.page.locator('#nav button[data-panel=sessions]').click();await appended.frame.locator(`[data-session="${custom.id}"]`).waitFor();await appended.frame.locator(`[data-session="${custom.id}"]`).click();await appended.frame.locator('#detail[data-qa247-selected=yes]').waitFor();
      assert.equal(await appended.frame.locator('#detail').evaluate(n=>n.scrollTop),73);assert.ok(await appended.frame.locator('body').evaluate(()=>window.__qa247Capture)>0,'actual default panel invokes the selected replacement module');
      assert.deepEqual(appended.errors,[]);assert.equal(appended.outbound(),0);assert.equal(appended.modelRequests.length,0);
      console.log('✓ real appended scroll-policy asset changes the default session page, with no extra RPC or model call');
    }
  }finally{held?.release();await appended?.close();await f.close();}
}

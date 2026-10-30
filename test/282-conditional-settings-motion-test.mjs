import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {settingsSection,settingsEditor,openSettingsFold} from './settings-navigation.mjs';

const evidence=process.env.QA282_EVIDENCE,checks=[],frames={};
if(evidence)fs.mkdirSync(evidence,{recursive:true});
const f=await modelUiFixture({config:{personaUnified:false,api:{vision:true,video:true,useOfficialPrice:false},memory:{consolidateEnabled:true,useChatModel:false},webSearch:{enabled:false},commandMute:{enabled:true},proactive:{enabled:true}}});
const {frame,page}=f;
const settle=()=>frame.locator('body').evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished));});
async function transition(name,trigger,target,visible){
  await settle();
  const samples=await frame.locator(trigger).evaluate((button,{target,visible})=>new Promise((resolve,reject)=>{
    const el=document.querySelector(target),parent=el.parentElement,marker=document.createElement('div'),samples=[];let started=false,count=0;
    marker.style.height='1px';parent.after(marker);
    const initial={parentHeight:parent.getBoundingClientRect().height,below:marker.getBoundingClientRect().top,buttonHeight:button.getBoundingClientRect().height};
    button.click();
    const afterClickHeight=button.getBoundingClientRect().height;
    function sample(){
      const style=getComputedStyle(el),phase=el.dataset.conditionalPhase;
      if(phase||el.hidden===!visible)started=true;
      if(started)samples.push({opacity:Number(style.opacity),transform:style.transform,clip:style.clipPath,hidden:el.hidden,inert:el.inert,phase:phase??null,height:el.getBoundingClientRect().height,parentHeight:parent.getBoundingClientRect().height,below:marker.getBoundingClientRect().top,buttonHeight:button.getBoundingClientRect().height,time:performance.now()});
      if(started&&!phase&&el.hidden===!visible&&!parent.getAnimations().some(a=>a.playState==='running'||a.pending)){marker.remove();resolve({samples,initial:{...initial,afterClickHeight}});return;}
      if(++count>180){reject(Error('Conditional transition did not finish: '+target));return;}
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }),{target,visible}).then(({samples,initial})=>{samples.initial=initial;return samples;});
  frames[name]={samples,initial:samples.initial};
  assert.ok(Math.abs(samples.initial.afterClickHeight-samples.initial.buttonHeight)<.5&&samples.every(s=>Math.abs(s.buttonHeight-samples.initial.buttonHeight)<.5),name+' must keep the switch height stable from the click through every animation frame: '+JSON.stringify({before:samples.initial.buttonHeight,afterClick:samples.initial.afterClickHeight,heights:samples.map(s=>s.buttonHeight)}));
  assert.ok(samples.length>=4,name+' must animate real intermediate frames');
  assert.ok(samples.some(s=>s.opacity>0.05&&s.opacity<0.95),name+' must fade');
  assert.equal(samples.at(-1).hidden,!visible,name);
  if(!visible){const leaving=samples.filter(s=>s.phase==='leaving');assert.ok(leaving.length>2&&samples.every(s=>s.inert)&&leaving.every(s=>!s.hidden),name+' exits without accepting input');assert.equal(samples.at(-1).height,0,name+' leaves no space');assert.ok(leaving[0].opacity>leaving.at(-1).opacity,name+' fades out');}
  const from=samples.initial.parentHeight,to=samples.at(-1).parentHeight;
  if(Math.abs(from-to)>2){
    assert.ok(samples.some(s=>s.parentHeight>Math.min(from,to)+1&&s.parentHeight<Math.max(from,to)-1),name+' must change physical layout height between endpoints');
    assert.ok(samples.some(s=>Math.abs(s.below-samples.initial.below)>1&&!s.hidden),name+' moves following content before removal');
    assert.ok(Math.abs(samples.at(-1).below-samples.at(-2).below)<3,name+' cannot jump when hidden is applied');
  }
  if(!visible)assert.ok(samples.at(-1).time-samples[0].time<260,name+' closes promptly');
}
try{
  await settingsSection(frame,'search');
  await transition('search-enter','.search-enabled-toggle','#search-service-options',true);
  await transition('search-exit','.search-enabled-toggle','#search-service-options',false);
  await settingsSection(frame,'memory');
  await transition('memory-cooldown-exit','[aria-controls=memory-consolidate-cooldown]' ,'#memory-consolidate-cooldown',false);
  await transition('dedicated-model-exit','[aria-controls=memory-model-choice]','#memory-model-choice',false);
  await settingsEditor(frame,'model-config');
  await transition('image-model-exit','[data-model-media=vision] > button','.model-media-slide',false);
  await transition('video-mode-exit','[data-model-media=video] > button','[data-path="api.videoMode"]',false);
  await settingsSection(frame,'prices');
  await transition('manual-prices-exit','.cost-price-toggle','.cost-manual-fields',false);
  await transition('official-prices-exit','.cost-price-toggle','.cost-price-summary',false);
  await settingsSection(frame,'chat');await openSettingsFold(frame,'layout-mute');
  await transition('mute-options-exit','.command-mute-toggle','#command-mute-options',false);
  await openSettingsFold(frame,'layout-proactive');
  await transition('proactive-options-exit','.proactive-toggle','#proactive-options',false);
  await settingsSection(frame,'persona');await frame.locator('[data-persona-binding="group:10001"]').waitFor();
  await transition('persona-rows-exit','.persona-unified-toggle','[data-persona-binding="group:10001"]',false);
  assert.equal(await frame.locator('[data-persona-binding=global]').isVisible(),true);
  checks.push('all switches keep their own height stable from the click through every frame, while the enclosing height and following content move smoothly; removal causes no final jump and exits finish promptly');

  await settingsSection(frame,'search');await settle();
  const reversal=await frame.locator('.search-enabled-toggle').evaluate(async button=>{
    const el=document.querySelector('#search-service-options'),tick=()=>new Promise(r=>requestAnimationFrame(r)),result=[];
    button.click();for(let i=0;i<5;i++)await tick();
    for(let i=0;i<4;i++){
      const before=Number(getComputedStyle(el).opacity),height=el.parentElement.getBoundingClientRect().height,buttonHeight=button.getBoundingClientRect().height;button.click();const after=Number(getComputedStyle(el).opacity);result.push({before,after,height,afterHeight:el.parentElement.getBoundingClientRect().height,buttonHeight,afterButtonHeight:button.getBoundingClientRect().height,hidden:el.hidden});
      for(let j=0;j<2;j++)await tick();
    }
    return result;
  });
  assert.ok(reversal.every(s=>!s.hidden&&Math.abs(s.before-s.after)<0.03),'reverse from the current frame without jumping');
  assert.ok(reversal.every(s=>Math.abs(s.height-s.afterHeight)<.5),'height reversal starts from the current layout without jumping');
  assert.ok(reversal.every(s=>Math.abs(s.buttonHeight-s.afterButtonHeight)<.5),'reversing the reveal must not stretch the switch');
  await settle();assert.equal(await frame.locator('#search-service-options').isVisible(),true);assert.equal(await frame.locator('.search-enabled-toggle').getAttribute('aria-checked'),'true');
  const writes=f.writes.length;await settle();assert.equal(f.writes.length,writes,'animation completion cannot issue writes');frames.rapidReversal=reversal;
  checks.push('rapid mid-animation reversals continue from the current frame and cannot let a stale completion hide an enabled control; animation completion does not save settings');

  // A focused field must not remain inside an aria-hidden, departing subtree.
  await frame.locator('#field-webSearch-maxResults').focus();
  await frame.locator('.search-enabled-toggle').evaluate(button=>button.click());
  assert.equal(await frame.locator('.search-enabled-toggle').evaluate(button=>button===document.activeElement),true);
  assert.equal(await frame.locator('#search-service-options').getAttribute('aria-hidden'),'true');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await frame.locator('#search-service-options').evaluate(async el=>{await new Promise(r=>requestAnimationFrame(r));return el.hidden;}),true,'reduced motion settles an in-flight exit before the next paint');
  await frame.locator('.search-enabled-toggle').click();assert.equal(await frame.locator('#search-service-options').evaluate(el=>el.getAnimations().length),0);
  await frame.locator('.search-enabled-toggle').click();assert.equal(await frame.locator('#search-service-options').isHidden(),true);
  await page.emulateMedia({reducedMotion:'no-preference'});
  checks.push('focus returns to the switch on exit; reduced motion settles an in-flight exit and subsequent toggles immediately');

  await frame.locator('.search-enabled-toggle').click();await settle();
  await frame.locator('.search-enabled-toggle').evaluate(button=>{button.click();document.querySelector('#settings-sidebar a[data-target=memory]').click();});
  await settingsSection(frame,'search');await settle();assert.equal(await frame.locator('#search-service-options').isHidden(),true,'closing an ancestor mid-exit must not strand its child');
  checks.push('switching sections during an exit settles the hidden subtree before the same section is reopened');

  await page.setViewportSize({width:560,height:900});
  await transition('narrow-search-enter','.search-enabled-toggle','#search-service-options',true);
  await transition('narrow-search-exit','.search-enabled-toggle','#search-service-options',false);
  await page.setViewportSize({width:1360,height:900});

  const lifecycle=await frame.locator('body').evaluate(async()=>{
    const {createConditionalMotion}=await import('./conditional-motion.js');
    const motion=createConditionalMotion(document),parent=document.createElement('div'),el=document.createElement('div'),peer=document.createElement('button');parent.style.display='grid';parent.style.alignContent='end';parent.style.overflowX='visible';parent.style.overflowClipMargin='2px';peer.style.position='static';peer.style.zIndex='4';peer.textContent='persistent control';el.style.marginTop='3px';el.textContent='isolated motion lifecycle';el.setAttribute('aria-hidden','false');parent.append(peer,el);document.body.append(parent);motion.set(el,true);
    if(el.getAnimations().length)throw Error('Initial rendering must not animate conditional controls');motion.set(el,false);const leaving=el.dataset.conditionalPhase;motion.dispose();
    const result={leaving,hidden:el.hidden,inert:el.inert,aria:el.getAttribute('aria-hidden'),animations:el.getAnimations().length,alignContent:parent.style.alignContent,overflowX:parent.style.overflowX,clipMargin:parent.style.overflowClipMargin,peerPosition:peer.style.position,peerZIndex:peer.style.zIndex,marginTop:el.style.marginTop,parentAnimations:parent.getAnimations().length};parent.remove();return result;
  });
  assert.deepEqual(lifecycle,{leaving:'leaving',hidden:true,inert:false,aria:'false',animations:0,alignContent:'end',overflowX:'visible',clipMargin:'2px',peerPosition:'static',peerZIndex:'4',marginTop:'3px',parentAnimations:0});
  await frame.locator('.search-enabled-toggle').click();await settle();await frame.locator('.search-enabled-toggle').evaluate(button=>button.click());await page.locator('#nav button[data-panel=sessions]').click();await frame.locator('#settings-sidebar').waitFor({state:'detached'});
  await f.openSettings();await settingsSection(frame,'search');await settle();assert.equal(await frame.locator('#search-service-options').isHidden(),true);
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);checks.push('disposal cancels animations and restores owned attributes; leaving the panel mid-exit and reopening cannot retain a stale animation or blank space; zero external requests');
}catch(error){if(evidence){fs.writeFileSync(path.join(evidence,'frames.json'),JSON.stringify(frames,null,2));await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});}throw error;}
finally{await f.close();}
if(evidence){fs.writeFileSync(path.join(evidence,'frames.json'),JSON.stringify(frames,null,2));fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks,externalRequests:0},null,2));}
checks.forEach(check=>console.log('✓ 282 '+check));

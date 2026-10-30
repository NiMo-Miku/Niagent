import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {ActivityDraft} from '../ui/panels/settings/activity-draft.js';
import {modelUiFixture} from './model-ui-fixture.mjs';import {settingsSection,settingsEditor,settingsPickModel} from './settings-navigation.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),until=async check=>{for(let i=0;i<300;i++){if(await check())return;await pause(20);}throw Error('267 did not settle');};
const evidence=process.env.QA267_EVIDENCE;if(evidence)fs.mkdirSync(evidence,{recursive:true});const checks=[];
// A failed receipt, and an edit back to the original value while a save is in
// flight, are real state transitions, not just snapshots of the markup.
{
  const key='store.groupPeakPos',base={[key]:{a:{peak:10,valley:90,extra:'keep'},b:{peak:20,valley:80}},scalar:55},d=new ActivityDraft(p=>base[p]);
  d.set(key,{...d.value(key),a:{peak:11,valley:90,extra:'keep'}});base[key].b={peak:25,valley:75,extra:'new'};
  const sent=d.beginCommit(),changes=d.changes(sent);assert.deepEqual(changes[0].value.b,base[key].b);d.set(key,{...d.value(key),a:{peak:12,valley:90,extra:'keep'}});base[key]=changes[0].value;d.accept(sent);assert.equal(d.dirty,true);assert.equal(d.changes(d.snapshot())[0].value.a.peak,12);assert.equal(d.changes(d.snapshot())[0].value.b.extra,'new');d.discard();
  d.set('scalar',56);const first=d.beginCommit();d.set('scalar',55);base.scalar=56;d.accept(first);assert.equal(d.dirty,true);assert.equal(d.value('scalar'),55);d.reject();d.discard();assert.equal(d.dirty,false);
  checks.push('versioned card drafts preserve later edits, reverts and unrelated group changes');
}
const config={allow:{groups:['10001','10002'],private:[]},store:{contextSliderPos:55,unifiedTier:true,groupSliderPos:{10001:25,10002:37,99999:44},groupPeakPos:{10002:{peak:5,valley:80,extra:'preserve'}},peakSchedule:{enabled:false,peak:{start:'09:00',end:'18:00',sliderPos:10},valley:{sliderPos:95}}}};
const f=await modelUiFixture({config}),{frame,page}=f;
const golden=JSON.parse(fs.readFileSync(new URL('./activity-v04-layout.json',import.meta.url),'utf8'));
const card=frame.locator('.activity-card'),normal=frame.getByRole('slider',{name:'当前响应档位',exact:true}),hi=frame.getByRole('slider',{name:'高峰响应档位',exact:true}),lo=frame.getByRole('slider',{name:'低谷响应档位',exact:true});
const commit=card.locator('[data-activity-save]'),cancel=card.locator('[data-activity-cancel]');
const settle=()=>frame.locator('body').evaluate(async()=>{
  await document.fonts.ready;let stable=0;
  for(let i=0;i<180;i++){
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const active=document.getAnimations().some(a=>a.effect?.getTiming().iterations!==Infinity&&(a.playState==='running'||a.pending));
    if(!active&&!document.querySelector('[data-conditional-phase]')){if(++stable===2)return;}else stable=0;
  }
  throw Error('Activity layout animations did not settle');
});
async function capture(state){
  await settle();const actual=await card.evaluate(root=>{const r=root.getBoundingClientRect(),selectors={head:':scope > summary',icon:'.activity-icon',title:'.activity-title',controls:'.activity-head-controls',peak:'.activity-peak-control',switch:'.activity-peak-control .activity-switch-track',params:'[data-settings-open=tier-params]',badge:'.activity-badge',body:':scope > .settings-fold-body',inner:'.activity-inner',bar:'.activity-tier-bar',readout:'.activity-readout',big:'.activity-big',target:'.activity-target',footer:'[data-activity-save]'};return Object.fromEntries(Object.entries(selectors).map(([key,sel])=>{const el=root.querySelector(sel),b=el.getBoundingClientRect(),s=getComputedStyle(el);return[key,{x:b.x-r.x,y:b.y-r.y,width:b.width,height:b.height,fontSize:s.fontSize,fontWeight:s.fontWeight,padding:s.padding,borderRadius:s.borderRadius}];}));});
  // Keep the frozen 0.4 specimen; the requested shared button height changes
  // the centered header controls, group actions and footer contribution.
  const expected=structuredClone(golden[state]),buttonHeight=await card.evaluate(root=>parseFloat(getComputedStyle(root).getPropertyValue('--control-height'))),delta=buttonHeight-expected.params.height;
  for(const key of ['controls','peak','params']){expected[key].height+=delta;expected[key].y-=delta/2;}
  expected.footer.height+=delta;expected.body.height+=delta;expected.inner.height+=delta;
  if(state==='grouped'){
    const groupDelta=(buttonHeight-28)+(buttonHeight-26); // legacy group and inheritance actions
    expected.body.height+=groupDelta;expected.inner.height+=groupDelta;expected.footer.y+=groupDelta;
  }
  for(const[key,properties]of Object.entries(expected))for(const[prop,want]of Object.entries(properties)){
    if(typeof want==='number')assert.ok(Math.abs(actual[key][prop]-want)<=2,`${state}.${key}.${prop}: ${actual[key][prop]} vs ${want}`);else assert.equal(actual[key][prop],want,`${state}.${key}.${prop}`);
  }
  assert.equal(actual.bar.height,42);const knob=await (state==='single'?normal:lo).boundingBox();assert.equal(knob.width,5);assert.equal(knob.height,32);
  if(evidence){await card.screenshot({path:path.join(evidence,state+'.png')});fs.writeFileSync(path.join(evidence,state+'.json'),JSON.stringify(actual,null,2));}
}
try{
  await page.route('**/api/onebot/groups',route=>route.fulfill({json:{groups:[{id:'10001',name:'第一个合成群'},{id:'10002',name:'第二个合成群'}]}}));await settingsSection(frame,'chat');
  // Constrain only the fixture's card width to the measured legacy specimen.
  await card.evaluate(el=>{el.style.width='820px';el.style.maxWidth='none';});await capture('single');
  assert.equal(await card.locator('[data-settings-group=layout-activity-advanced]').count(),0);assert.equal(await card.locator('.activity-state').isHidden(),true);
  const baseline=JSON.parse(fs.readFileSync(new URL('./settings-structure-fields.json',import.meta.url))).paths;assert.deepEqual(await frame.locator('[data-config-path]').evaluateAll(els=>els.map(el=>el.dataset.configPath).sort()),baseline);
  await frame.locator('#field-store-peakSchedule-enabled').check();await capture('dual');await frame.locator('#field-store-unifiedTier').uncheck();
  const globalPick=card.getByRole('button',{name:'全局设置',exact:true});assert.equal(await card.locator('.activity-group-buttons > :first-child').textContent(),'全局设置');assert.equal(await globalPick.getAttribute('aria-pressed'),'true');assert.equal(await hi.getAttribute('aria-disabled'),'false');
  await card.locator('[data-activity-group="10001"]').click();await capture('grouped');assert.equal(await card.locator('[data-activity-group="99999"]').count(),0);
  assert.equal(f.disk().store.unifiedTier,true);assert.equal(f.disk().store.peakSchedule.enabled,false);await cancel.click();assert.equal(await normal.isVisible(),true);assert.equal(await frame.locator('#field-store-unifiedTier').isChecked(),true);
  const color=await card.evaluate(el=>{const swatch=document.createElement('i');swatch.style.color='var(--accent)';el.append(swatch);const theme=getComputedStyle(swatch).color,knob=getComputedStyle(el.querySelector('.activity-position-normal')).backgroundColor;swatch.remove();return{theme,knob};});assert.equal(color.knob,color.theme);
  await card.getByRole('button',{name:'编辑峰谷时段与预设',exact:true}).click({position:{x:3,y:15}});await frame.locator('dialog.settings-peak-presets').waitFor();await page.keyboard.press('Escape');assert.equal(await card.evaluate(el=>el.open),true,'clicking the combined button padding opens its editor without folding the card');
  checks.push('three legacy slider states retain geometry, radii, typography and spacing with the requested shared action heights; colors remain current; all 160 controls retained, raw card absent');
  // Pointer motion is continuous in band 3 and snaps only discrete bands.
  const bar=card.locator('.activity-tier-bar'),rect=await bar.boundingBox();await page.mouse.click(rect.x+rect.width*.04,rect.y+20);assert.equal(await normal.getAttribute('aria-valuenow'),'5');assert.equal(f.disk().store.contextSliderPos,55);
  await page.mouse.move(rect.x+rect.width*.55,rect.y+20);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.5555,rect.y+20);assert.equal(await bar.evaluate(el=>getComputedStyle(el.querySelector('.activity-position-normal')).transitionDuration),'0s');await page.mouse.up();const point=Number(await normal.getAttribute('aria-valuenow'));assert.ok(Math.abs(point-55.55)<.03);
  await pause(850);assert.equal(f.disk().store.contextSliderPos,55,'dragging does not autosave the card draft');await cancel.click();assert.equal(await normal.getAttribute('aria-valuenow'),'55');
  await normal.press('End');await commit.click();await until(()=>f.disk().store.contextSliderPos===100);await normal.press('Home');await frame.locator('#save').click();await until(()=>f.disk().store.contextSliderPos===0);
  await frame.locator('#field-store-peakSchedule-enabled').check();await hi.press('End');assert.equal(await hi.getAttribute('aria-valuenow'),'95');await lo.press('Home');assert.equal(await lo.getAttribute('aria-valuenow'),'95');await cancel.click();
  checks.push('pointer precision/discrete snapping, keyboard bounds, noncrossing dual handles, card Cancel/Save and global Save persist correctly');
  // Failed card commits cannot escape through unrelated ordinary autosave.
  await normal.press('ArrowRight');await page.route(f.base+'/api/config/lifecycle',route=>route.fulfill({status:503,json:{error:'synthetic activity save failure'}}));await commit.click();await card.getByRole('status').filter({hasText:'synthetic activity save failure'}).waitFor();assert.equal(f.disk().store.contextSliderPos,0);assert.equal(await normal.getAttribute('aria-valuenow'),'1');await page.unroute(f.base+'/api/config/lifecycle');
  const params=await settingsEditor(frame,'tier-params');await frame.locator('#field-store-historyCount').fill('0');
  assert.equal(await params.locator('#random-percent').count(),0,'probability is edited by the outer activity slider only');
  assert.equal(await params.locator('.tier-history-count .field-title').textContent(),'历史消息读取');assert.equal(await params.locator('.tier-history-unit').textContent(),'条');
  const paramsGaps=await params.locator('.tier-params-fields').evaluate(root=>{const keywords=root.querySelector('[data-path="store.keywords"]').getBoundingClientRect(),history=root.querySelector('.tier-history-count').getBoundingClientRect(),row=root.querySelector('.chat-active-row').getBoundingClientRect();return[keywords,history,row].slice(1).map((rect,index)=>rect.top-[keywords,history][index].bottom);});
  assert.ok(paramsGaps.every(gap=>gap>=10&&gap<=14),'keyword, history and topic rows use compact spacing, without inherited dialog field margins');
  const active=params.getByRole('switch',{name:'活跃话题持续响应',exact:true}),ttl=params.locator('#field-chatActive-ttlMinutes');
  if(await active.getAttribute('aria-checked')==='false')await active.click();await ttl.waitFor({state:'visible'});await ttl.fill('45');
  await active.click();await ttl.waitFor({state:'hidden'});
  await until(()=>f.disk().chatActive.enabled===false&&f.disk().chatActive.ttlMinutes===45);assert.equal(await ttl.inputValue(),'45');
  await active.click();await ttl.waitFor({state:'visible'});assert.equal(await ttl.inputValue(),'45');
  await params.locator('.settings-dialog-head button').click();await until(()=>f.disk().store.historyCount===0&&f.disk().chatActive.enabled===true);assert.equal(f.disk().store.contextSliderPos,0);await commit.click();await until(()=>f.disk().store.contextSliderPos===1);
  checks.push('compact history input and active-topic card keep ordinary autosave, hidden duration and the independent activity draft intact');
  // Accept only the submitted version, even when a later edit returns to the
  // exact original value before a delayed receipt arrives.
  let release,entered;const gate=new Promise(resolve=>release=resolve),start=new Promise(resolve=>entered=resolve);await page.route(f.base+'/api/config/lifecycle',async route=>{const response=await route.fetch();entered();await gate;await route.fulfill({response});});await normal.press('ArrowRight');await commit.click();await start;assert.equal(await cancel.isDisabled(),true);await normal.press('ArrowLeft');release();await page.unroute(f.base+'/api/config/lifecycle');await card.getByRole('status').filter({hasText:'当前草稿尚未保存'}).waitFor();assert.equal(await normal.getAttribute('aria-valuenow'),'1');assert.equal(f.disk().store.contextSliderPos,2);await commit.click();await until(()=>f.disk().store.contextSliderPos===1);
  checks.push('failed save stays local through unrelated autosave; retry and late receipt preserve newer input including a revert');
  await normal.press('ArrowRight');const model=await settingsEditor(frame,'model-config');await settingsPickModel(frame,'main','a','alpha/existing');await page.keyboard.press('Escape');await settingsSection(frame,'chat');assert.equal(await normal.getAttribute('aria-valuenow'),'2','catalog-triggered form rebuild retains unpublished activity draft');assert.equal(f.disk().store.contextSliderPos,1);await cancel.click();
  let finishGlobal,startGlobal,arrivals=0;const globalGate=new Promise(resolve=>finishGlobal=resolve),globalStart=new Promise(resolve=>startGlobal=resolve);await page.route(f.base+'/api/config/lifecycle',async route=>{if(++arrivals>1)return route.continue();const response=await route.fetch();startGlobal();await globalGate;await route.fulfill({response});});await normal.press('ArrowRight');await frame.locator('#save').click();await globalStart;await normal.press('ArrowRight');finishGlobal();await until(()=>f.disk().store.contextSliderPos===3);await page.unroute(f.base+'/api/config/lifecycle');await normal.press('Home');await normal.press('ArrowRight');await commit.click();await until(()=>f.disk().store.contextSliderPos===1);
  checks.push('other settings rebuilds retain the card draft; global Save drains input entered during an in-flight receipt');
  await normal.press('ArrowRight');await frame.locator('#reload').click();await frame.locator('dialog.confirm-panel').getByRole('button',{name:'取消',exact:true}).click();assert.equal(await normal.getAttribute('aria-valuenow'),'2');await cancel.click();
  await frame.locator('#field-store-unifiedTier').uncheck();await card.locator('[data-activity-group="10001"]').click();await normal.press('End');await commit.click();await until(()=>f.disk().store.groupSliderPos['10001']===100);assert.equal(f.disk().store.groupSliderPos['10002'],37);assert.equal(f.disk().store.groupSliderPos['99999'],44);assert.deepEqual(f.disk().store.groupPeakPos['10002'],config.store.groupPeakPos['10002']);
  await card.getByRole('button',{name:'清除所选群的单独设置',exact:true}).click();await commit.click();await until(()=>!Object.hasOwn(f.disk().store.groupSliderPos,'10001'));assert.equal(f.disk().store.groupSliderPos['10002'],37);
  checks.push('reread cancellation preserves draft; group edit/restore touches only its target and preserves other metadata');
  // The split editor has a real global target; selecting an inherited group
  // reads that draft without accidentally creating its own override.
  await globalPick.click();assert.match(await card.locator('.activity-target').textContent(),/全局档位/);assert.equal(await card.getByRole('button',{name:'清除所选群的单独设置',exact:true}).isHidden(),true);
  await normal.press('End');assert.equal(f.disk().store.contextSliderPos,1);await card.locator('[data-activity-group="10001"]').click();assert.equal(await normal.getAttribute('aria-valuenow'),'100');await card.locator('[data-activity-group="10002"]').click();assert.equal(await normal.getAttribute('aria-valuenow'),'37');await cancel.click();await globalPick.click();assert.equal(await normal.getAttribute('aria-valuenow'),'1');
  const savedOverrides=structuredClone(f.disk().store.groupSliderPos),savedPairs=structuredClone(f.disk().store.groupPeakPos);await normal.press('End');await commit.click();await until(()=>f.disk().store.contextSliderPos===100);assert.equal(f.disk().store.unifiedTier,false);assert.deepEqual(f.disk().store.groupSliderPos,savedOverrides);assert.deepEqual(f.disk().store.groupPeakPos,savedPairs);
  await frame.locator('#field-store-peakSchedule-enabled').check();await hi.press('Home');await lo.press('End');await commit.click();await until(()=>f.disk().store.peakSchedule.enabled&&f.disk().store.peakSchedule.peak.sliderPos===0&&f.disk().store.peakSchedule.valley.sliderPos===100);
  await card.locator('[data-activity-group="10001"]').click();assert.equal(await hi.getAttribute('aria-valuenow'),'0');assert.equal(await lo.getAttribute('aria-valuenow'),'100');await card.locator('[data-activity-group="10002"]').click();assert.equal(await hi.getAttribute('aria-valuenow'),'5');assert.equal(await lo.getAttribute('aria-valuenow'),'80');assert.deepEqual(f.disk().store.groupPeakPos,savedPairs);
  await globalPick.click();await settle();if(evidence)await card.screenshot({path:path.join(evidence,'split-global.png')});await frame.locator('#field-store-peakSchedule-enabled').uncheck();await commit.click();await until(()=>!f.disk().store.peakSchedule.enabled);
  checks.push('global target is first, editable in split mode, stages and cancels locally, persists single/dual settings and preserves independent overrides; unset groups inherit without new keys');
  await card.evaluate(el=>{el.style.removeProperty('width');el.style.removeProperty('max-width');});await page.setViewportSize({width:560,height:900});await settle();assert.ok(await frame.locator('body').evaluate(el=>el.ownerDocument.documentElement.scrollWidth-el.ownerDocument.documentElement.clientWidth)<=1);assert.ok(await card.evaluate(el=>el.scrollWidth-el.clientWidth)<=1);if(evidence)await card.screenshot({path:path.join(evidence,'narrow.png')});await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await normal.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  const summary=card.locator(':scope > summary');await summary.click({position:{x:25,y:20}});await until(async()=>!await card.evaluate(el=>el.open));await summary.press('Enter');await until(async()=>await card.evaluate(el=>el.open));assert.equal(await normal.isVisible(),true);
  await f.request('POST','/api/config',{allow:{groups:[],allGroups:false},allowAllWhenEmpty:false});await frame.locator('#reload').click();await frame.locator('#status').filter({hasText:'配置已读取'}).waitFor();await settingsSection(frame,'chat');assert.equal(await card.locator('.activity-group-buttons > button').count(),1);assert.equal(await globalPick.getAttribute('aria-pressed'),'true');await normal.press('Home');await commit.click();await until(()=>f.disk().store.contextSliderPos===0);assert.deepEqual(f.disk().store.groupSliderPos,savedOverrides);checks.push('an empty whitelist still exposes an editable global target and retains stored group overrides');
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);checks.push('narrow layout, reduced motion and accessible folding work; isolated page has no script errors or external traffic');
  console.log(checks.map(value=>'✓ 267 '+value).join('\n'));if(evidence)fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,headed:process.env.QA_HEADED==='1',checks,errors:f.errors,externalRequests:f.outbound(),liveConsoleAccessed:false},null,2)+'\n');
}catch(error){if(evidence)await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});throw error;}finally{await f.close();}

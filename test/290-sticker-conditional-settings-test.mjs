import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {settingsSection,openSettingsFold} from './settings-navigation.mjs';

const evidence=process.env.QA290_EVIDENCE,checks=[];
if(evidence)fs.mkdirSync(evidence,{recursive:true});
const f=await modelUiFixture({config:{sticker:{enabled:false,collectEnabled:true,promptMaxStickers:12,maxCollectPerHour:0}}}),{page,frame}=f;
const pairs=[['enabled','promptMaxStickers','sticker-context-options'],['collectEnabled','maxCollectPerHour','sticker-collect-options']];
const until=async check=>{for(let i=0;i<120;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('Sticker save did not settle');};
const settle=()=>frame.locator('body').evaluate(async()=>{
  await document.fonts.ready;let idle=0;
  for(let i=0;i<180;i++){await new Promise(requestAnimationFrame);if(!document.querySelector('[data-conditional-phase]')&&!document.getAnimations().some(a=>a.effect?.getTiming().iterations!==Infinity&&(a.playState==='running'||a.pending))){if(++idle===2)return;}else idle=0;}
  throw Error('Sticker reveal did not settle');
});
try{
  await settingsSection(frame,'chat');await openSettingsFold(frame,'layout-sticker');await settle();
  assert.equal(await frame.locator('#sticker-context-options').isHidden(),true);assert.equal(await frame.locator('#sticker-collect-options').isVisible(),true);
  for(const width of [1360,560,400]){
    await page.setViewportSize({width,height:1000});await settle();
    for(const[key,quantity,id]of pairs){
      const input=frame.locator(`#field-sticker-${key}`),option=frame.locator('#'+id),other=frame.locator('#'+(id==='sticker-context-options'?'sticker-collect-options':'sticker-context-options'));
      assert.equal(await input.getAttribute('aria-controls'),id);
      const original=await input.isChecked(),otherVisible=await other.isVisible(),saved=f.disk().sticker[quantity];
      await input.setChecked(false);await option.waitFor({state:'hidden'});await until(()=>f.disk().sticker[key]===false);
      assert.equal(await option.locator('input').inputValue(),String(saved));assert.equal(await other.isVisible(),otherVisible);
      await input.evaluate(input=>{window.stickerReveal=new Promise(resolve=>input.addEventListener('change',()=>{const option=document.getElementById(input.getAttribute('aria-controls')),frames=[];function sample(){const s=getComputedStyle(option),animation=option.getAnimations().find(a=>a.animationName==='memory-cooldown-appear');frames.push({x:new DOMMatrixReadOnly(s.transform).e,opacity:Number(s.opacity),phase:option.dataset.conditionalPhase});if(animation&&(animation.playState==='running'||animation.pending))requestAnimationFrame(sample);else resolve(frames);}sample();},{once:true}));});
      await input.press('Space');const frames=await input.evaluate(()=>window.stickerReveal);await settle();
      assert.ok(frames.length>3);assert.ok(frames[0].x<=-16);assert.equal(frames.at(-1).x,0);assert.equal(frames.at(-1).opacity,1);
      assert.ok(frames.every((value,i)=>!i||value.x>=frames[i-1].x-.01),'reveals left to right');assert.equal(await other.isVisible(),otherVisible);
      await until(()=>f.disk().sticker[key]===true);assert.equal(f.disk().sticker[quantity],saved);
      const layout=await option.evaluate(el=>{const toggle=el.parentElement.querySelector('.sticker-card-toggle'),a=toggle.getBoundingClientRect(),b=el.getBoundingClientRect();return{gap:b.left-a.right,width:b.width,toggleHeight:a.height};});assert.ok(layout.gap>=14&&layout.gap<=40);assert.ok(layout.width<=181);assert.equal(layout.toggleHeight,44);
      checks.push({width,key,layout,frames});if(evidence)await frame.locator('[data-settings-group="layout-sticker"]').screenshot({path:path.join(evidence,width+'-'+key+'.png')});
      await input.setChecked(original);await settle();await until(()=>f.disk().sticker[key]===original);
    }
    assert.ok(await frame.locator('html').evaluate(el=>el.scrollWidth-el.clientWidth)<=1);
  }
  await frame.locator('#field-sticker-enabled').check();await frame.locator('#field-sticker-promptMaxStickers').fill('17');await until(()=>f.disk().sticker.promptMaxStickers===17);await frame.locator('#field-sticker-enabled').uncheck();await frame.locator('#sticker-context-options').waitFor({state:'hidden'});await until(()=>!f.disk().sticker.enabled);
  await frame.locator('#reload').click();await frame.locator('#status').filter({hasText:'配置已读取'}).waitFor();await settingsSection(frame,'chat');await openSettingsFold(frame,'layout-sticker');assert.equal(await frame.locator('#sticker-context-options').isHidden(),true);
  await frame.locator('#field-sticker-enabled').check();await frame.locator('#field-sticker-promptMaxStickers').waitFor({state:'visible'});assert.equal(await frame.locator('#field-sticker-promptMaxStickers').inputValue(),'17');assert.equal(f.disk().sticker.maxCollectPerHour,0);
  await page.emulateMedia({reducedMotion:'reduce'});await frame.locator('#field-sticker-collectEnabled').uncheck();assert.equal(await frame.locator('#sticker-collect-options').isHidden(),true);await frame.locator('#field-sticker-collectEnabled').check();assert.equal(await frame.locator('#sticker-collect-options').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);console.log('✓ 290 both sticker options independently reveal left to right at 3 widths; quantities including zero survive toggle/save/reread; reduced motion and native keyboard controls work');
}catch(error){if(evidence)await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});throw error;}
finally{if(evidence)fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({checks:checks.length,results:checks},null,2));await f.close();}

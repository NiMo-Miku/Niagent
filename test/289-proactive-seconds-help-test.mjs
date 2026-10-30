import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {settingsSection} from './settings-navigation.mjs';
import {PROACTIVE_SETTING_HELP} from '../ui/panels/settings/send-settings.js';

const evidence=process.env.QA289_EVIDENCE,results=[];
if(evidence)fs.mkdirSync(evidence,{recursive:true});
const initial={enabled:true,probability:.25,idleThresholdMs:1800123,checkIntervalMinMs:90001,checkIntervalMaxMs:120345};
const f=await modelUiFixture({config:{proactive:initial}}),{page,frame}=f;
const input=key=>frame.locator('#field-proactive-'+key),options=frame.locator('#proactive-options'),toggle=frame.getByRole('switch',{name:'启用主动开话题',exact:true});
const until=async check=>{for(let i=0;i<150;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('Proactive save did not settle');};
const settle=()=>frame.locator('body').evaluate(async()=>{
  await document.fonts.ready;let idle=0;
  for(let i=0;i<180;i++){await new Promise(requestAnimationFrame);if(!document.querySelector('[data-conditional-phase]')&&!document.getAnimations().some(a=>a.effect?.getTiming().iterations!==Infinity&&(a.playState==='running'||a.pending))){if(++idle===2)return;}else idle=0;}
  throw Error('Proactive layout did not settle');
});
try{
  await settingsSection(frame,'active');await settle();
  assert.deepEqual(await options.locator('[data-config-path]').evaluateAll(els=>els.map(el=>el.dataset.configPath).sort()),Object.keys(PROACTIVE_SETTING_HELP).sort());
  for(const[key,seconds]of [['idleThresholdMs','1800.123'],['checkIntervalMinMs','90.001'],['checkIntervalMaxMs','120.345']])assert.equal(await input(key).inputValue(),seconds,'existing milliseconds display as seconds');
  for(const width of [1360,560,400]){
    await page.setViewportSize({width,height:1000});await settle();
    const boxes=await options.locator('.send-setting-row').evaluateAll(rows=>rows.map(row=>{const r=row.getBoundingClientRect(),name=row.querySelector('.send-setting-name').getBoundingClientRect(),control=row.querySelector('.send-setting-control').getBoundingClientRect();return{top:r.top,bottom:r.bottom,nameRight:name.right,inputLeft:control.left,inputWidth:control.width};}));
    assert.equal(boxes.length,4);assert.ok(boxes.every((b,i)=>b.inputLeft>b.nameRight+4&&b.inputWidth<=194&&(!i||b.top>=boxes[i-1].bottom+8)),'four distinct compact rows');
    for(const key of Object.keys(PROACTIVE_SETTING_HELP)){
      const help=options.locator(`[data-help-path="${key}"]`);await help.scrollIntoViewIfNeeded();await settle();await help.hover();
      const tip=frame.locator('#proactive-setting-tooltip');await tip.waitFor({state:'visible'});assert.equal(await tip.locator('p').textContent(),PROACTIVE_SETTING_HELP[key]);
      assert.equal(await help.getAttribute('aria-describedby'),'proactive-setting-tooltip');
      const bounds=await tip.evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};});assert.ok(bounds.left>=0&&bounds.right<=bounds.width+1&&bounds.top>=0&&bounds.bottom<=bounds.height+1);
      if(key==='proactive.idleThresholdMs'&&evidence)await page.screenshot({path:path.join(evidence,width+'-help.png'),fullPage:true});
      results.push({width,key,...bounds});await help.focus();await help.press('Escape');await tip.waitFor({state:'hidden'});await page.mouse.move(0,0);
    }
    assert.ok(await frame.locator('html').evaluate(el=>el.scrollWidth-el.clientWidth)<=1);
  }
  assert.deepEqual(f.disk().proactive,initial,'viewing explanations never writes or converts saved data');
  await page.setViewportSize({width:1360,height:1000});
  for(const[key,invalid,value,ms]of [['idleThresholdMs','299.999','300.125',300125],['checkIntervalMinMs','59.999','60.25',60250],['checkIntervalMaxMs','59.999','90.5',90500]]){
    assert.match(await input(key).getAttribute('aria-labelledby'),/^send-label-/);await input(key).fill(invalid);assert.equal(await input(key).getAttribute('aria-invalid'),'true');assert.equal(f.disk().proactive[key],initial[key]);
    await input(key).fill(value);await until(()=>f.disk().proactive[key]===ms);assert.equal(await input(key).getAttribute('aria-invalid'),null);
  }
  await input('probability').fill('.4');await until(()=>f.disk().proactive.probability===.4);const saved=structuredClone(f.disk().proactive);
  const help=options.locator('[data-help-path="proactive.probability"]');await help.focus();await frame.locator('#proactive-setting-tooltip').waitFor({state:'visible'});
  await toggle.click();await frame.locator('#proactive-setting-tooltip').waitFor({state:'hidden'});await options.waitFor({state:'hidden'});await until(()=>f.disk().proactive.enabled===false);
  assert.deepEqual({...f.disk().proactive,enabled:true},saved);await toggle.press('Space');await options.waitFor({state:'visible'});await until(()=>f.disk().proactive.enabled===true);
  await frame.locator('#reload').click();await frame.locator('#status').filter({hasText:'配置已读取'}).waitFor();await settingsSection(frame,'active');
  assert.deepEqual(await Promise.all(['probability','idleThresholdMs','checkIntervalMinMs','checkIntervalMaxMs'].map(key=>input(key).inputValue())),['0.4','300.125','60.25','90.5']);
  assert.deepEqual(f.disk().proactive,saved);assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);
  console.log('✓ 289 four compact rows, '+results.length+' tooltip checks; exact millisecond/second round trips, fractional seconds, minimum validation, probability and toggle/reread preservation');
}catch(error){if(evidence)await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});throw error;}
finally{if(evidence)fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({checks:results.length,results},null,2));await f.close();}

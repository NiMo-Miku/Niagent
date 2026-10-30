import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {settingsSection} from './settings-navigation.mjs';
import {SEND_SETTING_HELP} from '../ui/panels/settings/send-settings.js';

const evidence=process.env.QA288_EVIDENCE,results=[];
if(evidence)fs.mkdirSync(evidence,{recursive:true});
const f=await modelUiFixture(),{page,frame}=f;
const settle=()=>frame.locator('body').evaluate(async()=>{
  await document.fonts.ready;
  for(let i=0;i<180;i++){await new Promise(requestAnimationFrame);if(!document.getAnimations().some(a=>a.effect?.getTiming().iterations!==Infinity&&(a.playState==='running'||a.pending)))return;}
  throw Error('Send settings motion did not settle');
});
const until=async check=>{for(let i=0;i<100;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('Save did not settle');};
try{
  await settingsSection(frame,'send');const host=frame.locator('#section-send.send-config');
  for(const detail of await host.locator('details').all())if(!await detail.evaluate(el=>el.open))await detail.locator(':scope > summary').click();
  await settle();
  const paths=await host.locator('[data-config-path]').evaluateAll(els=>els.map(el=>el.dataset.configPath).sort());
  assert.deepEqual(paths,Object.keys(SEND_SETTING_HELP).sort());assert.equal(paths.length,21);
  const before=structuredClone(f.disk()),tooltip=frame.getByRole('tooltip');
  for(const width of [1360,560,400]){
    await page.setViewportSize({width,height:1000});await settle();
    for(const key of paths){
      const row=host.locator(`[data-send-setting="${key}"]`),help=row.locator('.send-setting-help');
      await help.scrollIntoViewIfNeeded();await settle();await help.hover();await tooltip.waitFor({state:'visible'});
      const geometry=await row.evaluate(row=>{
        const b=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        const help=row.querySelector('.send-setting-help'),input=row.querySelector('[data-config-path]'),tip=document.querySelector('.send-setting-tooltip');
        return{name:b(row.querySelector('.send-setting-name')),control:b(row.querySelector('.send-setting-control')),help:b(help),tip:b(tip),w:innerWidth,h:innerHeight,label:document.getElementById(input.getAttribute('aria-labelledby'))?.textContent,hit:document.elementFromPoint(help.getBoundingClientRect().x+10,help.getBoundingClientRect().y+10)?.closest('button')===help};
      });
      assert.ok(geometry.control.x>=geometry.name.right+5,key+' has separate name and control columns');
      assert.ok(geometry.control.width<=194,key+' uses a compact control');assert.ok(geometry.label);assert.ok(geometry.hit,key+' help remains clickable');
      assert.ok(geometry.tip.width>150&&geometry.tip.height>45,key+' has readable help');
      assert.ok(geometry.tip.x>=0&&geometry.tip.right<=geometry.w+1&&geometry.tip.y>=0&&geometry.tip.bottom<=geometry.h+1,key+' help stays inside viewport');
      assert.ok(geometry.tip.y>=geometry.help.bottom+6||geometry.tip.bottom<=geometry.help.y-6,key+' help does not cover its trigger');
      assert.equal(await tooltip.locator('p').textContent(),SEND_SETTING_HELP[key]);
      results.push({width,key,...geometry});
      if(key==='api.temperature'&&evidence)await page.screenshot({path:path.join(evidence,`${width}-help.png`),fullPage:true});
      await page.mouse.move(0,0);await help.focus();await help.press('Escape');await tooltip.waitFor({state:'hidden'});
    }
    assert.ok(await frame.locator('html').evaluate(el=>el.scrollWidth-el.clientWidth)<=1,'no horizontal page overflow');
  }
  assert.deepEqual(f.disk(),before,'reading help never changes configuration');
  await page.setViewportSize({width:1360,height:1000});await settingsSection(frame,'send');
  const temperature=host.locator('[data-config-path="api.temperature"]');await temperature.fill('0.6');
  await until(()=>f.disk().api.temperature===.6);
  const timeout=host.locator('[data-config-path="api.timeoutMs"]');await timeout.fill('1');
  await host.locator('[data-send-setting="api.timeoutMs"] .field-error').waitFor({state:'visible'});assert.equal(f.disk().api.timeoutMs,before.api.timeoutMs);await timeout.fill('90000');await until(()=>f.disk().api.timeoutMs===90000);
  const anchor=host.locator('[data-config-path="store.promptAnchor.enabled"]');
  if(!await anchor.isVisible())await host.locator('details[data-settings-group="send-archive"] > summary').click();
  await anchor.setChecked(!before.store.promptAnchor.enabled);await until(()=>f.disk().store.promptAnchor.enabled===!before.store.promptAnchor.enabled);
  const help=host.locator('[data-help-path="api.temperature"]');await help.focus();await tooltip.waitFor({state:'visible'});await help.press('Tab');await tooltip.waitFor({state:'hidden'});
  await help.hover();await tooltip.waitFor({state:'visible'});await frame.locator('[data-settings-group="layout-send"] > summary').click();await tooltip.waitFor({state:'hidden'});
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);
  console.log('✓ 288 21 compact rows and '+results.length+' wide/narrow tooltip checks; hover/keyboard/Escape, viewport edges, validation and original autosave/checkbox bindings preserved');
}catch(error){if(evidence)await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});throw error;}
finally{if(evidence)fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({checks:results.length,results},null,2));await f.close();}

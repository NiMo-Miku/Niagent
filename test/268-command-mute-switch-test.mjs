import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {settingsSection,openSettingsFold} from './settings-navigation.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),until=async check=>{for(let i=0;i<300;i++){if(await check())return;await pause(20);}throw Error('268 did not settle');};
const evidence=process.env.QA268_EVIDENCE;if(evidence)fs.mkdirSync(evidence,{recursive:true});
const initial={enabled:false,command:'/合成安静',durationMin:30,active:{10001:0,10002:12345}},checks=[];
const f=await modelUiFixture({config:{commandMute:initial}}),{page,frame}=f;
const fold=frame.locator('[data-settings-group="layout-mute"]'),toggle=fold.getByRole('switch',{name:'启用群指令安静模式',exact:true});
const input=key=>frame.locator(`[data-config-path="commandMute.${key}"]`),options=fold.locator('#command-mute-options');
async function visible(value){await options.waitFor({state:value?'visible':'hidden'});assert.equal(await options.isVisible(),value);for(const key of ['command','durationMin'])assert.equal(await input(key).isVisible(),value,key);assert.equal(await fold.locator('.quiet-chat-view').isVisible(),value);assert.equal(await input('active').isHidden(),true);}
async function shot(name){if(evidence)await fold.screenshot({path:path.join(evidence,name+'.png')});}
async function style(state){const value=await toggle.evaluate((el,token)=>{const s=getComputedStyle(el);return{state:s.getPropertyValue('--mute-state').trim(),theme:s.getPropertyValue(token).trim(),border:s.borderTopColor,shadow:s.boxShadow};},state);assert.equal(value.state,value.theme);assert.match(value.shadow,/inset/);return value;}
try{
  await settingsSection(frame,'chat');await openSettingsFold(frame,'layout-mute');
  const paths=JSON.parse(fs.readFileSync(new URL('./settings-structure-fields.json',import.meta.url),'utf8')).paths;
  assert.deepEqual(await frame.locator('[data-config-path]').evaluateAll(els=>els.map(el=>el.dataset.configPath).sort()),paths);
  assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.equal(await input('enabled').isHidden(),true);assert.equal(await fold.locator('input[type=checkbox]:visible').count(),0);assert.equal(await toggle.innerText(),'启用群指令安静模式');assert.equal(await toggle.getAttribute('aria-controls'),'command-mute-options');await visible(false);
  const off=await style('--bad');assert.equal(f.kernel.orchestrator.storeConfigForChat('group:10001',false).commandMuteTier,null);await shot('disabled');
  // The whole frame, including its edge padding, is the native switch button.
  await toggle.click({position:{x:6,y:6}});await visible(true);await until(()=>f.disk().commandMute.enabled===true);assert.equal(await toggle.getAttribute('aria-checked'),'true');
  const on=await style('--good');assert.notEqual(on.border,off.border);assert.equal(f.kernel.orchestrator.storeConfigForChat('group:10001',false).commandMuteTier,1);assert.equal(f.kernel.orchestrator.storeConfigForChat('private:10001',true).commandMuteTier,null);await shot('enabled');
  checks.push('whole frame and edge padding toggle saved group mute; theme success/danger border and inset glow; hidden native control retains the complete field inventory');
  await input('command').fill('/请安静');await input('durationMin').fill('0');await frame.locator('#save').click();await until(()=>f.disk().commandMute.command==='/请安静'&&f.disk().commandMute.durationMin===0);
  await toggle.focus();await page.keyboard.press('Space');await visible(false);await until(()=>f.disk().commandMute.enabled===false);assert.equal(f.kernel.orchestrator.storeConfigForChat('group:10001',false).commandMuteTier,null);assert.deepEqual(f.disk().commandMute,{enabled:false,command:'/请安静',durationMin:0,active:{10001:0,10002:12345}});
  await toggle.focus();await page.keyboard.press('Enter');await until(()=>f.disk().commandMute.enabled===true);await visible(true);assert.equal(await input('command').inputValue(),'/请安静');assert.equal(await input('durationMin').inputValue(),'0');assert.deepEqual(JSON.parse(await input('active').inputValue()),{10001:0,10002:12345});
  checks.push('Space/Enter switch access works; hiding preserves command, permanent duration and exact active-group map; enabling restores the saved fields and actual mute policy');
  await toggle.click();await until(()=>f.disk().commandMute.enabled===false);
  await page.route(f.base+'/api/config/lifecycle',route=>route.fulfill({status:503,json:{error:'synthetic mute save failure'}}));await toggle.click();await frame.locator('#status.field-error').filter({hasText:'synthetic mute save failure'}).waitFor();assert.equal(f.disk().commandMute.enabled,false);assert.equal(await toggle.getAttribute('aria-checked'),'true');await visible(true);assert.deepEqual(f.disk().commandMute.active,{10001:0,10002:12345});
  await page.unroute(f.base+'/api/config/lifecycle');await frame.locator('#save').click();await until(()=>f.disk().commandMute.enabled===true);
  await frame.locator('#reload').click();await frame.locator('#status').filter({hasText:'配置已读取'}).waitFor();await settingsSection(frame,'chat');await openSettingsFold(frame,'layout-mute');await visible(true);assert.equal(await toggle.getAttribute('aria-checked'),'true');
  await toggle.click();await until(()=>f.disk().commandMute.enabled===false);await frame.locator('#reload').click();await frame.locator('#status').filter({hasText:'配置已读取'}).waitFor();await settingsSection(frame,'chat');await openSettingsFold(frame,'layout-mute');await visible(false);
  await page.setViewportSize({width:560,height:900});assert.ok(await frame.locator('body').evaluate(el=>el.ownerDocument.documentElement.scrollWidth-el.ownerDocument.documentElement.clientWidth)<=1);await shot('narrow-disabled');
  await toggle.click();await until(()=>f.disk().commandMute.enabled===true);await visible(true);assert.ok(await fold.evaluate(el=>el.scrollWidth-el.clientWidth)<=1);await shot('narrow-enabled');
  checks.push('failed save retains a retryable UI draft; real reread restores both visibility states; 560px layout fits without dropping hidden values');
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);console.log(checks.map(item=>'✓ 268 '+item).join('\n'));
  if(evidence)fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,headed:process.env.QA_HEADED==='1',checks,errors:f.errors,externalRequests:f.outbound(),liveConsoleAccessed:false},null,2)+'\n');
}catch(error){if(evidence)await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});throw error;}finally{await f.close();}

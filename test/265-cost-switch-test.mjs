import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {financeFixture,workspace,until} from './settings-finance-fixture.mjs';
import {settingsEditor,settingsPickModel} from './settings-navigation.mjs';

const f=await financeFixture(265),result={kind:'isolated-cost-switch',headed:process.env.QA_HEADED==='1'};
const artifacts=path.join(workspace,'.qa-local/cost-switch-20261019',result.headed?'headed':'headless');fs.mkdirSync(artifacts,{recursive:true});let release;
const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Cost UI gate timed out')),10000))]);}finally{clearTimeout(timer);}};
try{
  await f.start(true);f.kernel.config.update({api:{provider:'cost265',useOfficialPrice:false,modelPrices:{'qa-free265':{in:0,out:0,cached:0}}},providers:[{id:'cost265',displayName:'合成价格渠道',baseUrl:'http://127.0.0.1:9/v1',models:['deepseek-chat','qa-free265','qa-unpriced265','qa-feed228']}],dshProviderKeys:{cost265:'synthetic-cost-key'}});
  await f.browser();await f.open();await f.section('prices');
  const frame=f.frame,view=frame.locator('.cost-view'),toggle=()=>view.getByRole('switch',{name:'使用远程价格表及内置参考价'}),summary=()=>view.locator('.cost-price-summary'),manual=()=>view.locator('.cost-manual-fields');
  const input=id=>frame.locator(`[data-config-path="api.${id}"]`),waitQuote=async()=>{await summary().locator('[data-cost-rate=in]').filter({hasText:/^(?!—).+/}).waitFor();assert.equal(await summary().getAttribute('aria-busy'),'false');};
  const pick=async id=>{await settingsEditor(frame,'model-config');await settingsPickModel(frame,'main','cost265',id);await frame.locator('dialog[data-settings-editor=model-config] .settings-dialog-head button').click();await f.section('prices');};
  assert.equal(await toggle().getAttribute('aria-checked'),'false');assert.equal(await summary().isVisible(),false);assert.equal(await view.locator('input[type=checkbox]:visible').count(),0);assert.equal(await toggle().innerText(),'使用远程价格表及内置参考价');assert.equal(await manual().locator('input:visible').count(),3);
  const off=await toggle().evaluate(el=>{const s=getComputedStyle(el);return{state:s.getPropertyValue('--cost-state').trim(),theme:s.getPropertyValue('--bad').trim(),border:s.borderTopColor,shadow:s.boxShadow};});assert.equal(off.state,off.theme);assert.match(off.shadow,/inset/);
  await toggle().focus();await f.page.keyboard.press('Enter');await until(()=>f.disk().api.useOfficialPrice===true);await waitQuote();
  await manual().waitFor({state:'hidden'});assert.equal(await manual().isVisible(),false);assert.equal(await input('useOfficialPrice').isVisible(),false);
  const quote=(await f.api('GET','/api/model-prices?model=deepseek-chat')).body.current;
  for(const key of ['in','out','cached'])assert.equal(await summary().locator(`[data-cost-rate=${key}]`).innerText(),String(quote[key]));
  assert.match(await summary().innerText(),/内置参考价/);
  const on=await toggle().evaluate(el=>{const s=getComputedStyle(el);return{state:s.getPropertyValue('--cost-state').trim(),theme:s.getPropertyValue('--good').trim(),border:s.borderTopColor,shadow:s.boxShadow};});assert.equal(on.state,on.theme);assert.notEqual(on.border,off.border);assert.match(on.shadow,/inset/);
  await view.screenshot({path:path.join(artifacts,'enabled.png')});
  await toggle().focus();await f.page.keyboard.press('Space');await until(()=>f.disk().api.useOfficialPrice===false);assert.equal(await manual().isVisible(),true);assert.equal(await input('priceInputPerM').inputValue(),'6');
  for(const[key,value]of [['priceInputPerM','8'],['priceOutputPerM','9'],['priceCachedPerM','0.5']])await input(key).fill(value);await frame.locator('#save').click();await until(()=>f.disk().api.priceInputPerM===8&&f.disk().api.priceCachedPerM===0.5);
  await view.screenshot({path:path.join(artifacts,'disabled.png')});await toggle().click();await until(()=>f.disk().api.useOfficialPrice===true);await waitQuote();assert.equal(f.disk().api.priceInputPerM,8);assert.equal(await input('priceInputPerM').inputValue(),'8');
  f.check('full native switch supports Enter/Space, theme success/danger border and inset glow; enabled replaces inputs with real quote; manual drafts and persisted prices survive both directions');

  await pick('qa-free265');await waitQuote();for(const key of ['in','out','cached'])assert.equal(await summary().locator(`[data-cost-rate=${key}]`).innerText(),'0');assert.match(await summary().innerText(),/自定义价格/);
  await pick('qa-unpriced265');await waitQuote();assert.match(await summary().innerText(),/手填单价/);assert.equal(await summary().locator('[data-cost-rate=in]').innerText(),'8');assert.equal(await summary().locator('[data-cost-rate=cached]').innerText(),'0.5');
  await pick('qa-feed228');await waitQuote();assert.equal(await summary().locator('[data-cost-rate=in]').innerText(),'8');f.feed('ready');await frame.getByRole('button',{name:'拉取最新价格表',exact:true}).click();await summary().locator('[data-cost-rate=in]').filter({hasText:'3'}).waitFor();assert.equal(await summary().locator('[data-cost-rate=cached]').innerText(),'0');assert.match(await summary().innerText(),/远程价格/);
  f.check('model picker refreshes exact quote; custom free price, unmatched manual fallback and synthetic remote refresh preserve actual backend precedence');

  await toggle().click();await until(()=>f.disk().api.useOfficialPrice===false);f.fault(true);await toggle().click();await frame.locator('#status.field-error').waitFor();assert.equal(f.disk().api.useOfficialPrice,false);assert.equal(await summary().locator('[data-cost-rate=in]').innerText(),'—');assert.match(await summary().innerText(),/尚未保存/);
  f.fault(false);await frame.locator('#save').click();await until(()=>f.disk().api.useOfficialPrice===true);await waitQuote();
  await f.page.route(f.base+'/api/model-prices?model=qa-feed228',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'synthetic quote unavailable'})}));
  await frame.getByRole('button',{name:'查看当前价格表',exact:true}).click();await summary().locator('.cost-price-feedback').filter({hasText:'价格读取失败'}).waitFor();assert.equal(await summary().locator('[data-cost-rate=in]').innerText(),'—');await f.page.unroute(f.base+'/api/model-prices?model=qa-feed228');
  let entered;const began=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  await f.page.route(f.base+'/api/model-prices?model=qa-feed228',async route=>{const response=await route.fetch();entered();await gate;await route.fulfill({response});});
  await frame.getByRole('button',{name:'查看当前价格表',exact:true}).click();await bounded(began);await toggle().click();await until(()=>f.disk().api.useOfficialPrice===false);release();release=null;await f.page.unroute(f.base+'/api/model-prices?model=qa-feed228');await summary().waitFor({state:'hidden'});assert.equal(await summary().isVisible(),false);assert.equal(await manual().isVisible(),true);
  await toggle().click();await until(()=>f.disk().api.useOfficialPrice===true);await waitQuote();await f.returnSettings();await f.section('prices');await waitQuote();assert.equal(await toggle().getAttribute('aria-checked'),'true');assert.equal(await input('priceInputPerM').inputValue(),'8');
  await f.page.setViewportSize({width:680,height:860});await view.screenshot({path:path.join(artifacts,'narrow.png')});assert.equal(await view.evaluate(el=>el.getBoundingClientRect().right<=el.ownerDocument.documentElement.clientWidth+1),true);
  f.check('failed save waits for retry before showing effective quote; HTTP error shows unknown rates; late reply cannot restore disabled summary; page round trip and narrow layout preserve state');
  assert.deepEqual(f.errors,[]);assert.deepEqual(f.blocked,[]);result.execution='passed';
}catch(error){result.execution='failed';result.error={message:error.message,stack:error.stack};throw error;}
finally{release?.();await f.close(result);fs.writeFileSync(path.join(artifacts,'result.json'),JSON.stringify(result,null,2)+'\n');}

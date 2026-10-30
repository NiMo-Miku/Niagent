import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {financeFixture,workspace} from './settings-finance-fixture.mjs';

const f=await financeFixture(264),result={kind:'isolated-price-table-presentation',headed:process.env.QA_HEADED==='1'};
const artifacts=path.join(workspace,'.qa-local/price-table-20261019',result.headed?'headed':'headless');fs.mkdirSync(artifacts,{recursive:true});
let release;
try{
  await f.start(true);
  f.kernel.config.update({api:{model:'qa-zero264',modelPrices:{'qa-zero264':{in:0,out:3,cached:null,note:'<img src=x onerror=alert(1)> 合成零价说明'}}}});
  await f.browser();await f.open();await f.section('prices');
  const frame=f.frame,view=frame.locator('.price-table-view'),search=view.getByRole('searchbox',{name:'搜索价格表'}),read=()=>frame.getByRole('button',{name:'查看当前价格表',exact:true}),refresh=()=>frame.getByRole('button',{name:'拉取最新价格表',exact:true});
  const disk=fs.readFileSync(f.kernel.config.file,'utf8');
  assert.equal(await view.isVisible(),false);await read().click();await view.locator('tbody [data-price-model="qa-zero264"]').waitFor();
  const data=(await f.api('GET','/api/model-prices')).body;
  assert.equal(await view.locator('thead th').allTextContents().then(values=>values.join('|')),'模型 ID|输入|输出|缓存输入|来源|说明');
  assert.equal(await view.locator('tbody tr[data-price-model]').count(),data.prices.length);assert.equal(await view.locator('pre').count(),0);
  const zero=view.locator('[data-price-model="qa-zero264"]');assert.equal(await zero.locator('td').nth(0).innerText(),'0');assert.equal(await zero.locator('td').nth(2).innerText(),'随输入计价');assert.match(await zero.innerText(),/自定义/);assert.equal(await view.locator('tbody tr').first().getAttribute('data-price-model'),'qa-zero264');assert.match(await view.locator('.price-table-current').innerText(),/输入 0/);
  await zero.getByText('查看说明',{exact:true}).click();assert.match(await zero.innerText(),/<img src=x/);assert.equal(await view.locator('img').count(),0);
  await search.fill('deepseek-flash');const flash=view.locator('[data-price-model="deepseek-flash"]');assert.match(await flash.locator('td').nth(0).innerText(),/高峰 2/);await flash.getByText('查看说明',{exact:true}).click();assert.match(await flash.innerText(),/1024 Token/);assert.match(await flash.innerText(),/内置参考价/);
  await search.fill('qwen3.8-max');const pixel=view.locator('[data-price-model="qwen3.8-max"]');await pixel.getByText('查看说明',{exact:true}).click();assert.match(await pixel.innerText(),/像素数 ÷ 1024 \+ 2/);assert.match(await pixel.innerText(),/推算参考/);
  await search.fill('does-not-exist264');await view.getByText('没有匹配的模型',{exact:true}).waitFor();assert.equal(await view.locator('tbody tr[data-price-model]').count(),0);
  await search.fill('');await view.screenshot({path:path.join(artifacts,'price-table.png')});
  f.check('real snapshot renders all rows, readable source/units, current custom zero, cache fallback, peak/image details, safe text and search/empty state');

  f.feed('ready');await refresh().click();await view.locator('.price-table-status').filter({hasText:'价格表已更新'}).waitFor();
  await search.fill('qa-feed228');await view.locator('[data-price-model="qa-feed228"]').waitFor();assert.match(await view.innerText(),/远程价格/);assert.match(await view.locator('.price-table-meta').innerText(),/远程更新/);
  f.feed('offline');await refresh().click();await view.locator('.price-table-status').filter({hasText:'更新失败'}).waitFor();assert.equal(await search.inputValue(),'qa-feed228');assert.equal(await view.locator('[data-price-model="qa-feed228"]').count(),1);
  await f.page.route(f.base+'/api/model-prices',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'synthetic table unavailable'})}));
  await read().click();await view.locator('.price-table-status').filter({hasText:'已保留上次价格表'}).waitFor();assert.equal(await view.locator('[data-price-model="qa-feed228"]').count(),1);await f.page.unroute(f.base+'/api/model-prices');
  f.check('real synthetic refresh success and cached failure both remain tables; HTTP failure retains prior rows and filter');

  let started;const began=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  await f.page.route(f.base+'/api/model-prices',async route=>{const response=await route.fetch(),body=await response.json();body.prices=[{id:'stale-response264',in:999,out:999,cached:999}];started();await gate;await route.fulfill({response,json:body});});
  await read().click();await began;f.feed('ready');await refresh().click();await view.locator('.price-table-status').filter({hasText:'价格表已更新'}).waitFor();release();release=null;await read().waitFor({state:'visible'});await f.page.unroute(f.base+'/api/model-prices');
  await read().evaluate(async button=>{while(button.disabled)await new Promise(resolve=>setTimeout(resolve,10));});
  await search.fill('stale-response264');await view.getByText('没有匹配的模型',{exact:true}).waitFor();
  await search.fill('qa-');await f.page.setViewportSize({width:680,height:860});await view.screenshot({path:path.join(artifacts,'price-table-narrow.png')});
  assert.equal(await view.evaluate(el=>el.getBoundingClientRect().right<=el.ownerDocument.documentElement.clientWidth+1),true);
  const scroll=view.locator('.price-table-scroll');assert.equal(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth),true);await scroll.focus();await f.page.keyboard.press('ArrowRight');
  assert.equal(fs.readFileSync(f.kernel.config.file,'utf8'),disk,'reading/search/refresh do not write configuration');
  f.check('late read cannot overwrite a newer refresh; narrow table scrolls within the panel; all actions leave saved configuration unchanged');
  assert.deepEqual(f.errors,[]);assert.deepEqual(f.blocked,[]);result.execution='passed';
}catch(error){result.execution='failed';result.error={message:error.message,stack:error.stack};throw error;}
finally{release?.();await f.close(result);fs.writeFileSync(path.join(artifacts,'result.json'),JSON.stringify(result,null,2)+'\n');}

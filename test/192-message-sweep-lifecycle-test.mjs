import assert from 'node:assert/strict';
import {modelUiFixture} from './model-ui-fixture.mjs';
const f=await modelUiFixture();
try {
  for(const group of [19201,19202])for(let i=1;i<=3;i++)f.kernel.store.appendIncoming(`group:${group}`,{mid:group*10+i,senderId:'19200',text:`sweep-${group}-${i}`,ts:Date.now()+i});
  await f.page.addInitScript(()=>{
    const up=window.__qaUp=new Set(),intervals=window.__qaIntervals=new Set(),add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window),start=window.setInterval.bind(window),stop=window.clearInterval.bind(window);
    window.addEventListener=(type,fn,...args)=>{if(type==='pointerup')up.add(fn);return add(type,fn,...args);};
    window.removeEventListener=(type,fn,...args)=>{if(type==='pointerup')up.delete(fn);return remove(type,fn,...args);};
    window.setInterval=(fn,delay,...args)=>{const id=start(fn,delay,...args);if(delay===1000)intervals.add(id);return id;};window.clearInterval=id=>{intervals.delete(id);return stop(id);};
  });
  await f.page.goto(f.base);await f.page.locator('#nav button[data-panel=chats]').click();
  const select=async group=>{await f.frame.locator(`[data-chat="group_${group}"]`).click();await f.frame.locator('.messages .message .body').filter({hasText:`sweep-${group}-1`}).waitFor();};
  await select(19201);const listeners=()=>f.frame.locator('body').evaluate(()=>window.__qaUp.size),baseline=await listeners();
  for(let i=0;i<8;i++)await select(i%2?19201:19202);
  assert.equal(await listeners(),baseline,'switching chats never accumulates window pointerup listeners');
  await f.frame.getByRole('button',{name:'选择消息',exact:true}).click();
  const row=index=>f.frame.locator('.messages .message .body').nth(index),check=index=>f.frame.locator('.messages .message input[type=checkbox]').nth(index);
  const point=async index=>{const r=await row(index).boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2};};
  let a=await point(0),b=await point(1);await f.page.mouse.move(a.x,a.y);await f.page.mouse.down();await f.page.mouse.move(b.x,b.y,{steps:5});await f.page.mouse.up();
  assert.equal(await check(0).isChecked(),true);assert.equal(await check(1).isChecked(),true);assert.equal(await check(2).isChecked(),false);
  for(const cancel of ['blur','pointercancel']) {
    await f.frame.getByRole('button',{name:'取消选择',exact:true}).click();a=await point(0);b=await point(1);await f.page.mouse.move(a.x,a.y);await f.page.mouse.down();
    if(cancel==='blur')await f.frame.locator('body').evaluate(()=>window.dispatchEvent(new Event('blur')));
    else await f.frame.locator('body').evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));
    await f.page.mouse.move(b.x,b.y,{steps:5});await f.page.mouse.up();assert.equal(await check(0).isChecked(),true);assert.equal(await check(1).isChecked(),false,`${cancel} ends the sweep`);
  }
  await f.frame.getByRole('button',{name:'取消选择',exact:true}).click();await check(0).click();assert.equal(await check(0).isChecked(),true,'native checkbox is not double toggled');
  await f.frame.locator('#test-send-text').fill('draft must stay editable');assert.equal(await f.frame.locator('.messages input:checked').count(),1);
  const disposition=await f.frame.locator('body').evaluate(async()=>{
    const {createMessageSweep}=await import(new URL('./message-sweep.js',document.baseURI));const before=window.__qaUp.size;
    const instance=createMessageSweep({root:document.createElement('div'),enabled:()=>true,changed(){}});const during=window.__qaUp.size;instance.dispose();instance.dispose();return{before,during,after:window.__qaUp.size};
  });
  assert.equal(disposition.during,disposition.before+1);assert.equal(disposition.after,disposition.before);
  await f.page.locator('#nav button[data-panel=memory]').click();await f.frame.locator('body[data-panel=memory] #meta').filter({hasText:'个记忆文件'}).waitFor();
  assert.equal(await f.frame.locator('body').evaluate(()=>window.__qaIntervals.size),0,'idle real memory panel has no one-second timer');
  assert.equal(f.writes.some(r=>r.path.includes('delete-messages')),false);assert.equal(f.outbound(),0);assert.deepEqual(f.errors,[]);
  console.log('✓ message sweep: stable delegated listeners, real mouse selection, native checkbox/input independence, blur/cancel cleanup, disposal; real idle memory owns no periodic timer');
} finally {await f.close();}

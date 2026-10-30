import {settingsSection,settingsReload} from './settings-navigation.mjs';
import assert from 'node:assert/strict';
import {modelUiFixture} from './model-ui-fixture.mjs';
const f=await modelUiFixture({nativeVisibility:process.env.QA_HEADED==='1'});let other;
const configBeforePresentation=structuredClone(f.kernel.config.get());
const group=()=>f.frame.locator('details[data-settings-group="persona-overrides"]');
const settled=()=>group().evaluate(async node=>{await Promise.allSettled(node.getAnimations().map(a=>a.finished));});
const detached=async handle=>{for(let i=0;i<250;i++){if(!await handle.evaluate(node=>node.isConnected))return;await new Promise(r=>setTimeout(r,20));}throw new Error('settings were not rebuilt: '+await f.frame.locator('#status').innerText());};
const pauseClose=()=>group().evaluate(node=>{node.querySelector('summary').click();const animation=node.getAnimations()[0];if(!animation)throw new Error('actual settings fold must animate');animation.pause();animation.currentTime=90;return{open:node.open,inert:node.querySelector('.settings-fields').inert};});
try {
  await f.page.emulateMedia({reducedMotion:'no-preference'});await settingsSection(f.frame,'persona');
  await group().locator('summary').click();await settled();assert.equal(await group().evaluate(n=>n.open),true);
  assert.deepEqual(await pauseClose(),{open:true,inert:true});
  const previous=await group().elementHandle();await settingsReload(f.frame);
  await detached(previous);await group().waitFor();
  assert.equal(await group().evaluate(n=>n.open),false,'settings reload preserves the closing target, not temporary native open');
  assert.equal(await group().evaluate(n=>n.getAnimations().length),0);assert.equal(await group().locator('.settings-fields').evaluate(n=>n.inert),false);
  await group().locator('summary').click();await settled();const opened=await group().elementHandle();await settingsReload(f.frame);await detached(opened);assert.equal(await group().evaluate(n=>n.open),true,'explicit expanded intent also survives reload');
  if(process.env.QA_HEADED==='1') {
    await pauseClose();other=await f.page.context().newPage();await other.goto('about:blank');await other.bringToFront();
    await f.page.waitForFunction(()=>document.hidden,undefined,{polling:100});
    assert.equal(await group().evaluate(n=>n.ownerDocument.hidden),true,'actual browser visibility, not a synthetic event');
    assert.deepEqual(await group().evaluate(n=>({open:n.open,animations:n.getAnimations().length,inert:n.querySelector('.settings-fields').inert,overflow:n.style.overflow})),{open:false,animations:0,inert:false,overflow:''});
    await f.page.bringToFront();await f.page.waitForFunction(()=>!document.hidden,undefined,{polling:100});assert.equal(await group().evaluate(n=>n.open),false);
  }
  await f.page.emulateMedia({reducedMotion:'reduce'});await group().locator('summary').click();assert.equal(await group().evaluate(n=>n.open),process.env.QA_HEADED==='1');assert.equal(await group().evaluate(n=>n.getAnimations().length),0);
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);assert.deepEqual(f.writes.filter(r=>r.path!=='/api/console/bootstrap'&&!(r.method==='POST'&&r.path==='/api/config/lifecycle/open')),[]);assert.deepEqual(f.kernel.config.get(),configBeforePresentation,'fold presentation preserves the complete config object');
  console.log('✓ settings folds: real reload of closing/open targets, focus-safe state and reduced motion; actual browser background cleanup '+(process.env.QA_HEADED==='1'?'verified':'is verified by the separate headed run'));
} finally {await other?.close();await f.close();}

import assert from 'node:assert/strict';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {settingsSection} from './settings-navigation.mjs';

const f=await modelUiFixture({config:{personaUnified:false}}),{page,frame}=f;
let release;const gate=new Promise(resolve=>release=resolve);let signal;const entered=new Promise(resolve=>signal=resolve);
const writes=[];let held=false,inFlight=0,maxInFlight=0,failNext=false;
await page.route(url=>['/api/config','/api/config/lifecycle'].includes(url.pathname),async route=>{
  if(route.request().method()!=='POST')return route.continue();
  const body=route.request().postDataJSON(),value=body.personaUnified??body.patch?.personaUnified;
  if(typeof value!=='boolean')return route.continue();
  writes.push(value);maxInFlight=Math.max(maxInFlight,++inFlight);
  try{
    if(failNext){failNext=false;return await route.fulfill({status:503,json:{error:'合成保存失败'}});}
    if(!held){held=true;signal();await gate;}
    await route.continue();
  }finally{inFlight--;}
});
const until=async predicate=>{for(let i=0;i<360;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,16));}throw Error('Persona state did not settle');};
try{
  await settingsSection(frame,'persona');const toggle=frame.locator('.persona-unified-toggle'),row=frame.locator('[data-persona-binding="group:10001"]');await row.waitFor();
  await toggle.click();let timer;try{await Promise.race([entered,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Save was not intercepted')),5000))]);}finally{clearTimeout(timer);}
  await toggle.press('Space');
  assert.equal(await toggle.getAttribute('aria-checked'),'false','last click is reflected before the first save returns');
  await row.waitFor();release();
  await until(()=>writes.length===2&&f.disk().personaUnified===false);
  assert.deepEqual(writes,[true,false]);assert.equal(maxInFlight,1);assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.equal(await row.isVisible(),true);
  // A failed write rolls back the optimistic presentation; it must not leave
  // the rows hidden forever or block a later successful toggle.
  failNext=true;await toggle.click();await frame.locator('.persona-library-feedback:not(:empty)').waitFor();
  await until(async()=>await toggle.getAttribute('aria-checked')==='false');assert.equal(f.disk().personaUnified,false);assert.equal(await row.isVisible(),true);
  await toggle.click();await until(()=>f.disk().personaUnified===true);await row.waitFor({state:'hidden'});
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);
}finally{release();await f.close();}
console.log('✓ 286 delayed saves serialize the last persona toggle, keep immediate reversals, roll back failures and allow retry; zero external requests');

import assert from 'node:assert/strict';
import {modelUiFixture} from './model-ui-fixture.mjs';
const f=await modelUiFixture();let appended,release;
const path='/api/ui/list-layout';
const select=async id=>{await f.page.locator(`#nav button[data-panel=${id}]`).click();await f.frame.locator(`body[data-panel=${id}] .list-layout-handle`).waitFor({state:'attached'});};
const handle=()=>f.frame.getByRole('separator',{name:'调整列表宽度'});
const width=()=>handle().getAttribute('aria-valuenow').then(Number);
const posts=()=>f.writes.filter(r=>r.path===path);
const response=()=>f.page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');
async function drag(delta,{cancel=false}={}) {
  const box=await handle().boundingBox();assert.ok(box);const x=box.x+box.width/2,y=box.y+Math.min(60,box.height/2);
  await f.page.mouse.move(x,y);await f.page.mouse.down();await f.page.mouse.move(x+delta,y,{steps:5});
  if(cancel)await handle().dispatchEvent('pointercancel',{pointerId:1});await f.page.mouse.up();
}
try {
  const untouched=structuredClone(f.kernel.config.get().api);
  assert.deepEqual((await f.request('GET',path)).data,{width:288});
  for(const body of [{width:179},{width:521},{width:12.5},{width:'300'},{width:300,apiKey:'must-not-write'},{}])assert.equal((await f.request('POST',path,body)).status,400);
  assert.equal((await fetch(f.base+path)).status,401);
  await select('sessions');await handle().waitFor();assert.equal(await width(),288);
  const forbidden=await f.frame.locator('body').evaluate(async()=>{
    const {request}=await import('/panels/panel-client.js');
    try {await request('POST','/api/config',{api:{model:'must-not-write'}});return '';}
    catch(error){return error.message;}
  });
  assert.match(forbidden,/未授权/);assert.deepEqual(f.kernel.config.get().api,untouched,'a width preference does not grant the sessions panel general config writes');
  let saved=response();const before=posts().length;await drag(80);assert.equal((await saved).status(),200);assert.equal(posts().length,before+1);assert.equal(f.disk().ui.listWidth,368);assert.equal(await width(),368);
  saved=response();await handle().press('ArrowRight');await handle().press('ArrowRight');await handle().press('ArrowRight');await saved;assert.equal(await width(),392);assert.equal(f.disk().ui.listWidth,392);
  for(const id of ['chats','memory']){await select(id);await handle().waitFor();await f.frame.locator('.list-layout-handle[aria-valuenow="392"]').waitFor();}
  const writes=posts().length;await drag(50,{cancel:true});assert.equal(await width(),392);assert.equal(posts().length,writes);
  const escapeBox=await handle().boundingBox();await f.page.mouse.move(escapeBox.x+9,escapeBox.y+30);await f.page.mouse.down();await f.page.mouse.move(escapeBox.x+59,escapeBox.y+30,{steps:3});await handle().press('Escape');await f.page.mouse.up();assert.equal(await width(),392);assert.equal(posts().length,writes);
  saved=response();await handle().dblclick();await saved;assert.equal(await width(),288);assert.equal(posts().length,writes+1,'a double click is one reset, not two no-op drag commits');
  await f.page.setViewportSize({width:760,height:850});await f.frame.locator('.grid.list-layout-stacked').waitFor();assert.equal(await handle().isVisible(),false);
  const overflow=await f.frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
  await f.page.setViewportSize({width:1360,height:900});await handle().waitFor();assert.equal(await width(),288);

  const rejecting=route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'synthetic preference failure'})}):route.continue();
  await f.page.route(f.base+path,rejecting);saved=response();await handle().press('ArrowRight');await saved;await f.frame.locator('.list-layout-notice').filter({hasText:'未能保存'}).waitFor();assert.equal(f.disk().ui.listWidth,288);
  await f.page.unroute(f.base+path,rejecting);saved=response();await handle().press('ArrowRight');await saved;assert.equal(f.disk().ui.listWidth,304);await f.frame.locator('.list-layout-notice').waitFor({state:'hidden'});

  let entered;const started=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});let held=false;
  const holding=async route=>{if(route.request().method()==='GET'&&!held){held=true;const old=await route.fetch();entered();await gate;await route.fulfill({response:old});}else await route.continue();};
  await f.page.route(f.base+path,holding);const oldRead=f.page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='GET').then(r=>r.finished());await select('sessions');await started;
  saved=response();await drag(64);await saved;const changed=await width();release();await oldRead;await f.page.unroute(f.base+path,holding);await f.frame.locator('body').evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await width(),changed,'late stored width cannot undo a gesture');
  await select('chats');await f.frame.locator(`.list-layout-handle[aria-valuenow="${changed}"]`).waitFor();
  assert.deepEqual(f.kernel.config.get().api,untouched);assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);await f.close();
  appended=await modelUiFixture({uiAssetPath:'panels/list-layout.js',uiAsset:`export function installListLayout(root){root.dataset.appendedLayout='true';return ()=>{delete root.dataset.appendedLayout;};}`});
  for(const id of ['sessions','chats','memory']){await appended.page.locator('#nav button[data-panel='+id+']').click();await appended.frame.locator('body[data-panel='+id+'] .grid[data-appended-layout=true]').waitFor();}
  assert.deepEqual(appended.errors,[]);assert.equal(appended.outbound(),0);
  console.log('✓ list layout: constrained API, actual drag/keyboard/reset, shared persistence, narrow stacking, cancel/failure/retry/late read, single appended implementation for three panels');
} finally {release?.();await appended?.close();await f.close();}

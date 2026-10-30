// Actual shared renderer, actual confirmation controller and appended UI asset.
// Random-port synthetic pages/kernel only; never the user's console or data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {settingsEditor} from './settings-navigation.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'.qa-local/destructive-gsap-20261018/motion250');fs.mkdirSync(out,{recursive:true});
const errors=[],outbound=[],checks=[],requests=[];let browser,app,restored,releaseSlow;
const html='<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/panels/common.css"><style>body{background:var(--bg);margin:0}main{max-width:740px;margin:auto}.sample{position:relative;margin:16px;padding:20px;border:1px solid var(--line);background:var(--surface);min-height:145px}.sample h2{margin:0 0 12px}.sample p{margin:7px 0}.sample button{margin-top:12px}input{max-width:100%}</style><main><div id="rows"></div><p id="status"></p></main></html>';
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://fixture.invalid').pathname;requests.push(pathname);res.setHeader('Cache-Control','no-store');
  if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(pathname==='/image.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');return;}
  if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const file=path.resolve(root,'ui',pathname.slice(1)),relative=path.relative(path.join(root,'ui'),file);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',path.extname(file)==='.js'?'text/javascript':path.extname(file)==='.css'?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const cache=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'ms-playwright'),executablePath=fs.readdirSync(cache).filter(v=>/^chromium-\d+$/.test(v)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9))).map(v=>path.join(cache,v,'chrome-win64/chrome.exe')).find(v=>fs.existsSync(v));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
  browser=await createRequire(import.meta.url)('playwright-core').chromium.launch({executablePath,headless:process.env.QA_HEADED!=='1'});
  const page=await browser.newPage({viewport:{width:880,height:900},reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(route.request().url().startsWith(base+'/'))return route.continue();outbound.push(route.request().url());return route.abort();});
  async function mount(mode='held',clicks=2){
    await page.goto(base);await page.evaluate(async({mode,clicks})=>{
      const api=await import('/panels/destructive-action.js'),{createDestructiveFeedback}=await import('/shell/destructive-feedback.js');
      const host=document.querySelector('#rows'),row=document.createElement('article');row.className='sample';row.dataset.motionKey='sample-A';row.innerHTML='<h2>方案评审与测试记录</h2><p>128 条消息 · 8 位合成成员</p><p>ARCHIVE / 04F2–8B16 / LOCAL</p>';
      const input=document.createElement('input');input.type='password';input.value='SECRET_SHOULD_NOT_BE_VISUALIZED';row.append(input);
      window.constructed=0;customElements.define('qa-motion-custom',class extends HTMLElement{constructor(){super();window.constructed++;}});row.append(document.createElement('qa-motion-custom'));
      const image=document.createElement('img');image.src='/image.svg';row.append(image);
      const next=document.createElement('article');next.className='sample';next.dataset.motionKey='sample-B';next.textContent='项目日常讨论';
      const button=document.createElement('button');button.textContent=mode==='window'?'重置全部数据':'删除示例';row.append(button);host.append(row,next);
      if(mode==='dialog'){const dialog=document.createElement('dialog');dialog.style.width='min(700px,90vw)';document.body.append(dialog);dialog.append(host);dialog.showModal();}
      const feedback=createDestructiveFeedback();window.addEventListener('destructive-window-progress',e=>feedback.update(e.detail.progress,e.detail.phase));
      const state=window.qa={api,host,row,next,button,mode,calls:0,release:null,finished:false,feedback};
      state.control=api.bindDestructiveAction(button,{clicks,target:()=>row,windowTint:mode==='window',impact:'仅操作此页面的合成示例。',action:async()=>{
        state.calls++;if(['held','early','window','failure'].includes(mode)){if(mode==='early')row.remove();await new Promise(r=>{state.release=r;});}
        if(mode==='failure')throw Error('QA250 synthetic failure');
        if(mode==='retained'){row.querySelector('h2').textContent='此存档已清空';input.value='';}
        else if(mode!=='window'&&mode!=='early')row.remove();
        state.finished=true;
      }});
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));state.nextY=next.getBoundingClientRect().top;
    },{mode,clicks});
  }
  async function capture(duration,release=false){
    return page.evaluate(({duration,release})=>new Promise(resolve=>{
      const began=performance.now(),frames=[];if(release)qa.release();
      function frame(time){
        const fx=document.querySelector('.danger-motion'),parts=[...document.querySelectorAll('.danger-motion-slice')],shards=[...document.querySelectorAll('.danger-motion-shard')];
        const read=el=>{const s=getComputedStyle(el);return {transform:s.transform,clip:s.clipPath,opacity:Number(s.opacity)};};
        frames.push({ms:time-began,progress:Number(qa.button.dataset.dangerProgress),phase:fx?.dataset.phase,parts:parts.map(read),shards:shards.map(read),ghosts:document.querySelectorAll('.danger-removal-ghost').length,nextY:qa.next.getBoundingClientRect().top,connected:qa.row.isConnected,done:qa.finished});
        if(time-began<duration)requestAnimationFrame(frame);else resolve(frames);
      }
      requestAnimationFrame(frame);
    }),{duration,release});
  }
  const remove=()=>page.getByRole('button',{name:'删除示例',exact:true});
  const engineGate=new Promise(resolve=>{releaseSlow=resolve;});
  const slowEngine=async route=>{await engineGate;await route.continue().catch(()=>{});};
  await page.route('**/gsap-3.13.0.min.js',slowEngine);
  const mounted=await Promise.race([mount().then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),1500))]);
  assert.equal(mounted,true,'a delayed graphics engine must not block panel/RPC handler initialization');
  await remove().click();await remove().click();assert.equal(await page.evaluate(()=>qa.calls),1,'the business action starts while the graphics engine is still loading');
  await page.evaluate(()=>qa.control.dispose());releaseSlow();await page.unroute('**/gsap-3.13.0.min.js',slowEngine);await capture(180);assert.equal(await page.locator('.danger-motion').count(),0,'disposed queued effects cannot start after the engine loads');
  await page.evaluate(()=>qa.release());checks.push('slow optional graphics loading leaves handlers/business responsive and does not resurrect a cancelled effect');
  await mount();
  const originalImageRequests=requests.filter(p=>p==='/image.svg').length;
  await remove().click();await remove().click();await page.waitForFunction(()=>!!qa.release);
  const pending=await capture(800);
  assert.ok(pending.every(f=>f.progress===1&&f.connected&&!f.done));
  assert.ok(new Set(pending.map(f=>JSON.stringify(f.parts))).size>=10,'100% waiting state keeps changing, independent of progress');
  const a=await page.locator('.sample').first().screenshot(),b=await page.locator('.sample').first().screenshot();assert.notEqual(digest(a),digest(b));
  assert.equal(await page.locator('.danger-motion').innerText().then(t=>t.includes('SECRET_SHOULD_NOT_BE_VISUALIZED')),false);
  assert.equal(await page.locator('.danger-motion button,.danger-motion input,.danger-motion img,.danger-motion [id],.danger-motion qa-motion-custom').count(),0);
  assert.equal(await page.evaluate(()=>window.constructed),1);assert.equal(requests.filter(p=>p==='/image.svg').length,originalImageRequests);
  await page.evaluate(()=>document.documentElement.style.setProperty('--bad','#a75bff'));
  assert.equal(await page.locator('.danger-motion-bit').nth(1).evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(167, 91, 255)');
  checks.push('real shared controller: constant 100% remains animated, theme color follows --bad, snapshots have no active resources or secrets');
  const exit=await capture(1100,true),shattering=exit.filter(f=>f.shards.length===12);
  assert.ok(shattering.length>=4);const moving=Array.from({length:12},(_,i)=>new Set(shattering.map(f=>f.shards[i].transform)).size).filter(n=>n>=3).length;assert.ok(moving>=6);
  assert.equal(exit.at(-1).done,true);assert.equal(exit.at(-1).connected,false);assert.ok(exit[0].nextY-exit.at(-1).nextY>100);
  assert.ok(new Set(exit.filter(f=>!f.connected&&f.ghosts===0).map(f=>f.nextY.toFixed(1))).size>=3);
  assert.equal(await page.locator('.danger-motion,.danger-removal-ghost').count(),0);
  checks.push('successful deletion tears actual content into independently moving bands, releases list reflow and cleans up');

  await mount('retained');await remove().click();await remove().click();
  await page.waitForSelector('.danger-removal-ghost');assert.equal(await page.locator('.danger-removal-ghost').innerText().then(t=>t.includes('方案评审')),true);
  await page.waitForFunction(()=>!document.querySelector('.danger-removal-ghost'));
  assert.equal(await page.locator('.sample').first().getByRole('heading').innerText(),'此存档已清空');assert.equal(await page.locator('input').inputValue(),'');
  checks.push('clearing a retained card tears away its old text and reveals the updated content');
  await mount('dialog');const originalRect=await page.locator('.sample').first().boundingBox(),dialogRect=await page.locator('dialog').boundingBox();await remove().click();await remove().click();await page.waitForSelector('.danger-removal-ghost');
  assert.equal(await page.locator('.danger-removal-ghost').evaluate(n=>n.matches(':popover-open')),true,'modal deletion snapshots remain in the visible browser top layer');
  const ghostRect=await page.locator('.danger-removal-ghost').boundingBox();assert.ok(Math.abs(ghostRect.x-originalRect.x)<1&&Math.abs(ghostRect.y-originalRect.y)<1);
  const pendingDialog=await page.locator('dialog').boundingBox();assert.ok(Math.abs(pendingDialog.y-dialogRect.y)<1&&Math.abs(pendingDialog.height-dialogRect.height)<1,'native dialog does not shrink/re-center before the old content exits');
  await page.screenshot({path:path.join(out,'modal-deletion.png')});await page.waitForFunction(()=>!document.querySelector('.danger-removal-ghost'));checks.push('deletion inside native modal dialogs remains visible and correctly aligned in the top layer');
  await mount('early');await page.evaluate(()=>{qa.button.click();qa.button.click();});await page.waitForSelector('.danger-removal-ghost');
  const early=await capture(350);assert.ok(new Set(early.map(f=>JSON.stringify(f.parts))).size>=3,'early-removal placeholder remains animated while awaiting the reply');
  await page.evaluate(()=>qa.api.resetDestructiveActions());assert.equal(await page.locator('.danger-motion,.danger-removal-ghost').count(),0);await page.evaluate(()=>qa.release());await capture(800);
  assert.equal(await page.locator('.danger-motion,.danger-removal-ghost').count(),0);checks.push('early SSE removal animates the pending placeholder; cancellation prevents a late replay');
  await mount('failure');await remove().click();await remove().click();await page.evaluate(()=>qa.release());await page.waitForSelector('.danger-error');
  assert.equal(await page.locator('.danger-motion,.danger-removal-ghost').count(),0);assert.equal(await page.locator('.sample').first().isVisible(),true);checks.push('failure retains data and clears all decorative resources');

  await mount('window',6);await page.setViewportSize({width:520,height:850});
  for(let i=0;i<6;i++)await page.getByRole('button',{name:'重置全部数据',exact:true}).click();
  await page.waitForFunction(()=>!!qa.release);const windowPending=await capture(350);
  assert.ok(windowPending.every(f=>f.progress===1));assert.ok(new Set(windowPending.map(f=>JSON.stringify(f.parts))).size>=3);
  const coverage=await page.locator('.danger-motion-window').evaluate(n=>{const r=n.getBoundingClientRect();return{left:r.left,top:r.top,width:r.width,height:r.height,pointer:getComputedStyle(n).pointerEvents,vw:innerWidth,vh:innerHeight};});
  assert.deepEqual(coverage,{left:0,top:0,width:520,height:850,pointer:'none',vw:520,vh:850});
  await page.screenshot({path:path.join(out,'whole-window-pending.png')});await page.evaluate(()=>qa.release());await page.waitForFunction(()=>!document.querySelector('.danger-motion-window'));checks.push('six-click reset keeps the whole-window effect moving through the pending and completion phases');
  await page.emulateMedia({reducedMotion:'reduce'});await mount('retained');await remove().click();await remove().click();await page.waitForFunction(()=>qa.finished);
  assert.equal(await page.locator('.danger-removal-ghost').count(),0);assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);checks.push('reduced motion preserves confirmation and mutation without a decorative delay');

  const replacement=`export function createDestructiveMotion(node){const win=node.ownerDocument.defaultView;win.qaMotionCalls??=[];node.dataset.appendedMotion='250';return {update(p){win.qaMotionCalls.push(['update',p])},exit(){win.qaMotionCalls.push(['exit']);return Promise.resolve()},dispose(){win.qaMotionCalls.push(['dispose'])}}}`;
  app=await modelUiFixture({uiAssetPath:'panels/destructive-motion.js',uiAsset:replacement});await app.page.emulateMedia({reducedMotion:'no-preference'});
  await settingsEditor(app.frame,'model-manager');
  // This part proves asset selection and request ownership, not click decay.
  // Driver/actionability delays under a long full suite are not user clicks;
  // real-time decay and constant-progress motion are covered above and in 180.
  await app.page.clock.install();await app.page.clock.pauseAt(new Date(Date.now()+1000));
  const provider=app.card('a'),deleteProvider=provider.getByRole('button',{name:'删除渠道',exact:true});
  await deleteProvider.click();assert.equal(Number(await deleteProvider.getAttribute('data-danger-progress')),.25);assert.equal(await provider.getAttribute('data-appended-motion'),'250');assert.equal(app.writes.filter(w=>w.method==='DELETE'&&w.path==='/api/providers').length,0);
  await deleteProvider.click();assert.equal(Number(await deleteProvider.getAttribute('data-danger-progress')),.5);await deleteProvider.click();assert.equal(Number(await deleteProvider.getAttribute('data-danger-progress')),.75);assert.equal(app.writes.filter(w=>w.method==='DELETE'&&w.path==='/api/providers').length,0);await deleteProvider.click();
  await provider.waitFor({state:'detached'});await app.page.clock.runFor(500);
  assert.equal(app.writes.filter(w=>w.method==='DELETE'&&w.path==='/api/providers').length,1);
  assert.ok((await app.frame.locator('body').evaluate(()=>window.qaMotionCalls)).some(call=>call[0]==='exit'));
  assert.deepEqual(app.errors,[]);assert.equal(app.outbound(),0);checks.push('appended ui.assets renderer is consumed by the real provider deletion, preserving its four-click business boundary');
  await app.close();app=null;
  restored=await modelUiFixture({uiAssetPath:'panels/destructive-motion.js',uiAsset:replacement,uiAssetEnabled:false});await restored.page.emulateMedia({reducedMotion:'no-preference'});
  await settingsEditor(restored.frame,'model-manager');
  await restored.card('a').getByRole('button',{name:'删除渠道',exact:true}).click();await restored.frame.locator('.danger-motion').waitFor();assert.equal(await restored.card('a').getAttribute('data-appended-motion'),null);
  assert.deepEqual(restored.errors,[]);assert.equal(restored.outbound(),0);checks.push('disabling the appended layer restores the default renderer with no page edits');
  assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,at:new Date().toISOString(),checks,pendingFrames:pending.length,independentlyMovingShards:moving,errors,outbound,productionDataAccessed:false,realResetCalls:0},null,2));
  fs.writeFileSync(path.join(out,'exit-frames.json'),JSON.stringify(exit,null,2));console.log('✓ 250 '+checks.join('\n✓ 250 '));
}finally{releaseSlow?.();await app?.close();await restored?.close();await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

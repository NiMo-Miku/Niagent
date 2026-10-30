// Public contract GET: https://kondius.cn/qq-agent/comments/ on 2026-10-12.
// Real UI/RPC/HTTP/provider assembly, but all CAPTCHA/publication is local synthetic traffic.
import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{createRequire}from'node:module';
import{createKernel}from'../src/kernel/kernel.js';import{FEEDBACK_ENDPOINT}from'../bundled/community/feedback-client.js';import{RpcBridge}from'../ui/shell/rpc-bridge.js';
import{isSettingsLeaseOpenRequest}from'./settings-save-observation.mjs';
const originalWindow=globalThis.window,sent=[],guardCalls=[];
globalThis.window={addEventListener(){},removeEventListener(){}};
const frame={contentWindow:{postMessage:message=>sent.push(message)},addEventListener(){}};
const guard=new RpcBridge({frame,manifest:{id:'community',kind:'bundled',api:[{method:'POST',path:'/api/community/feedback'}]},onPublishFeedback:async(_,{signal})=>{guardCalls.push(1);await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
function event(method='community.publishFeedback'){return{source:frame.contentWindow,origin:'null',data:{jsonrpc:'2.0',id:'124',method,params:{},meta:{panel:guard.manifest.id,nonce:guard.nonce}}};}
try{
  for(const[id,kind]of[['community','user'],['chats','bundled'],['settings','bundled']]){guard.manifest.id=id;guard.manifest.kind=kind;await guard.handle(event());assert.equal(sent.at(-1).error.code,-32003);}
  guard.manifest.id='community';guard.manifest.kind='bundled';
  for(const patch of[e=>e.source={},e=>e.origin='https://evil.invalid',e=>e.data.meta.nonce='forged',e=>e.data.meta.panel='chats']){const e=event();patch(e);await guard.handle(e);}assert.equal(guardCalls.length,0);
  const pending=guard.handle(event());await new Promise(resolve=>setTimeout(resolve,0));await guard.handle(event());assert.equal(sent.at(-1).error.data.httpStatus,409);assert.equal(guardCalls.length,1);
  await guard.handle(event('community.cancelFeedbackPublish'));await pending;assert.equal(guard.feedbackController,null);
}finally{guard.close();if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;}
const fixtureRoot=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-feedback124-')),dataDir=path.join(fixtureRoot,'data'),appRoot=path.join(fixtureRoot,'app'),token='feedback124-console',remoteCalls=[];
fs.mkdirSync(appRoot);for(const name of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,name));
fs.cpSync(new URL('../ui',import.meta.url),path.join(appRoot,'ui'),{recursive:true});
fs.cpSync(new URL('../src',import.meta.url),path.join(appRoot,'src'),{recursive:true});
for(const name of ['community','market'])fs.cpSync(new URL(`../bundled/${name}`,import.meta.url),path.join(appRoot,'bundled',name),{recursive:true});
let remoteStatus=200,remoteError='投稿过于频繁，请稍后再试',holdRemote=null;
const kernel=createKernel({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(fixtureRoot,'absent')},headless:true,transport:{id:'fixture',start(){},stop(){},status:()=>({connected:true}),actions:{}},priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]}),getBlocklist:()=>({ok:true,ids:[]}),listAccounts:()=>({ok:true,accounts:[]})},
  fetchImpl:async(url,init)=>{assert.equal(String(url),FEEDBACK_ENDPOINT);remoteCalls.push({url:String(url),init:{...init,signal:undefined},body:JSON.parse(init.body)});if(holdRemote)await holdRemote;return new Response(JSON.stringify(remoteStatus===200?{ok:true,echo:'never forward remote metadata'}:{ok:false,error:remoteError}),{status:remoteStatus,headers:{'content-type':'application/json',...(remoteStatus===302?{location:'https://evil.invalid/'}:{})}});},
});
kernel.config.update({server:{port:0,token},telemetry:{enabled:false},proactive:{enabled:false},api:{apiKey:'private-key124'}});
kernel.loader.startWatchers=()=>{};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=','base64'),dataUrl=`data:image/png;base64,${png.toString('base64')}`;
let browser,port;
async function api(method,pathname,body){const response=await fetch(`http://127.0.0.1:${port}${pathname}`,{method,headers:{'x-console-token':token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};}
try{
  port=await kernel.start();assert.notEqual(port,15967);assert.deepEqual(kernel.loader.listEntries().map(entry=>entry.id).sort(),['community','market']);console.log('· Production provider validates the exact public fields, image types/count/body limit and proof before outbound publication');
  const valid={nickname:'记录者',text:'明确公开的反馈',images:[dataUrl],captchaVerifyParam:'synthetic-proof124'};
  for(const body of[{...valid,nickname:''},{...valid,text:''},{...valid,text:'x'.repeat(5001)},{...valid,captchaVerifyParam:''},{...valid,chatKey:'group:123456'},{...valid,images:[...Array(10)].map(()=>dataUrl)},{...valid,images:['https://evil.invalid/picture']},{...valid,images:['data:image/svg+xml;base64,PHN2Zy8+']},{...valid,images:['data:image/png;base64,bm90LXBuZw==']}])assert.equal((await api('POST','/api/community/feedback',body)).status,400);
  assert.equal((await api('POST','/api/community/feedback',{...valid,images:[dataUrl+'A'.repeat(3*1024*1024)]})).status,413);assert.equal(remoteCalls.length,0);
  remoteStatus=429;remoteError='过于频繁 synthetic-proof124';const quota=await api('POST','/api/community/feedback',valid);assert.equal(quota.status,429);assert.doesNotMatch(JSON.stringify(quota),/synthetic-proof124/);
  remoteStatus=302;assert.equal((await api('POST','/api/community/feedback',valid)).status,502);assert.ok(remoteCalls.every(call=>call.init.redirect==='manual'));remoteCalls.length=0;remoteStatus=200;remoteError='投稿过于频繁，请稍后再试';
  const playwright=createRequire(import.meta.url)('playwright-core'),cache=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ms-playwright');
  const versions=fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9)));
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??versions.map(version=>path.join(cache,version,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));
  browser=await playwright.chromium.launch({executablePath,headless:true});const context=await browser.newContext({viewport:{width:960,height:640}}),external=[],localPosts=[],errors=[];
  await context.addInitScript(()=>{window.qa124Messages=[];window.addEventListener('message',event=>window.qa124Messages.push(event.data));});
  await context.route(url=>url.protocol==='https:',async route=>{external.push(route.request().url());assert.equal(route.request().url(),'https://kondius.cn/qq-agent/captcha-sdk/AliyunCaptcha.js');await route.fulfill({contentType:'text/javascript',body:`window.initAliyunCaptcha=function(o){window.qa124InitCount=(window.qa124InitCount||0)+1;window.qa124Pass=function(){o.success('synthetic-proof124');};o.getInstance({show:function(){window.qa124Showing=true;},hide:function(){window.qa124Showing=false;},destroyCaptcha:function(){window.qa124Destroyed=(window.qa124Destroyed||0)+1;}});};`});});
  context.on('request',request=>{if(request.method()==='POST'&&!isSettingsLeaseOpenRequest(request,`http://127.0.0.1:${port}`))localPosts.push(request.url());});
  const configBeforePreview=fs.readFileSync(path.join(dataDir,'config.json'),'utf8');
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${port}/?token=${token}`);await page.locator('#nav button[data-panel=community]').click();const panel=page.frameLocator('#panel-host iframe');await panel.locator('#open-feedback').waitFor();
  const dialog=panel.locator('dialog.feedback-dialog'),result=dialog.locator('.feedback-result');
  async function open(){await panel.locator('#open-feedback').click();await dialog.waitFor();}
  async function fill(){await dialog.locator('input[name=nickname]').fill('记录者');await dialog.locator('textarea[name=text]').fill('明确公开的反馈');}
  async function preview(){await dialog.getByRole('button',{name:'预览反馈',exact:true}).click();await dialog.locator('.feedback-review').waitFor({state:'visible'});}
  async function clearLocalDraft(){
    if(!await dialog.count())await open();
    if(await dialog.locator('.feedback-review').isVisible())await dialog.getByRole('button',{name:'返回编辑',exact:true}).click();
    const clear=dialog.getByRole('button',{name:'清除本机草稿',exact:true});assert.equal(await clear.getAttribute('data-danger-clicks'),'2');await clear.dblclick({delay:70});
    await dialog.locator('.feedback-draft-status').filter({hasText:'本机草稿已清除'}).waitFor();await dialog.getByRole('button',{name:'取消',exact:true}).click();
  }
  async function removeScreenshot(){const remove=await dialog.getByRole('button',{name:'移除截图 1',exact:true}).elementHandle();assert.equal(await remove.getAttribute('data-danger-clicks'),'2');const before=await dialog.locator('.feedback-attachment').count();await remove.click();assert.equal(await dialog.locator('.feedback-attachment').count(),before);assert.equal(await panel.locator('dialog.confirm-panel').count(),0);await remove.click();}
  async function cancelRequests(){return page.evaluate(()=>window.qa124Messages.filter(message=>message?.method==='community.cancelFeedbackPublish').length);}
  console.log('· Opinion entry opens a local input modal; typing, empty validation, preview and cancellation never publish');
  await open();assert.equal(await dialog.locator('input[name=nickname]').getAttribute('maxlength'),'32');assert.equal(await dialog.locator('textarea[name=text]').getAttribute('maxlength'),'5000');
  await dialog.getByRole('button',{name:'预览反馈',exact:true}).click();await result.filter({hasText:'昵称必填'}).waitFor();await dialog.locator('input[name=nickname]').fill('记录者');await dialog.getByRole('button',{name:'预览反馈',exact:true}).click();await result.filter({hasText:'反馈正文必填'}).waitFor();await fill();await preview();assert.match(await dialog.locator('.feedback-review').textContent(),/记录者.*明确公开的反馈/s);assert.equal(remoteCalls.length,0);assert.equal(external.length,0);assert.equal(localPosts.length,0);await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await dialog.count(),0);assert.equal(fs.readFileSync(path.join(dataDir,'config.json'),'utf8'),configBeforePreview,'feedback preview/cancel preserves the complete config file');
  console.log('· Cancellation detaches immediately and can reopen in the same execution stack; a stale close event cannot close the fresh draft');
  await open();await fill();await preview();
  const immediateReopen=await panel.locator('body').evaluate(()=>{
    const previous=document.querySelector('dialog.feedback-dialog');
    [...previous.querySelectorAll('button')].find(button=>button.textContent==='取消').click();
    const oldDisconnected=!previous.isConnected,remainingAfterCancel=document.querySelectorAll('dialog.feedback-dialog').length;
    document.querySelector('#open-feedback').click();
    const fresh=document.querySelector('dialog.feedback-dialog');
    previous.dispatchEvent(new Event('close'));
    return{oldDisconnected,remainingAfterCancel,reopenedCount:document.querySelectorAll('dialog.feedback-dialog').length,fresh:!!fresh&&fresh!==previous,open:fresh?.open===true,nickname:fresh?.querySelector('[name=nickname]').value,text:fresh?.querySelector('[name=text]').value,images:fresh?.querySelectorAll('.feedback-attachment,.feedback-review img').length,staleCloseKeptFresh:!!fresh&&fresh.isConnected};
  });
  assert.deepEqual(immediateReopen,{oldDisconnected:true,remainingAfterCancel:0,reopenedCount:1,fresh:true,open:true,nickname:'记录者',text:'明确公开的反馈',images:0,staleCloseKeptFresh:true});
  assert.equal(remoteCalls.length,0);assert.equal(external.length,0);assert.equal(localPosts.length,0);assert.equal(await cancelRequests(),0);
  console.log('· Same-stack cancellation aborts an in-flight real FileReader without adding its screenshot; native Escape detaches and retains accepted draft fields');
  const cancelledRead=await panel.locator('body').evaluate((body,binary)=>{
    const previous=document.querySelector('dialog.feedback-dialog'),input=previous.querySelector('[name=images]'),transfer=new DataTransfer();
    transfer.items.add(new File([new Uint8Array(binary)],'cancelled.png',{type:'image/png'}));input.files=transfer.files;
    const originalAbort=FileReader.prototype.abort;let aborted=0;
    FileReader.prototype.abort=function(...args){aborted++;return originalAbort.apply(this,args);};
    try{
      input.dispatchEvent(new Event('change'));
      [...previous.querySelectorAll('button')].find(button=>button.textContent==='取消').click();
      const oldDisconnected=!previous.isConnected;
      document.querySelector('#open-feedback').click();
      const fresh=document.querySelector('dialog.feedback-dialog');previous.dispatchEvent(new Event('close'));
      return{aborted,oldDisconnected,fresh:!!fresh&&fresh!==previous&&fresh.isConnected,images:fresh?.querySelectorAll('.feedback-attachment,.feedback-review img').length};
    }finally{FileReader.prototype.abort=originalAbort;}
  },[...png]);
  assert.deepEqual(cancelledRead,{aborted:1,oldDisconnected:true,fresh:true,images:0});
  await dialog.press('Escape');assert.equal(await dialog.count(),0);assert.equal(await cancelRequests(),0);assert.equal(remoteCalls.length,0);assert.equal(external.length,0);assert.equal(localPosts.length,0);
  await clearLocalDraft();await open();
  await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await dialog.count(),0);
  await open();assert.equal(await dialog.locator('input[name=nickname]').inputValue(),'');await fill();
  console.log('· Screenshot preview/removal/count/type checks and the official large-image compression path work under the actual iframe CSP');
  await dialog.locator('input[type=file]').setInputFiles([...Array(9)].map((_,i)=>({name:`accepted-${i}.png`,mimeType:'image/png',buffer:png})));await dialog.locator('input[type=file]:enabled').waitFor();assert.equal(await dialog.locator('.feedback-attachment').count(),9);await preview();assert.equal(await dialog.locator('.feedback-review img').count(),9);assert.equal(remoteCalls.length,0);await dialog.getByRole('button',{name:'取消',exact:true}).click();await clearLocalDraft();await open();await fill();
  await dialog.locator('input[type=file]').setInputFiles({name:'screenshot.png',mimeType:'image/png',buffer:png});await dialog.locator('.feedback-attachment img').waitFor();assert.equal(await dialog.locator('.feedback-attachment img').getAttribute('src'),dataUrl);
  await dialog.locator('input[type=file]').setInputFiles([...Array(10)].map((_,i)=>({name:`shot-${i}.png`,mimeType:'image/png',buffer:png})));await result.filter({hasText:'截图最多9张'}).waitFor();assert.equal(await dialog.locator('.feedback-attachment').count(),1);
  await dialog.locator('input[type=file]').setInputFiles({name:'not-image.txt',mimeType:'text/plain',buffer:Buffer.from('private text')});await result.filter({hasText:'支持PNG'}).waitFor();assert.equal(await dialog.locator('.feedback-attachment').count(),1);
  await dialog.locator('input[type=file]').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await result.filter({hasText:'无法读取截图'}).waitFor();
  await removeScreenshot();assert.equal(await dialog.locator('.feedback-attachment').count(),0);
  const largePng=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=1000;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(2000,1000);let n=11;for(let i=0;i<pixels.data.length;i+=4){n=(Math.imul(n,1664525)+1013904223)|0;pixels.data[i]=n&255;pixels.data[i+1]=(n>>>8)&255;pixels.data[i+2]=(n>>>16)&255;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png').split(',')[1];});
  const large=Buffer.from(largePng,'base64');assert.ok(large.length>300*1024);await dialog.locator('input[type=file]').setInputFiles({name:'large.png',mimeType:'image/png',buffer:large});await dialog.locator('.feedback-attachment img').waitFor();assert.match(await dialog.locator('.feedback-attachment img').getAttribute('src'),/^data:image\/jpeg;base64,/);
  assert.equal(await dialog.locator('.feedback-attachment img').evaluate(image=>new Promise(resolve=>{const done=()=>resolve(image.naturalWidth);if(image.complete)done();else image.addEventListener('load',done,{once:true});})),1600);
  await removeScreenshot();await dialog.locator('input[type=file]').setInputFiles({name:'screenshot.png',mimeType:'image/png',buffer:png});await dialog.locator('.feedback-attachment img').waitFor();await preview();assert.equal(await dialog.locator('.feedback-review img').getAttribute('src'),dataUrl);fs.mkdirSync('.shots',{recursive:true});await page.screenshot({path:'.shots/feedback-124-preview.png'});
  assert.equal(remoteCalls.length,0);assert.equal(localPosts.length,0);
  console.log('· Final publication requests host-only CAPTCHA; cancellation releases it and ignores late success');
  const cancelsBeforeBusy=await cancelRequests();await dialog.getByRole('button',{name:'确认公开发布',exact:true}).click();await page.waitForFunction(()=>window.qa124Showing===true);assert.equal(await dialog.getByRole('button',{name:'确认公开发布',exact:true}).isDisabled(),true);await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await dialog.count(),0);await page.waitForFunction(()=>window.qa124Showing===false);assert.equal(await cancelRequests(),cancelsBeforeBusy+1);await page.evaluate(()=>window.qa124Pass());assert.equal(remoteCalls.length,0);assert.equal(localPosts.length,0);assert.equal(await page.locator('[id^=public-captcha-]').count(),0);
  console.log('· Exactly one reviewed payload crosses the real local route/plugin/fixed upstream contract, never the iframe proof or host configuration');
  await clearLocalDraft();await open();await fill();await dialog.locator('input[type=file]').setInputFiles({name:'screenshot.png',mimeType:'image/png',buffer:png});await dialog.locator('.feedback-attachment img').waitFor();await preview();
  let release;holdRemote=new Promise(resolve=>{release=resolve;});await dialog.getByRole('button',{name:'确认公开发布',exact:true}).click();await page.waitForFunction(()=>window.qa124Showing===true);await page.evaluate(()=>window.qa124Pass());
  for(let i=0;i<200&&remoteCalls.length!==1;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(remoteCalls.length,1);assert.equal(await dialog.getByRole('button',{name:'确认公开发布',exact:true}).isDisabled(),true);
  assert.deepEqual(remoteCalls[0].body,valid);assert.equal(remoteCalls[0].init.redirect,'manual');assert.deepEqual(Object.keys(remoteCalls[0].init.headers).sort(),['accept','content-type']);assert.doesNotMatch(JSON.stringify(remoteCalls),/feedback124-console|private-key124|chatKey|groupId|senderId|fileName|screenshot.png/);assert.doesNotMatch(await panel.locator('body').evaluate(()=>JSON.stringify(window.qa124Messages)),/synthetic-proof124|feedback124-console|private-key124/);
  const cancelsBeforeSuccess=await cancelRequests();release();holdRemote=null;await panel.locator('#feedback-status').filter({hasText:'意见已提交到公开留言板'}).waitFor();assert.equal(await dialog.count(),0);assert.equal(localPosts.length,1);assert.equal(await cancelRequests(),cancelsBeforeSuccess);
  console.log('· Upstream 429 and disabled community provider retain drafts and visible failure/retry; off-origin or wrong-panel RPC cannot publish');
  remoteStatus=429;await open();await fill();await preview();await dialog.getByRole('button',{name:'确认公开发布',exact:true}).click();await page.waitForFunction(()=>window.qa124Showing===true);await page.evaluate(()=>window.qa124Pass());await result.filter({hasText:'过于频繁'}).waitFor();assert.equal(await dialog.getByRole('button',{name:'确认公开发布',exact:true}).isEnabled(),true);await dialog.getByRole('button',{name:'返回编辑',exact:true}).click();assert.equal(await dialog.locator('textarea[name=text]').inputValue(),'明确公开的反馈');assert.equal(await dialog.locator('input[name=nickname]').inputValue(),'记录者');await preview();
  await kernel.loader.setEnabled('community',false);assert.equal((await api('GET','/api/community/feedback/status')).status,503);const initCount=await page.evaluate(()=>window.qa124InitCount);await dialog.getByRole('button',{name:'确认公开发布',exact:true}).click();await result.filter({hasText:'未提供该能力'}).waitFor();assert.equal(await page.evaluate(()=>window.qa124InitCount),initCount);assert.equal(remoteCalls.length,2);await dialog.getByRole('button',{name:'取消',exact:true}).click();
  await page.locator('#nav button[data-panel=chats]').click();const chats=page.frameLocator('#panel-host iframe');await chats.locator('h2').filter({hasText:'聊天存档'}).waitFor();await chats.locator('body').evaluate(async()=>{const{publishFeedback}=await import('/panels/panel-client.js');try{await publishFeedback({nickname:'forged',text:'forged',images:[]});throw new Error('wrong panel accepted');}catch(error){if(error.code!==-32003)throw error;}});assert.equal(remoteCalls.length,2);assert.deepEqual(errors,[]);
  console.log('✓ 124 Local feedback modal/review/images/cancel, safe fixed publication, CAPTCHA isolation, retry/quota/provider and RPC guards passed');
}finally{await browser?.close();await kernel.stop();assert.equal(path.dirname(fixtureRoot),path.resolve(os.tmpdir()));assert.ok(path.basename(fixtureRoot).startsWith('qqa-feedback124-'));fs.rmSync(fixtureRoot,{recursive:true,force:true});}

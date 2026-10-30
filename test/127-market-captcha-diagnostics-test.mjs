// Public upload contract GET: https://www.kondius.cn/qq-agent/skill-market/,
// 2026-10-12. No real login, CAPTCHA, public POST or current QA is used here.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {createKernel} from '../src/kernel/kernel.js';
import {isolateConsoleFixture} from './console-fixture-isolation.mjs';
import {createCommunityMarketAdapters,COMMUNITY_BASE_URL} from '../bundled/market/client.js';
import {RpcBridge} from '../ui/shell/rpc-bridge.js';
import {publishMarketFromHost} from '../ui/shell/market-publication.js';
import {probeCaptchaNetwork} from '../electron/main.js';
import {CAPTCHA_DIAGNOSTIC_TARGETS} from '../ui/shell/captcha-diagnostics.js';
import {isSettingsLeaseOpenRequest} from './settings-save-observation.mjs';

console.log('· Fixed desktop HEAD probes preserve HTTP statuses and distinguish DNS/TLS/timeout/network failures');
const targets=CAPTCHA_DIAGNOSTIC_TARGETS.map(target=>target.url),probeCalls=[];
const nodeResults=await probeCaptchaNetwork(async(url,init)=>{probeCalls.push({url,init});return new Response(null,{status:[200,403,404,503][targets.indexOf(url)]});});
assert.deepEqual(probeCalls.map(call=>call.url),targets);assert.deepEqual(nodeResults.targets.map(item=>item.status),[200,403,404,503]);assert.ok(nodeResults.targets.every(item=>item.ok));
assert.ok(probeCalls.every(call=>call.init.method==='HEAD'&&call.init.redirect==='manual'&&!call.init.headers&&!call.init.body));
const failures=await probeCaptchaNetwork(async url=>{const index=targets.indexOf(url);throw Object.assign(new Error('synthetic private detail'),[{code:'ENOTFOUND'},{code:'ERR_TLS_CERT_ALTNAME_INVALID'},{name:'TimeoutError'},{code:'ECONNRESET'}][index]);});
assert.deepEqual(failures.targets.map(item=>item.error),['dns','tls','timeout','network']);assert.equal(failures.ok,false);assert.doesNotMatch(JSON.stringify(failures),/private detail/);

console.log('· Host RPC checks panel/source/origin/nonce, fixed diagnostic parameters, cancellation and duplicate publication');
const savedWindow=globalThis.window,sent=[],calls=[];
globalThis.window={addEventListener(){},removeEventListener(){}};
const frame={contentWindow:{postMessage:message=>sent.push(message)},addEventListener(){}};
const guard=new RpcBridge({frame,manifest:{id:'community',kind:'bundled',api:[{method:'POST',path:'/api/market/publish'}]},onCaptchaDiagnostics:()=>calls.push('diagnostic'),onPublishMarket:async(_,{signal})=>{calls.push('publish');await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
const event=(method='community.publishMarket',params={})=>({source:frame.contentWindow,origin:'null',data:{jsonrpc:'2.0',id:'127',method,params,meta:{panel:guard.manifest.id,nonce:guard.nonce}}});
try {
  for(const[id,kind]of[['community','user'],['chats','bundled'],['settings','bundled']]){guard.manifest.id=id;guard.manifest.kind=kind;for(const method of ['community.publishMarket','ui.captchaDiagnostics']){await guard.handle(event(method));assert.equal(sent.at(-1).error.code,-32003);}}
  guard.manifest.id='community';guard.manifest.kind='bundled';
  for(const patch of[e=>e.source={},e=>e.origin='https://evil.invalid',e=>e.data.meta.nonce='forged',e=>e.data.meta.panel='settings'])for(const method of ['community.publishMarket','ui.captchaDiagnostics']){const e=event(method);patch(e);await guard.handle(e);}
  assert.equal(calls.length,0);await guard.handle(event('ui.captchaDiagnostics',{url:'https://evil.invalid/'}));assert.equal(sent.at(-1).error.code,-32600);
  await guard.handle(event('ui.captchaDiagnostics'));assert.deepEqual(sent.at(-1).result,{ok:true});assert.deepEqual(calls,['diagnostic']);
  await guard.handle(event('api.request',{method:'POST',path:'/api/market/publish',body:{captchaVerifyParam:'iframe-forged'}}));assert.equal(sent.at(-1).error.code,-32003);
  const pending=guard.handle(event());await new Promise(resolve=>setTimeout(resolve,0));await guard.handle(event());assert.equal(sent.at(-1).error.data.httpStatus,409);assert.equal(calls.filter(value=>value==='publish').length,1);
  await guard.handle(event('community.cancelMarketPublish'));await pending;assert.equal(guard.marketController,null);
  let verified=false;
  await assert.rejects(publishMarketFromHost({}, {kind:'plugin',id:'publish127',accountUsername:'publisher127',captchaVerifyParam:'forged'},{verify:()=>{verified=true;}}),/参数无效/);assert.equal(verified,false);
} finally {guard.close();if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;}

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-market127-')),packageRoot=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-package127-'));
// The upload package and the real provider/UI application have separate owned
// roots. The published fixture must never become a loaded installed extension.
const isolation=isolateConsoleFixture(dataDir,'127');
fs.writeFileSync(path.join(isolation.appRoot,'package.json'),JSON.stringify({type:'module'}));
fs.cpSync(new URL('../src',import.meta.url),path.join(isolation.appRoot,'src'),{recursive:true});
for(const name of ['community','market'])fs.cpSync(new URL(`../bundled/${name}`,import.meta.url),path.join(isolation.appRoot,'bundled',name),{recursive:true});
function assertFixtureOwners(active=false){
  assert.deepEqual(kernel.loader.listEntries().map(entry=>entry.id).sort(),['community','market']);
  if(active){
    for(const id of ['community','market'])assert.equal(kernel.loader.isActive(id),true);
    assert.deepEqual(kernel.capability.providers('market.client').map(item=>item.ownerId),['market']);
    assert.deepEqual(kernel.capability.providers('community.client').map(item=>item.ownerId),['community']);
  }
}
function cleanupFixture(){
  try{isolation.restore();}finally{
    for(const root of [dataDir,packageRoot]){
      const relative=path.relative(os.tmpdir(),root);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
      fs.rmSync(root,{recursive:true,force:true});
    }
  }
}
const token='console-secret127',accountToken='account-secret127',proof='synthetic-proof127',remoteCalls=[];
fs.mkdirSync(path.join(packageRoot,'plugins','publish127'),{recursive:true});
fs.writeFileSync(path.join(packageRoot,'plugins','publish127','plugin.json'),JSON.stringify({id:'publish127',entry:'index.js',kind:'plugin'}));
fs.writeFileSync(path.join(packageRoot,'plugins','publish127','index.js'),'export default {};');
fs.writeFileSync(path.join(dataDir,'account.json'),JSON.stringify({accounts:[{username:'publisher127',token:accountToken,savedAt:Date.now()}]}));
let kernel,remoteStatus=200,holdRemote=null;
const market=createCommunityMarketAdapters({dataDir,appRoot:packageRoot,communityKey:'',config:{get:()=>kernel.config.get(),update:patch=>kernel.config.update(patch)},dnsLookup:async()=>[{address:'203.0.113.10',family:4}],fetchImpl:async(url,init)=>{
  if(url===`${COMMUNITY_BASE_URL}/blocklist`)return new Response(JSON.stringify({ids:[]}));
  assert.equal(url,`${COMMUNITY_BASE_URL}/market/publish`);assert.equal(init.method,'POST');
  remoteCalls.push({url,init:{...init,signal:undefined},body:Buffer.from(init.body)});if(holdRemote)await holdRemote;
  return new Response(JSON.stringify(remoteStatus===200?{ok:true,item:{code:'TEST127',name:'本地测试',token:accountToken,proof,nested:{proof}},note:`服务器附注 ${proof} ${accountToken}`,renamedTo:null}:{ok:false,error:`发布过于频繁 ${proof} ${accountToken}`}),{status:remoteStatus,headers:{'content-type':'application/json',...(remoteStatus===302?{location:`${COMMUNITY_BASE_URL}/unexpected-leak`}:{})}});
}});
kernel=createKernel({appRoot:isolation.appRoot,env:isolation.env,headless:true,fetchImpl:(...args)=>fetch(...args),transport:{id:'fixture',start(){},stop(){},status:()=>({connected:true}),actions:{}},priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },communityMarket:market});
kernel.config.update({server:{port:0,token},telemetry:{enabled:false},proactive:{enabled:false},api:{apiKey:'model-secret127'}});
kernel.loader.startWatchers=()=>{};
let browser,port;
try {
  port=await kernel.start();const base=isolation.allowOrigin(`http://127.0.0.1:${port}`);assertFixtureOwners(true);
  const playwright=createRequire(import.meta.url)('playwright-core'),cache=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ms-playwright');
  const versions=fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9)));
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??versions.map(version=>path.join(cache,version,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));
  browser=await playwright.chromium.launch({executablePath,headless:true});
  const context=await browser.newContext({viewport:{width:960,height:640}}),external=[],localPosts=[],errors=[];
  await context.addInitScript(({nodeResults,failures})=>{
    window.qa127Messages=[];window.addEventListener('message',event=>window.qa127Messages.push(event.data));
    if(window!==window.top)return;
    window.qa127ProbeCalls=0;window.qa127InterceptorCalls=0;
    window.qqAgentShell={captchaNetProbe:async()=>{window.qa127ProbeCalls++;if(window.qa127ProbeHold)await new Promise(resolve=>window.qa127ProbeRelease=resolve);if(window.qa127ProbeReject)throw new Error('synthetic private failure');return window.qa127ProbeFailure?failures:nodeResults;},captchaInterceptorStatus:async()=>{window.qa127InterceptorCalls++;return{installed:window.qa127InterceptorInstalled!==false,redirectCount:3,lastError:window.qa127InterceptorError?'private-never-show127':null};}};
  },{nodeResults,failures});
  const blockedBrowser=[];
  await context.route('**/*',async route=>{
    const request=route.request(),url=request.url();if(new URL(url).origin===base)return route.continue();
    if(!((request.method()==='GET'&&url==='https://kondius.cn/qq-agent/captcha-sdk/AliyunCaptcha.js')||(request.method()==='HEAD'&&targets.includes(url)&&url!=='https://www.aliyun.com/'))){blockedBrowser.push(url);return route.abort();}
    external.push({url,method:request.method()});
    if(url==='https://kondius.cn/qq-agent/captcha-sdk/AliyunCaptcha.js'){
      await route.fulfill({contentType:'text/javascript',body:`window.initAliyunCaptcha=function(o){window.qa127InitCount=(window.qa127InitCount||0)+1;window.qa127Scene=o.SceneId;window.qa127Pass=function(){o.success('${proof}');};window.qa127Fail=function(){o.fail();};o.getInstance({show:function(){window.qa127Showing=true;},hide:function(){window.qa127Showing=false;},destroyCaptcha:function(){window.qa127Destroyed=(window.qa127Destroyed||0)+1;}});};`});return;
    }
    assert.ok(targets.includes(url)&&url!=='https://www.aliyun.com/',`unexpected renderer target ${url}`);assert.equal(request.method(),'HEAD');assert.equal(request.headers()['x-console-token'],undefined);assert.equal(request.headers()['x-account-token'],undefined);
    if(url==='https://kondius.cn/qq-agent/captcha-api/')await route.fulfill({status:302,headers:{'access-control-allow-origin':'*',location:'https://evil.invalid/never-follow'},body:''});
    else if(url==='https://o.alicdn.com/')await route.abort('failed');
    else await route.fulfill({status:403,headers:{'access-control-allow-origin':'*'},body:''});
  });
  context.on('request',request=>{if(request.method()==='POST'&&!isSettingsLeaseOpenRequest(request,base))localPosts.push(request.url());});
  const configBeforeNavigation=fs.readFileSync(path.join(dataDir,'config.json'),'utf8');
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${port}/?token=${token}`);
  await page.locator('#nav button[data-panel=community]').click();const panel=page.frameLocator('#panel-host iframe');await panel.locator('#tab-account').click();await panel.locator('#account-state').filter({hasText:'publisher127'}).waitFor();assert.equal(fs.readFileSync(path.join(dataDir,'config.json'),'utf8'),configBeforeNavigation,'community/account navigation preserves the complete config file');
  await panel.locator('#publish-id').fill('publish127');await panel.locator('#publish-name').fill('本地扩展预览');await panel.locator('#publish-desc').fill('保留的说明');await panel.locator('#login-id').fill('保留账号输入');
  const note=panel.locator('#publish-note'),confirm=panel.locator('dialog.confirm-panel');
  async function begin(){await panel.locator('#publish').click();await confirm.waitFor();await confirm.getByRole('button',{name:'确认',exact:true}).click();}

  console.log('· Local confirm/cancel makes no publication; CAPTCHA is host-only, cancel ignores late proof and retains input');
  await panel.locator('#publish').click();await confirm.getByRole('button',{name:'取消',exact:true}).click();assert.equal(remoteCalls.length,0);assert.equal(external.length,0);assert.equal(await panel.locator('#publish').isEnabled(),true);
  await begin();await page.waitForFunction(()=>window.qa127Showing===true);assert.equal(await panel.locator('#publish').isDisabled(),true);assert.equal(remoteCalls.length,0);assert.equal(await page.evaluate(()=>window.qa127Scene),'632wvduj');
  await panel.locator('#publish-cancel').click();await note.filter({hasText:'已取消发布等待'}).waitFor();await page.evaluate(()=>window.qa127Pass());assert.equal(remoteCalls.length,0);assert.equal(await panel.locator('#publish-id').inputValue(),'publish127');assert.equal(await panel.locator('#publish-desc').inputValue(),'保留的说明');assert.equal(await page.locator('[id^=public-captcha-]').count(),0);
  await begin();await page.waitForFunction(()=>window.qa127Showing===true);await page.evaluate(()=>window.qa127Fail());await note.filter({hasText:'人机验证未通过'}).waitFor();assert.equal(remoteCalls.length,0);assert.equal(await panel.locator('#publish').isEnabled(),true);

  console.log('· Actual route/plugin/ZIP multipart consumes proof once; longer upload survives default 15s timeout; remote data cannot return secrets');
  await page.clock.install();let release;holdRemote=new Promise(resolve=>{release=resolve;});await begin();await page.waitForFunction(()=>window.qa127Showing===true);await page.evaluate(()=>window.qa127Pass());
  for(let i=0;i<200&&remoteCalls.length!==1;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(remoteCalls.length,1);
  const call=remoteCalls[0],body=call.body.toString('utf8');assert.equal(call.init.redirect,'manual');assert.equal(call.init.headers['x-account-token'],accountToken);
  for(const field of ['kind','name','description','captchaVerifyParam','file'])assert.match(body,new RegExp(`name="${field}"`));assert.match(body,/publish127\.zip/);assert.match(body,/synthetic-proof127/);assert.match(body,/本地扩展预览/);assert.doesNotMatch(body,/console-secret127|model-secret127|保留账号输入|account-secret127/);
  await page.clock.fastForward(16000);assert.equal(await panel.locator('#publish').isDisabled(),true);assert.match(await note.textContent(),/等待人机验证/);await page.clock.resume();release();holdRemote=null;
  await note.filter({hasText:'发布成功'}).waitFor();assert.match(await note.textContent(),/TEST127/);assert.doesNotMatch(await note.textContent(),/synthetic-proof127|account-secret127|nested/);assert.equal(localPosts.length,1);
  assert.doesNotMatch(await panel.locator('body').evaluate(()=>JSON.stringify(window.qa127Messages)),/synthetic-proof127|console-secret127|model-secret127|account-secret127/);

  console.log('· Upstream quota/redirect and disabled provider are visible, preserve fields, and never follow redirects or invent auth proof');
  remoteStatus=429;await begin();await page.waitForFunction(()=>window.qa127Showing===true);await page.evaluate(()=>window.qa127Pass());await note.filter({hasText:'发布过于频繁'}).waitFor();assert.doesNotMatch(await note.textContent(),/synthetic-proof127|account-secret127/);assert.equal(await panel.locator('#publish-name').inputValue(),'本地扩展预览');
  remoteStatus=302;await begin();await page.waitForFunction(()=>window.qa127Showing===true);await page.evaluate(()=>window.qa127Pass());await note.filter({hasText:'发布过于频繁'}).waitFor();assert.equal(remoteCalls.length,3);assert.ok(remoteCalls.every(call=>call.url.endsWith('/market/publish')));
  await kernel.loader.setEnabled('market',false);const before=await page.evaluate(()=>window.qa127InitCount);await begin();await note.filter({hasText:'未提供该能力'}).waitFor();assert.equal(await page.evaluate(()=>window.qa127InitCount),before);assert.equal(remoteCalls.length,3);await kernel.loader.setEnabled('market',true);
  await panel.locator('body').evaluate(async()=>{const{request,rpc}=await import('/panels/panel-client.js');for(const task of[()=>request('POST','/api/market/publish',{kind:'plugin',id:'publish127'}),()=>rpc('ui.captchaDiagnostics',{url:'https://evil.invalid/'})]){let blocked=false;try{await task();}catch(error){blocked=error.code===-32003||error.code===-32600;}if(!blocked)throw new Error('unsafe request accepted');}});

  console.log('· Host diagnostic modal distinguishes HTTP reachability, renderer opaque status, CSP restriction and interceptor state without losing drafts');
  await panel.locator('#captcha-diagnostics').click();const diagnostic=page.locator('#captcha-diagnostics-dialog');await diagnostic.waitFor();await page.locator('#captcha-interceptor-state').filter({hasText:'已安装'}).waitFor();
  assert.equal(await page.evaluate(()=>window.qa127ProbeCalls),0);assert.equal(external.filter(call=>call.method==='HEAD').length,0);
  await page.locator('#captcha-diagnostics-run').click();await page.locator('#captcha-diagnostics-status').filter({hasText:'检测完成'}).waitFor();assert.equal(await page.evaluate(()=>window.qa127ProbeCalls),1);
  const resultText=await diagnostic.textContent();for(const status of [200,403,404,503])assert.match(resultText,new RegExp(`HTTP 可达（${status}）`));assert.match(resultText,/HTTP 状态不可读/);assert.match(resultText,/连接、CORS 或来源限制/);assert.match(resultText,/未直探（浏览器来源限制）/);assert.match(resultText,/不代表已通过人机验证/);assert.equal(external.filter(call=>call.method==='HEAD').length,3);
  const bounds=await diagnostic.evaluate(node=>{const d=node.getBoundingClientRect(),b=node.querySelector('#captcha-diagnostics-close').getBoundingClientRect();return{overflow:node.scrollWidth>node.clientWidth,inside:d.left>=0&&d.right<=innerWidth&&d.top>=0&&d.bottom<=innerHeight,closeVisible:b.top>=0&&b.bottom<=innerHeight};});assert.equal(bounds.overflow,false);assert.equal(bounds.inside,true);assert.equal(bounds.closeVisible,true);
  fs.mkdirSync('.shots',{recursive:true});await page.screenshot({path:'.shots/captcha-127-diagnostics.png'});
  assert.deepEqual(await diagnostic.evaluate(node=>{node.querySelector('#captcha-diagnostics-close').click();return{connected:node.isConnected,count:document.querySelectorAll('#captcha-diagnostics-dialog').length};}),{connected:false,count:0},'Diagnostic close removes its host DOM in the same task');
  await diagnostic.waitFor({state:'detached'});assert.equal(await diagnostic.count(),0);assert.equal(await panel.locator('#publish-desc').inputValue(),'保留的说明');assert.equal(await panel.locator('#login-id').inputValue(),'保留账号输入');
  await page.evaluate(()=>{window.qa127ProbeFailure=true;window.qa127InterceptorInstalled=false;});await panel.locator('#captcha-diagnostics').click();await page.locator('#captcha-interceptor-state').filter({hasText:'未安装或状态未确认'}).waitFor();await page.locator('#captcha-diagnostics-run').click();await page.locator('#captcha-diagnostics-status').filter({hasText:'检测完成'}).waitFor();for(const label of ['域名解析失败','证书连接失败','请求超时','连接失败'])assert.match(await diagnostic.textContent(),new RegExp(label));await page.locator('#captcha-diagnostics-close').click();await diagnostic.waitFor({state:'detached'});
  await page.evaluate(()=>{window.qa127ProbeHold=true;window.qa127ProbeFailure=false;});await panel.locator('#captcha-diagnostics').click();await page.locator('#captcha-diagnostics-run').click();assert.equal(await page.locator('#captcha-diagnostics-run').isDisabled(),true);await page.waitForFunction(()=>typeof window.qa127ProbeRelease==='function');await page.locator('#captcha-diagnostics-close').click();await diagnostic.waitFor({state:'detached'});await page.evaluate(()=>{window.qa127ProbeHold=false;window.qa127ProbeRelease();});assert.equal(await diagnostic.count(),0);assert.equal(await panel.locator('#publish-desc').inputValue(),'保留的说明');
  await page.evaluate(()=>{window.qa127ProbeReject=true;window.qa127InterceptorInstalled=true;window.qa127InterceptorError=true;});await panel.locator('#captcha-diagnostics').click();await page.locator('#captcha-diagnostics-run').click();await page.locator('#captcha-diagnostics-status').filter({hasText:'检测完成'}).waitFor();assert.match(await diagnostic.textContent(),/桌面检测失败/);assert.doesNotMatch(await diagnostic.textContent(),/private-never-show127|synthetic private failure/);await page.keyboard.press('Escape');await diagnostic.waitFor({state:'detached'});assert.equal(await diagnostic.count(),0);
  assert.doesNotMatch(await panel.locator('body').evaluate(()=>JSON.stringify(window.qa127Messages)),/synthetic-proof127|account-secret127|console-secret127|model-secret127|HTTP 可达/);

  console.log('· Ordinary browser reports missing desktop diagnostics explicitly; wrong bundled panel cannot open or publish');
  await page.evaluate(()=>delete window.qqAgentShell);await panel.locator('#captcha-diagnostics').click();await page.locator('#captcha-interceptor-state').filter({hasText:'当前为浏览器控制台'}).waitFor();await page.locator('#captcha-diagnostics-run').click();await page.locator('#captcha-diagnostics-status').filter({hasText:'检测完成'}).waitFor();assert.match(await diagnostic.textContent(),/需要桌面应用/);await page.locator('#captcha-diagnostics-close').click();await diagnostic.waitFor({state:'detached'});
  await page.locator('#nav button[data-panel=chats]').click();const chats=page.frameLocator('#panel-host iframe');await chats.locator('h2').filter({hasText:'聊天存档'}).waitFor();await chats.locator('body').evaluate(async()=>{const{publishMarket,openCaptchaDiagnostics}=await import('/panels/panel-client.js');for(const task of[()=>publishMarket({kind:'plugin',id:'publish127',accountUsername:'publisher127'}),()=>openCaptchaDiagnostics()]){let blocked=false;try{await task();}catch(error){blocked=error.code===-32003;}if(!blocked)throw new Error('wrong-panel request accepted');}});
  assert.equal(remoteCalls.length,3);assert.deepEqual(errors,[]);assert.ok(external.every(call=>call.method==='HEAD'||call.url.endsWith('/AliyunCaptcha.js')));assert.deepEqual(blockedBrowser,[]);isolation.assertOffline();assertFixtureOwners();
  console.log('✓ 127 Market CAPTCHA publication, safe multipart/proof boundary, cancellation/retry, fixed diagnostic UI and browser/Node distinctions passed');
} finally {try{await browser?.close();await kernel.stop();}finally{cleanupFixture();}}

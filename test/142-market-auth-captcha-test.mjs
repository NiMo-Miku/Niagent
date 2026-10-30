// Offline auth lifecycle, running real shell/opaque community panel/kernel routes.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {createKernel} from '../src/kernel/kernel.js';
import { isolateConsoleFixture } from './console-fixture-isolation.mjs';
import {RpcBridge} from '../ui/shell/rpc-bridge.js';
import {authenticateMarketFromHost} from '../ui/shell/market-authentication.js';
console.log('· Auth preflight cancels immediately; forged panel/source/nonce and concurrent host requests cannot authenticate');
{
 const controller=new AbortController();let verified=false;
 const pending=authenticateMarketFromHost({request:async(method,_path,_body,_query,{signal})=>{assert.equal(method,'GET');return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}},{loginId:'qa142',password:'QA_FAKE',mode:'login'},{signal:controller.signal,verify:()=>{verified=true;}});
 controller.abort(new Error('QA142 preflight cancelled'));await assert.rejects(pending,/preflight cancelled/);assert.equal(verified,false);
 const saved=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};const sent=[],frame={contentWindow:{postMessage:m=>sent.push(m)},addEventListener(){}};let started=0;
 const bridge=new RpcBridge({frame,manifest:{id:'community',kind:'bundled',api:[{method:'POST',path:'/api/market/login'}]},onAuthenticateMarket:async(_,{signal})=>{started++;await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
 const event=()=>({source:frame.contentWindow,origin:'null',data:{jsonrpc:'2.0',id:'auth142',method:'community.authenticateMarket',params:{loginId:'qa142',password:'QA_FAKE',mode:'login'},meta:{nonce:bridge.nonce,panel:bridge.manifest.id}}});
 try{
  for(const patch of [e=>e.source={},e=>e.origin='https://evil.invalid',e=>e.data.meta.nonce='forged',e=>e.data.meta.panel='chats']){let e=event();patch(e);await bridge.handle(e);}assert.equal(started,0);assert.equal(sent.length,0);
  bridge.manifest.kind='user';await bridge.handle(event());assert.equal(sent.at(-1).error.code,-32003);bridge.manifest.kind='bundled';
  let first=bridge.handle(event());await bridge.handle(event());assert.equal(started,1);assert.equal(sent.at(-1).error.data.httpStatus,409);
  let cancel=event();cancel.data.method='community.cancelMarketAuthentication';await bridge.handle(cancel);await first;assert.equal(bridge.authenticationController,null);
  let second=bridge.handle(event());bridge.close();await second;assert.equal(bridge.controllers.size,0);
 }finally{bridge.close();if(saved===undefined)delete globalThis.window;else globalThis.window=saved;}
}
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-auth142-')),calls=[],errors=[];
// Keep the actual default provider closure, with no workspace/installed roots.
const isolation = isolateConsoleFixture(dataDir, '142');
fs.writeFileSync(path.join(isolation.appRoot, 'package.json'), JSON.stringify({type:'module'}));
fs.cpSync(new URL('../src', import.meta.url), path.join(isolation.appRoot, 'src'), {recursive:true});
for (const name of ["community","market"]) fs.cpSync(new URL(`../bundled/${name}`, import.meta.url), path.join(isolation.appRoot, 'bundled', name), {recursive:true});
function assertFixtureOwners(active = false) {
  assert.deepEqual(kernel.loader.listEntries().map(entry => entry.id).sort(), ["community","market"], 'only the actual declared default fixture owners are loaded');
  if (active) {
    for (const id of ["community","market"]) assert.equal(kernel.loader.isActive(id), true, id);
    assert.deepEqual(kernel.capability.providers('market.client').map(item => item.ownerId), ['market']);
    assert.deepEqual(kernel.capability.providers('community.client').map(item => item.ownerId), ['community']);
  }
}
function cleanupFixture() {
  try { isolation.restore(); } finally {
    const relative = path.relative(os.tmpdir(), dataDir);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    fs.rmSync(dataDir, {recursive:true, force:true});
  }
}

let hold=null,accounts=[],mode='ok';
const market={syncGlobalBlocklist:async()=>({ok:true,ids:[]}),getBlocklist:()=>({ok:true,ids:[]}),listAccounts:()=>({ok:true,accounts}),login:async body=>{calls.push(structuredClone(body));if(hold)await hold;if(mode==='error')throw Object.assign(new Error('QA142 认证失败 '+body.password),{expose:true,status:401});accounts=[{username:body.loginId,savedAt:Date.now()}];return {ok:true,account:{username:body.loginId,displayName:`QA142 ${body.password} qa142-host-only-proof QA142_ACCOUNT_TOKEN`,token:'QA142_ACCOUNT_TOKEN',nested:{secret:'QA142_SECRET'}},token:'QA142_ACCOUNT_TOKEN'};}};
const token='qa142-console-token',proof='qa142-host-only-proof';
const kernel=createKernel({appRoot:isolation.appRoot,env:isolation.env,headless:true,fetchImpl:(...args)=>fetch(...args),transport:{id:'fixture',start(){},stop(){},status:()=>({connected:true}),actions:{}},priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },communityMarket:market});
kernel.config.update({server:{port:0,token},telemetry:{enabled:false},proactive:{enabled:false},});
kernel.loader.startWatchers=()=>{};
let browser;
try{
 const port=await kernel.start(),base=isolation.allowOrigin(`http://127.0.0.1:${port}`),pw=createRequire(import.meta.url)('playwright-core');assertFixtureOwners(true);
 const cache=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ms-playwright');
 const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??fs.readdirSync(cache).filter(x=>/^chromium-\d+$/.test(x)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9))).map(x=>path.join(cache,x,'chrome-win64/chrome.exe')).find(x=>fs.existsSync(x));
 browser=await pw.chromium.launch({executablePath,headless:true});
 const context=await browser.newContext({viewport:{width:1100,height:800}});
 await context.addInitScript(()=>{window.qa142Messages=[];window.addEventListener('message',e=>window.qa142Messages.push(e.data));});
 const blockedBrowser=[];
  await context.route('**/*',async route=>{const request=route.request();if(new URL(request.url()).origin===base)return route.continue();if(request.method()!=='GET'||request.url()!=='https://kondius.cn/qq-agent/captcha-sdk/AliyunCaptcha.js'){blockedBrowser.push(request.url());return route.abort();}assert.equal(route.request().method(),'GET');assert.equal(route.request().url(),'https://kondius.cn/qq-agent/captcha-sdk/AliyunCaptcha.js');await route.fulfill({contentType:'text/javascript',body:`window.initAliyunCaptcha=function(o){window.qa142Count=(window.qa142Count||0)+1;window.qa142Pass=()=>o.success('${proof}');window.qa142Fail=()=>o.fail();window.qa142Invalid=()=>o.success('');o.getInstance({show(){window.qa142Shown=true;},hide(){window.qa142Shown=false;},destroyCaptcha(){}});};`});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/?token=${token}`);await page.locator('#nav button[data-panel=community]').click();
 const panel=page.frameLocator('#panel-host iframe');await panel.locator('#login-id').fill('qa142-user');await panel.locator('#login-password').fill('QA142_FAKE_PASSWORD');
 console.log('· Login starts a host CAPTCHA before any auth POST; cancels and ignores late proof');
 await panel.locator('#login').click();await page.waitForFunction(()=>window.qa142Shown===true,{},{timeout:3000}).catch(async error=>{console.error(JSON.stringify({stage:'first-login-before-proof',authPosts:calls.length,hostCaptchaStarts:await page.evaluate(()=>window.qa142Count??0)}));throw error;});assert.equal(calls.length,0);assert.equal(await panel.locator('#login').isDisabled(),true);assert.equal(await panel.locator('#register').isDisabled(),true);
 await panel.locator('#login-cancel').click();await panel.locator('#login-note').filter({hasText:'已取消'}).waitFor();await page.evaluate(()=>window.qa142Pass());assert.equal(calls.length,0);assert.equal(await panel.locator('#login-password').inputValue(),'QA142_FAKE_PASSWORD');assert.equal(await page.locator('[id^=public-captcha-]').count(),0);
 console.log('· Failed/invalid verification never calls authentication and retains retry fields');
 await panel.locator('#login').click();await page.waitForFunction(()=>window.qa142Shown===true);await page.evaluate(()=>window.qa142Fail());await panel.locator('#login-note').filter({hasText:'未通过'}).waitFor();assert.equal(calls.length,0);
 await panel.locator('#login').click();await page.waitForFunction(()=>window.qa142Shown===true);await page.evaluate(()=>window.qa142Invalid());await panel.locator('#login-note').filter({hasText:'有效凭据'}).waitFor();assert.equal(calls.length,0);
 console.log('· One successful proof submits official fields once; response/proof remain secret-free in iframe; new password draft survives late response');
 let release;hold=new Promise(r=>release=r);await panel.locator('#login').click();await page.waitForFunction(()=>window.qa142Shown===true);await page.evaluate(()=>window.qa142Pass());
 for(let n=0;n<100&&calls.length<1;n++)await new Promise(r=>setTimeout(r,10));assert.equal(calls.length,1);assert.deepEqual(calls[0],{loginId:'qa142-user',password:'QA142_FAKE_PASSWORD',mode:'login'});
 await panel.locator('#login-password').fill('QA142_NEXT_DRAFT');release();hold=null;await panel.locator('#login-note').filter({hasText:'登录成功'}).waitFor();assert.equal(await panel.locator('#login-password').inputValue(),'QA142_NEXT_DRAFT');let replies=await panel.locator('body').evaluate(()=>window.qa142Messages.filter(m=>Object.hasOwn(m,'result')||Object.hasOwn(m,'error')));assert.doesNotMatch(JSON.stringify(replies),/qa142-host-only-proof|QA142_ACCOUNT_TOKEN|QA142_SECRET|QA142_FAKE_PASSWORD/);
 console.log('· Register cancel does not open CAPTCHA; confirmed register passes only official fields');
 await panel.locator('#login-name').fill('QA142显示名');await panel.locator('#register').click();await panel.locator('dialog.confirm-panel').getByRole('button',{name:'取消',exact:true}).click();assert.equal(calls.length,1);
 await panel.locator('#register').click();await panel.locator('dialog.confirm-panel').getByRole('button',{name:'确认',exact:true}).click();await page.waitForFunction(()=>window.qa142Shown===true);await page.evaluate(()=>window.qa142Pass());await panel.locator('#login-note').filter({hasText:'注册成功'}).waitFor();assert.deepEqual(calls[1],{loginId:'qa142-user',password:'QA142_NEXT_DRAFT',displayName:'QA142显示名',mode:'register'});assert.equal(await panel.locator('#login-password').inputValue(),'');
 console.log('· Leaving cancels CAPTCHA; direct POST and non-community RPC cannot bypass host gate');
 await panel.locator('#login-password').fill('QA142_FAKE_PASSWORD');await panel.locator('#login').click();await page.waitForFunction(()=>window.qa142Shown===true);await page.locator('#nav button[data-panel=sessions]').click();assert.equal(await page.locator('[id^=public-captcha-]').count(),0);await page.evaluate(()=>window.qa142Pass());assert.equal(calls.length,2);
 await page.locator('#nav button[data-panel=community]').click();await panel.locator('body').evaluate(async()=>{let{request}=await import('/panels/panel-client.js');try{await request('POST','/api/market/login',{loginId:'bypass',password:'bypass'});throw Error('direct POST accepted');}catch(e){if(e.code!==-32003)throw e;}});
 await page.locator('#nav button[data-panel=chats]').click();const other=page.frameLocator('#panel-host iframe');await other.locator('h2').waitFor();await other.locator('body').evaluate(async()=>{let{rpc}=await import('/panels/panel-client.js');for(let method of ['community.authenticateMarket','community.cancelMarketAuthentication']){try{await rpc(method,{loginId:'bypass',password:'bypass',mode:'login'});throw Error('other panel accepted');}catch(e){if(e.code!==-32003)throw e;}}});assert.equal(calls.length,2);assert.deepEqual(errors,[]);assert.deepEqual(blockedBrowser,[]);isolation.assertOffline();assertFixtureOwners();
 console.log('✓ 142 Offline host authentication CAPTCHA lifecycle and opaque-panel boundaries passed');
}finally{try{await browser?.close();await kernel.stop();}finally{cleanupFixture();}}

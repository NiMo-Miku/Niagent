// Real Chromium; temporary DOM and injected diagnostics only. No real account,
// credential, external request, desktop window or backend data is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const uiAt=process.argv.indexOf('--ui-root'),uiRoot=uiAt<0?path.join(root,'ui'):path.resolve(process.argv[uiAt+1]);
const evidenceAt=process.argv.indexOf('--evidence-dir'),evidenceDir=evidenceAt<0?path.join(root,'.qa-local/performance-icons-20261013'):path.resolve(process.argv[evidenceAt+1]);
fs.mkdirSync(evidenceDir,{recursive:true});
const requests=[],errors=[],result={recordedAt:new Date().toISOString(),method:'Real Chromium native dialog, keyboard Escape and same-task DOM/state assertions with synthetic credentials and injected probes.',checks:[]};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');requests.push(url.pathname);
  res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><button id="outside">Outside</button>');return;}
  if(url.pathname==='/api/config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({server:{hasToken:true}}));return;}
  if(!/^\/(panels|shell)\//.test(url.pathname)){res.writeHead(404);res.end();return;}
  const file=path.resolve(uiRoot,url.pathname.slice(1)),relative=path.relative(uiRoot,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const playwright=createRequire(import.meta.url)('playwright-core'),cache=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ms-playwright');
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9))).map(name=>path.join(cache,name,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));
let browser;
try{
  browser=await playwright.chromium.launch({executablePath,headless:true});
  const context=await browser.newContext(),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await page.goto(base);
  await page.evaluate(async()=>{
    const {installDisposableDialog}=await import('/panels/dialog-lifecycle.js');
    window.nativeDialogClose=HTMLDialogElement.prototype.close;
    window.makeDialog=(before)=>{
      const dialog=document.createElement('dialog');dialog.innerHTML='<p>Temporary confirmation</p><button type="button">Focus target</button>';
      document.body.append(dialog);before?.(dialog);
      const state={dialog,closes:0};state.life=installDisposableDialog(dialog,{onClosed:()=>state.closes++});
      dialog.showModal();return state;
    };
    const {createTokenManagement}=await import('/shell/token-management.js');
    window.qaAuth={token:'synthetic-current140',adopt(value){this.token=value;}};
    window.qaWrites=[];window.qaAdoptions=[];
    window.qaApi={base:'',timeout:2000,setToken:value=>window.qaAdoptions.push(value),post:async(route,body)=>{window.qaWrites.push({route,body});if(window.qaHoldWrite)await new Promise(resolve=>window.qaWriteRelease=resolve);return{ok:true};}};
    window.tokenManager=createTokenManagement({api:window.qaApi,auth:window.qaAuth,sse:{setToken:value=>window.qaAdoptions.push(value)}});
    const {createCaptchaDiagnostics}=await import('/shell/captcha-diagnostics.js');
    window.qaProbeSignals=[];window.qaNodeReleases=[];
    const win={qqAgentShell:{captchaInterceptorStatus:async()=>({installed:true,redirectCount:0}),captchaNetProbe:()=>new Promise(resolve=>window.qaNodeReleases.push(resolve))}};
    const fetchImpl=(_url,{signal})=>{window.qaProbeSignals.push(signal);return new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});};
    window.diagnostics=createCaptchaDiagnostics({win,doc:document,fetchImpl});
  });

  console.log('· Explicit close releases DOM/state synchronously and preserves native returnValue exactly once');
  assert.deepEqual(await page.evaluate(()=>{
    const old=window.oldConfirmation=makeDialog();old.dialog.close('accept');
    const after={connected:old.dialog.isConnected,count:document.querySelectorAll('dialog').length,returnValue:old.dialog.returnValue,closes:old.closes,closed:old.life.closed};
    old.dialog.close('cancel');old.dialog.dispatchEvent(new Event('close'));old.life.dispose();
    const fresh=window.freshConfirmation=makeDialog();old.dialog.dispatchEvent(new Event('close'));
    return{...after,afterRepeated:old.closes,afterValue:old.dialog.returnValue,freshConnected:fresh.dialog.isConnected,freshOpen:fresh.dialog.open,prototypeUnchanged:HTMLDialogElement.prototype.close===window.nativeDialogClose};
  }),{connected:false,count:0,returnValue:'accept',closes:1,closed:true,afterRepeated:1,afterValue:'accept',freshConnected:true,freshOpen:true,prototypeUnchanged:true});
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>({count:document.querySelectorAll('dialog').length,closes:freshConfirmation.closes})),{count:0,closes:1});
  result.checks.push('same-task removal; native returnValue; repeated and delayed close once; old close does not affect fresh dialog; real Escape; native prototype unchanged');

  console.log('· Previously prevented cancel is honored; the native close-event fallback remains idempotent');
  await page.evaluate(()=>{
    window.preventCancel=event=>event.preventDefault();window.preventedDialog=makeDialog(dialog=>dialog.addEventListener('cancel',window.preventCancel));
  });
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>({open:preventedDialog.dialog.open,connected:preventedDialog.dialog.isConnected,closes:preventedDialog.closes})),{open:true,connected:true,closes:0});
  await page.evaluate(()=>preventedDialog.dialog.removeEventListener('cancel',window.preventCancel));
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>preventedDialog.closes),1);
  await page.evaluate(()=>{window.nativeFallback=makeDialog();window.nativeDialogClose.call(nativeFallback.dialog,'native-result');});
  await page.waitForFunction(()=>window.nativeFallback.life.closed);
  assert.deepEqual(await page.evaluate(()=>({value:nativeFallback.dialog.returnValue,connected:nativeFallback.dialog.isConnected,closes:nativeFallback.closes})),{value:'native-result',connected:false,closes:1});
  result.checks.push('defaultPrevented cancel preserved; direct native close-event fallback once');

  console.log('· Host token close clears both secrets in the same task, and delayed old close cannot release a fresh manager');
  assert.deepEqual(await page.evaluate(()=>{
    const rpcResult=tokenManager.open(),old=window.oldTokenDialog=document.querySelector('#console-token-dialog');
    window.oldCurrent=old.querySelector('#console-token-current');window.oldNext=old.querySelector('#console-token-new');oldNext.value='synthetic-next140';
    old.querySelector('.dialog-actions button').click();
    const closed={connected:old.isConnected,currentCleared:oldCurrent.value==='',nextCleared:oldNext.value==='',count:document.querySelectorAll('#console-token-dialog').length};
    tokenManager.open();const fresh=window.freshTokenDialog=document.querySelector('#console-token-dialog');old.dispatchEvent(new Event('close'));
    tokenManager.open();return{...closed,rpcResult,oneFresh:document.querySelectorAll('#console-token-dialog').length===1,freshConnected:fresh.isConnected,freshOpen:fresh.open};
  }),{connected:false,currentCleared:true,nextCleared:true,count:0,rpcResult:{ok:true},oneFresh:true,freshConnected:true,freshOpen:true});
  await page.evaluate(()=>{window.qaHoldWrite=true;freshTokenDialog.querySelector('#console-token-new').value='synthetic-saved140';freshTokenDialog.querySelector('.primary').click();});
  await page.waitForFunction(()=>typeof window.qaWriteRelease==='function');
  assert.deepEqual(await page.evaluate(()=>{
    const dialog=freshTokenDialog,button=dialog.querySelector('.dialog-actions button');button.click();dialog.close();
    const cancel=new Event('cancel',{cancelable:true});dialog.dispatchEvent(cancel);
    return{open:dialog.open,connected:dialog.isConnected,disabled:button.disabled,prevented:cancel.defaultPrevented,credentialsRetained:dialog.querySelector('#console-token-current').value===qaAuth.token};
  }),{open:true,connected:true,disabled:true,prevented:true,credentialsRetained:true});
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>freshTokenDialog.open),true);
  await page.evaluate(()=>{window.qaHoldWrite=false;window.qaWriteRelease();});
  await page.locator('#console-token-status').filter({hasText:'连接已更新'}).waitFor();
  assert.equal(await page.evaluate(()=>window.qaAuth.token),'synthetic-saved140');
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>({count:document.querySelectorAll('#console-token-dialog').length,currentCleared:freshTokenDialog.querySelector('#console-token-current').value==='',nextCleared:freshTokenDialog.querySelector('#console-token-new').value===''})),{count:0,currentCleared:true,nextCleared:true});
  result.checks.push('host secret buffers cleared synchronously; old/new manager isolation; busy close button, explicit close, cancel and real Escape blocked; confirmed save retained');

  console.log('· Diagnostic close aborts renderer signals in the same task; late old desktop results cannot touch a new instance');
  assert.deepEqual(await page.evaluate(()=>{
    diagnostics.open();window.oldDiagnostic=document.querySelector('#captcha-diagnostics-dialog');oldDiagnostic.querySelector('#captcha-diagnostics-run').click();
    const signals=window.oldDiagnosticSignals=qaProbeSignals.slice();oldDiagnostic.querySelector('#captcha-diagnostics-close').click();
    const closed={count:document.querySelectorAll('#captcha-diagnostics-dialog').length,connected:oldDiagnostic.isConnected,signals:signals.length,aborted:signals.every(signal=>signal.aborted)};
    diagnostics.open();window.freshDiagnostic=document.querySelector('#captcha-diagnostics-dialog');oldDiagnostic.dispatchEvent(new Event('close'));diagnostics.open();
    return{...closed,oneFresh:document.querySelectorAll('#captcha-diagnostics-dialog').length===1,freshOpen:freshDiagnostic.open};
  }),{count:0,connected:false,signals:3,aborted:true,oneFresh:true,freshOpen:true});
  await page.waitForFunction(()=>window.qaNodeReleases.length===1);
  await page.evaluate(()=>window.qaNodeReleases[0]({targets:[]}));
  assert.deepEqual(await page.evaluate(()=>({open:freshDiagnostic.open,connected:freshDiagnostic.isConnected,status:freshDiagnostic.querySelector('#captcha-diagnostics-status').textContent})),{open:true,connected:true,status:'点击“检测网络”开始；不会登录或发布内容。'});
  await page.evaluate(()=>freshDiagnostic.querySelector('#captcha-diagnostics-run').click());
  await page.waitForFunction(()=>window.qaNodeReleases.length===2);
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>({count:document.querySelectorAll('#captcha-diagnostics-dialog').length,aborted:qaProbeSignals.slice(3).every(signal=>signal.aborted),signals:qaProbeSignals.length})),{count:0,aborted:true,signals:6});
  await page.evaluate(()=>window.qaNodeReleases[1]({targets:[]}));
  result.checks.push('diagnostic same-task signal abort/removal; old close/result isolation; real Escape abort; fixed targets only');

  console.log('· Real YAML replace confirmation: disabled parent save, cancel/Escape restore live parent focus and draft without an import');
  await page.evaluate(async()=>{
    const {importCatalog}=await import('/panels/settings/spec-editors.js');
    window.qaImportWrites=[];window.qaImportSaves=0;window.qaImportReloads=0;
    window.openImport=()=>importCatalog({request:async(...args)=>{qaImportWrites.push(args);return{ok:true};},save:async()=>{qaImportSaves++;},reload:async()=>{qaImportReloads++;}});
  });
  for(const closeMode of ['cancel-button','Escape']){
    await page.evaluate(()=>openImport());
    const parent=page.locator('dialog.settings-spec-dialog');
    const textarea=parent.locator('textarea');
    const draft=`providers:\n  - id: qa140-${closeMode}\n    baseURL: http://127.0.0.1:1/v1\n    models: [qa140]\n`;
    await textarea.fill(draft);
    await parent.getByRole('checkbox').check();
    await parent.getByRole('button',{name:'保存',exact:true}).click();
    const nested=page.locator('dialog.confirm-panel');await nested.waitFor();
    assert.equal(await parent.getByRole('button',{name:'保存',exact:true}).isDisabled(),true);
    if(closeMode==='Escape')await page.keyboard.press('Escape');else await nested.getByRole('button',{name:'取消',exact:true}).click();
    await nested.waitFor({state:'detached'});
    await parent.getByRole('button',{name:'保存',exact:true}).waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.querySelector('dialog.settings-spec-dialog .primary').disabled);
    const focus=await page.evaluate(()=>{const parent=document.querySelector('dialog.settings-spec-dialog');return{inside:parent.contains(document.activeElement),tag:document.activeElement.tagName,open:parent.open,imports:qaImportWrites.length,saves:qaImportSaves,reloads:qaImportReloads};});
    result.checks.push({phase:`nested-${closeMode}`,focus});
    assert.equal(focus.inside,true,'nested close must restore keyboard focus inside the surviving parent modal, notBODY');
    assert.equal(focus.open,true);assert.equal(focus.imports,0);assert.equal(focus.saves,0);assert.equal(focus.reloads,0);
    assert.equal(await textarea.inputValue(),draft);assert.equal(await parent.getByRole('checkbox').isChecked(),true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.querySelector('dialog.settings-spec-dialog').contains(document.activeElement)),true,'real Tab continues within parent dialog');
    await textarea.focus();await page.keyboard.type('# continued after nested close');
    assert.equal(await textarea.inputValue(),draft+'# continued after nested close');
    await parent.getByRole('button',{name:'取消',exact:true}).click();
    await parent.waitFor({state:'detached'});
    assert.equal(await page.locator('dialog').count(),0);
    result.checks.push(`real${closeMode}: restoredfocus, keyboardTab, draft/editability andcancel all preserved; noimport/save/reload`);
  }

  console.log('· Return to an enabled original control; parent fallback skips disabled/hidden fields and never steals from a fresh modal');
  assert.deepEqual(await page.evaluate(async()=>{
    const {installDisposableDialog}=await import('/panels/dialog-lifecycle.js');
    const parent=document.createElement('dialog');parent.innerHTML='<input disabled><input hidden><input id="qa140-original"><button>Parent action</button>';document.body.append(parent);installDisposableDialog(parent);parent.showModal();
    const target=parent.querySelector('#qa140-original');target.focus();
    const nested=makeDialog();nested.dialog.close('cancel');
    const enabledOriginalRestored=document.activeElement===target;
    const busy=parent.querySelector('button');busy.focus();busy.disabled=true;
    const blocked=makeDialog();blocked.dialog.close('cancel');
    const disabledOpenerFallsBackToVisibleField=document.activeElement===target;busy.disabled=false;
    const child=document.createElement('dialog');child.innerHTML='<button>Child</button>';document.body.append(child);
    let fresh;installDisposableDialog(child,{onClosed:()=>{fresh=makeDialog();}});child.showModal();child.close();
    const freshKeepsFocus=fresh.dialog.contains(document.activeElement);fresh.dialog.close();parent.close();
    return{enabledOriginalRestored,disabledOpenerFallsBackToVisibleField,freshKeepsFocus,count:document.querySelectorAll('dialog').length};
  }),{enabledOriginalRestored:true,disabledOpenerFallsBackToVisibleField:true,freshKeepsFocus:true,count:0});
  result.checks.push('enabledoriginalcontrol/nativefocus preserved; hiddenanddisabledcandidate bypass; newlyopenedmodalnotstolen');
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(route=>route==='/'||route==='/api/config'||/^\/(panels|shell)\//.test(route)));
  result.errors=errors;result.requests=requests;result.ok=true;
  console.log('✓ 140 disposable modal same-task cleanup, native semantics, busy token guard, sensitive fields and diagnostic cancellation passed');
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  result.ok??=false;result.errors=errors;
  fs.writeFileSync(path.join(evidenceDir,`dialog-lifecycle-${result.recordedAt.replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}.json`),JSON.stringify(result,null,2));
}

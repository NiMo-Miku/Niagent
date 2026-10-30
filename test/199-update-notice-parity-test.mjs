import {settingsSection} from './settings-navigation.mjs';
import assert from 'node:assert/strict';
import {modelUiFixture} from './model-ui-fixture.mjs';
const wait=async fn=>{for(let i=0;i<500;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('update state did not settle');};
let calls=0,hold=null;
let result={ok:true,current:'0.5.0',latest:'0.6.0',hasUpdate:true,url:'https://example.test/release',notes:'<img src=x> synthetic release notes'};
const f=await modelUiFixture({updateCheck:async()=>{calls++;await hold?.promise;return result;}});
try{
  const notice=f.page.locator('.update-notice'),widget=f.frame.locator('.settings-update');await notice.waitFor();await settingsSection(f.frame,'updates');await widget.waitFor();
  await widget.getByRole('button',{name:'检查版本',exact:true}).waitFor();await wait(async()=>!(await widget.getByRole('button',{name:'检查版本',exact:true}).isDisabled()));
  assert.equal(calls,1,'one host startup check');assert.match(await notice.innerText(),/0.6.0/);assert.equal(await notice.locator('img').count(),0);assert.equal(await notice.locator('a').getAttribute('href'),'https://example.test/release');
  assert.equal(await f.page.locator('#nav button[data-panel=settings]').evaluate(n=>n.classList.contains('update-available')),true);
  await settingsSection(f.frame,'updates');await wait(async()=>await f.frame.locator('#settings-sidebar a[data-target=desktop]').getAttribute('data-update-available')==='true');
  await f.frame.locator('#settings-filter').fill('桌面');await f.frame.locator('#settings-filter').fill('');await wait(async()=>await f.frame.locator('#settings-sidebar a[data-target=desktop]').getAttribute('data-update-available')==='true');
  await notice.getByRole('button',{name:'关闭更新提示'}).click();await notice.waitFor({state:'hidden'});
  await f.page.clock.install();
  await widget.getByRole('button',{name:'检查版本',exact:true}).click();await notice.waitFor();await wait(async()=>calls===2);
  await notice.getByRole('button',{name:'关闭更新提示'}).click();await f.page.clock.runFor(3600100);await wait(async()=>calls===3);await wait(async()=>!(await widget.getByRole('button',{name:'检查版本',exact:true}).isDisabled()));assert.equal(await notice.isVisible(),false,'dismissal suppresses later automatic notices in this document');
  result={ok:false,error:'synthetic offline'};await widget.getByRole('button',{name:'检查版本',exact:true}).click();await widget.getByText(/检查失败：synthetic offline/).waitFor();assert.match(await widget.innerText(),/保留上次成功结果/);assert.match(await widget.innerText(),/0.6.0/);
  await widget.getByRole('button',{name:'查看更新与下载'}).click();await notice.waitFor();
  result={ok:true,current:'0.5.0',latest:'0.7.0',hasUpdate:true,url:'javascript:alert(1)',notes:'unsafe url remains plain data'};await widget.getByRole('button',{name:'检查版本',exact:true}).click();await wait(async()=>/0.7.0/.test(await notice.innerText()));assert.equal(await notice.locator('a').isVisible(),false);assert.equal(await notice.locator('a').getAttribute('href'),null);
  result={ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false,url:'https://example.test',notes:''};await widget.getByRole('button',{name:'检查版本',exact:true}).click();await widget.getByText(/已是最新版本/).waitFor();assert.equal(await notice.isVisible(),false);assert.equal(await f.page.locator('#nav button[data-panel=settings]').evaluate(n=>n.classList.contains('update-available')),false);
  let release;hold={promise:new Promise(r=>{release=r;})};
  const before=calls;const concurrent=f.frame.locator('body').evaluate(async()=>{const m=await import('/panels/panel-client.js');return Promise.all([m.consoleUpdate({action:'check'}),m.consoleUpdate({action:'check'})]);});await wait(async()=>calls===before+1);release();hold=null;await concurrent;assert.equal(calls,before+1,'concurrent manual requests share one backend request');
  // Even settings must not attach an arbitrary URL or invoke unknown actions.
  const invalid=await f.frame.locator('body').evaluate(async()=>{const m=await import('/panels/panel-client.js');try{await m.consoleUpdate({action:'reveal',url:'https://evil.test'});return false;}catch{return true;}});assert.equal(invalid,true);
  const cleanup=await f.page.evaluate(async()=>{
    const {createUpdateNotice}=await import('/update-notice.js');const doc=document.implementation.createHTMLDocument('owned lifecycle test'),timers=new Map();let release,published=0;
    const gate=new Promise(r=>{release=r;});const controller=createUpdateNotice({api:{get:()=>gate},doc,win:{setTimeout(fn){timers.set(1,fn);return 1;},clearTimeout(id){timers.delete(id);}},onStatus(){published++;}});
    const pending=controller.check();await Promise.resolve();const before=published;controller.dispose();release({ok:true,current:'0.5.0',latest:'0.6.0',hasUpdate:true});await pending;return{before,after:published,timers:timers.size,boxes:doc.querySelectorAll('.update-notice').length};
  });assert.deepEqual(cleanup,{before:1,after:1,timers:0,boxes:0},'late completion cannot revive a disposed controller');
  const ordering=await f.page.evaluate(async()=>{
    const {mountUpdateStatus}=await import('/panels/settings/update-status.js');const host=document.createElement('section');document.body.append(host);let listener,resolveManual;
    const value=(revision,busy,latest)=>({revision,busy,error:'',result:{current:'0.5.0',latest,hasUpdate:true}});
    const dispose=mountUpdateStatus({host,action:({action})=>action==='status'?Promise.resolve(value(1,false,'0.6.0')):new Promise(r=>{resolveManual=r;}),subscribe:fn=>{listener=fn;return()=>{};}});
    await new Promise(r=>setTimeout(r,0));const button=host.querySelector('button');button.click();listener('update-status',value(3,true,'0.7.0'));resolveManual(value(2,false,'0.6.0'));await new Promise(r=>setTimeout(r,0));const out={text:host.querySelector('[role=status]').textContent,disabled:button.disabled};listener('update-status',value(4,false,'0.7.0'));out.unlocked=!button.disabled;dispose();host.remove();return out;
  });assert.match(ordering.text,/0.7.0/);assert.equal(ordering.disabled,true,'a stale response cannot unlock a newer check');assert.equal(ordering.unlocked,true);
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);
  console.log('✓ update notice: startup/hourly shared checks, dismissal/manual re-open, persistent badge, failed-check retention, safe links, single flight and strict host parameters');
}finally{await f.close();}
const replacement=await modelUiFixture({uiAssetPath:'shell/update-notice.js',uiAsset:`export function createUpdateNotice({onStatus}){const state={result:{ok:true,current:'0.5.0',latest:'9.9.9',hasUpdate:true,notes:'追加更新策略'},error:'',checkedAt:1,busy:false};return{check:async()=>{onStatus(state);return state},action:()=>state,repaint(){},dispose(){}}}`});
try{await settingsSection(replacement.frame,'updates');await replacement.frame.locator('.settings-update').getByText(/追加更新策略/).waitFor();assert.deepEqual(replacement.errors,[]);assert.equal(replacement.outbound(),0);console.log('✓ real appended host update policy consumed by the unchanged settings widget');}finally{await replacement.close();}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {settingsEditor,settingsProvider} from './settings-navigation.mjs';

const f=await modelUiFixture();
let appended;
const edit=()=>f.frame.locator('dialog').filter({has:f.frame.locator('#provider-edit-name')});
// The removed launch button is no longer a default UI consumer. Keep the
// existing editor's public compatibility API covered independently; 260 checks
// the actual new inline manager and its appended replacement.
const compatibilityEditor=async(frame)=>{await settingsEditor(frame,'model-manager');await frame.locator('body').evaluate(async()=>{const{request}=await import('/panels/panel-client.js'),{openProviderEditor}=await import('./provider-editor.js');const provider=(await request('GET','/api/providers')).providers.find(p=>p.id==='a');openProviderEditor({provider,request,beforeWrite:async()=>{},changed:async()=>{document.querySelector('#reload').click();},cleared:async()=>{}});});};
const open=async()=>{await compatibilityEditor(f.frame);await edit().waitFor();};
const save=async()=>{await edit().getByRole('button',{name:'保存渠道',exact:true}).click();};
const view=async()=> (await f.request('GET','/api/providers')).data.providers.find(p=>p.id==='a');
const expected=p=>({baseUrl:p.baseURL,displayName:p.displayName,models:p.models.map(m=>typeof m==='string'?m:m.id),credentialRevision:p.credentialRevision});
try {
  await open();
  assert.equal((await f.request('POST','/api/providers',{id:'c',baseUrl:f.modelBase+'/c/v1',models:['c-model'],apiKey:'synthetic-c'})).status,200);
  assert.equal((await f.request('POST','/api/providers/models',{providerId:'a',models:[{id:'concurrent',name:'new metadata',vision:true}],modelNames:{concurrent:'concurrent label'}})).status,200);
  await edit().locator('#provider-edit-name').fill('A edited');
  await edit().locator('#provider-edit-key').fill('synthetic-edited-a');
  await edit().locator('#provider-edit-base').fill(f.modelBase+'/new-a/v1');
  const events=[],unsubscribe=f.kernel.config.onChange(cfg=>events.push(structuredClone(cfg))),writeStart=f.writes.length;
  await save();await f.frame.locator('#provider-edit-name').waitFor({state:'detached'});await f.card('a').filter({hasText:'A edited'}).waitFor();unsubscribe();
  assert.equal(events.length,1,'metadata, endpoint, active binding and key have one commit');
  const now=f.disk();
  assert.equal(now.api.baseUrl,f.modelBase+'/new-a/v1');assert.equal(now.api.model,'shared');assert.equal(now.dshProviderKeys.a,'synthetic-edited-a');
  assert.equal(now.dshProviderKeys.c,'synthetic-c');assert.ok(now.providers.some(p=>p.id==='c'));
  assert.ok(now.providers.find(p=>p.id==='a').models.some(m=>m.id==='concurrent'&&m.vision===true));
  const posted=f.writes.slice(writeStart);assert.deepEqual(posted.map(r=>r.path),['/api/providers/update']);
  assert.equal(Object.hasOwn(posted[0].body.changes,'models'),false,'untouched directory is never submitted from stale UI');
  assert.equal(posted[0].body.expected.credentialRevision.length,64);assert.equal(JSON.stringify(posted[0].body.expected).includes('synthetic-key-a'),false);

  await open();await edit().locator('#provider-edit-models').fill('shared\nmanual-new');
  await f.request('POST','/api/providers/models',{providerId:'a',models:['later-model']});
  const conflictBefore=fs.readFileSync(f.kernel.config.file,'utf8');
  await save();await edit().locator('.error').filter({hasText:'模型目录已被修改'}).waitFor();
  assert.equal(fs.readFileSync(f.kernel.config.file,'utf8'),conflictBefore);await edit().getByRole('button',{name:'关闭',exact:true}).click();
  await f.openSettings();await open();await edit().locator('#provider-edit-models').fill('shared\nmanual-new');
  await save();await f.frame.locator('#provider-edit-name').waitFor({state:'detached'});
  const retained=f.disk().providers.find(p=>p.id==='a');
  assert.deepEqual(retained.models,[{id:'shared',name:'A Shared',vision:true,contextLimit:128000},'manual-new']);assert.deepEqual(retained.modelNames,{shared:'A显示名'});

  let snapshot=await view();
  await f.request('POST','/api/providers/set-key',{providerId:'a',apiKey:'synthetic-concurrent-key'});
  let answer=await f.request('POST','/api/providers/update',{providerId:'a',expected:expected(snapshot),changes:{displayName:'must-not-change',apiKey:'must-not-store'}});
  assert.equal(answer.status,409);assert.equal(f.disk().dshProviderKeys.a,'synthetic-concurrent-key');assert.equal(f.disk().providers.find(p=>p.id==='a').displayName,'A edited');
  snapshot=await view();
  answer=await f.request('POST','/api/providers/update',{providerId:'a',expected:{...expected(snapshot),displayName:'outdated'},changes:{displayName:'stale'}});assert.equal(answer.status,409);
  answer=await f.request('POST','/api/providers/update',{providerId:'a',expected:{...expected(snapshot),baseUrl:f.modelBase+'/outdated'},changes:{apiKey:'stale'}});assert.equal(answer.status,409);
  answer=await f.request('POST','/api/providers/update',{providerId:'a',expected:expected(snapshot),changes:{baseUrl:'https://user:secret@invalid.test/v1'}});assert.equal(answer.status,400);
  answer=await f.request('POST','/api/providers/update',{providerId:'a',expected:expected(snapshot),changes:{displayName:'Concurrent name'}});assert.equal(answer.status,200);
  answer=await f.request('POST','/api/providers/update',{providerId:'a',expected:expected(snapshot),changes:{models:[]}});assert.equal(answer.status,200);assert.deepEqual(f.disk().providers.find(p=>p.id==='a').models,[]);
  assert.equal(f.disk().providers.find(p=>p.id==='a').displayName,'Concurrent name','different fields from the same old snapshot compose without reverting a newer name');

  // Fail the production store's real temporary write, not a mocked route.
  await f.openSettings();await open();await edit().locator('#provider-edit-name').fill('atomic-failure-name');await edit().locator('#provider-edit-key').fill('atomic-failure-key');
  const before=structuredClone(f.kernel.config.get()),bytes=fs.readFileSync(f.kernel.config.file,'utf8'),notices=[];
  const stop=f.kernel.config.onChange(cfg=>notices.push(cfg)),tmp=f.kernel.config.file+'.tmp';fs.mkdirSync(tmp);
  try {await save();await edit().locator('.error').waitFor();assert.deepEqual(f.kernel.config.get(),before);assert.equal(fs.readFileSync(f.kernel.config.file,'utf8'),bytes);assert.equal(notices.length,0);}
  finally {stop();assert.equal(path.dirname(tmp),f.dir);fs.rmdirSync(tmp);}
  await save();await f.frame.locator('#provider-edit-name').waitFor({state:'detached'});
  assert.equal(f.disk().providers.find(p=>p.id==='a').displayName,'atomic-failure-name');assert.equal(f.disk().dshProviderKeys.a,'atomic-failure-key');

  await f.openSettings();
  const cancelled=await f.frame.locator('body').evaluate(async()=>{
    const {openProviderEditor}=await import(new URL('./provider-editor.js',document.baseURI).href);
    let release;const gate=new Promise(r=>{release=r;}),calls=[];
    const ui=openProviderEditor({provider:{id:'cancel',displayName:'Cancel',baseURL:'http://127.0.0.1:1/v1',models:[]},beforeWrite:()=>gate,request:async(...args)=>{calls.push(args);return {};}});
    ui.dialog.querySelector('#provider-edit-name').value='Late';ui.dialog.querySelector('button.primary').click();ui.dialog.close();release();await new Promise(r=>setTimeout(r,0));
    return{calls:calls.length,connected:ui.dialog.isConnected,key:ui.dialog.querySelector('#provider-edit-key').value};
  });
  assert.deepEqual(cancelled,{calls:0,connected:false,key:''});assert.equal(f.outbound(),0);assert.deepEqual(f.errors,[]);
  await f.close();
  appended=await modelUiFixture({uiAssetPath:'panels/settings/provider-editor.js',uiAsset:`
    export function openProviderEditor({provider,request,changed}) {
      const dialog=document.createElement('dialog'),button=document.createElement('button');button.textContent='追加渠道编辑器';
      button.onclick=async()=>{await request('POST','/api/providers/update',{providerId:provider.id,expected:{baseUrl:provider.baseURL,displayName:provider.displayName},changes:{displayName:'Appended editor'}});dialog.close();dialog.remove();await changed();};
      dialog.append(button);document.body.append(dialog);dialog.showModal();return {dialog};
    }`});
  await compatibilityEditor(appended.frame);await appended.frame.getByRole('button',{name:'追加渠道编辑器',exact:true}).click();
  await appended.card('a').filter({hasText:'Appended editor'}).waitFor();assert.equal(appended.disk().providers.find(p=>p.id==='a').displayName,'Appended editor');
  await appended.card('a').getByRole('button',{name:'添加模型',exact:true}).click();await appended.frame.locator('dialog [name=id]').waitFor();
  assert.deepEqual(appended.errors,[]);assert.equal(appended.outbound(),0);
  console.log('✓ 190 channel edit: single UI commit, concurrent neighbors/catalogues, field/key conflicts, metadata retention, real disk-write failure/retry, close fencing');
} finally {await appended?.close();await f.close();}

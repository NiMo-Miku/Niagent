// Real temporary config/member files, authenticated owned HTTP and Chromium.
// Every disk fault targets this fixture; no live console, QQ or model is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createApplication} from '../src/kernel/composition.js';
import {createConfig,buildDefaultConfig} from '../src/kernel/config.js';

const source=path.resolve(import.meta.dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-editor212-'));
const appRoot=path.join(root,'app'),dataDir=path.join(root,'data'),chat='group:212',token='synthetic-editor212';
fs.mkdirSync(appRoot);fs.cpSync(path.join(source,'ui'),path.join(appRoot,'ui'),{recursive:true});
for(const name of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,name));
const evidenceOption=process.argv.indexOf('--evidence-dir');
const evidenceDir=evidenceOption<0?path.join(source,'.qa-local/v04-parity-20261016/member-editor212'):path.resolve(process.argv[evidenceOption+1]);
fs.mkdirSync(evidenceDir,{recursive:true});
const headed=process.argv.includes('--headed')||process.env.QA_HEADED==='1'||process.env.QA_HEADLESS==='0';
const httpOnly=process.argv.includes('--http-only'),checks=[],requests=[],errors=[],renames=[],faults=[];
let kernel,browser,page,base,blocked=null,outbound=0,completed=false;
const configFile=path.join(dataDir,'config.json'),memberFile=uid=>path.join(dataDir,'memory','group_212',uid+'.json');
const bytes=file=>fs.readFileSync(file,'utf8');
const configDisk=()=>{const value=createConfig({dataDir,defaults:buildDefaultConfig(),log:{info(){},warn(){}}});value.load();return value.get();};
const memberDisk=uid=>JSON.parse(bytes(memberFile(uid)));
const memberPath=uid=>`/api/memory-files/group_212/members/${uid}`;
const originalRename=fs.renameSync;
fs.renameSync=function(from,to){
  if(String(to)===blocked){faults.push({target:path.relative(dataDir,to),code:'EACCES'});throw Object.assign(new Error('synthetic owned disk failure212'),{code:'EACCES'});}
  const result=originalRename.apply(this,arguments);
  if(String(to).startsWith(dataDir+path.sep))renames.push(path.relative(dataDir,String(to)));
  return result;
};
async function start(initialize=false){
  kernel=await createApplication({appRoot,headless:true,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},
    transport:{id:'inert-editor212',start(){},stop(){},status:()=>({connected:false}),actions:{getGroupName:()=> '合成编辑群212',getGroupMembers:()=>[]}},
    priceUpdates:{refresh:async()=>({ok:true}),updateCheck:async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false})},
    communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})},fetchImpl:async()=>{outbound++;throw new Error('No external IO212');}});
  kernel.log.setLevel('error');kernel.loader.startWatchers=()=>{};
  if(initialize){kernel.config.update({server:{port:0,token},telemetry:{enabled:false},proactive:{enabled:false},allow:{groups:['212']},memberNotes:{21201:'old A',21202:'old B'}});for(const uid of ['21201','21202'])kernel.memory.replaceMember(chat,{userId:uid,name:'original '+uid,impressions:['original impression '+uid]});}
  const port=await kernel.start();assert.notEqual(port,15967);assert.deepEqual(kernel.loader.listEntries(),[]);base=`http://127.0.0.1:${port}`;
}
async function call(method,pathname,body,headers={}){
  const response=await fetch(base+pathname,{method,headers:{'x-console-token':token,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return{status:response.status,body:await response.json()};
}
const read=uid=>call('GET',memberPath(uid)).then(result=>{assert.equal(result.status,200);return result.body;});
const expected=value=>({memberVersion:value.memberVersion,note:value.note});
async function check(name,run){await run();checks.push(name);console.log('✓ 212 '+name);}
async function stop(){await kernel?.stop();kernel=null;}
async function open(target=page){await target.goto(base);await target.locator('#nav button[data-panel=memory]').click();const frame=target.frameLocator('#panel-host iframe');await frame.locator('[data-memory-chat="group:212"]').locator('strong').click();await frame.locator('.member-cards article').first().waitFor();return frame;}
async function edit(frame,uid){await frame.locator(`[data-member="${uid}"]`).getByRole('button',{name:'编辑印象',exact:true}).click();const dialog=frame.locator('dialog');await dialog.locator('textarea[name=impressions]').waitFor();return dialog;}
const responseFor=uid=>page.waitForResponse(response=>new URL(response.url()).pathname===memberPath(uid)&&response.request().method()==='PUT').then(async response=>{await response.finished();return response;});
async function fill(dialog,{name,note,impressions}){if(name!==undefined)await dialog.locator('input[name=name]').fill(name);if(note!==undefined)await dialog.locator('input[name=note]').fill(note);if(impressions!==undefined)await dialog.locator('textarea[name=impressions]').fill(impressions);}
async function submit(dialog,uid){const response=responseFor(uid);await dialog.getByRole('button',{name:'保存',exact:true}).click();return response;}

try{
  await start(true);
  await check('field validation and existing HTTP auth/origin guards precede every edit',async()=>{
    const beforeConfig=bytes(configFile),beforeMember=bytes(memberFile('21201'));
    assert.equal((await call('GET',memberPath('21201'),undefined,{'x-console-token':''})).status,401);
    assert.equal((await call('PUT',memberPath('21201'),{name:'foreign',impressions:[]},{origin:'https://untrusted.invalid'})).status,403);
    assert.equal((await call('GET',memberPath('invalid'))).status,400);
    assert.equal((await call('PUT',memberPath('invalid'),{impressions:[]})).status,400);
    for(const body of [null,[],{parts:['note'],note:'x'},{expected:{},parts:[]},{parts:['member','member']},{note:'x'.repeat(301)}])assert.equal((await call('PUT',memberPath('21201'),body)).status,400);
    assert.equal(bytes(configFile),beforeConfig);assert.equal(bytes(memberFile('21201')),beforeMember);
  });
  await check('legacy impression-only writes preserve notes and successful legacy combined writes remain compatible',async()=>{
    const before=bytes(configFile);
    const impression=await call('PUT',memberPath('21201'),{name:'separate original name',impressions:['  legacy impression  ']});
    assert.equal(impression.status,200);assert.equal(impression.body.ok,true);assert.equal(impression.body.member.impressions[0].content,'legacy impression');assert.equal(bytes(configFile),before);
    const combined=await call('PUT',memberPath('21202'),{name:'legacy member B',note:'legacy note B',impressions:['legacy B']});
    assert.equal(combined.status,200);assert.equal(combined.body.ok,true);assert.equal(combined.body.concurrency.checked,false);assert.equal(memberDisk('21202').name,'legacy member B');assert.equal(configDisk().memberNotes['21202'],'legacy note B');
  });
  let partial;
  await check('a real second-file EACCES returns an honest 207 receipt instead of a false all-or-nothing failure',async()=>{
    const noteBefore=configDisk().memberNotes['21201'];blocked=configFile;
    try{partial=await call('PUT',memberPath('21201'),{name:'member committed before note',note:'note pending212',impressions:['committed impression212']});}finally{blocked=null;}
    assert.equal(partial.status,207);assert.equal(partial.body.ok,false);assert.equal(partial.body.partial,true);assert.equal(partial.body.steps.member.state,'saved');assert.equal(partial.body.steps.note.state,'failed');assert.deepEqual(partial.body.retryParts,['note']);
    assert.equal(memberDisk('21201').name,'member committed before note');assert.equal(memberDisk('21201').impressions[0].content,'committed impression212');assert.equal(configDisk().memberNotes['21201'],noteBefore);assert.equal(kernel.config.get().memberNotes['21201'],noteBefore);
    assert.equal((await read('21201')).memberVersion,partial.body.steps.member.memberVersion);
  });
  await check('note-only retry validates both baselines and leaves the committed member bytes/timestamps intact',async()=>{
    const before=bytes(memberFile('21201')),writeCount=renames.filter(file=>file.endsWith('21201.json')).length;
    const retry=await call('PUT',memberPath('21201'),{parts:['note'],expected:{memberVersion:partial.body.steps.member.memberVersion,note:'old A'},note:'note pending212'});
    assert.equal(retry.status,200);assert.equal(retry.body.ok,true);assert.equal(bytes(memberFile('21201')),before);assert.equal(renames.filter(file=>file.endsWith('21201.json')).length,writeCount);
    assert.equal(configDisk().memberNotes['21201'],'note pending212');assert.equal(configDisk().memberNotes['21202'],'legacy note B');assert.equal(memberDisk('21201').name,'member committed before note');
  });
  await check('stale same-UID note and member baselines reject before either new file write',async()=>{
    let baseline=await read('21201');
    assert.equal((await call('PUT','/api/member-notes/21201',{note:'other writer note212',expected:baseline.note})).status,200);
    let beforeConfig=bytes(configFile),beforeMember=bytes(memberFile('21201'));
    const noteConflict=await call('PUT',memberPath('21201'),{parts:['member','note'],expected:expected(baseline),name:'must not write',impressions:['must not write'],note:'stale note'});
    assert.equal(noteConflict.status,409);assert.equal(bytes(configFile),beforeConfig);assert.equal(bytes(memberFile('21201')),beforeMember);
    baseline=await read('21201');await call('PUT',memberPath('21201'),{name:'other writer member212',impressions:['other member212']});
    beforeConfig=bytes(configFile);beforeMember=bytes(memberFile('21201'));
    const memberConflict=await call('PUT',memberPath('21201'),{parts:['note'],expected:expected(baseline),note:'must not write either'});
    assert.equal(memberConflict.status,409);assert.equal(bytes(configFile),beforeConfig);assert.equal(bytes(memberFile('21201')),beforeMember);
  });
  await check('different-UID combined edits merge notes without replacing an old whole-map snapshot',async()=>{
    const [a,b]=await Promise.all([read('21201'),read('21202')]);
    const replies=await Promise.all([call('PUT',memberPath('21201'),{parts:['member','note'],expected:expected(a),name:'A kept name',impressions:['A kept'],note:'A kept note'}),call('PUT',memberPath('21202'),{parts:['member','note'],expected:expected(b),name:'B kept name',impressions:['B kept'],note:'B kept note'})]);
    assert.deepEqual(replies.map(reply=>reply.status),[200,200]);assert.equal(configDisk().memberNotes['21201'],'A kept note');assert.equal(configDisk().memberNotes['21202'],'B kept note');
  });
  let durable;
  await check('a first-file EACCES preserves cache/disk/config and never attempts the note step',async()=>{
    const baseline=await read('21201'),beforeConfig=bytes(configFile),beforeMember=bytes(memberFile('21201'));blocked=memberFile('21201');
    let failed;try{failed=await call('PUT',memberPath('21201'),{parts:['member','note'],expected:expected(baseline),name:'failed first file',impressions:['must not persist'],note:'must not persist'});}finally{blocked=null;}
    assert.equal(failed.status,503);assert.equal(failed.body.partial,false);assert.equal(failed.body.steps.member.state,'failed');assert.equal(failed.body.steps.note.state,'not-attempted');assert.equal(bytes(configFile),beforeConfig);assert.equal(bytes(memberFile('21201')),beforeMember);assert.deepEqual(await read('21201'),baseline);durable=baseline;
  });
  await check('restart rereads actual committed files and retains a verifiable member receipt',async()=>{
    await stop();await start();assert.deepEqual(await read('21201'),durable);assert.equal(configDisk().memberNotes['21202'],'B kept note');
  });

  if(!httpOnly){
    for(const uid of ['21211','21212','21213'])kernel.memory.replaceMember(chat,{userId:uid,name:'UI original '+uid,impressions:['UI original impression '+uid]});
    kernel.config.update({memberNotes:{21211:'UI old note11',21212:'UI old note12',21213:'UI old note13'}});
    const playwright=createRequire(import.meta.url)('playwright-core'),cache=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ms-playwright');
    const versions=fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9)));
    const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??versions.map(version=>path.join(cache,version,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));assert.ok(executablePath);
    browser=await playwright.chromium.launch({executablePath,headless:!headed});page=await browser.newPage({viewport:{width:1360,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.url().startsWith(base+'/api/')&&['POST','PUT','DELETE'].includes(request.method()))requests.push({path:new URL(request.url()).pathname,method:request.method(),body:request.postDataJSON()});});
    await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
    let frame=await open();
    await check('real UI preserves the complete draft on partial disk failure and retries only the unsaved note',async()=>{
      const dialog=await edit(frame,'21211');await fill(dialog,{name:'UI独立原名',note:'UI未保存备注',impressions:'UI新印象甲\nUI新印象乙'});blocked=configFile;
      let response;try{response=await submit(dialog,'21211');assert.equal(response.status(),207);}finally{blocked=null;}
      await dialog.locator('.error').filter({hasText:'成员印象已保存，备注未保存'}).waitFor();assert.equal(await dialog.locator('input[name=name]').inputValue(),'UI独立原名');assert.equal(await dialog.locator('input[name=note]').inputValue(),'UI未保存备注');assert.equal(await dialog.locator('textarea').inputValue(),'UI新印象甲\nUI新印象乙');
      assert.equal(memberDisk('21211').name,'UI独立原名');assert.equal(configDisk().memberNotes['21211'],'UI old note11');assert.equal(configDisk().memberNotes['21212'],'UI old note12');
      await page.screenshot({path:path.join(evidenceDir,'partial-draft.png'),fullPage:true});
      const before=bytes(memberFile('21211')),count=renames.filter(file=>file.endsWith('21211.json')).length;
      blocked=configFile;try{const failedAgain=await submit(dialog,'21211');assert.equal(failedAgain.status(),500);}finally{blocked=null;}
      await dialog.locator('.error').filter({hasText:'上次成员印象已保存'}).waitFor();assert.equal(bytes(memberFile('21211')),before);
      const retried=await submit(dialog,'21211');assert.equal(retried.status(),200);assert.deepEqual(retried.request().postDataJSON().parts,['note']);assert.equal(Object.hasOwn(retried.request().postDataJSON(),'impressions'),false);await dialog.waitFor({state:'detached'});
      assert.equal(bytes(memberFile('21211')),before);assert.equal(renames.filter(file=>file.endsWith('21211.json')).length,count);assert.equal(configDisk().memberNotes['21211'],'UI未保存备注');assert.equal(memberDisk('21211').name,'UI独立原名');
      await frame.locator('[data-member="21211"] h3').filter({hasText:'UI未保存备注'}).waitFor();
    });
    await check('a third-party member update after partial success blocks note retry without adopting a new baseline',async()=>{
      const dialog=await edit(frame,'21212');await fill(dialog,{name:'UI saved12',note:'UI pending12',impressions:'UI saved impression12'});blocked=configFile;
      try{assert.equal((await submit(dialog,'21212')).status(),207);}finally{blocked=null;}
      await dialog.locator('.error').filter({hasText:'成员印象已保存'}).waitFor();await call('PUT',memberPath('21212'),{name:'third-party12',impressions:['third-party impression12']});
      const beforeConfig=bytes(configFile),beforeMember=bytes(memberFile('21212')),conflict=await submit(dialog,'21212');assert.equal(conflict.status(),409);assert.deepEqual(conflict.request().postDataJSON().parts,['note']);
      await dialog.locator('.error').filter({hasText:'输入已保留'}).waitFor();assert.equal(await dialog.locator('input[name=note]').inputValue(),'UI pending12');assert.equal(await dialog.locator('textarea').inputValue(),'UI saved impression12');assert.equal(bytes(configFile),beforeConfig);assert.equal(bytes(memberFile('21212')),beforeMember);
      await page.screenshot({path:path.join(evidenceDir,'conflict-draft.png'),fullPage:true});await dialog.getByRole('button',{name:'取消',exact:true}).click();
    });
    await check('editing a previously saved field adds a new member part rather than discarding the changed draft',async()=>{
      const dialog=await edit(frame,'21213');await fill(dialog,{name:'UI saved13',note:'UI pending13',impressions:'UI first saved13'});blocked=configFile;
      try{assert.equal((await submit(dialog,'21213')).status(),207);}finally{blocked=null;}
      await dialog.locator('.error').filter({hasText:'成员印象已保存'}).waitFor();await fill(dialog,{name:'UI revised13',impressions:'UI revised impression13'});
      const response=await submit(dialog,'21213');assert.equal(response.status(),200);assert.deepEqual(response.request().postDataJSON().parts,['member','note']);await dialog.waitFor({state:'detached'});assert.equal(memberDisk('21213').name,'UI revised13');assert.equal(memberDisk('21213').impressions[0].content,'UI revised impression13');assert.equal(configDisk().memberNotes['21213'],'UI pending13');
    });
    await check('ordinary UI impression-only saving omits note and preserves the entire config file',async()=>{
      const dialog=await edit(frame,'21211'),before=bytes(configFile);await fill(dialog,{impressions:'UI impression only212'});const response=await submit(dialog,'21211');assert.equal(response.status(),200);const body=response.request().postDataJSON();assert.deepEqual(body.parts,['member']);assert.equal(Object.hasOwn(body,'note'),false);assert.equal(typeof body.expected.note,'string');await dialog.waitFor({state:'detached'});assert.equal(bytes(configFile),before);
    });
  }

  await check('a real appended controller/UI file is consumed and disabling the layer restores defaults and persisted data',async()=>{
    await stop();const layer=path.join(appRoot,'overrides','editor212');fs.mkdirSync(layer,{recursive:true});
    fs.writeFileSync(path.join(layer,'editor.mjs'),`import {createMemberEditorController} from ${JSON.stringify(pathToFileURL(path.join(source,'src/console/member-editor.js')).href)}; export default options=>{const base=createMemberEditorController(options);return {get(...args){return {...base.get(...args),provider:'append212'};},put(...args){const result=base.put(...args);return {...result,body:{...result.body,provider:'append212'}};}};};`);
    fs.writeFileSync(path.join(layer,'panel.js'),fs.readFileSync(path.join(source,'ui/panels/memory/panel.js'),'utf8')+"\ndocument.querySelector('h2').textContent='追加成员编辑212';\n");
    const manifest={version:1,id:'editor212',components:{'console.memberEditor':'./editor.mjs'},ui:{assets:{'panels/memory/panel.js':'./panel.js'}}};fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify(manifest));
    await start();assert.equal((await read('21201')).provider,'append212');const baseline=await read('21201');const selected=await call('PUT',memberPath('21201'),{parts:['member'],expected:expected(baseline),name:'appended accepted212',impressions:['appended accepted impression212']});assert.equal(selected.status,200);assert.equal(selected.body.provider,'append212');assert.equal(memberDisk('21201').name,'appended accepted212');
    assert.equal((await call('PUT',memberPath('21201'),{name:'no auth',impressions:[]},{'x-console-token':''})).status,401);
    if(page){const frame=await open();await frame.getByRole('heading',{name:'追加成员编辑212',exact:true}).waitFor();await frame.locator('[data-member="21201"]').waitFor();}
    await stop();fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify({...manifest,enabled:false}));await start();const restored=await read('21201');assert.equal(Object.hasOwn(restored,'provider'),false);assert.equal(restored.member.name,'appended accepted212');
    const response=await call('PUT',memberPath('21201'),{parts:['member'],expected:expected(restored),name:'default restored212',impressions:['default restored impression212']});assert.equal(response.status,200);assert.equal(Object.hasOwn(response.body,'provider'),false);assert.equal(memberDisk('21201').name,'default restored212');
    if(page){const frame=await open();assert.equal(await frame.getByRole('heading',{name:'追加成员编辑212',exact:true}).count(),0);await frame.locator('[data-member="21201"]').waitFor();}
    assert.equal(configDisk().memberNotes['21202'],'B kept note');
  });
  assert.deepEqual(errors,[]);assert.equal(outbound,0);assert.ok(faults.length>=2);completed=true;
}finally{
  blocked=null;fs.renameSync=originalRename;await browser?.close();await stop();
  fs.writeFileSync(path.join(evidenceDir,'result.json'),JSON.stringify({recordedAt:new Date().toISOString(),headed,httpOnly,completed,checks,errors,outbound,requests,faults,renames},null,2));
  const target=path.resolve(root);assert.equal(path.dirname(target).toLowerCase(),path.resolve(os.tmpdir()).toLowerCase());assert.ok(path.basename(target).startsWith('qqa-editor212-'));fs.rmSync(target,{recursive:true,force:true});
}

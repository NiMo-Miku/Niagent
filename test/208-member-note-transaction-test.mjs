// Real authenticated HTTP, config files and appended controllers, entirely in
// one new temporary application. No installed plugins, browser or remote IO.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApplication} from '../src/kernel/composition.js';
import {createConfig,buildDefaultConfig} from '../src/kernel/config.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-note208-')),appRoot=path.join(root,'app'),dataDir=path.join(root,'data');
fs.mkdirSync(appRoot);for(const directory of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,directory));
const token='synthetic-console208',a='20801',b='20802';let kernel,base,outbound=0;const events=[];
async function start(seed=false){
  kernel=await createApplication({appRoot,headless:true,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},
    transport:{id:'inert208',start(){},stop(){},status:()=>({connected:false}),actions:{}},
    priceUpdates:{refresh:async()=>({ok:true}),updateCheck:async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false})},
    communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})},fetchImpl:async()=>{outbound++;throw Error('External IO disabled');}});
  kernel.log.setLevel('error');kernel.loader.startWatchers=()=>{};
  if(seed)kernel.config.update({server:{port:0,token},telemetry:{enabled:false},proactive:{enabled:false},memberNotes:{[a]:'old A',[b]:'old B'},persona:{botName:'unchanged208'}});
  const port=await kernel.start();assert.notEqual(port,15967);assert.deepEqual(kernel.loader.listEntries(),[]);base=`http://127.0.0.1:${port}`;
  kernel.bus.on('status',payload=>events.push({name:'status',payload}),{internal:true});kernel.bus.on('memory.update',payload=>events.push({name:'memory.update',payload}),{internal:true});
}
async function call(method,uid,body,headers={}){
  const response=await fetch(`${base}/api/member-notes/${uid}`,{method,headers:{'x-console-token':token,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return{status:response.status,body:await response.json()};
}
function disk(){const config=createConfig({dataDir,defaults:buildDefaultConfig(),log:{info(){},warn(){}}});config.load();return config.get();}
const bytes=()=>fs.readFileSync(path.join(dataDir,'config.json'),'utf8');
try{
  await start(true);
  const original=bytes();
  assert.equal((await call('GET',a,undefined,{'x-console-token':''})).status,401);
  assert.equal((await call('PUT',a,{note:'foreign'},{origin:'https://untrusted.invalid'})).status,403);
  for(const body of [{},null,[],{note:1},{note:'x'.repeat(301)},{note:'x',expected:1},{note:'x',memberNotes:{[b]:'overwrite'}}])assert.equal((await call('PUT',a,body)).status,400);
  assert.equal((await call('PUT','not-a-uid',{note:'x'})).status,400);assert.equal(bytes(),original);
  console.log('✓ 208 backend auth/origin and field validation remain enforced without writes');

  const [beforeA,beforeB]=await Promise.all([call('GET',a),call('GET',b)]);
  const different=await Promise.all([call('PUT',a,{note:'new A',expected:beforeA.body.note}),call('PUT',b,{note:'new B',expected:beforeB.body.note})]);
  assert.deepEqual(different.map(r=>r.status),[200,200]);assert.deepEqual(disk().memberNotes,{[a]:'new A',[b]:'new B'});
  assert.equal(disk().persona.botName,'unchanged208');
  const observed=await call('GET',a);events.length=0;
  const same=await Promise.all([call('PUT',a,{note:'winner one',expected:observed.body.note}),call('PUT',a,{note:'winner two',expected:observed.body.note})]);
  assert.deepEqual(same.map(r=>r.status).sort(),[200,409]);
  const accepted=same.find(r=>r.status===200).body.note;assert.equal(disk().memberNotes[a],accepted);assert.equal(disk().memberNotes[b],'new B');
  assert.equal(events.filter(e=>e.name==='memory.update').length,1,'only the accepted field transaction publishes a memory event');
  console.log('✓ 208 different-UID concurrent edits merge; stale same-UID edits reject with 409');

  assert.equal((await call('PUT',a,{note:'  ',expected:accepted})).status,200);assert.equal(Object.hasOwn(disk().memberNotes,a),false);assert.deepEqual((await call('GET',a)).body,{note:''});
  const cleared=bytes(),eventCount=events.length;assert.equal((await call('PUT',a,{note:'',expected:''})).status,200);assert.equal(bytes(),cleared);assert.equal(events.length,eventCount);
  const beforeFailure=bytes(),noteRef=kernel.config.get().memberNotes,rename=fs.renameSync;events.length=0;
  try{
    fs.renameSync=function(...args){if(String(args[1])===path.join(dataDir,'config.json'))throw Object.assign(Error('synthetic config failure208'),{code:'EACCES'});return rename.apply(this,args);};
    assert.equal((await call('PUT',b,{note:'must not commit',expected:'new B'})).status,500);
  }finally{fs.renameSync=rename;}
  assert.equal(bytes(),beforeFailure);assert.equal(kernel.config.get().memberNotes,noteRef);assert.equal(events.length,0);
  assert.equal((await call('PUT',b,{note:'saved after retry',expected:'new B'})).status,200);assert.equal(disk().memberNotes[b],'saved after retry');
  console.log('✓ 208 clear/reload/no-op and failed disk commit preserve unrelated data and notifications');

  await kernel.stop();kernel=null;
  const layer=path.join(appRoot,'overrides','note208');fs.mkdirSync(layer,{recursive:true});
  fs.writeFileSync(path.join(layer,'routes.mjs'),String.raw`export default http=>{http.route('PUT',/^\/api\/member-notes\/(?<uid>[^/]+)$/,({body})=>({ok:true,note:'appended:'+body.note}),{replace:true});};`);
  const manifest={version:1,id:'note208',routes:[{id:'note-controller',module:'./routes.mjs'}]};fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify(manifest));
  await start();assert.equal((await call('GET',b)).body.note,'saved after retry');
  assert.deepEqual((await call('PUT',a,{note:'selected'})).body,{ok:true,note:'appended:selected'});assert.equal(Object.hasOwn(disk().memberNotes,a),false);
  assert.equal((await call('PUT',a,{note:'no-auth'},{'x-console-token':''})).status,401);assert.equal((await call('PUT',a,{note:'foreign'},{origin:'https://untrusted.invalid'})).status,403);
  await kernel.stop();kernel=null;fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify({...manifest,enabled:false}));
  await start();assert.deepEqual((await call('PUT',a,{note:'default restored',expected:''})).body,{ok:true,note:'default restored'});assert.equal(disk().memberNotes[a],'default restored');assert.equal(disk().memberNotes[b],'saved after retry');
  assert.equal(outbound,0);console.log('✓ 208 appended write controller is consumed, retains default reads/guards, and disable restores default persistence');
}finally{
  await kernel?.stop();const target=path.resolve(root);assert.equal(path.dirname(target).toLowerCase(),path.resolve(os.tmpdir()).toLowerCase());assert.ok(path.basename(target).startsWith('qqa-note208-'));fs.rmSync(target,{recursive:true,force:true});
}

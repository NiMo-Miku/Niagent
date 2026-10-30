import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createChatStore} from '../src/kernel/store.js';
import {createSessionRegistry} from '../src/kernel/sessions.js';
import {createUsageDayStore} from '../src/kernel/usage-days.js';
import {createApplication} from '../src/kernel/composition.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-archive271-'));
const log={info(){},warn(){},error(){}};
const messages=Array.from({length:3000},(_,i)=>({id:i*3+7,mid:i+1,ts:i,text:'synthetic '+i,read:i%3===0,isPoke:i%11===0,recalled:i%17===0,reply:i?{mid:i}:null}));
function fixture(name,rows=messages){const dataDir=path.join(root,name);fs.mkdirSync(path.join(dataDir,'messages'),{recursive:true});fs.writeFileSync(path.join(dataDir,'messages/group_1.json'),JSON.stringify({chatKey:'group:1',nextLocalId:10000,messages:rows}));return{dataDir,store:createChatStore({dataDir,log})};}
const until=async fn=>{const end=Date.now()+10000;while(!fn()){assert(Date.now()<end);await new Promise(setImmediate);}};

try{
await test('page before projection preserves original cursor/offset/raw order and resolves only the visible page',()=>{
  const {store}=fixture('paging'),all=store.recent('group:1',Infinity,{resolveReplies:true});
  for(const query of [{limit:37},{limit:41,offset:20},{limit:20,beforeId:4501},{limit:20,beforeId:'bad'},{limit:20,beforeId:Infinity},{limit:50,offset:99999}]){
    const entries=query.beforeId==null?all:all.filter(e=>Number(e.id)<Number(query.beforeId)),offset=query.offset||0,end=Math.max(0,entries.length-offset),start=Math.max(0,end-query.limit);
    assert.deepEqual(store.page('group:1',query),{chatKey:'group:1',messages:entries.slice(start,end),total:all.length,offset,hasMore:start>0});
  }
  const irregular=fixture('legacy',[messages[12],messages[2],{...messages[0],id:'8'},messages[9]]).store;
  assert.deepEqual(irregular.page('group:1',{beforeId:40,limit:2}).messages.map(x=>x.id),['8',34]);
  const counted=fixture('counted').store;let reads=0;
  for(const row of counted.recent('group:1',Infinity)){const mid=row.mid;Object.defineProperty(row,'mid',{enumerable:true,configurable:true,get(){reads++;return mid;}});}
  counted.page('group:1',{limit:40});assert(reads<=messages.length+100,'one index build, no all-history reply projection');
  reads=0;counted.page('group:1',{limit:40,beforeId:messages.at(-40).id});assert(reads<=100,'later page reuses the protocol index');
});

await test('indexes invalidate on mutation/trim, duplicate signed IDs preserve first match, strict read rollback stays correct',()=>{
  const {store}=fixture('mutations');store.page('group:1',{limit:30});const first=store.findByMid('group:1',1);assert.equal(first.id,7);
  store.updateByMid('group:1',1,{mid:-123,text:'updated'});assert.equal(store.findByMid('group:1',1),null);assert.equal(store.findByMid('group:1','-123').text,'updated');
  store.markRecalled('group:1',-123);assert.equal(store.findByMid('group:1',-123,{forContext:true}),null);
  store.appendIncoming('group:1',{mid:-123,text:'duplicate'});assert.equal(store.findByMid('group:1',-123).text,'updated');
  store.removeByLocalIds('group:1',[7]);assert.equal(store.findByMid('group:1',-123).text,'duplicate');
  const before=store.listChats()[0].unread,rename=fs.renameSync;
  try{fs.renameSync=()=>{throw Error('synthetic failed rename');};assert.throws(()=>store.markAllRead('group:1',{strict:true}));}finally{fs.renameSync=rename;}
  assert.equal(store.listChats()[0].unread,before);store.markAllRead('group:1');assert.equal(store.listChats()[0].unread,0);store.clearChat('group:1');assert.equal(store.page('group:1').total,0);
  const dataDir=path.join(root,'trim'),trimmed=createChatStore({dataDir,log,maxMessagesPerChat:()=>2});
  for(let i=0;i<4;i++){trimmed.appendIncoming('group:2',{mid:i+1});trimmed.page('group:2');}
  assert.equal(trimmed.findByMid('group:2',1),null);assert.equal(trimmed.page('group:2').messages.length,2);
});

await test('cold summaries avoid repeated file parsing and detect atomic replacement, deletion and broken archives',()=>{
  const {store,dataDir}=fixture('summary'),file=path.join(dataDir,'messages/group_1.json'),read=fs.readFileSync;let reads=0;
  try{
    fs.readFileSync=(name,...args)=>{if(name===file)reads++;return read(name,...args);};const first=store.listChats();assert.equal(reads,1);assert.deepEqual(store.listChats(),first);assert.equal(reads,1);
    first[0].count=0;assert.equal(store.listChats()[0].count,messages.length,'no externally mutable cache DTO');
    fs.writeFileSync(file+'.new',JSON.stringify({chatKey:'group:1',messages:[messages[0]]}));fs.renameSync(file+'.new',file);assert.equal(store.listChats()[0].count,1);assert.equal(reads,2);
    fs.writeFileSync(file,'broken');assert.deepEqual(store.listChats(),[]);fs.unlinkSync(file);assert.deepEqual(store.listChats(),[]);
  }finally{fs.readFileSync=read;}
});

await test('unchanged usage replay performs no daily writes; edits and failures preserve accounting/retry',()=>{
  const dataDir=path.join(root,'usage');const store=createUsageDayStore({dataDir,log,costFor:s=>({cost:s.usage.totalTokens/100,offPeakTokens:s.usage.totalTokens})});
  const session={id:'completed',chatKey:'group:1',startedAt:Date.now(),endedAt:Date.now(),status:'done',model:'synthetic',usage:{calls:1,totalTokens:30},messages:[{role:'tool',toolCall:{name:'demo'}}]};
  const first=store.record(session);assert.equal(first.cost,.3);const file=path.join(dataDir,'usage-days',fs.readdirSync(path.join(dataDir,'usage-days'))[0]),bytes=fs.readFileSync(file,'utf8');
  const write=fs.writeFileSync;let writes=0;try{fs.writeFileSync=(...args)=>{writes++;return write(...args);};for(let i=0;i<100;i++)assert.deepEqual(store.record(session),first);assert.equal(writes,0);}finally{fs.writeFileSync=write;}
  assert.equal(fs.readFileSync(file,'utf8'),bytes);session.usage.totalTokens=45;assert(Math.abs(store.record(session).cost-.45)<1e-12);session.activity={phase:'finished'};assert.deepEqual(store.record(session).activity,session.activity);
  session.activity.phase='corrected';store.record(session);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).records.completed.activity.phase,'corrected','mutable live activity cannot fool replay equality');
  const rename=fs.renameSync;session.usage.totalTokens=60;try{fs.renameSync=()=>{throw Error('synthetic271 rename');};assert.equal(store.record(session),false);}finally{fs.renameSync=rename;}
  assert(Math.abs(store.record(session).cost-.6)<1e-12);const restart=createUsageDayStore({dataDir,log,costFor:()=>{throw Error('unchanged replay must not reprice');}});assert(Math.abs(restart.record(session).cost-.6)<1e-12);
});

await test('startup reconciliation yields between batches, preserves live/clone contract and stops pending work',async()=>{
  const dataDir=path.join(root,'sessions'),dir=path.join(dataDir,'sessions');fs.mkdirSync(dir,{recursive:true});
  for(let i=0;i<60;i++)fs.writeFileSync(path.join(dir,'s'+i+'.json'),JSON.stringify({id:'s'+i,status:i===0?'running':'done',startedAt:i+1,messages:[],usage:{},sent:[]}));
  let processed=0;const sessions=createSessionRegistry({dataDir,log,onFinishedSession:()=>{processed++;return true;}});sessions.reconcileInBackground();await new Promise(setImmediate);
  assert(processed>0&&processed<60,'startup leaves room for HTTP and desktop events');await until(()=>processed===60);assert.equal(sessions.get('s0').status,'aborted');assert.equal(sessions.listSummaries().length,60);
  const clone=sessions.get('s1');sessions.peek('s1').rounds=99;assert.notEqual(clone.rounds,99);sessions.stop();
  const stopped=createSessionRegistry({dataDir,log,onFinishedSession:()=>{throw Error('stopped callback');}});stopped.reconcileInBackground();stopped.stop();await new Promise(setImmediate);assert.equal(stopped.peek('s1'),null);
});

await test('actual composed HTTP uses selected page provider; legacy replacement store keeps original fallback',async()=>{
  const appRoot=path.join(root,'app'),dataDir=path.join(root,'http');fs.mkdirSync(appRoot);for(const name of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,name));
  fs.mkdirSync(path.join(dataDir,'messages'),{recursive:true});fs.writeFileSync(path.join(dataDir,'messages/group_1.json'),JSON.stringify({chatKey:'group:1',nextLocalId:10000,messages}));
  const layer=path.join(appRoot,'overrides','10-page');fs.mkdirSync(layer,{recursive:true});
  fs.writeFileSync(path.join(layer,'page.mjs'),`export default previous=>options=>{const base=previous(options);return{...base,page(key,query){return{...base.page(key,query),source:'selected-page271'}}}}`);
  const manifest={version:2,id:'page271',components:{'data.messages':{module:'./page.mjs',mode:'wrap'}}};fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify(manifest));
  let app;
  async function start(){app=await createApplication({appRoot,headless:true,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},fetchImpl:async()=>{throw Error('external requests disabled');},priceUpdates:{refresh:async()=>({ok:true}),updateCheck:async()=>({ok:true})},transport:{id:'synthetic271',start(){},stop(){},status:()=>({connected:false}),actions:{}}});app.log.setLevel('error');app.config.update({server:{port:0,token:'test271'},telemetry:{enabled:false},proactive:{enabled:false}});app.loader.startWatchers=()=>{};const port=await app.start();assert.notEqual(port,15967);return'http://127.0.0.1:'+port;}
  async function read(base){const response=await fetch(base+'/api/chats/group_1/messages?limit=2',{headers:{'x-console-token':'test271'}});assert.equal(response.status,200);return response.json();}
  try{let base=await start();app.store.appendIncoming('group:1',{mid:1,text:'synthetic'});assert.equal((await read(base)).source,'selected-page271');await app.stop();app=null;
    fs.writeFileSync(path.join(layer,'legacy.mjs'),`export default previous=>options=>{const base=previous(options);delete base.page;return{...base,recent(...args){return base.recent(...args).map(item=>({...item,text:'legacy-selected271'}))}}}`);
    manifest.components['data.messages'].module='./legacy.mjs';fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify(manifest));base=await start();assert.equal((await read(base)).messages[0].text,'legacy-selected271');
  }finally{await app?.stop();}
});
}finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});}

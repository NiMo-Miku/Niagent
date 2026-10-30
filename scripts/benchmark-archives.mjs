// Synthetic local archives only. No live console, credentials or transport.
// --baseline points to a source snapshot containing src/kernel/{store,sessions,usage-days}.js.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createChatStore} from '../src/kernel/store.js';
import {createSessionRegistry} from '../src/kernel/sessions.js';
import {createUsageDayStore} from '../src/kernel/usage-days.js';

const argument=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const output=path.resolve(argument('--output')||'.qa-local/archive-performance-20261019/benchmark.json');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-archive-bench-'));
const log={info(){},warn(){},error(){}};
const records=12000, pageSize=500, chats=80, sessionsCount=160;
const cases={after:{createChatStore,createSessionRegistry,createUsageDayStore}}, results={};
const baseline=argument('--baseline');
if(baseline){
  const dir=path.join(root,'baseline');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'package.json'),' {"type":"module"}');
  for(const name of ['store','sessions','usage-days']){
    const source=fs.readFileSync(path.resolve(baseline,'src/kernel',name+'.js'),'utf8');
    const module=path.join(dir,name+'.js');fs.writeFileSync(module,source.replaceAll("'./telemetry.js'",JSON.stringify(pathToFileURL(path.resolve(import.meta.dirname,'../src/kernel/telemetry.js')).href)));
  }
  cases.before={...(await import(pathToFileURL(path.join(dir,'store.js')))),...(await import(pathToFileURL(path.join(dir,'sessions.js')))),...(await import(pathToFileURL(path.join(dir,'usage-days.js'))))};
}
const timed=fn=>{const started=performance.now(),value=fn();return{ms:performance.now()-started,value};};
function page(store){
  if(store.page)return store.page('group:1',{limit:pageSize});
  const all=store.recent('group:1',Number.MAX_SAFE_INTEGER,{resolveReplies:true});
  return{chatKey:'group:1',messages:all.slice(-pageSize),total:all.length,offset:0,hasMore:all.length>pageSize};
}
try{
  const seed=path.join(root,'seed');fs.mkdirSync(path.join(seed,'messages'),{recursive:true});fs.mkdirSync(path.join(seed,'sessions'));
  for(let chat=1;chat<=chats;chat++){
    const count=chat===1?records:500;
    const messages=Array.from({length:count},(_,i)=>({id:i+1,mid:i+1,ts:i,text:'synthetic archive '.repeat(4)+i,read:i%2===0,reply:i?{mid:i}:null,media:[]}));
    fs.writeFileSync(path.join(seed,'messages',`group_${chat}.json`),JSON.stringify({chatKey:`group:${chat}`,nextLocalId:count+1,messages}));
  }
  const usage=createUsageDayStore({dataDir:seed,log});
  for(let i=0;i<sessionsCount;i++){
    const s={id:'history-'+i,chatKey:'group:1',status:'done',startedAt:1700000000000+i,endedAt:1700000001000+i,usage:{calls:1,promptTokens:10,completionTokens:5,totalTokens:15,cachedTokens:0},sent:[],messages:Array.from({length:100},()=>({role:'user',content:'synthetic trace '.repeat(20)}))};
    usage.record(s);fs.writeFileSync(path.join(seed,'sessions',s.id+'.json'),JSON.stringify(s));
  }
  let expected;
  for(const [name,impl]of Object.entries(cases)){
    const dataDir=path.join(root,name);fs.cpSync(seed,dataDir,{recursive:true});
    let store=impl.createChatStore({dataDir,log});const first=timed(()=>page(store));
    if(expected)assert.deepEqual(first.value,expected);else expected=first.value;
    const again=timed(()=>page(store));
    store=impl.createChatStore({dataDir,log});store.listChats();
    let reads=0;const read=fs.readFileSync;const summaries=timed(()=>{try{fs.readFileSync=(file,...args)=>{if(String(file).startsWith(path.join(dataDir,'messages')))reads++;return read(file,...args);};for(let i=0;i<10;i++)assert.equal(store.listChats().length,chats);}finally{fs.readFileSync=read;}});
    let writes=0,processed=0,maxEventGap=0,last=performance.now();const write=fs.writeFileSync;
    const started=performance.now();const daily=impl.createUsageDayStore({dataDir,log});
    const registry=impl.createSessionRegistry({dataDir,log,onFinishedSession:s=>{processed++;return daily.record(s);}});
    const timer=setInterval(()=>{const at=performance.now();maxEventGap=Math.max(maxEventGap,at-last);last=at;},1);
    try{
      fs.writeFileSync=(file,...args)=>{if(String(file).startsWith(dataDir))writes++;return write(file,...args);};
      registry.reconcileInBackground();while(processed<sessionsCount){assert(performance.now()-started<120000);await new Promise(setImmediate);}await new Promise(resolve=>setTimeout(resolve,2));
    }finally{fs.writeFileSync=write;clearInterval(timer);registry.stop();}
    results[name]={firstArchivePageMs:first.ms,repeatedArchivePageMs:again.ms,tenChatListsMs:summaries.ms,chatFileReadsForTenLists:reads,historyRecoveryMs:performance.now()-started,historyRecoveryWrites:writes,maxEventLoopGapMs:maxEventGap};
  }
  const hashes={};for(const [name,folder]of [['after',path.resolve(import.meta.dirname,'..')],...(baseline?[['before',path.resolve(baseline)]]:[])])hashes[name]=Object.fromEntries(['store','sessions','usage-days'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,'src/kernel',file+'.js'))).digest('hex')]));
  const result={at:new Date().toISOString(),node:process.version,platform:process.platform,sourceHashes:hashes,synthetic:true,recordsInLargeChat:records,pageSize,chats,sessions:sessionsCount,results,identicalArchivePage:true,externalRequests:0,protectedPageAccessed:false};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {buildDefaultConfig} from '../src/kernel/config.js';
import {chatCompletionWithRetry} from '../src/kernel/llm.js';
import {createApplication} from '../src/kernel/composition.js';
import {defaultComponents} from '../bundled/runtime-defaults/components.js';

const image=[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]}];
const video=[{role:'user',content:[{type:'video_url',video_url:{url:'https://fixture.invalid/never-fetched.mp4'}},{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]}];
const plain=[{role:'user',content:'local fixture'}], requests=[];
const cfg=buildDefaultConfig();
Object.assign(cfg.api,{baseUrl:'https://a.invalid/v1',provider:'a',model:'main',apiKey:'synthetic-global',visionModel:'shared',visionProvider:'b',videoModel:'shared',videoProvider:'a'});
cfg.providers=[{id:'a',baseUrl:'https://a.invalid/v1',models:['shared']},{id:'b',baseUrl:'https://b.invalid/v1',models:['shared']}];cfg.dshProviderKeys={a:'synthetic-a',b:'synthetic-b'};
const fetchFn=async(url,init)=>{requests.push({url,authorization:new Headers(init.headers).get('authorization'),body:JSON.parse(init.body)});return new Response(JSON.stringify({model:JSON.parse(init.body).model,choices:[{message:{role:'assistant',content:'fixture'}}]}),{status:200,headers:{'content-type':'application/json'}});};
let pools=0;
const capabilities={providers:name=>name==='llm.endpoint-pick'?[{ownerId:'fixture',provider:()=>{pools++;return{id:'fixture-pool',baseUrl:'https://pool.invalid/v1',apiKey:'synthetic-pool',model:'pool-model'};}}]:[]};
let result=await chatCompletionWithRetry({cfg,messages:image,fetchFn,capabilities},0);
assert.equal(requests.at(-1).url,'https://b.invalid/v1/chat/completions');assert.equal(requests.at(-1).authorization,'Bearer synthetic-b');assert.equal(result._usedApi.provider,'b');assert.equal(pools,0);
await chatCompletionWithRetry({cfg,messages:video,fetchFn,capabilities},0);
assert.equal(requests.at(-1).url,'https://a.invalid/v1/chat/completions');assert.equal(requests.at(-1).authorization,'Bearer synthetic-a');assert.equal(pools,0);
await chatCompletionWithRetry({cfg:{...cfg,api:{...cfg.api,videoModel:'  '}},messages:video,fetchFn,capabilities},0);
assert.equal(requests.at(-1).url,'https://b.invalid/v1/chat/completions','blank video override falls back to the explicit vision target');
await chatCompletionWithRetry({cfg:{...cfg,dshProviderKeys:{a:'synthetic-a'}},messages:image,fetchFn,capabilities},0);
assert.equal(requests.at(-1).url,'https://b.invalid/v1/chat/completions');assert.equal(requests.at(-1).authorization,null,'an empty explicit target must not inherit the primary/global credential');
const mismatch={...cfg,api:{...cfg.api,baseUrl:'https://wrong-primary.invalid/v1'}};
await chatCompletionWithRetry({cfg:mismatch,messages:image,fetchFn},0);
assert.equal(requests.at(-1).url,'https://b.invalid/v1/chat/completions','independent explicit media route can replace a stale primary tuple');
await assert.rejects(chatCompletionWithRetry({cfg:mismatch,messages:plain,fetchFn},0),error=>error.code==='PRIMARY_CONFIG_INVALID');
await chatCompletionWithRetry({cfg:{...mismatch,api:{...mismatch.api,fallbackModels:[{provider:'b',model:'safe-fallback'}]}},messages:plain,fetchFn},0);
assert.equal(requests.at(-1).url,'https://b.invalid/v1/chat/completions');assert.equal(requests.at(-1).authorization,'Bearer synthetic-b');
await chatCompletionWithRetry({cfg,messages:plain,fetchFn,capabilities:{providers:name=>name==='llm.endpoint-pick'?[{ownerId:'fixture',provider:()=>({baseUrl:'https://anonymous-pool.invalid/v1',model:'pool'})}]:[]}},0);
assert.equal(requests.at(-1).authorization,null,'a pool changing origin cannot borrow the original channel key');
await chatCompletionWithRetry({cfg:{...cfg,api:{...cfg.api,visionProvider:''}},messages:image,fetchFn,capabilities},0);
assert.equal(pools,1);assert.equal(requests.at(-1).url,'https://pool.invalid/v1/chat/completions');assert.equal(requests.at(-1).body.model,'shared','legacy ID-only route keeps endpoint-pool semantics');
let selected=0;
await chatCompletionWithRetry({cfg,messages:image,fetchFn,overrides:{model:'memory-explicit',provider:'a',baseUrl:'https://a.invalid/v1',apiKey:'synthetic-memory'},components:{'llm.target':()=>{selected++;return null;}}},0);
assert.equal(selected,0);assert.equal(requests.at(-1).body.model,'memory-explicit');assert.equal(requests.at(-1).authorization,'Bearer synthetic-memory');
const before=requests.length;
await assert.rejects(chatCompletionWithRetry({cfg:{...cfg,api:{...cfg.api,visionProvider:'removed',fallbackModels:[{provider:'a',model:'fallback'}]}},messages:image,fetchFn},0),error=>error.code==='MODEL_TARGET_INVALID');
assert.equal(requests.length,before,'invalid pinned target does not leak onto a fallback endpoint');
await assert.rejects(chatCompletionWithRetry({cfg:{...cfg,providers:cfg.providers.map(p=>p.id==='b'?{...p,baseURL:'https://different.invalid/v1'}:p)},messages:image,fetchFn},0),error=>error.code==='MODEL_TARGET_INVALID');
assert.equal(requests.length,before,'conflicting URL aliases do not silently choose a credential destination');
const abort=new AbortController();let release,entered;const held=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
const pending=chatCompletionWithRetry({cfg,messages:image,fetchFn,signal:abort.signal,components:{'llm.target':async()=>{entered();await held;return {model:'late'};}}},0);
await started;
abort.abort(new Error('synthetic canceled'));
let timer;
try {await Promise.race([assert.rejects(pending,/synthetic canceled/),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('canceled selector did not settle')),1000);})]);}
finally {clearTimeout(timer);release();}
assert.equal(requests.length,before);
const early=new AbortController();let invoked=0;
const canceledBeforeEntry=chatCompletionWithRetry({cfg,messages:image,fetchFn,signal:early.signal,components:{'llm.target':()=>{invoked++;return null;}}},0);
early.abort(new Error('canceled before selector'));await assert.rejects(canceledBeforeEntry,/canceled before selector/);assert.equal(invoked,0);
assert.equal(typeof defaultComponents['llm.target'],'function');

// Real production factory and real HTTP: an appended file selects the target,
// disabling that layer restores defaults without modifying the original code.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-target-composition-')), appRoot=path.join(dir,'app'), apps=[], calls=[];
fs.mkdirSync(appRoot);fs.cpSync(path.resolve(import.meta.dirname,'../ui'),path.join(appRoot,'ui'),{recursive:true});
for(const name of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,name));
const source=new URL('../src/kernel/llm.js',import.meta.url), digest=()=>createHash('sha256').update(fs.readFileSync(source)).digest('hex'), original=digest();
const server=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);calls.push({path:req.url,authorization:req.headers.authorization,body});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({model:body.model,choices:[{message:{role:'assistant',content:'fixture'}}]}));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const layer=path.join(appRoot,'overrides','10-target');fs.mkdirSync(layer,{recursive:true});
const manifest={version:1,id:'qa-target',components:{'llm.target':{module:'./target.mjs',export:'target'}}};
fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify(manifest));
fs.writeFileSync(path.join(layer,'target.mjs'),`export async function target({cfg}){await Promise.resolve();const p=cfg.providers.find(p=>p.id==='b');return {model:'appended-target',provider:'b',baseUrl:p.baseUrl,apiKey:cfg.dshProviderKeys.b,pinned:true};}`);
let outbound=0;
async function start(){
  const app=await createApplication({appRoot,headless:true,env:{QQ_AGENT_DATA_DIR:path.join(dir,'data'),QQ_AGENT_MIGRATE_FROM:path.join(dir,'absent')},
    transport:{id:'inert-target',start(){},stop(){},status:()=>({connected:false}),actions:{}},
    fetchImpl:async()=>{outbound++;throw new Error('Unexpected remote fetch');},priceUpdates:{refresh:async()=>({ok:true})},communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})}});
  apps.push(app);app.log.setLevel('error');app.loader.startWatchers=()=>{};
  app.config.update({server:{port:0,token:'synthetic-target-token'},telemetry:{enabled:false},api:{baseUrl:base+'/a/v1',provider:'a',model:'default-main'},providers:[{id:'a',baseUrl:base+'/a/v1'},{id:'b',baseUrl:base+'/b/v1'}],dshProviderKeys:{a:'local-a',b:'local-b'}});
  await app.start();return app;
}
try{
  const composed=await start();assert.equal(composed.composition.owners['llm.target'],'qa-target');
  const client=composed.capability.providers('llm.client')[0].provider, notices=[];
  const response=await client.complete({messages:plain,onRequest:notice=>notices.push(notice)});
  assert.equal(calls.at(-1).path,'/b/v1/chat/completions');assert.equal(calls.at(-1).body.model,'appended-target');assert.equal(calls.at(-1).authorization,'Bearer local-b');assert.equal(response._usedApi.provider,'b');
  assert.equal(JSON.stringify(notices).includes('local-b'),false,'public request notice never receives the selected credential');
  assert.equal(composed.config.get().api.model,'default-main');await composed.stop();
  fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify({...manifest,enabled:false}));
  const restored=await start();assert.equal(restored.components['llm.target'],defaultComponents['llm.target']);
  await restored.capability.providers('llm.client')[0].provider.complete({messages:plain});
  assert.equal(calls.at(-1).path,'/a/v1/chat/completions');assert.equal(calls.at(-1).authorization,'Bearer local-a');assert.equal(calls.at(-1).body.model,'default-main');
  assert.equal(calls.length,2);assert.equal(outbound,0);assert.equal(digest(),original);
  console.log('✓ 188 model targets: explicit credentials/endpoint, video precedence, legacy pool, override isolation, fail-closed/abort, real appended component and default restoration');
}finally{
  for(const app of apps)await app.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('qqa-target-composition-'));fs.rmSync(dir,{recursive:true,force:true});
}

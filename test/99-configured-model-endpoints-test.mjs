import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import http from 'node:http';
import { createKernel } from '../src/kernel/kernel.js';
import { requestModelEndpoint } from '../src/console/model-request.js';
import { safeFetch } from '../src/kernel/safe-fetch.js';

const calls=[],otherCalls=[];
const other=http.createServer((req,res)=>{otherCalls.push({url:req.url,authorization:req.headers.authorization});res.end('{}');});
await new Promise(resolve=>other.listen(0,'127.0.0.1',resolve));
const otherOrigin=`http://127.0.0.1:${other.address().port}`;
const model=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=Buffer.concat(chunks).toString('utf8');
  calls.push({url:req.url,authorization:req.headers.authorization,body});
  if(req.url==='/same-origin'){res.writeHead(302,{location:'/v1/models'});res.end();return;}
  if(req.url==='/foreign-private'){res.writeHead(307,{location:`${otherOrigin}/capture`});res.end();return;}
  if(req.url==='/foreign-public'){res.writeHead(307,{location:'https://public-model.example/capture'});res.end();return;}
  if(req.url==='/credential-redirect'){res.writeHead(307,{location:`http://user:secret@127.0.0.1:${model.address().port}/capture`});res.end();return;}
  res.setHeader('content-type','application/json');
  if(req.url==='/v1/models')res.end(JSON.stringify({data:[{id:'local-model'}]}));
  else if(req.url==='/v1/chat/completions')res.end(JSON.stringify({choices:[{message:{content:'pong'}}]}));
  else{res.statusCode=404;res.end('{}');}
});
await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${model.address().port}`,baseUrl=`${origin}/v1`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-model99-')),token='model99-console';
// Real default UI/routes and the formal source consumers stay under test.
// No loader extension is required by this fixture's business contract.
const appRoot = path.join(dataDir, 'application'); fs.mkdirSync(appRoot);
fs.cpSync(path.resolve(import.meta.dirname, '../ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, directory));
let isolatedOutbound = 0, dnsCalls = 0; const browserOutbound = [], ownedOrigins = new Set();
const nativeFetch = globalThis.fetch, nativeLookup = dns.lookup;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (ownedOrigins.has(url.origin)) return nativeFetch(input, options);
  isolatedOutbound++; throw new Error('QA99 external fetch disabled');
};
dns.lookup = async () => { dnsCalls++; throw new Error('QA99 external DNS disabled'); };
const routeOwnedPage = (page, base) => page.route('**/*', route => {
  const url = route.request().url();
  if (new URL(url).origin === new URL(base).origin) return route.continue();
  browserOutbound.push(url); return route.abort();
});
function assertOffline() {
  assert.equal(isolatedOutbound, 0, 'no external Node fetch was attempted');
  assert.equal(dnsCalls, 0, 'no external DNS was attempted');
  assert.deepEqual(browserOutbound, [], 'browser requested only its exact owned console origin');
}
ownedOrigins.add(origin);

const kernel=createKernel({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(dataDir,'absent')},
  fetchImpl: async(input,options)=>{if(new URL(String(input)).origin===origin)return fetch(input,options);isolatedOutbound++;throw new Error('QA99 external model traffic disabled');},headless:true,
  transport:{id:'fixture',start(){},stop(){},status:()=>({connected:true}),actions:{}},
  priceUpdates:{refresh:async()=>({ok:true}),updateCheck:async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false})},communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})}});
kernel.loader.startWatchers = () => {};
kernel.config.update({server:{port:0,token},telemetry:{enabled:false},api:{baseUrl,model:'local-model',provider:'local'},providers:[{id:'local',baseUrl,models:['local-model']}],dshProviderKeys:{local:'local-key-99'}});
let started=false;
async function request(method,url,body){
  const response=await fetch(`http://127.0.0.1:${port}${url}`,{method,headers:{'x-console-token':token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json()};
}
let port;
try{
  port=await kernel.start();started=true; ownedOrigins.add(`http://127.0.0.1:${port}`);
  assert.notEqual(port,15967);assert.deepEqual(kernel.loader.listEntries(),[]);
  console.log('· Real loopback model: catalog, provider tests, chat, current API and vision scan');
  let result=await request('GET','/api/models');assert.equal(result.status,200);assert.deepEqual(result.data.models,[{id:'local-model'}]);
  result=await request('POST','/api/providers/fetch-models',{providerId:'local'});assert.equal(result.status,200);assert.equal(result.data.models[0].id,'local-model');
  result=await request('POST','/api/providers/test-one',{providerId:'local'});assert.equal(result.data.result.ok,true);
  result=await request('POST','/api/providers/test-all');assert.equal(result.data.okCount,1);
  result=await request('POST','/api/providers/test-chat',{providerId:'local',model:'local-model'});assert.equal(result.data.result.ok,true);
  result=await request('POST','/api/test/api');assert.equal(result.data.ok,true);assert.equal(result.data.reply,'pong');
  assert.equal(calls.every(call=>call.authorization==='Bearer local-key-99'),true);
  result=await request('POST','/api/vision/scan',{providerIds:['local']});assert.equal(result.status,202);
  for(let i=0;i<100;i++){result=await request('GET','/api/vision/results');if(!result.data.scanning)break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(result.data.results['local|||local-model'].verdict,'vision');
  assert.equal(calls.some(call=>call.body&&JSON.parse(call.body).messages[0].content.some?.(part=>part.type==='image_url')),true);
  kernel.config.update({api:{provider:'',apiKey:''}});
  result=await request('POST','/api/test/api');assert.equal(result.data.ok,true,'anonymous local models do not require a fabricated API key');
  assert.equal(calls.at(-1).authorization,undefined);

  console.log('· Private-network authorization is limited to persistent configured origins');
  result=await request('POST','/api/providers/fetch-models',{baseUrl:`${otherOrigin}/v1`,apiKey:'do-not-leak'});
  assert.equal(result.status,502);assert.match(result.data.error,/拒绝访问内网/);assert.equal(otherCalls.length,0);
  let fetchCount=0;
  const privateDns=async()=>[{address:'10.20.30.40',family:4}],fakeFetch=async()=>{fetchCount++;return new Response('{}');};
  await assert.rejects(()=>requestModelEndpoint('https://unconfigured.example/v1/models',{config:{security:{allowPrivateImageHosts:true}},dnsLookup:privateDns,fetchImpl:fakeFetch}),/拒绝访问内网/);
  assert.equal(fetchCount,0,'default DNS guard rejects unconfigured private destinations before fetch');
  await requestModelEndpoint('https://configured-lan.example/v1/models',{config:{providers:[{baseURL:'https://configured-lan.example/v1'}]},dnsLookup:privateDns,fetchImpl:fakeFetch});
  assert.equal(fetchCount,1,'an explicitly configured LAN model origin can resolve to a private address');
  await assert.rejects(()=>safeFetch(`${baseUrl}/models`),/拒绝访问内网/,'ordinary web/media requests retain the default guard');

  console.log('· Same-origin redirects work; all foreign origins and URL credentials are rejected');
  const config={api:{baseUrl},providers:[{baseUrl:`${otherOrigin}/v1`}]},headers={authorization:'Bearer redirect-key-99'};
  result=await requestModelEndpoint(`${origin}/same-origin`,{config,headers});assert.equal(result.status,200);assert.equal(result.hops.length,2);assert.equal(calls.at(-1).authorization,'Bearer redirect-key-99');
  await assert.rejects(()=>requestModelEndpoint(`${origin}/foreign-private`,{config,method:'POST',headers,body:'sensitive-body'}),/重定向离开/);
  await assert.rejects(()=>requestModelEndpoint(`${origin}/foreign-public`,{config,headers}),/重定向离开/);
  assert.equal(otherCalls.length,0,'a redirect cannot reach another configured origin or leak the key/body');
  await assert.rejects(()=>requestModelEndpoint(`${origin}/credential-redirect`,{config,headers}),/用户名或密码/);
  await assert.rejects(()=>requestModelEndpoint(`http://user:secret@127.0.0.1:${model.address().port}/v1/models`,{config}),/用户名或密码/);
  console.log('✓ 99 configured model endpoints and redirect boundaries passed');
}finally{
  if(started)await kernel.stop();else await kernel.stop().catch(()=>{});
  model.closeAllConnections();other.closeAllConnections();
  await Promise.all([new Promise(resolve=>model.close(resolve)),new Promise(resolve=>other.close(resolve))]);
  globalThis.fetch = nativeFetch; dns.lookup = nativeLookup;
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dataDir).startsWith('qqa-model99-'));
  fs.rmSync(dataDir,{recursive:true,force:true});
  assertOffline(); assert.deepEqual(kernel.loader.listEntries(), []);
}

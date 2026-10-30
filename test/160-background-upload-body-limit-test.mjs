// Real loopback HTTP/parser/image-storage checks in one fresh synthetic temp.
// --http-source preserves the same driver while selecting older HTTP bytes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { registerConsoleRoutes } from '../src/console/routes.js';

const workspace=path.resolve(import.meta.dirname,'..'),option=process.argv.indexOf('--http-source');
assert.ok(option===-1||option===2,'Only the optional older HTTP source is accepted');
assert.equal(process.argv.length,option===-1?2:4);
const httpSource=path.resolve(option===-1?path.join(workspace,'src/kernel/http.js'):process.argv[option+1]);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-upload-body160-')),dataDir=path.join(root,'data'),staticDir=path.join(root,'static');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),mib=1024*1024;
let modulePath=httpSource;
if(option!==-1){modulePath=path.join(root,'http-selected.mjs');fs.writeFileSync(modulePath,fs.readFileSync(httpSource,'utf8').replace("'../console/key-access.js'",JSON.stringify(pathToFileURL(path.join(workspace,'src/console/key-access.js')).href)));}
const {createHttpServer,MAX_BODY_BYTES,HARD_BODY_LIMIT}=await import(pathToFileURL(modulePath));
fs.mkdirSync(staticDir);fs.writeFileSync(path.join(staticDir,'index.html'),'QA_ONLY_BODY_LIMIT');
const log={info(){},warn(){},error(){},recent:()=>[]},token='qa-body160-fixed-only';
const config=createConfig({dataDir,defaults:buildDefaultConfig({personaText:''}),log});config.load();config.update({server:{port:0,token}});
const srv=createHttpServer({config,log,staticDir,extraStaticRoots:[{prefix:'/ui/backgrounds/',root:path.join(dataDir,'ui/backgrounds')}]});
const noops={listEntries:()=>[],promptSections:()=>[],names:()=>[],explain:()=>({}),status:()=>({}),todayUsage:()=>({}),listChats:()=>[]};
registerConsoleRoutes(srv,{config,dataDir,log,sessions:{...noops,listSummaries:()=>[],get:()=>null,delete:()=>false,clearFinished:()=>0},store:noops,loader:noops,orchestrator:noops,capability:noops});
let echoCalls=0;
srv.route('POST','/api/qa160/echo',({body})=>{echoCalls++;return {length:body.data.length};});
srv.route('POST','/api/uikit/background-extra',()=>{echoCalls++;return {neighbor:true};});
const port=await srv.listen(),base=`http://127.0.0.1:${port}`;
let passed=0,failed=0;
const results=[];
async function check(name,fn){try{await fn();passed++;results.push({name,passed:true});console.log('PASS '+name);}catch(error){failed++;results.push({name,passed:false,message:error.message});console.error('FAIL '+name+': '+error.message);}}
async function post(endpoint,body,headers={}){const response=await fetch(base+endpoint,{method:'POST',headers:{'content-type':'application/json','x-console-token':token,...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:response.status,body:await response.json()};}
const backgroundFiles=()=>fs.existsSync(path.join(dataDir,'ui/backgrounds'))?fs.readdirSync(path.join(dataDir,'ui/backgrounds')).sort():[];
const crcTable=Uint32Array.from({length:256},(_,index)=>{let c=index;for(let bit=0;bit<8;bit++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(buffer){let c=0xffffffff;for(const byte of buffer)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(kind,payload){const type=Buffer.from(kind),wire=Buffer.alloc(payload.length+12);wire.writeUInt32BE(payload.length);type.copy(wire,4);payload.copy(wire,8);wire.writeUInt32BE(crc32(Buffer.concat([type,payload])),wire.length-4);return wire;}
// A valid one-pixel PNG with a large legal ancillary text chunk, not merely
// magic bytes. Its exact image-byte size is independent of base64/JSON overhead.
function pngOfSize(size){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;const prefix=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr)]),idat=chunk('IDAT',zlib.deflateSync(Buffer.from([0,44,88,132,255]))),end=chunk('IEND',Buffer.alloc(0)),text=Buffer.alloc(size-prefix.length-idat.length-end.length-12,97);text[0]=81;text[1]=0;const png=Buffer.concat([prefix,chunk('tEXt',text),idat,end]);assert.equal(png.length,size);return png;}
const medium=pngOfSize(3*mib),boundary=pngOfSize(8*mib),tooLarge=pngOfSize(8*mib+1),dataUrl=bytes=>'data:image/png;base64,'+bytes.toString('base64');
try{
  await check('the image fixture is valid PNG and its JSON exceeds the generic limit',async()=>{assert.ok(Buffer.byteLength(JSON.stringify({data:dataUrl(medium)}))>2*mib);assert.ok(Buffer.byteLength(JSON.stringify({data:dataUrl(boundary)}))<12*mib);let decoded=false;for(let offset=8;offset<boundary.length;){const length=boundary.readUInt32BE(offset),kind=boundary.toString('ascii',offset+4,offset+8),payload=boundary.subarray(offset+8,offset+8+length);assert.equal(boundary.readUInt32BE(offset+8+length),crc32(boundary.subarray(offset+4,offset+8+length)));if(kind==='IDAT'){assert.deepEqual(zlib.inflateSync(payload),Buffer.from([0,44,88,132,255]));decoded=true;}offset+=length+12;}assert.equal(decoded,true);});
  for(const endpoint of ['/api/uikit/background','/api/uikit/background/']){
    await check(endpoint+' accepts and persists a real 3MiB image',async()=>{const uploaded=await post(endpoint,{data:dataUrl(medium)});assert.equal(uploaded.status,200);assert.equal(uploaded.body.bytes,medium.length);assert.equal(uploaded.body.mime,'image/png');assert.match(uploaded.body.url,/^\/ui\/backgrounds\/bg-[a-f0-9]{12}\.png$/);const stored=fs.readFileSync(path.join(dataDir,'ui/backgrounds',path.basename(uploaded.body.url)));assert.equal(sha(stored),sha(medium));});
  }
  await check('exact 8MiB image remains accepted through base64 JSON and the real static alias',async()=>{const uploaded=await post('/api/uikit/background',{data:dataUrl(boundary)});assert.equal(uploaded.status,200);assert.equal(uploaded.body.bytes,8*mib);const response=await fetch(base+uploaded.body.url,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(boundary));});
  await check('over8MiB image is rejected by the real image route without altering installed backgrounds',async()=>{const before=backgroundFiles();const response=await post('/api/uikit/background/',{data:dataUrl(tooLarge)});assert.equal(response.status,400);assert.match(response.body.error,/8MB/);assert.deepEqual(backgroundFiles(),before);});
  await check('generic JSON still accepts below2MiB and rejects above2MiB before its handler',async()=>{const small=await post('/api/qa160/echo',{data:'x'.repeat(2*mib-64)});assert.equal(small.status,200);const calls=echoCalls,big=await post('/api/qa160/echo',{data:'x'.repeat(2*mib)});assert.equal(big.status,413);assert.equal(echoCalls,calls);});
  await check('a neighboring background path does not receive the upload allowance',async()=>{const calls=echoCalls,response=await post('/api/uikit/background-extra',{data:dataUrl(medium)});assert.equal(response.status,413);assert.equal(echoCalls,calls);});
  await check('upload authentication and origin guards still precede parsing/storage',async()=>{const before=backgroundFiles();assert.equal((await post('/api/uikit/background',{data:dataUrl(medium)},{'x-console-token':'wrong'})).status,401);assert.equal((await post('/api/uikit/background/',{data:dataUrl(medium)},{origin:'https://untrusted.invalid'})).status,403);assert.deepEqual(backgroundFiles(),before);});
  await check('the upload transport still rejects JSON above12MiB without storage',async()=>{const before=backgroundFiles(),response=await post('/api/uikit/background',{data:'x'.repeat(12*mib)});assert.equal(response.status,413);assert.deepEqual(backgroundFiles(),before);});
  await check('the hard16MiB limit still destroys the authorized upload connection',async()=>{assert.equal(MAX_BODY_BYTES,2*mib);assert.equal(HARD_BODY_LIMIT,16*mib);const before=backgroundFiles();const outcome=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/api/uikit/background',method:'POST',headers:{'content-type':'application/json','x-console-token':token}},res=>{res.resume();res.once('end',()=>resolve({status:res.statusCode}));});req.setTimeout(15000,()=>req.destroy(new Error('hard bound request timed out')));req.once('error',error=>{if(['ECONNRESET','EPIPE'].includes(error.code))resolve({destroyed:true,code:error.code});else reject(error);});req.end('x'.repeat(16*mib+1));});assert.equal(outcome.destroyed,true,JSON.stringify(outcome));assert.deepEqual(backgroundFiles(),before);});
}finally{
  await srv.close();
  assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('qqa-upload-body160-'));fs.rmSync(root,{recursive:true,force:true});
}
console.log(JSON.stringify({test:'160-background-upload-body-limit',passed,failed,httpSource,httpSourceSha256:sha(fs.readFileSync(httpSource)),driverSha256:sha(fs.readFileSync(import.meta.filename)),realHttpRequests:true,realImageRouteAndStorage:true,realDataUsed:false,uiOrVendorOperated:false,results}));if(failed)process.exitCode=1;

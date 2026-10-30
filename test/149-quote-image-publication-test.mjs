// The user authorized the legacy source as reference on 2026-10-14.
// develop/ui/app/10-feedback.js:778-840 supplies media[].dataUrl to /holyshits.
// All outbound calls here are explicitly synthetic; no real CAPTCHA or submission.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createKernel} from '../src/kernel/kernel.js';
import { isolateConsoleFixture } from './console-fixture-isolation.mjs';
import {QUOTE_ENDPOINT,quoteTextPayload,createQuoteClient} from '../bundled/community/quote-client.js';
import {publishQuoteFromHost} from '../ui/shell/quote-publication.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=','base64');
const dataUrl='data:image/png;base64,'+png.toString('base64');
const image={kind:'image',url:'',file:'',dataUrl};
const body={nickname:'合成收录者',messages:[{ts:1760000001000,senderName:'机器人',text:'',self:true,media:[image]}],captchaVerifyParam:'qa149-offline-proof'};
console.log('· Legacy image contract accepts reviewed inline bytes and image-only messages');
assert.deepEqual(quoteTextPayload(body),{nickname:body.nickname,messages:body.messages});
console.log('· Invalid encodings, MIME spoofing, source URLs/paths and unreviewed fields are refused');
const invalid=[
 {...image,dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'},
 {...image,dataUrl:'data:image/png;base64,aGVsbG8='},
 {...image,dataUrl:dataUrl+'\n'},
 {...image,dataUrl:'data:image/jpeg;base64,'+png.toString('base64')},
 {...image,url:'https://expired.invalid/qq-cookie=secret'},
 {...image,file:'C:/Users/private/config.json'},
 {...image,senderId:'123456'},
 {...image,kind:'video'},
 {...image,dataUrl:'data:image/png;base64,'+Buffer.concat([png,Buffer.alloc(1024*1024)]).toString('base64')},
];
for(const media of invalid)assert.throws(()=>quoteTextPayload({...body,messages:[{...body.messages[0],media:[media]}]}));
assert.throws(()=>quoteTextPayload({...body,messages:[{...body.messages[0],media:[]}]}));
assert.throws(()=>quoteTextPayload({...body,messages:[{...body.messages[0],media:Array(10).fill(image)}]}));
assert.throws(()=>quoteTextPayload({...body,messages:[{...body.messages[0],media:Array(5).fill(image)},{...body.messages[0],media:Array(5).fill(image)}]}));
const mediumData='data:image/png;base64,'+Buffer.concat([png,Buffer.alloc(600*1024)]).toString('base64');
assert.throws(()=>quoteTextPayload({...body,messages:[{...body.messages[0],media:[{...image,dataUrl:mediumData},{...image,dataUrl:mediumData}]}]}),/图片总量/);
const oneMegabyte='data:image/png;base64,'+Buffer.concat([png,Buffer.alloc(1024*1024-png.length)]).toString('base64');
const oversizedBody={nickname:'\0'.repeat(32),messages:Array.from({length:50},(_,i)=>({...body.messages[0],senderName:'\0'.repeat(64),text:'\0'.repeat(2000),media:i===0?[{...image,dataUrl:oneMegabyte}]:[]})),captchaVerifyParam:'\0'.repeat(16384)};
assert.ok(Buffer.byteLength(JSON.stringify(oversizedBody))>2*1024*1024);let oversizedCalls=0;
await assert.rejects(createQuoteClient({fetchImpl:async()=>{oversizedCalls++;return new Response('{"ok":true}');}}).publishQuote(oversizedBody),error=>error.status===413);assert.equal(oversizedCalls,0);
console.log('· Host readiness uses the cancellation signal; cancellation and late CAPTCHA callbacks cannot hold or submit a stale request');
const preflight=new AbortController(),hostCalls=[];let verificationStarts=0,readyStarted;
const readyPending=new Promise(resolve=>{readyStarted=resolve;});
const cancelled=publishQuoteFromHost({request:async(method,_path,_body,_query,options)=>{hostCalls.push(method);assert.equal(options.signal,preflight.signal);readyStarted();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));}}, {nickname:body.nickname,messages:body.messages},{signal:preflight.signal,verifyCaptcha:async()=>{verificationStarts++;return'qa149-proof';}});
await readyPending;preflight.abort(new Error('qa149-cancel-preflight'));await assert.rejects(cancelled,/qa149-cancel-preflight/);assert.equal(verificationStarts,0);assert.deepEqual(hostCalls,['GET']);
let postCount=0;
const hostApi={request:async(method,_path,payload)=>{if(method==='GET')return{available:true,imageSupport:true};postCount++;assert.equal(payload.captchaVerifyParam,'qa149-reopened-proof');return{ok:true};}};
assert.deepEqual(await publishQuoteFromHost(hostApi,{nickname:body.nickname,messages:body.messages},{verifyCaptcha:async()=>'qa149-reopened-proof'}),{ok:true});assert.equal(postCount,1);
await assert.rejects(publishQuoteFromHost({request:async()=>({available:true,textOnly:true})},{nickname:body.nickname,messages:body.messages},{verifyCaptcha:async()=>{verificationStarts++;return'bad';}}),/不支持图片/);assert.equal(verificationStarts,0);
const late=new AbortController();let releaseProof,startedProof;const proofStarted=new Promise(resolve=>{startedProof=resolve;});
const lateResult=publishQuoteFromHost(hostApi,{nickname:body.nickname,messages:body.messages},{signal:late.signal,verifyCaptcha:()=>{startedProof();return new Promise(resolve=>{releaseProof=resolve;});}});await proofStarted;late.abort(new Error('qa149-cancel-proof'));releaseProof('qa149-reopened-proof');await assert.rejects(lateResult,/qa149-cancel-proof/);assert.equal(postCount,1);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-quote149-')),root=path.join(temp,'media');fs.mkdirSync(root);
// Keep the actual default provider closure, with no workspace/installed roots.
const isolation = isolateConsoleFixture(temp, '149');
fs.writeFileSync(path.join(isolation.appRoot, 'package.json'), JSON.stringify({type:'module'}));
fs.cpSync(new URL('../src', import.meta.url), path.join(isolation.appRoot, 'src'), {recursive:true});
for (const name of ["community","market","media-service"]) fs.cpSync(new URL(`../bundled/${name}`, import.meta.url), path.join(isolation.appRoot, 'bundled', name), {recursive:true});
function assertFixtureOwners(active = false) {
  assert.deepEqual(kernel.loader.listEntries().map(entry => entry.id).sort(), ["community","market","media-service"], 'only the actual declared default fixture owners are loaded');
  if (active) {
    for (const id of ["community","market","media-service"]) assert.equal(kernel.loader.isActive(id), true, id);
    assert.deepEqual(kernel.capability.providers('market.client').map(item => item.ownerId), ['market']);
    assert.deepEqual(kernel.capability.providers('community.client').map(item => item.ownerId), ['community']);
    assert.deepEqual(kernel.capability.providers('media.reader').map(item => item.ownerId), ['media-service']);
  }
}
function cleanupFixture() {
  try { isolation.restore(); } finally {
    const relative = path.relative(os.tmpdir(), temp);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    fs.rmSync(temp, {recursive:true, force:true});
  }
}

const file=path.join(root,'picture.png');fs.writeFileSync(file,png);
const calls=[];let delay=false,release=null;
const kernel=createKernel({appRoot:isolation.appRoot,env:isolation.env,headless:true,
 transport:{id:'qa149',start(){},stop(){},status:()=>({connected:true}),actions:{}},
 priceUpdates:{refresh:async()=>({ok:true})},communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]}),getBlocklist:()=>({ok:true,ids:[]})},
 fetchImpl:async(url,init)=>{assert.equal(String(url),QUOTE_ENDPOINT);calls.push({url:String(url),init:{...init,signal:undefined},body:JSON.parse(init.body)});if(delay)await new Promise(resolve=>{release=resolve;});return new Response(JSON.stringify({ok:true,ignored:'never return remote fields'}));},
});
const token='qa149-local-token';kernel.config.update({server:{port:0,token},telemetry:{enabled:false},proactive:{enabled:false},security:{mediaRoots:[root]},api:{apiKey:'qa149-synthetic-key'}});
kernel.loader.startWatchers=()=>{};
let port;
const request=async(method,route,value)=>{const r=await fetch(`http://127.0.0.1:${port}${route}`,{method,headers:{'x-console-token':token,'content-type':'application/json'},...(value?{body:JSON.stringify(value)}:{})});return{status:r.status,body:await r.json()};};
try{
 port=await kernel.start();isolation.allowOrigin(`http://127.0.0.1:${port}`);assertFixtureOwners(true);
 console.log('· Real media resolver returns the cache bytes without exposing source coordinates to publication');
 const resolved=await request('POST','/api/media-data',{items:[{kind:'image',file,url:'https://expired.invalid/private-qq-image'}]});assert.equal(resolved.status,200);
 const actual=resolved.body.results[0];assert.equal(typeof actual==='string'?actual:actual?.dataUrl,dataUrl);
 const status=await request('GET','/api/community/quotes/status');assert.equal(status.body.textOnly,false);
 for(const media of invalid){const result=await request('POST','/api/community/quotes',{...body,messages:[{...body.messages[0],media:[media]}]});assert.ok([400,413].includes(result.status));}
 assert.equal((await request('POST','/api/community/quotes',{...body,captchaVerifyParam:''})).status,400);assert.equal(calls.length,0);
 console.log('· Real bundled service/HTTP dispatch sends only approved picture bytes, no chat/QQ IDs, paths or keys');
 const result=await request('POST','/api/community/quotes',body);assert.equal(result.status,200);assert.deepEqual(result.body,{ok:true});assert.equal(calls.length,1);
 assert.deepEqual(calls[0].body,body);assert.equal(calls[0].init.redirect,'manual');
 assert.doesNotMatch(JSON.stringify(calls),/expired\.invalid|private-qq-image|qa149-local-token|qa149-synthetic-key|senderId|groupId|chatKey|C:\//);
 assert.equal(Buffer.from(calls[0].body.messages[0].media[0].dataUrl.split(',')[1],'base64').equals(png),true);
 console.log('· Disabling the community provider refuses a fresh image publication without network traffic');
 await kernel.loader.setEnabled('community',false);assert.equal((await request('POST','/api/community/quotes',body)).status,503);assert.equal(calls.length,1);
 isolation.assertOffline();assertFixtureOwners();
 console.log('✓ 149-quote-image-publication: reviewed image bytes, strict limits/fields, real media-to-community HTTP and disabled provider passed');
}finally{try{release?.();await kernel.stop();}finally{cleanupFixture();}}

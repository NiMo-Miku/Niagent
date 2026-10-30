// In-process transport/DNS/reader fixtures only. Global IO always refuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';import dnsPromises from 'node:dns/promises';
import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {safeFetch,validateMediaUrl} from '../src/kernel/safe-fetch.js';
import {createWebSearch} from '../src/kernel/web-search.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(setImmediate);
const publicDns=async()=>[{address:'8.8.8.8',family:4}];
const reason=label=>Error('owned cancellation241 '+label);
const rejectsReason=(work,error)=>assert.rejects(work,actual=>actual===error);

test('241 safeFetch cancels each asynchronous boundary and releases owned bodies',{timeout:15000},async t=>{
  const blocked=[],restores=[];
  const deny=(o,k)=>{const old=o[k];restores.push(()=>o[k]=old);o[k]=()=>{blocked.push(k);throw Error('241 forbids actual IO '+k);};};
  deny(globalThis,'fetch');deny(dns,'lookup');deny(dnsPromises,'lookup');for(const o of[http,https])for(const k of['request','get'])deny(o,k);
  deny(net.Socket.prototype,'connect');deny(net.Server.prototype,'listen');deny(tls,'connect');for(const k of['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(childProcess,k);syncBuiltinESMExports();
  t.after(()=>{for(const restore of restores.reverse())restore();syncBuiltinESMExports();assert.deepEqual(blocked,[]);});

  await t.test('already canceled default webpage consumer makes zero DNS or HTTP calls',async()=>{
    const c=new AbortController(),error=reason('pre-search');c.abort(error);let dnsCalls=0,httpCalls=0;
    const service=createWebSearch({cfg:()=>({security:{allowPrivateImageHosts:true}}),dnsLookup:async()=>{dnsCalls++;return publicDns();},fetchImpl:async()=>{httpCalls++;return new Response('<p>owned</p>');}});
    await rejectsReason(service.fetchPage('https://page233.invalid/',{signal:c.signal}),error);assert.equal(dnsCalls,0);assert.equal(httpCalls,0);
  });

  for(const mode of['dns','skip-dns-private','ip'])await t.test(`precancel performs no DNS/transport: ${mode}`,async()=>{
    const c=new AbortController(),error=reason(mode);c.abort(error);let dnsCalls=0,httpCalls=0;
    const options={signal:c.signal,allowPrivate:mode==='skip-dns-private',fetchImpl:async()=>{httpCalls++;return new Response('owned');},...(mode==='skip-dns-private'?{}:{dnsLookup:async()=>{dnsCalls++;return publicDns();}})};
    await rejectsReason(safeFetch(mode==='ip'?'https://8.8.8.8/':'https://pre241.invalid/',options),error);assert.equal(dnsCalls,0);assert.equal(httpCalls,0);
  });

  await t.test('media URL validator also rejects precancel before DNS',async()=>{
    const c=new AbortController(),error=reason('media');c.abort(error);let calls=0;
    await rejectsReason(validateMediaUrl('https://media241.invalid/',{signal:c.signal,dnsLookup:async()=>{calls++;return publicDns();}}),error);assert.equal(calls,0);
  });

  await t.test('held DNS cancels immediately, ignores late resolution and never starts HTTP',async()=>{
    const c=new AbortController(),gate=deferred(),entered=deferred(),error=reason('held dns');let requests=0;
    const work=safeFetch('https://dns241.invalid/',{signal:c.signal,dnsLookup:()=>{entered.resolve();return gate.promise;},fetchImpl:async()=>{requests++;return new Response('owned');}});
    await entered.promise;c.abort(error);await rejectsReason(work,error);gate.resolve(await publicDns());await tick();assert.equal(requests,0);
  });

  await t.test('DNS that synchronously aborts cannot win the resolved Promise race',async()=>{
    const c=new AbortController(),error=reason('DNS resolves after abort');let requests=0;
    const work=safeFetch('https://resolved241.invalid/',{signal:c.signal,dnsLookup:async()=>{c.abort(error);return publicDns();},fetchImpl:async()=>{requests++;return new Response('owned');}});
    await rejectsReason(work,error);assert.equal(requests,0);
  });

  await t.test('held transport ignoring signal settles before it returns and cancels the late body once',async()=>{
    const c=new AbortController(),gate=deferred(),entered=deferred(),error=reason('held fetch');let canceled=0,reads=0;
    const work=safeFetch('https://fetch241.invalid/',{allowPrivate:true,signal:c.signal,fetchImpl:async()=>{entered.resolve();return gate.promise;}});
    await entered.promise;c.abort(error);await rejectsReason(work,error);
    gate.resolve({status:200,headers:new Headers(),body:{cancel:async()=>{canceled++;},getReader(){reads++;return{read:async()=>({done:true})};}}});await tick();assert.equal(canceled,1);assert.equal(reads,0);
  });

  await t.test('a transport resolving synchronously after abort releases its body without success',async()=>{
    const c=new AbortController(),error=reason('resolved transport');let canceled=0;
    await rejectsReason(safeFetch('https://resolved-fetch241.invalid/',{allowPrivate:true,signal:c.signal,fetchImpl:async()=>{c.abort(error);return{status:200,headers:new Headers(),body:{cancel:async()=>{canceled++;}}};}}),error);
    await tick();assert.equal(canceled,1);
  });

  await t.test('late transport rejection after cancellation has an attached rejection handler',async()=>{
    const c=new AbortController(),gate=deferred(),entered=deferred(),error=reason('late fetch error');
    const work=safeFetch('https://late241.invalid/',{allowPrivate:true,signal:c.signal,fetchImpl:()=>{entered.resolve();return gate.promise;}});
    await entered.promise;c.abort(error);await rejectsReason(work,error);gate.reject(Error('owned late fetch rejection241'));await tick();
  });

  await t.test('held reader ignoring signal cancels/releases once and never hands out late bytes',async()=>{
    const c=new AbortController(),gate=deferred(),entered=deferred(),error=reason('reader');let reads=0,cancels=0,releases=0,chunks=0;
    const work=safeFetch('https://reader241.invalid/',{allowPrivate:true,signal:c.signal,onChunk:()=>{chunks++;},fetchImpl:async()=>({status:200,headers:new Headers(),body:{getReader:()=>({read:()=>{reads++;entered.resolve();return gate.promise;},cancel:async()=>{cancels++;},releaseLock(){releases++;}})}})});
    await entered.promise;c.abort(error);await rejectsReason(work,error);gate.resolve({done:false,value:Buffer.from('late bytes')});await tick();
    assert.equal(reads,1);assert.equal(cancels,1);assert.equal(releases,1);assert.equal(chunks,0);
  });

  await t.test('onChunk cancellation prevents another read or accumulation and never returns truncated success',async()=>{
    const c=new AbortController(),error=reason('onChunk');let reads=0,cancels=0,releases=0;const chunks=[];
    await rejectsReason(safeFetch('https://chunks241.invalid/',{allowPrivate:true,signal:c.signal,maxBytes:6,
      fetchImpl:async()=>({status:200,headers:new Headers(),body:{getReader:()=>({read:async()=>({done:false,value:Buffer.from(++reads===1?'first':'later')}),cancel:async()=>{cancels++;},releaseLock(){releases++;}})}}),
      onChunk:async chunk=>{chunks.push(chunk.toString());c.abort(error);}}),error);
    assert.deepEqual(chunks,['first']);assert.equal(reads,1);assert.equal(cancels,1);assert.equal(releases,1);
  });

  await t.test('held onChunk rejects promptly and no later callback starts after cancellation',async()=>{
    const c=new AbortController(),gate=deferred(),entered=deferred(),error=reason('held onChunk');let reads=0,writes=0,cancels=0;
    const work=safeFetch('https://write241.invalid/',{allowPrivate:true,signal:c.signal,
      fetchImpl:async()=>({status:200,headers:new Headers(),body:{getReader:()=>({read:async()=>({done:false,value:Buffer.from(String(++reads))}),cancel:async()=>{cancels++;}})}}),
      onChunk:()=>{writes++;entered.resolve();return gate.promise;}});
    await entered.promise;c.abort(error);await rejectsReason(work,error);gate.reject(Error('owned late write rejection241'));await tick();assert.equal(reads,1);assert.equal(writes,1);assert.equal(cancels,1);
  });

  await t.test('real WHATWG reader cancellation releases its lock and no success leaks through EOF',async()=>{
    const c=new AbortController(),gate=deferred(),entered=deferred(),error=reason('real stream');let canceled=0;
    const response=new Response(new ReadableStream({pull(){entered.resolve();return gate.promise;},cancel(){canceled++;}}));
    const work=safeFetch('https://whatwg241.invalid/',{allowPrivate:true,signal:c.signal,fetchImpl:async()=>response});await entered.promise;await tick();c.abort(error);await rejectsReason(work,error);
    gate.resolve();await tick();assert.equal(canceled,1);assert.equal(response.body.locked,false);
  });

  await t.test('arrayBuffer fallback ignores late data and cleans an unread response',async()=>{
    const c=new AbortController(),gate=deferred(),entered=deferred(),error=reason('arrayBuffer');let cancels=0,chunks=0;
    const work=safeFetch('https://buffer241.invalid/',{allowPrivate:true,signal:c.signal,onChunk:()=>{chunks++;},fetchImpl:async()=>({status:200,headers:new Headers(),body:{cancel:async()=>{cancels++;}},arrayBuffer:()=>{entered.resolve();return gate.promise;}})});
    await entered.promise;c.abort(error);await rejectsReason(work,error);gate.resolve(Buffer.from('late').buffer);await tick();assert.equal(chunks,0);assert.equal(cancels,1);
  });

  await t.test('redirect body cleanup remains cancellable and cannot start the next hop after abort',async()=>{
    const c=new AbortController(),gate=deferred(),entered=deferred(),error=reason('redirect cleanup');let calls=0,cancels=0;
    const work=safeFetch('https://redirect241.invalid/',{allowPrivate:true,signal:c.signal,fetchImpl:async()=>{calls++;return{status:302,headers:new Headers({location:'https://next241.invalid/'}),body:{cancel:()=>{cancels++;entered.resolve();return gate.promise;}}};}});
    await entered.promise;c.abort(error);await rejectsReason(work,error);gate.resolve();await tick();assert.equal(calls,1);assert.equal(cancels,1);
  });

  await t.test('cancel between redirect headers and cleanup still releases its accepted response',async()=>{
    const c=new AbortController(),error=reason('redirect headers');let calls=0,cancels=0;
    await rejectsReason(safeFetch('https://headers241.invalid/',{allowPrivate:true,signal:c.signal,fetchImpl:async()=>{calls++;return{get status(){c.abort(error);return 302;},headers:new Headers({location:'https://never241.invalid/'}),body:{cancel:async()=>{cancels++;}}};}}),error);
    assert.equal(calls,1);assert.equal(cancels,1);
  });

  for(const stage of['dns','fetch','reader'])await t.test(`timeout applies even when ${stage} ignores signal`,async()=>{
    const gate=deferred();let canceled=0;
    const options={timeoutMs:10,dnsLookup:stage==='dns'?()=>gate.promise:publicDns,fetchImpl:stage==='fetch'?()=>gate.promise:async()=>({status:200,headers:new Headers(),body:{getReader:()=>({read:()=>gate.promise,cancel:async()=>{canceled++;}})}})};
    await assert.rejects(safeFetch('https://timeout241.invalid/',options),/请求超时/);
    gate.resolve(stage==='dns'?await publicDns():stage==='fetch'?{body:{cancel:async()=>{canceled++;}}}:{done:true});await tick();assert.equal(canceled,stage==='dns'?0:1);
  });

  await t.test('noncanceled redirect still repeats DNS, strips cross-origin credentials and keeps byte budgets',async()=>{
    const names=[],requests=[];let canceled=0;
    const out=await safeFetch('https://first241.invalid/',{dnsLookup:async name=>{names.push(name);return publicDns();},headers:{authorization:'synthetic241','x-api-key':'synthetic241',accept:'text/plain'},maxBytes:4,
      fetchImpl:async(url,init)=>{requests.push({url,init});return requests.length===1?{status:302,headers:new Headers({location:'https://second241.invalid/'}),body:{cancel:async()=>{canceled++;}}}:new Response('owned bytes');}});
    assert.deepEqual(names,['first241.invalid','second241.invalid']);assert.equal(requests.length,2);assert.equal(requests[0].init.redirect,'manual');assert.equal(requests[0].init.headers.authorization,'synthetic241');
    assert.equal(requests[1].init.headers.authorization,undefined);assert.equal(requests[1].init.headers['x-api-key'],undefined);assert.equal(requests[1].init.headers.accept,'text/plain');
    assert.equal(out.body,'owne');assert.equal(out.bytes,4);assert.equal(out.truncated,true);assert.equal(canceled,1);
    assert.deepEqual(out.hops,['https://first241.invalid/','https://second241.invalid/']);
  });

  await t.test('mixed/private DNS and redirect browseLock checks still reject before the next transport',async()=>{
    let calls=0;
    await assert.rejects(safeFetch('https://mixed241.invalid/',{dnsLookup:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}],fetchImpl:async()=>{calls++;return new Response('wrong');}}),/内网/);assert.equal(calls,0);
    await assert.rejects(safeFetch('https://allowed241.invalid/',{browseLocked:true,allowedHosts:['allowed241.invalid'],dnsLookup:publicDns,fetchImpl:async()=>{calls++;return{status:302,headers:new Headers({location:'https://blocked241.invalid/'}),body:{cancel:async()=>{}}};}}),/白名单/);assert.equal(calls,1);
  });

  await t.test('successful EOF and callback errors both release reader ownership',async()=>{
    for(const fail of[false,true]){let reads=0,cancels=0,releases=0;
      const work=safeFetch('https://finish241.invalid/',{allowPrivate:true,onChunk:fail?()=>{throw Error('owned callback241');}:undefined,fetchImpl:async()=>({status:200,headers:new Headers(),body:{getReader:()=>({read:async()=>++reads===1?{done:false,value:Buffer.from('ok')}:{done:true},cancel:async()=>{cancels++;},releaseLock(){releases++;}})}})});
      if(fail)await assert.rejects(work,/owned callback241/);else assert.equal((await work).body,'ok');assert.equal(releases,1);assert.equal(cancels,fail?1:0);
    }
  });

  await t.test('real pinned native adapter retains checked lookup/headers and discards a late native response',async()=>{
    const original=http.request,captured=[];let late,stream;
    http.request=(url,options,callback)=>{
      assert.equal(url.hostname,'native241.invalid');captured.push({url,options});
      options.lookup(url.hostname,{all:true},(error,addresses)=>{assert.equal(error,null);assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}]);});
      const req=new EventEmitter();req.end=()=>{late=()=>{stream=Readable.from([Buffer.from('native owned')]);Object.assign(stream,{rawHeaders:['content-type','text/plain'],headers:{'content-type':'text/plain'},statusCode:200});callback(stream);};};return req;
    };
    try{
      const c=new AbortController(),error=reason('native late');
      const work=safeFetch('http://native241.invalid/',{signal:c.signal,dnsLookup:publicDns,headers:{'x-owned':'preserved',host:'ignored.invalid'}});
      while(!late)await tick();assert.equal(captured.length,1);assert.equal(captured[0].options.headers['x-owned'],'preserved');assert.equal(captured[0].options.headers.host,undefined);
      assert.equal(captured[0].options.agent,false);assert.equal(captured[0].options.autoSelectFamily,true);
      c.abort(error);await rejectsReason(work,error);assert.equal(captured[0].options.signal.aborted,true);late();await tick();await tick();assert.equal(stream.destroyed,true);
    }finally{http.request=original;}
  });

  await t.test('caller abort listeners are removed on success, DNS failure and cancellation',async()=>{
    for(const mode of['success','dns-error','abort']){
      const c=new AbortController(),signal=c.signal,add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);let active=0;
      signal.addEventListener=(name,fn,opts)=>{if(name==='abort')active++;return add(name,fn,opts);};signal.removeEventListener=(name,fn,opts)=>{if(name==='abort')active--;return remove(name,fn,opts);};
      const error=reason(mode),work=safeFetch('https://listeners241.invalid/',{signal,dnsLookup:async()=>{if(mode==='dns-error')throw Error('owned DNS241');return publicDns();},fetchImpl:async()=>{if(mode==='abort')c.abort(error);return new Response('owned');}});
      if(mode==='success')assert.equal((await work).body,'owned');else await assert.rejects(work,mode==='abort'?actual=>actual===error:/域名解析失败/);assert.equal(active,0);
    }
  });
});

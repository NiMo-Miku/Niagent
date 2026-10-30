// SPEC §6.10 / §16 R-24: send_group/private can take 90s; ordinary reads retain 15s.
// Exercise the actual panel client -> RpcBridge -> ApiClient chain with virtual time.
// The synthetic remote side effect deliberately survives renderer fetch cancellation:
// aborting a local wait does not prove that a non-idempotent OneBot send was cancelled.
import assert from 'node:assert/strict';
import {RpcBridge} from '../ui/shell/rpc-bridge.js';
import {ApiClient} from '../ui/shell/api-client.js';

const original=Object.fromEntries(['window','document','parent','location','fetch','setTimeout','clearTimeout'].map(key=>[key,globalThis[key]]));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let passed=0,failed=0,sequence=0;
function check(name,fn){try{fn();passed++;console.log('✓ '+name);}catch(error){failed++;console.error('✗ '+name+'\n  '+error.message);}}
function observe(promise){const state={status:'pending'};promise.then(value=>Object.assign(state,{status:'fulfilled',value}),error=>Object.assign(state,{status:'rejected',error}));return state;}

async function fixture({id='chats',kind='bundled',rules=[{method:'POST',path:'/api/chats/:key/test-send'},{method:'GET',path:'/api/status'},{method:'POST',path:'/api/chats/:key/mark-read'}],delay=45000,status=200,headersFirst=false}={}){
  let now=0,nextTimer=0,bridge;
  const timers=new Map(),created=[],listeners=new Map(),requests=[],deliveries=[],replies=[];
  globalThis.setTimeout=(fn,ms)=>{const timer=++nextTimer;timers.set(timer,{fn,at:now+ms});created.push({at:now,ms});return timer;};
  globalThis.clearTimeout=timer=>timers.delete(timer);
  const emit=event=>{for(const item of [...listeners.get(event.type)||[]]){if(item.once)listeners.set(event.type,(listeners.get(event.type)||[]).filter(x=>x!==item));item.fn(event);}};
  globalThis.window={addEventListener(type,fn,options){const list=listeners.get(type)||[];list.push({fn,once:options?.once===true});listeners.set(type,list);},removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(x=>x.fn!==fn));},dispatchEvent:emit};
  // No destructive controls are mounted here; pagehide must still run the real
  // panel-client cleanup against a document, as it does in a browser.
  globalThis.document={defaultView:globalThis.window};
  globalThis.location={origin:'http://qa151.invalid',href:'http://qa151.invalid/'};
  const frame={addEventListener(){},contentWindow:{postMessage(message){replies.push({...message,qa151At:now});queueMicrotask(()=>emit({type:'message',source:globalThis.parent,origin:location.origin,data:message}));}}};
  globalThis.parent={postMessage(message){queueMicrotask(()=>void bridge.handle({source:frame.contentWindow,origin:'null',data:message}));}};
  globalThis.fetch=async(url,init)=>{
    assert.equal(new URL(url).hostname,'qa151.invalid','no real network endpoint');
    assert.ok(init.signal instanceof AbortSignal,'real AbortSignal reaches synthetic fetch');
    const request={url:String(url),method:init.method,body:init.body,signal:init.signal,at:now};requests.push(request);
    if(headersFirst){
      const stream=new ReadableStream({start(controller){
        const abort=()=>controller.error(init.signal.reason);init.signal.addEventListener('abort',abort,{once:true});
        setTimeout(()=>{deliveries.push({url:String(url),at:now});init.signal.removeEventListener('abort',abort);if(!init.signal.aborted){controller.enqueue(new TextEncoder().encode(JSON.stringify({ok:true,messageId:151})));controller.close();}},delay);
        if(init.signal.aborted)abort();
      }});
      return new Response(stream,{status,headers:{'content-type':'application/json'}});
    }
    return new Promise((resolve,reject)=>{
      const abort=()=>reject(init.signal.reason);init.signal.addEventListener('abort',abort,{once:true});
      setTimeout(()=>{deliveries.push({url:String(url),at:now});init.signal.removeEventListener('abort',abort);resolve(new Response(JSON.stringify(status===200?{ok:true,messageId:151}:{error:'QA151 transport failed'}),{status,headers:{'content-type':'application/json'}}));},delay);
      if(init.signal.aborted)abort();
    });
  };
  bridge=new RpcBridge({frame,api:new ApiClient({token:'qa151-local-token'}),manifest:{id,kind,api:rules}});
  const panel=await import('../ui/panels/panel-client.js?qa151='+ ++sequence);
  emit({type:'message',source:parent,origin:location.origin,data:{jsonrpc:'2.0',method:'panel.init',params:{nonce:bridge.nonce,panel:id}}});
  await flush();
  return{panel,bridge,frame,requests,deliveries,replies,created,
    async advance(ms){const target=now+ms;await flush();for(;;){let first;for(const [timer,item]of timers){if(item.at<=target&&(!first||item.at<first[1].at))first=[timer,item];}if(!first)break;now=first[1].at;timers.delete(first[0]);first[1].fn();await flush();}now=target;await flush();},
    event(params,method='api.request'){return{source:frame.contentWindow,origin:'null',data:{jsonrpc:'2.0',id:'forged151',method,params,meta:{nonce:bridge.nonce,panel:id}}};},
    close(){bridge.close();emit({type:'pagehide'});},
  };
}

try{
  console.log('· Real panel/bridge/API wait survives the previously failing 45s send');
  {
    const f=await fixture(),result=observe(f.panel.request('POST','/api/chats/group_10001/test-send',{text:'QA151 single synthetic send'}));
    await f.advance(15000);check('45s group send remains pending at 15s',()=>assert.equal(result.status,'pending'));
    await f.advance(30000);check('45s group send succeeds exactly once without an aborted fetch',()=>{assert.equal(result.status,'fulfilled');assert.equal(result.value.messageId,151);assert.equal(f.requests.length,1);assert.equal(f.requests[0].signal.aborted,false);assert.equal(f.deliveries.length,1);});f.close();
  }
  {
    const f=await fixture({delay:90000}),result=observe(f.panel.request('post','/api/chats/private_20001/test-send',{text:'QA151 private boundary'}));
    await f.advance(89999);check('private send remains pending through the OneBot 90s window',()=>assert.equal(result.status,'pending'));
    await f.advance(1);check('private send at 90s receives the success acknowledgment',()=>{assert.equal(result.status,'fulfilled');assert.equal(f.requests.length,1);assert.equal(f.requests[0].signal.aborted,false);});f.close();
  }
  {
    const f=await fixture({id:'sessions',delay:90000});
    const first=observe(f.panel.request('POST','/api/chats/group_10002/test-send',{text:'QA151 broadcast target one'}));
    await f.advance(90000);check('sessions broadcast target has its own 90s send budget',()=>assert.equal(first.status,'fulfilled'));
    const second=observe(f.panel.request('POST','/api/chats/private_20002/test-send',{text:'QA151 broadcast target two'}));
    await f.advance(15000);check('second broadcast target receives a fresh budget after the first completes',()=>assert.equal(second.status,'pending'));
    await f.advance(75000);check('sequential broadcast acknowledges both targets once',()=>{assert.equal(second.status,'fulfilled');assert.equal(f.requests.length,2);assert.equal(f.deliveries.length,2);});f.close();
  }
  console.log('· Ordinary reads/mutations retain 15s; caller timeouts cannot raise the host budget');
  for(const [method,path]of [['GET','/api/status'],['POST','/api/chats/group_10001/mark-read'],['GET','/api/chats/group_1/test-send'],['POST','/api/chats/group_1/test-send/'],['POST','/api/chats/group_one/test-send'],['GET','/api/market/install'],['POST','/api/market/install/'],['GET','/api/market/catalog'],['POST','/api/market/verify']]){
    const f=await fixture({delay:20000,rules:[{method,path}]});
    const result=observe(f.panel.rpc('api.request',{method,path,timeout:3600000},3600000));
    await f.advance(15000);check(`${method} ${path} remains limited to 15s despite forged timeout`,()=>{assert.equal(result.status,'rejected');assert.equal(f.requests.length,1);assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.requests[0].signal.reason.name,'TimeoutError');});f.close();
  }
  console.log('· Online installs have a bounded verify/download/unpack budget through the same real RPC chain');
  {
    const f=await fixture({id:'skills',rules:[{method:'POST',path:'/api/market/install'}],delay:45000});
    const result=observe(f.panel.request('POST','/api/market/install',{id:'qa151-install',kind:'skill'}));
    await f.advance(15000);check('market install remains pending at the former 15s deadline',()=>assert.equal(result.status,'pending'));
    await f.advance(30000);check('market install receives one slow success without retry',()=>{assert.equal(result.status,'fulfilled');assert.equal(f.requests.length,1);assert.equal(f.requests[0].signal.aborted,false);});f.close();
  }
  {
    const f=await fixture({id:'plugins',rules:[{method:'POST',path:'/api/market/install'}],delay:181000});
    const result=observe(f.panel.rpc('api.request',{method:'POST',path:'/api/market/install',timeout:3600000},3600000));
    await f.advance(179999);check('market install host wait covers bounded verification and package download',()=>assert.equal(result.status,'pending'));
    await f.advance(1);check('market install host ends at 180s despite a forged caller timeout',()=>{assert.equal(result.status,'rejected');assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.replies.filter(m=>m.id==='p1'&&m.error).length,1);});f.close();
  }
  {
    const f=await fixture({delay:101000});
    const result=observe(f.panel.rpc('api.request',{method:'POST',path:'/api/chats/group_1/test-send',timeout:3600000},3600000));
    await f.advance(99999);check('slow host wait includes bounded overhead beyond OneBot 90s',()=>assert.equal(result.status,'pending'));
    await f.advance(1);check('host ends slow wait at its fixed 100s budget and aborts actual fetch',()=>{assert.equal(result.status,'rejected');assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.requests[0].signal.reason.name,'TimeoutError');const failures=f.replies.filter(m=>m.id==='p1'&&m.error);assert.equal(failures.length,1);assert.equal(failures[0].qa151At,100000);});
    await f.advance(1000);check('a late remote delivery does not become a UI success or automatic retry',()=>{assert.equal(result.status,'rejected');assert.equal(f.requests.length,1);assert.equal(f.deliveries.length,1);assert.equal(f.replies.filter(m=>m.id==='p1'&&m.result).length,0);});f.close();
  }
  {
    const f=await fixture({delay:45000,status:502}),result=observe(f.panel.request('POST','/api/chats/group_1/test-send',{text:'QA151 failed send'}));
    await f.advance(45000);check('a slow provider failure preserves HTTP 502 without retry',()=>{assert.equal(result.status,'rejected');assert.equal(result.error.data.httpStatus,502);assert.match(result.error.message,/QA151 transport failed/);assert.equal(f.requests.length,1);});f.close();
  }
  console.log('· A 200 header is not success when its response body is cancelled or times out');
  for(const [method,path,budget,delay]of [['POST','/api/chats/group_1/test-send',100000,101000],['GET','/api/status',15000,20000]]){
    const f=await fixture({headersFirst:true,delay}),result=observe(f.panel.rpc('api.request',{method,path},3600000));
    await f.advance(budget);check(`${method} ${path} cannot return success after body timeout`,()=>{assert.equal(result.status,'rejected');assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.requests[0].signal.reason.name,'TimeoutError');assert.equal(result.error.code,-32603);assert.equal(f.replies.filter(m=>m.id==='p1'&&m.result).length,0);});f.close();
  }
  {
    const f=await fixture({headersFirst:true,delay:45000}),result=observe(f.panel.request('POST','/api/chats/group_1/test-send',{text:'QA151 streamed unload'}));
    await f.advance(15000);f.close();await f.advance(0);
    check('unloading during body decoding aborts fetch without a successful stale reply',()=>{assert.equal(result.status,'rejected');assert.match(result.error.message,/面板已卸载/);assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.replies.filter(m=>m.id==='p1'&&m.result).length,0);});
  }
  {
    const f=await fixture({kind:'user'}),result=observe(f.panel.request('POST','/api/chats/group_1/test-send',{text:'forbidden'}));
    await f.advance(0);check('user iframe cannot acquire slow bundled API access',()=>{assert.equal(result.status,'rejected');assert.equal(result.error.code,-32601);assert.equal(f.requests.length,0);});f.close();
  }
  {
    const f=await fixture(),before=f.replies.length;
    for(const patch of [e=>e.source={},e=>e.origin='https://evil.invalid',e=>e.data.meta.nonce='wrong',e=>e.data.meta.panel='sessions']){const event=f.event({method:'POST',path:'/api/chats/group_1/test-send',timeout:3600000});patch(event);await f.bridge.handle(event);}
    check('source/origin/nonce/panel forgery remains ignored',()=>{assert.equal(f.requests.length,0);assert.equal(f.replies.length,before);});
    await f.bridge.handle(f.event({method:'POST',path:'/api/reset-data',timeout:3600000}));
    check('unlisted path stays forbidden before any fetch or slow timer',()=>{assert.equal(f.requests.length,0);assert.equal(f.replies.at(-1).error.code,-32003);});f.close();
  }
  {
    const f=await fixture(),result=observe(f.panel.request('POST','/api/chats/group_1/test-send',{text:'QA151 unload'}));
    await f.advance(15000);f.close();await f.advance(0);
    check('unloading propagates abort to actual fetch and rejects the panel waiter',()=>{assert.equal(f.requests.length,1);assert.equal(f.requests[0].signal.aborted,true);assert.equal(result.status,'rejected');assert.match(result.error.message,/面板已卸载/);});
    await f.advance(30000);check('unload is no guarantee of cancelling an already-started remote send',()=>{assert.equal(f.deliveries.length,1);assert.equal(f.requests.length,1);assert.equal(f.replies.filter(m=>m.id==='p1'&&m.result).length,0);});
  }
  console.log('· Dedicated publication/auth/confirmation and user tool waits keep existing budgets');
  for(const [method,path,budget]of [['POST','/api/chats/group_1/test-send',105000],['POST','/api/market/install',185000],['GET','/api/status',15000]]){
    const f=await fixture();parent.postMessage=()=>{};const result=observe(f.panel.request(method,path));
    await f.advance(budget-1);check(`${method} ${path} panel waiter remains pending before its deadline`,()=>assert.equal(result.status,'pending'));
    await f.advance(1);check(`${method} ${path} panel waiter expires at exactly ${budget/1000}s if host reply is missing`,()=>{assert.equal(result.status,'rejected');assert.equal(f.requests.length,0);});f.close();
  }
  for(const [name,budget,args]of [['publishQuote',180000,[{}]],['publishMarket',300000,[{}]],['publishFeedback',150000,[{}]],['authenticateMarket',180000,[{}]],['confirmAction',120000,['QA151 confirm']]]){
    const f=await fixture();parent.postMessage=()=>{};const result=observe(f.panel[name](...args));
    await f.advance(budget-1);check(`${name} stays pending until its existing deadline`,()=>assert.equal(result.status,'pending'));
    await f.advance(1);check(`${name} keeps its existing ${budget/1000}s deadline`,()=>assert.equal(result.status,'rejected'));f.close();
  }
  {
    const f=await fixture({kind:'user'});parent.postMessage=()=>{};const result=observe(f.panel.ctx.call('qa151__echo',{}));
    await f.advance(14999);check('user ctx.call still waits 15s',()=>assert.equal(result.status,'pending'));
    await f.advance(1);check('user ctx.call has no blanket slow-send extension',()=>assert.equal(result.status,'rejected'));f.close();
  }
}finally{
  for(const [key,value]of Object.entries(original))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
}
console.log(`151 slow-send panel timeout: ${passed} passed / ${failed} failed`);
if(failed)process.exitCode=1;

// Owned names only: real leases/permission receipts, application HTTP and UI.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSessionNameController} from '../src/console/session-names.js';
import {createCapabilityRegistry} from '../src/kernel/capability.js';
import {createServiceLease} from '../src/kernel/service-lease.js';
import {createPermissions} from '../src/kernel/permissions.js';
import {createCompositionLifecycle} from '../src/kernel/composition-lifecycle.js';
import {Bus} from '../src/kernel/bus.js';
import {createApplication} from '../src/kernel/composition.js';
import {defaultComponents} from '../bundled/runtime-defaults/components.js';
import {createOneBotProvider} from '../bundled/transport-onebot/provider.js';
import {modelUiFixture} from './model-ui-fixture.mjs';
const source=path.resolve(import.meta.dirname,'..'),tick=()=>new Promise(setImmediate);
const gate=()=>{let resolve;return{promise:new Promise(done=>{resolve=done;}),resolve:value=>resolve(value)};};
async function until(check){for(let i=0;i<300;i++){if(check())return;await tick();}assert.ok(check(),'owned asynchronous boundary reached');}
function pure(t,{actions={},provider,timeoutMs=80,...options}={}){
  const lifecycle=createCompositionLifecycle(),bus=new Bus({}),capability=createCapabilityRegistry({log:{}}),permissions=createPermissions({bus,log:{},headless:true});
  const active=provider??{id:'synthetic-names248',selfId:'24899',actions};
  capability.register('transport.provider','names248',active,{scopes:['net.outbound']});
  permissions.setOverride('names248','net.outbound','allow');
  const services={get:()=>capability.providers('transport.provider')[0]?.provider,token:()=>{const row=capability.providers('transport.provider')[0];return row?capability.version('transport.provider',row.ownerId):null;}};
  const serviceLeaseOf=createServiceLease({services,capability,bus,lifecycle,providerLease:(id,scopes)=>{
    const receipts=scopes.map(scope=>permissions.check(id,scope,{kind:'user',notify:false,auditAsk:false}));
    return{isValid:()=>receipts.every(receipt=>receipt.decision==='allow'&&receipt.isValid())};
  }});
  const controller=createSessionNameController({resolveSource:()=>({provider:services.get(),token:services.token()}),serviceLeaseOf,capability,bus,lifecycle,timeoutMs,...options});
  t.after(async()=>{await lifecycle.close();permissions.close();assert.equal(bus.listenerCount('transport.status'),0);assert.equal(bus.listenerCount('permission.decision'),0);});
  return{controller,provider:active,bus,permissions,capability,lifecycle,replace:value=>capability.register('transport.provider','names248',value,{scopes:['net.outbound']})};
}
test('real authorization audits do not invalidate a read; catalog is single-flight and names expire',async t=>{
  let clock=0,calls=0,name='中文群 <img src=x onerror=alert(1)>',held=gate();
  const f=pure(t,{cacheMs:50,now:()=>clock,actions:{listGroups:async()=>{calls++;await held.promise;return[{id:'24801',name},{group_id:24802,group_name:'第二群'}];}}});
  const first=f.controller.getNames(['group:24801','group:24802','group:24801']),second=f.controller.getNames(['group:24801']);
  await until(()=>calls===1);held.resolve();assert.equal((await first).get('group:24801'),name);assert.equal((await second).get('group:24801'),name);assert.equal(calls,1);
  assert.ok(f.permissions.audit({n:100}).some(row=>row.detail==='管理员覆盖'&&row.decision==='allow'),'real non-kernel audit path was executed');
  assert.equal((await f.controller.getNames(['group:24802'])).get('group:24802'),'第二群');assert.equal(calls,1);
  name='已更名';clock=51;held=gate();held.resolve();assert.equal((await f.controller.getNames(['group:24801'])).get('group:24801'),'已更名');assert.equal(calls,2);
});
test('private without a friend action, malformed and oversized IDs never query group names',async t=>{
  let calls=0;const f=pure(t,{actions:{listGroups:async()=>{calls++;return[];}}});
  assert.equal((await f.controller.getNames(['private:1','group:x','group:1234567890123456','group_1','__proto__'])).size,0);assert.equal(calls,0);
});
test('friend catalogs are single-flight, share account/permission invalidation, and do not block group lookup',async t=>{
  let friendCalls=0,groupCalls=0;const held=gate();
  const f=pure(t,{timeoutMs:1000,actions:{listGroups:async()=>{groupCalls++;return[{id:'24801',name:'群名'}];},listFriends:async()=>{friendCalls++;await held.promise;return[{user_id:'24802',nickname:'昵称248',remark:' '},{id:'24803',name:'名字248',remark:'备注248'}];}}});
  const first=f.controller.getNames(['group:24801','private:24802','private:24803','private:24809']),second=f.controller.getNames(['private:24802']);await until(()=>friendCalls===1&&groupCalls===1);
  held.resolve();const names=await first;assert.equal(names.get('group:24801'),'群名');assert.equal(names.get('private:24802'),'昵称248');assert.equal(names.get('private:24803'),'备注248');assert.equal((await second).get('private:24802'),'昵称248');assert.equal(friendCalls,1);
  assert.equal((await f.controller.getNames(['private:24809'])).get('private:24809'),'');assert.equal(friendCalls,1,'confirmed missing names are cached too');
  f.permissions.setOverride('names248','net.outbound','deny');assert.equal((await f.controller.getNames(['private:24802'])).size,0);assert.equal(friendCalls,1);
  f.permissions.setOverride('names248','net.outbound','allow');f.provider.selfId='24898';assert.equal((await f.controller.getNames(['private:24802'])).get('private:24802'),'昵称248');assert.equal(friendCalls,2);
});
test('friend failures use independent backoff and late account results cannot be cached',async t=>{
  const held=gate();let calls=0;
  const f=pure(t,{timeoutMs:1000,actions:{listFriends:async()=>{calls++;await held.promise;return[{id:'24802',nickname:'旧账号昵称'}];},listGroups:async()=>[{id:'24801',name:'当前群名'}]}});
  const old=f.controller.getNames(['group:24801','private:24802']);await until(()=>calls===1);f.provider.selfId='24898';f.bus.emit('transport.status',{});assert.equal((await old).size,0,'a mixed batch must also retire group names resolved before the account switch');
  held.resolve();await tick();f.provider.actions.listFriends=async()=>{calls++;throw Error('offline');};assert.equal((await f.controller.getNames(['private:24802'])).size,0);assert.equal((await f.controller.getNames(['private:24802'])).size,0);assert.equal(calls,2);
  assert.equal((await f.controller.getNames(['group:24801'])).get('group:24801'),'当前群名');
});
test('an explicit unknown account identity waits for the current account before querying',async t=>{
  let identity=null,calls=0;const f=pure(t,{actions:{getAccountIdentity:()=>identity,listGroups:async()=>{calls++;return[{id:'24801',name:'current account'}];}}});
  assert.equal((await f.controller.getNames(['group:24801'])).size,0);assert.equal(calls,0);
  identity='known248';assert.equal((await f.controller.getNames(['group:24801'])).get('group:24801'),'current account');assert.equal(calls,1);
});
test('legacy-only action keeps full unique-key coverage, bounded concurrency and per-key single-flight',async t=>{
  let calls=0,active=0,max=0;const held=gate();
  const f=pure(t,{timeoutMs:1000,concurrency:3,actions:{getGroupName:async key=>{calls++;active++;max=Math.max(max,active);await held.promise;await tick();active--;return'名字 '+key;}}});
  const keys=Array.from({length:25},(_,i)=>'group:'+String(24800+i)),list=f.controller.getNames(keys),detail=f.controller.getNames([keys[0]]);
  await until(()=>calls===3);held.resolve();const [names,one]=await Promise.all([list,detail]);
  assert.equal(names.size,25);assert.equal(one.get(keys[0]),'名字 '+keys[0]);assert.equal(calls,25);assert.ok(max<=3);
  // Legacy providers need one action per uncached key. This is a concurrency
  // and whole-batch time bound, deliberately not an eight-total-call claim.
});
test('a failed catalog does not fan out over archived groups',async t=>{
  let catalog=0,fallback=0;const f=pure(t,{actions:{listGroups:async()=>{catalog++;throw Error('synthetic unavailable');},getGroupName:async()=>{fallback++;return'not called';}}});
  assert.equal((await f.controller.getNames(Array.from({length:500},(_,i)=>'group:'+String(30000+i)))).size,0);assert.equal(catalog,1);assert.equal(fallback,0);
});
test('a blocked action is cancelled at timeout and a late result is never cached',async t=>{
  const held=gate();let calls=0,signal,clock=0;const f=pure(t,{timeoutMs:25,now:()=>clock,actions:{listGroups:async options=>{calls++;signal=options.signal;await held.promise;return[{id:'24801',name:'late'}];}}});
  assert.equal((await f.controller.getNames(['group:24801'])).size,0);assert.equal(signal.aborted,true);held.resolve();await tick();
  f.provider.actions.listGroups=async()=>{calls++;return[{id:'24801',name:'current'}];};clock=5001;assert.equal((await f.controller.getNames(['group:24801'])).get('group:24801'),'current');assert.equal(calls,2);
});
test('disconnection and catalog failures avoid repeated name requests; a new source clears backoff',async t=>{
  let calls=0,connected=false,name='recovered';const provider={id:'offline',selfId:'24899',status:()=>({connected}),actions:{listGroups:async()=>{calls++;throw Error('offline catalog');}}};
  const f=pure(t,{provider});assert.equal((await f.controller.getNames(['group:24801'])).size,0);assert.equal(calls,0);
  connected=true;assert.equal((await f.controller.getNames(['group:24801'])).size,0);assert.equal((await f.controller.getNames(['group:24801'])).size,0);assert.equal(calls,1);
  provider.actions.listGroups=async()=>{calls++;return[{id:'24801',name}];};f.replace(provider);
  assert.equal((await f.controller.getNames(['group:24801'])).get('group:24801'),name);assert.equal(calls,2);
});
test('cancelling one catalog consumer preserves another caller and the shared source operation',async t=>{
  const held=gate(),cancel=new AbortController();let calls=0,signal;
  const f=pure(t,{actions:{listGroups:async options=>{calls++;signal=options.signal;await held.promise;return[{id:'24801',name:'shared'}];}}});
  const first=f.controller.getNames(['group:24801'],{signal:cancel.signal}),second=f.controller.getNames(['group:24801']);
  await until(()=>calls===1);cancel.abort();assert.equal((await first).size,0);assert.equal(signal.aborted,false);
  held.resolve();assert.equal((await second).get('group:24801'),'shared');assert.equal(calls,1);
});
for(const mode of ['registration ABA','account ABA','permission ABA'])test(`${mode} retires an ignored-abort old result permanently`,async t=>{
  const held=gate();let calls=0;
  const f=pure(t,{actions:{listGroups:async()=>{calls++;await held.promise;return[{id:'24801',name:'old'}];}}});
  const old=f.controller.getNames(['group:24801']);await until(()=>calls===1);
  if(mode==='registration ABA'){const original=f.provider;f.replace({id:'other',selfId:'2',actions:{}});f.replace(original);}
  if(mode==='account ABA'){f.provider.selfId='2';f.bus.emit('transport.status',{});f.provider.selfId='24899';f.bus.emit('transport.status',{});}
  if(mode==='permission ABA'){f.permissions.setOverride('names248','net.outbound','deny');f.permissions.setOverride('names248','net.outbound','allow');}
  held.resolve();assert.equal((await old).size,0);
  f.provider.actions.listGroups=async()=>[{id:'24801',name:'new'}];assert.equal((await f.controller.getNames(['group:24801'])).get('group:24801'),'new');
});
test('real default OneBot HTTP-only changes retire cached names until the account is reverified',async t=>{
  const config={onebot:{httpUrl:'http://inert248.invalid/a',wsUrl:'ws://inert248.invalid',httpAccessToken:'synthetic-a'}};let calls=0,logins=0,name='A';
  const provider=createOneBotProvider({cfg:()=>config,log:{},onEvent(){},onStatus(){}});provider.client.selfId='24899';provider.client.connected=true;
  const nativeFetch=globalThis.fetch,requests=[];
  t.after(async()=>{await provider.stop();globalThis.fetch=nativeFetch;});
  globalThis.fetch=async(url,options)=>{
    const target=new URL(url),action=target.pathname.split('/').at(-1);
    assert.equal(target.origin,'http://inert248.invalid');assert.equal(options.method,'POST');assert.ok(options.signal instanceof AbortSignal);
    requests.push(target.pathname);
    let data;
    if(action==='get_login_info'){logins++;data={user_id:24899,nickname:'synthetic248'};}
    else{assert.equal(action,'get_group_list');calls++;data=[{group_id:24801,group_name:name}];}
    return{ok:true,status:200,json:async()=>({status:'ok',retcode:0,data})};
  };
  const f=pure(t,{provider});assert.equal((await f.controller.getNames(['group:24801'])).get('group:24801'),'A');
  assert.equal((await f.controller.getNames(['group:24801'])).get('group:24801'),'A');assert.equal(calls,1,'unchanged identity still shares its cached catalog');
  const identity=provider.actions.getAccountIdentity(),wsGeneration=provider.client._gen;
  config.onebot.httpUrl='http://inert248.invalid/b';name='B';provider.refreshConfig({reconnect:false});
  assert.equal(provider.selfId,null);assert.equal(provider.actions.getAccountIdentity(),null);assert.equal(provider.client._gen,wsGeneration,'HTTP-only changes preserve the WS generation');
  assert.equal((await f.controller.getNames(['group:24801'])).size,0,'unverified identity cannot reuse the old name cache');assert.equal(calls,1,'unknown account cannot issue a name lookup');
  await provider.client.call('get_login_info');
  assert.equal(logins,1);assert.equal(provider.selfId,'24899');assert.notEqual(provider.actions.getAccountIdentity(),identity);
  assert.equal((await f.controller.getNames(['group:24801'])).get('group:24801'),'B');assert.equal(calls,2);
  assert.equal((await f.controller.getNames(['group:24801'])).get('group:24801'),'B');assert.equal(calls,2,'the reverified account caches its current catalog');
  assert.deepEqual(requests,['/a/get_group_list','/b/get_login_info','/b/get_group_list']);
});
test('stop immediately releases a never-resolving source and all subscriptions',async t=>{
  let entered=false;const f=pure(t,{timeoutMs:10000,actions:{listGroups:async()=>{entered=true;await new Promise(()=>{});}}});
  const result=f.controller.getNames(['group:24801']);await until(()=>entered);await f.lifecycle.close();assert.equal((await result).size,0);
  assert.equal((await f.controller.getNames(['group:24801'])).size,0);
});
test('default OneBot friend lookup forwards cancellation and suppresses its numeric fallback',async t=>{
  const provider=createOneBotProvider({cfg:()=>({onebot:{httpUrl:'http://inert248.invalid'}}),log:{},onEvent(){},onStatus(){}});provider.client.selfId='24899';provider.client.connected=true;
  let signal;const held=gate();provider.client.call=async(action,_args,options)=>{assert.equal(action,'get_friend_list');signal=options.signal;assert.ok(signal);await held.promise;return{data:[{user_id:24802,nickname:'真实动作合成昵称'},{user_id:24803}]};};
  const f=pure(t,{provider,timeoutMs:1000}),pending=f.controller.getNames(['private:24802','private:24803']);await until(()=>signal);held.resolve();const names=await pending;assert.equal(names.get('private:24802'),'真实动作合成昵称');assert.equal(names.get('private:24803'),'');
  assert.equal(signal.aborted,true,'the completed bounded lookup releases its request signal');
});
test('throwing presentation metadata cannot break history enrichment',async t=>{
  const provider={id:'inert',selfId:'1',get actions(){throw Error('synthetic malformed provider');}};const f=pure(t,{provider});
  assert.equal((await f.controller.getNames(['group:24801'])).size,0);
});

async function application(t,{mode='default'}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-names248-app-')),dataDir=path.join(root,'data');let app,external=0,calls=0,name='合成群248';
  for(const dir of ['bundled','plugins','skills'])fs.mkdirSync(path.join(root,dir));
  if(mode!=='default'){
    const layer=path.join(root,'overrides','names');fs.mkdirSync(layer,{recursive:true});
    fs.writeFileSync(path.join(layer,'names.mjs'),`export default previous=>options=>{const current=previous(options);return{...current,async getNames(keys,settings){const result=await current.getNames(keys,settings);return new Map([...result].map(([key,value])=>[key,value?'追加 '+value:value]));}};};`);
    fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify({version:2,id:'names248-layer',enabled:mode!=='disabled',components:{'console.sessionNames':{module:'./names.mjs',mode:'wrap'}}}));
  }
  const provider={id:'owned248',selfId:'24899',start(){},stop(){},status:()=>({connected:true,selfId:'24899'}),actions:{listGroups:async()=>{calls++;return[{id:'24801',name}];}}};
  t.after(async()=>{await app?.stop();assert.equal(external,0);assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('qqa-names248-app-'));fs.rmSync(root,{recursive:true,force:true});});
  app=await createApplication({appRoot:root,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},headless:true,transport:provider,
    components:{'runtime.logger':options=>defaultComponents['runtime.logger']({...options,mirrorConsole:false})},
    fetchImpl:async()=>{external++;throw Error('No external traffic');},priceUpdates:{refresh:async()=>({ok:true}),resolve:()=>null},communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})}});
  app.config.update({server:{port:0,token:'synthetic-names248'},api:{model:'inert248'},telemetry:{enabled:false},proactive:{enabled:false},memory:{consolidateEnabled:false}});app.loader.startWatchers=()=>{};
  const base=`http://127.0.0.1:${await app.start()}`;assert.notEqual(app.httpServer.port,15967);assert.deepEqual(app.loader.listEntries(),[]);
  const request=async url=>{const response=await fetch(base+url,{headers:{'x-console-token':'synthetic-names248'}});return{status:response.status,body:await response.json()};};
  return{app,provider,base,dataDir,request,calls:()=>calls,rename:value=>{name=value;}};
}
for(const mode of ['default','wrapped','disabled'])test(`real authenticated session DTOs use selected name controller: ${mode}`,async t=>{
  const f=await application(t,{mode}),a=f.app.sessions.create('group:24801',{trigger:'synthetic first'}),b=f.app.sessions.create('group:24801',{trigger:'synthetic second'}),p=f.app.sessions.create('private:24801',{trigger:'synthetic private'});
  assert.equal((await fetch(f.base+'/api/sessions')).status,401);
  const prefix=mode==='wrapped'?'追加 ':'',list=await f.request('/api/sessions?limit=100');assert.equal(list.status,200);
  assert.equal(list.body.sessions.find(row=>row.id===a.id).chatName,prefix+'合成群248');assert.equal(list.body.sessions.find(row=>row.id===b.id).chatName,prefix+'合成群248');assert.equal(list.body.sessions.find(row=>row.id===p.id).chatName,'');
  const detail=await f.request('/api/sessions/'+a.id);assert.equal(detail.body.chatName,prefix+'合成群248');assert.equal(f.calls(),1);
  assert.equal(f.app.sessions.peek(a.id).chatName,undefined);assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDir,'sessions',a.id+'.json'),'utf8')).chatName,undefined,'presentation names never rewrite session archives');
  f.rename('账号变化后的群名');f.provider.selfId='24898';f.app.bus.emit('transport.status',{});assert.equal((await f.request('/api/sessions/'+a.id)).body.chatName,prefix+'账号变化后的群名');assert.equal(f.calls(),2);
  assert.equal((await f.request('/api/sessions/absent248')).status,404);
});

if(!process.argv.includes('--pure'))test('actual opaque session page renders safe names, follows current source and accepts appended title asset',async()=>{
  let f,appended;
  try{
    f=await modelUiFixture({config:{ui:{refreshMs:60000}}});let name='<img src=x onerror=alert(248)> 合成群248';
    const provider={id:'browser-names248',selfId:'24899',actions:{listGroups:async()=>[{id:'24801',name}],listFriends:async()=>[{id:'24804',nickname:'私聊昵称248'}]}};
    f.kernel.capability.register('transport.provider','kernel',provider);
    const a=f.kernel.sessions.create('group:24801',{trigger:'名称安全248'}),b=f.kernel.sessions.create('group:24802',{trigger:'未知群248'}),privateSession=f.kernel.sessions.create('private:24804',{trigger:'私聊触发248'});
    await f.page.locator('#nav button[data-panel=sessions]').click();await f.frame.locator('#sessions-panel[data-ready=true]').waitFor();await f.frame.locator('#follow').uncheck();
    const row=f.frame.locator(`[data-session="${a.id}"]`);await row.filter({hasText:name}).waitFor();assert.doesNotMatch(await row.innerText(),/group:24801/);assert.equal(await row.locator('.session-cache').count(),1);assert.equal(await row.locator('img,script').count(),0);
    await row.locator('strong').click();await f.frame.locator('#detail h3').filter({hasText:name}).waitFor();assert.equal(await f.frame.locator('#detail h3').innerText(),name);
    assert.equal(await f.frame.locator('#detail img,#detail script').count(),0);assert.doesNotMatch(await f.frame.locator('#chat-filter').innerText(),/group:24801/);assert.equal(await f.frame.locator('#chat-filter option[value="group:24801"]').innerText(),name);
    await f.frame.locator(`[data-session="${b.id}"] strong`).click();await f.frame.locator('#detail[data-session-id="'+b.id+'"] h3').waitFor();assert.equal(await f.frame.locator('#detail h3').innerText(),'群聊');
    await f.frame.locator(`[data-session="${privateSession.id}"] strong`).click();await f.frame.locator('#detail h3').filter({hasText:'私聊昵称248'}).waitFor();assert.equal(await f.frame.locator('#detail h3').innerText(),'私聊昵称248');assert.doesNotMatch(await f.frame.locator('#chat-filter').innerText(),/private:24804/);
    name='更新后的中文群名';provider.selfId='24898';f.kernel.bus.emit('transport.status',{});await f.frame.locator('#reload').click();await row.filter({hasText:name}).waitFor();await row.locator('strong').click();await f.frame.locator('#detail h3').filter({hasText:name}).waitFor();
    assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);await f.close();f=null;
    appended=await modelUiFixture({config:{ui:{refreshMs:60000}},uiAssetPath:'panels/sessions/chat-title.js',uiAsset:`export const formatSessionChat=session=>'追加标题 '+session.chatKey;`});
    const custom=appended.kernel.sessions.create('group:24803',{trigger:'追加名称248'});await appended.page.locator('#nav button[data-panel=sessions]').click();await appended.frame.locator('#chat-filter option').filter({hasText:'追加标题 group:24803'}).waitFor({state:'attached'});await appended.frame.locator(`[data-session="${custom.id}"] strong`).click();await appended.frame.locator('#detail h3').filter({hasText:'追加标题 group:24803'}).waitFor();
    assert.deepEqual(appended.errors,[]);assert.equal(appended.outbound(),0);
  }finally{await appended?.close();await f?.close();}
});

// Real application/loader/service/ingest/console handlers; owned disk only.
// No listener, browser, OS process, DNS, socket or real model is permitted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import dgram from 'node:dgram';
import childProcess from 'node:child_process';
import {EventEmitter} from 'node:events';
import {syncBuiltinESMExports} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createApplication} from '../src/kernel/composition.js';
import {defaultComponents as defaults} from '../bundled/runtime-defaults/components.js';
import {OneBotClient} from '../bundled/transport-onebot/client.js';

const source=path.resolve(import.meta.dirname,'..'),unexpected=[],restores=[];
let actionResponse;
const tick=()=>new Promise(setImmediate);
async function until(check){for(let index=0;index<250;index++){if(check())return;await tick();}assert.equal(check(),true,'owned asynchronous operation completed');}
class InertSocket extends EventEmitter{constructor(url){super();this.url=String(url);this.readyState=0;}close(){this.readyState=3;}terminate(){this.readyState=3;}}
function deny(object,key){const previous=object[key];object[key]=()=>{unexpected.push(key);throw Error('240 forbids '+key);};restores.push(()=>{object[key]=previous;});}
test.before(()=>{
  for(const key of['connect','createConnection'])deny(net,key);
  deny(net.Socket.prototype,'connect');deny(net.Server.prototype,'listen');deny(tls,'connect');deny(dgram,'createSocket');
  for(const object of[http,https])for(const key of['request','get'])deny(object,key);
  for(const name of['lookup','resolve','resolve4','resolve6','resolveAny','resolveCname','resolveNs','resolvePtr','resolveSrv','reverse'])for(const object of[dns,dns.promises])if(typeof object[name]==='function')deny(object,name);
  for(const name of['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(childProcess,name);
  const nativeFetch=globalThis.fetch;globalThis.fetch=(url,options)=>{
    const target=new URL(url);if(target.hostname!=='identity240.invalid'||options?.method!=='POST'||!actionResponse){unexpected.push('fetch');throw Error('240 forbids unowned fetch');}
    return actionResponse(target,options);
  };restores.push(()=>{globalThis.fetch=nativeFetch;});
  const createSocket=OneBotClient.prototype._createSocket;OneBotClient.prototype._createSocket=function(url){return new InertSocket(url);};restores.push(()=>{OneBotClient.prototype._createSocket=createSocket;});syncBuiltinESMExports();
});
test.after(()=>{for(const restore of restores.reverse())restore();syncBuiltinESMExports();assert.deepEqual(unexpected,[]);});
function ownedClock(){
  const previous={setTimeout,clearTimeout,setInterval,clearInterval},tasks=new Map();
  globalThis.setTimeout=(fn,delay=0)=>{const handle={unref(){return this;}};tasks.set(handle,{fn,delay:Number(delay)});return handle;};globalThis.clearTimeout=handle=>tasks.delete(handle);
  globalThis.setInterval=()=>({unref(){return this;}});globalThis.clearInterval=()=>{};
  return{fire(delay){const task=[...tasks].find(([,value])=>value.delay===delay);assert.ok(task,'actual timer '+delay+' is registered');tasks.delete(task[0]);task[1].fn();},restore(){Object.assign(globalThis,previous);}};
}
async function fixture(t,{legacy=false}={}){
  const appRoot=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-identity240-')),dataDir=path.join(appRoot,'data'),clock=ownedClock(),routes=new Map(),events=[],bans=[],calls=[];
  const state={account:'24099'},legacyHandles=[];let app,mid=240000;
  for(const folder of['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,folder),{recursive:true});
  fs.writeFileSync(path.join(appRoot,'package.json'),'{"type":"module"}');
  if(!legacy){const dir=path.join(appRoot,'bundled/transport-onebot');fs.mkdirSync(dir);fs.copyFileSync(path.join(source,'bundled/transport-onebot/plugin.json'),path.join(dir,'plugin.json'));fs.writeFileSync(path.join(dir,'index.js'),`export {default} from ${JSON.stringify(pathToFileURL(path.join(source,'bundled/transport-onebot/index.js')).href)};`);}
  const makeLegacy=context=>{const instance={id:'legacy240',actions:{},start(){context.onStatus({connected:true,selfId:state.account});},stop(){}};legacyHandles.push({instance,...context});return instance;};
  actionResponse=async(url,options)=>{
    const action=url.pathname.split('/').at(-1),params=JSON.parse(options.body);calls.push({action,params});
    let data;if(action==='get_login_info')data={user_id:Number(state.account),nickname:'SYNTHETIC_240'};else if(action==='get_group_member_info')data={user_id:params.user_id,card:'SYNTHETIC_MEMBER_240',shut_up_timestamp:0};else throw Error('unexpected owned action '+action);
    return{ok:true,status:200,json:async()=>({status:'ok',retcode:0,data})};
  };
  t.after(async()=>{try{await app?.stop();assert.equal(app?.httpServer.port,null);}finally{clock.restore();const resolved=path.resolve(appRoot);assert.equal(path.dirname(resolved).toLowerCase(),path.resolve(os.tmpdir()).toLowerCase());assert.ok(path.basename(resolved).startsWith('qqa-identity240-'));fs.rmSync(resolved,{recursive:true,force:true});}});
  app=await createApplication({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(appRoot,'absent-migration')},headless:true,
    ...(legacy?{transportFactory:makeLegacy}:{}),priceUpdates:{refresh:async()=>({ok:true,remote:false}),resolve:()=>null},fetchImpl:async()=>{unexpected.push('SDK fetch');throw Error('240 forbids SDK HTTP');},
    components:{'runtime.logger':options=>defaults['runtime.logger']({...options,mirrorConsole:false}),
      'runtime.http':options=>{const server=defaults['runtime.http'](options),route=server.route,scope=server.createRouteScope;const observe=call=>(method,pattern,handler,settings)=>{routes.set(`${method} ${pattern}`,handler);return call(method,pattern,handler,settings);};server.route=observe(route);server.createRouteScope=options=>{const owned=scope(options);return{...owned,route:observe(owned.route)};};return server;},
      'core.events':async(event,dependencies)=>{const row={type:event.type,selfId:dependencies.selfIdOf(),done:false};events.push(row);await defaults['core.events'](event,dependencies);row.done=true;},
    }});
  const save=patch=>{app.config.update(patch);const persisted=JSON.parse(fs.readFileSync(path.join(dataDir,'config.json'),'utf8'));assert.deepEqual(app.config.get(),persisted);};
  save({api:{model:'inert-identity240'},allow:{groups:['24001']},persona:{botName:'UNMENTIONED_SYNTHETIC_240',selfNickname:''},onebot:{wsUrl:'ws://identity240.invalid',httpUrl:'http://identity240.invalid',accessToken:'SYNTHETIC_240_A',httpAccessToken:'SYNTHETIC_240_HTTP'},telemetry:{enabled:false},proactive:{enabled:false},chatActive:{enabled:false},memory:{consolidateEnabled:false},sticker:{enabled:false},store:{contextSliderPos:10,peakSchedule:{enabled:false}},wakeDelayMs:200});
  app.capability.register('chat.ban-state','kernel',{'note-muted':(...args)=>bans.push(args),'note-unmuted':(...args)=>bans.push(args)});
  await app.loader.loadAll();assert.deepEqual(app.loader.listEntries().map(entry=>entry.id),legacy?[]:['transport-onebot']);for(const entry of app.loader.listEntries())assert.equal(entry.status,'active');await app.services.start();assert.equal(app.httpServer.port,null);
  const status=()=>{const handler=routes.get('GET /api/status');assert.equal(typeof handler,'function','actual registerConsoleRoutes handler is registered');return handler({query:{},body:{},params:{}}).onebot;};
  const current=()=>app.services.get('transport.provider');
  const login=async()=>{const provider=current();assert.equal(provider.id,'onebot');provider.client.ws.emit('open');clock.fire(0);await until(()=>provider.selfId===state.account);return provider;};
  const mention=async(id,expected)=>{
    app.store.markAllRead('group:24001');const result=await app.ingest.ingestMessage({kind:'group',id:'24001',event:{user_id:24011,message_id:++mid,message:[{type:'at',data:{qq:String(id)}},{type:'text',data:{text:' synthetic identity probe'}}]}});
    assert.equal(result.accepted,true);assert.equal(result.entry.atMe,expected);await app.orchestrator.onIncoming(result.chatKey,result.entry);assert.equal(app.orchestrator.status().waiting.length,expected?1:0,'real wake scheduling consumes the current identity');app.orchestrator.pause();app.orchestrator.resume({skipBacklog:true});return result;
  };
  const wireBan=async(provider,uid)=>{const before=events.length;provider.client.ws.emit('message',JSON.stringify({post_type:'notice',notice_type:'group_ban',group_id:24001,user_id:Number(uid),duration:60}));await until(()=>events.length>before&&events.at(-1).done);return events.at(-1);};
  return{app,appRoot,state,save,status,current,login,mention,wireBan,events,bans,calls,legacyHandles};
}

test('actual default login, hot configuration clear, old/new ingress and provider-event identity reach public status',async t=>{
  const f=await fixture(t),provider=await f.login();assert.equal(f.status().selfId,'24099');await f.mention('24099',true);await f.wireBan(provider,'24099');assert.equal(f.bans.length,1);
  f.state.account='24098';f.save({onebot:{accessToken:'SYNTHETIC_240_B'}});assert.equal(provider.selfId,null);assert.equal(f.status().selfId,null,'hot clear cannot publish the cached previous ID');await f.mention('24099',false);
  const count=f.bans.length,row=await f.wireBan(provider,'24099');assert.equal(row.selfId,null);assert.equal(f.bans.length,count,'old account ban does not trigger after clear');
  await f.login();assert.equal(f.status().selfId,'24098');await f.mention('24099',false);await f.mention('24098',true);const fresh=await f.wireBan(provider,'24098');assert.equal(fresh.selfId,'24098');assert.equal(f.bans.length,count+1);
  assert.ok(f.calls.some(call=>call.action==='get_login_info'));
});

test('legacy selected provider without a selfId property retains partial status but clears explicit null/empty',async t=>{
  const f=await fixture(t,{legacy:true}),handle=f.legacyHandles.at(-1);assert.equal('selfId'in handle.instance,false);assert.equal(f.app.transport.selfId,undefined);assert.equal(f.status().selfId,'24099');await f.mention('24099',true);
  handle.onStatus({connected:false,error:'synthetic partial status'});assert.equal(f.status().selfId,'24099');handle.onStatus({connected:true,selfId:undefined});assert.equal(f.status().selfId,'24099');await f.mention('24099',true);
  handle.onStatus({connected:false,selfId:null});assert.equal(f.status().selfId,null);await f.mention('24099',false);
  handle.onStatus({connected:true,selfId:24097});assert.equal(f.status().selfId,'24097');await f.mention('24097',true);handle.onStatus({selfId:''});assert.equal(f.status().selfId,null);await f.mention('24097',false);
});

test('actual service replacement, stale callbacks, disable and fresh default fallback never republish old IDs',async t=>{
  const f=await fixture(t),original=await f.login();let replacementContext;
  const replacement={id:'replacement240',selfId:null,actions:{},start(){replacementContext.onStatus({connected:true,selfId:'24096'});},stop(){}};
  f.app.capability.register('transport.provider','kernel',{create(context){replacementContext=context;return replacement;}},{lifecycle:true});assert.equal(f.status().selfId,null,'replacement invalidates the old selection synchronously');await f.app.services.refresh();
  assert.equal(f.current(),replacement);assert.equal(f.status().connected,true);assert.equal(f.status().selfId,null,'explicit live null wins over a status snapshot containing the old ID');await f.mention('24096',false);await f.mention('24099',false);
  replacement.selfId='24095';replacementContext.onStatus({connected:true});assert.equal(f.status().selfId,'24095');await f.mention('24095',true);
  original.client.onStatus({connected:true,selfId:'24099'});assert.equal(f.status().selfId,'24095','disposed default callbacks cannot repaint selected identity');
  f.app.capability.unregister('transport.provider','kernel');assert.equal(f.status().selfId,null);await f.app.services.refresh();const restored=f.current();assert.notEqual(restored,original);assert.equal(restored.id,'onebot');assert.equal(f.status().selfId,null);replacementContext.onStatus({selfId:'24095',connected:true});assert.equal(f.status().selfId,null);await f.mention('24095',false);
  f.state.account='24094';await f.login();assert.equal(f.status().selfId,'24094');await f.mention('24094',true);
  await f.app.loader.setEnabled('transport-onebot',false);await f.app.services.refresh();assert.equal(f.current(),undefined);assert.equal(f.status().selfId,null);restored.client.onStatus({selfId:'24094',connected:true});assert.equal(f.status().selfId,null);await f.mention('24094',false);
  await f.app.loader.setEnabled('transport-onebot',true);await f.app.services.refresh();assert.equal(f.current().id,'onebot');assert.equal(f.status().selfId,null,'re-enabled default does not adopt its prior login');f.state.account='24093';await f.login();assert.equal(f.status().selfId,'24093');await f.mention('24093',true);
});

// Real default loader -> SDK providers -> runner -> tool bundle -> SendQueue/store.
// Only owned synthetic modules; no listeners, browser, native process or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {createApplication} from '../src/kernel/composition.js';
import {defaultComponents} from '../bundled/runtime-defaults/components.js';

const workspace=path.resolve(import.meta.dirname,'..'),log={info(){},warn(){},error(){}};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(setImmediate);
const native=(name,args={},id=name)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});

test('238 reply phase contracts and provider leases',{timeout:45000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-reply238-')),restores=[],blocked=[];
  const deny=(object,key)=>{const original=object[key];restores.push(()=>object[key]=original);object[key]=()=>{blocked.push(key);throw Error('238 forbids external IO: '+key);};};
  deny(globalThis,'fetch');deny(dns,'lookup');deny(dnsPromises,'lookup');
  for(const object of[http,https])for(const key of['request','get'])deny(object,key);
  deny(net.Socket.prototype,'connect');deny(net.Server.prototype,'listen');deny(tls,'connect');
  for(const key of['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(childProcess,key);
  syncBuiltinESMExports();
  t.after(()=>{for(const restore of restores.reverse())restore();syncBuiltinESMExports();assert.deepEqual(blocked,[]);assert.equal(path.dirname(root).toLowerCase(),path.resolve(os.tmpdir()).toLowerCase());assert.ok(path.basename(root).startsWith('qqa-reply238-'));fs.rmSync(root,{recursive:true,force:true});});

  async function fixture(label,{layer=null}={}){
    const appRoot=path.join(root,label),dataDir=path.join(appRoot,'data');
    for(const dir of['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,dir),{recursive:true});
    fs.writeFileSync(path.join(appRoot,'package.json'),' {"type":"module"}');
    for(const id of['core-tools','compat-04'])fs.cpSync(path.join(workspace,'bundled',id),path.join(appRoot,'bundled',id),{recursive:true});
    // A directory dependency keeps its real identity through the default
    // loader's Windows snapshot junction; root .mjs files may be copied.
    fs.mkdirSync(path.join(appRoot,'qa-control'));
    fs.writeFileSync(path.join(appRoot,'qa-control/control.mjs'),`export const control={inline:{},preflight:{},after:{},events:[]};`);
    const control=(await import(pathToFileURL(path.join(appRoot,'qa-control/control.mjs')).href)).control;
    for(const id of['a238','b238','legacy238']){
      const legacy=id==='legacy238',dir=path.join(appRoot,legacy?'skills':'plugins',id);fs.mkdirSync(dir,{recursive:true});
      fs.writeFileSync(path.join(dir,'skill.json'),JSON.stringify({id,name:id,version:'1.0.0',kind:legacy?'skill':'plugin',apiVersion:1,compat:legacy?'04':undefined,entry:'index.js',enabledByDefault:true}));
      const preamble=`import {control} from '../../qa-control/control.mjs';const invoke=(name,payload)=>{control.events.push({id:${JSON.stringify(id)},name,payload});return control[name][${JSON.stringify(id)}]?.(payload);};`;
      fs.writeFileSync(path.join(dir,'index.js'),preamble+(legacy
        ?`export const providers={'reply.local-policy':p=>invoke('after',p)};`
        :`export default{setup(ctx){ctx.registerCapability('reply.inline-calls',p=>invoke('inline',p));ctx.registerCapability('reply.local-policy',p=>invoke('preflight',p));ctx.registerCapability('reply.after-tool-batch',p=>invoke('after',p));}};`));
    }
    if(layer){const dir=path.join(appRoot,'overrides/20-reply');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'runner.mjs'),`export default previous=>async options=>previous({...options,userPrompt:options.userPrompt+' appended238'});`);fs.writeFileSync(path.join(dir,'composition.json'),JSON.stringify({version:2,id:'reply238-layer',enabled:layer!=='disabled',components:{'core.agentRunner':{module:'./runner.mjs',mode:'wrap'}}}));}
    const physical=[],requests=[],snapshots=[];let queueObserved,physicalHandler,modelHandler=()=>({message:{content:''}});
    const app=await createApplication({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},
      components:{'runtime.logger':options=>defaultComponents['runtime.logger']({...options,mirrorConsole:false}),
        'llm.complete':options=>{requests.push(structuredClone(options.messages));return modelHandler(options);},
        'core.send':options=>{const queue=defaultComponents['core.send'](options),send=queue.sendTextBatch;queue.sendTextBatch=(chat,text,options)=>{const work=send(chat,text,options);queueObserved?.(chat,text);return work;};return queue;}},
      transport:{id:'inert238',start(){},stop(){},actions:{},async send(chatKey,segments){physical.push({chatKey,segments:structuredClone(segments)});await physicalHandler?.(chatKey,segments);return{msgId:physical.length};}},
      priceUpdates:{refresh:async()=>({ok:true}),resolve:()=>null},fetchImpl:globalThis.fetch});
    app.config.update({telemetry:{enabled:false},proactive:{enabled:false},allowAllWhenEmpty:true,send:{dedupeWindowMs:0},api:{model:'synthetic238',apiKey:'HOST_SECRET238',maxRounds:3}});
    await app.loader.loadAll();await app.services.start();
    assert.deepEqual(app.loader.listEntries().map(entry=>entry.id).sort(),['a238','b238','compat-04','core-tools','legacy238']);assert.ok(app.loader.listEntries().every(entry=>entry.status==='active'));assert.equal(app.httpServer.port,null);
    const pin=(name,id)=>app.config.update({extensions:{providers:{...app.config.get().extensions?.providers,[name]:id}}});
    let serial=0;
    const run=async({llm,signal=new AbortController().signal,chatKey='group:238'+(++serial),triggerEntries=[],hooksOf,maxRounds=3,onRound}={})=>{
      const session=app.sessions.create(chatKey);session.apiKey='SESSION_SECRET238';
      const bundle=app.components['core.tools.bundle']({c:app.config.get()},{registry:app.registry,loader:app.loader});let count=0;
      const result=await app.components['core.agentRunner']({session,triggerEntries,systemPrompt:'synthetic',userPrompt:'fixture238',tools:bundle.tools,
        cfg:{...app.config.get(),api:{...app.config.get().api,maxRounds}},execContext:{chatKey,session,senderId:'238',signal},capabilities:app.capability,components:app.components,lifecycle:app.lifecycle,
        signal,log,hooksOf,invokeTool:bundle.invoke,callLLM:async options=>{requests.push(structuredClone(options.messages));count++;return llm?.(count,session)??{message:{content:''},finishReason:'stop'};},
        onRound:state=>{snapshots.push(state);app.sessions.update(session,{messages:state.messages,sent:state.sent,usage:state.usage});onRound?.(state);}});
      return{session,result,count};
    };
    return{app,control,physical,requests,snapshots,pin,run,setQueue:fn=>queueObserved=fn,setPhysical:fn=>physicalHandler=fn,setModel:fn=>modelHandler=fn,close:()=>app.stop()};
  }

  await t.test('modern preflight runs once per round; an early end makes zero model requests',async()=>{
    const e=await fixture('preflight');try{
      e.control.preflight.a238=payload=>({shouldEnd:true,reason:'modern-preflight'});
      const first=await e.run();assert.equal(first.count,0);assert.equal(first.result.finishReason,'modern-preflight');
      assert.deepEqual(e.control.events.map(row=>[row.name,row.payload.phase]),[['preflight','preflight']]);
      e.control.events.length=0;e.control.preflight.a238=()=>null;
      const second=await e.run({llm:n=>({message:n===1?{content:null,tool_calls:[native('send_message',{messages:'正常发送'})]}:{content:''},finishReason:'stop'})});
      assert.equal(second.count,2);assert.equal(e.control.events.filter(row=>row.name==='preflight').length,2);
      assert.equal(e.control.events.filter(row=>row.name==='after').length,1);assert.equal(e.physical.length,1);
    }finally{await e.close();}
  });

  await t.test('legacy declared policy maps only to delivery phase with real receipt, bounded triggers and redacted API',async()=>{
    const e=await fixture('legacy');try{
      e.pin('reply.after-tool-batch','legacy238');assert.equal(e.app.capability.providers('reply.local-policy').some(row=>row.ownerId==='legacy238'),false);
      e.control.after.legacy238=p=>({shouldEnd:p.batch.newSent.length===1,reason:'delivered238'});
      const trigger={id:9,mid:'trigger238',senderId:'238',senderName:'合成',text:'给我结果',media:[{type:'image',url:'not-exposed'}],kernel:{secret:'not-exposed'}};
      const out=await e.run({triggerEntries:[trigger],llm:()=>({message:{content:null,tool_calls:[native('send_message',{messages:'真实交付'})]},_usedApi:{baseUrl:'https://synthetic.invalid/v1',provider:'used238',model:'used238',apiKey:'USED_SECRET238'}})});
      assert.equal(out.count,1);assert.equal(out.result.finishReason,'delivered238');assert.equal(e.physical.length,1);assert.equal(out.session.sent.length,1);
      const policy=e.control.events.find(row=>row.id==='legacy238').payload;
      assert.deepEqual(policy.api,{baseUrl:'https://synthetic.invalid/v1',provider:'used238',model:'used238'});
      assert.equal(policy.phase,'after-tool-batch');assert.equal(policy.entries[0].text,trigger.text);assert.deepEqual(policy.entries[0].media,[{type:'image'}]);
      assert.deepEqual(Object.keys(policy.batch).sort(),['allSent','calls','newSent','results','searched']);assert.equal(policy.batch.newSent[0].text,'真实交付');assert.equal(policy.batch.results[0].isError,false);assert.equal(policy.batch.results[0].name,'send_message');assert.equal(policy.batch.searched,false);
      assert.equal(policy.batch.calls[0].function.name,'send_message');assert.equal(policy.batch.newSent[0].msgId,out.session.sent[0].msgId);
      assert.equal(e.app.store.recent(out.session.chatKey,10).filter(row=>row.self)[0].text,'真实交付');
      assert.equal(JSON.stringify(policy).includes('SECRET238'),false);policy.entries[0].text='extension-edit';assert.equal(trigger.text,'给我结果');
    }finally{await e.close();}
  });

  await t.test('default ingest and orchestrator pass actual trigger entries to the selected legacy delivery provider',async()=>{
    const e=await fixture('orchestrator');try{
      e.app.config.update({sticker:{enabled:false},memory:{consolidateEnabled:false},chatActive:{enabled:false},sessionRetryAttempts:0,store:{contextSliderPos:100,promptAnchor:{enabled:false}}});
      e.pin('reply.after-tool-batch','legacy238');e.app.config.load();
      assert.equal(JSON.parse(fs.readFileSync(path.join(e.app.dataDir,'config.json'),'utf8')).extensions.providers['reply.after-tool-batch'],'legacy238');
      e.control.after.legacy238=p=>({shouldEnd:p.batch.newSent.length===1,reason:'actual-trigger-delivered238'});
      e.setModel(()=>({message:{tool_calls:[native('send_message',{messages:'默认编排器真实发送238'})]}}));
      const accepted=await e.app.ingest.ingestMessage({kind:'private',id:'23801',event:{user_id:23801,message_id:23801,time:Math.floor(Date.now()/1000),sender:{nickname:'合成触发人'},raw_message:'真实触发原文238'}});
      assert.equal(accepted.accepted,true);await e.app.orchestrator.wake(accepted.chatKey);
      const event=e.control.events.find(row=>row.id==='legacy238'&&row.name==='after');assert.ok(event);assert.equal(event.payload.entries.length,1);
      assert.equal(event.payload.entries[0].id,accepted.entry.id);assert.equal(event.payload.entries[0].text,'真实触发原文238');assert.equal(e.requests.length,1);
      const archived=e.app.sessions.get(event.payload.session.id);assert.equal(archived.status,'done');assert.equal(archived.sent.length,1);assert.equal(archived.finishReason,'actual-trigger-delivered238');
      assert.equal(e.app.store.recent(accepted.chatKey,10).filter(row=>row.self)[0].text,'默认编排器真实发送238');
    }finally{await e.close();}
  });

  await t.test('failed and vetoed tools are exact batch errors; searched records an attempt and no stale receipts',async()=>{
    const e=await fixture('errors');try{
      const batches=[];e.control.after.a238=p=>{batches.push(p);return null;};
      const out=await e.run({maxRounds:3,hooksOf:name=>name==='before-tool'?[{ownerId:'synthetic',fn:({toolName})=>toolName==='web_search'?{block:true,reason:'owned veto238'}:null}]:[],
        llm:n=>({message:n===1?{tool_calls:[native('web_search',{query:'synthetic'})]}:n===2?{tool_calls:[native('send_message',{})]}:{content:''},finishReason:'stop'})});
      assert.equal(out.count,3);assert.equal(batches.length,2);assert.equal(batches[0].batch.searched,true);assert.equal(batches[1].batch.searched,true);
      assert.match(batches[0].batch.results[0].content,/owned veto238/);assert.equal(batches[0].batch.results[0].isError,true);assert.equal(batches[1].batch.results[0].isError,true);
      assert.deepEqual(batches.map(row=>row.batch.newSent),[[],[]]);assert.equal(e.physical.length,0);
    }finally{await e.close();}
  });

  await t.test('finish skips batch policy; provider exception and no provider preserve normal looping and silent prose',async()=>{
    const e=await fixture('terminal');try{
      e.control.after.a238=()=>{throw Error('expected policy failure238');};
      const finish=await e.run({llm:()=>({message:{tool_calls:[native('finish',{reason:'done238'})]}})});assert.equal(finish.count,1);assert.equal(e.control.events.filter(row=>row.name==='after').length,0);
      const fallback=await e.run({llm:n=>({message:n===1?{tool_calls:[native('send_message',{messages:'一次'})]}:{content:'保留未发送正文'}})});
      assert.equal(fallback.count,2);assert.equal(e.physical.length,1);assert.equal(fallback.result.messages.at(-1).content,'保留未发送正文');
      for(const id of['a238','b238','legacy238'])await e.app.loader.setEnabled(id,false);
      const none=await e.run({llm:()=>({message:{content:'没有provider不自动发送'}})});assert.equal(none.count,1);assert.equal(e.physical.length,1);
    }finally{await e.close();}
  });

  await t.test('inline reselects each response; array veto and legacy merge keep ordinary tool pairing',async()=>{
    const e=await fixture('reselect');try{
      e.control.inline.a238=()=>[{name:'send_message',args:{messages:'来自A'}}];e.control.inline.b238=()=>[{name:'send_message',args:{messages:'来自B'}}];
      const out=await e.run({maxRounds:2,llm:n=>{if(n===2)e.pin('reply.inline-calls','b238');return{message:{content:'opaque proposal'}};}});
      assert.deepEqual(e.physical.map(row=>row.segments[0].text),['来自A','来自B']);assert.deepEqual(e.control.events.filter(row=>row.name==='inline').map(row=>row.id),['a238','b238']);
      for(const message of out.result.messages.filter(row=>row.role==='tool'))assert.ok(out.result.messages.some(row=>row.role==='assistant'&&row.tool_calls?.some(call=>call.id===message.tool_call_id)));
      e.control.inline.b238=()=>[];const veto=await e.run({llm:()=>({message:{content:'<tool_call><function=send_message><parameter=messages>不能发</parameter></function></tool_call>'}})});assert.equal(veto.count,1);assert.equal(e.physical.length,2);
      e.control.inline.b238=()=>({calls:[{name:'send_message',args:{messages:'合并发送'}}]});
      await e.run({maxRounds:1,llm:()=>({message:{content:'<tool_call>{"name":"send_message","args":{"messages":"合并发送"}}</tool_call>'}})});assert.equal(e.physical.length,3,'semantic duplicate is invoked once');
    }finally{await e.close();}
  });

  for(const mode of['replace','disable','registration-ABA','pin-ABA','caller-abort'])await t.test(`held inline provider: ${mode}`,async()=>{
    const e=await fixture('held-inline-'+mode),gate=deferred(),entered=deferred(),controller=new AbortController();try{
      e.control.inline.a238=()=>{entered.resolve();return gate.promise;};
      const work=e.run({signal:controller.signal,llm:()=>({message:{content:'plain original'}})});await entered.promise;
      if(mode==='replace')e.pin('reply.inline-calls','b238');
      else if(mode==='disable')await e.app.loader.setEnabled('a238',false);
      else if(mode==='registration-ABA'){const row=e.app.capability.providers('reply.inline-calls')[0];e.app.capability.register('reply.inline-calls',row.ownerId,()=>[]);e.app.capability.register('reply.inline-calls',row.ownerId,row.provider);}
      else if(mode==='pin-ABA'){e.pin('reply.inline-calls','b238');e.pin('reply.inline-calls','a238');}
      else controller.abort(Error('held caller238'));
      const out=await work;gate.resolve([{name:'send_message',args:{messages:'过时发送'}}]);await tick();
      assert.equal(e.physical.length,0);assert.equal(out.session.sent.length,0);if(mode==='caller-abort')assert.match(out.result.error.message,/held caller238/);
      assert.equal(e.control.events.filter(row=>row.name==='inline'&&row.id==='b238').length,0,'a stale proposal is discarded without retrying another provider');
    }finally{gate.resolve([]);await e.close();}
  });

  for(const mode of['replace','disable','registration-ABA','pin-ABA','caller-abort'])await t.test(`inline lease stays live inside actual SendQueue: ${mode}`,async()=>{
    const e=await fixture('queued-'+mode),occupied=deferred(),gate=deferred(),queued=deferred(),controller=new AbortController();try{
      const chatKey='group:queued238-'+mode;e.setPhysical(async(key,segments)=>{if(key===chatKey&&segments[0].text==='队列占位') {occupied.resolve();await gate.promise;}});
      e.setQueue((key,text)=>{if(key===chatKey&&Array.isArray(text)&&text.includes('过时队列238'))queued.resolve();});
      e.control.inline.a238=()=>[{name:'send_message',args:{messages:['过时队列238']}}];
      const blocker=e.app.sessions.create(chatKey),bundle=e.app.components['core.tools.bundle']({c:e.app.config.get()},{registry:e.app.registry,loader:e.app.loader});
      const blocking=bundle.invoke('send_message',{messages:'队列占位'},{chatKey,session:blocker,signal:new AbortController().signal});await occupied.promise;
      const work=e.run({chatKey,signal:controller.signal,maxRounds:1,llm:()=>({message:{content:'inline source238'}})});await queued.promise;
      if(mode==='replace')e.pin('reply.inline-calls','b238');
      else if(mode==='disable')await e.app.loader.setEnabled('a238',false);
      else if(mode==='registration-ABA'){const row=e.app.capability.providers('reply.inline-calls')[0];e.app.capability.register('reply.inline-calls',row.ownerId,row.provider);}
      else if(mode==='pin-ABA'){e.pin('reply.inline-calls','b238');e.pin('reply.inline-calls','a238');}
      else controller.abort(Error('queued caller238'));
      gate.resolve();await blocking;const out=await work;
      assert.deepEqual(e.physical.map(row=>row.segments[0].text),['队列占位']);assert.deepEqual(out.session.sent,[]);assert.equal(e.app.store.recent(chatKey,10).filter(row=>row.self).length,1);
    }finally{gate.resolve();await e.close();}
  });

  for(const mode of['replace','disable','registration-ABA','pin-ABA','caller-abort'])await t.test(`held after-batch decision cannot end using stale delivery policy: ${mode}`,async()=>{
    const e=await fixture('held-batch-'+mode),gate=deferred(),entered=deferred(),controller=new AbortController();try{
      e.control.after.a238=()=>{entered.resolve();return gate.promise;};
      const work=e.run({signal:controller.signal,llm:n=>({message:n===1?{tool_calls:[native('send_message',{messages:'已交付保留'})]}:{content:''}})});await entered.promise;
      if(mode==='replace')e.pin('reply.after-tool-batch','b238');
      else if(mode==='disable')await e.app.loader.setEnabled('a238',false);
      else if(mode==='registration-ABA'){const row=e.app.capability.providers('reply.after-tool-batch')[0];e.app.capability.register('reply.after-tool-batch',row.ownerId,row.provider);}
      else if(mode==='pin-ABA'){e.pin('reply.after-tool-batch','b238');e.pin('reply.after-tool-batch','a238');}
      else controller.abort(Error('policy caller238'));
      gate.resolve({shouldEnd:true,reason:'STALE_END238'});const out=await work;
      assert.notEqual(out.result.finishReason,'STALE_END238');assert.equal(out.session.sent.length,1);assert.equal(e.physical.length,1);assert.equal(out.count,mode==='caller-abort'?1:2);
    }finally{gate.resolve(null);await e.close();}
  });

  await t.test('unrelated saved config changes keep a held current provider valid',async()=>{
    const e=await fixture('unrelated-config'),gate=deferred(),entered=deferred();try{
      e.control.inline.a238=()=>{entered.resolve();return gate.promise;};
      const work=e.run({maxRounds:1,llm:()=>({message:{content:'current body'}})});await entered.promise;
      e.app.config.update({ui:{refreshMs:23000}});gate.resolve([{name:'send_message',args:{messages:'仍然有效'}}]);
      const out=await work;assert.equal(out.result.error,null);assert.deepEqual(e.physical.map(row=>row.segments[0].text),['仍然有效']);
    }finally{gate.resolve([]);await e.close();}
  });

  await t.test('batch receipts are per batch while allSent and searched remain cumulative, including partial delivery',async()=>{
    const e=await fixture('partial-batches'),batches=[];try{
      e.control.after.a238=p=>{batches.push(p);return null;};
      e.setPhysical((_chat,segments)=>{if(segments[0].text==='物理失败238')throw Error('owned physical failure238');});
      const out=await e.run({maxRounds:3,llm:n=>({message:n===1?{tool_calls:[native('send_message',{messages:['首条238','物理失败238']})]}:n===2?{tool_calls:[native('send_message',{messages:'次批238'})]}:{content:''}})});
      assert.equal(out.count,3);assert.equal(batches.length,2);assert.equal(batches[0].batch.results[0].isError,true);assert.match(batches[0].batch.results[0].content,/owned physical failure238/);
      assert.deepEqual(batches[0].batch.newSent.map(row=>row.text),['首条238']);assert.deepEqual(batches[1].batch.newSent.map(row=>row.text),['次批238']);
      assert.deepEqual(batches[1].batch.allSent.map(row=>row.text),['首条238','次批238']);assert.equal(batches[1].batch.searched,false);
      assert.deepEqual(out.session.sent.map(row=>row.text),['首条238','次批238']);assert.deepEqual(e.app.store.recent(out.session.chatKey,10).filter(row=>row.self).map(row=>row.text),['首条238','次批238']);
    }finally{await e.close();}
  });

  await t.test('inline timeout settles without late calls; a modern preflight lease cannot accept a stale end',async()=>{
    const e=await fixture('timeouts'),gate=deferred();try{
      e.app.config.update({api:{timeoutMs:15}});e.control.inline.a238=()=>gate.promise;
      const out=await e.run({maxRounds:1,llm:()=>({message:{content:'unparsed prose'}})});assert.equal(out.count,1);assert.equal(e.physical.length,0);gate.reject(Error('late inline rejection238'));await tick();
      const held=deferred(),entered=deferred();e.control.preflight.a238=()=>{entered.resolve();return held.promise;};
      const work=e.run();await entered.promise;e.pin('reply.local-policy','b238');const result=await work;held.resolve({shouldEnd:true,reason:'STALE_PREFLIGHT238'});await tick();
      assert.equal(result.count,1);assert.notEqual(result.result.finishReason,'STALE_PREFLIGHT238');assert.equal(e.physical.length,0);
    }finally{gate.resolve(null);await e.close();}
  });

  await t.test('provider disable and restoration select a fresh live SDK registration',async()=>{
    const e=await fixture('provider-restore');try{
      e.control.inline.a238=()=>[{name:'send_message',args:{messages:'主提供者238'}}];e.control.inline.b238=()=>[{name:'send_message',args:{messages:'备选提供者238'}}];
      const original=e.app.capability.providers('reply.inline-calls')[0].provider;
      await e.run({maxRounds:1,llm:()=>({message:{content:'proposal'}})});
      await e.app.loader.setEnabled('a238',false);await e.run({maxRounds:1,llm:()=>({message:{content:'proposal'}})});
      await e.app.loader.setEnabled('a238',true);e.pin('reply.inline-calls','a238');
      assert.notEqual(e.app.capability.providers('reply.inline-calls')[0].provider,original);
      await e.run({maxRounds:1,llm:()=>({message:{content:'proposal'}})});
      assert.deepEqual(e.physical.map(row=>row.segments[0].text),['主提供者238','备选提供者238','主提供者238']);
      e.pin('reply.after-tool-batch','legacy238');e.control.after.legacy238=()=>({shouldEnd:true,reason:'legacy-live238'});
      const restored=await e.run({llm:()=>({message:{tool_calls:[native('send_message',{messages:'批后恢复238'})]}})});assert.equal(restored.count,1);assert.equal(restored.result.finishReason,'legacy-live238');
      await e.app.loader.setEnabled('legacy238',false);e.control.inline.a238=()=>null;
      const disabled=await e.run({llm:n=>({message:n===1?{tool_calls:[native('send_message',{messages:'无批后提前结束238'})]}:{content:''}})});assert.equal(disabled.count,2);
      await e.app.loader.setEnabled('legacy238',true);
      const again=await e.run({llm:()=>({message:{tool_calls:[native('send_message',{messages:'重新启用批后238'})]}})});assert.equal(again.count,1);assert.equal(again.result.finishReason,'legacy-live238');
    }finally{await e.close();}
  });

  await t.test('reply leases release change subscriptions after normal, empty and rejected outcomes',async()=>{
    const e=await fixture('lease-cleanup');const original=e.app.capability.onChange;let active=0;
    e.app.capability.onChange=fn=>{active++;const off=original(fn);let released=false;return()=>{if(released)return;released=true;active--;off();};};
    try{
      for(const value of[[],null,[{name:'send_message',args:{messages:'清理238'}}]]){
        e.control.inline.a238=()=>value;await e.run({maxRounds:1,llm:()=>({message:{content:'unparsed body'}})});assert.equal(active,0);
      }
      e.control.inline.a238=()=>{throw Error('expected inline failure238');};await e.run({maxRounds:1,llm:()=>({message:{content:'still silent'}})});assert.equal(active,0);
    }finally{e.app.capability.onChange=original;await e.close();}
  });

  for(const layer of['appended','disabled'])await t.test(`whole default runner supports appended wrapper and disabled restoration: ${layer}`,async()=>{
    const e=await fixture('layer-'+layer,{layer});try{
      e.control.inline.a238=()=>[{name:'send_message',args:{messages:'追加合同'}}];e.control.after.a238=()=>({shouldEnd:true});
      const out=await e.run({llm:()=>({message:{content:'explicit inline'}})});assert.equal(out.count,1);assert.equal(e.physical.length,1);
      assert.equal(e.requests[0][1].content,layer==='appended'?'fixture238 appended238':'fixture238');assert.equal(e.app.store.recent(out.session.chatKey,10).filter(row=>row.self).length,1);
    }finally{await e.close();}
  });
});

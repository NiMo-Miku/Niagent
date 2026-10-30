// Actual reply consumers, selected boot components and SDK/tool/send/archive.
// No HTTP listeners, installed roots, external model, browser or native process.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {runAgent} from '../src/kernel/agent-runner.js';
import {createCapabilityRegistry} from '../src/kernel/capability.js';
import {createApplication} from '../src/kernel/composition.js';
import {defaultComponents} from '../bundled/runtime-defaults/components.js';

const log={info(){},warn(){},error(){}},workspace=path.resolve(import.meta.dirname,'..');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const registry=()=>createCapabilityRegistry({log});
async function run(capabilities,{text='原句 A，原句 B。',signal,hooksOf,cfg,session,components,response:customResponse}={}){
  const invocations=[],requests=[];
  const result=await runAgent({session:session??{id:'230',chatKey:'group:230',sent:[],triggerText:'触发原文'},tools:[],
    cfg:{api:{maxRounds:1,...cfg}},systemPrompt:'synthetic',userPrompt:'synthetic',capabilities,components,log,signal,hooksOf,
    callLLM:async options=>{requests.push(structuredClone(options.messages));return customResponse??{message:{content:text},finishReason:'stop'};},
    invokeTool:async(name,args)=>{invocations.push({name,args});return{ok:true,sent:[{type:'text',text:args.messages?.join('')??''}]};},
  });return{result,invocations,requests};
}

test('230 optional reply contracts and normal tool path',{timeout:45000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-reply230-')),restores=[],blocked=[];
  const deny=(object,key)=>{const original=object[key];restores.push(()=>object[key]=original);object[key]=()=>{blocked.push(key);throw Error('230 forbids external IO: '+key);};};
  deny(globalThis,'fetch');deny(dns,'lookup');deny(dnsPromises,'lookup');
  for(const object of[http,https])for(const key of['request','get'])deny(object,key);
  for(const key of['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(childProcess,key);
  syncBuiltinESMExports();
  t.after(()=>{for(const restore of restores.reverse())restore();syncBuiltinESMExports();assert.deepEqual(blocked,[]);assert.equal(path.dirname(path.resolve(root)).toLowerCase(),path.resolve(os.tmpdir()).toLowerCase());assert.ok(path.basename(root).startsWith('qqa-reply230-'));fs.rmSync(root,{recursive:true,force:true});});

  await t.test('plain body remains unsent without an opted-in provider',async()=>{
    const e=await run(registry());assert.deepEqual(e.invocations,[]);assert.equal(e.result.messages.at(-1).content,'原句 A，原句 B。');
  });
  await t.test('loose extraction reaches the normal tool response sequence and never invents text',async()=>{
    const caps=registry();caps.register('reply.loose-send','loose',()=>({messages:['原句 A','编造内容','原句 A']}));
    const e=await run(caps);assert.deepEqual(e.invocations,[{name:'send_message',args:{messages:['原句 A']}}]);
    const assistant=e.result.messages.find(message=>message.role==='assistant'),tool=e.result.messages.find(message=>message.role==='tool');
    assert.equal(assistant.content,null);assert.equal(assistant.rescued,true);assert.equal(assistant.tool_calls[0].id,tool.tool_call_id);assert.equal(tool.toolCall.ok,true);
  });
  await t.test('planning veto and planning failure stay silent; acknowledged text is not repeated',async()=>{
    for(const mode of['veto','error']){const caps=registry();let loose=0;caps.register('reply.is-planning-text','plan',()=>{if(mode==='error')throw Error('cannot judge');return{planning:true};});caps.register('reply.loose-send','loose',()=>{loose++;return{messages:['原句 A']};});assert.deepEqual((await run(caps)).invocations,[]);assert.equal(loose,0);}
    const caps=registry();caps.register('reply.loose-send','loose',()=>({messages:['原句 A','原句 B']}));
    const e=await run(caps,{session:{id:'sent230',chatKey:'group:230',sent:[{type:'text',text:'原句 A'}]}});assert.deepEqual(e.invocations[0].args,{messages:['原句 B']});
  });
  await t.test('judge fallback gets the actual used model reference without a credential',async()=>{
    const caps=registry(),payloads=[];caps.register('reply.loose-send','loose',()=>({messages:[]}));
    caps.register('reply.salvage-lines','lines',payload=>{payloads.push(payload);throw Error('synthetic judge error');});
    caps.register('reply.salvage','judge',payload=>{payloads.push(payload);return{say:true,messages:['原句 B']};});
    const e=await run(caps,{response:{message:{content:'原句 A，原句 B。'},_usedApi:{model:'used-model',provider:'used-provider',baseUrl:'https://synthetic.invalid/v1',apiKey:'DO_NOT_LEND230'}}});
    assert.equal(e.invocations[0].args.messages[0],'原句 B');assert.equal(payloads.length,2);assert.equal(payloads[0].trigger,'触发原文');assert.deepEqual(payloads[1].api,{baseUrl:'https://synthetic.invalid/v1',model:'used-model',provider:'used-provider'});assert.equal(JSON.stringify(payloads).includes('DO_NOT_LEND230'),false);
  });
  await t.test('grounded provider resets once, remembers and selects original current-body phrases',async()=>{
    const caps=registry(),events=[];caps.register('reply.loose-send','loose',()=>({messages:['原句 A','原句 B']}));
    caps.register('reply.grounded-select','ground',payload=>{if(payload.reset)events.push('reset');if(payload.remember)events.push('remember');if(payload.proposed){events.push('select');return{enabled:true,picked:['原句 B','并非原句']};}});
    const e=await run(caps);assert.deepEqual(events,['reset','remember','select']);assert.deepEqual(e.invocations[0].args.messages,['原句 B']);
  });
  await t.test('grounded trace rewriting cannot manufacture a source for an automatic reply',async()=>{
    const caps=registry();caps.register('reply.loose-send','loose',()=>({messages:['伪造的新正文']}));
    caps.register('reply.grounded-select','ground',payload=>payload.response?{content:'伪造的新正文'}:null);
    const e=await run(caps);assert.deepEqual(e.invocations,[]);assert.equal(e.result.messages.at(-1).content,'伪造的新正文','the earlier trace-only transformation remains supported');
  });
  await t.test('caller cancellation settles a held provider without a send or late rejection',async()=>{
    const caps=registry(),gate=deferred(),entered=deferred(),controller=new AbortController();caps.register('reply.loose-send','held',()=>{entered.resolve();return gate.promise;});
    const work=run(caps,{signal:controller.signal});await entered.promise;controller.abort(new Error('230 canceled'));const e=await work;
    assert.deepEqual(e.invocations,[]);assert.match(e.result.error.message,/230 canceled/);gate.reject(Error('late rejection230'));await new Promise(setImmediate);
  });
  await t.test('replace, unregister and same-object re-registration invalidate an in-flight result',async()=>{
    for(const mode of['replace','remove','same-object']){const caps=registry(),gate=deferred(),entered=deferred(),provider=()=>{entered.resolve();return gate.promise;};caps.register('reply.loose-send','held',provider);
      const work=run(caps);await entered.promise;if(mode==='remove')caps.unregisterOwner('held');else caps.register('reply.loose-send','held',mode==='same-object'?provider:()=>({messages:['原句 B']}));
      const e=await work;assert.deepEqual(e.invocations,[]);gate.resolve({messages:['原句 A']});await new Promise(setImmediate);
    }
  });
  await t.test('a bounded provider timeout cannot later deliver its proposal',async()=>{
    const caps=registry(),gate=deferred();caps.register('reply.loose-send','slow',()=>gate.promise);
    const e=await run(caps,{cfg:{timeoutMs:15}});assert.deepEqual(e.invocations,[]);gate.resolve({messages:['原句 A']});await new Promise(setImmediate);
  });
  await t.test('a provider change at the real before-tool boundary prevents the send',async()=>{
    const caps=registry();caps.register('reply.loose-send','chosen',()=>({messages:['原句 A']}));
    const e=await run(caps,{hooksOf:name=>name==='before-tool'?[{ownerId:'change',fn:()=>{caps.register('reply.loose-send','chosen',()=>({messages:['原句 B']}));}}]:[]});
    assert.deepEqual(e.invocations,[]);assert.equal(e.result.messages.find(message=>message.role==='tool').toolCall.ok,false);
  });
  await t.test('proposal leases retain cancellation until disposal and release listeners',async()=>{
    const caps=registry(),original=caps.onChange;let listeners=0;
    caps.onChange=listener=>{listeners++;const off=original(listener);return()=>{listeners--;off();};};
    caps.register('reply.loose-send','lease',()=>({messages:['原句 A']}));
    const controller=new AbortController();
    const lease=await defaultComponents['core.reply.rescue']({text:'原句 A',capabilities:caps,signal:controller.signal,log});
    assert.equal(lease.valid(),true);assert.equal(listeners,1);assert.equal(lease.signal.aborted,false);
    controller.abort(Error('after decision'));assert.equal(lease.signal.aborted,true);assert.equal(lease.valid(),false);
    lease.dispose();lease.dispose();assert.equal(listeners,0);
    const rejected=await defaultComponents['core.reply.rescue']({text:'原句 A',capabilities:caps,sent:[{index:0,text:'原句 A',msgId:null,at:1}],log});
    assert.deepEqual(rejected.calls,[]);assert.equal(listeners,0,'empty proposals release their own listeners');
  });
  await t.test('legacy object calls merge with the selected parser, deduplicate and retain args',async()=>{
    const caps=registry();caps.register('reply.inline-calls','legacy',()=>({calls:[{name:'first',args:{x:'one'}},{name:'second',args:{x:'two'}}]}));
    const e=await run(caps,{text:'<tool_call><function=first><parameter=x>one</parameter></function></tool_call>'});
    assert.deepEqual(e.invocations,[{name:'first',args:{x:'one'}},{name:'second',args:{x:'two'}}]);
    const modern=registry();modern.register('reply.inline-calls','modern',()=>[]);assert.deepEqual((await run(modern,{text:'<tool_call><function=first></function></tool_call>'})).invocations,[],'an explicit modern empty array retains its existing parser-veto contract');
  });

  for(const mode of['default','appended','disabled'])await t.test(`actual loader/SDK, normal tool/SendQueue/archive and added rescue component: ${mode}`,async()=>{
    const appRoot=path.join(root,mode),dataDir=path.join(appRoot,'data'),layer=path.join(appRoot,'overrides/20-rescue'),plugin=path.join(appRoot,'plugins/reply230');
    fs.mkdirSync(layer,{recursive:true});for(const directory of['bundled','skills'])fs.mkdirSync(path.join(appRoot,directory),{recursive:true});fs.mkdirSync(plugin,{recursive:true});
    fs.writeFileSync(path.join(appRoot,'package.json'),'{"type":"module"}');fs.cpSync(path.join(workspace,'bundled/core-tools'),path.join(appRoot,'bundled/core-tools'),{recursive:true});
    fs.writeFileSync(path.join(plugin,'skill.json'),JSON.stringify({id:'reply230',name:'Synthetic Reply230',version:'1.0.0',kind:'plugin',apiVersion:1,entry:'index.js',enabledByDefault:true}));
    fs.writeFileSync(path.join(plugin,'index.js'),`export default{setup(ctx){ctx.registerCapability('reply.loose-send',()=>({messages:['原句 A']}));}};`);
    fs.writeFileSync(path.join(layer,'rescue.mjs'),`export default async({text})=>({calls:[{name:'send_message',arguments:JSON.stringify({messages:[text.includes('原句 B')?'原句 B':'invalid']})}],valid:()=>true});`);
    if(mode!=='default')fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify({version:1,id:'reply230-layer',enabled:mode!=='disabled',components:{'core.reply.rescue':'./rescue.mjs'}}));
    const physical=[],requests=[];let app;
    try{
      app=await createApplication({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},
        components:{'runtime.logger':options=>defaultComponents['runtime.logger']({...options,mirrorConsole:false})},
        transport:{id:'inert230',start(){},stop(){},actions:{},send:async(chatKey,segments)=>{physical.push({chatKey,segments:structuredClone(segments)});return{msgId:physical.length};}},
        priceUpdates:{refresh:async()=>({ok:true}),resolve:()=>null},fetchImpl:globalThis.fetch});
      app.config.update({telemetry:{enabled:false},proactive:{enabled:false},allowAllWhenEmpty:true,send:{dedupeWindowMs:0},api:{model:'synthetic230',maxRounds:2}});
      await app.loader.loadAll();await app.services.start();assert.deepEqual(app.loader.listEntries().map(entry=>entry.id).sort(),['core-tools','reply230']);assert.equal(app.httpServer.port,null);
      assert.equal(app.composition.owners['core.reply.rescue'],mode==='appended'?'reply230-layer':'defaults');
      const session=app.sessions.create('group:230'),controller=new AbortController(),context={chatKey:session.chatKey,session,senderId:'230',signal:controller.signal};
      const bundle=app.components['core.tools.bundle']({c:app.config.get()},{registry:app.registry,loader:app.loader});let llmCalls=0;
      const result=await app.components['core.agentRunner']({session,systemPrompt:'synthetic',userPrompt:'synthetic',tools:bundle.tools,cfg:app.config.get(),execContext:context,
        capabilities:app.capability,components:app.components,signal:controller.signal,log,
        callLLM:async options=>{requests.push(structuredClone(options.messages));return{message:{content:++llmCalls===1?'原句 A，原句 B。':''},finishReason:'stop'};},
        invokeTool:bundle.invoke});
      assert.equal(result.error,null);assert.equal(physical.length,1);assert.equal(physical[0].segments[0].text,mode==='appended'?'原句 B':'原句 A');
      assert.equal(app.store.recent(session.chatKey,10).filter(item=>item.self).at(-1).text,physical[0].segments[0].text);
      assert.equal(requests.length,2);const assistant=requests[1].find(message=>message.role==='assistant'),tool=requests[1].find(message=>message.role==='tool');assert.equal(assistant.tool_calls[0].id,tool.tool_call_id);assert.equal(assistant.content,null);assert.equal(Object.hasOwn(assistant,'rescued'),false,'trace metadata does not leak into the next model request');
    }finally{await app?.stop();}
  });

  await t.test('actual SDK queue cancels stale proposals and actual receipts prevent repeats beyond queue dedupe',async t=>{
    const appRoot=path.join(root,'queued'),dataDir=path.join(appRoot,'data'),plugin=path.join(appRoot,'plugins/reply230');
    fs.mkdirSync(plugin,{recursive:true});for(const directory of['bundled','skills'])fs.mkdirSync(path.join(appRoot,directory));
    fs.writeFileSync(path.join(appRoot,'package.json'),'{"type":"module"}');fs.cpSync(path.join(workspace,'bundled/core-tools'),path.join(appRoot,'bundled/core-tools'),{recursive:true});
    fs.writeFileSync(path.join(plugin,'skill.json'),JSON.stringify({id:'reply230',name:'Synthetic Reply230',version:'1.0.0',kind:'plugin',apiVersion:1,entry:'index.js',enabledByDefault:true}));
    fs.writeFileSync(path.join(plugin,'index.js'),`export default{setup(ctx){ctx.registerCapability('reply.loose-send',({text})=>({messages:[text]}));}};`);
    const physical=[];let app,occupied,queued,gate,clockRestore;
    try{
      app=await createApplication({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},
        components:{'runtime.logger':options=>defaultComponents['runtime.logger']({...options,mirrorConsole:false}),
          'core.send':options=>{const queue=defaultComponents['core.send'](options),send=queue.sendTextBatch;queue.sendTextBatch=(chat,text,options)=>{
            const work=send(chat,text,options);if(Array.isArray(text)&&text.includes('待发送旧回复'))queued?.resolve();return work;
          };return queue;}},
        transport:{id:'inert-queue230',start(){},stop(){},actions:{},async send(chatKey,segments){physical.push({chatKey,segments:structuredClone(segments)});
          if(segments[0]?.text==='队列占位'){occupied.resolve();await gate.promise;}return{msgId:physical.length};}},
        priceUpdates:{refresh:async()=>({ok:true}),resolve:()=>null},fetchImpl:globalThis.fetch});
      app.config.update({telemetry:{enabled:false},proactive:{enabled:false},allowAllWhenEmpty:true,api:{model:'synthetic230',maxRounds:2}});
      await app.loader.loadAll();await app.services.start();assert.deepEqual(app.loader.listEntries().map(entry=>entry.id).sort(),['core-tools','reply230']);assert.equal(app.httpServer.port,null);
      const bundle=()=>app.components['core.tools.bundle']({c:app.config.get()},{registry:app.registry,loader:app.loader});
      const invoke=(session,controller,callLLM,maxRounds=1)=>{const tools=bundle();return app.components['core.agentRunner']({session,systemPrompt:'synthetic',userPrompt:'synthetic',tools:tools.tools,
        cfg:{...app.config.get(),api:{...app.config.get().api,maxRounds}},execContext:{chatKey:session.chatKey,session,senderId:'230',signal:controller.signal},
        capabilities:app.capability,components:app.components,signal:controller.signal,log,callLLM,invokeTool:tools.invoke});};
      for(const mode of['disable','same-provider-version','caller-abort'])await t.test(mode,async()=>{
        const chatKey='group:queue230-'+mode,controller=new AbortController();occupied=deferred();queued=deferred();gate=deferred();
        const blocker=app.sessions.create(chatKey),work=bundle().invoke('send_message',{messages:'队列占位'},{chatKey,session:blocker,signal:new AbortController().signal});
        await occupied.promise;const session=app.sessions.create(chatKey),proposal=invoke(session,controller,async()=>({message:{content:'待发送旧回复'},finishReason:'stop'}));
        await queued.promise;assert.deepEqual(physical.filter(row=>row.chatKey===chatKey).map(row=>row.segments[0].text),['队列占位']);
        if(mode==='disable')await app.loader.setEnabled('reply230',false);
        else if(mode==='same-provider-version'){const row=app.capability.providers('reply.loose-send')[0];app.capability.register('reply.loose-send',row.ownerId,row.provider);}
        else controller.abort(Error('queued caller canceled'));
        gate.resolve();await work;const result=await proposal;await new Promise(setImmediate);
        assert.deepEqual(physical.filter(row=>row.chatKey===chatKey).map(row=>row.segments[0].text),['队列占位']);
        assert.deepEqual(session.sent,[]);assert.equal(app.store.recent(chatKey,10).filter(row=>row.self).length,1);
        if(mode==='caller-abort')assert.match(result.error.message,/queued caller canceled/);
        if(mode==='disable')await app.loader.setEnabled('reply230',true);
      });
      await t.test('real untyped receipts after a slow second model response',async()=>{
        const nativeNow=Date.now;let now=nativeNow();Date.now=()=>now;clockRestore=()=>{Date.now=nativeNow;};
        try{
          const session=app.sessions.create('group:duplicate230');let rounds=0;
          const result=await invoke(session,new AbortController(),async()=>{
            if(++rounds===1)return{message:{content:null,tool_calls:[{id:'native230',type:'function',function:{name:'send_message',arguments:JSON.stringify({messages:['已确认原句']})}}]},finishReason:'tool_calls'};
            now+=app.config.get().send.dedupeWindowMs+1;return{message:{content:'已确认原句'},finishReason:'stop'};
          },2);
          assert.equal(result.error,null);assert.deepEqual(physical.filter(row=>row.chatKey===session.chatKey).map(row=>row.segments[0].text),['已确认原句']);
          assert.equal(session.sent.length,1);assert.equal(Object.hasOwn(session.sent[0],'type'),false);assert.equal(app.store.recent(session.chatKey,10).filter(row=>row.self).length,1);
        }finally{clockRestore();clockRestore=null;}
      });
    }finally{gate?.resolve();clockRestore?.();await app?.stop();}
  });
});

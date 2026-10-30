// Typed old formats through the actual selected parser/runner/tool/SDK/queue.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import dns from 'node:dns';import dnsPromises from 'node:dns/promises';import http from 'node:http';import https from 'node:https';import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
import {parseInlineToolCalls} from '../src/kernel/agent-runner.js';
import {createApplication} from '../src/kernel/composition.js';import {defaultComponents as defaults} from '../bundled/runtime-defaults/components.js';
const workspace=path.resolve(import.meta.dirname,'..'),log={info(){},warn(){},error(){}};
test('232 old inline shapes retain typed values and current formats',{timeout:30000},async t=>{
  const examples=[
    ['wrapped-json','<tool_call>{"name":"echo","arguments":{"items":["a","b"],"enabled":false}}</tool_call>',{items:['a','b'],enabled:false}],
    ['xml-types',`<tool_call><function='echo'><parameter="items">["a","b"]</parameter><parameter=enabled>false</parameter><parameter=n>0</parameter><parameter=text>QA_LOCAL_SYNTHETIC</parameter></function></tool_call>`,{items:['a','b'],enabled:false,n:0,text:'QA_LOCAL_SYNTHETIC'}],
    ['xml-embedded-object','<tool_call><function=echo><parameter=obj>{"name":"do_not_call","x":1}</parameter></function></tool_call>',{obj:{name:'do_not_call',x:1}}],
    ['wrapped-line','<tool_call>echo\n{"text":"one"}</tool_call>',{text:'one'}],
    ['fenced-json','```json\n{"name":"echo","arguments":{"text":"two"}}\n```',{text:'two'}],
    ['bare-line','echo\n{"text":"three"}',{text:'three'}],
    ['nested-function','<tool_call>{"function":{"name":"echo","arguments":"{\\"text\\":\\"four\\"}"}}</tool_call>',{text:'four'}],
    ['leading-zero-literal','<tool_call><function=echo><parameter=code>0012</parameter></function></tool_call>',{code:'0012'}],
  ];
  for(const[name,text,args]of examples)await t.test(name,()=>{const calls=parseInlineToolCalls(text);assert.equal(calls.length,1);assert.equal(calls[0].name,'echo');assert.deepEqual(JSON.parse(calls[0].arguments),args);});
  for(const alias of ['parameters','args','input'])await t.test('legacy argument alias '+alias,()=>assert.deepEqual(JSON.parse(parseInlineToolCalls(`<tool_call>{"tool":"echo","${alias}":{"ok":true}}</tool_call>`)[0].arguments),{ok:true}));
  for(const text of ['ordinary prose','<tool_call>echo\nnot JSON</tool_call>','<tool_call>{"name":"echo","arguments":[]}</tool_call>','```json\n{"name":"echo","arguments":"bad"}\n```'])await t.test('unrecognized/invalid '+text,()=>assert.deepEqual(parseInlineToolCalls(text),[]));

  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-inline232-')),restores=[],blocked=[];
  const deny=(target,key)=>{const original=target[key];restores.push(()=>target[key]=original);target[key]=()=>{blocked.push(key);throw Error('232 forbids external IO '+key);};};
  deny(globalThis,'fetch');deny(dns,'lookup');deny(dnsPromises,'lookup');for(const object of[http,https])for(const key of['request','get'])deny(object,key);for(const key of['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(childProcess,key);syncBuiltinESMExports();
  try{
    for(const mode of ['default','appended','disabled'])await t.test('actual parser/tool/SDK/queue/archive '+mode,async()=>{
      const appRoot=path.join(root,mode),dataDir=path.join(appRoot,'data'),layer=path.join(appRoot,'overrides/typed-parser');fs.mkdirSync(layer,{recursive:true});for(const name of['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,name));
      fs.writeFileSync(path.join(appRoot,'package.json'),'{"type":"module"}');fs.cpSync(path.join(workspace,'bundled/core-tools'),path.join(appRoot,'bundled/core-tools'),{recursive:true});
      fs.writeFileSync(path.join(layer,'parser.mjs'),`export default text=>text==='selected parser input'?[{name:'send_message',arguments:JSON.stringify({messages:['APPENDED232']})}]:[];`);
      if(mode!=='default')fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify({version:1,id:'parser232',enabled:mode==='appended',components:{'core.tools.parseInline':'./parser.mjs'}}));
      const physical=[],requests=[];let app;
      try{
        app=await createApplication({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},
          components:{'runtime.logger':options=>defaults['runtime.logger']({...options,mirrorConsole:false})},
          transport:{id:'inert232',start(){},stop(){},actions:{},async send(chatKey,segments){physical.push({chatKey,segments:structuredClone(segments)});return{msgId:232};}},priceUpdates:{resolve:()=>null,refresh:async()=>({ok:true})},fetchImpl:globalThis.fetch});
        app.config.update({telemetry:{enabled:false},proactive:{enabled:false},api:{model:'synthetic232',maxRounds:2}});await app.loader.loadAll();await app.services.start();assert.deepEqual(app.loader.listEntries().map(row=>row.id),['core-tools']);assert.equal(app.httpServer.port,null);
        const session=app.sessions.create('group:232'),signal=new AbortController().signal,tools=app.components['core.tools.bundle']({c:app.config.get()},{registry:app.registry,loader:app.loader});let rounds=0;
        const result=await app.components['core.agentRunner']({session,systemPrompt:'owned',userPrompt:'owned',tools:tools.tools,cfg:app.config.get(),components:app.components,capabilities:app.capability,signal,log,
          execContext:{chatKey:session.chatKey,session,signal},invokeTool:tools.invoke,callLLM:async options=>{requests.push(structuredClone(options.messages));return{message:{content:++rounds===1?(mode==='appended'?'selected parser input':'<tool_call>{"name":"send_message","arguments":{"messages":["TYPED232","SECOND232"]}}</tool_call>'):''},finishReason:'stop'};}});
        const expected=mode==='appended'?['APPENDED232']:['TYPED232','SECOND232'];assert.equal(result.error,null);assert.deepEqual(physical.map(row=>row.segments[0].text),expected);assert.deepEqual(session.sent.map(row=>row.text),expected);
        assert.deepEqual(app.store.recent(session.chatKey,10).filter(row=>row.self).map(row=>row.text).sort(),[...expected].sort());assert.equal(requests.length,2);const assistant=requests[1].find(row=>row.role==='assistant'),tool=requests[1].find(row=>row.role==='tool');assert.equal(assistant.tool_calls[0].id,tool.tool_call_id);assert.equal(app.composition.owners['core.tools.parseInline'],mode==='appended'?'parser232':'defaults');
      }finally{await app?.stop();}
    });
  }finally{for(const restore of restores.reverse())restore();syncBuiltinESMExports();assert.deepEqual(blocked,[]);assert.equal(path.dirname(path.resolve(root)).toLowerCase(),path.resolve(os.tmpdir()).toLowerCase());assert.ok(path.basename(root).startsWith('qqa-inline232-'));fs.rmSync(root,{recursive:true,force:true});}
});

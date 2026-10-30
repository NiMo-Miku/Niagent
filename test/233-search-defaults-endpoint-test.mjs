// Actual default service, guarded host diagnostic and SDK/tool consumers; all
// responses and DNS answers are synthetic. No listener or browser is started.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import dns from 'node:dns';import dnsPromises from 'node:dns/promises';import http from 'node:http';import https from 'node:https';import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
import {createWebSearch as bundledSearch} from '../bundled/web-tools/service.js';
import {createWebSearch as hostSearch} from '../src/kernel/web-search.js';
import {SEARCH_PROVIDER_DEFAULTS} from '../bundled/web-tools/search-policy.js';
import {createSearchProviderAdapter} from '../src/console/search-provider-adapter.js';
import {createApplication} from '../src/kernel/composition.js';
import {defaultComponents as defaults} from '../bundled/runtime-defaults/components.js';

const root=path.resolve(import.meta.dirname,'..'),quiet={info(){},warn(){},error(){},debug(){}};
const blocked=[],restores=[];
test.before(()=>{const deny=(object,key)=>{const old=object[key];restores.push(()=>object[key]=old);object[key]=()=>{blocked.push(key);throw Error('233 forbids native IO '+key);};};
  deny(globalThis,'fetch');deny(dns,'lookup');deny(dnsPromises,'lookup');for(const object of[http,https])for(const key of['request','get'])deny(object,key);
  for(const key of['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(childProcess,key);syncBuiltinESMExports();});
test.after(()=>{for(const restore of restores.reverse())restore();syncBuiltinESMExports();assert.deepEqual(blocked,[]);});
const rows=Array.from({length:12},(_,i)=>({title:'synthetic '+i,url:'https://result233.invalid/'+i,snippet:'owned'}));
function payload(provider){return provider==='deepseek'?{output:[{content:[{text:'owned search result'}]}]}
  :provider==='zhipu'?{search_result:rows}:provider==='bocha'?{code:200,data:{webPages:{value:rows}}}
  :provider==='baidu'?{references:rows}:provider==='metaso'?{webpages:rows}:{results:rows};}
const dnsLookup=async()=>[{address:'8.8.8.8',family:4}];
function service(kind,cfg){const calls=[];let responseProvider=cfg().webSearch.provider;
  const fetchImpl=async(url,init)=>{calls.push({url:String(url),body:init.body?JSON.parse(init.body):null,headers:new Headers(init.headers),signal:init.signal});return new Response(JSON.stringify(payload(responseProvider)));};
  const search=kind==='bundled'?bundledSearch({cfg,http:{fetch:fetchImpl}}):hostSearch({cfg,fetchImpl,dnsLookup});
  return{...search,calls,respondAs:provider=>responseProvider=provider};}

for(const kind of ['bundled','host']){
  test(`233 ${kind} null search configuration retains zero-configuration Bing`,async()=>{
    const cfg=()=>({webSearch:null}),calls=[];
    const fetchImpl=async(url)=>{calls.push(String(url));return new Response('<li class="b_algo"><h2><a href="https://result233.invalid/">owned</a></h2><p>owned</p></li>');};
    const search=kind==='bundled'?bundledSearch({cfg,http:{fetch:fetchImpl}}):hostSearch({cfg,fetchImpl,dnsLookup});
    assert.equal((await search.search('null config')).results.length,1);assert.equal(calls.length,1);assert.equal(new URL(calls[0]).hostname,'cn.bing.com');
  });
  for(const provider of Object.keys(SEARCH_PROVIDER_DEFAULTS))test(`233 ${kind} ${provider} works with selection/key only and restores bounded defaults`,async()=>{
    const config={webSearch:{provider,maxResults:6,[provider]:{apiKey:'owned233',baseUrl:'',count:0,timeoutMs:0,model:''}}};
    const search=service(kind,()=>config),result=await search.search('owned query');
    assert.equal(search.calls.length,1);assert.equal(search.calls[0].url,SEARCH_PROVIDER_DEFAULTS[provider].baseUrl);
    assert.equal(result.results.length,provider==='deepseek'?1:6);assert.equal(search.calls[0].headers.has('authorization'),true);
    if(provider==='deepseek')assert.equal(search.calls[0].body.model,'deepseek-v4-pro');
    if(provider==='metaso')assert.deepEqual(search.calls[0].body,{q:'owned query',size:6,scope:'webpage'});
  });
  for(const provider of Object.keys(SEARCH_PROVIDER_DEFAULTS))test(`233 ${kind} ${provider} retains exact gateway path/query and explicit model`,async()=>{
    const endpoint='https://gateway233.invalid/team/'+provider+'?tenant=owned%2F233';
    const config={webSearch:{provider,maxResults:3,[provider]:{baseUrl:endpoint,apiKey:'owned233',count:10,model:'explicit-gateway-model'}}};
    const search=service(kind,()=>config),result=await search.search('owned gateway');
    assert.equal(search.calls[0].url,endpoint);assert.equal(result.results.length,provider==='deepseek'?1:3);
    if(provider==='deepseek')assert.equal(search.calls[0].body.model,'explicit-gateway-model');
    if(provider==='bocha')assert.equal(search.calls[0].body.count,10,'request breadth does not replace the output cap');
  });
  test(`233 ${kind} root URL convenience, legacy Metaso, single-slot custom and numeric limits`,async()=>{
    const config={webSearch:{provider:'bocha',maxResults:4,bocha:{baseUrl:'https://gateway233.invalid/?tenant=233',apiKey:'owned233',count:10}}};
    const search=service(kind,()=>config);await search.search('root');assert.equal(search.calls[0].url,'https://gateway233.invalid/v1/web-search?tenant=233');
    config.webSearch={provider:'metaso',maxResults:3,metaso:{baseUrl:'https://metaso.cn/api/open/v1/search',apiKey:'owned233',count:12}};search.respondAs('custom');
    assert.equal((await search.search('legacy')).results.length,3);assert.deepEqual(search.calls.at(-1).body,{query:'legacy',top_k:10});
    config.webSearch={provider:'custom',maxResults:5,custom:{baseUrl:'https://gateway233.invalid/exact?key=owned',apiKey:'owned233',count:2,model:'legacy-model'}};
    assert.equal((await search.search('single')).results.length,2);assert.equal(search.calls.at(-1).url,config.webSearch.custom.baseUrl);
    assert.deepEqual(search.calls.at(-1).body,{query:'single',count:2,model:'legacy-model',q:'single',top_k:2,messages:[{role:'user',content:'single'}]});
    config.webSearch={provider:'custom:x',providers:[{id:'x',baseUrl:'https://gateway233.invalid/v1?tenant=233',apiKey:'owned233',count:10}]};
    assert.equal((await search.search('decimal',{maxResults:2.9})).results.length,2);assert.equal(search.calls.at(-1).url,'https://gateway233.invalid/v1/search?tenant=233');
  });
  test(`233 ${kind} official unsupported model fails honestly while explicit gateway models remain usable`,async()=>{
    const config={webSearch:{provider:'deepseek',deepseek:{apiKey:'owned233',model:'deepseek-flash'}}};const search=service(kind,()=>config);
    await assert.rejects(search.search('unsupported'),/不支持/);assert.equal(search.calls.length,0);
    config.webSearch.deepseek.baseUrl='https://gateway233.invalid/responses';assert.equal((await search.search('gateway')).results.length,1);assert.equal(search.calls[0].body.model,'deepseek-flash');
  });
}

test('233 custom and Bing diagnostics never inherit the media private-host exception',async()=>{
  for(const type of ['openai','bing']){
    let calls=0;
    const adapter=createSearchProviderAdapter({cfg:()=>({security:{allowPrivateImageHosts:true},webSearch:{provider:'custom:private233',providers:[{id:'private233',type,baseUrl:'https://private233.invalid/search',apiKey:'owned233'}]}}),
      dnsLookup:async()=>[{address:'127.0.0.1',family:4}],fetchImpl:async()=>{calls++;return new Response(JSON.stringify({results:rows}));}});
    const result=await adapter.test('private233');assert.equal(result.ok,false);assert.match(result.note,/内网/);assert.equal(calls,0);
  }
});

test('233 host webpage fetch keeps injected IO, cancellation and private-address boundary',async()=>{
  let calls=0;const controller=new AbortController();
  const search=hostSearch({cfg:()=>({security:{allowPrivateImageHosts:true}}),dnsLookup,fetchImpl:async()=>{calls++;return new Response('<p>owned</p>');}});
  assert.equal((await search.fetchPage('https://page233.invalid/')).content,'owned');assert.equal(calls,1);
  await assert.rejects(search.fetchPage('http://127.0.0.1/private'),/私网|内网|地址/);assert.equal(calls,1);
  controller.abort();await assert.rejects(search.fetchPage('https://page233.invalid/',{signal:controller.signal}),/abort|中止|取消/i);assert.equal(calls,1);
});

test('233 actual application default/config override/plugin selection/tool and diagnostic share policy',{timeout:30000},async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-search233-'));let app;
  t.after(async()=>{await app?.stop();assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('qqa-search233-'));fs.rmSync(directory,{recursive:true,force:true});});
  for(const name of ['bundled','plugins','skills'])fs.mkdirSync(path.join(directory,name));fs.writeFileSync(path.join(directory,'package.json'),'{"type":"module"}');
  fs.cpSync(path.join(root,'bundled/web-tools'),path.join(directory,'bundled/web-tools'),{recursive:true});
  const layer=path.join(directory,'overrides/search233');fs.mkdirSync(layer,{recursive:true});
  fs.writeFileSync(path.join(layer,'defaults.mjs'),`export default previous=>options=>{const cfg=previous(options);cfg.webSearch.bocha.baseUrl='https://configured233.invalid/exact?tenant=233';return cfg;};`);
  fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify({version:2,id:'search233',components:{'runtime.config.defaults':{module:'defaults.mjs',mode:'wrap'}}}));
  const plugin=path.join(directory,'skills/replacement233');fs.mkdirSync(plugin,{recursive:true});
  fs.writeFileSync(path.join(plugin,'skill.json'),JSON.stringify({id:'replacement233',kind:'skill',apiVersion:1,entry:'index.js',enabledByDefault:false,capabilities:['web.search']}));
  fs.writeFileSync(path.join(plugin,'index.js'),'export default {setup(ctx){ctx.registerCapability("web.search",{search:async()=>({results:[{title:"selected233",url:"https://selected233.invalid/"}]})});}};');
  let provider='bocha';const calls=[],routes=new Map();
  const fetchImpl=async(url,init)=>{calls.push({url:String(url),body:JSON.parse(init.body)});return new Response(JSON.stringify(payload(provider)));};
  app=await createApplication({appRoot:directory,env:{QQ_AGENT_DATA_DIR:path.join(directory,'data'),QQ_AGENT_MIGRATE_FROM:path.join(directory,'absent')},
    fetchImpl,priceUpdates:{resolve:()=>null,refresh:async()=>({ok:true})},transport:{id:'inert233',start(){},stop(){},actions:{}},
    components:{'runtime.logger':options=>defaults['runtime.logger']({...options,mirrorConsole:false}),
      'runtime.fetch':(url,options)=>defaults['runtime.fetch'](url,{...options,dnsLookup}),
      'runtime.http':options=>{const server=defaults['runtime.http'](options),scope=server.createRouteScope;server.createRouteScope=options=>{const s=scope(options),route=s.route;return{...s,route(method,pattern,handler,...rest){routes.set(method+' '+pattern,handler);return route(method,pattern,handler,...rest);}};};return server;},
      'console.routes':(http,deps)=>defaults['console.routes'](http,{...deps,dnsLookup,fetchImpl})}});
  assert.equal(app.config.get().webSearch.bocha.baseUrl,'https://configured233.invalid/exact?tenant=233');assert.equal(app.composition.owners['runtime.config.defaults'],'search233');
  app.config.update({telemetry:{enabled:false},proactive:{enabled:false},api:{model:'offline233',maxRounds:2}});
  await app.loader.loadAll();await app.services.start();assert.equal(app.httpServer.port,null);
  const invoke=async()=>{const bundle=app.components['core.tools.bundle']({c:app.config.get()},{registry:app.registry,loader:app.loader});const session=app.sessions.create('group:233');let round=0;
    const result=await app.components['core.agentRunner']({session,systemPrompt:'synthetic',userPrompt:'query233',tools:bundle.tools,cfg:app.config.get(),components:app.components,capabilities:app.capability,invokeTool:bundle.invoke,execContext:{chatKey:session.chatKey,session},log:quiet,
      callLLM:async()=>({message:{content:'',...(round++===0?{tool_calls:[{id:'search233',type:'function',function:{name:'web_search',arguments:'{"query":"owned233"}'}}]}:{})}})});
    const receipt=result.messages.find(message=>message.role==='tool');assert.ok(receipt);assert.equal(receipt.toolCall.ok,true);return JSON.parse(receipt.content);};
  for(provider of Object.keys(SEARCH_PROVIDER_DEFAULTS)){
    app.config.update({webSearch:{provider,[provider]:{apiKey:'owned233'}}});const before=calls.length,result=await invoke();
    assert.equal(calls.length,before+1);assert.equal(result.results.length,provider==='deepseek'?1:6);
    const expected=provider==='bocha'?'https://configured233.invalid/exact?tenant=233':SEARCH_PROVIDER_DEFAULTS[provider].baseUrl;assert.equal(calls.at(-1).url,expected);
    const diagnostic=routes.get('POST /api/search-providers/test');assert.ok(diagnostic);const reply=await diagnostic({body:{},query:{},params:{}});assert.equal(reply.result.ok,true,JSON.stringify(reply));assert.equal(calls.at(-1).url,expected);
  }
  const before=calls.length;await app.loader.setEnabled('replacement233',true);assert.equal((await invoke()).results[0].title,'selected233');assert.equal(calls.length,before);
  await app.loader.setEnabled('replacement233',false);assert.equal((await invoke()).results.length,6);assert.equal(calls.length,before+1);
});

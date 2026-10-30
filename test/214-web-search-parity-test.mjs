import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultComponents as defaults } from '../bundled/runtime-defaults/components.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { createWebSearch as createKernelSearch } from '../src/kernel/web-search.js';

function environment(t, { retainedOutput = null } = {}) {
  if (retainedOutput) fs.mkdirSync(retainedOutput, { recursive: true });
  const root=fs.mkdtempSync(path.join(retainedOutput??os.tmpdir(),'qqa-search214-')),appRoot=path.join(root,'app'),dataDir=path.join(root,'data');
  for(const dir of ['bundled','skills','plugins'])fs.mkdirSync(path.join(appRoot,dir),{recursive:true});
  fs.writeFileSync(path.join(appRoot,'package.json'),'{"type":"module"}');
  const webSource=path.resolve(import.meta.dirname,'../bundled/web-tools');
  const webDir=path.join(appRoot,'bundled/web-tools');fs.mkdirSync(webDir,{recursive:true});
  fs.copyFileSync(path.join(webSource,'skill.json'),path.join(webDir,'skill.json'));
  fs.writeFileSync(path.join(webDir,'index.js'),`export {default} from ${JSON.stringify(pathToFileURL(path.join(webSource,'index.js')).href)};`);
  const logs=[],requests=[],hostRequests=[],runs=[],routeResults=[];
  const log=Object.fromEntries(['info','warn','error','debug'].map(level=>[level,(...args)=>logs.push({level,args})]));log.child=()=>log;log.recent=()=>[];
  const bus=defaults['runtime.bus']({log}),capabilities=defaults['runtime.capability']({log});
  const permissions=defaults['runtime.permissions']({dataDir,log,bus,headless:true});
  const registry=defaults['runtime.tools']({log,bus,permissions,capabilities}),scheduler=defaults['runtime.scheduler']({log}),storage=defaults['runtime.storage']({dataDir,log});
  let config=defaults['runtime.config']({dataDir,defaults:defaults['runtime.config.defaults'](),log});config.load();
  config.update({api:{model:'offline-fixture',maxRounds:2},webSearch:{enabled:true},proactive:{enabled:false}});
  let loader,services,mode='success',waiting,enter;
  const modes={};
  const transport=async(url,init)=>{
    const body=init.body?JSON.parse(init.body):null;
    requests.push({url:String(url),method:init.method,body,authorizationPresent:!!new Headers(init.headers).get('authorization'),signal: {aborted:init.signal.aborted}});
    if(enter){enter();enter=null;}
    if(modes[mode])return modes[mode](url,init,body);
    if(mode==='slow')return new Promise((resolve,reject)=>{const abort=()=>reject(init.signal.reason);if(init.signal.aborted)abort();else init.signal.addEventListener('abort',abort,{once:true});});
    if(mode==='model-required'&&body?.model!=='search-special')return new Response('fixture missing model',{status:400});
    if(mode==='bocha-error')return new Response(JSON.stringify({code:403,message:'fixture quota exhausted',data:null}));
    if(mode==='bocha-nested-error')return new Response(JSON.stringify({code:200,data:{code:429,msg:'fixture nested quota'}}));
    if(mode==='bocha-empty')return new Response(JSON.stringify({code:200,data:{webPages:{value:[]}}}));
    if(mode==='bocha-success')return new Response(JSON.stringify({code:200,data:{webPages:{value:[{name:'Bocha result',url:'https://result.fixture/',snippet:'bocha snippet'}]}}}));
    if(mode==='http-error')return new Response('fixture service unavailable',{status:503});
    if(mode==='invalid-json')return new Response('fixture not json');
    if(mode==='redirect-blocked')return new Response(null,{status:302,headers:{location:'https://blocked.fixture/search'}});
    return new Response(JSON.stringify({results:[{title:'Fixture result',url:'https://result.fixture/',snippet:'fixture snippet'}]}));
  };
  const dnsLookup=async(host)=>[{address:host==='private.fixture'?'127.0.0.1':'8.8.8.8',family:4}];
  const routeMap=new Map();
  function bindRoutes(){
    routeMap.clear();registerConsoleRoutes({route(method,url,handler){routeMap.set(method+' '+url,handler);},broadcast(){}},{config,loader,registry,capability:capabilities,permissions,log,bus,dataDir,appRoot,
      sessions:{listSummaries:()=>[]},store:{},memory:{},orchestrator:{},priceUpdates:{resolve:()=>null},fetchImpl:transport,dnsLookup});
  }
  bindRoutes();
  async function route(method,url,body={}){const handler=routeMap.get(method+' '+url);if(!handler)throw new Error('Missing real route '+method+' '+url);const result=await handler({body,params:{},res:{writeHead(){},end(){}}});routeResults.push({method,url,result});return result;}
  async function boot(){
    config=defaults['runtime.config']({dataDir,defaults:defaults['runtime.config.defaults'](),log});config.load();
    services=defaults['runtime.services']({capability:capabilities,config,bus,log});
    const facet=defaults['runtime.serviceFacade'](()=>services.get('web.search'),['search','fetchPage','lockState']);
    const sdk=defaults['runtime.sdk']({config,permissions,bus,loaderOf:()=>loader,resolveProvider:name=>services.get(name),facets:{'web.search':facet}});
    loader=defaults['runtime.plugins']({appRoot,config,log,bus,registry,capabilityRegistry:capabilities,permissions,scheduler,storage,
      sdkHost:{...sdk,fetch:async(url,opts)=>{
        hostRequests.push({url,timeoutMs:opts.timeoutMs,browseLocked:opts.browseLocked,allowedHosts:opts.allowedHosts,allowPrivate:opts.allowPrivate,signal:opts.signal});
        const response=await defaults['runtime.fetch'](url,{...opts,fetchImpl:transport,dnsLookup});
        const result=new Response(response.body,{status:response.status,headers:response.headers});Object.defineProperty(result,'url',{value:response.finalUrl});return result;
      }}});
    await loader.loadAll();bindRoutes();
  }
  async function run(query='fixture query'){
    const bundle=defaults['core.tools.bundle']({c:config.get()},{registry,loader});
    const session={id:'search214-'+runs.length,chatKey:'group:fixture',sent:[],usage:{calls:0,promptTokens:0,completionTokens:0,totalTokens:0}};
    const llmRequests=[],invocations=[];let round=0;
    const result=await defaults['core.agentRunner']({session,systemPrompt:'Offline search parity',userPrompt:'fixture trigger',tools:bundle.tools,
      execContext:{chatKey:session.chatKey,session,signal:new AbortController().signal},cfg:config.get(),log,capabilities,hooksOf:name=>loader.hooksOf(name),
      invokeTool:async(name,args,ctx)=>{const returned=await bundle.invoke(name,args,ctx);invocations.push({name,args,returned});return returned;},
      callLLM:async args=>{llmRequests.push({messages:structuredClone(args.messages),tools:structuredClone(args.tools)});const usage={prompt_tokens:1,completion_tokens:1,total_tokens:2};return {message:{role:'assistant',content:'',...(round++===0?{tool_calls:[{id:'search214',type:'function',function:{name:'web_search',arguments:JSON.stringify({query})}}]}:{})},usage,raw:{usage}};}});
    const record={result,llmRequests,invocations};runs.push(record);return record;
  }
  function plugin(id,source,manifest={}){const dir=path.join(appRoot,'skills',id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'skill.json'),JSON.stringify({id,...manifest}));fs.writeFileSync(path.join(dir,'index.js'),source);return dir;}
  async function cleanup(){loader?.stopAll();scheduler.stop();permissions.close();await services?.stop();
    fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify({requests,hostRequests:hostRequests.map(({signal,...rest})=>({...rest,aborted:signal?.aborted})),runs,routeResults,logs},null,2));
    if(!retainedOutput){const absolute=path.resolve(root);if(!absolute.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(absolute).startsWith('qqa-search214-'))throw new Error('Unsafe fixture cleanup');fs.rmSync(absolute,{recursive:true,force:true});}}
  t.after(cleanup);
  return {root,route,boot,run,plugin,requests,hostRequests,runs,modes,transport,dnsLookup,get config(){return config;},get loader(){return loader;},capabilities,registry,
    set mode(value){mode=value;},get mode(){return mode;},waitForTransport(){waiting=new Promise(resolve=>{enter=resolve;});return waiting;}};
}
const toolResult=run=>run.result.messages.find(message=>message.toolCall?.name==='web_search');

const retainedOutput=process.argv[2]?path.resolve(process.argv[2]):null;
test('214 public saved custom search accepts an empty optional key through diagnostic and registered runner',async t=>{
 const e=environment(t,{retainedOutput});
 const saved=await e.route('POST','/api/search-providers',{name:'Public fixture',type:'openai',baseUrl:'https://search.fixture/search',apiKey:'',count:2,timeoutMs:5000});
 e.config.update({webSearch:{provider:'custom:'+saved.provider.id}});await e.boot();
 const diagnostic=await e.route('POST','/api/search-providers/test',{});assert.equal(diagnostic.result.ok,true);
 const run=await e.run('public search');assert.equal(toolResult(run).toolCall.ok,true);assert.equal(JSON.parse(toolResult(run).content).results[0].title,'Fixture result');
 assert.equal(e.requests.length,2);assert.ok(e.requests.every(request=>!request.authorizationPresent));
});
async function savedCustom(e,extra={}){
 const saved=await e.route('POST','/api/search-providers',{type:'openai',baseUrl:'https://search.fixture/search',apiKey:'fixture-only-key',model:'search-special',count:2,timeoutMs:5000,...extra});
 e.config.update({webSearch:{provider:'custom:'+saved.provider.id}});return saved.provider;
}

test('214 saved model reaches real test endpoint and registered tool/runner after config reload',async t=>{
 const e=environment(t,{retainedOutput});e.mode='model-required';const saved=await savedCustom(e);await e.boot();
 assert.equal(e.config.get().webSearch.providers[0].model,'search-special');
 const endpoint=await e.route('POST','/api/search-providers/test',{providerId:saved.id}),actual=await e.run('actual query');
 assert.equal(endpoint.result.ok,true);assert.equal(toolResult(actual).toolCall.ok,true);assert.equal(JSON.parse(toolResult(actual).content).results[0].title,'Fixture result');
 assert.equal(e.requests.length,2);for(const request of e.requests){assert.equal(request.body.model,'search-special');assert.equal(request.body.count,2);assert.equal(request.method,'POST');assert.equal(request.authorizationPresent,true);}
 assert.equal(e.requests[0].url,e.requests[1].url);assert.equal(actual.result.usage.calls,2);
 const direct=await createKernelSearch({cfg:()=>e.config.get(),fetchImpl:e.transport,dnsLookup:e.dnsLookup}).search('direct service query');assert.equal(direct.results[0].title,'Fixture result');assert.equal(e.requests[2].body.model,'search-special');assert.equal(e.requests[2].body.count,2);
 e.mode='success';await e.route('POST','/api/search-providers',{id:saved.id,type:'openai',baseUrl:saved.baseUrl,apiKey:'******',model:'search-updated',count:2,timeoutMs:5000});e.config.load();
 await e.run('updated query');assert.equal(e.requests.at(-1).body.model,'search-updated');assert.equal(e.requests.at(-1).authorizationPresent,true);
});

test('214 Bocha top-level and preserved nested business errors reach endpoint and actual failed tool',async t=>{
 const e=environment(t,{retainedOutput});e.config.update({webSearch:{provider:'bocha',bocha:{baseUrl:'https://bocha.fixture',apiKey:'fixture-only-key',count:2}}});await e.boot();
 for(const [mode,code,reason] of [['bocha-error',403,'fixture quota exhausted'],['bocha-nested-error',429,'fixture nested quota']]){
   e.mode=mode;const before=e.requests.length,endpoint=await e.route('POST','/api/search-providers/test'),actual=await e.run();
   assert.equal(endpoint.result.ok,false);assert.match(endpoint.result.note,new RegExp(String(code)));assert.match(endpoint.result.note,new RegExp(reason));
   const result=toolResult(actual);assert.equal(result.toolCall.ok,false);assert.match(result.content,new RegExp(reason));assert.match(result.content,new RegExp(String(code)));assert.doesNotMatch(result.content,/fixture-only-key/);assert.equal(e.requests.length-before,2);
 }
});

test('214 valid Bocha success and genuine empty results keep current result shape with one request',async t=>{
 const e=environment(t,{retainedOutput});e.config.update({webSearch:{provider:'bocha',bocha:{baseUrl:'https://bocha.fixture',apiKey:'fixture-only-key'}}});await e.boot();
 for(const [mode,count]of[['bocha-success',1],['bocha-empty',0]]){e.mode=mode;const before=e.requests.length,r=await e.run();assert.equal(toolResult(r).toolCall.ok,true);const data=JSON.parse(toolResult(r).content);assert.equal(data.results.length,count);assert.equal(typeof data.query,'string');assert.equal(e.requests.length-before,1);if(count)assert.equal(data.results[0].title,'Bocha result');else assert.match(data.note,/没有搜到/);}
});

test('214 appended web.search provider replaces default and disable restores default without hidden requests',async t=>{
 const e=environment(t,{retainedOutput});await savedCustom(e);
 e.plugin('search-override',`export function setup(ctx){ctx.registerCapability('web.search',{search:async query=>({query,results:[{title:'Appended provider',url:'https://result.fixture/',snippet:'override'}]})});}`,{enabledByDefault:false});
 await e.boot();await e.loader.setEnabled('search-override',true);const replaced=await e.run();assert.equal(JSON.parse(toolResult(replaced).content).results[0].title,'Appended provider');assert.equal(e.requests.length,0);
 await e.loader.setEnabled('search-override',false);const fallback=await e.run();assert.equal(JSON.parse(toolResult(fallback).content).results[0].title,'Fixture result');assert.equal(e.requests.length,1);assert.equal(e.requests[0].body.model,'search-special');
 e.config.update({webSearch:{enabled:false}});const unavailable=await e.run();assert.equal(unavailable.llmRequests[0].tools.some(item=>item.function.name==='web_search'),false);assert.equal(toolResult(unavailable).toolCall.ok,false);assert.equal(e.requests.length,1);
 e.config.update({webSearch:{enabled:true}});await e.loader.setEnabled('web-tools',false);assert.equal(e.capabilities.has('web.search'),false);await e.run();assert.equal(e.requests.length,1);
 await e.loader.setEnabled('web-tools',true);assert.equal(toolResult(await e.run()).toolCall.ok,true);assert.equal(e.requests.length,2);
});

test('214 private addresses and browseLock redirects remain blocked through real safeFetch',async t=>{
 const e=environment(t,{retainedOutput});const saved=await savedCustom(e,{baseUrl:'https://private.fixture/search'});await e.boot();
 const privateResult=await e.run();assert.equal(toolResult(privateResult).toolCall.ok,false);assert.match(toolResult(privateResult).content,/内网/);assert.equal(e.requests.length,0);
 await e.route('POST','/api/search-providers',{id:saved.id,type:'openai',baseUrl:'https://search.fixture/search',apiKey:'******',model:'search-special',count:2,timeoutMs:5000});e.config.update({security:{browseLock:{enabled:true,hosts:['search.fixture']}}});
 e.mode='redirect-blocked';const locked=await e.run();assert.equal(toolResult(locked).toolCall.ok,false);assert.match(toolResult(locked).content,/白名单/);assert.equal(e.requests.length,1);assert.equal(e.hostRequests.at(-1).browseLocked,true);assert.deepEqual(e.hostRequests.at(-1).allowedHosts,['search.fixture']);
});

test('214 disabling web-tools aborts the in-flight real tool and re-enable starts a fresh default request',async t=>{
 const e=environment(t,{retainedOutput});await savedCustom(e);await e.boot();e.mode='slow';const entered=e.waitForTransport(),pending=e.run();await entered;await e.loader.setEnabled('web-tools',false);const stopped=await pending;
 assert.equal(e.hostRequests[0].signal.aborted,true);assert.equal(toolResult(stopped).toolCall.ok,false);assert.match(toolResult(stopped).content,/停止|失效|中止/);assert.equal(e.requests.length,1);
 e.mode='success';await e.loader.setEnabled('web-tools',true);assert.equal(toolResult(await e.run()).toolCall.ok,true);assert.equal(e.requests.length,2);
});

test('214 configured timeout retains real safeFetch abort and does not retry or report empty success',async t=>{
 const e=environment(t,{retainedOutput});await savedCustom(e,{timeoutMs:1});await e.boot();e.mode='slow';const started=Date.now(),r=await e.run();
 assert.equal(toolResult(r).toolCall.ok,false);assert.match(toolResult(r).content,/超时/);assert.equal(e.hostRequests[0].timeoutMs,5000);assert.ok(Date.now()-started>=4800);assert.equal(e.requests.length,1);
});

test('214 HTTP and JSON failures preserve failed ToolResult and one outbound attempt',async t=>{
 const e=environment(t,{retainedOutput});await savedCustom(e);await e.boot();
 for(const [mode,pattern]of[['http-error',/HTTP 503/],['invalid-json',/合法 JSON/]]){e.mode=mode;const before=e.requests.length,r=await e.run();assert.equal(toolResult(r).toolCall.ok,false);assert.match(toolResult(r).content,pattern);assert.equal(e.requests.length-before,1);assert.equal(r.invocations[0].returned.result.ok,false);assert.equal(typeof r.invocations[0].returned.result.error,'string');}
});

test('214 deleting the selected saved custom source falls back to zero-key Bing through the real route',async t=>{
 const e=environment(t,{retainedOutput});const saved=await savedCustom(e);e.config.update({webSearch:{searchUrl:'https://bing.fixture/search'}});await e.boot();
 await e.route('DELETE','/api/search-providers',{id:saved.id});assert.equal(e.config.get().webSearch.provider,'bing');
 e.mode='bing';e.modes.bing=()=>new Response('<li class="b_algo"><h2><a href="https://result.fixture/">Bing fixture</a></h2><p>snippet</p></li>');
 const r=await e.run('Bing query');assert.equal(toolResult(r).toolCall.ok,true);assert.equal(JSON.parse(toolResult(r).content).results[0].title,'Bing fixture');assert.equal(e.requests.length,1);assert.equal(e.requests[0].method,'GET');assert.equal(e.requests[0].body,null);assert.equal(e.requests[0].authorizationPresent,false);
});

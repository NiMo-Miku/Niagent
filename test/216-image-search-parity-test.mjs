// Real default loader, SDK, registered tool bundle and runner. Only DNS and
// transport are fixtures; production safeFetch performs every request check.
// No kernel/HTTP server, external network, QQ or browser is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL}from'node:url';
import {defaultComponents as defaults}from'../bundled/runtime-defaults/components.js';
function environment(t,{retainedOutput=null,webToolsDir=path.resolve(import.meta.dirname,'../bundled/web-tools')}={}){
 if(retainedOutput)fs.mkdirSync(retainedOutput,{recursive:true});const root=fs.mkdtempSync(path.join(retainedOutput??os.tmpdir(),'qqa-images216-')),appRoot=path.join(root,'app'),dataDir=path.join(root,'data');
 for(const kind of ['bundled','skills','plugins'])fs.mkdirSync(path.join(appRoot,kind),{recursive:true});fs.writeFileSync(path.join(appRoot,'package.json'),'{"type":"module"}');
 const web=path.join(appRoot,'bundled/web-tools');fs.mkdirSync(web);fs.copyFileSync(path.join(webToolsDir,'skill.json'),path.join(web,'skill.json'));fs.writeFileSync(path.join(web,'index.js'),`export {default} from ${JSON.stringify(pathToFileURL(path.join(webToolsDir,'index.js')).href)};`);
 const logs=[],requests=[],hostRequests=[],runs=[];const log=Object.fromEntries(['info','warn','error','debug'].map(level=>[level,(...args)=>logs.push({level,args})]));log.child=()=>log;
 let config=defaults['runtime.config']({dataDir,defaults:defaults['runtime.config.defaults'](),log});config.load();config.update({api:{model:'offline-fixture',maxRounds:2},webSearch:{enabled:true,searchUrl:'https://bing.fixture/search'},proactive:{enabled:false}});
 const bus=defaults['runtime.bus']({log}),permissions=defaults['runtime.permissions']({dataDir,log,bus,headless:true}),capabilities=defaults['runtime.capability']({log}),registry=defaults['runtime.tools']({log,bus,permissions,capabilities});
 const scheduler=defaults['runtime.scheduler']({log}),storage=defaults['runtime.storage']({dataDir,log});let loader,services,entered;
 const plan={baidu:{html:'<html>empty Baidu</html>'},bing:{html:'<html>empty Bing</html>'}};
 const dnsAddresses={};const dnsLookup=async(host)=>[{address:dnsAddresses[host]??(host==='private.fixture'?'127.0.0.1':'8.8.8.8'),family:4}];
 const transport=async(url,init)=>{const host=new URL(url).hostname,source=host==='image.baidu.com'?'baidu':host==='bing.fixture'||host==='cn.bing.com'?'bing':'other';requests.push({url:String(url),source,method:init.method});if(entered){entered();entered=null;}const response=plan[source];if(typeof response==='function')return response(url,init);if(!response)throw new Error('Unplanned fixture source '+source);if(response.error)throw new Error(response.error);return new Response(response.html??'',{status:response.status??200,headers:response.headers});};
 async function checked(url,opts={}){const sec=config.get().security??{},bl=sec.browseLock??{};return defaults['runtime.fetch'](url,{...opts,...(bl.enabled?{browseLocked:true,allowedHosts:bl.hosts??[]}:{}),fetchImpl:transport,dnsLookup});}
 async function boot(){config=defaults['runtime.config']({dataDir,defaults:defaults['runtime.config.defaults'](),log});config.load();services=defaults['runtime.services']({capability:capabilities,config,bus,log});const sdk=defaults['runtime.sdk']({config,permissions,bus,loaderOf:()=>loader,resolveProvider:name=>services.get(name),facets:{'web.search':defaults['runtime.serviceFacade'](()=>services.get('web.search'),['search','fetchPage','lockState'])}});
  loader=defaults['runtime.plugins']({appRoot,config,log,bus,registry,capabilityRegistry:capabilities,permissions,scheduler,storage,sdkHost:{...sdk,fetch:async(url,opts)=>{hostRequests.push({url,...opts});const result=await checked(url,opts);const response=new Response(result.body,{status:result.status,headers:result.headers});Object.defineProperty(response,'url',{value:result.finalUrl});return response;}}});await loader.loadAll();}
 async function run(args={query:'fixture image',limit:8},{controller=new AbortController()}={}){const bundle=defaults['core.tools.bundle']({c:config.get()},{registry,loader}),session={id:'images216-'+runs.length,chatKey:'group:fixture',sent:[],usage:{calls:0,promptTokens:0,completionTokens:0,totalTokens:0}},llmRequests=[],invocations=[];let round=0;
  const result=await defaults['core.agentRunner']({session,systemPrompt:'Offline image search parity',userPrompt:'fixture trigger',tools:bundle.tools,signal:controller.signal,execContext:{chatKey:session.chatKey,session,signal:controller.signal},cfg:config.get(),log,capabilities,hooksOf:name=>loader.hooksOf(name),invokeTool:async(name,input,ctx)=>{const value=await bundle.invoke(name,input,ctx);invocations.push({name,input,value});return value;},callLLM:async options=>{llmRequests.push({messages:structuredClone(options.messages),tools:structuredClone(options.tools)});const usage={prompt_tokens:1,completion_tokens:1,total_tokens:2};return {message:{role:'assistant',content:'',...(round++===0?{tool_calls:[{id:'images216',type:'function',function:{name:'search_images',arguments:JSON.stringify(args)}}]}:{})},usage,raw:{usage}};}});const record={result,llmRequests,invocations};runs.push(record);return record;}
 function plugin(id,source,manifest={}){const dir=path.join(appRoot,'skills',id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'skill.json'),JSON.stringify({id,...manifest}));fs.writeFileSync(path.join(dir,'index.js'),source);return dir;}
 t.after(async()=>{await loader?.stopAll();scheduler.stop();permissions.close();await services?.stop();fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify({requests,hostRequests:hostRequests.map(({signal,...rest})=>({...rest,aborted:signal?.aborted})),runs,logs},null,2));if(!retainedOutput){const absolute=path.resolve(root);if(!absolute.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(absolute).startsWith('qqa-images216-'))throw new Error('Unsafe fixture cleanup');fs.rmSync(absolute,{recursive:true,force:true});}});
 return {root,plan,get config(){return config;},boot,run,plugin,requests,hostRequests,capabilities,registry,permissions,dnsAddresses,get loader(){return loader;},waitForTransport(){return new Promise(resolve=>{entered=resolve;});}};
}
const tool=run=>run.result.messages.find(message=>message.toolCall?.name==='search_images');
const payload=run=>JSON.parse(tool(run).content);
const bingAttribute=url=>'<a m="'+JSON.stringify({murl:url}).replaceAll('"','&quot;')+'">fixture</a>';

const retainedOutput = process.argv[2] ? path.resolve(process.argv[2]) : null;
const outcomes = [];
const env = t => environment(t, { retainedOutput });
const slow=(_url,init)=>new Promise((resolve,reject)=>{const abort=()=>reject(init.signal.reason);if(init.signal.aborted)abort();else init.signal.addEventListener('abort',abort,{once:true});});

test('216 real tool keeps Baidu-first, filters/de-duplicates all key fallbacks and preserves default/max counts',async t=>{
 const e=env(t);const rows=Array.from({length:15},(_,i)=>({objURL:'https://image.fixture/'+i+'.png',middleURL:'https://image.fixture/'+i+'.png',thumbURL:'javascript:bad'}));e.plan.baidu={html:JSON.stringify(rows)+'<script>globalThis.__remoteImage216=true</script>'};await e.boot();
 for(const [args,count]of[[{query:'image'},8],[{query:'image',limit:99},12],[{query:'image',limit:2},2]]){const start=e.requests.length,r=await e.run(args);assert.equal(tool(r).toolCall.ok,true);assert.equal(payload(r).results.length,count);assert.equal(new Set(payload(r).results.map(row=>row.url)).size,count);assert.equal(e.requests.length-start,1);assert.equal(e.requests.at(-1).source,'baidu');assert.ok(payload(r).results.every(row=>/^https:\/\//.test(row.url)));}
 assert.equal(globalThis.__remoteImage216,undefined);outcomes.push({id:'primary-order-counts',root:e.root});
});

test('216 actual first-source failure recovers with old entity Bing parser and configured Bing address',async t=>{
 const e=env(t);e.plan.baidu={error:'fixture primary unavailable'};e.plan.bing={html:bingAttribute('https://image.fixture/bing.png')};e.config.update({webSearch:{searchUrl:'https://bing.fixture/custom?retained=yes'}});await e.boot();const r=await e.run();
 assert.equal(tool(r).toolCall.ok,true);assert.equal(payload(r).results[0].url,'https://image.fixture/bing.png');assert.deepEqual(e.requests.map(item=>item.source),['baidu','bing']);assert.match(e.requests[1].url,/\/images\/search\?/);assert.equal(new URL(e.requests[1].url).searchParams.get('retained'),'yes');assert.equal(payload(r).sources[0].status,'error');outcomes.push({id:'entity-recovery',root:e.root});
});

test('216 keeps newer standalone raw-murl and same-page img paths with common URL filtering',async t=>{
 const e=env(t);await e.boot();for(const [html,url]of[['{"murl":"https://image.fixture/raw.png"}','https://image.fixture/raw.png'],['<img src="javascript:bad"><img src="/thumb.png"><img src="/thumb.png">','https://bing.fixture/thumb.png']]){e.plan.bing={html};const start=e.requests.length,r=await e.run();assert.equal(tool(r).toolCall.ok,true);assert.deepEqual(payload(r).results.map(row=>row.url),[url]);assert.equal(e.requests.length-start,2);}outcomes.push({id:'modern-parsing-controls',root:e.root});
});

test('216 diagnoses two empty sources separately from transport/HTTP failure',async t=>{
 const e=env(t);await e.boot();const empty=await e.run();assert.equal(tool(empty).toolCall.ok,true);assert.deepEqual(payload(empty).results,[]);assert.deepEqual(payload(empty).sources.map(row=>row.status),['empty','empty']);assert.match(payload(empty).note,/均未返回/);
 e.plan.baidu={status:503,html:'<img src="https://image.fixture/error-logo.png">'};e.plan.bing={error:'fixture Bing disconnected'};const failed=await e.run();assert.equal(tool(failed).toolCall.ok,false);assert.match(tool(failed).content,/Baidu.*HTTP 503/);assert.match(tool(failed).content,/Bing.*disconnected/);assert.doesNotMatch(tool(failed).content,/error-logo/);
 e.plan.baidu={html:'empty'};const mixed=await e.run();assert.equal(tool(mixed).toolCall.ok,false);assert.match(tool(mixed).content,/Baidu.*无图片结果/);assert.match(tool(mixed).content,/Bing.*disconnected/);outcomes.push({id:'empty-vs-error',root:e.root});
});

test('216 raw consumer handle is stable only for the actual selected definition; reload/disable rejects late old result',async t=>{
 const e=env(t);let enter,release;const entered=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{release=resolve;});e.capabilities.register('qa.image.gate','kernel',()=>{enter();return gate;});
 const dir=e.plugin('image-override',`export function setup(ctx){ctx.registerCapability('web.images',{search:async()=>ctx.capability('qa.image.gate')});}`,{enabledByDefault:false});await e.boot();
 const lookup=()=>e.loader.hostEntry('web-tools').ctx.capability('web.images');const defaultHandle=lookup();assert.equal(lookup(),defaultHandle);await e.loader.setEnabled('image-override',true);const first=lookup();assert.notEqual(first,defaultHandle);assert.equal(lookup(),first);
 const pending=e.run();await entered;await e.loader.loadDir('skills',dir);const reloaded=lookup();assert.notEqual(reloaded,first);assert.equal(lookup(),reloaded);release({query:'late',results:[{url:'https://image.fixture/late.png'}]});const stale=await pending;
 assert.equal(tool(stale).toolCall.ok,false);assert.match(tool(stale).content,/提供者已切换/);assert.doesNotMatch(JSON.stringify(stale.llmRequests),/late\.png/);assert.equal(e.requests.length,0);
 await e.loader.setEnabled('image-override',false);assert.equal(lookup(),defaultHandle);e.plan.baidu={html:'{"objURL":"https://image.fixture/default.png"}'};assert.equal(payload(await e.run()).results[0].url,'https://image.fixture/default.png');assert.equal(e.requests.length,1);
 outcomes.push({id:'raw-handle-selection-proof',stableBeforeChange:true,changedOnOwnerReload:true,restoredOriginalDefault:true,root:e.root});
});

test('216 search-only web.search replacement does not remove independent image capability; appended image provider gets final filtering',async t=>{
 const e=env(t);e.plugin('web-only',`export function setup(ctx){ctx.registerCapability('web.search',{search:async query=>({query,results:[]})});}`);
 e.plugin('image-only',`export function setup(ctx){ctx.registerCapability('web.images',{search:async query=>{if(query==='fail')throw new Error('fixture image override failed');return {query,results:[{url:'javascript:bad'},{url:'https://user:password@image.fixture/a.png'},{url:'https://image.fixture/a.png'},{url:'https://image.fixture/a.png'},{url:'https://image.fixture/b.png'}],source:'append'};}});}`,{enabledByDefault:false});e.plan.baidu={html:'{"objURL":"https://image.fixture/default.png"}'};await e.boot();assert.equal(payload(await e.run()).results[0].url,'https://image.fixture/default.png');
 await e.loader.setEnabled('image-only',true);const before=e.requests.length,r=await e.run({query:'append',limit:1});assert.equal(e.requests.length,before);assert.deepEqual(payload(r).results,[{url:'https://image.fixture/a.png'}]);assert.equal(payload(r).source,'append');const failed=await e.run({query:'fail'});assert.equal(tool(failed).toolCall.ok,false);assert.match(tool(failed).content,/fixture image override failed/);assert.equal(e.requests.length,before);outcomes.push({id:'separate-capability-and-filtering',root:e.root});
});

test('216 same raw object with a newly registered search method rejects the older pending method result',async t=>{
 const e=env(t);let enter,release;const entered=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{release=resolve;});e.capabilities.register('qa.same.gate','kernel',()=>{enter();return gate;});
 e.plugin('same-object',`let ctx,provider;export function setup(value){ctx=value;provider={search:async()=>ctx.capability('qa.same.gate')};ctx.registerCapability('web.images',provider);}export function refresh(){provider.search=async query=>({query,results:[{url:'https://image.fixture/new-method.png'}]});ctx.registerCapability('web.images',provider);}`);
 await e.boot();const lookup=()=>e.loader.hostEntry('web-tools').ctx.capability('web.images'),first=lookup(),firstMethod=first.search;const pending=e.run();await entered;e.loader.hostEntry('same-object').instance.refresh();assert.equal(lookup(),first);assert.notEqual(lookup().search,firstMethod);release({query:'late',results:[{url:'https://image.fixture/old-method-late.png'}]});const stale=await pending;
 assert.equal(tool(stale).toolCall.ok,false);assert.match(tool(stale).content,/提供者已切换/);assert.doesNotMatch(JSON.stringify(stale.llmRequests),/old-method-late/);assert.equal(payload(await e.run()).results[0].url,'https://image.fixture/new-method.png');assert.equal(e.requests.length,0);outcomes.push({id:'same-object-method-replacement',root:e.root});
});

test('216 preserves browser lock and private/DNS/redirect checks for every alternate source',async t=>{
 const e=env(t);e.config.update({security:{browseLock:{enabled:true,hosts:['bing.fixture']}}});e.plan.bing={html:'{"murl":"https://image.fixture/locked.png"}'};await e.boot();const locked=await e.run();assert.equal(tool(locked).toolCall.ok,true);assert.deepEqual(e.requests.map(row=>row.source),['bing']);assert.ok(e.hostRequests.every(row=>row.browseLocked===true));assert.ok(e.hostRequests.every(row=>JSON.stringify(row.allowedHosts)==='["bing.fixture"]'));
 e.config.update({security:{browseLock:{enabled:true,hosts:['image.baidu.com','bing.fixture']}}});e.plan.baidu={status:302,headers:{location:'https://blocked.fixture/redirect'}};const before=e.requests.length,redirected=await e.run();assert.equal(tool(redirected).toolCall.ok,true);assert.deepEqual(e.requests.slice(before).map(row=>row.source),['baidu','bing']);assert.ok(!e.requests.some(row=>row.url.includes('blocked.fixture')));
 e.config.update({security:{browseLock:{enabled:false}}});e.dnsAddresses['image.baidu.com']='127.0.0.1';e.config.update({webSearch:{searchUrl:'https://private.fixture/search'}});const count=e.requests.length,privateResult=await e.run();assert.equal(tool(privateResult).toolCall.ok,false);assert.match(tool(privateResult).content,/内网/);assert.equal(e.requests.length,count);outcomes.push({id:'source-security-gates',root:e.root});
});

test('216 abort and web-tools disable stop the pending primary without starting fallback',async t=>{
 const e=env(t);e.plan.baidu=slow;await e.boot();let entered=e.waitForTransport();const controller=new AbortController(),pending=e.run({query:'cancel'},{controller});await entered;controller.abort(new Error('fixture consumer cancel'));const cancelled=await pending;assert.equal(cancelled.result.error.message,'fixture consumer cancel');assert.deepEqual(e.requests.map(row=>row.source),['baidu']);
 entered=e.waitForTransport();const disabling=e.run();await entered;await e.loader.setEnabled('web-tools',false);const stopped=await disabling;assert.equal(tool(stopped).toolCall.ok,false);assert.match(tool(stopped).content,/停止|失效/);assert.deepEqual(e.requests.map(row=>row.source),['baidu','baidu']);assert.equal(e.capabilities.has('web.images'),false);assert.equal(e.registry.get('search_images'),undefined);outcomes.push({id:'abort-no-fallback',root:e.root});
});

test('216 real existing 15-second safeFetch primary timeout can recover once with Bing',async t=>{
 const e=env(t);e.plan.baidu=slow;e.plan.bing={html:'{"murl":"https://image.fixture/timeout-recovered.png"}'};await e.boot();const started=Date.now(),r=await e.run();assert.equal(tool(r).toolCall.ok,true);assert.equal(payload(r).results[0].url,'https://image.fixture/timeout-recovered.png');assert.ok(Date.now()-started>=14800);assert.deepEqual(e.requests.map(row=>row.source),['baidu','bing']);assert.equal(e.hostRequests[0].timeoutMs,undefined);assert.match(payload(r).sources[0].reason,/超时/);outcomes.push({id:'real-timeout-recovery',root:e.root});
});

test('216 disabled search and revoked outbound permission stop actual tool requests without fallback', async t => {
  const e = env(t);
  await e.boot();
  e.config.update({ webSearch: { enabled: false } });
  const disabled = await e.run();
  assert.equal(tool(disabled).toolCall.ok, false);
  assert.ok(!disabled.llmRequests[0].tools.some(row => row.function.name === 'search_images'));
  assert.equal(e.requests.length, 0);
  e.config.update({ webSearch: { enabled: true } });
  // Bind the real loaded fingerprint for the permissions service's explicit
  // host decision path. This fixture does not assert the UI grants bundled ACLs.
  const entry = e.loader.hostEntry('web-tools');
  e.permissions.bindPlugin('web-tools', {
    fingerprint: entry.fingerprint, scopes: entry.manifest.permissions,
    isCurrent: () => e.loader.hostEntry('web-tools') === entry && e.loader.contentCurrent('web-tools'),
  });
  const decide = value => assert.equal(e.permissions.setOverride('web-tools', 'net.outbound', value, { fingerprint: entry.fingerprint }), true);
  decide('deny');
  const denied = await e.run();
  assert.equal(tool(denied).toolCall.ok, false);
  assert.equal(e.requests.length, 0);
  decide('allow');
  e.plan.baidu = slow;
  const entered = e.waitForTransport(), pending = e.run();
  await entered;
  decide('deny');
  const revoked = await pending;
  assert.equal(tool(revoked).toolCall.ok, false);
  assert.match(tool(revoked).content, /授权|权限/);
  assert.deepEqual(e.requests.map(row => row.source), ['baidu']);
  outcomes.push({ id: 'search-and-permission-gates', root: e.root });
});

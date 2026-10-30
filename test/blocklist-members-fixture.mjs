import {settingsBlocklist} from './settings-navigation.mjs';
// Isolated 234 fixture. Only the two shipped community/market dependencies are
// loaded; the actual default blocklist client talks to an in-process HTTP stub.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import callbackDns from 'node:dns';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {createApplication} from '../src/kernel/composition.js';
import {defaultComponents} from '../bundled/runtime-defaults/components.js';
import {createCommunityMarketAdapters} from '../bundled/market/client.js';
export const workspace=path.resolve(import.meta.dirname,'..');
export async function blocklistFixture(){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-blocklist234-')),appRoot=path.join(temporary,'app'),dataDir=path.join(temporary,'data'),token='synthetic-blocklist234';
  fs.mkdirSync(appRoot);fs.writeFileSync(path.join(appRoot,'package.json'),'{"type":"module"}');for(const folder of ['ui','src'])fs.cpSync(path.join(workspace,folder),path.join(appRoot,folder),{recursive:true});for(const folder of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,folder));for(const folder of ['community','market'])fs.cpSync(path.join(workspace,'bundled',folder),path.join(appRoot,'bundled',folder),{recursive:true});
  const nativeFetch=globalThis.fetch,nativeLookup=dns.lookup,nativeCallbackLookup=callbackDns.lookup,nativeRename=fs.renameSync,owned=new Set(),errors=[],blocked=[],events=[],cloudCalls=[],checks=[];
  let kernel,base,browser,page,frame,client,remoteIds=['333'],adminKey='',remoteMode='ok',renameFault=false,memberMode='ok',outbound=0,dnsCalls=0;
  const cloudFetch=async(url,options={})=>{
    const target=new URL(String(url));if(target.origin!=='https://www.kondius.cn'||!['/api/community/blocklist','/api/community/blocklist/add'].includes(target.pathname)){outbound++;throw Error('234 unrelated external request forbidden');}
    const method=options.method??'GET',body=options.body?JSON.parse(options.body):null;cloudCalls.push({method,path:target.pathname,body});
    if(remoteMode==='offline')throw Error('synthetic234 transport failure');if(remoteMode==='permission')throw Error('插件授权已失效');if(remoteMode==='hold'){await fixture.cloudGate;}
    if(method==='PUT'&&adminKey==='invalid')return new Response(JSON.stringify({error:'synthetic invalid key'}),{status:403});
    if(method==='PUT')remoteIds=body.ids;if(method==='POST')remoteIds=[...new Set([...remoteIds,...body.ids])];return new Response(JSON.stringify({ok:true,ids:remoteIds}));
  };
  globalThis.fetch=async(url,...args)=>{if(owned.has(new URL(String(url)).origin))return nativeFetch(url,...args);outbound++;throw Error('234 global external request forbidden');};dns.lookup=async()=>{dnsCalls++;throw Error('234 DNS forbidden');};
  callbackDns.lookup=(host,options,callback)=>{if(typeof options==='function'){callback=options;options=undefined;}if(!['127.0.0.1','::1'].includes(host)){dnsCalls++;queueMicrotask(()=>callback(Error('234 callback DNS forbidden')));return;}const entry={address:host,family:host==='::1'?6:4};queueMicrotask(()=>options?.all?callback(null,[entry]):callback(null,entry.address,entry.family));};syncBuiltinESMExports();
  fs.renameSync=function(from,to,...args){if(renameFault&&path.resolve(to)===path.join(dataDir,'config.json'))throw Error('synthetic234 config rename failure');return nativeRename.call(this,from,to,...args);};
  const fixture={temporary,appRoot,dataDir,token,errors,blocked,events,cloudCalls,checks,cloudGate:null,
    cloudFetch,
    get kernel(){return kernel;},get base(){return base;},get client(){return client;},get page(){return page;},get frame(){return frame;},
    key(value){adminKey=value;},remote(value){remoteMode=value;},ids(value){remoteIds=[...value];},fault(value){renameFault=value;},members(value){memberMode=value;},
    check(name){checks.push(name);console.log('✓ 234 '+name);},disk(){return JSON.parse(fs.readFileSync(path.join(dataDir,'config.json'),'utf8'));},
    makeClient(){return createCommunityMarketAdapters({dataDir,config:kernel.config,appRoot,communityKey:()=>adminKey,fetchImpl:cloudFetch,dnsLookup:async()=>[{address:'203.0.113.8',family:4}]});},
    selectClient(next){client=next;},
    layer(name,manifest,files){const folder=path.join(appRoot,'overrides',name);fs.mkdirSync(folder,{recursive:true});for(const[file,source]of Object.entries(files))fs.writeFileSync(path.join(folder,file),source);const file=path.join(folder,'composition.json');fs.writeFileSync(file,JSON.stringify({version:1,id:name,...manifest}));return file;},
    disable(file){const value=JSON.parse(fs.readFileSync(file));value.enabled=false;fs.writeFileSync(file,JSON.stringify(value));},
    async start(initialize=false){
      const injected={getBlocklist:(...args)=>client.getBlocklist(...args),updateBlocklist:(...args)=>client.updateBlocklist(...args),syncGlobalBlocklist:(...args)=>client.syncGlobalBlocklist(...args),listAccounts:()=>({ok:true,accounts:[]})};
      kernel=await createApplication({appRoot,headless:true,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(temporary,'absent')},
        transport:{id:'inert234',selfId:'999',start(){},stop(){},status:()=>({connected:true,selfId:'999'}),actions:{listGroups:async()=>[{id:'100',name:'群甲'},{id:'200',name:'群乙'},{id:'300',name:'未授权群'}],listFriends:async()=>[],getSelfMemberInfo:async()=>({muted:false}),getGroupMembers:async id=>{if(memberMode==='failed')throw Error('synthetic member unavailable');if(fixture.memberGate)await fixture.memberGate(String(id));return String(id)==='200'?[{userId:'222',nickname:'乙昵称',card:'乙名片'},{userId:'999',nickname:'SELF',card:'机器人'}]:[{userId:'111',nickname:'甲昵称',card:'甲名片'},{userId:'999',nickname:'SELF',card:'机器人'}];}}},
        components:{'runtime.logger':options=>defaultComponents['runtime.logger']({...options,mirrorConsole:false}),'llm.complete':async()=>({message:{role:'assistant',content:''},finishReason:'stop'})},
        priceUpdates:{refresh:async()=>({ok:true}),updateCheck:async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false})},communityMarket:injected,fetchImpl:async()=>{outbound++;throw Error('234 unrelated kernel fetch forbidden');}});
      client=fixture.makeClient();kernel.loader.startWatchers=()=>{};kernel.bus.on('status',value=>events.push(structuredClone(value)),{internal:true});
      if(initialize)kernel.config.update({server:{port:0,token},api:{baseUrl:'http://127.0.0.1:9/v1',model:'synthetic234'},telemetry:{enabled:false},allow:{groups:['100','200'],private:[]},blocklist:{100:['444'],200:['555']},globalBlocklist:[],communityExemptions:[],proactive:{enabled:false},chatActive:{enabled:false},memory:{consolidateEnabled:false},sessionRetryAttempts:0});
      base=`http://127.0.0.1:${await kernel.start()}`;assert.notEqual(Number(new URL(base).port),15967);owned.add(new URL(base).origin);assert.deepEqual(kernel.loader.listEntries().map(entry=>[entry.id,entry.status]).sort(),[['community','active'],['market','active']]);assert.equal(fs.existsSync(path.join(temporary,'absent')),false);await client.syncGlobalBlocklist({pushLocal:true});
    },
    async stop(){if(page)await page.goto('about:blank');await kernel?.stop();kernel=null;},
    async api(method,url,body){const response=await globalThis.fetch(base+url,{method,headers:{'x-console-token':token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,body:await response.json()};},
    async browser(){const playwright=createRequire(import.meta.url)('playwright-core'),cache=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ms-playwright'),executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9))).map(name=>path.join(cache,name,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));browser=await playwright.chromium.launch({executablePath,headless:process.env.QA_HEADED!=='1'});page=await browser.newPage({viewport:{width:1360,height:900}});page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>owned.has(new URL(route.request().url()).origin)?route.continue():(blocked.push(route.request().url()),route.abort()));},
    async open(panel='settings'){await page.goto(base+'/?token='+token);await page.locator(`#nav button[data-panel=${panel}]`).click();frame=page.frameLocator('#panel-host iframe');if(panel==='settings'){await frame.locator('#status').filter({hasText:'配置已读取'}).waitFor();await settingsBlocklist(frame);}return frame;},
    async close(result){renameFault=false;fs.renameSync=nativeRename;await browser?.close();await kernel?.stop();globalThis.fetch=nativeFetch;dns.lookup=nativeLookup;callbackDns.lookup=nativeCallbackLookup;syncBuiltinESMExports();Object.assign(result,{checks,outbound,dnsCalls,blocked,errors,cloudCalls});const folder=path.join(workspace,'.qa-local/v04-parity-20261016/blocklist234');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,process.argv.includes('--http-only')?'http-result.json':process.env.QA_HEADED==='1'?'headed-result.json':'headless-result.json'),JSON.stringify(result,null,2));assert.equal(path.dirname(path.resolve(temporary)),path.resolve(os.tmpdir()));assert.ok(path.basename(temporary).startsWith('qqa-blocklist234-'));fs.rmSync(temporary,{recursive:true,force:true});assert.equal(outbound,0);assert.equal(dnsCalls,0);assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);},
  };return fixture;
}
export async function until(check){for(let i=0;i<700;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('234 timed out');}

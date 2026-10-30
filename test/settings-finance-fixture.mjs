// Shared isolated fixture for 228/229. Only copied UI and empty extension roots.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import {createRequire} from 'node:module';
import {createApplication} from '../src/kernel/composition.js';
import {defaultComponents} from '../bundled/runtime-defaults/components.js';
import {settingsSection} from './settings-navigation.mjs';
export const workspace=path.resolve(import.meta.dirname,'..');
export async function financeFixture(number){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),`qqa-finance${number}-`)),appRoot=path.join(temporary,'app'),dataDir=path.join(temporary,'data'),token=`synthetic-finance-${number}`;
  fs.mkdirSync(appRoot);fs.cpSync(path.join(workspace,'ui'),path.join(appRoot,'ui'),{recursive:true});for(const name of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,name));
  const nativeFetch=globalThis.fetch,nativeLookup=dns.lookup,nativeRename=fs.renameSync,errors=[],blocked=[],events=[],calls=[],feedCalls=[],checks=[],ownedOrigins=new Set();
  let kernel,base,browser,page,frame,renameFault=false,outbound=0,dnsCalls=0,feedMode='offline';
  const offlineFetch=async url=>{feedCalls.push(String(url));if(String(url)==='https://kondius.cn/qq-agent/version.json')return new Response(JSON.stringify({version:'0.5.0'}));if(String(url)==='https://kondius.cn/qq-agent/model-prices.json'){if(feedMode==='offline')throw Error('synthetic offline feed');return new Response(JSON.stringify({prices:{'qa-feed228':{in:3,out:4,cached:0}}}));}outbound++;throw Error('Unknown fetch forbidden');};
  globalThis.fetch=async(url,...args)=>{if(ownedOrigins.has(new URL(String(url)).origin))return nativeFetch(url,...args);return offlineFetch(url);};
  dns.lookup=async()=>{dnsCalls++;throw Error('DNS forbidden');};
  fs.renameSync=function(from,to,...args){if(renameFault&&path.resolve(to)===path.join(dataDir,'config.json'))throw Error(`synthetic${number} config rename failure`);return nativeRename.call(this,from,to,...args);};
  const fixture={appRoot,dataDir,temporary,token,events,calls,errors,blocked,checks,
    get kernel(){return kernel;},get base(){return base;},get page(){return page;},get frame(){return frame;},get feedCalls(){return feedCalls;},
    fault(value){renameFault=value;},feed(value){feedMode=value;},check(name){checks.push(name);console.log(`✓ ${number} ${name}`);},
    disk(){return JSON.parse(fs.readFileSync(path.join(dataDir,'config.json'),'utf8'));},
    layer(name,manifest,files){const folder=path.join(appRoot,'overrides',name);fs.mkdirSync(folder,{recursive:true});for(const[file,source]of Object.entries(files))fs.writeFileSync(path.join(folder,file),source);const target=path.join(folder,'composition.json');fs.writeFileSync(target,JSON.stringify({version:1,id:name,...manifest}));return target;},
    disable(file){const value=JSON.parse(fs.readFileSync(file));value.enabled=false;fs.writeFileSync(file,JSON.stringify(value));},
    async start(initialize=false){
      kernel=await createApplication({appRoot,headless:true,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(temporary,'absent')},
        transport:{id:`inert-finance${number}`,start(){},stop(){},status:()=>({connected:false}),actions:{listGroups:async()=>[{id:'123',name:'合成群'}],listFriends:async()=>[],getSelfMemberInfo:async()=>({muted:false})}},
        components:{'runtime.logger':options=>defaultComponents['runtime.logger']({...options,mirrorConsole:false}),'llm.complete':async args=>{calls.push(structuredClone(args.messages));return{message:{role:'assistant',content:''},finishReason:'stop'};}},
        fetchImpl:offlineFetch,
        communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})}});
      kernel.loader.startWatchers=()=>{};kernel.bus.on('status',value=>events.push(structuredClone(value)),{internal:true});
      if(initialize)kernel.config.update({server:{port:0,token},telemetry:{enabled:false},api:{baseUrl:'http://127.0.0.1:9/v1',model:'deepseek-chat',maxRounds:1,priceInputPerM:6,priceOutputPerM:7,priceCachedPerM:0},allow:{groups:['123'],private:[]},allowAllWhenEmpty:false,proactive:{enabled:false},chatActive:{enabled:false},memory:{consolidateEnabled:false},sessionRetryAttempts:0,wakeDelayMs:200,store:{historyCount:0,promptAnchor:{enabled:false},keywords:[],contextSliderPos:0}});
      base=`http://127.0.0.1:${await kernel.start()}`;assert.notEqual(Number(new URL(base).port),15967);ownedOrigins.add(new URL(base).origin);assert.deepEqual(kernel.loader.listEntries(),[]);assert.equal(fs.existsSync(path.join(temporary,'absent')),false);
    },
    async stop(){if(page)await page.goto('about:blank');await kernel?.stop();kernel=null;},
    async api(method,url,body){const response=await globalThis.fetch(base+url,{method,headers:{'x-console-token':token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,body:await response.json()};},
    async browser(){
      const playwright=createRequire(import.meta.url)('playwright-core'),cache=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ms-playwright'),executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9))).map(name=>path.join(cache,name,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));
      browser=await playwright.chromium.launch({executablePath,headless:process.env.QA_HEADED!=='1'});page=await browser.newPage({viewport:{width:1360,height:900}});page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>ownedOrigins.has(new URL(route.request().url()).origin)?route.continue():(blocked.push(route.request().url()),route.abort()));return page;
    },
    async open(){await page.goto(base+'/?token='+token);await page.locator('#nav button[data-panel=settings]').click();frame=page.frameLocator('#panel-host iframe');await frame.locator('#status').filter({hasText:'配置已读取'}).waitFor();return frame;},
    async section(id){await settingsSection(frame,id);},
    async returnSettings(){await page.locator('#nav button[data-panel=sessions]').click();await page.locator('#nav button[data-panel=settings]').click();frame=page.frameLocator('#panel-host iframe');await frame.locator('#status').filter({hasText:'配置已读取'}).waitFor();return frame;},
    async close(result){renameFault=false;fs.renameSync=nativeRename;await browser?.close();await kernel?.stop();globalThis.fetch=nativeFetch;dns.lookup=nativeLookup;result.checks=checks;result.outbound=outbound;result.dnsCalls=dnsCalls;result.blocked=blocked;result.errors=errors;const folder=path.join(workspace,`.qa-local/v04-parity-20261016/finance-${number}`);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,process.argv.includes('--http-only')?'http-result.json':process.env.QA_HEADED==='1'?'headed-result.json':'headless-result.json'),JSON.stringify(result,null,2));assert.equal(path.dirname(path.resolve(temporary)),path.resolve(os.tmpdir()));assert.ok(path.basename(temporary).startsWith(`qqa-finance${number}-`));fs.rmSync(temporary,{recursive:true,force:true});assert.equal(outbound,0);assert.equal(dnsCalls,0);assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);},
  };
  return fixture;
}
export async function until(check){for(let index=0;index<700;index++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Finance fixture timed out');}

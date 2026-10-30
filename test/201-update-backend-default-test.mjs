import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {createApplication} from '../src/kernel/composition.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-updates201-')),appRoot=path.join(dir,'app');fs.mkdirSync(appRoot);
for(const d of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,d));
const layer=path.join(appRoot,'overrides','10-updates');fs.mkdirSync(layer,{recursive:true});
const factory=pathToFileURL(path.resolve('src/console/price-update-adapters.js')).href;
fs.writeFileSync(path.join(layer,'updates.mjs'),`import assert from 'node:assert/strict';import {createPriceUpdateAdapters} from ${JSON.stringify(factory)};
export default options=>{assert.equal(options.version,'0.5.0');const adapter=createPriceUpdateAdapters({...options,fetchImpl:async url=>{assert.equal(String(url),'https://kondius.cn/qq-agent/version.json');return{ok:true,status:200,json:async()=>({version:'9.9.9',url:'https://example.test/release',notes:'appended backend source'})}}});return{...adapter,refresh:async()=>({ok:true})};};`);
fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify({version:1,id:'qa-updates201',components:{'runtime.priceUpdates':'./updates.mjs'}}));
let kernel;
try{
 kernel=await createApplication({appRoot,headless:true,env:{QQ_AGENT_DATA_DIR:dir,QQ_AGENT_MIGRATE_FROM:path.join(dir,'absent')},transport:{id:'qa201',start(){},stop(){},status:()=>({connected:false}),actions:{}},communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})},fetchImpl:async()=>{throw new Error('QA201 unrelated request forbidden');}});
 kernel.log.setLevel('error');kernel.loader.startWatchers=()=>{};kernel.config.update({server:{port:0,token:'synthetic201'},telemetry:{enabled:false},proactive:{enabled:false}});
 const port=await kernel.start();const response=await fetch(`http://127.0.0.1:${port}/api/update-check`,{headers:{'x-console-token':'synthetic201'}});assert.equal(response.status,200);const data=await response.json();assert.equal(data.current,'0.5.0');assert.equal(data.latest,'9.9.9');assert.equal(data.hasUpdate,true);assert.equal(data.notes,'appended backend source');
 console.log('✓ real appended runtime.priceUpdates receives current application version and serves the authenticated default update API');
}finally{await kernel?.stop();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('qqa-updates201-'));fs.rmSync(dir,{recursive:true,force:true});}

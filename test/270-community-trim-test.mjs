import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {createCommunityMarketAdapters} from '../bundled/market/client.js';
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function zip(files){const locals=[],centers=[];let offset=0;
  for(const [name,value] of Object.entries(files)){const filename=Buffer.from(name),data=Buffer.from(value),crc=crc32(data),local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);locals.push(local,filename,data);
    central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);centers.push(central,filename);offset+=local.length+filename.length+data.length;
  }const center=Buffer.concat(centers),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(center.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,center,end]);
}

const evidence=path.resolve(process.env.QA_EVIDENCE_DIR||'.qa-local/community-trim-20261019/headless');fs.mkdirSync(evidence,{recursive:true});
const upstream=[],downloads=[],checks=[],marker='__qa270MustNotExecute';let f,client,mode='ok';
const check=message=>{checks.push(message);console.log('✓ 270 '+message);};
const id=kind=>'qa-catalog-'+kind,code=kind=>kind==='plugin'?'PLUGIN270':'SKILL270';
try {
  f=await modelUiFixture({marketClientFactory:({appRoot,dataDir})=>client=createCommunityMarketAdapters({appRoot,dataDir,communityKey:'',config:{get:()=>({})},dnsLookup:async()=>[{address:'203.0.113.8',family:4}],
    fetchImpl:async(url,options={})=>{
      const pathname=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;upstream.push({pathname,body});
      const kind=pathname.endsWith('/plugins')?'plugin':'skill';
      if(pathname.endsWith('/plugins') || pathname.endsWith('/skills')){
        if(mode==='offline')return new Response('{}',{status:503});
        const item={id:id(kind),name:'Catalog '+kind,type:kind,status:mode==='pending'?'pending':'approved',installCode:code(kind)};
        return new Response(JSON.stringify({ok:true,items:mode==='missing'?[]:mode==='duplicate'?[item,item]:[item]}));
      }
      if(pathname.endsWith('/install/verify'))return new Response(JSON.stringify({ok:true,results:body.codes.map(value=>{const type=value==='PLUGIN270'?'plugin':'skill';return{code:value,ok:true,type:mode==='wrong-kind'?'other':type,id:mode==='changed'?'changed':id(type)}})}));
      const match=pathname.match(/\/install\/(PLUGIN270|SKILL270)\/download$/);assert.ok(match,'unexpected synthetic upstream '+pathname);downloads.push(match[1]);const type=match[1]==='PLUGIN270'?'plugin':'skill';
      return new Response(zip({[type+'.json']:JSON.stringify({id:id(type),kind:type,apiVersion:1,entry:'index.js',enabledByDefault:true}),'index.js':'globalThis.'+marker+'=true;export default {}'}));
    },installZip:async(buffer,{kind})=>{const r=await f.request('POST','/api/skills/install',{kind,zipBase64:buffer.toString('base64')});if(r.status!==200)throw Object.assign(new Error(r.data.error),{status:r.status,expose:true});return r.data;}})});
  assert.notEqual(new URL(f.base).port,'15967');
  const seen=[];f.page.on('request',r=>{if(r.url().startsWith(f.base+'/api/'))seen.push(new URL(r.url()).pathname);});
  await f.page.locator('#nav button[data-panel=community]').click();await f.frame.locator('#meta').filter({hasText:'社区就绪'}).waitFor();
  assert.equal(await f.frame.locator('#pane-account').isVisible(),true);
  assert.equal(await f.frame.locator('[role=tab],#pane-install,#pane-block,#code-rows,#block-ids').count(),0);
  await f.frame.locator('#publish-id').fill('preserved-draft');await f.frame.locator('#refresh').click();await f.frame.locator('#account-state').filter({hasText:'未登录'}).waitFor();assert.equal(await f.frame.locator('#publish-id').inputValue(),'preserved-draft');
  const beforePublish=f.writes.length;await f.frame.locator('#publish').click();await f.frame.locator('#publish-note').filter({hasText:'已登录的账号'}).waitFor();assert.equal(f.writes.length,beforePublish);
  assert.equal(seen.includes('/api/community/blocklist'),false);
  for(const width of [1450,960,640]){await f.page.setViewportSize({width,height:884});assert.equal(await f.frame.locator('body').evaluate(body=>Math.max(body.scrollWidth,body.ownerDocument.documentElement.scrollWidth)-body.ownerDocument.documentElement.clientWidth),0);await f.page.screenshot({path:path.join(evidence,'community-'+width+'.png')});}
  check('community opens account/publish directly, removed tabs absent, refresh preserves draft, narrow layouts fit');
  const denied=await f.frame.locator('body').evaluate(async()=>{const {request}=await import('/panels/panel-client.js'),out=[];for(const [method,url]of [['POST','/api/market/verify'],['POST','/api/market/install'],['GET','/api/community/blocklist'],['POST','/api/community/blocklist']]){try{await request(method,url,{});out.push('allowed');}catch(e){out.push(e.code);}}return out;});assert.deepEqual(denied,[-32003,-32003,-32003,-32003]);
  for(const file of ['code-install-state.js','code-install-view.js'])assert.equal((await fetch(f.base+'/panels/community/'+file)).status,404);
  assert.equal(client.verify,undefined);assert.equal((await f.request('POST','/api/market/verify',{code:'PLUGIN270'})).status,404);
  const calls=upstream.length;for(const body of [{code:'PLUGIN270'},{code:'PLUGIN270',kind:'plugin',id:id('plugin')},{id:id('plugin')},{id:'../escape',kind:'plugin'}])assert.equal((await f.request('POST','/api/market/install',body)).status,400);assert.equal(upstream.length,calls);
  check('removed modules/verify route/service method unavailable, community RPC grants revoked, direct code installs reject before network');
  for(const state of ['pending','missing','duplicate','offline','changed','wrong-kind']){mode=state;const r=await f.request('POST','/api/market/install',{id:id('plugin'),kind:'plugin'});assert.ok([409,502].includes(r.status),state+': '+JSON.stringify(r));assert.equal(downloads.length,0);}
  check('fresh catalog rejects unpublished/removed/duplicate/offline/changed entries before download');
  mode='ok';
  for(const kind of ['skill','plugin']){
    await f.page.locator('#nav button[data-panel='+kind+'s]').click();await f.frame.locator('#tab-market').click();const card=f.frame.locator('[data-market-id="'+id(kind)+'"]');await card.waitFor();await card.getByRole('button').click();await f.frame.locator('dialog[open]').getByRole('button',{name:'确认',exact:true}).click();await f.frame.locator('#market-install-status').filter({hasText:'默认停用，未执行代码'}).waitFor();
    const sent=f.writes.filter(x=>x.path==='/api/market/install').at(-1);assert.deepEqual(sent.body,{id:id(kind),kind});assert.equal(f.disk().skills[id(kind)].enabled,false);assert.ok(fs.existsSync(path.join(f.appRoot,kind+'s',id(kind),kind+'.json')));assert.equal(globalThis[marker],undefined);assert.equal(await card.getByRole('button').isDisabled(),true);
  }
  assert.deepEqual(downloads,['SKILL270','PLUGIN270']);check('both catalog panels still use actual ZIP installer, directory IDs only, newly installed extensions stay disabled and unexecuted');
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);assert.equal(f.modelRequests.length,0);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks,errors:f.errors,externalRequests:f.outbound(),modelRequests:f.modelRequests.length,protectedPageAccessed:false},null,2));
}catch(error){if(f){fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({message:error.message,upstream,errors:f.errors,body:await f.frame.locator('body').textContent().catch(()=>''),writes:f.writes},null,2));await f.page.screenshot({path:path.join(evidence,'failure.png')});}throw error;}finally{await f?.close();delete globalThis[marker];}

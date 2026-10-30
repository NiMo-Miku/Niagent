import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {financeFixture,workspace,until} from './settings-finance-fixture.mjs';
import {allChatsAllowed,chatAllowed} from '../src/kernel/chat-access.js';
import {allChatsAllowed as browserAll} from '../ui/panels/chat-access.js';
import {createListChoiceDraft} from '../ui/panels/settings/list-choice.js';
import {chooseStartupTarget} from '../ui/shell/startup-navigation.js';
const f=await financeFixture(266),result={kind:'independent-allow-all',headed:process.env.QA_HEADED==='1'};
const artifacts=path.join(workspace,'.qa-local/allow-all-kinds-20261019',result.headed?'headed':'headless');fs.mkdirSync(artifacts,{recursive:true});let release;
const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Allow-all gate timed out')),10000))]);}finally{clearTimeout(timer);}};
try{
  for(const legacy of [false,true])for(const flag of [undefined,false,true,null,'true'])for(const kind of ['group','private'])for(const values of [[],['123']]){
    const cfg={allow:{groups:values,private:values,[kind==='group'?'allGroups':'allPrivate']:flag},allowAllWhenEmpty:legacy};
    assert.equal(allChatsAllowed(cfg,kind),browserAll(cfg,kind));assert.equal(allChatsAllowed(cfg,kind),flag===undefined?legacy&&!values.length:flag===true);
  }
  const draft=createListChoiceDraft(['123']);draft.chooseAll(true);const sent=draft.beginCommit();assert.equal(sent.allowAll,true);draft.chooseAll(false);assert.equal(draft.acceptCommit(sent).close,false);assert.equal(draft.beginCommit().allowAll,false);draft.close();
  const panels=[{id:'sessions',kind:'bundled',navigation:{source:'defaults',home:true}},{id:'settings',kind:'bundled',navigation:{role:'configuration',sections:['access','models']}}],api={baseUrl:'https://synthetic.invalid/v1',model:'synthetic'};
  assert.equal(chooseStartupTarget({panels,config:{api,allow:{allGroups:true}}}),null);assert.deepEqual(chooseStartupTarget({panels,config:{api,allow:{allGroups:false,allPrivate:false},allowAllWhenEmpty:true}}),{id:'settings',section:'access'});
  f.check('per-kind flags and legacy absence agree across browser/runtime; malformed flags fail closed; draft receipt preserves later policy and startup sees independent admission');

  await f.start(true);f.kernel.config.update({allow:{groups:['123'],private:['456']},allowAllWhenEmpty:false});
  for(const key of ['group:123','group:222','private:456','private:777']){f.kernel.store.appendIncoming(key,{senderId:'30001',text:`synthetic archive ${key}`});f.kernel.memory.replaceMember(key,{userId:'30001',name:'合成成员',impressions:['合成记忆']});}
  const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),raw=[];
  for(const folder of ['messages','memory'])for(const name of fs.readdirSync(path.join(f.dataDir,folder))){const file=path.join(f.dataDir,folder,name);if(fs.statSync(file).isFile())raw.push({file,sha256:hash(file)});}
  await f.browser();await f.open();await f.section('access');const frame=f.frame,picker=()=>frame.locator('dialog.settings-list-choice'),field=kind=>frame.locator(`[data-config-path="allow.${kind==='groups'?'groups':'private'}"]`);
  const open=async kind=>{await frame.getByRole('button',{name:kind==='groups'?'从QQ 群列表选择':'从好友列表选择',exact:true}).click();await picker().waitFor();};
  const toggle=kind=>picker().getByRole('switch',{name:kind==='groups'?'允许所有群聊':'允许所有私聊'});
  const save=async()=>{await picker().getByRole('button',{name:'保存设置',exact:true}).click();await picker().waitFor({state:'detached'});await frame.locator('body').evaluate(async()=>{await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished));});};
  assert.equal(await frame.locator('[data-config-path=allowAllWhenEmpty]').isVisible(),false);assert.equal(await field('groups').isVisible(),true);assert.equal(await field('friends').isVisible(),true);
  const allowGroup=frame.locator('[data-settings-label="准入白名单"]');assert.equal(await allowGroup.locator('.settings-fields > .actions').getByRole('button').count(),2);
  const diskBefore=fs.readFileSync(f.kernel.config.file,'utf8');await open('groups');await toggle('groups').click();await picker().getByRole('button',{name:'取消',exact:true}).click();assert.equal(fs.readFileSync(f.kernel.config.file,'utf8'),diskBefore);
  await open('groups');assert.equal(await toggle('groups').getAttribute('aria-checked'),'false');await toggle('groups').focus();await f.page.keyboard.press('Enter');await picker().getByRole('searchbox',{includeHidden:true}).waitFor({state:'hidden'});assert.equal(await picker().getByRole('searchbox').isVisible(),false);await picker().screenshot({path:path.join(artifacts,'groups-all-dialog.png')});await save();
  assert.equal(f.disk().allow.allGroups,true);assert.notEqual(f.disk().allow.allPrivate,true);assert.deepEqual(f.disk().allow.groups,['123']);assert.deepEqual(f.disk().allow.private,['456']);assert.equal(await field('groups').isVisible(),false);assert.equal(await field('friends').isVisible(),true);
  const chats=async()=>(await f.api('GET','/api/chats?scope=allowlist')).body.chats.map(row=>row.chatKey).sort(),memories=async()=>(await f.api('GET','/api/memory-files?scope=allowlist')).body.files.map(row=>row.chatKey).sort();
  assert.deepEqual(await chats(),['group:123','group:222','private:456']);assert.deepEqual(await memories(),['group:123','group:222','private:456']);
  await open('friends');assert.equal(await toggle('friends').getAttribute('aria-checked'),'false');await toggle('friends').click();await picker().screenshot({path:path.join(artifacts,'private-all-dialog.png')});await save();assert.equal(await field('friends').isVisible(),false);assert.equal(await field('groups').isVisible(),false);assert.deepEqual(await chats(),['group:123','group:222','private:456','private:777']);await frame.locator('#section-access').screenshot({path:path.join(artifacts,'both-all-main.png')});
  await open('groups');await toggle('groups').click();await save();assert.equal(await field('groups').isVisible(),true);assert.equal(await field('groups').inputValue(),'123');assert.equal(await field('friends').isVisible(),false);assert.deepEqual(await chats(),['group:123','private:456','private:777']);
  assert.equal((await f.api('GET','/api/chats/group_222/messages?scope=allowlist')).status,404);assert.equal((await f.api('GET','/api/memory-files/private_777?scope=allowlist')).status,200);
  f.check('real dialogs put the independent buttons first; cancel writes nothing; saved all mode hides only its own input, retains lists and updates scoped memory/archive visibility');

  const received=async(kind,id)=>f.kernel.ingest.ingestMessage({kind,id,event:{user_id:'30002',raw_message:'synthetic admission',message_id:Number(id),time:1}});
  assert.equal((await received('group','999')).accepted,false);assert.equal((await received('private','999')).accepted,true);f.kernel.config.update({deny:{private:['998']}});assert.equal((await received('private','998')).accepted,false);
  const sends=[];f.kernel.services.get('transport.provider').send=async(key,segments)=>{sends.push({key,segments});return[{msgId:'synthetic-266'}];};
  assert.equal((await f.api('POST','/api/chats/group_999/test-send',{text:'synthetic'})).status,403);assert.equal((await f.api('POST','/api/chats/private_999/test-send',{text:'synthetic'})).status,200);assert.equal((await f.api('POST','/api/chats/private_998/test-send',{text:'synthetic'})).status,403);assert.equal(sends.length,1);
  for(const item of raw)assert.equal(hash(item.file),item.sha256,'all-mode changes preserve existing archive and memory files');
  f.check('actual ingress and authenticated send obey independent modes with deny precedence; selected lists and existing memory/archive remain intact');

  await open('friends');await toggle('friends').click();await save();assert.equal(await field('friends').inputValue(),'456');
  await f.page.route(f.base+'/api/onebot/friends',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'synthetic offline list'})}));await open('friends');await toggle('friends').click();f.fault(true);await picker().getByRole('button',{name:'保存设置',exact:true}).click();await picker().locator('[role=status]').filter({hasText:'服务器内部错误'}).waitFor();assert.equal(f.disk().allow.allPrivate,false);assert.equal(await toggle('friends').getAttribute('aria-checked'),'true');f.fault(false);await toggle('friends').click();await save();assert.equal(f.disk().allow.allPrivate,false);assert.equal(await field('friends').isVisible(),true);await f.page.unroute(f.base+'/api/onebot/friends');
  let entered;const began=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);await f.page.route(f.base+'/api/config/lifecycle',async route=>{const body=route.request().postDataJSON();if(body?.patch?.allow?.allGroups!==true)return route.continue();const response=await route.fetch();entered();await gate;await route.fulfill({response});});
  await open('groups');await toggle('groups').click();await picker().getByRole('button',{name:'保存设置',exact:true}).click();await bounded(began);await toggle('groups').click();release();release=null;await picker().locator('[role=status]').filter({hasText:'尚未保存'}).waitFor();assert.equal(f.disk().allow.allGroups,true);assert.equal(await toggle('groups').getAttribute('aria-checked'),'false');await save();await f.page.unroute(f.base+'/api/config/lifecycle');assert.equal(f.disk().allow.allGroups,false);assert.equal(await field('groups').inputValue(),'123');
  await f.returnSettings();await f.section('access');assert.equal(await field('groups').isVisible(),true);assert.equal(await field('friends').isVisible(),true);await f.page.setViewportSize({width:560,height:860});await open('friends');await toggle('friends').click();await picker().screenshot({path:path.join(artifacts,'narrow-dialog.png')});assert.equal(await picker().evaluate(el=>el.getBoundingClientRect().right<=innerWidth+1&&el.getBoundingClientRect().left>=0),true);await f.page.keyboard.press('Escape');assert.equal(f.disk().allow.allPrivate,false);
  f.check('offline lists do not block explicit policy changes; failed atomic save/revert and newer toggle during delayed receipt remain correct; reload, Escape and narrow layout retain settings');
  assert.deepEqual(f.errors,[]);assert.deepEqual(f.blocked,[]);result.execution='passed';
}catch(error){result.execution='failed';result.error={message:error.message,stack:error.stack};throw error;}
finally{release?.();await f.close(result);fs.writeFileSync(path.join(artifacts,'result.json'),JSON.stringify(result,null,2)+'\n');}

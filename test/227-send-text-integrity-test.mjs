// Real text queue/tools/reminder stores and boot composition, with inert IO only.
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
import {pathToFileURL} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
import {mdToPlain, splitText, normalizeSplitLimit, prepareTextBatch} from '../src/kernel/send-text.js';
import {createSendQueue} from '../src/kernel/send.js';
import {createApplication} from '../src/kernel/composition.js';
import {defaultComponents} from '../bundled/runtime-defaults/components.js';
import {createOneBotProvider} from '../bundled/transport-onebot/provider.js';

const workspace=path.resolve(import.meta.dirname,'..');
const log={info(){},warn(){},error(){}};
function queue({components,send,patch={}}={}){
  const calls=[],saved=[],events=[];
  const config={send:{minGapMs:200,maxGapMs:200,byLengthMs:1,hardSplitAt:4,dedupeWindowMs:0,...patch}};
  const instance=createSendQueue({components,cfg:()=>config,log,
    transport:{async send(chatKey,segments,options){const call={chatKey,segments:structuredClone(segments),reply:options.replyToMessageId};calls.push(call);if(send)await send(call,calls.length);return{msgId:calls.length};}},
    store:{appendSelf:(key,value)=>saved.push({key,...value})},bus:{emit:(...args)=>events.push(args)},
  });
  return{send:instance,calls,saved,events,config};
}
const texts=calls=>calls.flatMap(call=>call.segments.filter(segment=>segment.type==='text').map(segment=>segment.text));
function scheduler({dataDir,send,components=defaultComponents,cfg,dueAt}){
  const timers=new Map(),reminders=defaultComponents['data.reminders']({dataDir,log});
  const orchestrator=components['core.orchestrator']({cfg,send,components,log,sessions:{},now:()=>dueAt+1,
    setTimeoutFn:(fn,ms)=>{const token={unref(){}};timers.set(token,{fn,ms});return token;},clearTimeoutFn:token=>timers.delete(token)});
  orchestrator.startReminderLoop(reminders);
  return{orchestrator,reminders,timers,async tick(){const[token,task]=[...timers][0];timers.delete(token);await task.fn();},stop(){orchestrator.stop();assert.equal(timers.size,0);}};
}

test('227 text integrity reaches real queues, reminder recovery and added/disabled components',{timeout:45000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-text227-')),restores=[],blocked=[];
  const deny=(object,key)=>{const original=object[key];restores.push(()=>object[key]=original);object[key]=()=>{blocked.push(key);throw Error('227 forbids external IO: '+key);};};
  deny(globalThis,'fetch');deny(dns,'lookup');deny(dnsPromises,'lookup');
  for(const object of[http,https])for(const key of['request','get'])deny(object,key);
  for(const key of['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(childProcess,key);
  syncBuiltinESMExports();
  t.after(()=>{for(const restore of restores.reverse())restore();syncBuiltinESMExports();assert.deepEqual(blocked,[]);assert.equal(path.dirname(path.resolve(root)).toLowerCase(),path.resolve(os.tmpdir()).toLowerCase());assert.ok(path.basename(root).startsWith('qqa-text227-'));fs.rmSync(root,{recursive:true,force:true});});

  await t.test('literal identifiers, URLs, CQ, quotes and JSON survive presentation cleanup',()=>{
    for(const value of['foo_bar_baz','foo__bar__baz','成员_标签_名称','https://synthetic.invalid/_a_b_?q=x_y_z#one_two','file:///C:/a_b_c.png','www.synthetic.invalid/_literal_/a_b','[CQ:image,file=my_image_01.png]','"Hello quoted text"','{"text":"literal_value_01"}','["first line","second line"]',String.raw`\_literal\_`])assert.equal(mdToPlain(value),value,value);
    assert.equal(mdToPlain('**粗** _斜_ `码`'),'粗 斜 码');
    assert.equal(mdToPlain('## 标题\n内容'),'标题\n内容');
    assert.equal(mdToPlain('__粗体__ 和 _斜体_'),'粗体 和 斜体');
    assert.equal(mdToPlain('`const user_id = "x_y"; *literal*`'),'const user_id = "x_y"; *literal*');
    assert.equal(mdToPlain('```js\nconst user_id = "x_y"; // *literal*\n```'),'const user_id = "x_y"; // *literal*');
    assert.equal(mdToPlain('~~~text\r\nfoo_bar_baz\r\n~~~'),'foo_bar_baz');
  });

  await t.test('the shared splitter is bounded, lossless and keeps complete Unicode code points',()=>{
    const value='a'.repeat(3999)+'😀 tail';assert.deepEqual(splitText(value).map(part=>part.length),[3999,7]);
    for(const input of[value,'aaa😀Z','中文😀_e\u0301 👩‍👩‍👧‍👦 末尾','a  b\n c'])for(const limit of[0,1,2,3,4,7,4000,-1,NaN,Infinity,0.5,1.9]){
      const parts=splitText(input,limit),effective=normalizeSplitLimit(limit);assert.equal(parts.join(''),input);assert.ok(parts.every(part=>part.isWellFormed()));
      if(effective)assert.ok(parts.every(part=>part.length<=effective||(effective===1&&[...part].length===1&&part.length===2)));
    }
    assert.throws(()=>splitText('broken\ud83d',4),/Unicode/);
  });

  await t.test('converters and splitters cannot silently drop, stringify or corrupt message data',()=>{
    for(const input of['   ',{},['ok',{}],[],null,'[object Object]','broken\ude00'])assert.throws(()=>prepareTextBatch(input));
    assert.throws(()=>prepareTextBatch('ok',{plainText:async()=> 'wrong'}),/同步返回字符串/);
    assert.throws(()=>prepareTextBatch('ok',{plainText:async()=>{throw Error('late converter rejection');}}),/同步返回字符串/);
    for(const split of[()=>[],()=>['changed'],()=>Promise.resolve(['ok']),()=>['o\ud83d','\ude00k']])assert.throws(()=>prepareTextBatch('ok',{split}),/切分器|Unicode/);
    assert.throws(()=>prepareTextBatch('ok',{split:async()=>{throw Error('late splitter rejection');}}),/切分器/);
    assert.throws(()=>prepareTextBatch('[object Object]',{plainText:()=> 'masked'}),/object Object/);
    assert.deepEqual(prepareTextBatch([1,null,' text ']),['1','text']);
  });

  await t.test('default4000 physical sends preserve emoji, reply/mention placement and successful accounting',async()=>{
    const e=queue({patch:{hardSplitAt:4000}}),input='a'.repeat(3999)+'😀 tail';
    const result=await e.send.sendTextBatch('group:227-boundary',input,{replyToMessageId:'227',atUserId:'228'});
    assert.equal(result.ok,true);assert.deepEqual(texts(e.calls).map(part=>part.length),[3999,7]);assert.equal(texts(e.calls).join(''),input);assert.ok(texts(e.calls).every(part=>part.isWellFormed()));
    assert.deepEqual(e.calls.map(call=>call.reply),['227',null]);assert.deepEqual(e.calls.map(call=>call.segments.filter(part=>part.type==='at').length),[1,0]);
    assert.equal(e.saved.length,2);assert.equal(e.events.length,2);
  });

  await t.test('literal CQ remains a text segment through the actual OneBot encoder',async()=>{
    const calls=[];class OfflineClient{async call(action,params){calls.push({action,params});return{retcode:0,status:'ok',data:{message_id:227}};}}
    const provider=createOneBotProvider({cfg:()=>({}),clientFactory:OfflineClient,log});
    const send=createSendQueue({transport:provider,log,cfg:()=>({send:{hardSplitAt:0,dedupeWindowMs:0}})});
    await send.sendTextBatch('group:227','literal [CQ:image,file=my_image_01.png]');
    assert.deepEqual(calls[0].params.message,[{type:'text',data:{text:'literal [CQ：image,file=my_image_01.png]'}}]);
    assert.equal(calls[0].action,'send_group_msg');
  });

  await t.test('prepared fragments skip presentation and splitting but retain whitespace and validation',async()=>{
    let conversions=0,splits=0;
    const components={'core.text.plain':text=>{conversions++;return`P[${text}]`;},'core.text.split':text=>{splits++;return splitText(text,3);}};
    const fragments=prepareTextBatch('a  b',{plainText:components['core.text.plain'],split:components['core.text.split']});
    const e=queue({components});await e.send.sendTextBatch('group:227',fragments,{textFormat:'prepared'});
    assert.equal(texts(e.calls).join(''),'P[a  b]');assert.deepEqual(texts(e.calls),fragments);assert.equal(conversions,1);assert.equal(splits,1);
    const whitespace=queue({patch:{dedupeWindowMs:8000}});
    await whitespace.send.sendTextBatch('group:227',['aa',' ','aa',' ','bb'],{textFormat:'prepared'});
    assert.deepEqual(texts(whitespace.calls),['aa',' ','aa',' ','bb'],'equal and whitespace-only plan fragments are actual physical messages');
    await assert.rejects(e.send.sendTextBatch('group:227','\ud83d',{textFormat:'prepared'}),/Unicode/);
    await assert.rejects(e.send.sendTextBatch('group:227','[object Object]',{textFormat:'prepared'}),/object Object/);
  });

  await t.test('partial failure and dedupe retain acknowledged chunks, then retry only the unsent physical suffix',async()=>{
    let fail=true;const e=queue({patch:{hardSplitAt:2,dedupeWindowMs:8000},send:(_call,n)=>{if(fail&&n===2){fail=false;throw Error('227 second chunk failed');}}});
    const first=await e.send.sendTextBatch('group:227','abcdef');assert.equal(first.ok,false);assert.equal(first.sent.length,1);assert.equal(first.failed[0].index,1);assert.equal(e.saved.length,1);
    const retry=await e.send.sendTextBatch('group:227','abcdef',{replyToMessageId:'retry'});assert.equal(retry.ok,true);assert.deepEqual(texts(e.calls),['ab','cd','cd','ef']);assert.equal(e.saved.map(item=>item.text).join(''),'abcdef');
    assert.deepEqual(e.calls.slice(2).map(call=>call.reply),['retry',null]);
  });

  await t.test('cancellation after an acknowledgement stops the suffix and a rejected first send consumes no quota',async()=>{
    const abort=new AbortController(),e=queue({patch:{hardSplitAt:2},send:()=>abort.abort()});
    const cancelled=await e.send.sendTextBatch('group:227','abcdef',{signal:abort.signal});assert.equal(cancelled.aborted,true);assert.equal(cancelled.sent.length,1);assert.equal(e.calls.length,1);assert.equal(e.saved.length,1);
    let fail=true;const quota=queue({patch:{hardSplitAt:0,maxPerMinute:1},send:()=>{if(fail){fail=false;throw Error('227 initial rejection');}}});
    await assert.rejects(quota.send.sendTextBatch('group:227','first'),/initial rejection/);assert.equal(quota.saved.length,0);
    assert.equal((await quota.send.sendTextBatch('group:227','second')).ok,true);await assert.rejects(quota.send.sendTextBatch('group:227','third'),/每分钟上限/);assert.equal(quota.saved.length,1);
  });

  for(const mode of['default','appended','disabled'])await t.test(`actual added text components and reminder disk recovery: ${mode}`,async()=>{
    const appRoot=path.join(root,mode),dataDir=path.join(appRoot,'data'),layer=path.join(appRoot,'overrides/20-text');fs.mkdirSync(layer,{recursive:true});
    for(const directory of['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,directory));
    fs.writeFileSync(path.join(appRoot,'package.json'),'{"type":"module"}');
    for(const name of['core-tools','system-tools'])fs.cpSync(path.join(workspace,'bundled',name),path.join(appRoot,'bundled',name),{recursive:true});
    fs.mkdirSync(path.join(appRoot,'src/kernel'),{recursive:true});fs.copyFileSync(path.join(workspace,'src/kernel/holidays.js'),path.join(appRoot,'src/kernel/holidays.js'));
    fs.writeFileSync(path.join(layer,'text.mjs'),`import {splitText} from ${JSON.stringify(pathToFileURL(path.join(workspace,'src/kernel/send-text.js')).href)};
export function plain(text){plain.calls++;return '<'+text+'>';};plain.calls=0;
export function split(text){split.calls++;return splitText(text,3);};split.calls=0;`);
    const manifest={version:1,id:'text-integrity227',components:{'core.text.plain':{module:'./text.mjs',export:'plain'},'core.text.split':{module:'./text.mjs',export:'split'}}};
    if(mode!=='default')fs.writeFileSync(path.join(layer,'composition.json'),JSON.stringify({...manifest,enabled:mode!=='disabled'}));
    const calls=[],successes=[];let failAt=null,starts=0,stops=0,app,clock;
    try{
      app=await createApplication({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_MIGRATE_FROM:path.join(root,'absent')},
        components:{'runtime.logger':options=>defaultComponents['runtime.logger']({...options,mirrorConsole:false})},
        transport:{id:'inert227',start(){starts++;},stop(){stops++;},actions:{},async send(chatKey,segments){const call={chatKey,segments:structuredClone(segments)};calls.push(call);if(calls.length===failAt)throw Error('227 controlled reminder chunk failure');successes.push(call);return{msgId:calls.length};}},
        priceUpdates:{refresh:async()=>({ok:true,remote:false}),resolve:()=>null},fetchImpl:globalThis.fetch});
      app.config.update({telemetry:{enabled:false},proactive:{enabled:false},memory:{consolidateEnabled:false},send:{hardSplitAt:4,minGapMs:200,maxGapMs:200,byLengthMs:1,dedupeWindowMs:0}});
      await app.loader.loadAll();await app.services.start();assert.deepEqual(app.loader.listEntries().map(entry=>entry.id).sort(),['core-tools','system-tools']);assert.equal(app.httpServer.port,null);
      for(const key of['core.text.plain','core.text.split'])assert.equal(app.composition.owners[key],mode==='appended'?'text-integrity227':'defaults');
      const context={chatKey:'group:227-tools',senderId:'227',session:{id:'227',sent:[]},signal:new AbortController().signal};
      const invoke=(name,args)=>app.components['core.tools.bundle']({c:app.config.get()},{registry:app.registry,loader:app.loader}).invoke(name,args,context);
      const plain=app.components['core.text.plain'],split=app.components['core.text.split'];
      const ordinary=await invoke('send_message',{messages:'a_b_c'});assert.equal(ordinary.ok,true);const expectedOrdinary=mode==='appended'?'<a_b_c>':'a_b_c';assert.equal(texts(successes).join(''),expectedOrdinary);
      if(mode==='appended'){assert.equal(plain.calls,1);assert.equal(split.calls,1);assert.ok(texts(successes).every(part=>part.length<=3));}
      const reminderText='aaa😀 b',created=await invoke('set_reminder',{text:reminderText,delayMinutes:1});assert.equal(created.ok,true);assert.equal(created.result.ok,true);
      const {id,dueAt}=created.result.result,expected=mode==='appended'?`<${reminderText}>`:reminderText,start=successes.length;
      failAt=calls.length+2;clock=scheduler({dataDir,send:app.send,components:app.components,cfg:()=>app.config.get(),dueAt});await clock.tick();
      const pending=clock.reminders.pending(context.chatKey).find(item=>item.id===id);assert.ok(pending);assert.ok(pending.pendingTexts?.length);assert.ok(pending.pendingTexts.every(part=>part.isWellFormed()));
      const acknowledged=texts(successes.slice(start));assert.equal(acknowledged.length,1);assert.equal(acknowledged.join('')+pending.pendingTexts.join(''),expected);
      if(mode==='appended'){assert.equal(plain.calls,2);assert.equal(split.calls,2);}
      clock.stop();clock=null;failAt=null;
      // New scheduler and ReminderStore objects read the actual saved suffix.
      clock=scheduler({dataDir,send:app.send,components:app.components,cfg:()=>app.config.get(),dueAt});await clock.tick();
      assert.equal(texts(successes.slice(start)).join(''),expected);assert.ok(texts(successes.slice(start)).every(part=>part.isWellFormed()));
      assert.equal(clock.reminders.load().find(item=>item.id===id).fired,true);assert.equal(clock.reminders.pending(context.chatKey).length,0);
      if(mode==='appended'){assert.equal(plain.calls,2,'a disk retry does not rerun a non-idempotent converter');assert.equal(split.calls,2,'saved physical fragments are not split again');}
      assert.equal(app.store.recent(context.chatKey,100).filter(item=>item.self).map(item=>item.text).join(''),expectedOrdinary+expected);
    }finally{clock?.stop();await app?.stop();}
    assert.equal(starts,1);assert.equal(stops,1);
  });

  await t.test('a rejected first reminder chunk retains one prepared plan across actual disk reload',async()=>{
    const dataDir=path.join(root,'first-rejection');fs.mkdirSync(dataDir);const reminders=defaultComponents['data.reminders']({dataDir,log});
    const reminder=reminders.add({chatKey:'group:227-first',text:'a  b',dueAt:1});let conversions=0,splits=0,clock,fail=true;
    const components={...defaultComponents,'core.text.plain':text=>`P${++conversions}[${text}]`,'core.text.split':text=>{splits++;return splitText(text,3);}};
    const e=queue({components,send:()=>{if(fail){fail=false;throw Error('227 first chunk rejected');}}});
    try{
      clock=scheduler({dataDir,send:e.send,components,cfg:()=>e.config,dueAt:1});await clock.tick();
      const pending=clock.reminders.pending()[0];assert.ok(pending.pendingTexts?.length);assert.equal(pending.pendingTexts.join(''),'P1[a  b]');assert.equal(e.saved.length,0);assert.equal(conversions,1);assert.equal(splits,1);clock.stop();
      clock=scheduler({dataDir,send:e.send,components,cfg:()=>e.config,dueAt:1});await clock.tick();
      assert.equal(e.saved.map(item=>item.text).join(''),'P1[a  b]');assert.equal(conversions,1);assert.equal(splits,1);assert.equal(clock.reminders.load().find(item=>item.id===reminder.id).fired,true);
    }finally{clock?.stop();}
  });

  await t.test('an actual reminder-plan disk fault refuses the first external send and leaves the reminder pending',async()=>{
    const dataDir=path.join(root,'plan-write-fault');fs.mkdirSync(dataDir);const reminders=defaultComponents['data.reminders']({dataDir,log});
    const reminder=reminders.add({chatKey:'group:227-disk-fault',text:'aaa😀 b',dueAt:1}),before=fs.readFileSync(path.join(dataDir,'reminders.json'));
    const blockedTemp=path.join(dataDir,`reminders.json.${process.pid}.tmp`);fs.mkdirSync(blockedTemp);
    const e=queue();let clock;
    try{
      clock=scheduler({dataDir,send:e.send,cfg:()=>e.config,dueAt:1});await clock.tick();
      assert.equal(e.calls.length,0);assert.ok(fs.readFileSync(path.join(dataDir,'reminders.json')).equals(before));assert.equal(clock.reminders.pending()[0].id,reminder.id);clock.stop();
      fs.rmdirSync(blockedTemp);clock=scheduler({dataDir,send:e.send,cfg:()=>e.config,dueAt:1});await clock.tick();
      assert.equal(e.saved.map(item=>item.text).join(''),reminder.text);assert.equal(clock.reminders.load()[0].fired,true);
    }finally{clock?.stop();if(fs.existsSync(blockedTemp))fs.rmdirSync(blockedTemp);}
  });

  await t.test('stopping a reminder between physical chunks persists its unsent suffix for a fresh scheduler',async()=>{
    const dataDir=path.join(root,'cancel-reminder');fs.mkdirSync(dataDir);const reminders=defaultComponents['data.reminders']({dataDir,log});
    const reminder=reminders.add({chatKey:'group:227-cancel',text:'aaa😀 b',dueAt:1}),calls=[],successes=[];let clock,stopAfterFirst=true;
    const cfg=()=>({send:{hardSplitAt:4,minGapMs:200,maxGapMs:200,byLengthMs:1,dedupeWindowMs:0}});
    const send=createSendQueue({cfg,log,transport:{async send(key,segments){calls.push({key,segments:structuredClone(segments)});successes.push(calls.at(-1));if(stopAfterFirst){stopAfterFirst=false;clock.orchestrator.stopReminderLoop();}return{msgId:calls.length};}}});
    try{
      clock=scheduler({dataDir,send,cfg,dueAt:1});await clock.tick();const pending=clock.reminders.pending()[0];assert.equal(calls.length,1);assert.ok(pending.pendingTexts?.length);assert.equal(pending.fired,false);clock.stop();
      clock=scheduler({dataDir,send,cfg,dueAt:1});await clock.tick();assert.equal(texts(successes).join(''),reminder.text);assert.equal(clock.reminders.load()[0].fired,true);
    }finally{clock?.stop();}
  });
});

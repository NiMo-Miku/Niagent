// Cold persisted fixtures deliberately put old members first in filename order.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createMemoryStore} from '../src/kernel/memory.js';

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-memory-order206-'));
const files=new Map(),key='group:10001',log={warn(){},error(){}};
function seed(chatKey,userId,updatedAt,impressions,name=`成员${userId}`){
  const dir=path.join(dataDir,'memory',chatKey.replace(':','_'));fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,`${userId}.json`),raw=JSON.stringify({userId,name,updatedAt,lastConsolidatedAt:0,impressions});
  fs.writeFileSync(file,raw);files.set(file,raw);
}
try{
  for(let n=1;n<=18;n++)seed(key,String(20000+n),n*100,Array.from({length:4},(_,i)=>({content:`事实${n}-${i+1}`,createdAt:i+1})));
  seed(key,'20019',100000,[],'空成员保留');
  seed(key,'20020','invalid',[{content:'无效时间的事实',createdAt:1}]);
  seed('group:10002','30001',9,[{content:'并列甲',createdAt:1}]);
  seed('group:10002','30002',9,[{content:'并列乙',createdAt:1}]);
  seed('group:10002','30003',null,[{content:'未知时间',createdAt:1}]);
  seed('group:10002','30004','invalid',[{content:'无效时间',createdAt:1}]);
  let memory=createMemoryStore({dataDir,log,cfg:()=>({memberNotes:{20018:'最近成员备注'}})});
  const nonempty=()=>memory.query(key).filter(member=>member.impressions.length).map(member=>member.userId);
  const recent=Array.from({length:18},(_,i)=>String(20018-i));
  assert.deepEqual(nonempty(),[...recent,'20020'],'cold query sorts members by recency rather than filename/insertion');
  assert.equal(memory.query(key).length,20,'empty member query visibility is preserved');
  assert.equal(memory.stats(key).members,20,'empty members remain counted');
  assert.equal(memory.listFiles().find(file=>file.chatKey===key).memberCount,20);
  assert.deepEqual(memory.query(key,{userId:'20001'})[0].impressions.map(item=>item.content),['事实1-4','事实1-3','事实1-2','事实1-1'],'each member query still shows newest impressions first');
  assert.deepEqual(memory.query('group:10002').map(member=>member.userId),['30001','30002','30003','30004'],'equal/invalid timestamps have a stable order');
  const prompt=memory.formatForPrompt(key),lines=prompt.split('\n').slice(1);
  assert.equal(lines.length,45,'exactly fifteen nonempty members with three impressions each');
  assert.ok(lines[0].startsWith('- 最近成员备注：事实18-2'),'the newest member and live display note come first');
  for(let n=4;n<=18;n++)assert.ok(prompt.includes(`事实${n}-4`),`recent member ${n} is included`);
  for(let n=1;n<=3;n++)assert.ok(!prompt.includes(`事实${n}-`),`older member ${n} does not consume a prompt slot`);
  assert.ok(!prompt.includes('空成员保留')&&!prompt.includes('无效时间的事实'));
  assert.deepEqual(lines.slice(0,3).map(line=>line.split('：')[1]),['事实18-2','事实18-3','事实18-4'],'prompt keeps the latest three in chronological order');
  const filtered=memory.formatForPrompt(key,{userIds:['20001','20018']});
  assert.deepEqual(filtered.split('\n').slice(1).map(line=>line.split('：')[0]),['- 最近成员备注','- 最近成员备注','- 最近成员备注','- 成员20001','- 成员20001','- 成员20001'],'related-member filtering precedes the recency cap');
  for(const [file,raw] of files)assert.equal(fs.readFileSync(file,'utf8'),raw,'reads and sorting never rewrite persisted order/data');

  memory.replaceMember(key,{userId:'20001',name:'刚编辑的成员',impressions:[{content:'编辑事实早',createdAt:10},{content:'编辑事实晚',createdAt:20}]});
  assert.equal(memory.query(key)[0].userId,'20001','an edit immediately moves a formerly old member to the front');
  assert.ok(memory.formatForPrompt(key).split('\n')[1].startsWith('- 刚编辑的成员：'));
  memory=createMemoryStore({dataDir,log});
  assert.equal(memory.query(key)[0].userId,'20001','the new order survives an actual disk reread');
  assert.deepEqual(memory.query(key,{userId:'20001'})[0].impressions.map(item=>item.content),['编辑事实晚','编辑事实早']);
  const disk=JSON.parse(fs.readFileSync(path.join(dataDir,'memory','group_10001','20001.json'),'utf8'));
  assert.deepEqual(disk.impressions.map(item=>item.content),['编辑事实早','编辑事实晚'],'persistent impression order remains chronological');
  console.log('✓ 206 memory order: cold and warm recency, stable invalid times, recent fifteen prompt members, empty-member compatibility, impression direction and actual disk reread');
}finally{
  assert.equal(path.dirname(path.resolve(dataDir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dataDir).startsWith('qqa-memory-order206-'));
  fs.rmSync(dataDir,{recursive:true,force:true});
}

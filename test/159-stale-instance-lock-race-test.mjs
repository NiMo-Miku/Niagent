// Reproduce two real kernel processes pausing before the same stale unlink.
// The pause only delays a real filesystem operation; no PID/lock result is faked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const workspace=path.resolve(import.meta.dirname,'..');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-lock159-'));
const app=path.join(root,'app'),data=path.join(root,'data');
fs.mkdirSync(path.join(app,'bundled'),{recursive:true});fs.mkdirSync(data);
fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({server:{port:0},telemetry:{enabled:false}}));
const script=path.join(root,'child.mjs'),children=[];
fs.writeFileSync(script,`import fs from 'node:fs';import path from 'node:path';
import {createKernel} from ${JSON.stringify(pathToFileURL(path.join(workspace,'src/kernel/kernel.js')).href)};
const [app,data,release,pause]=process.argv.slice(2),lock=path.join(data,'qq-agent.lock');
let paused=false;
const original=fs.rmSync;
fs.rmSync=function(file,...args){if(pause==='pause'&&!paused&&path.resolve(file)===lock){paused=true;process.send({type:'before-stale-removal'});const limit=Date.now()+8000;while(!fs.existsSync(release)){if(Date.now()>limit)throw Error('Own stale-removal barrier timed out');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);}}return original.call(this,file,...args);};
const kernel=createKernel({appRoot:app,headless:true,env:{QQ_AGENT_DATA_DIR:data,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(app,'absent')},transport:{id:'synthetic159',bind(){},start(){},stop(){},status(){return {connected:false};}},fetchImpl:async()=>{throw Error('159 blocks external requests');},priceUpdates:{refresh:async()=>({ok:true}),resolve:()=>null},communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})}});
kernel.log.setLevel('error');
process.on('message',async message=>{if(message==='start'){try{const port=await kernel.start();process.send({type:'ready',pid:process.pid,port});}catch(error){process.send({type:'rejected',message:error.message});}}
if(message==='stop'){await kernel.stop();process.send({type:'stopped'});process.disconnect();}});
process.send({type:'initialized',pid:process.pid});
`);
const launch=(name,pause='pause')=>{
  const release=path.join(root,`release-${name}`),events=[];
  const child=spawn(process.execPath,[script,app,data,release,pause],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
  let stderr='';child.stderr.on('data',b=>{stderr+=b;});child.on('message',m=>events.push(m));
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  const wait=async(types,timeout=10000)=>{const end=Date.now()+timeout;for(;;){const value=events.find(m=>types.includes(m.type));if(value)return value;if(child.exitCode!==null||Date.now()>=end)throw Error(`159 ${name} missing ${types}: ${stderr}`);await new Promise(r=>setTimeout(r,5));}};
  const item={child,events,done,wait,release};children.push(item);return item;
};
const release=item=>fs.writeFileSync(item.release,'synthetic release');
try{
  // Obtain an actual exited PID, rather than guessing an unused process ID.
  const dead=spawn(process.execPath,['-e',''],{windowsHide:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{dead.once('error',reject);dead.once('exit',resolve);});
  fs.writeFileSync(path.join(data,'qq-agent.lock'),String(dead.pid));
  const first=launch('first'),second=launch('second');
  await Promise.all([first.wait(['initialized']),second.wait(['initialized'])]);
  first.child.send('start');await first.wait(['before-stale-removal']);
  second.child.send('start');
  // Old recovery reaches its stale unlink while the first owns the pause.
  // Serialized recovery waits instead. Release the first after that bounded
  // observation, so a serialized contender can read the new live owner.
  await Promise.race([second.wait(['before-stale-removal','rejected']),new Promise(r=>setTimeout(r,500))]);
  release(first);const owner=await first.wait(['ready','rejected']);
  assert.equal(owner.type,'ready');release(second);
  const contender=await second.wait(['ready','rejected']);
  assert.equal(contender.type,'rejected','A second stale recovery must not delete the first new live lock and start');
  assert.equal(fs.readFileSync(path.join(data,'qq-agent.lock'),'utf8'),String(owner.pid));
  assert.equal((await fetch(`http://127.0.0.1:${owner.port}/api/status`)).status,200,'The winning actual kernel remains responsive');
  first.child.send('stop');await first.wait(['stopped']);await first.done;
  second.child.send('stop');await second.wait(['stopped']);await second.done;
  assert.equal(fs.existsSync(path.join(data,'qq-agent.lock')),false);
  assert.deepEqual(fs.readdirSync(data).filter(name=>name.startsWith('qq-agent.lock.claim-')),[],'Completed claims leave no runtime artifacts');
  // A process killed in the tiny recovery transaction must not leave an
  // unrecoverable guard. Its unique dead claim can be safely discarded.
  fs.writeFileSync(path.join(data,'qq-agent.lock'),String(dead.pid));
  const crashed=launch('crashed');await crashed.wait(['initialized']);crashed.child.send('start');
  await crashed.wait(['before-stale-removal']);crashed.child.kill();await crashed.done;
  const recovery=launch('crash-recovery','no-pause');await recovery.wait(['initialized']);recovery.child.send('start');
  const recovered=await recovery.wait(['ready','rejected']);assert.equal(recovered.type,'ready');
  recovery.child.send('stop');await recovery.wait(['stopped']);await recovery.done;
  assert.equal(fs.existsSync(path.join(data,'qq-agent.lock')),false);
  assert.deepEqual(fs.readdirSync(data).filter(name=>name.startsWith('qq-agent.lock.claim-')),[]);
  const fresh=Array.from({length:4},(_,i)=>launch(`fresh-${i}`,'no-pause'));
  await Promise.all(fresh.map(item=>item.wait(['initialized'])));
  fresh.forEach(item=>item.child.send('start'));
  const results=await Promise.all(fresh.map(item=>item.wait(['ready','rejected'])));
  const winners=results.filter(item=>item.type==='ready');
  assert.equal(winners.length,1,'Concurrent first creation must also have exactly one live owner');
  assert.equal(fs.readFileSync(path.join(data,'qq-agent.lock'),'utf8'),String(winners[0].pid));
  fresh.forEach(item=>item.child.send('stop'));
  await Promise.all(fresh.map(async item=>{await item.wait(['stopped']);await item.done;}));
  assert.equal(fs.existsSync(path.join(data,'qq-agent.lock')),false);
  assert.deepEqual(fs.readdirSync(data).filter(name=>name.startsWith('qq-agent.lock.claim-')),[]);
  console.log('✓ 159 Real stale-recovery contenders and four fresh starters have one live winner; killed recovery claims recover and actual kernels stop cleanly');
}finally{
  for(const item of children){if(!fs.existsSync(item.release))release(item);if(item.child.exitCode===null&&item.child.connected)item.child.send('stop');}
  await Promise.all(children.map(async item=>{let timer;try{await Promise.race([item.done,new Promise(r=>{timer=setTimeout(()=>{if(item.child.exitCode===null)item.child.kill();r();},3000);})]);}finally{clearTimeout(timer);}}));
  assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('qqa-lock159-'));
  fs.rmSync(root,{recursive:true,force:true});
}

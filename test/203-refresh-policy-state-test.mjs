import assert from 'node:assert/strict';
import {createSessionEvents} from '../ui/panels/sessions/session-events.js';
import {createActiveTaskTicker} from '../ui/panels/active-task-ticker.js';
import {normalizeRefreshInterval,getRefreshInterval,setRefreshInterval,onRefreshInterval} from '../ui/panels/refresh-policy.js';
for(const value of [undefined,null,'bad',0,999,Infinity,-1,Symbol('not a timer'),[5000],{toString:'not callable'}])assert.equal(normalizeRefreshInterval(value),15000);
assert.equal(normalizeRefreshInterval('2500'),2500);assert.equal(normalizeRefreshInterval(1000.9),1000);assert.equal(normalizeRefreshInterval(1e15),2147483647);
const changes=[],off=onRefreshInterval(ms=>changes.push(ms));setRefreshInterval(5000);setRefreshInterval(5000);assert.equal(getRefreshInterval(),5000);assert.deepEqual(changes,[5000]);off();setRefreshInterval(15000);assert.deepEqual(changes,[5000]);
const doc=new EventTarget(),view=new EventTarget(),timers=new Map();let sequence=0;doc.hidden=false;doc.defaultView=view;
view.setTimeout=fn=>{const id=++sequence;timers.set(id,fn);return id;};view.clearTimeout=id=>timers.delete(id);
const settle=()=>new Promise(setImmediate);const fire=()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);return fn();};
let release,runs=0,batches=[];
const queue=createSessionEvents({doc,run:async batch=>{runs++;batches.push(batch);if(runs===1)await new Promise(r=>{release=r;});}});
for(let i=0;i<100;i++)queue.push('session');assert.equal(timers.size,1);const first=fire();await settle();assert.equal(runs,1);
for(let i=0;i<300;i++)queue.push('id-'+i,{follow:i===299});assert.equal(timers.size,0,'in-flight read does not overlap');release();await first;assert.equal(timers.size,1);await fire();assert.equal(runs,2);assert.deepEqual([...batches[1].ids],['*']);assert.equal(batches[1].follow,true);assert.equal(batches[1].followId,'id-299','bounded overflow retains the actual follow target');
queue.push('hidden');doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(timers.size,0);doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(timers.size,1);await fire();assert.equal(runs,3);
queue.push('discarded-on-dispose');queue.dispose();assert.equal(timers.size,0);queue.push('late');assert.equal(timers.size,0);
const failures=[];let lateRelease;const late=createSessionEvents({doc,run:()=>new Promise(r=>{lateRelease=r;}),onError:e=>failures.push(e)});late.push('first');const active=fire();await settle();late.push('tail');late.dispose();lateRelease();await active;assert.equal(timers.size,0);
const broken=createSessionEvents({doc,run:async()=>{throw new Error('controlled read failure');},onError:e=>failures.push(e.message)});broken.push('failure');await fire();assert.deepEqual(failures,['controlled read failure']);assert.equal(timers.size,0);broken.dispose();
const saved={window:globalThis.window,document:globalThis.document,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
const intervals=new Map();let duration=5000,ticker;
try{
 globalThis.window=view;globalThis.document=doc;globalThis.setInterval=(fn,ms)=>{const id=++sequence;intervals.set(id,{fn,ms});return id;};globalThis.clearInterval=id=>intervals.delete(id);
 ticker=createActiveTaskTicker({active:()=>true,tick(){},poll(){},interval:()=>duration});assert.equal([...intervals.values()][0].ms,5000);duration=1000;ticker.sync();assert.equal(intervals.size,1);assert.equal([...intervals.values()][0].ms,1000);duration=Infinity;ticker.sync();assert.equal([...intervals.values()][0].ms,1000);doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(intervals.size,0);ticker.dispose();
}finally{ticker?.dispose();for(const [key,value]of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
console.log('✓ refresh policy: normalization/dynamic reschedule; bounded burst queue, trailing reads, hidden suspension, failure and late-disposal fencing');

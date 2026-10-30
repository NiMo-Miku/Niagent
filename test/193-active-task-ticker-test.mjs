import assert from 'node:assert/strict';
import {createActiveTaskTicker} from '../ui/panels/active-task-ticker.js';
const saved={window:globalThis.window,document:globalThis.document,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
const timers=new Map();let sequence=0,active=false,ticks=0,polls=0,release;
globalThis.document=new EventTarget();document.hidden=false;globalThis.window=new EventTarget();
globalThis.setInterval=fn=>{const id=++sequence;timers.set(id,fn);return id;};globalThis.clearInterval=id=>timers.delete(id);
const settle=async()=>{await new Promise(setImmediate);};
const pulse=()=>{for(const fn of [...timers.values()])fn();};
let ticker;
try {
  ticker=createActiveTaskTicker({active:()=>active,tick:()=>{ticks++;},poll:()=>{polls++;return new Promise(r=>{release=r;});}});
  assert.equal(timers.size,0,'idle owns no timer');active=true;ticker.sync();ticker.sync();assert.equal(timers.size,1);
  pulse();assert.equal(ticks,1);assert.equal(polls,0);pulse();await settle();assert.equal(polls,1);
  for(let i=0;i<6;i++)pulse();await settle();assert.equal(polls,1,'pending authority poll is never overlapped');
  active=false;ticker.sync();assert.equal(timers.size,0);release();await settle();assert.equal(timers.size,0);
  active=true;ticker.sync();document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(timers.size,0);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(polls,2);assert.equal(timers.size,1);
  ticker.dispose();assert.equal(timers.size,0);release();await settle();ticker.sync();document.dispatchEvent(new Event('visibilitychange'));assert.equal(timers.size,0);assert.equal(polls,2);
  ticker=createActiveTaskTicker({active:()=>true,tick:()=>{},poll:()=>{throw new Error('must not run after disposal');}});
  pulse();pulse();ticker.dispose();await settle();assert.equal(timers.size,0);
  console.log('✓ active ticker: idle/hidden suspension, resume authority poll, single flight, disposal and late-reply fencing');
} finally {ticker?.dispose();for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}

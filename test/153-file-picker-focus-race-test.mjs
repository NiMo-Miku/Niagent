// A chooser can remain open after its owner/iframe regains focus.
// Exercise the actual picker with file/cancel events, not fake installation APIs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const file=process.argv[2]||new URL('../ui/panels/extension-manager.js',import.meta.url);
const source=fs.readFileSync(file,'utf8');
const start=source.indexOf('export async function pickZip()');
const end=source.indexOf('\nexport async function installZip',start);
assert.ok(start>=0&&end>start);
const pickerSource=source.slice(start,end).replace('export async function','async function');
let passed=0,failed=0;
const check=(label,fn)=>{try{fn();passed++;console.log('✓ '+label);}catch(e){failed++;console.error('✗ '+label+': '+e.message);}};
class Events{
  listeners=new Map();
  addEventListener(name,fn,options){const list=this.listeners.get(name)||[];list.push({fn,once:options?.once===true});this.listeners.set(name,list);}
  removeEventListener(name,fn){this.listeners.set(name,(this.listeners.get(name)||[]).filter(l=>l.fn!==fn));}
  emit(name){for(const item of [...this.listeners.get(name)||[]]){if(item.once)this.removeEventListener(name,item.fn);item.fn({type:name});}}
  count(){return [...this.listeners.values()].reduce((n,list)=>n+list.length,0);}
}
function fixture({clickFailure=false}={}){
  const window=new Events(),input=new Events();Object.assign(input,{files:[],removed:false,remove(){this.removed=true;},click(){if(clickFailure)throw Error('QA_CHOOSER_OPEN_FAILED');this.opened=true;}});
  const document={body:{append(node){assert.equal(node,input);}},createElement(tag){assert.equal(tag,'input');return input;}};
  const pickZip=new Function('window','document',pickerSource+'\nreturn pickZip;')(window,document);
  const observed={state:'pending',settlements:0};
  pickZip().then(value=>Object.assign(observed,{state:'fulfilled',value,settlements:observed.settlements+1}),error=>Object.assign(observed,{state:'rejected',error,settlements:observed.settlements+1}));
  return {window,input,observed};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
{
  const f=fixture();f.window.emit('focus');await wait(550);
  check('owner focus while chooser is open does not silently cancel selection',()=>assert.equal(f.observed.state,'pending'));
  const zip={name:'late-selected.zip',size:1253};f.input.files=[zip];f.input.emit('change');await flush();
  check('actual later file change returns selected ZIP identity',()=>assert.equal(f.observed.value,zip));
  check('completed file selection removes input and all event listeners',()=>{assert.equal(f.input.removed,true);assert.equal(f.input.count()+f.window.count(),0);});
  f.input.emit('cancel');f.window.emit('pagehide');await flush();
  check('late cancel/teardown cannot change an already selected result',()=>{assert.equal(f.observed.value,zip);assert.equal(f.observed.settlements,1);});
}
{
  const f=fixture();f.input.emit('cancel');await flush();
  check('native cancel resolves null without a focus timeout',()=>{assert.equal(f.observed.state,'fulfilled');assert.equal(f.observed.value,null);});
  check('cancel leaves no hidden picker or lifecycle listeners',()=>{assert.equal(f.input.removed,true);assert.equal(f.input.count()+f.window.count(),0);});
}
{
  const f=fixture();f.window.emit('pagehide');await flush();
  check('unloading the panel settles an outstanding file chooser',()=>{assert.equal(f.observed.state,'fulfilled');assert.equal(f.observed.value,null);});
  check('panel teardown releases hidden input and callbacks',()=>{assert.equal(f.input.removed,true);assert.equal(f.input.count()+f.window.count(),0);});
}
{
  const f=fixture({clickFailure:true});await flush();
  check('chooser opening failure reaches caller as an error',()=>{assert.equal(f.observed.state,'rejected');assert.equal(f.observed.error.message,'QA_CHOOSER_OPEN_FAILED');});
  check('opening failure also removes input/listeners',()=>{assert.equal(f.input.removed,true);assert.equal(f.input.count()+f.window.count(),0);});
}
console.log(`153-file-picker-focus-race: ${passed} passed, ${failed} failed`);
process.exitCode=failed?1:0;

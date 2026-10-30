// Opt-in component for both bundled and independently rendered plugin panels.
// Progress is behavioral state, not inferred from CSS or animation completion.
import {beginDestructiveUpdate} from './destructive-layout.js';
import {createDestructiveMotion} from './destructive-motion.js';
import {mountDestructiveVisual as attachOverlay,releaseDestructiveVisual as releaseOverlay} from './destructive-snapshot.js';
export const DANGER_HOLD_MS=500;
export const DANGER_DECAY_MS=1500;
const runtimes=new WeakMap();
const bindings=new WeakMap();
const exits=new WeakMap();
let nextId=0;

// Call only after the mutation succeeds. The owner removes/reflows the node
// after awaiting this effect; this helper never removes application content.
export function animateDestructiveExit(target,{signal,duration=540}={}){
  const nodes=[...new Set((Array.isArray(target)?target:[target]).filter(node=>node?.nodeType===1&&node.isConnected))];
  return Promise.all(nodes.map(node=>{
    const current=exits.get(node);if(current)return current.promise;
    const doc=node.ownerDocument,win=doc.defaultView,media=win.matchMedia?.('(prefers-reduced-motion: reduce)');
    if(signal?.aborted||doc.hidden||media?.matches||typeof node.animate!=='function')return Promise.resolve();
    const runtime=runtimeFor(doc),effect=createDestructiveMotion(node,{exitOnly:true});
    let finished=false,resolve;
    const promise=new Promise(done=>{resolve=done;}),state={promise};exits.set(node,state);
    const control={reset:finish,inspect(){if(!node.isConnected)finish();},position(){}};
    function finish(){
      if(finished)return;finished=true;signal?.removeEventListener('abort',finish);media?.removeEventListener('change',motion);
      effect.dispose();node.classList.remove('danger-success-exit');runtime.remove(control);
      if(exits.get(node)===state)exits.delete(node);resolve();
    }
    function motion(){if(media.matches)finish();}
    node.classList.add('danger-success-exit');runtime.add(control);signal?.addEventListener('abort',finish,{once:true});media?.addEventListener('change',motion);
    try{
      Promise.resolve(effect.exit({signal,duration})).then(finish,finish);
    }catch{finish();}
    return promise;
  })).then(()=>{});
}

function runtimeFor(doc){
  let runtime=runtimes.get(doc);if(runtime)return runtime;
  const active=new Set(),win=doc.defaultView;
  const inspect=()=>{for(const control of [...active])control.inspect();};
  const cancel=()=>{for(const control of [...active])control.reset();};
  const reposition=()=>{for(const control of active)control.position();};
  const observer=new win.MutationObserver(inspect);
  let listening=false;
  runtime={
    active,
    add(control){
      active.add(control);if(listening)return;listening=true;
      observer.observe(doc.documentElement,{childList:true,subtree:true});
      doc.addEventListener('input',inspect,true);doc.addEventListener('change',inspect,true);
      doc.addEventListener('keydown',escape,true);doc.addEventListener('visibilitychange',visibility);
      win.addEventListener('pagehide',cancel);win.addEventListener('resize',reposition);doc.addEventListener('scroll',reposition,true);
    },
    remove(control){
      active.delete(control);if(active.size||!listening)return;listening=false;observer.disconnect();
      doc.removeEventListener('input',inspect,true);doc.removeEventListener('change',inspect,true);
      doc.removeEventListener('keydown',escape,true);doc.removeEventListener('visibilitychange',visibility);
      win.removeEventListener('pagehide',cancel);win.removeEventListener('resize',reposition);doc.removeEventListener('scroll',reposition,true);
    },
  };
  function escape(event){if(event.key==='Escape')cancel();}
  function visibility(){if(doc.hidden)cancel();}
  runtimes.set(doc,runtime);return runtime;
}

export function resetDestructiveActions(doc=document){for(const control of [...(runtimes.get(doc)?.active||[])])control.reset();}

export function bindDestructiveAction(button,{action,target,clicks=2,impact='删除此项内容。',key,canActivate,windowTint=false,layoutMotion=true,onError}={}){
  if(!button?.ownerDocument||typeof action!=='function')throw new TypeError('删除按钮需要有效按钮与执行函数');
  if(!Number.isInteger(clicks)||clicks<2||clicks>6)throw new RangeError('删除点击次数必须为2至6');
  bindings.get(button)?.dispose();
  const doc=button.ownerDocument,win=doc.defaultView,runtime=runtimeFor(doc);
  let progress=0,base=0,lastClick=0,context='',busy=false,disposed=false,decaying=false,timer=0,frame=0,feedback=null,summary=null,status=null,track=null,steps=null;
  let describedBefore=null,ownsLabel=false;
  const washes=new Map();
  let pendingTransition=null;
  const value=entry=>typeof entry==='function'?entry():entry;
  const currentKey=()=>String(value(key)??'');
  const allowed=()=>canActivate?.()!==false;
  const now=()=>win.performance.now();
  const sampled=time=>Math.max(0,base-Math.max(0,time-lastClick-DANGER_HOLD_MS)/DANGER_DECAY_MS);
  button.type='button';button.classList.add('danger','danger-action');button.dataset.dangerClicks=String(clicks);button.dataset.dangerProgress='0';

  function windowProgress(amount,phase=busy?'pending':'charging'){if(windowTint)win.dispatchEvent(new win.CustomEvent('destructive-window-progress',{detail:{progress:amount,phase}}));}
  function targets(){
    const resolved=value(target)??button.closest('article,.card,section,fieldset,dialog')??button.parentElement;
    return [...new Set((Array.isArray(resolved)?resolved:[resolved]).filter(node=>node?.nodeType===1&&node.ownerDocument===doc&&node.isConnected))];
  }
  function clearWashes(){
    for(const [node,entry] of washes)releaseWash(node,entry);
    washes.clear();
  }
  function releaseWash(node,entry){
    entry.motion.dispose();
    releaseOverlay(node,entry.overlay);
  }
  function tint(){
    // Full-window feedback is painted by the authenticated shell. A panel never
    // reaches into parent DOM or injects styles into another plugin document.
    if(windowTint){windowProgress(progress);return;}
    const wanted=new Set(targets());
    for(const [node,entry] of washes)if(!wanted.has(node)){releaseWash(node,entry);washes.delete(node);}
    for(const node of wanted){
      let entry=washes.get(node);
      if(!entry){
        const overlay=doc.createElement('span');overlay.className='danger-wash';overlay.dataset.destructiveVisual='';overlay.setAttribute('aria-hidden','true');overlay.style.opacity='0';
        attachOverlay(node,overlay);overlay.getBoundingClientRect();entry={overlay,motion:createDestructiveMotion(node)};washes.set(node,entry);
      }
      if(entry.overlay.parentNode!==node)node.append(entry.overlay);
      entry.overlay.classList.toggle('danger-decaying',decaying);entry.overlay.style.setProperty('--danger-intensity',String(progress));
      entry.overlay.style.opacity=String(progress*.46);
      entry.motion.update(progress,{decaying});
    }
  }
  function position(){
    if(!feedback?.isConnected||!button.isConnected)return;
    const rect=button.getBoundingClientRect(),width=doc.documentElement.clientWidth,height=doc.documentElement.clientHeight;
    feedback.style.maxWidth=`${Math.max(120,Math.min(360,width-16))}px`;
    const box=feedback.getBoundingClientRect();
    feedback.style.left=`${Math.max(8,Math.min(rect.left,width-box.width-8))}px`;
    const below=rect.bottom+8,above=rect.top-box.height-8;
    feedback.style.top=`${Math.max(8,Math.min(below+box.height<=height-8?below:above,height-box.height-8))}px`;
  }
  function createFeedback(){
    if(feedback)return;
    if(!button.hasAttribute('aria-label')){button.setAttribute('aria-label',button.textContent.trim());ownsLabel=true;}
    track=doc.createElement('span');track.className='danger-progress';track.setAttribute('role','progressbar');track.setAttribute('aria-label','删除确认进度');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');button.append(track);
    // Establish the visual starting point without changing logical progress or
    // delaying a threshold click's HTTP action. Later decay remains linear.
    track.getBoundingClientRect();
    feedback=doc.createElement('div');feedback.id=`danger-feedback-${++nextId}`;feedback.className='danger-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    summary=doc.createElement('strong');summary.textContent=String(value(impact)||'删除此项内容。');status=doc.createElement('span');status.className='danger-status';
    steps=doc.createElement('span');steps.className='danger-steps';steps.setAttribute('aria-hidden','true');
    for(let i=0;i<clicks;i++){const tick=doc.createElement('span');tick.className='danger-step';steps.append(tick);}
    feedback.append(summary,steps,status);
    describedBefore=button.getAttribute('aria-describedby');button.setAttribute('aria-describedby',[describedBefore,feedback.id].filter(Boolean).join(' '));
    if(typeof feedback.showPopover==='function'){feedback.setAttribute('popover','manual');doc.body.append(feedback);feedback.showPopover();}
    else (button.closest('dialog[open]')||doc.body).append(feedback);
    position();
  }
  function paint(){
    button.dataset.dangerProgress=String(progress);
    button.classList.toggle('danger-decaying',decaying);feedback?.classList.toggle('danger-decaying',decaying);
    if(track){track.style.transform=`scaleX(${progress})`;track.setAttribute('aria-valuenow',String(Math.round(progress*100)));track.setAttribute('aria-valuetext',busy?'确认完成，正在执行':`${Math.round(progress*100)}%，还需 ${Math.max(1,Math.ceil((1-progress)*clicks-1e-8))} 次有效点击`);}
    if(steps)for(let i=0;i<steps.children.length;i++)steps.children[i].style.setProperty('--danger-fill',`${Math.min(1,Math.max(0,progress*clicks-i))*100}%`);
    if(status){const message=busy?'确认完成，正在执行…':`删除操作尚未执行，还需 ${Math.max(1,Math.ceil((1-progress)*clicks-1e-8))} 次有效点击确认`;
      if(status.textContent!==message)status.textContent=message;
    }
    tint();
  }
  function stopTimers(){win.clearTimeout(timer);win.cancelAnimationFrame(frame);timer=frame=0;}
  function reset({preserveCommittedLayout=false,completed=false}={}){
    if(!preserveCommittedLayout)pendingTransition?.cancel();
    stopTimers();progress=base=0;lastClick=0;decaying=false;button.dataset.dangerProgress='0';button.classList.remove('danger-charging','danger-decaying');
    track?.remove();track=null;
    if(feedback){feedback.remove();feedback=summary=status=steps=null;if(describedBefore===null)button.removeAttribute('aria-describedby');else button.setAttribute('aria-describedby',describedBefore);describedBefore=null;}
    if(ownsLabel){button.removeAttribute('aria-label');ownsLabel=false;}
    clearWashes();windowProgress(0,completed?'complete':'cancelled');runtime.remove(controller);
  }
  function inspect(){
    if(!button.isConnected||!busy&&(currentKey()!==context||!allowed())){reset({preserveCommittedLayout:busy});return;}
    if(summary){const message=String(value(impact)||'删除此项内容。');if(summary.textContent!==message)summary.textContent=message;}
    paint();position();
  }
  function decay(){
    frame=0;if(disposed||busy)return;
    if(!button.isConnected||currentKey()!==context||!allowed()){reset();return;}
    decaying=true;progress=sampled(now());if(progress<=0){reset();return;}
    paint();frame=win.requestAnimationFrame(decay);
  }
  function report(error){
    if(onError){onError(error);return;}
    if(!button.isConnected)return;
    const message=doc.createElement('p');message.className='error danger-error';message.setAttribute('role','alert');message.textContent=error?.message||'操作失败，请重试';
    (button.closest('article,.message,dialog,#detail,section')||button.parentElement)?.append(message);
  }
  async function commit(){
    busy=true;button.disabled=true;paint();
    const layout=!windowTint&&layoutMotion?beginDestructiveUpdate(targets(),{exit:animateDestructiveExit,source:button}):null;
    // An SSE refresh can detach the button before its request resolves. Keep
    // committed layout work independently reachable by global cancellation.
    let layoutControl=null;
    const transition=pendingTransition=layout?{
      complete:()=>layout.complete(),
      cancel(){layout.cancel();if(layoutControl)runtime.remove(layoutControl);},
    }:null;
    if(transition){layoutControl={reset:()=>transition.cancel(),inspect(){},position(){}};runtime.add(layoutControl);}
    let completed=false;
    try{await action();completed=true;await transition?.complete();}catch(error){report(error);}
    finally{transition?.cancel();if(pendingTransition===transition)pendingTransition=null;busy=false;reset({completed});if(!disposed)button.disabled=!allowed();}
  }
  function click(event){
    event.preventDefault();if(disposed||busy||button.disabled||!allowed())return;
    const next=currentKey(),time=now();
    if(progress&&context!==next)reset();
    progress=progress?sampled(time):0;stopTimers();context=next;decaying=false;
    progress=base=Math.min(1,progress+1/clicks);lastClick=time;
    runtime.add(controller);button.classList.add('danger-charging');createFeedback();paint();
    if(progress>=1-1e-8){progress=base=1;void commit();}
    else timer=win.setTimeout(decay,DANGER_HOLD_MS);
  }
  function keydown(event){if(event.repeat&&['Enter',' '].includes(event.key))event.preventDefault();}
  function dispose(){if(disposed)return;disposed=true;reset();button.removeEventListener('click',click);button.removeEventListener('keydown',keydown);bindings.delete(button);}
  // Re-evaluate selection-dependent availability without unlocking an in-flight
  // mutation or discarding its committed exit/reflow animation.
  function refresh(){if(disposed)return;button.disabled=busy||!allowed();if(progress&&!busy)inspect();}
  const controller=Object.freeze({reset,dispose,inspect,position,refresh});
  bindings.set(button,controller);button.addEventListener('click',click);button.addEventListener('keydown',keydown);return controller;
}

export function destructiveButton(label,action,options={}){
  const button=document.createElement('button');button.textContent=label;bindDestructiveAction(button,{...options,action});return button;
}

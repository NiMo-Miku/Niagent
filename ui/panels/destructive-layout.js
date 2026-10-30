// Short-lived, document-local layout transactions. Business requests and their
// result never depend on animation completion. No cross-frame DOM is accessed.
import {createDestructiveSnapshot} from './destructive-snapshot.js';
import {createDestructiveMotion} from './destructive-motion.js';
const KEYS=['motionKey','session','chat','memoryChat','member','message','extension','capability'];
const identities=new WeakMap();let identity=0;
const keyOf=node=>{for(const key of KEYS)if(node.dataset?.[key])return `${key}:${node.dataset[key]}`;if(node.id)return `id:${node.id}`;if(!identities.has(node))identities.set(node,++identity);return `node:${identities.get(node)}`;};
const elements=value=>[...new Set((Array.isArray(value)?value:[value]).filter(node=>node?.nodeType===1&&node.isConnected))];
const noop=()=>({complete:async()=>{},cancel(){}});
const EASING='cubic-bezier(.42,0,.18,1)';

function visualCopy(node,rect,doc){
  const visual=doc.createElement('div');visual.className='danger-removal-ghost';visual.dataset.motion='off';visual.dataset.destructiveVisual='';visual.inert=true;visual.setAttribute('aria-hidden','true');
  const style=doc.defaultView.getComputedStyle(node);
  Object.assign(visual.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,color:style.color,background:style.backgroundColor,borderRadius:style.borderRadius,font:style.font});
  visual.append(createDestructiveSnapshot(node,rect));
  return visual;
}

/** Capture before an action; complete only after it succeeds. SSE can remove
 * rows before the HTTP reply. Ghosts and paused FLIP preserve the old visual
 * positions until success, then dissolve and release the surviving rows. */
export function beginDestructiveUpdate(target,{exit,container,source,signal}={}){
  const targets=elements(target),doc=targets[0]?.ownerDocument,win=doc?.defaultView;
  if(!doc||doc.hidden||signal?.aborted||win.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return noop();
  const media=win.matchMedia?.('(prefers-reduced-motion: reduce)'),abort=new win.AbortController();
  const roots=new Set(elements(container));
  for(const node of targets){if(node.parentElement&&!['BODY','HTML'].includes(node.parentElement.tagName))roots.add(node.parentElement);if(node.children.length)roots.add(node);}
  for(const node of doc.querySelectorAll('[data-motion-list],#list,.messages,.member-cards,#provider-list,#template-list,#search-provider-list'))roots.add(node);
  const snapshots=[],copies=new Map(),ghosts=new Map(),ghostMotion=new Map(),moves=new Map(),changed=new Set(),modalSizes=new Map();
  const controls=node=>[...node.querySelectorAll('input,textarea,select')].slice(0,250).map(input=>`${input.localName}:${!!input.value}:${!!input.checked}:${input.selectedIndex??''}`).join('|');
  const targetState=new Map(targets.map(node=>[node,{controls:controls(node),descendants:new Set(node.querySelectorAll('*'))}]));
  let finished=false,completion,observer;
  // A native dialog re-centers when its content shrinks. Retain its current
  // height until the old content has torn away, then include the new positions
  // in the same FLIP as the surviving rows.
  for(const node of targets){const modal=node.closest('dialog[open]');if(modal&&!modalSizes.has(modal)){const before=modal.style.minHeight,held=`${modal.getBoundingClientRect().height}px`;modalSizes.set(modal,{before,held});modal.style.minHeight=held;}}
  function releaseModalSizes(){for(const [modal,{before,held}]of modalSizes)if(modal.style.minHeight===held)modal.style.minHeight=before;modalSizes.clear();}
  for(const node of targets.slice(0,8)){const rect=node.getBoundingClientRect();if(rect.width&&rect.height&&rect.bottom>=0&&rect.top<=win.innerHeight)copies.set(node,visualCopy(node,rect,doc));}
  for(const root of [...roots].slice(0,16)){
    const rows=[];
    // Bound retained visible rows, not the first stored rows: an archive may
    // have hundreds of older messages above the current viewport.
    for(const node of root.children){
      const rect=node.getBoundingClientRect();
      if(!rect.width||!rect.height||rect.bottom<0||rect.top>win.innerHeight)continue;
      rows.push({node,key:keyOf(node),rect});
      if(copies.size<80&&!copies.has(node)&&(node.matches('.list-item,.message,.card,article,[data-motion-key]')||targets.includes(node)))copies.set(node,visualCopy(node,rect,doc));
      if(rows.length>=120)break;
    }
    if(rows.length)snapshots.push({root,id:root.id,listKey:root.dataset.motionList,rows});
  }
  const currentRoot=snapshot=>snapshot.root.isConnected?snapshot.root:snapshot.id?doc.getElementById(snapshot.id):snapshot.listKey?[...doc.querySelectorAll('[data-motion-list]')].find(node=>node.dataset.motionList===snapshot.listKey):null;
  const clearMoves=()=>{for(const {animation}of moves.values())animation.cancel();moves.clear();};
  function addGhost(original){
    const copy=copies.get(original);if(!copy||ghosts.has(original)||ghosts.size>=8)return;
    if(typeof copy.showPopover==='function')copy.setAttribute('popover','manual');
    doc.body.append(copy);
    // Modal dialogs occupy the browser top layer. A body-level z-index cannot
    // cover their deleted rows; an inert manual popover can, without focus.
    if(copy.hasAttribute('popover')){try{copy.showPopover();}catch{copy.removeAttribute('popover');}}
    ghosts.set(original,copy);
    const motion=createDestructiveMotion(copy);motion.update(1);ghostMotion.set(original,motion);
  }
  function scan(captureRemoved=true){
    if(finished)return;clearMoves();
    for(const snapshot of snapshots){
      const root=currentRoot(snapshot);if(!root)continue;
      const rows=new Map([...root.children].map(node=>[keyOf(node),node]));
      for(const previous of snapshot.rows){
        const node=rows.get(previous.key);
        if(!node){
          const copy=copies.get(previous.node);
          if(copy&&captureRemoved)addGhost(previous.node);
          continue;
        }
        const ghost=ghosts.get(previous.node);if(ghost){ghostMotion.get(previous.node)?.dispose();ghostMotion.delete(previous.node);ghost.remove();ghosts.delete(previous.node);}
        const rect=node.getBoundingClientRect(),dx=previous.rect.left-rect.left,dy=previous.rect.top-rect.top;
        if(!rect.width||!rect.height||Math.abs(dx)+Math.abs(dy)<.6||typeof node.animate!=='function')continue;
        try{
          const animation=node.animate([{translate:`${dx}px ${dy}px`},{translate:'0px 0px'}],{duration:240,easing:EASING,fill:'both'});
          animation.pause();animation.currentTime=0;animation.finished.catch(()=>{});moves.set(node,{animation});
        }catch{/* Decorative layout must not block a mutation. */}
      }
    }
  }
  function cleanup(){
    if(finished)return;finished=true;observer?.disconnect();abort.abort();clearMoves();releaseModalSizes();for(const motion of ghostMotion.values())motion.dispose();ghostMotion.clear();for(const ghost of ghosts.values())ghost.remove();ghosts.clear();copies.clear();targetState.clear();
    doc.removeEventListener('visibilitychange',policy);doc.removeEventListener('keydown',escape);doc.removeEventListener('click',interact,true);doc.removeEventListener('input',cancel,true);doc.removeEventListener('change',cancel,true);doc.removeEventListener('scroll',scroll,true);doc.removeEventListener('wheel',cancel,true);doc.removeEventListener('touchmove',cancel,true);doc.removeEventListener('pointerdown',scrollbar,true);
    win.removeEventListener('pagehide',cancel);media?.removeEventListener('change',policy);signal?.removeEventListener('abort',cancel);
  }
  function cancel(){cleanup();}
  function policy(){if(doc.hidden||media?.matches)cancel();}
  function escape(event){if(['Escape','ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))cancel();}
  function scroll(event){
    // Removing archive rows can clamp scrollTop or restore the reading anchor.
    // That is part of this layout update, not a user cancelling the effect.
    // Explicit wheel/touch/key/scrollbar intent still releases it immediately.
    const target=event.target;
    if(target?.nodeType===1&&snapshots.some(({root})=>target===root||target.contains(root)))return;
    cancel();
  }
  function scrollbar(event){
    const target=event.target;
    if(snapshots.some(({root})=>root===target)&&(target.scrollHeight>target.clientHeight||target.scrollWidth>target.clientWidth))cancel();
  }
  // Keep a surviving checkbox under the pointer through press/release. Clearing
  // paused FLIP on pointerdown moves it before click hit-testing and loses the
  // user's very next selection. A captured click already has a stable target.
  function interact(event){if(source&&!source.contains(event.target))cancel();}
  observer=new win.MutationObserver(records=>{
    const decorative='[data-destructive-visual],.danger-feedback,.danger-progress';
    const real=records.filter(record=>{
      const parent=record.target.nodeType===1?record.target:record.target.parentElement;
      if(parent?.closest(decorative))return false;
      const nodes=[...record.addedNodes,...record.removedNodes];
      return !nodes.length||!nodes.every(node=>node.nodeType===1&&node.matches(decorative));
    });
    if(!real.length)return;
    for(const node of targets)if(real.some(record=>node===record.target||node.contains(record.target)))changed.add(node);
    scan();
  });
  for(const snapshot of snapshots)observer.observe(snapshot.root,{childList:true,subtree:true});
  doc.addEventListener('visibilitychange',policy);doc.addEventListener('keydown',escape);doc.addEventListener('click',interact,true);doc.addEventListener('input',cancel,true);doc.addEventListener('change',cancel,true);doc.addEventListener('scroll',scroll,true);doc.addEventListener('wheel',cancel,{capture:true,passive:true});doc.addEventListener('touchmove',cancel,{capture:true,passive:true});doc.addEventListener('pointerdown',scrollbar,true);
  win.addEventListener('pagehide',cancel,{once:true});media?.addEventListener('change',policy);signal?.addEventListener('abort',cancel,{once:true});
  return Object.freeze({cancel,complete({skipExit=false}={}){
    if(completion)return completion;
    completion=(async()=>{
      if(finished)return;scan();observer.disconnect();
      try{
        // Clearing/resetting a retained card also tears away its previous
        // content. A counter-only action has no changed visual to remove.
        for(const [node,before]of targetState)if((changed.has(node)||controls(node)!==before.controls)&&![...ghosts.keys()].some(removed=>removed===node||before.descendants.has(removed)))addGhost(node);
        for(const motion of ghostMotion.values())motion.dispose();ghostMotion.clear();
        if(!skipExit&&ghosts.size&&typeof exit==='function')await exit([...ghosts.values()],{signal:abort.signal});
        if(finished)return;
        for(const ghost of ghosts.values())ghost.remove();ghosts.clear();
        releaseModalSizes();scan(false);
        for(const {animation}of moves.values())animation.play();
        await Promise.all([...moves.values()].map(({animation})=>animation.finished.catch(()=>{})));
      }finally{cleanup();}
    })();return completion;
  }});
}

/** Opt-in refresh for custom panels. Call after a successful destructive RPC.
 * bindDestructiveAction already supplies its own transaction; use layoutMotion:
 * false there when choosing this explicit helper instead. */
export async function destructiveRefresh(target,refresh,{container,signal}={}){
  if(typeof refresh!=='function')throw new TypeError('Destructive refresh requires an update function');
  const nodes=elements(target),{animateDestructiveExit}=await import('./destructive-action.js');
  const transition=beginDestructiveUpdate(nodes,{container,signal,exit:animateDestructiveExit});
  const restore=[];
  try{
    await animateDestructiveExit(nodes,{signal});
    for(const node of nodes){restore.push({node,visibility:node.style.visibility,inert:node.inert});node.style.visibility='hidden';node.inert=true;}
    await refresh();await transition.complete({skipExit:true});
  }finally{
    transition.cancel();for(const {node,visibility,inert}of restore){if(node.style.visibility==='hidden')node.style.visibility=visibility;node.inert=inert;}
  }
}

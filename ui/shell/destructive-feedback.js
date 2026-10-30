// A single composited tint covers the shell and its opaque iframe. Only the
// bundled settings reset control can update it through the authenticated bridge.
import {createDestructiveMotion} from '../panels/destructive-motion.js';
export function createDestructiveFeedback(doc=document){
  let current=null,previous=0;
  function clear(entry=current){if(!entry)return;entry.motion.dispose();entry.wash.remove();if(current===entry){current=null;previous=0;}}
  function update(progress,phase='charging'){
    if(!Number.isFinite(progress)||progress<0||progress>1)return;
    if(progress===0){
      const entry=current;
      if(entry&&phase==='complete'&&previous===1&&!entry.exiting){entry.exiting=true;entry.motion.exit().finally(()=>clear(entry));}
      else if(phase!=='complete')clear(entry);
      return;
    }
    if(current?.exiting)clear();
    if(!current){const wash=doc.createElement('div');wash.className='destructive-window-wash';wash.dataset.destructiveVisual='';wash.setAttribute('aria-hidden','true');wash.style.opacity='0';doc.body.append(wash);wash.getBoundingClientRect();current={wash,motion:createDestructiveMotion(doc.body,{windowMode:true}),exiting:false};}
    const {wash,motion}=current;
    wash.classList.toggle('danger-decaying',progress<previous);previous=progress;
    wash.dataset.progress=String(progress);wash.style.setProperty('--danger-intensity',String(progress));wash.style.opacity=String(progress*.36);
    motion.update(progress,{decaying:wash.classList.contains('danger-decaying')});
  }
  function dispose(){clear();doc.defaultView.removeEventListener('pagehide',dispose);}
  doc.defaultView.addEventListener('pagehide',dispose,{once:true});
  return Object.freeze({update,dispose});
}

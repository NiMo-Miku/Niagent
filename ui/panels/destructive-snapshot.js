// Paint-only, bounded snapshots. Never clone active resources, custom elements,
// form values, IDs, links or event handlers from an extension's document.
const positions=new WeakMap();
const OMIT='script,style,link,meta,base,iframe,object,embed,img,video,audio,source,input,textarea,select,button,canvas,[contenteditable="true"],[data-destructive-visual],.danger-feedback,.danger-progress';

export function mountDestructiveVisual(node,visual,{fixed=false}={}){
  if(!fixed){
    let position=positions.get(node);
    if(!position){const win=node.ownerDocument.defaultView;position={relative:win.getComputedStyle(node).position==='static',before:node.style.position,owners:new Set()};positions.set(node,position);if(position.relative)node.style.position='relative';}
    position.owners.add(visual);
  }
  node.append(visual);
}
export function releaseDestructiveVisual(node,visual){
  visual.remove();const position=positions.get(node);if(!position)return;
  position.owners.delete(visual);if(position.owners.size)return;
  if(position.relative&&node.style.position==='relative')node.style.position=position.before;
  positions.delete(node);
}

export function createDestructiveSnapshot(node,rect=node.getBoundingClientRect()){
  const doc=node.ownerDocument,win=doc.defaultView,copy=doc.createElement('div');
  copy.className='danger-snapshot';copy.setAttribute('aria-hidden','true');copy.inert=true;
  // Text ranges preserve the original positions without re-running a page's
  // layout selectors or accidentally copying a password/remote image element.
  const walker=doc.createTreeWalker(node,win.NodeFilter.SHOW_TEXT),styles=new WeakMap();
  let text,visited=0,written=0,characters=0;
  while((text=walker.nextNode())&&++visited<=700&&written<48&&characters<2200){
    if(!text.textContent.trim())continue;
    let parent=text.parentElement,blocked=false;
    for(let element=parent;element&&element!==node;element=element.parentElement){
      if(element.matches(OMIT)||element.localName.includes('-')||element.hasAttribute('is')){blocked=true;break;}
    }
    if(blocked||node.matches(OMIT)&&!node.classList.contains('danger-removal-ghost'))continue;
    let style=styles.get(parent);if(!style){style=win.getComputedStyle(parent);styles.set(parent,style);}
    if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)continue;
    const range=doc.createRange();range.selectNodeContents(text);const box=range.getBoundingClientRect();
    if(!box.width||!box.height||box.bottom<rect.top||box.top>rect.bottom||box.right<rect.left||box.left>rect.right)continue;
    const item=doc.createElement('span'),value=text.textContent.slice(0,Math.min(320,2200-characters));
    item.textContent=value;characters+=value.length;written++;
    Object.assign(item.style,{position:'absolute',left:`${box.left-rect.left}px`,top:`${box.top-rect.top}px`,width:`${box.width+1}px`,height:`${box.height+2}px`,font:style.font,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,color:style.color,textAlign:style.textAlign,whiteSpace:style.whiteSpace==='pre'?'pre':'pre-wrap',overflow:'hidden',overflowWrap:'anywhere',margin:'0',padding:'0'});
    copy.append(item);
  }
  return copy;
}

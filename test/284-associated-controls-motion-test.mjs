// Inspect paint bounds as well as hit testing: inert outgoing content is still
// visible, but deliberately cannot be found with elementFromPoint().
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {settingsSection,settingsEditor,openSettingsFold} from './settings-navigation.mjs';

const evidence=process.env.QA284_EVIDENCE,results=[];
if(evidence)fs.mkdirSync(evidence,{recursive:true});
const f=await modelUiFixture({config:{api:{vision:true,video:true,useOfficialPrice:false},memory:{consolidateEnabled:true,useChatModel:false},webSearch:{enabled:false},commandMute:{enabled:true},proactive:{enabled:true},personaUnified:false}});
const {page,frame}=f;
const settle=()=>frame.locator('body').evaluate(async()=>{
  await document.fonts.ready;let idle=0;
  for(let i=0;i<240;i++){await new Promise(requestAnimationFrame);if(!document.querySelector('[data-conditional-phase]')&&!document.getAnimations().some(a=>a.effect?.getTiming().iterations!==Infinity&&(a.playState==='running'||a.pending))){if(++idle===2)return;}else idle=0;}
  throw Error('Motion did not settle');
});
async function audit(name,selector,{keyboard=false,rapid=false,rootSelector}={}){
  await settle();const control=frame.locator(selector);await control.scrollIntoViewIfNeeded();await control.hover();await settle();
  await control.evaluate((control,{rapid,rootSelector})=>{
    const root=rootSelector?document.querySelector(rootSelector):control.closest('dialog[open],.settings-section')||document.body;
    const surfaces=()=>[...root.querySelectorAll('button,input:not([type=checkbox]),select,textarea,label.tool-toggle,.activity-footer,.cost-price-head,.cost-price-rates,.cost-price-identity,.persona-binding-name')];
    const rect=el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
    const intersect=(a,b)=>({left:Math.max(a.left,b.left),right:Math.min(a.right,b.right),top:Math.max(a.top,b.top),bottom:Math.min(a.bottom,b.bottom)});
    function painted(el){
      if(!el.getClientRects().length||el.closest('details:not([open])'))return null;
      let box=rect(el),opacity=1;
      for(let node=el;node&&node!==root.parentElement;node=node.parentElement){
        const style=getComputedStyle(node);opacity*=Number(style.opacity);
        if(style.visibility==='hidden'||style.display==='none'||opacity<.025)return null;
        const r=rect(node),width=r.right-r.left,height=r.bottom-r.top;
        const inset=style.clipPath.match(/^inset\((.*)\)$/);
        if(inset){const parts=inset[1].match(/calc\([^)]*\)|[^\s]+/g),values=parts.length===1?[parts[0],parts[0],parts[0],parts[0]]:parts.length===2?[...parts,...parts]:parts.length===3?[...parts,parts[1]]:parts;
          const lengths=values.map((v,i)=>{const terms=[...v.matchAll(/([+-]?\s*\d*\.?\d+)(px|%)/g)];return terms.length?terms.reduce((n,m)=>n+Number(m[1].replace(/\s/g,''))*(m[2]==='%'?(i%2?width:height)/100:1),0):parseFloat(v);});
          box=intersect(box,{top:r.top+lengths[0],right:r.right-lengths[1],bottom:r.bottom-lengths[2],left:r.left+lengths[3]});}
        const margin=style.overflowX==='clip'||style.overflowY==='clip'?parseFloat(style.overflowClipMargin)||0:0;
        if(/clip|hidden|auto|scroll/.test(style.overflowX)){box.left=Math.max(box.left,r.left-margin);box.right=Math.min(box.right,r.right+margin);}
        if(/clip|hidden|auto|scroll/.test(style.overflowY)){box.top=Math.max(box.top,r.top-margin);box.bottom=Math.min(box.bottom,r.bottom+margin);}
      }
      return box.right-box.left>1&&box.bottom-box.top>1?box:null;
    }
    const name=el=>el.getAttribute('aria-label')||el.textContent.trim().slice(0,55)||el.name||el.className;
    let initial=rect(control);const height=control.offsetHeight,width=control.offsetWidth;
    const layout=()=>[...root.children].map(el=>({name:el.className||el.tagName,rect:rect(el),text:el.tagName==='P'?el.textContent:undefined}));let initialLayout=layout();
    // The browser may first scroll an iframe into the outer viewport. Compare
    // the state update with the actual click position, after that native scroll.
    control.addEventListener('click',()=>{initial=rect(control);initialLayout=layout();},{capture:true,once:true});
    window.associatedAudit=new Promise((resolve,reject)=>control.addEventListener('click',()=>{
      const samples=[];let index=0,reversals=0;
      function sample(){
        const failures=[],nodes=surfaces().map(el=>({el,box:painted(el)})).filter(item=>item.box);
        for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
          const a=nodes[i],b=nodes[j];if(a.el.contains(b.el)||b.el.contains(a.el))continue;
          const overlap=intersect(a.box,b.box),w=overlap.right-overlap.left,h=overlap.bottom-overlap.top;
          if(w>2&&h>2)failures.push({kind:'paint-overlap',a:name(a.el),b:name(b.el),w,h});
        }
        const button=rect(control);
        if(control.offsetHeight!==height)failures.push({kind:'stretched',before:height,after:control.offsetHeight});
        if(index===0&&(Math.abs(button.top-initial.top)>2||Math.abs(button.left-initial.left)>2))failures.push({kind:'click-jump',initial,button,initialLayout,layout:layout()});
        samples.push({index,button,root:rect(root),failures});
        if(rapid&&[3,5,7,9].includes(index)){control.click();reversals++;}
        if(index>5&&!root.querySelector('[data-conditional-phase]')&&!document.getAnimations().some(a=>a.effect?.getTiming().iterations!==Infinity&&(a.playState==='running'||a.pending))&&(!rapid||reversals===4)){resolve({samples,height,width});return;}
        if(++index>240){reject(Error('Associated controls did not settle'));return;}
        requestAnimationFrame(sample);
      }
      sample();
    },{once:true}));
  },{rapid,rootSelector});
  if(keyboard)await control.press('Space');else await control.click();
  const result=await control.evaluate(()=>window.associatedAudit);results.push({name,keyboard,rapid,...result});
  const failures=result.samples.flatMap(s=>s.failures.map(x=>({frame:s.index,...x})));
  assert.deepEqual(failures.slice(0,6),[],name+' has '+failures.length+' paint/layout failures');
}
async function pair(name,selector,options={}){
  await audit(name+'-mouse',selector,options);await audit(name+'-keyboard-reverse',selector,{...options,keyboard:true,rapid:true});
}
try{
  for(const width of [1360,560,400]){
    await page.setViewportSize({width,height:1100});await settingsSection(frame,'access');
    for(const[kind,label]of [['groups','从QQ 群列表选择'],['private','从好友列表选择']]){
      await frame.getByRole('button',{name:label,exact:true}).click();const dialog=frame.locator('dialog.settings-list-choice');await dialog.waitFor();
      await pair(width+'-allow-'+kind,'dialog.settings-list-choice .allow-all-toggle');
      await dialog.getByRole('button',{name:'取消',exact:true}).click();
    }
    await settingsSection(frame,'search');await pair(width+'-search','.search-enabled-toggle');
    await settingsSection(frame,'memory');await pair(width+'-memory-cooldown','[aria-controls=memory-consolidate-cooldown]');await pair(width+'-memory-model','[aria-controls=memory-model-choice]');
    await settingsEditor(frame,'model-config');await pair(width+'-image','[data-model-media=vision] > button');await pair(width+'-video','[data-model-media=video] > button');
    await settingsSection(frame,'prices');await pair(width+'-prices','.cost-price-toggle');
    await settingsEditor(frame,'tier-params');await pair(width+'-chat-active','.chat-active-toggle');
    await settingsSection(frame,'chat');await openSettingsFold(frame,'layout-mute');await pair(width+'-mute','.command-mute-toggle');
    await openSettingsFold(frame,'layout-proactive');await pair(width+'-proactive','.proactive-toggle');
    await openSettingsFold(frame,'layout-sticker');
    await pair(width+'-sticker-context','[data-path="sticker.enabled"]');await pair(width+'-sticker-collect','[data-path="sticker.collectEnabled"]');
    await pair(width+'-activity','[data-path="store.unifiedTier"]');
    await settingsSection(frame,'persona');await pair(width+'-persona','.persona-unified-toggle');
  }
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);
}catch(error){if(evidence)await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});throw error;}
finally{if(evidence)fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({checks:results.length,results},null,2));await f.close();}
console.log('✓ 284 '+results.length+' mouse/keyboard/rapid reversal checks include painted outgoing content, associated controls and moving footers, with zero external requests');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {settingsSection,settingsEditor,openSettingsFold} from './settings-navigation.mjs';

const evidence=process.env.QA283_EVIDENCE,results=[];
if(evidence)fs.mkdirSync(evidence,{recursive:true});
const f=await modelUiFixture({config:{personaUnified:false,api:{vision:true,video:true,useOfficialPrice:false},memory:{consolidateEnabled:true,useChatModel:false},webSearch:{enabled:false},commandMute:{enabled:true},proactive:{enabled:true}}}),{page,frame}=f;
const settle=()=>frame.locator('body').evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished));});
async function flushForm(selector){
  if(selector.includes('store.unifiedTier')||await frame.locator('dialog.settings-list-choice[open]').count())return;
  if(!/未保存|保存中/.test(await frame.locator('#status').textContent()))return;
  const editor=frame.locator('dialog[data-settings-editor][open]').last();
  if(await editor.count()&&await editor.locator('[data-settings-save]').count()){await editor.locator('[data-settings-save]').click();await editor.locator('.settings-dialog-status').filter({hasText:'已保存'}).waitFor();}
  else{await frame.locator('#save').click();await frame.locator('#status').filter({hasText:'已保存'}).waitFor();}
  await settle();
}
async function audit(name,selector,targets,want,{keyboard=false,rapid=false}={}){
  await flushForm(selector);await settle();
  const control=frame.locator(selector),viewport=page.viewportSize(),host=await page.locator('#panel-host iframe').boundingBox();
  const bounds={left:Math.max(1,-host.x+1),top:Math.max(1,-host.y+1),right:Math.min(host.width-1,viewport.width-host.x-1),bottom:Math.min(host.height-1,viewport.height-host.y-1)};
  // The sandboxed panel can be taller than the visible host. Scroll within
  // that actual visible range instead of treating the full iframe as visible.
  await control.evaluate((el,bounds)=>{
    const rect=el.getBoundingClientRect();let delta=rect.y+rect.height/2-(bounds.top+bounds.bottom)/2;
    for(let node=el.parentElement;node;node=node.parentElement){const style=getComputedStyle(node);if(!/auto|scroll/.test(style.overflowY)||node.scrollHeight<=node.clientHeight)continue;const before=node.scrollTop;node.scrollTo({top:before+delta,behavior:'instant'});delta-=node.scrollTop-before;}
    window.scrollTo({top:scrollY+delta,behavior:'instant'});
  },bounds);await control.hover();await settle();
  await control.evaluate((control,{targets,want,rapid,bounds})=>{
    const root=control.closest('dialog[open]')||control.closest('.settings-section')||document.body;
    // Stay inside the painted border: subpixel hit testing at < 1px can round
    // outside a pressed/scaled control. Full border bounds are checked below.
    const points=el=>{const r=el.getBoundingClientRect();return[1,1.5,3].flatMap(d=>[[r.x+r.width/2,r.y+d],[r.x+r.width/2,r.bottom-d],[r.x+d,r.y+r.height/2],[r.right-d,r.y+r.height/2]]);};
    const hit=(el,p)=>{const found=document.elementFromPoint(...p);return found===el||el.contains(found);};
    const visible=p=>p[0]>=bounds.left&&p[1]>=bounds.top&&p[0]<Math.min(innerWidth-1,bounds.right)&&p[1]<Math.min(innerHeight-1,bounds.bottom);
    const candidates=[...new Set([control,...root.querySelectorAll('button')])].filter(el=>el===control||!el.closest('.settings-conditional'));
    const probes=candidates.filter(el=>el.getClientRects().length&&points(el).every(p=>visible(p)&&hit(el,p))).map(el=>({el,name:el.getAttribute('aria-label')||el.textContent.trim().slice(0,70),height:el.offsetHeight}));
    if(!probes.some(p=>p.el===control))throw Error('Switch must start fully visible: '+JSON.stringify({name:control.textContent,rect:control.getBoundingClientRect(),bounds,innerHeight,points:points(control).map(p=>({p,visible:visible(p),hit:document.elementFromPoint(...p)?.className}))}));
    window.controlVisibilityAudit=new Promise((resolve,reject)=>control.addEventListener('click',()=>{
      const samples=[];let count=0,reversed=0;
      function sample(){
        const failures=[];
        for(const probe of probes){
          const {el}=probe;if(!el.isConnected||!el.getClientRects().length)continue;
          if(Math.abs(el.offsetHeight-probe.height)>.5)failures.push({name:probe.name,kind:'stretched',before:probe.height,after:el.offsetHeight});
          for(const[i,p]of points(el).entries())if(visible(p)&&!hit(el,p))failures.push({name:probe.name,kind:'occluded',edge:i,point:p,cover:document.elementFromPoint(...p)?.className});
        }
        // Pointer hit testing does not include the keyboard focus outline.
        // Check that the animated clipping box also leaves that paint intact.
        const style=getComputedStyle(control),ring=control.matches(':focus-visible')?parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset):0,r=control.getBoundingClientRect();
        for(let node=control.parentElement;node;node=node.parentElement){
          if(node.style.overflowX!=='clip'&&node.style.overflowY!=='clip')continue;
          const box=node.getBoundingClientRect(),margin=parseFloat(getComputedStyle(node).overflowClipMargin)||0;
          if(r.top-ring<box.top-margin-.1||r.left-ring<box.left-margin-.1||r.bottom+ring>box.bottom+margin+.1||r.right+ring>box.right+margin+.1)failures.push({kind:ring?'focus-clipped':'border-clipped',parent:node.className,ring,margin});
        }
        samples.push({frame:count,buttonHeight:control.offsetHeight,failures});
        if(rapid&&[3,5,7,9].includes(count)){control.click();reversed++;}
        const done=targets.every(selector=>{const el=document.querySelector(selector);return el&&el.hidden===!want;})&&!root.querySelector('[data-conditional-phase]')&&!document.getAnimations().some(a=>a.effect?.getTiming().iterations!==Infinity&&(a.playState==='running'||a.pending));
        if(count>4&&done&&(!rapid||reversed===4)){resolve({samples,probes:probes.map(({name,height})=>({name,height}))});return;}
        if(++count>240){reject(Error('Visibility audit did not settle'));return;}
        requestAnimationFrame(sample);
      }
      sample();
    },{once:true}));
  },{targets,want,rapid,bounds});
  if(keyboard)await control.press('Space');else await control.click();
  const result=await control.evaluate(()=>window.controlVisibilityAudit);results.push({name,keyboard,rapid,...result});
  const failures=result.samples.flatMap(s=>s.failures.map(f=>({frame:s.frame,...f})));
  assert.deepEqual(failures.slice(0,10),[],name+' must keep every persistent control fully visible and at its original height ('+failures.length+' failed points)');
  await flushForm(selector);
}
async function pair(name,selector,targets,firstWant){
  await audit(name+'-mouse',selector,targets,firstWant);
  await audit(name+'-keyboard-reverse',selector,targets,!firstWant,{keyboard:true,rapid:true});
}
try{
  for(const width of [1360,560]){
    await page.setViewportSize({width,height:1000});await settingsSection(frame,'search');
    await pair(width+'-search','.search-enabled-toggle',['#search-service-options'],true);
    await settingsSection(frame,'memory');
    await pair(width+'-memory-cooldown','[aria-controls=memory-consolidate-cooldown]',['#memory-consolidate-cooldown'],false);
    await pair(width+'-memory-model','[aria-controls=memory-model-choice]',['#memory-model-choice'],false);
    await settingsEditor(frame,'model-config');
    await pair(width+'-image','[data-model-media=vision] > button',['[data-model-media=vision] .model-media-slide'],false);
    await pair(width+'-video','[data-model-media=video] > button',['[data-model-media=video] .model-media-slide','[data-path="api.videoMode"]'],false);
    await settingsSection(frame,'prices');
    await audit(width+'-manual-prices','.cost-price-toggle',['.cost-manual-fields'],false);
    await audit(width+'-official-prices','.cost-price-toggle',['.cost-price-summary'],false,{keyboard:true,rapid:true});
    await settingsSection(frame,'chat');await openSettingsFold(frame,'layout-mute');
    await pair(width+'-mute','.command-mute-toggle',['#command-mute-options'],false);
    await pair(width+'-quiet-chat','[data-quiet-chat="group:10001"]',[],false);
    await openSettingsFold(frame,'layout-proactive');
    await pair(width+'-proactive','.proactive-toggle',['#proactive-options'],false);
    await pair(width+'-activity','[data-path="store.unifiedTier"]',['.activity-group-area'],true);
    await settingsSection(frame,'persona');await frame.locator('[data-persona-binding="group:10001"]').waitFor();
    await pair(width+'-persona','.persona-unified-toggle',['[data-persona-binding="group:10001"]'],false);
    await settingsSection(frame,'access');
    for(const[kind,label]of [['groups','从QQ 群列表选择'],['private','从好友列表选择']]){
      await frame.getByRole('button',{name:label,exact:true}).click();const dialog=frame.locator('dialog.settings-list-choice');await dialog.waitFor();
      await pair(width+'-allow-'+kind,'dialog.settings-list-choice .allow-all-toggle',['dialog.settings-list-choice .list-choice-options'],false);
      await dialog.getByRole('button',{name:'取消',exact:true}).click();
    }
  }
  assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);
}catch(error){if(evidence)await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});throw error;}
finally{if(evidence)fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({checks:results.length,results},null,2));await f.close();}
console.log('✓ 283 '+results.length+' mouse/keyboard checks keep persistent controls visible and un-stretched across wide/narrow layouts, including rapid reversals and both allow-list dialogs; zero external requests');

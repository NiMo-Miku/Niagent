import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {modelUiFixture} from './model-ui-fixture.mjs';
import {settingsSection} from './settings-navigation.mjs';

const evidence=process.env.QA287_EVIDENCE,checks=[];
if(evidence)fs.mkdirSync(evidence,{recursive:true});
const ids=['a','b','c'].map(c=>'custom_'+c.repeat(32));
const personas=ids.map((id,i)=>({id,name:['待删除的人设','保留的人设','并发修改的人设'][i],text:'ROLE_'+i,customRules:'RULES_'+i,metadata:{keep:i}}));
const selected={roleText:personas[0].text,customRules:personas[0].customRules,templateId:ids[0],templateName:personas[0].name};
const f=await modelUiFixture({config:{personaUnified:false,persona:{...selected,botName:'ACCOUNT_287'},personaByChat:{'group:10001':{...selected,metadata:{keep:true}}},customPersonas:personas}}),{page,frame}=f;
const manager=frame.locator('dialog.persona-manager'),entry=id=>manager.locator(`[data-persona-entry="${id}"]`),remove=id=>manager.locator(`[data-persona-delete="${id}"]`),input=name=>manager.locator(`[name="${name}"]`);
const open=async()=>{await frame.getByRole('button',{name:'人设管理',exact:true}).click();await manager.locator('[data-persona-add]').waitFor();};
const close=()=>manager.locator('.settings-dialog-head button').click();
const del=async id=>{await remove(id).click();await remove(id).click();};
const deletes=()=>f.writes.filter(r=>r.method==='DELETE'&&r.path.startsWith('/api/persona-templates/'));
const shot=async name=>{if(evidence)await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});};
const until=async test=>{for(let i=0;i<240;i++){if(await test())return;await new Promise(r=>setTimeout(r,16));}throw Error('Persona deletion did not settle');};
try{
  await settingsSection(frame,'persona');await frame.locator('[data-persona-binding="group:10001"]').waitFor();await open();
  assert.equal(await manager.locator('[data-persona-delete]').count(),3);assert.equal(await remove('xiaojingyu').count(),0);
  await remove(ids[2]).click();assert.equal(deletes().length,0);await page.keyboard.press('Escape');await manager.waitFor({state:'detached'});assert.equal(deletes().length,0);assert.equal(f.disk().customPersonas.length,3);
  checks.push('only custom personas have a sidebar delete button; one confirmation click and Escape never delete');

  await open();await entry(ids[1]).click();await input('text').fill('UNSAVED_OTHER_PERSONA_287');await input('text').evaluate(el=>window.personaDraftInput287=el);
  await remove(ids[0]).evaluate(el=>window.personaRemove287=el);await remove(ids[0]).click();assert.equal(deletes().length,0);
  // Redrawing the sidebar must retain the armed control and the editor draft.
  await entry(ids[1]).click();assert.equal(await remove(ids[0]).evaluate(el=>el===window.personaRemove287),true);
  await input('text').evaluate(el=>window.personaDraftInput287=el);
  const before=f.disk();await remove(ids[0]).click();await entry(ids[0]).waitFor({state:'detached'});await manager.getByRole('status').filter({hasText:'人设已删除'}).waitFor();
  assert.equal(deletes().length,1);assert.equal(f.disk().customPersonas.length,2);assert.equal(await input('text').inputValue(),'UNSAVED_OTHER_PERSONA_287');
  assert.equal(await input('text').evaluate(el=>el===window.personaDraftInput287),true);
  // Selecting the same editor redraws its inputs, but deletion of a different
  // persona must keep the then-current input node and its contents intact.
  assert.deepEqual(f.disk().persona,before.persona);assert.deepEqual(f.disk().personaByChat,before.personaByChat);assert.deepEqual(f.disk().customPersonas,personas.slice(1));
  assert.equal(await remove('current-global').count(),0);assert.equal(await entry('current-global').count(),1);
  checks.push('confirmed deletion uses the stable ID/revision once, retains other drafts, metadata and existing global/chat prompt copies');

  await input('text').evaluate(el=>window.personaDraftInput287=el);
  const failure=route=>route.request().method()==='DELETE'?route.fulfill({status:503,json:{error:'合成删除失败'}}):route.continue();
  await page.route(f.base+`/api/persona-templates/${ids[1]}`,failure);await del(ids[1]);await manager.getByRole('status').filter({hasText:'输入已保留'}).waitFor();
  assert.equal(await input('text').inputValue(),'UNSAVED_OTHER_PERSONA_287');assert.equal(await input('text').evaluate(el=>el===window.personaDraftInput287),true);assert.equal(f.disk().customPersonas.length,2);assert.equal(await remove(ids[1]).isEnabled(),true);await page.unroute(f.base+`/api/persona-templates/${ids[1]}`,failure);
  f.kernel.config.update({customPersonas:f.kernel.config.get().customPersonas.map(p=>p.id===ids[2]?{...p,text:'CONCURRENT_UPDATE_287'}:p)});
  await del(ids[2]);await manager.getByRole('status').filter({hasText:'人设已变更或标识已过期'}).waitFor();assert.equal(f.disk().customPersonas.length,2);assert.equal(f.disk().customPersonas.find(p=>p.id===ids[2]).text,'CONCURRENT_UPDATE_287');assert.equal(await input('text').inputValue(),'UNSAVED_OTHER_PERSONA_287');
  checks.push('failed and stale deletes retain the persona, active draft and usable controls');
  await close();

  for(const width of [1360,560,400]){
    await page.setViewportSize({width,height:1000});await open();await entry(ids[2]).click();await remove(ids[2]).scrollIntoViewIfNeeded();
    const geometry=await remove(ids[2]).evaluate(button=>{
      const row=button.parentElement,pick=row.querySelector('[data-persona-entry]'),b=button.getBoundingClientRect(),p=pick.getBoundingClientRect(),d=button.closest('dialog').getBoundingClientRect();
      const points=[[b.left+1.5,b.top+b.height/2],[b.right-1.5,b.top+b.height/2],[b.left+b.width/2,b.top+1.5],[b.left+b.width/2,b.bottom-1.5]];
      return{gap:b.left-p.right,height:b.height,pickHeight:p.height,overflow:button.closest('dialog').scrollWidth-button.closest('dialog').clientWidth,right:d.right,viewport:innerWidth,hits:points.every(point=>{const el=document.elementFromPoint(...point);return el===button||button.contains(el);})};
    });
    assert.ok(geometry.gap>=6);assert.ok(Math.abs(geometry.height-geometry.pickHeight)<1);assert.ok(geometry.overflow<=1);assert.ok(geometry.right<=geometry.viewport+1);assert.equal(geometry.hits,true);
    await shot('sidebar-'+width);
    if(width===400){await del(ids[2]);await entry(ids[2]).waitFor({state:'detached'});await manager.getByRole('status').filter({hasText:'人设已删除'}).waitFor();assert.equal(f.disk().customPersonas.length,1);assert.equal(await input('text').inputValue(),before.persona.roleText);}
    await close();
  }
  await page.setViewportSize({width:1360,height:1000});await open();assert.equal(await remove(ids[2]).count(),0);assert.equal(await remove(ids[1]).count(),1);assert.equal(await input('customRules').locator('..').locator('span').textContent(),'系统提示词');assert.match(await input('customRules').locator('..').textContent(),/需要遵循的系统指令/);
  assert.deepEqual(f.disk().persona,before.persona);assert.deepEqual(f.disk().personaByChat,before.personaByChat);assert.deepEqual(f.errors,[]);assert.equal(f.outbound(),0);await shot('complete');
  checks.push('wide/narrow sidebar actions share height, stay separated and hittable; selected deletion falls back safely; reopening persists removal; optional-rule help is visible');
}catch(error){await shot('failure');throw error;}finally{await f.close();}
if(evidence)fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks},null,2));
for(const check of checks)console.log('✓ 287 '+check);

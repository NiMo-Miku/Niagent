// The host supplies trusted navigation metadata; kind/id alone cannot prove a
// page still implements the default UI. This entire policy is an overridable
// shell asset, independent of the registry's normal navigation lifecycle.
import {allChatsAllowed} from '../panels/chat-access.js';
export function chooseStartupTarget({panels,config}){
  if(!Array.isArray(panels)||!panels.length||!config||typeof config!=='object'||Array.isArray(config))return null;
  const first=panels[0];
  if(first.kind!=='bundled'||first.navigation?.source!=='defaults'||first.navigation?.home!==true)return null;
  let validAddress=false;
  try{validAddress=['http:','https:'].includes(new URL(String(config.api?.baseUrl||'').trim()).protocol);}catch{}
  const modelReady=validAddress&&typeof config.api?.model==='string'&&Boolean(config.api.model.trim());
  const hasAllowed=[config.allow?.groups,config.allow?.private].some(ids=>Array.isArray(ids)&&ids.some(id=>/^[1-9]\d{0,14}$/.test(String(id))));
  if(modelReady&&(hasAllowed||allChatsAllowed(config,'group')||allChatsAllowed(config,'private')))return null;
  const section=modelReady?'access':'models';
  const target=panels.find(panel=>panel.kind==='bundled'&&panel.navigation?.role==='configuration'&&Array.isArray(panel.navigation.sections)&&panel.navigation.sections.includes(section));
  return target?{id:target.id,section}:null;
}

export function createStartupNavigation({choose=chooseStartupTarget,timeout=800}={}){
  let attempted=false,interacted=false,closed=false,epoch=0,interrupt=null;
  const current=(ticket,isCurrent)=>!closed&&!interacted&&ticket===epoch&&isCurrent();
  return Object.freeze({
    get attempted(){return attempted;},
    get interacted(){return interacted;},
    navigate(){interacted=true;++epoch;interrupt?.();},
    async select({panels,readConfig,isCurrent=()=>true}){
      if(attempted||closed||interacted||!isCurrent())return null;
      attempted=true;const ticket=epoch;let done=false,timer;
      const canceled=new Promise(resolve=>{
        interrupt=()=>{done=true;resolve(null);};
        timer=setTimeout(interrupt,Math.max(1,Math.min(2000,Number(timeout)||800)));
      });
      const decision=Promise.resolve().then(()=>readConfig()).then(config=>{
        if(done||!current(ticket,isCurrent))return null;
        return choose({panels,config});
      }).catch(()=>null);
      try{
        const target=await Promise.race([decision,canceled]);
        if(done||!current(ticket,isCurrent))return null;
        return target&&typeof target==='object'&&panels.some(panel=>panel.id===target.id)?target:null;
      }finally{done=true;clearTimeout(timer);interrupt=null;}
    },
    dispose(){closed=true;++epoch;interrupt?.();},
  });
}

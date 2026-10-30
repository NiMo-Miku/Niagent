// Default synchronous policy. Empty/invalid per-chat fields inherit the global
// persona; the four supported overrides cannot replace account identity.
export function personaForChat(c,chatKey){
  const global=c?.persona||{},base={botName:global.botName,roleText:global.roleText,participation:global.participation,customRules:global.customRules,systemPromptOverride:global.systemPromptOverride};
  if(c?.personaUnified!==false)return base;
  const id=String(chatKey).split(':').pop(),per=c.personaByChat?.[id]??c.personaByChat?.[chatKey];
  if(!per||typeof per!=='object'||Array.isArray(per))return base;
  for(const key of ['roleText','customRules','systemPromptOverride'])if(typeof per[key]==='string'&&per[key].trim())base[key]=per[key].trim();
  if(['low','medium','high'].includes(per.participation))base.participation=per.participation;
  return base;
}

// New per-kind flags override the historical empty-list policy. Missing flags
// retain old configurations without rewriting their saved lists or permissions.
export function allChatsAllowed(cfg,kind){
  if(kind!=='group'&&kind!=='private')return false;
  const key=kind==='group'?'groups':'private',flag=cfg?.allow?.[kind==='group'?'allGroups':'allPrivate'];
  return flag!==undefined?flag===true:cfg?.allowAllWhenEmpty===true&&!(cfg?.allow?.[key]?.length);
}
export function chatAllowed(cfg,kind,id){
  if(kind!=='group'&&kind!=='private')return false;
  const key=kind==='group'?'groups':'private',has=list=>Array.isArray(list)&&list.map(String).includes(String(id));
  return !has(cfg?.deny?.[key])&&(allChatsAllowed(cfg,kind)||has(cfg?.allow?.[key]));
}

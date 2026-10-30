// Browser view of the optional per-kind configuration, including legacy files.
export function allChatsAllowed(cfg,kind){
  if(kind!=='group'&&kind!=='private')return false;
  const key=kind==='group'?'groups':'private',flag=cfg?.allow?.[kind==='group'?'allGroups':'allPrivate'];
  return flag!==undefined?flag===true:cfg?.allowAllWhenEmpty===true&&!(cfg?.allow?.[key]?.length);
}

// Presentation scope for the memory/archive browser. It does not delete data
// or change runtime admission. Explicit per-kind all modes include stored chats;
// the historical empty-list runtime switch keeps its original display scope.
export function chatWhitelistKeys(cfg) {
  const keys=new Set();
  for(const [kind,list]of [['group',cfg?.allow?.groups],['private',cfg?.allow?.private]]){
    for(const value of Array.isArray(list)?list:[]){
      if(typeof value!=='string'&&!(typeof value==='number'&&Number.isSafeInteger(value)))continue;
      const id=String(value).trim();if(/^[1-9]\d{0,14}$/.test(id))keys.add(`${kind}:${id}`);
    }
  }
  return keys;
}
export function chatIsVisible(cfg,key){
  const match=/^(group|private):[1-9]\d{0,14}$/.exec(key??'');
  if(!match)return false;
  return cfg?.allow?.[match[1]==='group'?'allGroups':'allPrivate']===true||chatWhitelistKeys(cfg).has(key);
}

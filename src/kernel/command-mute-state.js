// Historical numeric keys belong to groups. Private chats have an explicit
// namespace so equal QQ/group numbers never share their quiet state.
export function commandMuteKey(chatKey){
  const match=/^(group|private):([1-9]\d{0,14})$/.exec(String(chatKey??''));
  return match?(match[1]==='group'?match[2]:`private:${match[2]}`):null;
}
export function commandMuteUntil(active,chatKey){
  const key=commandMuteKey(chatKey);if(!key||!active||!Object.hasOwn(active,key))return null;
  const raw=active[key];if(typeof raw!=='number'&&(typeof raw!=='string'||!raw.trim()))return null;
  const value=Number(raw);return Number.isFinite(value)&&value>=0?value:null;
}
export function isChatQuiet(commandMute,chatKey,now=Date.now()){
  if(commandMute?.enabled===false)return false;
  const until=commandMuteUntil(commandMute?.active,chatKey);return until!==null&&(until===0||until>now);
}

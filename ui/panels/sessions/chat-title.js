// Keep identifiers in data/API values, and names in the reading interface.
// This default leaf is replaceable with an ordinary ui.assets contribution.
export function formatSessionChat(session = {}) {
  const name=typeof session.chatName==='string'?session.chatName.trim():'';
  return name || (String(session.chatKey??'').startsWith('private:')?'私聊':'群聊');
}

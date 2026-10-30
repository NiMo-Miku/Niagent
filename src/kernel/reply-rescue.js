// Optional reply providers only propose an ordinary tool call. No provider means
// silence; this module never sends, edits prose or lends out model credentials.
const NAMES = ['reply.is-planning-text', 'reply.loose-send', 'reply.salvage-lines', 'reply.salvage', 'reply.grounded-select'];
const pick = (capabilities, name) => capabilities?.providers?.(name)?.[0] ?? null;
export const replyModelReference = api => Object.fromEntries(['baseUrl', 'model', 'provider', 'timeoutMs']
  .filter(key => ['string', 'number'].includes(typeof api?.[key])).map(key => [key, api[key]]));

export async function rescueUnsentReply({text, trigger = '', sent = [], api = null, capabilities,
  signal, timeoutMs = 30000, state = {}, log = console} = {}) {
  const body = typeof text === 'string' ? text.trim() : '';
  const empty = () => ({calls: [], valid: () => false});
  if (!body || signal?.aborted) return empty();
  const selected = new Map(NAMES.map(name => {
    const row = pick(capabilities, name);
    return [name, row && typeof row.provider === 'function' ? {...row, version: capabilities?.version?.(name, row.ownerId)} : null];
  }));
  if (!['reply.loose-send', 'reply.salvage-lines', 'reply.salvage'].some(name => selected.get(name))) return empty();
  const controller = new AbortController();
  let handedOff = false, disposed = false;
  const valid = () => !disposed && !signal?.aborted && !controller.signal.aborted && NAMES.every(name => {
    const initial = selected.get(name), current = pick(capabilities, name);
    return initial ? current?.provider === initial.provider && current?.ownerId === initial.ownerId
      && capabilities?.version?.(name, initial.ownerId) === initial.version : !current || typeof current.provider !== 'function';
  });
  const abort = () => controller.abort(signal?.reason ?? new Error('回复整理已取消'));
  signal?.addEventListener('abort', abort, {once:true});
  const unsubscribe = capabilities?.onChange?.(() => {if (!valid()) controller.abort(new Error('回复提供者已变更'));});
  const delay = Number(timeoutMs), timer = setTimeout(() => controller.abort(new Error('回复整理超时')),
    Number.isFinite(delay) && delay > 0 ? Math.min(delay,180000) : 30000);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);unsubscribe?.();signal?.removeEventListener('abort',abort);
    // A registry timeout may settle before its queued work. Keep that work
    // canceled after releasing this lease; acknowledged sends stay recorded.
    controller.abort(new Error('回复提案已结束'));
  };
  let onAbort;
  const canceled = new Promise((_,reject) => {
    onAbort = () => reject(controller.signal.reason ?? new Error('回复整理已取消'));
    controller.signal.addEventListener('abort',onAbort,{once:true});
  });
  // An already aborted caller can arrive between the initial check and listener.
  if (signal?.aborted) abort();
  const invoke = async (name,payload) => {
    if (!valid()) throw new Error('回复提供者已变更或操作已取消');
    const row = selected.get(name); if (!row) return null;
    const value = await Promise.race([Promise.resolve().then(() => {
      if (!valid()) throw new Error('回复提供者已变更或操作已取消');
      return row.provider({...payload,signal:controller.signal});
    }),canceled]);
    if (!valid()) throw new Error('回复提供者已变更或操作已取消');
    return value;
  };
  // The default SendQueue acknowledges {index,text,msgId,at}, without type.
  // Older providers may still supply explicitly typed text receipts.
  const acknowledged = (Array.isArray(sent) ? sent : []).filter(item=>
    (item?.type == null || item.type==='text') && typeof item?.text==='string');
  const textSent = acknowledged.map(item=>item.text);
  const messagesOf = value => Array.isArray(value) ? value.filter(item=>typeof item==='string'&&item.trim()).map(item=>item.trim()) : [];
  try {
    if (selected.get('reply.is-planning-text') && (await invoke('reply.is-planning-text',{text:body}))?.planning) return empty();
    const grounded = selected.get('reply.grounded-select');
    if (grounded) {
      const previous=state.grounded;
      if (!previous || previous.provider!==grounded.provider || previous.version!==grounded.version) {
        await invoke('reply.grounded-select',{reset:true});
        state.grounded=grounded;
      }
      await invoke('reply.grounded-select',{remember:body});
    }
    let messages=[];
    if (selected.get('reply.loose-send')) {
      try { messages=messagesOf((await invoke('reply.loose-send',{text:body}))?.messages); }
      catch(error) {if(!valid())throw error;log.warn?.(`[reply] loose-send 失败：${error?.message??error}`);}
    }
    const model = replyModelReference(api);
    if (!messages.length && selected.get('reply.salvage-lines')) {
      try {
        const decision=await invoke('reply.salvage-lines',{text:body,trigger,alreadySent:textSent,api:model});
        if (decision?.say===true) messages=messagesOf(decision.messages);
      } catch(error) {if(!valid())throw error;log.warn?.(`[reply] salvage-lines 失败：${error?.message??error}`);}
    }
    if (!messages.length && selected.get('reply.salvage')) {
      const decision=await invoke('reply.salvage',{text:body,trigger,api:model});
      if (decision?.say===true) messages=messagesOf(decision.messages);
    }
    if (!messages.length) return empty();
    if (grounded) {
      const decision=await invoke('reply.grounded-select',{proposed:messages,sent:acknowledged.map(item=>({type:'text',text:item.text}))});
      if (decision?.enabled===true) messages=messagesOf(decision.picked);
    }
    // Independent of optional grounding: only exact original phrases, and no
    // repeat of an acknowledged phrase. The provider cannot invent a new reply.
    messages=[...new Set(messages)].filter(message=>body.includes(message)&&!textSent.some(old=>old.trim()===message));
    if (!messages.length || !valid()) return empty();
    handedOff = true;
    return {calls:[{name:'send_message',arguments:JSON.stringify({messages})}],valid,signal:controller.signal,dispose};
  } catch(error) {
    log.warn?.(`[reply] 保留未发送正文：${error?.message??error}`);
    return empty();
  } finally {
    // The decision timeout ends here; the provider/caller lease remains alive
    // through permission waits and the actual send queue, until the consumer
    // disposes it after the normal tool path settles.
    clearTimeout(timer);
    controller.signal.removeEventListener('abort',onAbort);
    // Every cancellation rejection also has a handler when no provider awaits.
    void canceled.catch(()=>{});
    if (!handedOff) dispose();
  }
}

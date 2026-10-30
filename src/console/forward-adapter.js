function cachedForward(entry) {
  if (Array.isArray(entry.forwardMessages)) return { messages: entry.forwardMessages, count: entry.forwardCount ?? entry.forwardMessages.length, cached: true };
  if (String(entry.text).startsWith('[合并转发 共')) return { messages: String(entry.text).split('\n').slice(1).map((text, index) => ({ text, media: index === 0 ? (entry.media ?? []).filter((item) => item.kind === 'image') : [] })), count: Number(/共(\d+)条/.exec(entry.text)?.[1]) || 0, cached: true };
  return null;
}
export async function readArchivedForward({ store, transport, chatKey, localId }) {
  const original = store.recent(chatKey, Number.MAX_SAFE_INTEGER).find((entry) => entry.id === Number(localId));
  if (!original) throw Object.assign(new Error('原消息已从存档移除'), { status: 404, expose: true });
  const cached = cachedForward(original); if (cached) return cached;
  if (original.mid == null) throw new Error('这条转发缺少 QQ 消息 ID');
  if (typeof transport?.actions?.getForward !== 'function') throw new Error('当前协议端不支持展开合并转发');
  const response = await transport.actions.getForward(original.mid);
  const raw = response?.messages ?? response?.nodes;
  if (!Array.isArray(raw) || !raw.length) throw new Error('转发内容为空或已过期');
  const messages = raw.slice(0, 100).map((node) => {
    const media = [], segments = node?.message ?? node?.content;
    const text = (Array.isArray(segments) ? segments : [segments]).map((segment) => {
      if (typeof segment === 'string') return segment;
      const data = segment?.data ?? segment;
      if (segment?.type === 'text') return String(data?.text ?? '');
      if (['image', 'record', 'video'].includes(segment?.type)) media.push({ kind: segment.type, url: data?.url, file: data?.file });
      return segment?.type ? `[${segment.type}]` : '';
    }).join('').slice(0, 5000);
    return { senderName: String(node?.sender?.card ?? node?.sender?.nickname ?? node?.nickname ?? ''), senderId: String(node?.sender?.user_id ?? node?.user_id ?? ''), ts: Number(node.time) * 1000 || null, text, media: media.slice(0, 20) };
  }).filter((message) => message.text.trim() || message.media.length);
  if (!messages.length) throw new Error('转发内容为空或已过期');
  const current = store.findByMid(chatKey, original.mid);
  if (!current || current.id !== original.id) throw Object.assign(new Error('原消息已从存档移除'), { status: 404, expose: true });
  const completed = cachedForward(current); if (completed) return completed;
  const text = messages.slice(0, 30).map((message) => `${message.senderName || message.senderId}：${message.text}`).join('\n').slice(0, 3000);
  store.updateByMid(chatKey, original.mid, { forwardMessages: messages, forwardCount: raw.length, text: `[合并转发 共${raw.length}条]\n${text}`, media: [...(current.media ?? []), ...messages.slice(0, 30).flatMap((message) => message.media).filter((item) => item.kind === 'image')] });
  return { messages, count: raw.length, truncated: raw.length > messages.length };
}

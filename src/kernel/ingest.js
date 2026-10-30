// ingest：消息准入与判定（§6.2 三闸 / §6.3 拍一拍 / §6.4 @ 判定 / 指令禁言 U-03）。
// 任何一闸不过 = 直接丢弃，不存档不留痕迹（存档页根本看不到）。
import { segmentsToText, sanitizeUserText, POKE_TEXT } from './transport.js';
import { isAtMe } from './wake.js';
import { chatAllowed as allowed } from './chat-access.js';

export function effectiveGlobalBlocklist(cfg = {}) {
  const exempt = new Set((cfg.communityExemptions ?? []).map(String));
  return (cfg.globalBlocklist ?? []).map(String).filter(id => !exempt.has(id));
}

function abortable(operation, signal) {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    const cancel = () => reject(Object.assign(new Error('消息处理已取消'), { name: 'AbortError' }));
    if (signal.aborted) { cancel(); Promise.resolve(operation).catch(() => {}); return; }
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

export async function resolveGlobalBlocklist(cfg, source, signal) {
  try {
    if (signal?.aborted) throw Object.assign(new Error('消息处理已取消'), { name: 'AbortError' });
    const result = typeof source === 'function' ? await abortable(Promise.resolve().then(() => source({ signal })), signal) : null;
    const ids = Array.isArray(result) ? result : result?.ok !== false ? result?.ids : null;
    if (Array.isArray(ids) && ids.every(id => typeof id === 'string' || typeof id === 'number' && Number.isFinite(id))) return ids.map(String);
  } catch (error) { if (signal?.aborted) throw error; }
  return effectiveGlobalBlocklist(cfg);
}

async function isGloballyBlocked(cfg, senderId, source, signal) {
  return (await resolveGlobalBlocklist(cfg, source, signal)).includes(String(senderId));
}

function isChatBlocked(cfg, chatId, senderId) {
  const list = cfg?.blocklist?.[String(chatId)];
  return Array.isArray(list) && list.map(String).includes(String(senderId));
}

export function createIngest({
  cfg, store, bus = null, log = console, selfIdOf = () => null,
  transcribe = null, atNameCache = null, selfNicknameOf = () => '',
  nameScopeOf = () => ({ provider: null, account: selfIdOf() }), resolveAtName = null,
  globalBlocklistOf = null,
} = {}) {
  const atName = atNameCache ?? new Map();
  const pendingNames = new Map();
  let scope = null, nameGeneration = 0;
  const readScope = () => {
    const next = nameScopeOf() ?? {};
    if (!scope || next.provider !== scope.provider || next.account !== scope.account || next.signal !== scope.signal) {
      scope = next; nameGeneration++; atName.clear(); pendingNames.clear();
    }
    return scope;
  };
  const remember = (key, name) => {
    if (typeof name !== 'string' || !name.trim()) return;
    atName.delete(key); atName.set(key, name);
    while (atName.size > 500) atName.delete(atName.keys().next().value);
  };

  /** 返回 { accepted, entry?, reason? } —— 拒绝时不留痕。 */
  async function ingestMessage({ kind, id, event, signal }) {
    const c = cfg();
    const senderId = String(event?.user_id ?? event?.sender?.user_id ?? '');
    const selfId = String(selfIdOf() ?? '');
    const owner = readScope(), generation = nameGeneration;
    const current = () => !signal?.aborted && !owner.signal?.aborted && readScope() === owner && generation === nameGeneration;
    if (!current()) return { accepted: false, reason: 'cancelled' };
    const signals = [...new Set([signal, owner.signal].filter(Boolean))];
    const operationSignal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];

    // ① 白名单
    if (!allowed(c, kind, id)) return { accepted: false, reason: 'whitelist' };
    // ② 全局屏蔽
    if (await isGloballyBlocked(c, senderId, globalBlocklistOf, operationSignal)) return { accepted: false, reason: 'global-blocklist' };
    if (!current()) return { accepted: false, reason: 'stale-identity' };
    // ③ 按群屏蔽
    if (kind === 'group' && isChatBlocked(c, id, senderId)) return { accepted: false, reason: 'chat-blocklist' };

    const chatKey = `${kind}:${id}`;
    const rawSegments = Array.isArray(event?.message) ? event.message : null;
    const nameKey = userId => JSON.stringify([kind, String(id), String(userId)]);
    const resolveName = async userId => {
      if (!current()) return null;
      const key = nameKey(userId), cached = atName.get(key);
      if (cached != null) return cached;
      if (kind !== 'group' || typeof resolveAtName !== 'function' || pendingNames.size >= 500) return null;
      let pending = pendingNames.get(key);
      if (!pending) {
        pending = abortable(Promise.resolve().then(() => resolveAtName(String(id), String(userId), { signal: operationSignal })), operationSignal).then(value => {
          const name = typeof value === 'string' ? value : value?.card || value?.nickname;
          if (current()) remember(key, name);
          return current() && typeof name === 'string' && name.trim() ? name : null;
        }, () => null).finally(() => { if (pendingNames.get(key) === pending) pendingNames.delete(key); });
        pendingNames.set(key, pending);
      }
      return pending;
    };

    // segmentsToText（含 media.transcribe 能力与 @ 名片解析）
    const { text: rendered, atMarks, atNames } = rawSegments
      ? await segmentsToText(rawSegments.filter(segment => segment?.type !== 'reply'), { transcribe, resolveAtName: resolveName })
      : await segmentsToText([{ type: 'text', text: String(event?.raw_message ?? '') }], { transcribe, resolveAtName: resolveName });
    // Provider facades are stable objects; the captured provider/account ticket
    // must still match after every asynchronous query, including stop/restart.
    if (!current()) return { accepted: false, reason: 'stale-identity' };

    // 8. @ 判定：有 @ 段以 QQ 号为准（排除 all）；无 @ 段才回落文本匹配
    let atMe;
    if (atMarks.length > 0) {
      atMe = atMarks.some((q) => q !== 'all' && q === selfId);
    } else {
      const configuredNickname = String(c.persona?.selfNickname ?? '').trim();
      atMe = isAtMe(rendered, { ...c.persona, selfNickname: configuredNickname || selfNicknameOf(), selfId });
    }

    const media = [];
    if (rawSegments) {
      for (const s of rawSegments) {
        const data = s?.data ?? s;
        const type = s?.type;
        if (type === 'image') media.push({ kind: 'image', url: data?.url, file: data?.file });
        else if (type === 'record') media.push({ kind: 'record', url: data?.url, file: data?.file });
        else if (type === 'video') media.push({ kind: 'video', url: data?.url, file: data?.file });
        else if (type === 'face') media.push({ kind: 'face', faceId: data?.id });
        else if (type === 'forward') media.push({ kind: 'forward', id: data?.id });
      }
    }

    // 7. 空文本且无媒体 → 丢
    if (!rendered.trim() && media.length === 0) return { accepted: false, reason: 'empty' };

    // 引用摘要（reply 段）
    let reply = null;
    if (rawSegments) {
      const replySeg = rawSegments.find((s) => s?.type === 'reply');
      if (replySeg) {
        const rid = replySeg.data?.id ?? replySeg.id;
        const mid = rid != null && String(rid).trim() && Number.isSafeInteger(Number(rid)) && Number(rid) !== 0 ? Number(rid) : null;
        const src = mid != null ? store.findByMid?.(chatKey, mid) : null;
        reply = src
          ? { mid, sender: src.recalled ? '' : src.senderName, text: src.recalled ? '' : String(src.text ?? '').slice(0, 120) }
          : { mid, sender: '', text: '' };
      }
    }

    const senderName = String(event?.sender?.card || event?.sender?.nickname || senderId || '未知');
    if (senderId && senderName !== senderId) remember(nameKey(senderId), senderName);

    const entry = store.appendIncoming(chatKey, {
      mid: event?.message_id ?? null,
      ts: (Number(event?.time) ? Number(event.time) * 1000 : Date.now()),
      senderId, senderName, text: rendered,
      reply, media, atMe, atNames,
    });
    bus?.emit('chat.update', chatKey);

    // 9. 指令禁言（群聊）：@机器人 && 文本含 commandMute.command → 强制 1 档。指令本身也入库。
    if (kind === 'group' && c?.commandMute?.enabled !== false && atMe) {
      const cmd = String(c?.commandMute?.command ?? '/安静');
      if (cmd && rendered.includes(cmd)) {
        const durMin = Number(c?.commandMute?.durationMin ?? 30);
        const until = durMin > 0 ? Date.now() + durMin * 60_000 : 0; // 0 = 永久
        const active = { ...(c.commandMute.active ?? {}), [String(id)]: until };
        c._muteCommand = cmd; // 传给 config.update 的 __replace__ 语义由调用方处理
        bus?.emit('command.mute', { chatId: String(id), until, command: cmd });
      }
    }
    return { accepted: true, entry, chatKey };
  }

  /** §6.3 拍一拍。 */
  async function ingestPoke(event, { signal } = {}) {
    const c = cfg();
    const chatId = String(event?.group_id ?? event?.user_id ?? '');
    const isGroup = event?.group_id != null;
    const kind = isGroup ? 'group' : 'private';
    const operatorId = String(event?.user_id ?? '');
    const targetId = String(event?.target_id ?? '');
    const selfId = String(selfIdOf() ?? '');
    const owner = readScope(), generation = nameGeneration;
    const current = () => !signal?.aborted && !owner.signal?.aborted && readScope() === owner && generation === nameGeneration;
    if (!current()) return { accepted: false, reason: 'cancelled' };
    const signals = [...new Set([signal, owner.signal].filter(Boolean))];
    const operationSignal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    if (operatorId === selfId) return { accepted: false, reason: 'self-poke' }; // 自己拍的回显丢弃
    if (!allowed(c, kind, chatId)) return { accepted: false, reason: 'whitelist' };
    if (await isGloballyBlocked(c, operatorId, globalBlocklistOf, operationSignal)) return { accepted: false, reason: 'global-blocklist' };
    if (!current()) return { accepted: false, reason: 'stale-identity' };
    if (isGroup && isChatBlocked(c, chatId, operatorId)) return { accepted: false, reason: 'chat-blocklist' };

    const chatKey = `${kind}:${chatId}`;
    const nameOf = (uid) => {
      if (String(uid) === selfId) return '我';
      const recent = store.recent?.(chatKey, 200) ?? [];
      for (let i = recent.length - 1; i >= 0; i--) {
        if (String(recent[i].senderId) === String(uid) && recent[i].senderName) return recent[i].senderName;
      }
      return String(uid);
    };
    // 文案绝不硬编码占位符（曾有"（拍一拍事件）"污染记忆的事故）
    const text = POKE_TEXT(nameOf(operatorId), operatorId, nameOf(targetId), targetId);
    const entry = store.appendIncoming(chatKey, {
      mid: null, ts: Date.now(), senderId: operatorId, senderName: nameOf(operatorId),
      text, media: [], isPoke: true, atMe: String(targetId) === selfId, atNames: [],
    });
    bus?.emit('chat.update', chatKey);
    return { accepted: true, entry, chatKey };
  }

  return { ingestMessage, ingestPoke };
}

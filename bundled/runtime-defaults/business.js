import fs from 'node:fs';
import path from 'node:path';
import { buildToolAvailabilityContext } from '../../src/kernel/tools.js';
import { sanitizeSdkValue } from '../../src/kernel/sdk-services.js';

export function readPersonaText({ appRoot }) {
  try { return fs.readFileSync(path.join(appRoot, 'assets', 'personas', 'xiaojingyu.txt'), 'utf8').trimEnd(); }
  catch { return ''; }
}

// These policies receive the same live objects as the default kernel. They
// remain independent of startup assembly so an appended implementation can
// replace one policy without reproducing kernel construction or lifecycle.
export function buildToolBundle({ c }, { registry, loader }) {
  const tools = [];
  const excludedTools = [];
  const ctx = buildToolAvailabilityContext(c, loader);
  for (const def of registry.list()) {
    const availability = registry.availability(def.id, ctx);
    if (!availability.ok) { excludedTools.push({ id: def.id, code: availability.code, reason: availability.reason }); continue; }
    tools.push({
      type: 'function',
      function: { name: def.id, description: def.description ?? '', parameters: def.params ?? { type: 'object', properties: {} } },
    });
  }
  return {
    tools, excludedTools,
    async invoke(name, args, execCtx) {
      const availability = registry.availability(name, ctx);
      if (!availability.ok) return { ok: false, error: availability.reason };
      return registry.invoke(name, args, { execCtx });
    },
  };
}

export async function forwardLinkedMedia(chatKey, entry, { runtimeState, capability, cfg, send }) {
  const { generation, signal, active } = runtimeState();
  if (!active) return { claimed: false, reason: 'stopped' };
  const text = String(entry?.text ?? '');
  if (!/https?:\/\/(?:www\.)?(?:bilibili\.com|b23\.tv|douyin\.com|v\.douyin\.com)\//i.test(text)) return { claimed: false };
  const result = await capability.claimAsync('media.download', { chatKey, entry, text, cfg: cfg(), signal });
  const current = runtimeState();
  if (!current.active || generation !== current.generation) return { claimed: Boolean(result), sent: false, reason: 'stopped' };
  if (!result) return { claimed: false, reason: 'no-provider' };
  const payload = result.result;
  const segments = Array.isArray(payload) ? payload : payload?.segments;
  if (!Array.isArray(segments) || segments.length === 0) return { claimed: true, sent: false, reason: 'provider-empty' };
  const sent = await send.sendSegments(chatKey, segments, { source: 'media.download', signal });
  return { claimed: true, sent: true, ownerId: result.ownerId, sentCount: sent?.sent?.length ?? 0 };
}

// 唤醒判定之前的最后一段插件拦截点（开发任务二，2026-10-31）：
// `ingest.intercept` 提供者在消息入库后、onIncoming 前被咨询。合同：
// 认领（返回真值）→ 宿主标已读沉历史、不排唤醒不建会话；不认领/提供者异常/整体超时
// → 按不认领放行，三档判定照旧（绝不能连累正常对话）；全局暂停时不调用（暂停优先）。
// 提供者换代/停用由 capability.registry 的活性探针与注册版本自然失效，热重载不双重拦截。
const INTERCEPT_TIMEOUT_MS = 10_000;

async function interceptIncoming({ capability, chatKey, entry, store, bus, log, signal, paused }) {
  if (paused || !capability || typeof capability.claimAsync !== 'function') return false;
  if ((capability.providers?.('ingest.intercept') ?? []).length === 0) return false;
  const markRead = () => {
    try { store.markEntryRead(chatKey, entry.id); bus?.emit?.('chat.update', chatKey); } catch { /* 已读尽力而为，幂等 */ }
  };
  let timer = null;
  let outcome = null;
  try {
    outcome = await Promise.race([
      capability.claimAsync('ingest.intercept', { chatKey, entry: sanitizeSdkValue(entry), markRead, signal }),
      new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), INTERCEPT_TIMEOUT_MS); }),
    ]);
  } catch (error) {
    log?.warn?.(`[ingest.intercept] 调度异常，按不认领放行：${error?.message ?? error}`);
    return false;
  } finally { if (timer) clearTimeout(timer); }
  if (outcome === 'timeout') {
    log?.warn?.(`[ingest.intercept] 提供者 ${INTERCEPT_TIMEOUT_MS / 1000} 秒未响应，按不认领放行（${chatKey}）`);
    return false;
  }
  if (!outcome) return false;
  markRead(); // 认领即由宿主标已读：消息进存档作历史，不进唤醒上下文（幂等，插件提前调用无害）
  return true;
}

export async function handleProviderEvent({ kind, id, type, event }, { ingest, orchestrator, cfg, config, store, bus, log, capability, selfIdOf, forwardMedia, signal, current = () => true }) {
  const active = () => !signal?.aborted && current();
  if (!active()) return;
  if (type === 'message') {
    const result = await ingest.ingestMessage({ kind, id, event, signal });
    if (result.accepted && active()) {
      const c = cfg();
      const command = c.commandMute?.command;
      if (kind === 'group' && c.commandMute?.enabled !== false && result.entry?.atMe === true && command && String(result.entry.text).includes(command)) {
        const duration = Number(c.commandMute?.durationMin ?? 30);
        const until = duration > 0 ? Date.now() + duration * 60_000 : 0;
        config.update({ commandMute: { active: { __replace__: { ...(c.commandMute?.active ?? {}), [String(id)]: until } } } });
        log.info?.(`[kernel] 群 ${id} 触发指令禁言（${command}），${duration > 0 ? duration + ' 分钟后解除' : '直到手动解除'}`);
      }
      // 唤醒判定之前的插件拦截点（任务二）：认领 → 已读沉历史，不排唤醒不建会话，
      // 也不再做链接媒体转发（该消息的出站处理权归认领插件）。
      if (await interceptIncoming({ capability, chatKey: result.chatKey, entry: result.entry, store, bus, log, signal, paused: orchestrator.isPaused?.() === true })) return;
      await orchestrator.onIncoming(result.chatKey, result.entry);
      void Promise.resolve().then(() => active() && forwardMedia(result.chatKey, result.entry, { signal, current })).catch((error) => {
        if (active()) log.warn?.(`[media] 链接媒体转发失败：${error?.message ?? error}`);
      });
    }
    return;
  }
  if (type === 'poke') {
    const result = await ingest.ingestPoke(event, { signal });
    if (result.accepted && active()) await orchestrator.onIncoming(result.chatKey, result.entry);
    return;
  }
  if (type === 'friend_request') {
    // 好友申请（任务三，2026-10-31）：确定性分发给 friend.request 能力（claimAsync，
    // 按注册序第一个认领者获胜）。无人认领 → 只记日志留待人工/协议端处理，绝不自动同意。
    const userId = String(event?.user_id ?? '').trim();
    const flag = String(event?.flag ?? '').trim();
    if (userId && flag) {
      const claimed = await capability?.claimAsync?.('friend.request', { kind: 'friend', userId, comment: String(event?.comment ?? ''), flag, signal });
      if (!claimed) log.info?.(`[kernel] 好友申请暂无插件处理（QQ:${userId}），留待人工在协议端处理`);
    } else {
      log.warn?.('[kernel] 收到好友申请事件但 user_id/flag 缺失，已忽略');
    }
    return;
  }
  if (type === 'recall') {
    const chatKey = `${kind}:${id}`;
    if (event.message_id != null) { store.markRecalled(chatKey, Number(event.message_id)); bus.emit('chat.update', chatKey); }
    return;
  }
  if (type === 'ban' && String(event.user_id) === String(selfIdOf())) {
    const muted = Number(event.duration) > 0;
    const provider = capability.providers('chat.ban-state')[0]?.provider;
    try { provider?.[muted ? 'note-muted' : 'note-unmuted']?.(String(event.group_id), event.duration); } catch { /* 忽略 */ }
    log.info?.(`[kernel] 机器人${muted ? '被禁言' : '被解禁'}（群 ${event.group_id}）`);
  }
}

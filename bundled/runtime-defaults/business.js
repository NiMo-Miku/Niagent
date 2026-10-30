import fs from 'node:fs';
import path from 'node:path';
import { buildToolAvailabilityContext } from '../../src/kernel/tools.js';

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

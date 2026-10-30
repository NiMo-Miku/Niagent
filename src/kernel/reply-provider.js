// A functional reply provider is selected at its phase boundary. Its proposal
// keeps the same registration alive through ordinary tools and queued sends.
export function leaseReplyProvider(capabilities, name, {signal, timeoutMs = 30000} = {}) {
  const pick = () => capabilities?.providers?.(name)?.[0] ?? null;
  const selected = pick();
  if (typeof selected?.provider !== 'function') return null;
  const version = capabilities?.version?.(name, selected.ownerId);
  const controller = new AbortController();
  let disposed = false;
  const valid = () => {
    const current = pick();
    return !disposed && !signal?.aborted && !controller.signal.aborted
      && current?.ownerId === selected.ownerId && current?.provider === selected.provider
      && capabilities?.version?.(name, selected.ownerId) === version;
  };
  const abort = () => controller.abort(signal?.reason ?? new Error('回复能力调用已取消'));
  signal?.addEventListener('abort', abort, {once:true});
  const unsubscribe = capabilities?.onChange?.(() => { if (!valid()) controller.abort(new Error('回复提供者已变更')); });
  if (signal?.aborted) abort();
  const dispose = () => {
    if (disposed) return;
    disposed = true; unsubscribe?.(); signal?.removeEventListener('abort', abort);
    controller.abort(new Error('回复提案已结束'));
  };
  return {valid, signal:controller.signal, dispose,
    async invoke(payload) {
      let timer, onAbort;
      const delay = Number(timeoutMs);
      try {
        const canceled = new Promise((_, reject) => {
          onAbort = () => reject(controller.signal.reason ?? new Error('回复能力调用已取消'));
          if (controller.signal.aborted) onAbort(); else controller.signal.addEventListener('abort', onAbort, {once:true});
          timer = setTimeout(() => controller.abort(new Error('回复能力调用超时')),
            Number.isFinite(delay) && delay > 0 ? Math.min(delay,180000) : 30000);
        });
        const work = Promise.resolve().then(() => {
          if (!valid()) throw new Error('回复提供者已变更或操作已取消');
          return selected.provider({...payload,signal:controller.signal});
        });
        const result = await Promise.race([work,canceled]);
        if (!valid()) throw new Error('回复提供者已变更或操作已取消');
        return result;
      } finally {clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);}
    },
  };
}

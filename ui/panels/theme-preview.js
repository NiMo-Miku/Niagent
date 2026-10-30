// Preview RPC batching only. Configuration fields and their save queue are independent.
export function createThemePreviewQueue(apply, view = typeof window !== 'undefined' ? window : null) {
  const doc = view?.document, media = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
  let frame = 0, latest, pending = [], disposed = false;
  const active = new Set();
  const flush = () => {
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
    if (!pending.length) return Promise.allSettled([...active]);
    const waiters = pending, theme = latest;
    pending = [];
    let result;
    try { result = apply(theme); } catch (error) { result = Promise.reject(error); }
    const task = Promise.resolve(result);
    active.add(task);
    task.then(result => { active.delete(task); for (const waiter of waiters) waiter.resolve(result); },
      error => { active.delete(task); for (const waiter of waiters) waiter.reject(error); });
    return task;
  };
  const preview = theme => new Promise((resolve, reject) => {
    if (disposed) { reject(new Error('主题预览已卸载')); return; }
    latest = theme; pending.push({ resolve, reject });
    if (!view?.requestAnimationFrame || doc?.visibilityState === 'hidden' || media?.matches) { void flush().catch(() => {}); return; }
    if (!frame) frame = view.requestAnimationFrame(() => { void flush().catch(() => {}); });
  });
  const visibility = () => { if (doc.visibilityState === 'hidden') void flush().catch(() => {}); };
  const preference = () => { if (media.matches) void flush().catch(() => {}); };
  preview.flush = flush;
  preview.dispose = () => {
    if (disposed) return;
    disposed = true;
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
    for (const waiter of pending) waiter.reject(new Error('主题预览已卸载'));
    pending = [];
    doc?.removeEventListener('visibilitychange', visibility);
    media?.removeEventListener?.('change', preference);
    view?.removeEventListener('pagehide', preview.dispose);
  };
  doc?.addEventListener('visibilitychange', visibility);
  media?.addEventListener?.('change', preference);
  view?.addEventListener('pagehide', preview.dispose, { once: true });
  return preview;
}

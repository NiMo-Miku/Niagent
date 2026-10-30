// Host-only lease for one selected service. A transition away invalidates the
// original work permanently, including a subsequent A -> B -> A selection.
export function createServiceLease({ services, capability, providerLease, bus, lifecycle } = {}) {
  const host = () => typeof services === 'function' ? services() : services;
  return function serviceLeaseOf(name, { signal } = {}) {
    const controller = new AbortController();
    const selected = () => capability?.providers?.(name)?.[0];
    const row = selected(), provider = host()?.get?.(name);
    const version = row && capability?.version?.(name, row.ownerId);
    const token = host()?.token?.(name);
    const scopes = row && capability?.options?.(name, row.ownerId)?.scopes;
    const permission = row && providerLease?.(row.ownerId, scopes ?? ['net.outbound']);
    let disposed = false;
    const cleanups = [];
    function current() {
      if (disposed || controller.signal.aborted || signal?.aborted || lifecycle?.signal?.aborted) return false;
      const next = selected();
      return next?.ownerId === row?.ownerId && next?.provider === row?.provider
        && (!row || capability?.version?.(name, row.ownerId) === version)
        && host()?.get?.(name) === provider && host()?.token?.(name) === token
        && (!permission || permission.isValid?.() !== false);
    }
    function check() {
      if (current()) return true;
      if (!controller.signal.aborted) controller.abort(new Error('所选服务、授权或生命周期已变化'));
      return false;
    }
    for (const upstream of [signal, lifecycle?.signal]) {
      if (!upstream) continue;
      const abort = () => { if (!controller.signal.aborted) controller.abort(upstream.reason ?? new Error('服务操作已取消')); };
      upstream.addEventListener('abort', abort, { once: true });
      cleanups.push(() => upstream.removeEventListener('abort', abort));
    }
    const offSelection = capability?.onChange?.(check);
    const offPermission = bus?.on?.('permission.decision', check, { internal: true });
    if (typeof offSelection === 'function') cleanups.push(offSelection);
    if (typeof offPermission === 'function') cleanups.push(offPermission);
    check();
    return Object.freeze({
      provider, signal: controller.signal, isValid: check,
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const cleanup of cleanups.splice(0)) cleanup();
        if (!controller.signal.aborted) controller.abort(new Error('服务操作已结束'));
      },
    });
  };
}

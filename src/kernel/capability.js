// 能力注册表：按名字提供/消费，claim/skip 协商，多提供者语义。
// 出处：SPEC §7.5（0.4 能力机制）；DSH §3.1 模块 4、§5（能力词汇表 v2）。
// 0.4 真实事故：只判 typeof==='object' 会静默丢掉所有函数提供者 —— 这里函数/对象/null 占位都收。

// 天生允许多提供者的 6 个能力（SPEC §7.5 MULTI_PROVIDER_CAPABILITIES）：
// llm.request-params / llm.response / llm.usage / llm.retry-advisor（各家管一类降级，返回 null = 不归我管）
// tool.guard（每个技能可加守卫）、media.download（B站/抖音各一个，按平台认领）
export const MULTI_PROVIDER_CAPABILITIES = new Set([
  'llm.request-params', 'llm.response', 'llm.usage', 'llm.retry-advisor',
  'tool.guard', 'media.download',
]);

export function createCapabilityRegistry({ log = console, isOwnerActive = () => true, selection = () => ({}), subscribeSelection = null } = {}) {
  const map = new Map(); // name -> Map<ownerId, provider>
  const metadata = new Map();
  const listeners = new Set();
  const registrations = new Map(); // 同一个 provider 重新注册也属于新的实例。
  let registrationVersion = 0;
  let activeProbe = isOwnerActive;
  const checkActive = (ownerId) => {
    try { return activeProbe(ownerId); } catch { return false; }
  };

  const changed = () => { for (const fn of listeners) { try { fn(); } catch (error) { log.error?.(`[capability] 变更监听失败：${error?.message ?? error}`); } } };
  function register(name, ownerId, provider, options = {}) {
    if (typeof name !== 'string' || !name) throw new Error(`capability.register：非法能力名 ${name}`);
    if (!map.has(name)) map.set(name, new Map());
    map.get(name).set(ownerId, provider); // 同 owner 重复注册 = 覆盖（热重载），不叠加
    if (!metadata.has(name)) metadata.set(name, new Map());
    metadata.get(name).set(ownerId, { ...options });
    if (!registrations.has(name)) registrations.set(name, new Map());
    registrations.get(name).set(ownerId, ++registrationVersion);
    changed();
  }

  function unregisterOwner(ownerId) {
    for (const [name, m] of map) {
      m.delete(ownerId);
      registrations.get(name)?.delete(ownerId);
      metadata.get(name)?.delete(ownerId);
      if (m.size === 0) map.delete(name);
      if (registrations.get(name)?.size === 0) registrations.delete(name);
    }
    changed();
  }

  function unregister(name, ownerId) {
    const m = map.get(name);
    if (!m || !m.has(ownerId)) return false;
    m.delete(ownerId);
    registrations.get(name)?.delete(ownerId);
    metadata.get(name)?.delete(ownerId);
    if (m.size === 0) map.delete(name);
    if (registrations.get(name)?.size === 0) registrations.delete(name);
    changed();
    return true;
  }

  function snapshotOwner(ownerId) {
    const out = [];
    for (const [name, providersMap] of map) {
      if (providersMap.has(ownerId)) out.push({ name, provider: providersMap.get(ownerId), options: metadata.get(name)?.get(ownerId) ?? {} });
    }
    return out;
  }

  function restoreOwner(ownerId, definitions = []) {
    for (const item of definitions) register(item.name, ownerId, item.provider, item.options);
  }

  // 只返回 provider 非空且所属 owner active 的提供者（SPEC §7.5 查询语义——
  // 避免"hasCapability 说能、取提供者却空"）
  function providers(name) {
    const m = map.get(name);
    if (!m) return [];
    const out = [];
    for (const [ownerId, provider] of m) {
      if (provider === null || provider === undefined) continue;
      if (ownerId !== 'kernel' && !checkActive(ownerId)) continue;
      out.push({ ownerId, provider });
    }
    // Cooperative claim chains retain declaration order. A single-provider pin
    // or default fallback must not change which contributor gets first refusal.
    if (MULTI_PROVIDER_CAPABILITIES.has(name)) return out;
    const preferred = selection()?.[name];
    // Unannotated providers keep their historical order. Explicit defaults yield
    // to an installed implementation, while an administrator can pin an owner.
    return out.sort((a, b) => {
      if (preferred && a.ownerId !== b.ownerId) {
        if (a.ownerId === preferred) return -1;
        if (b.ownerId === preferred) return 1;
      }
      return Number(metadata.get(name)?.get(a.ownerId)?.default === true) - Number(metadata.get(name)?.get(b.ownerId)?.default === true);
    });
  }

  function has(name) { return providers(name).length > 0; }

  // 单提供者消费：取第一个
  function consume(name, ...args) {
    const list = providers(name);
    if (list.length === 0) return undefined;
    const { ownerId, provider } = list[0];
    return typeof provider === 'function' ? provider(...args) : provider;
  }

  // claim/skip 协商：按声明顺序遍历，返回第一个非 null/undefined 结果（认领）。
  // 语义对应 0.4 media.download 的"按平台认领"：返回 null = 不归我管。
  function claim(name, ...args) {
    for (const { ownerId, provider } of providers(name)) {
      let result;
      try {
        result = typeof provider === 'function' ? provider(...args) : provider;
      } catch (err) {
        log.error?.(`capability "${name}" 提供者 ${ownerId} 抛错：${err?.stack || err}`);
        continue;
      }
      if (result !== null && result !== undefined) return { ownerId, result };
    }
    return null;
  }

  // 异步认领单独提供入口，保留同步 claim 的返回形状供已有调用者使用。
  async function claimAsync(name, ...args) {
    const signal = args[0]?.signal;
    const candidates = providers(name).map((item) => ({ ...item, version: registrations.get(name)?.get(item.ownerId) }));
    const current = ({ ownerId, provider, version }) => map.get(name)?.get(ownerId) === provider
      && registrations.get(name)?.get(ownerId) === version && (ownerId === 'kernel' || checkActive(ownerId));
    for (const candidate of candidates) {
      if (signal?.aborted) return null;
      if (!current(candidate)) continue;
      const { ownerId, provider } = candidate;
      try {
        const result = await (typeof provider === 'function' ? provider(...args) : provider);
        if (signal?.aborted) return null;
        if (!current(candidate)) continue;
        if (result !== null && result !== undefined && result?.status !== 'skip') return { ownerId, result };
      } catch (err) {
        log.error?.(`capability "${name}" 提供者 ${ownerId} 抛错：${err?.stack || err}`);
      }
    }
    return null;
  }

  // 排障明细（控制台能力页）
  function explain(name) {
    const m = map.get(name);
    if (!m) return { name, exists: false, providers: [] };
    return {
      name,
      exists: has(name),
      multi: MULTI_PROVIDER_CAPABILITIES.has(name),
      providers: [...m.entries()].map(([ownerId, provider]) => ({
        ownerId,
        kind: typeof provider === 'function' ? 'function' : provider === null ? 'placeholder' : typeof provider,
        active: provider != null && (ownerId === 'kernel' || checkActive(ownerId)),
        default: metadata.get(name)?.get(ownerId)?.default === true,
        selected: providers(name)[0]?.ownerId === ownerId,
      })),
    };
  }

  function names() { return [...map.keys()]; }

  // Selection pins live outside registrations. Notify existing leases at the
  // first config transition, so a later A -> B -> A cannot revive old work.
  // Consumers compare their own selected row; unrelated config edits stay live.
  let stopSelection;
  if (typeof subscribeSelection === 'function') {
    try { stopSelection = subscribeSelection(changed); }
    catch (error) { log.warn?.(`[capability] 选择变更订阅失败：${error?.message ?? error}`); }
  }

  // loader 装配后注入活性探针（构造时拿不到 loader，后挂）
  function _setActiveProbe(fn) { if (typeof fn === 'function') activeProbe = fn; }

  return { register, unregister, unregisterOwner, snapshotOwner, restoreOwner, providers, has, consume, claim, claimAsync, explain, names, _setActiveProbe,
    close() { const stop = stopSelection; stopSelection = null; try { if (typeof stop === 'function') stop(); } finally { listeners.clear(); } },
    options: (name, ownerId) => metadata.get(name)?.get(ownerId) ?? {},
    version: (name, ownerId) => registrations.get(name)?.get(ownerId) ?? null,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

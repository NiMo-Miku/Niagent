// 工具注册表 + 执行管线（DSH §7.2 八步：解析 id → ①权限闸 → 参数校验 → ②tool.guard
// → ③插件附加否决 → 执行（超时）→ 结果归一 → 审计+用量）
// + 可用性判定（SPEC §7.8 getToolAvailability 八层短路，reason 指向真正原因）。
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/; // SPEC §17.2 工具 id 合法性
const DEFAULT_EXEC_TIMEOUT_MS = 30000; // DSH §7.2 要求执行超时；0.4 无对应魔法数，取 30s（实现自由度）

// 控制台与运行时必须复用此上下文，避免工具卡显示可用、而 buildToolBundle 将其排除。
export function buildToolAvailabilityContext(c = {}, loader = null) {
  const provider = typeof c.api?.provider === 'string' ? c.api.provider : '';
  const model = typeof c.api?.model === 'string' ? c.api.model : '';
  const visionResult = provider && model && c.visionResults && typeof c.visionResults === 'object'
    ? c.visionResults[`${provider}|||${model}`]
    : null;
  return {
    toolsEnabled: c.tools?.enabled !== false,
    categoryEnabled: (category) => c.tools?.categories?.[category] !== false,
    override: (id) => c.tools?.overrides?.[id],
    crossChatSend: c.tools?.crossChatSend === true,
    visionEnabled: c.api?.vision !== false && visionResult?.verdict !== 'no-vision',
    searchEnabled: c.webSearch?.enabled !== false,
    skillActive: (owner) => owner === 'kernel' || loader?.isActive?.(owner) === true,
    skillProblem: (owner) => {
      const item = loader?.listEntries?.().find((entry) => entry.id === owner);
      return item ? { code: item.status === 'disabled' ? 'DISABLED' : 'NOT_LOADED', reason: item.loadError ?? '技能未启用' } : null;
    },
  };
}

export function createToolRegistry({
  log = console, bus = null, permissions = null, capabilities = null,
} = {}) {
  const tools = new Map(); // id -> def
  const collisions = new Map(); // id -> [{ ownerId, bundled, at }] 跨 owner 覆盖留痕（诊断用）

  // 注册守卫（SPEC §7.4）：id 必须 [a-zA-Z0-9_-]{1,64}，name/execute 必填，违规抛错；
  // 重复 id 覆盖（SPEC §7.4）。同owner 重复注册 = 热重载路径，正常；
  // 跨owner 撞裸 id 只在捆绑域发生（用户插件走<skillId>__<toolId> 前缀隔离，
  // 见 plugin-loader.js: toolIdFor）——0.4 静默吞掉，这里补 warn + 留痕可查，
  // 行为不变（仍是后注册者生效），只是不再无声消失。
  function register(def) {
    if (!def || typeof def !== 'object') throw new Error('工具定义必须是对象');
    if (typeof def.id !== 'string' || !ID_RE.test(def.id)) {
      throw new Error(`工具 id 非法：${def.id}（须匹配 ${ID_RE}）`);
    }
    if (!def.name || typeof def.name !== 'string') throw new Error(`工具 ${def.id} 缺 name`);
    if (typeof def.execute !== 'function') throw new Error(`工具 ${def.id} 缺 execute 函数`);

    const prev = tools.get(def.id);
    const nextOwner = def.ownerId ?? null;
    if (prev && (prev.ownerId ?? null) !== nextOwner) {
      const trace = collisions.get(def.id) ?? [];
      const fromOwner = prev.ownerId ?? '(内核)';
      const detail = `工具 ${def.id} 被${nextOwner ?? '(内核)'} 覆盖（原属${fromOwner}${prev.bundled ? '/捆绑' : ''}，载入顺序决定谁生效）`;
      trace.push({ ownerId: fromOwner, bundled: Boolean(prev.bundled), at: Date.now() });
      collisions.set(def.id, trace);
      log.warn?.(`[tools] ${detail}`);
      bus?.emit('tool.conflict', { id: def.id, winner: nextOwner ?? null, loser: fromOwner, bundled: Boolean(prev.bundled) });
    }

    tools.set(def.id, {
      category: 'system', scopes: [], defaultEnabled: true,
      requiresVision: false, requiresSearch: false,
      ...def,
    });
    return def.id;
  }

  function unregister(id, ownerId = null) {
    const tool = tools.get(id);
    if (!tool) return false;
    if (ownerId !== null && tool.ownerId !== ownerId) return false;
    collisions.delete(id); // 覆盖者整体消失后不留悬空诊断
    return tools.delete(id);
  }
  function get(id) { return tools.get(id); }
  function list() { return [...tools.values()]; }
  function byOwner(ownerId) { return list().filter((t) => t.ownerId === ownerId).map((t) => t.id); }
  function snapshotOwner(ownerId) { return list().filter((t) => t.ownerId === ownerId); }
  function restore(definitions = []) {
    for (const definition of definitions) tools.set(definition.id, definition);
  }

  // 覆盖冲突诊断（对照capability.explain）：当前生效者 + 被顶掉的owner 链。
  // 当前无冲突返回空数组，不占UI 状态。
  function collisionsInfo() {
    return [...collisions.entries()].map(([id, losers]) => ({
      id,
      winner: tools.get(id)?.ownerId ?? null,
      winnerBundled: Boolean(tools.get(id)?.bundled),
      losers,
    }));
  }

  // 可用性判定（唯一口径，SPEC §7.8 顺序；reason 指向真正原因）
  // ctx: { toolsEnabled, categoryEnabled(id), override(id), defaultEnabled(tool), crossChatSend,
  //        visionEnabled, searchEnabled, skillActive(ownerId), skillProblem(ownerId) }
  function availability(toolId, ctx = {}) {
    const t = tools.get(toolId);
    if (!t) return { ok: false, code: 'not-found', reason: `工具 ${toolId} 不存在` };
    // 1. 总开关
    if (ctx.toolsEnabled === false) return { ok: false, code: 'tools-disabled', reason: '工具系统已关闭' };
    // 2. 所属 Skill 不 active
    if (t.ownerId && ctx.skillActive && !ctx.skillActive(t.ownerId)) {
      const problem = ctx.skillProblem?.(t.ownerId);
      return { ok: false, code: problem?.code ?? 'skill-inactive', reason: problem?.reason ?? '所属技能未启用' };
    }
    // 3. requires[] 硬依赖能力不可用
    if (Array.isArray(t.requires) && t.requires.length > 0 && capabilities) {
      const missing = t.requires.filter((c) => !capabilities.has(c));
      if (missing.length > 0) return { ok: false, code: 'CAPABILITY_MISSING', reason: `缺少能力：${missing.join(', ')}` };
    }
    // 4. 分类开关
    if (ctx.categoryEnabled && !ctx.categoryEnabled(t.category)) {
      return { ok: false, code: 'category-disabled', reason: `分类「${t.category}」已关闭` };
    }
    // 5. 单工具 override / defaultEnabled
    const ov = ctx.override?.(t.id);
    if (ov === false) return { ok: false, code: 'tool-disabled', reason: '该工具已被单独关闭' };
    if (ov === undefined && t.defaultEnabled === false) {
      return { ok: false, code: 'tool-disabled', reason: '该工具默认关闭' };
    }
    // 5.5 send_to 跨会话闸 —— 硬编码 id（SUSPECT 复刻：0.4 tool-registry.js:186 行为；
    //     清理候选 C-02（声明式标志）未经用户批准，批准前一律复刻）
    if (t.id === 'send_to' && ctx.crossChatSend !== true) {
      return { ok: false, code: 'tool-disabled', reason: '跨会话发送未开启' };
    }
    // 6. vision / search 前置
    if (t.requiresVision && ctx.visionEnabled === false) {
      return { ok: false, code: 'no-vision', reason: '当前模型不支持图片输入' };
    }
    if (t.requiresSearch && ctx.searchEnabled === false) {
      return { ok: false, code: 'no-search', reason: '联网搜索已关闭' };
    }
    // 7. tool.guard 运行时否决（guard 抛异常不阻断工具——SUSPECT 复刻：0.4 静默吞）
    if (capabilities && capabilities.has('tool.guard')) {
      for (const { provider } of capabilities.providers('tool.guard')) {
        try {
          const verdict = typeof provider === 'function' ? provider(toolId) : null;
          if (verdict && verdict.block) {
            return { ok: false, code: 'skill-guard', reason: verdict.reason ?? '被技能守卫拦截' };
          }
        } catch (e) {
          log.error?.(`[tools] tool.guard(${toolId}) 抛异常但按 0.4 行为放行：${e}`);
        }
      }
    }
    return { ok: true, code: 'ok', reason: null };
  }

  // 参数校验（M0 基础版：required 缺失 + type 抽查；完整 schema 校验按 SPEC §8 契约在 M1/M2 工具落地时对齐）
  function validateParams(tool, args) {
    function validate(value, schema, label, depth = 0) {
      if (!schema || typeof schema !== 'object') return null;
      if (depth > 12) return `参数嵌套过深：${label}`;
      const matches = (type) => type === 'null' ? value === null
        : type === 'array' ? Array.isArray(value)
        : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
        : type === 'integer' ? Number.isSafeInteger(value)
        : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : typeof value === type;
      const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
      if (types.length && !types.some(matches)) return `参数类型错误：${label}`;
      if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) return `参数不在允许值中：${label}`;
      if (typeof value === 'string') {
        if ((schema.maxLength != null && value.length > schema.maxLength) || (schema.minLength != null && value.length < schema.minLength)) return `参数长度错误：${label}`;
      }
      if (typeof value === 'number' && ((schema.minimum != null && value < schema.minimum) || (schema.maximum != null && value > schema.maximum))) return `参数超出范围：${label}`;
      if (Array.isArray(value)) {
        if ((schema.maxItems != null && value.length > schema.maxItems) || (schema.minItems != null && value.length < schema.minItems)) return `参数条数错误：${label}`;
        for (let i = 0; i < value.length; i++) { const error = validate(value[i], schema.items, `${label}[${i}]`, depth + 1); if (error) return error; }
      } else if (value !== null && typeof value === 'object') {
        for (const key of schema.required ?? []) if (!Object.hasOwn(value, key) || value[key] === undefined) return `参数缺失：${key}`;
        for (const key of Object.keys(value)) {
          if (['__proto__', 'constructor', 'prototype'].includes(key)) return `参数键不允许：${key}`;
          if (schema.additionalProperties === false && !Object.hasOwn(schema.properties ?? {}, key)) return `未知参数：${key}`;
          const error = validate(value[key], schema.properties?.[key], `${label}.${key}`, depth + 1);
          if (error) return error;
        }
      }
      return null;
    }
    return validate(args, tool.params, tool.id);
  }

  // 八步执行管线（DSH §7.2）。beforeToolHooks: (toolId, args) => {block, reason}[]（插件附加否决）
  async function invoke(toolId, args, {
    execCtx = {}, permissionCtx = {}, beforeToolHooks = [], isCurrent = () => true,
  } = {}) {
    const t = tools.get(toolId);
    if (!t) return { ok: false, error: `工具不存在：${toolId}` };
    if (!t.bundled && t.fingerprint && permissions?.isCurrent && !permissions.isCurrent(t.ownerId, t.fingerprint)) return { ok: false, error: '插件代码或身份已失效' };
    bus?.emit('tool.call', { id: toolId, ownerId: t.ownerId });
    const permissionReceipts = [];

    // ① 权限闸（DSH §7.2：前移到第 2 步——解析之后、参数校验之前）
    if (permissions && t.scopes && t.scopes.length > 0) {
      for (const scope of t.scopes) {
        const check = permissions.checkAsync ?? permissions.check;
        const verdict = await check.call(permissions, t.ownerId ?? 'kernel', scope, {
          kind: t.bundled ? 'bundled' : 'user', fingerprint: t.fingerprint ?? null,
          detail: `工具 ${toolId}`,
        });
        if (verdict.decision === 'deny') {
          return { ok: false, error: `权限不足：${verdict.reason ?? scope}` }; // 人话错误进行为契约
        }
        if (verdict.decision === 'ask') {
          return { ok: false, error: `权限待确认：${verdict.reason ?? scope}（该操作需要管理员在控制台批准）` };
        }
        permissionReceipts.push(verdict);
      }
    }

    if (!isCurrent() || tools.get(toolId) !== t) return { ok: false, error: '等待授权时面板或工具已失效' };
    for (const scope of t.scopes ?? []) {
      if (permissions?.status(t.ownerId ?? 'kernel', scope).override === 'deny') return { ok: false, error: '该权限已被管理员关闭' };
    }
    // 参数校验
    const paramErr = validateParams(t, args);
    if (paramErr) return { ok: false, error: paramErr };

    // ② tool.guard（多提供者；在 availability 已查列表级，这里查调用级——带 args 的守卫）
    if (capabilities && capabilities.has('tool.guard')) {
      for (const { provider } of capabilities.providers('tool.guard')) {
        try {
          const verdict = typeof provider === 'function' ? provider(toolId, args) : null;
          if (verdict && verdict.block) return { ok: false, error: `被技能守卫拦截：${verdict.reason ?? ''}` };
        } catch (e) {
          log.error?.(`[tools] tool.guard(${toolId}) 调用级异常按 0.4 行为放行：${e}`);
        }
      }
    }

    // ③ 插件附加否决（before-tool hooks，SPEC §7.6：返回 {block:true, reason} 可否决）
    for (const hook of beforeToolHooks) {
      try {
        const verdict = await hook(toolId, args);
        if (verdict && verdict.block) return { ok: false, error: `被插件钩子否决：${verdict.reason ?? ''}` };
      } catch (e) {
        log.error?.(`[tools] before-tool 钩子异常（不阻断）：${e}`);
      }
    }

    // 执行（超时）
    let result, timeout;
    try {
      result = await Promise.race([
        Promise.resolve().then(() => {
          if (execCtx.signal?.aborted) throw execCtx.signal.reason ?? new Error('工具调用已中止');
          if (!isCurrent() || tools.get(toolId) !== t) throw new Error('面板或工具已失效');
          if (permissionReceipts.some((receipt) => receipt.isValid && !receipt.isValid())) throw new Error('授权已撤销、更新或权限服务已关闭');
          // 异步 before-tool 钩子可能等待期间撤销授权或改变插件，副作用之前再核验。
          if (!t.bundled && t.fingerprint && permissions?.isCurrent && !permissions.isCurrent(t.ownerId, t.fingerprint)) throw new Error('插件代码或身份已失效');
          for (const scope of t.scopes ?? []) {
            if (permissions?.status(t.ownerId ?? 'kernel', scope).override === 'deny') throw new Error('该权限已被管理员关闭');
          }
          return t.execute(args ?? {}, execCtx);
        }),
        new Promise((_, rej) => { timeout = setTimeout(() => rej(new Error(`工具执行超时（${DEFAULT_EXEC_TIMEOUT_MS / 1000}s）`)), DEFAULT_EXEC_TIMEOUT_MS); }),
      ]);
    } catch (err) {
      bus?.emit('tool.result', { id: toolId, ok: false });
      return { ok: false, error: err?.message ?? String(err) };
    } finally { clearTimeout(timeout); }

    // 结果归一（字符串或可序列化对象）
    let normalized = result;
    if (normalized === undefined) normalized = { ok: true };
    if (typeof normalized !== 'string') {
      try { JSON.stringify(normalized); } catch { normalized = String(normalized); }
    }
    bus?.emit('tool.result', { id: toolId, ok: true });
    return { ok: true, result: normalized };
  }

  return { register, unregister, get, list, byOwner, snapshotOwner, restore, collisionsInfo, availability, invoke };
}

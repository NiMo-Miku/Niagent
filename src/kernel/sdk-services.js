// Narrow host services: named bindings and permissions, never a whole kernel.
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { sanitizeConfigForApi } from './config.js';

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const secrets = /(?:api.?key|access.?token|authorization|password|secret|server.?token|cookie|^token$)/i;
function redacted(value, seen = new WeakMap(), preserveRaw = false) {
  if (typeof value === 'function') return undefined;
  if (typeof value === 'string' && (path.win32.isAbsolute(value) || path.posix.isAbsolute(value))) return '[REDACTED_PATH]';
  if (!value || typeof value !== 'object') return value;
  if (typeof value.aborted === 'boolean' && typeof value.addEventListener === 'function') return value;
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Date || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return clone(value);
  if (seen.has(value)) return seen.get(value);
  const out = Array.isArray(value) ? [] : {}; seen.set(value, out);
  for (const [key, item] of Object.entries(value)) {
    if ((secrets.test(key) && !/^has[A-Z]/.test(key)) || ['rawRequest', 'requestHeaders', 'env', 'child', 'kernel', 'registry', 'loader', 'bus', 'permissions'].includes(key) || (key === 'raw' && !preserveRaw)) continue;
    const safe = redacted(item, seen, preserveRaw); if (safe !== undefined) out[key] = safe;
  }
  return out;
}
export const sanitizeSdkValue = (value, { preserveRaw = false } = {}) => redacted(value, new WeakMap(), preserveRaw);

export function sanitizeLlmRequestNotice(value = {}) {
  const api = value?.api ?? {};
  return sanitizeSdkValue({ model: value?.model, api: Object.fromEntries(
    ['baseUrl', 'model', 'provider', 'timeoutMs'].filter(key => Object.hasOwn(api, key)).map(key => [key, api[key]]),
  ) });
}

// Only host-defined functional capabilities carry host payloads. Contracts
// between unrelated extensions remain theirs, and lifecycle descriptors retain
// the service host's own narrow creation/start context.
export const CORE_FUNCTIONAL_CAPABILITIES = new Set([
  'llm.request-params', 'llm.response', 'llm.usage', 'llm.retry-advisor', 'llm.endpoint-pick', 'llm.endpoint-feedback',
  'reply.inline-calls', 'reply.grounded-select', 'reply.local-policy', 'reply.after-tool-batch', 'reply.is-planning-text', 'reply.salvage', 'reply.salvage-lines', 'reply.loose-send',
  'media.download', 'media.transcribe', 'tool.guard', 'chat.ban-state', 'web.fetch', 'video.frames', 'video.frames.available',
  'message.speaker-format', 'message.owner-check', 'message.inline-at-normalize', 'image.mime-support',
]);
const PROVIDER_CONFIG_FIELDS = {
  'message.owner-check': ['memberNotes', 'persona', 'allow', 'deny'], 'media.download': ['security', 'send', 'sticker'],
};
export function sanitizeProviderArguments(name, args, ownConfig = {}) {
  const vendorResponse = name.startsWith('llm.') || name.startsWith('reply.');
  const visit = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value)
      || value instanceof Date || value instanceof ArrayBuffer || ArrayBuffer.isView(value)
      || (typeof value.aborted === 'boolean' && typeof value.addEventListener === 'function')) return sanitizeSdkValue(value);
    const safe = sanitizeSdkValue(value);
    for (const [key, item] of Object.entries(value)) {
      if (key === 'cfg') {
        safe.cfg = { ...sanitizeSdkValue(ownConfig) };
        for (const field of PROVIDER_CONFIG_FIELDS[name] ?? []) if (Object.hasOwn(item ?? {}, field)) safe.cfg[field] = sanitizeSdkValue(item[field]);
      } else if ((key === 'result' || key === 'response') && vendorResponse) safe[key] = sanitizeSdkValue(item, { preserveRaw: true });
      else if (key === 'context') safe.context = visit(item);
    }
    return safe;
  };
  return args.map(visit);
}
const CONFIG_BINDINGS = {
  'core-tools': ['allow', 'deny'], 'media-tools': ['security'], 'web-tools': ['webSearch', 'security'],
  'transport-onebot': ['onebot'], 'media-service': ['api', 'security', 'send', 'sticker'],
  'memory-service': ['memory', 'memberNotes', 'api', 'providers', 'blocklist', 'globalBlocklist', 'communityExemptions'],
  community: ['globalBlocklist', 'communityExemptions'], telemetry: ['telemetry'],
};
const METHODS = {
  'data.messages': ['recent', 'findByMid', 'updateByMid', 'listChats'],
  'data.memory': ['append', 'remove', 'query', 'stats', 'markConsolidated', 'lastConsolidatedAt', 'replaceMember', 'removeMember', 'clearChat', 'listFiles'],
  'data.sessions': ['create', 'update', 'finish', 'peek', 'get', 'current', 'running', 'listSummaries', 'todayUsage'],
  'data.reminders': ['add', 'due', 'pending', 'markFired', 'cancel', 'updatePendingTexts', 'prune'],
  'data.stickers': ['all', 'get', 'list', 'note', 'markUsed', 'collect', 'mergeFromQQ', 'controlledLocal', 'ensureSendable', 'collectIntoQQ', 'syncFromQQ'],
  'core.send': ['sendTextBatch', 'sendImage', 'sendSticker', 'sendSegments', 'poke'],
  'transport.actions': ['getForward', 'getVideo', 'getFile', 'getRecord', 'getImage', 'getChatInfo', 'getMembers', 'getGroupMembers', 'getGroupMemberInfo', 'getGroupName', 'listGroups', 'listFriends', 'fetchCustomFaces', 'fetchCustomFaceDetails', 'addCustomFace', 'modifyCustomFace', 'deleteCustomFace', 'poke', 'recall'],
  'media.reader': ['image', 'imageParts', 'probe', 'framesAvailable'],
  'web.search': ['search', 'fetchPage', 'lockState'], 'llm.client': ['complete'],
  'process.mcp': ['startServer', 'stopAll', 'redactError'], 'host.feedback': ['report'],
  'qq.emoji-favorites': ['fetchCustomFaces', 'fetchCustomFaceDetails', 'getAccountIdentity', 'addCustomFace', 'modifyCustomFace', 'deleteCustomFace'],
  'mcp.tools': ['list', 'start', 'connect', 'stop', 'stopServer', 'registerTool'],
  'market.client': ['listCatalog', 'listAccounts', 'login', 'logout', 'publish', 'install'],
  'community.client': ['getBlocklist', 'syncGlobalBlocklist', 'updateBlocklist', 'quoteStatus', 'publishQuote', 'feedbackStatus', 'publishFeedback'],
  'memory.consolidate': ['consolidate'],
  'extensions.state': ['isActive', 'isEnabled', 'videoFrames'], 'extensions.installZip': ['install'], 'tools.catalog': ['list'],
  'runtime.reminders': ['start', 'stop'],
};
const WRITE_METHODS = new Set(['append', 'remove', 'updateByMid', 'markConsolidated', 'replaceMember', 'removeMember', 'clearChat', 'create', 'update', 'finish', 'add', 'markFired', 'cancel', 'updatePendingTexts', 'prune', 'note', 'markUsed', 'collect', 'mergeFromQQ']);
const TRUSTED_METHODS = {
  'core-tools': { 'core.send': ['sendTextBatch', 'poke'], 'host.feedback': ['report'] },
  'query-tools': { 'data.messages': METHODS['data.messages'], 'transport.actions': ['getForward'], 'media.reader': METHODS['media.reader'] },
  'memory-tools': { 'data.memory': ['append', 'query', 'remove'] },
  'sticker-tools': { 'data.messages': ['recent', 'findByMid'], 'data.stickers': ['all', 'get', 'markUsed', 'ensureSendable', 'collectIntoQQ', 'syncFromQQ', 'imagesDir'], 'core.send': ['sendSticker'], 'media.reader': ['image', 'imageParts'] },
  'system-tools': { 'data.reminders': ['add', 'pending', 'cancel'] },
  'media-tools': { 'core.send': ['sendImage'], 'media.reader': ['image'] },
  'media-service': { 'transport.actions': ['getImage', 'getVideo', 'getRecord', 'getFile'] },
  'memory-service': { 'data.memory': ['query'], 'data.messages': ['recent'], 'data.sessions': ['create', 'update', 'finish'], 'llm.client': ['complete'] },
  telemetry: { 'data.sessions': ['peek'], 'tools.catalog': ['list'] },
  reminders: { 'data.reminders': ['due', 'pending', 'markFired', 'updatePendingTexts'], 'runtime.reminders': ['start', 'stop'] },
  'mcp-bridge': { 'process.mcp': METHODS['process.mcp'], 'mcp.tools': METHODS['mcp.tools'] },
  'transport-onebot': { 'qq.emoji-favorites': METHODS['qq.emoji-favorites'] },
  'web-tools': { 'web.search': METHODS['web.search'] },
  market: { 'extensions.installZip': ['install'] },
};
const HOST_ONLY = new Set(['runtime.reminders', 'extensions.installZip']);
// These descriptors belong to the service host. Giving another extension their
// lifecycle methods would borrow the default owner's authorization and handles.
const HOST_LIFECYCLE_CAPABILITIES = new Set(['mcp.service', 'reminders.service', 'telemetry.service']);
const ENVIRONMENT_OWNERS = new Set(['transport-onebot', 'market', 'community', 'telemetry']);
const STOP_METHODS = new Set(['process.mcp:stopAll', 'runtime.reminders:stop']);

export function createSdkAccess({ config, permissions, loaderOf = () => null, facets = {}, resolveProvider = null, bus = null } = {}) {
  const instances = new WeakMap();
  const consumerContext = new AsyncLocalStorage();
  const bundledFor = (entry) => entry.rootKind === 'bundled';
  const declared = (entry, scope) => ['fs.namespace', 'scheduler'].includes(scope)
    || (entry.manifest.permissions ?? []).some((item) => (item === 'web_fetch' ? 'net.outbound' : item) === scope);
  const trusted = (entry, name, method) => bundledFor(entry) && (TRUSTED_METHODS[entry.manifest.id]?.[name] ?? []).includes(method);
  function live(entry) {
    if (!entry || entry.disposed || entry.suspended || entry.controller?.signal.aborted) throw new Error('插件实例已失效');
    const loader = loaderOf();
    if (entry.status !== 'loading' && loader?.hostEntry && loader.hostEntry(entry.manifest.id) !== entry) throw new Error('插件代际已失效');
    if (entry.status !== 'loading' && loader?.contentCurrent && !loader.contentCurrent(entry.manifest.id, entry.fingerprint)) throw new Error('插件代码指纹已失效');
    if (!bundledFor(entry) && !permissions.isCurrent(entry.manifest.id, entry.fingerprint)) throw new Error('插件授权指纹已失效');
  }
  function checkSync(entry, scope, name, method) {
    live(entry);
    const binding = trusted(entry, name, method);
    if (!declared(entry, scope) && !binding) throw new Error('插件未声明权限：' + scope);
    const verdict = permissions.check(entry.manifest.id, scope, {
      kind: bundledFor(entry) ? 'bundled' : 'user', fingerprint: bundledFor(entry) ? null : entry.fingerprint, notify: false, hostBinding: binding,
    });
    if (verdict.decision !== 'allow' || verdict.isValid?.() === false) throw new Error(verdict.reason ?? ('未获得权限：' + scope));
    return verdict;
  }
  async function check(entry, _bundled, scope) {
    live(entry);
    if (!declared(entry, scope)) throw new Error('插件未声明权限：' + scope);
    const verdict = await (permissions.checkAsync ?? permissions.check).call(permissions, entry.manifest.id, scope, {
      kind: bundledFor(entry) ? 'bundled' : 'user', fingerprint: bundledFor(entry) ? null : entry.fingerprint,
    });
    live(entry);
    if (verdict.decision !== 'allow' || verdict.isValid?.() === false) throw new Error(verdict.reason ?? ('未获得权限：' + scope));
    return verdict;
  }
  function bindingsFor(entry) {
    return bundledFor(entry) ? (entry.manifest.hostConfig ?? []).filter((key) => CONFIG_BINDINGS[entry.manifest.id]?.includes(key)) : [];
  }
  function snapshot(entry) {
    live(entry);
    if (!bundledFor(entry)) return clone(Object.fromEntries(Object.keys(entry.manifest.configSchema ?? {}).map((key) => [key, entry.ctx?.config?.get?.(key)])));
    const current = config.get(), safe = sanitizeConfigForApi(current), out = {};
    for (const key of bindingsFor(entry)) {
      if (!Object.hasOwn(current, key)) continue;
      if (key === 'providers') out.providers = (safe.providers ?? []).map((provider) => redacted(Object.fromEntries(['id', 'name', 'baseURL', 'baseUrl', 'models', 'model', 'enabled', 'kind', 'source'].filter((field) => Object.hasOwn(provider, field)).map((field) => [field, provider[field]]))));
      else out[key] = clone(key === 'api' ? redacted(safe.api) : current[key]);
    }
    return out;
  }
  function boundConfig(entry) {
    const bindings = bindingsFor(entry);
    return Object.freeze({
      get: () => snapshot(entry),
      update(patch) {
        live(entry);
        if (!bundledFor(entry) || Object.keys(patch ?? {}).some((key) => !bindings.includes(key))) throw new Error('配置修改越过插件声明的宿主绑定');
        checkSync(entry, 'fs.namespace', 'host.config', 'update');
        const rawOnly = Object.keys(patch ?? {}).length > 0 && Object.keys(patch).every(key => ['blocklist', 'globalBlocklist', 'communityExemptions'].includes(key));
        if (rawOnly && typeof config.updateRawFields === 'function') config.updateRawFields(clone(patch));
        else config.update(clone(patch));
        return snapshot(entry);
      },
      onChange(fn) {
        live(entry); if (typeof fn !== 'function') throw new Error('config.onChange 需要函数');
        let closed = false;
        const off = config.onChange?.(() => { try { live(entry); } catch { return; } fn(snapshot(entry)); }) ?? (() => {});
        const dispose = () => { if (closed) return; closed = true; entry.resources?.delete(dispose); off(); };
        entry.resources?.add(dispose); return dispose;
      },
    });
  }
  function methodScopes(name, method, args, entry) {
    if (name === 'market.client') {
      if (method === 'listAccounts') return ['data.sessions.read'];
      return method === 'listCatalog' ? ['net.outbound'] : ['net.outbound', 'fs.outsideNamespace'];
    }
    if (name === 'community.client') {
      if (['quoteStatus', 'feedbackStatus'].includes(method)) return ['fs.namespace'];
      if (method === 'getBlocklist') return ['data.sessions.read'];
      if (['publishQuote', 'publishFeedback'].includes(method)) return ['net.outbound'];
      return ['net.outbound', 'data.sessions.read', 'fs.outsideNamespace'];
    }
    if (name === 'memory.consolidate') return ['net.outbound', 'data.memory.read', 'data.sessions.read', 'fs.outsideNamespace'];
    if (name === 'qq.emoji-favorites') return method === 'getAccountIdentity' ? ['data.sessions.read'] : ['fetchCustomFaces', 'fetchCustomFaceDetails'].includes(method) ? ['data.sessions.read', 'net.outbound'] : ['qq.send', 'net.outbound'];
    if (name === 'mcp.tools') return ['list', 'stop', 'stopServer'].includes(method) ? ['fs.namespace'] : ['proc.exec', 'mcp.connect'];
    if (name === 'data.stickers' && ['ensureSendable', 'collectIntoQQ'].includes(method)) return method === 'collectIntoQQ' ? ['qq.send', 'net.outbound'] : ['net.outbound'];
    if (name === 'data.stickers' && method === 'syncFromQQ') return ['data.sessions.read', 'net.outbound'];
    if (name.startsWith('data.')) return [WRITE_METHODS.has(method) ? 'fs.outsideNamespace' : name === 'data.memory' ? 'data.memory.read' : 'data.sessions.read'];
    if (name === 'transport.actions') return ['fetchCustomFaceDetails', 'getGroupMemberInfo'].includes(method) ? ['data.sessions.read', 'net.outbound'] : [/^(?:get|list|fetch)/.test(method) ? 'data.sessions.read' : 'qq.send'];
    if (name === 'core.send') return ['qq.send'];
    if (name === 'process.mcp') return ['redactError', 'stopAll'].includes(method) ? ['fs.namespace'] : ['proc.exec', 'mcp.connect'];
    if (['media.reader', 'web.search', 'llm.client'].includes(name)) {
      if (name === 'web.search' && method === 'lockState') return ['fs.namespace'];
      const result = ['net.outbound'];
      if (name === 'media.reader' && !bundledFor(entry) && ((args[1]?.localRoots?.length ?? 0) > 0 || [args[0]?.path, args[0]?.localFile, args[0]?.file].some((file) => typeof file === 'string' && (path.win32.isAbsolute(file) || path.posix.isAbsolute(file) || /^file:/i.test(file))))) result.push('fs.outsideNamespace');
      return result;
    }
    if (name === 'extensions.installZip') return ['fs.outsideNamespace'];
    return ['fs.namespace'];
  }
  function operationSignals(entry, args, contextSignal) {
    // Nested SDK calls retain the original consumer's cancellation chain.
    // Service-owned create/start/stop clears this context at the host boundary.
    const signals = [entry.controller?.signal, contextSignal, consumerContext.getStore(), ...args.filter((item) => item && typeof item === 'object').map((item) => typeof item.addEventListener === 'function' && typeof item.aborted === 'boolean' ? item : item.signal)].filter(Boolean);
    const controller = new AbortController(), cleanup = [];
    for (const signal of new Set(signals)) {
      const abort = () => controller.abort(signal.reason ?? new Error('操作已中止'));
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
      cleanup.push(() => signal.removeEventListener('abort', abort));
    }
    let removeAbort;
    const cancelled = new Promise((_, reject) => {
      const abort = () => reject(controller.signal.reason ?? new Error('操作已中止'));
      removeAbort = () => controller.signal.removeEventListener('abort', abort);
      if (controller.signal.aborted) abort(); else controller.signal.addEventListener('abort', abort, { once: true });
    });
    // Synchronous reads do not race a Promise; observe their cancellation too.
    cancelled.catch(() => {});
    return { controller, cancelled, release() { removeAbort(); for (const off of cleanup) off(); } };
  }
  function withSignal(name, method, args, signal) {
    const result = [...args]; let index;
    if (name === 'core.send') index = method === 'poke' ? 1 : 2;
    else if (name === 'media.reader' && method === 'framesAvailable') { result[0] = signal; return result; }
    else if (['media.reader', 'web.search'].includes(name)) index = 1;
    else if (['llm.client', 'memory.consolidate'].includes(name) || (name === 'data.stickers' && ['collectIntoQQ', 'syncFromQQ'].includes(method))) index = 0;
    else if (name === 'data.stickers' && method === 'ensureSendable') index = 1;
    else if (name === 'process.mcp' && method === 'startServer') index = 1;
    else if (['transport.actions', 'qq.emoji-favorites'].includes(name)) index = method === 'fetchCustomFaceDetails' ? 0 : method === 'getGroupMemberInfo' ? 2 : result.length;
    if (index !== undefined) result[index] = { ...result[index], signal };
    return result;
  }
  function guardedCallbacks(name, method, args, valid) {
    let index, key, dto;
    if (name === 'llm.client' && method === 'complete') {
      index = 0; key = 'onRequest'; dto = sanitizeLlmRequestNotice;
    } else if (name === 'process.mcp' && method === 'startServer') {
      index = 1; key = 'onError';
      dto = (value = {}) => ({ category: String(value?.category ?? 'adapter_error').replace(/[^a-z_]/gi, '_').slice(0, 80), fatal: Boolean(value?.fatal) });
    } else return args;
    const callback = args[index]?.[key];
    if (typeof callback !== 'function') return args;
    const safe = [...args];
    safe[index] = { ...args[index], [key]: (value) => {
      try { valid(); } catch { return; } // Old asynchronous diagnostics cannot call a stopped consumer.
      return callback(dto(value));
    } };
    return safe;
  }
  function mcpConnection(entry, connection, leases, state) {
    let stopped = false;
    const controller = new AbortController();
    const offAbort = () => entry.controller?.signal.removeEventListener('abort', stop);
    const offDecision = bus?.on?.('permission.decision', (event) => {
      if (event?.pluginId === entry.manifest.id && ['proc.exec', 'mcp.connect'].includes(event.scope) && leases.some((lease) => lease.isValid?.() === false)) stop();
    }, { internal: true });
    function stop() {
      if (stopped) return;
      stopped = true; controller.abort(new Error('MCP 连接已停止'));
      state.children.delete(stop); entry.resources?.delete(stop); offAbort(); offDecision?.(); connection.stop?.();
    }
    state.children.add(stop); entry.resources?.add(stop); entry.controller?.signal.addEventListener('abort', stop, { once: true });
    const invoke = (method, args) => {
      live(entry); if (stopped || leases.some((lease) => lease.isValid?.() === false)) throw new Error('MCP 连接授权已失效');
      const value = connection[method](...args);
      if (value && typeof value.then === 'function') {
        let onAbort;
        const cancelled = new Promise((_, reject) => { onAbort = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', onAbort, { once: true }); });
        return Promise.race([Promise.resolve(value).then((result) => {
          live(entry); if (stopped || leases.some((lease) => lease.isValid?.() === false)) throw new Error('MCP 连接授权已失效');
          return bundledFor(entry) ? result : redacted(result);
        }), cancelled]).finally(() => controller.signal.removeEventListener('abort', onAbort));
      }
      return bundledFor(entry) ? value : redacted(value);
    };
    return Object.freeze(bundledFor(entry)
      ? { request: (...args) => invoke('request', args), notify: (...args) => invoke('notify', args), stop }
      : { request: async (...args) => invoke('request', args), notify: async (...args) => invoke('notify', args), stop });
  }
  function facet(entry, name, provider, contextSignal) {
    if (!instances.has(entry)) instances.set(entry, new Map());
    const states = instances.get(entry);
    if (!states.has(name)) states.set(name, { children: new Set() });
    const state = states.get(name), resolve = () => facets[name] ?? (typeof resolveProvider === 'function' ? resolveProvider(name) : provider);
    const methods = name === 'mcp.tools' && !(bundledFor(entry) && entry.manifest.id === 'mcp-bridge') ? ['list'] : METHODS[name];
    return new Proxy({}, {
      ownKeys: () => [...methods, ...(name === 'data.stickers' ? ['imagesDir'] : [])],
      getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true }),
      get(_target, key) {
        if (key === 'then' || typeof key !== 'string') return undefined;
        const cleanup = bundledFor(entry) && STOP_METHODS.has(name + ':' + key) && trusted(entry, name, key);
        if (!cleanup) live(entry);
        if (name === 'data.stickers' && key === 'imagesDir') {
          checkSync(entry, 'data.sessions.read', name, key); return bundledFor(entry) ? resolve()?.imagesDir : undefined;
        }
        if (!methods.includes(key)) return undefined;
        return (...args) => {
          if (key === 'stopAll' && name === 'process.mcp') { for (const stop of [...state.children]) stop(); return; }
          if (cleanup) return resolve()?.[key]?.(...args);
          const scopes = methodScopes(name, key, args, entry);
          const pending = operationSignals(entry, args, contextSignal), leases = []; let offDecision;
          const valid = () => { live(entry); if (pending.controller.signal.aborted || leases.some((lease) => lease.isValid?.() === false)) throw pending.controller.signal.reason ?? new Error('插件授权已失效'); };
          const release = () => { offDecision?.(); pending.release(); };
          const action = () => {
            valid(); let target = resolve();
            if (name === 'memory.consolidate' && typeof target === 'function') {
              const run = target; target = { consolidate: (...values) => run(...values) };
            }
            if (typeof target?.[key] !== 'function') throw new Error('宿主服务 ' + name + '.' + key + ' 尚未就绪');
            const safeArgs = guardedCallbacks(name, key, args, valid);
            const result = consumerContext.run(pending.controller.signal, () => target[key](...withSignal(name, key, safeArgs, pending.controller.signal)));
            const finish = (value) => {
              try { valid(); } catch (error) { if (name === 'process.mcp' && key === 'startServer') value?.stop?.(); throw error; }
              if (name === 'process.mcp' && key === 'startServer') return mcpConnection(entry, value, leases, state);
              return bundledFor(entry) && name !== 'llm.client' ? value : redacted(value);
            };
            return result && typeof result.then === 'function' ? Promise.race([Promise.resolve(result).then(finish), pending.cancelled]).finally(release) : finish(result);
          };
          const listen = () => { offDecision = bus?.on?.('permission.decision', (event) => {
            if (event?.pluginId === entry.manifest.id && scopes.includes(event.scope)) { try { valid(); } catch { pending.controller.abort(new Error('插件授权已失效')); } }
          }, { internal: true }); };
          if (bundledFor(entry)) {
            try { for (const scope of scopes) leases.push(checkSync(entry, scope, name, key)); listen(); const result = action(); if (!result || typeof result.then !== 'function') release(); return result; }
            catch (error) { release(); throw error; }
          }
          return (async () => {
            try { for (const scope of scopes) leases.push(await Promise.race([check(entry, false, scope), pending.cancelled])); listen(); return await action(); }
            finally { release(); }
          })();
        };
      },
    });
  }
  function capabilityAccess(name, provider, { entry, signal }) {
    live(entry);
    if (HOST_LIFECYCLE_CAPABILITIES.has(name)) throw new Error('能力 ' + name + ' 的生命周期仅供宿主管理');
    if (name === 'transport.provider') {
      const target = provider ?? {};
      const metadata = sanitizeSdkValue({ id: target.id, segmentSupport: target.segmentSupport });
      return new Proxy(metadata, { get(target, key) { live(entry); return Reflect.get(target, key); } });
    }
    if (name === 'host.config') return boundConfig(entry);
    if (name === 'host.environment') {
      const target = facets[name] ?? provider ?? {};
      const metadata = bundledFor(entry) && ENVIRONMENT_OWNERS.has(entry.manifest.id) ? clone(target) : redacted({ version: target.version, profile: target.profile });
      return new Proxy(metadata, { get(target, key) { live(entry); return Reflect.get(target, key); } });
    }
    if (name === 'host.defaults') {
      if (!bundledFor(entry) || !['market', 'community'].includes(entry.manifest.id)) throw new Error('该宿主绑定仅供具名默认插件使用');
      const client = (facets[name] ?? provider)?.communityMarket;
      const methods = entry.manifest.id === 'market' ? ['listCatalog', 'listAccounts', 'login', 'logout', 'publish', 'install'] : ['getBlocklist', 'syncGlobalBlocklist', 'updateBlocklist'];
      return Object.freeze({ communityMarket: client ? new Proxy({}, { get(_target, key) {
        if (key === 'then' || !methods.includes(key)) return undefined;
        live(entry); const value = client[key];
        if (typeof value !== 'function') return undefined;
        return (...args) => {
          const lease = checkSync(entry, 'net.outbound', name, key), pending = operationSignals(entry, args, signal);
          const valid = () => { live(entry); if (pending.controller.signal.aborted || lease.isValid?.() === false) throw pending.controller.signal.reason ?? new Error('插件授权已失效'); };
          const off = bus?.on?.('permission.decision', (event) => { if (event?.pluginId === entry.manifest.id && event.scope === 'net.outbound' && lease.isValid?.() === false) pending.controller.abort(new Error('插件授权已失效')); }, { internal: true });
          const release = () => { off?.(); pending.release(); };
          try {
            valid(); const result = value.apply(client, args);
            if (result && typeof result.then === 'function') return Promise.race([Promise.resolve(result).then((out) => { valid(); return out; }), pending.cancelled]).finally(release);
            valid(); release(); return result;
          } catch (error) { release(); throw error; }
        };
      } }) : null });
    }
    // Loader already binds legacy HTTP's one-use receipt and target identity.
    if (name === 'compat04.http') return facets[name] ?? provider;
    if (HOST_ONLY.has(name) && !trusted(entry, name, METHODS[name]?.[0])) throw new Error('该宿主绑定仅供具名默认插件使用');
    if (name === 'memory.consolidate' && typeof provider === 'function') {
      const api = facet(entry, name, provider, signal);
      return (...args) => api.consolidate(...args);
    }
    if (METHODS[name]) return facet(entry, name, provider, signal);
    return provider;
  }
  function toolContext(context = {}, entry) {
    live(entry);
    const access = (name) => capabilityAccess(name, facets[name], { entry, signal: context.signal });
    return {
      chatKey: context.chatKey, session: bundledFor(entry) ? context.session : redacted(context.session),
      signal: context.signal, botName: context.botName, cfg: sanitizeConfigForApi(snapshot(entry)),
      send: access('core.send'), store: access('data.messages'), memory: access('data.memory'),
      stickers: access('data.stickers'), reminders: access('data.reminders'), mediaReader: access('media.reader'),
      transport: Object.freeze({ actions: access('transport.actions') }),
    };
  }
  function callbackContext(payload = {}, entry, _kind) {
    const context = toolContext(payload, entry);
    // Hooks observe session state; only tools from named defaults retain the
    // original session object used by finish/send runtime operations.
    context.session = sanitizeSdkValue(payload.session);
    for (const key of ['triggerEntries', 'messages', 'toolName', 'args', 'argsRaw', 'result']) {
      if (Object.hasOwn(payload, key)) context[key] = sanitizeSdkValue(payload[key]);
    }
    if (Object.hasOwn(payload, 'response')) context.response = sanitizeSdkValue(payload.response, { preserveRaw: true });
    if (Object.hasOwn(payload, 'context')) context.context = sanitizeProviderArguments('callback', [payload.context], snapshot(entry))[0];
    if (context.cfg?.api) context.api = sanitizeSdkValue(context.cfg.api);
    return context;
  }
  function providerContext(name, args, entry) {
    live(entry);
    const safeArgs = sanitizeProviderArguments(name, args, snapshot(entry));
    return { args: safeArgs, commit() {
      live(entry);
      // Preserve the established in-place LLM body transformation contract,
      // without lending an extension any of the host's source objects.
      if (['llm.request-params', 'llm.retry-advisor'].includes(name)) {
        const original = args[0]?.body, transformed = safeArgs[0]?.body;
        if (original && transformed && typeof original === 'object' && typeof transformed === 'object' && !Array.isArray(transformed)) {
          for (const key of Object.keys(original)) delete original[key];
          Object.assign(original, sanitizeSdkValue(transformed));
        }
      }
      if (name === 'llm.response' && args[0]?.result && safeArgs[0]?.result) {
        for (const key of ['message', 'finishReason', 'usage', 'model', 'raw', 'degraded', 'degradeNote', 'reasoning', 'extraUsage']) {
          if (Object.hasOwn(safeArgs[0].result, key)) args[0].result[key] = sanitizeSdkValue(safeArgs[0].result[key], { preserveRaw: key === 'raw' });
        }
      }
    } };
  }
  // Host-only: never copied into setup(ctx) or its execution contexts.
  return { capabilityAccess, toolContext, callbackContext, providerContext, check,
    consumerSignal: () => consumerContext.getStore() ?? null,
    withoutConsumerContext: action => consumerContext.run(null, action),
  };
}

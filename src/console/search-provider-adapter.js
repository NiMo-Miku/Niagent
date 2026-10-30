import { createWebSearch } from '../kernel/web-search.js';
import { selectSearchConfig } from '../../bundled/web-tools/search-policy.js';

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function clampCount(value, fallback = 6) {
  const number = Number(value);
  return Math.max(1, Math.min(20, Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback));
}

function timeout(value, fallback = 20_000) {
  const number = Number(value);
  return Math.max(5_000, Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback);
}

function view(provider) {
  return {
    id: provider.id, name: provider.name, type: provider.type, baseUrl: provider.baseUrl,
    model: provider.model, count: provider.count, timeoutMs: provider.timeoutMs,
    hasApiKey: Boolean(provider.apiKey),
  };
}

export function createSearchProviderAdapter({ cfg, config, fetchImpl, dnsLookup } = {}) {
  const readCfg = () => (typeof cfg === 'function' ? cfg() : cfg) ?? {};
  const providers = () => Array.isArray(readCfg().webSearch?.providers) ? readCfg().webSearch.providers : [];

  function list() {
    return providers().map(view);
  }

  function upsert(input = {}) {
    const baseUrl = text(input.baseUrl, 1000);
    if (!baseUrl) throw new Error('接口地址不能为空');
    const type = input.type === 'bing' ? 'bing' : 'openai';
    const all = structuredClone(providers());
    let provider = input.id ? all.find((item) => item.id === input.id) : all.find((item) => item.baseUrl === baseUrl && item.type === type);
    if (input.id && !provider) throw new Error('搜索提供商不存在');
    const existing = Boolean(provider);
    if (!provider) {
      provider = { id: `sp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, apiKey: '' };
      all.push(provider);
    }
    if (input.type !== undefined || !existing) provider.type = type;
    provider.baseUrl = baseUrl;
    provider.name = text(input.name, 100) || (existing ? text(provider.name, 100) || baseUrl : baseUrl);
    if (input.model !== undefined || !existing) provider.model = text(input.model, 200);
    provider.count = clampCount(input.count, existing ? clampCount(provider.count, 6) : 6);
    provider.timeoutMs = timeout(input.timeoutMs, existing ? timeout(provider.timeoutMs, 20_000) : 20_000);
    if (input.apiKey !== undefined && input.apiKey !== '******') provider.apiKey = String(input.apiKey);
    config?.update?.({ webSearch: { providers: { __replace__: all } } });
    return view(provider);
  }

  function remove(id) {
    const providerId = text(id, 100);
    if (!providerId) throw new Error('缺少 id');
    const remaining = providers().filter((provider) => provider.id !== providerId);
    const webSearch = { ...(readCfg().webSearch ?? {}), providers: remaining };
    if (webSearch.provider === `custom:${providerId}`) webSearch.provider = 'bing';
    config?.update?.({ webSearch });
  }

  function selected(id) {
    const providerId = text(id, 100);
    if (providerId) {
      const custom = providers().find((provider) => provider.id === providerId);
      if (!custom) throw new Error('搜索提供商不存在');
      return custom;
    }
    const ws = readCfg().webSearch ?? {};
    if (String(ws.provider ?? 'bing').startsWith('custom:')) {
      const custom = providers().find((provider) => provider.id === String(ws.provider).slice(7));
      if (!custom) throw new Error('当前自定义搜索提供商不存在');
      return custom;
    }
    if (ws.provider === 'bing' || !ws.provider) return { type: 'bing', baseUrl: ws.searchUrl ?? 'https://cn.bing.com/search', count: ws.maxResults ?? 6, timeoutMs: 20_000 };
    const selected = selectSearchConfig(ws);
    return { ...selected.conf, type: 'builtin', provider: selected.provider, count: selected.count, timeoutMs: selected.timeoutMs };
  }

  async function search(provider, query) {
    const original = readCfg().webSearch ?? {}, count = clampCount(provider.count, 6);
    const builtin = provider.type === 'builtin', customId = provider.id || 'diagnostic';
    const selection = builtin ? { provider: provider.provider, [provider.provider]: { ...provider } }
      : { provider: 'custom:' + customId, providers: [{ ...provider, id: customId }] };
    const current = readCfg();
    // The custom/Bing diagnostic historically never borrowed the media-only
    // private-host exception. Sharing protocols must not widen that boundary.
    const patched = { ...current, ...(!builtin ? { security: { ...current.security, allowPrivateImageHosts: false } } : {}),
      webSearch: { ...original, ...selection } };
    return (await createWebSearch({ cfg: () => patched, fetchImpl, dnsLookup }).search(query, { maxResults: count })).results;
  }

  async function test(providerId) {
    const startedAt = Date.now();
    try {
      const results = await search(selected(providerId), 'qq agent 测试');
      return { ok: true, count: results.length, sample: results[0]?.title ?? '', latencyMs: Date.now() - startedAt };
    } catch (err) {
      return { ok: false, note: text(err?.message, 500), latencyMs: Date.now() - startedAt };
    }
  }

  return { list, upsert, remove, test, selected, search };
}

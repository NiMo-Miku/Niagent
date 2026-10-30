import { requestModelEndpoint } from './model-request.js';
import { detectDialect } from '../kernel/llm.js';

const MASKED_KEY = '******';

function usableKey(value) {
  return typeof value === 'string' && value.trim() && value !== MASKED_KEY ? value.trim() : '';
}

function joinEndpoint(baseUrl, pathname) {
  const base = String(baseUrl ?? '').trim();
  if (!base) throw new Error('请先填写 Base URL');
  let url;
  try { url = new URL(base.endsWith('/') ? base : `${base}/`); }
  catch { throw new Error('Base URL 格式不合法'); }
  return new URL(pathname.replace(/^\//, ''), url).toString();
}

function providerBaseUrl(provider) {
  return String(provider?.baseUrl ?? provider?.baseURL ?? '').trim();
}

function providerKey(cfg, providerId) {
  const provider = (cfg?.providers ?? []).find((item) => item?.id === providerId);
  return usableKey(cfg?.dshProviderKeys?.[providerId]) || usableKey(provider?.apiKey) || usableKey(provider?.apiKeyFrom && process.env[provider.apiKeyFrom]);
}

export function resolveProviderRequest({ cfg, providerId, baseUrl, apiKey } = {}) {
  const provider = (cfg?.providers ?? []).find((item) => item?.id === providerId);
  const target = String(baseUrl ?? '').trim() || providerBaseUrl(provider);
  const origin = value => { try { return new URL(value).origin; } catch { return ''; } };
  const configured = providerId ? providerBaseUrl(provider) || (providerId === cfg?.api?.provider ? cfg?.api?.baseUrl : '') : cfg?.api?.baseUrl;
  const sameOrigin = !!origin(target) && origin(target) === origin(configured);
  if (providerId && !sameOrigin && !usableKey(apiKey)) throw Object.assign(new Error('所选渠道与模型接口来源不一致，请重新核对地址'), {status:400,expose:true});
  return {
    provider,
    providerId: providerId || provider?.id || '',
    baseUrl: target,
    apiKey: usableKey(apiKey) || (sameOrigin ? providerId ? providerKey(cfg, providerId) : usableKey(cfg?.api?.apiKey) : ''),
  };
}

function requestHeaders(apiKey, extra = {}) {
  return { ...extra, ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) };
}

function friendlyNetworkError(err) {
  const message = String(err?.message ?? err ?? '未知错误');
  if (/请求超时|timeout|timed out|abort/i.test(message)) return '连接超时';
  return `网络错误：${message}`;
}

function safeRequest(url, { config, fetchImpl, dnsLookup, timeoutMs, method = 'GET', headers, body } = {}) {
  return requestModelEndpoint(url, {
    config,
    timeoutMs,
    method,
    headers,
    body,
    maxBytes: 1024 * 1024,
    fetchImpl,
    dnsLookup,
  });
}

function modelRows(data) {
  const items = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
  return items.map((item) => ({ id: String(item?.id ?? item?.model ?? item),
    ...(typeof item?.name === 'string' ? {name: item.name.slice(0, 256)} : {}) })).filter((item) => item.id);
}

export function createProviderAdapters({ cfg, fetchImpl = fetch, dnsLookup } = {}) {
  const request = (url, options) => safeRequest(url, { ...options, config: cfg(), fetchImpl, dnsLookup });

  async function fetchModels({ baseUrl, apiKey, providerId } = {}) {
    const resolved = resolveProviderRequest({ cfg: cfg(), providerId, baseUrl, apiKey });
    const url = joinEndpoint(resolved.baseUrl, '/models');
    const response = await request(url, { timeoutMs: 15_000, headers: requestHeaders(resolved.apiKey) });
    if (response.status < 200 || response.status >= 300) throw new Error(`获取模型列表失败：HTTP ${response.status}`);
    let data;
    try { data = JSON.parse(response.body); }
    catch { throw new Error('获取模型列表失败：响应不是合法 JSON'); }
    return modelRows(data);
  }

  async function testProvider({ providerId, baseUrl, apiKey, provider } = {}) {
    const resolved = resolveProviderRequest({ cfg: cfg(), providerId: providerId ?? provider?.id, baseUrl: baseUrl ?? providerBaseUrl(provider), apiKey: apiKey ?? providerKey(cfg(), provider?.id) });
    const started = Date.now();
    if (!resolved.baseUrl) return { ok: false, verdict: 'no-endpoint', note: '请先填写 Base URL', latencyMs: Date.now() - started };
    try {
      const response = await request(joinEndpoint(resolved.baseUrl, '/models'), { timeoutMs: 12_000, headers: requestHeaders(resolved.apiKey) });
      const latencyMs = Date.now() - started;
      if (response.status >= 200 && response.status < 300) return { ok: true, verdict: 'ok', note: '模型列表接口可用', latencyMs, httpStatus: response.status };
      const verdict = response.status === 401 || response.status === 403 ? 'bad-key' : response.status === 404 ? 'no-models-route' : 'error';
      return { ok: false, verdict, note: `HTTP ${response.status}`, latencyMs, httpStatus: response.status };
    } catch (err) {
      return { ok: false, verdict: 'error', note: friendlyNetworkError(err), latencyMs: Date.now() - started };
    }
  }

  async function testChat({ baseUrl, apiKey, providerId, model } = {}) {
    const resolved = resolveProviderRequest({ cfg: cfg(), providerId, baseUrl, apiKey });
    const started = Date.now();
    if (!resolved.baseUrl) throw Object.assign(new Error('请先填写 Base URL'), { expose: true, status: 400 });
    if (!String(model ?? '').trim()) throw Object.assign(new Error('请先填写模型 ID'), { expose: true, status: 400 });
    try {
      const response = await request(joinEndpoint(resolved.baseUrl, '/chat/completions'), {
        timeoutMs: 20_000,
        method: 'POST',
        headers: requestHeaders(resolved.apiKey, { 'content-type': 'application/json' }),
        body: JSON.stringify({ model: String(model).trim(), messages: [{ role: 'user', content: '请只回复两个字符：pong' }], temperature: 0, max_tokens: 16, stream: false }),
      });
      const latencyMs = Date.now() - started;
      if (response.status < 200 || response.status >= 300) return { ok: false, httpStatus: response.status, latencyMs, note: `HTTP ${response.status}：${response.body.slice(0, 200)}` };
      let data;
      try { data = JSON.parse(response.body); }
      catch { return { ok: false, httpStatus: response.status, latencyMs, note: '响应不是合法 JSON' }; }
      const content = data?.choices?.[0]?.message?.content;
      return { ok: true, httpStatus: response.status, latencyMs, note: content ? `模型回复：「${String(content).slice(0, 60)}」` : '请求成功（无文本返回）' };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, note: friendlyNetworkError(err) };
    }
  }

  async function testAll() {
    const providers = cfg().providers ?? [];
    const results = {};
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, providers.length) }, async () => {
      while (cursor < providers.length) {
        const provider = providers[cursor++];
        results[provider.id] = await testProvider({ provider });
      }
    });
    await Promise.all(workers);
    return { results, okCount: Object.values(results).filter((result) => result.ok).length, total: providers.length };
  }

  async function testApi() {
    const api = cfg().api ?? {};
    const started = Date.now();
    const apiKey = api.provider ? undefined : usableKey(api.apiKey);
    if (!api.baseUrl || !api.model) return { ok: false, error: '请先完整配置 Base URL 和模型', latencyMs: Date.now() - started };
    const result = await testChat({ baseUrl: api.baseUrl, apiKey, providerId: api.provider, model: api.model });
    if (!result.ok) return { ok: false, error: result.note, latencyMs: result.latencyMs };
    const reply = result.note.match(/^模型回复：「(.*)」$/)?.[1] ?? '';
    return { ok: true, model: api.model, reply, latencyMs: result.latencyMs };
  }

  return { fetchModels, testProvider, testChat, testAll, testApi, detectThinking: (baseUrl, model) => detectDialect(baseUrl, model) };
}

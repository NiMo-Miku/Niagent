// Shared default protocol policy. The web.search provider and the diagnostic
// adapter consume this same implementation; neither owns an unguarded transport.
export const SEARCH_PROVIDER_DEFAULTS = Object.freeze(Object.fromEntries(Object.entries({
  deepseek: { baseUrl: 'https://api.deepseek.com/responses', model: 'deepseek-v4-pro', timeoutMs: 60000 },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4/web_search', engine: 'search_std', count: 10, timeoutMs: 20000 },
  bocha: { baseUrl: 'https://api.bochaai.com/v1/web-search', count: 10, timeoutMs: 20000 },
  baidu: { baseUrl: 'https://qianfan.baidubce.com/v2/ai_search/web_search', count: 6, timeoutMs: 20000 },
  metaso: { baseUrl: 'https://metaso.cn/api/v1/search', count: 6, timeoutMs: 20000 },
}).map(([key, value]) => [key, Object.freeze(value)])));

export const buildSearchProviderDefaults = () => Object.fromEntries(Object.entries(SEARCH_PROVIDER_DEFAULTS)
  .map(([key, value]) => [key, { apiKey: '', ...value }]));

const text = value => typeof value === 'string' ? value.trim() : '';
const countOf = (value, fallback = 6) => {
  const number = Number(value);
  return Math.max(1, Math.min(20, Math.floor(Number.isFinite(number) && number !== 0 ? number : fallback)));
};

export function selectSearchConfig(ws = {}, maxResults = null) {
  if (!ws || typeof ws !== 'object' || Array.isArray(ws)) ws = {};
  const provider = text(ws.provider) || 'bing';
  const outputLimit = countOf(maxResults ?? ws.maxResults);
  const defaults = SEARCH_PROVIDER_DEFAULTS[provider];
  let conf;
  if (provider === 'bing') conf = { type: 'bing', baseUrl: ws.searchUrl, count: outputLimit, timeoutMs: 20000 };
  else if (provider.startsWith('custom:')) conf = (ws.providers ?? []).find(item => item?.id === provider.slice(7));
  else if (provider === 'custom') conf = ws.custom;
  else if (defaults) conf = ws[provider] ?? {};
  if (!conf || typeof conf !== 'object' || Array.isArray(conf)) throw new Error(`搜索渠道 ${provider} 未配置（设置 → 联网搜索）`);
  conf = { ...defaults, ...conf, baseUrl: text(conf.baseUrl) || defaults?.baseUrl || '' };
  if (provider !== 'bing' && !conf.baseUrl) throw new Error(`搜索渠道 ${provider} 未配置（设置 → 联网搜索）`);
  const count = countOf(maxResults ?? conf.count, defaults?.count ?? outputLimit);
  const number = Number(conf.timeoutMs);
  const timeoutMs = Math.max(5000, Math.floor(Number.isFinite(number) && number > 0 ? number : defaults?.timeoutMs ?? 20000));
  return { provider, conf, count, limit: Math.min(outputLimit, count), timeoutMs };
}

export function searchEndpoint(provider, baseUrl) {
  const url = new URL(baseUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('搜索接口必须为不含账号密码的HTTP(S)地址');
  // A complete gateway endpoint is authoritative, including its query string.
  // A bare origin still accepts the historical convenience of appending a path.
  if (url.pathname === '/') url.pathname = SEARCH_PROVIDER_DEFAULTS[provider]
    ? new URL(SEARCH_PROVIDER_DEFAULTS[provider].baseUrl).pathname : '/search';
  else if ((provider === 'custom' || provider.startsWith('custom:')) && /^\/v\d+\/?$/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/$/, '') + '/search';
  }
  return url.toString();
}

export function searchJsonRequest(provider, conf, query, count) {
  const url = searchEndpoint(provider, conf.baseUrl);
  const envKeys = { deepseek: 'DEEPSEEK_API_KEY', zhipu: 'ZHIPU_API_KEY', bocha: 'BOCHA_API_KEY', baidu: 'BAIDU_SEARCH_API_KEY', metaso: 'METASO_API_KEY' };
  const apiKey = text(conf.apiKey) || text(process.env[envKeys[provider] ?? `${provider.toUpperCase()}_API_KEY`]);
  if (!apiKey && provider !== 'metaso' && provider !== 'custom' && !provider.startsWith('custom:')) throw new Error(`搜索失败：${provider} 缺少 API Key`);
  let body;
  if (provider === 'deepseek') {
    const model = text(conf.model) || SEARCH_PROVIDER_DEFAULTS.deepseek.model;
    if (new URL(url).hostname === 'api.deepseek.com' && ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'].includes(model)) {
      throw new Error('此DeepSeek型号不支持当前服务端网页搜索，请显式选择deepseek-v4-pro');
    }
    body = { model, input: query, tools: [{ type: 'web_search' }], stream: false };
  } else if (provider === 'zhipu') body = { search_query: query, search_engine: conf.engine || 'search_std', count };
  else if (provider === 'bocha') body = { query, count };
  else if (provider === 'baidu') body = { query, search_source: 'baidu', resource_type_filter: [{ type: 'web', top_k: count }] };
  else if (provider === 'metaso') body = /\/api\/v1\/search\/?$/.test(new URL(url).pathname)
    ? { q: query, size: count, scope: 'webpage' } : { query, top_k: Math.min(10, count) };
  else body = { query, count, ...(conf.model ? { model: conf.model } : {}),
    ...(provider === 'custom' ? { q: query, top_k: Math.min(10, count), ...(conf.model ? { messages: [{ role: 'user', content: query }] } : {}) } : {}) };
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (provider === 'zhipu') headers['api-key'] = apiKey;
  return { url, body: JSON.stringify(body), headers };
}

export function parseSearchResponse(provider, data, limit) {
  if (provider === 'bocha') {
    const failure = [data, data?.data].find(status => status?.code != null && Number(status.code) !== 200);
    if (failure) throw new Error(`搜索失败：博查 API 错误（code ${failure.code}）：${failure.message || failure.msg || '博查错误'}`);
  }
  if (provider === 'baidu' && data?.error_code != null && Number(data.error_code) !== 0) throw new Error(`搜索失败：${data.error_msg || '百度错误'}`);
  if (provider === 'deepseek') {
    if (data?.error) throw new Error(`搜索失败：${data.error.message || 'DeepSeek错误'}`);
    const output = Array.isArray(data?.output) ? data.output.flatMap(item => Array.isArray(item?.content) ? item.content : []).map(item => item?.text ?? '').join(' ') : '';
    const snippet = String(data?.output_text ?? output).trim();
    return snippet ? [{ title: 'DeepSeek 搜索', url: '', snippet }].slice(0, limit) : [];
  }
  const source = provider === 'zhipu' ? data?.search_result : provider === 'bocha' ? data?.data?.webPages?.value ?? data?.webPages?.value
    : provider === 'baidu' ? data?.references : Array.isArray(data) ? data : data?.webpages ?? data?.results ?? data?.data ?? data?.sources ?? data?.references ?? data?.webPages?.value;
  return (Array.isArray(source) ? source : []).filter(row => row && typeof row === 'object' && (row.url || row.link)).slice(0, limit)
    .map(row => ({ title: String(row.title || row.name || '（无标题）'), url: String(row.url || row.link), snippet: String(row.content || row.snippet || row.summary || '') }));
}

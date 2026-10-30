import { safeFetch } from '../kernel/safe-fetch.js';

function modelUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { throw new Error('模型接口地址格式不合法'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('模型接口地址必须使用 http(s)');
  if (url.username || url.password) throw new Error('模型接口地址不能包含用户名或密码');
  return url;
}

function configuredOrigins(config) {
  const values = [config?.api?.baseUrl, ...(config?.providers ?? []).map(provider => provider?.baseUrl ?? provider?.baseURL)];
  const origins = new Set();
  for (const value of values) {
    if (!value) continue;
    try { origins.add(modelUrl(value).origin); } catch { /* Invalid configured URLs grant no access. */ }
  }
  return origins;
}

// Console administrators may explicitly configure a local or LAN model server.
// That grant is limited to the initial origin; model redirects cannot carry the
// credential or private-network access to another origin, including other models.
export async function requestModelEndpoint(value, {
  config, method = 'GET', headers, body, timeoutMs = 15000, maxBytes = 1024 * 1024,
  fetchImpl, dnsLookup, signal,
} = {}) {
  const initial = modelUrl(value), allowPrivate = configuredOrigins(config).has(initial.origin);
  let current = initial, requestMethod = String(method).toUpperCase(), requestBody = body;
  const requestHeaders = new Headers(headers), hops = [], maxRedirects = 5;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    hops.push(current.href);
    const response = await safeFetch(current.href, {
      method: requestMethod, headers: requestHeaders, body: requestBody,
      timeoutMs, maxBytes, fetchImpl, dnsLookup, signal, allowPrivate, followRedirects: false,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { ...response, hops };
    const location = response.headers.get('location');
    if (!location) throw new Error(`模型接口重定向缺少 Location（HTTP ${response.status}）`);
    let next;
    try { next = modelUrl(new URL(location, current).href); } catch (error) { throw error; }
    if (next.origin !== initial.origin) throw new Error('模型接口重定向离开已指定的服务来源，已拒绝访问');
    if (hop === maxRedirects) throw new Error(`模型接口重定向次数过多（>${maxRedirects} 跳）`);
    if ((response.status === 303 && requestMethod !== 'HEAD') || ([301, 302].includes(response.status) && requestMethod === 'POST')) {
      requestMethod = 'GET'; requestBody = undefined;
      for (const name of ['content-type', 'content-length', 'content-encoding', 'transfer-encoding']) requestHeaders.delete(name);
    }
    current = next;
  }
}

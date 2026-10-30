// 联网搜索与网页抓取（SPEC §8 T-19/T-20/T-27 + notes/05 C-web-01/02）。
// bing 模式零配置可用（抓 b_algo 页面解析）；API 型 provider 走 JSON。
// 所有出站经 ctx.http.fetch（宿主授权、SSRF 逐跳与实例取消）。
import { selectSearchConfig, searchJsonRequest, parseSearchResponse } from './search-policy.js';

const MAX_FETCH_CHARS = 20000; // web_fetch ≤2 万字符（notes/08 T-20）

export function buildBingUrl(searchUrl, query, maxResults) {
  const base = searchUrl || 'https://cn.bing.com/search';
  const u = new URL(base);
  u.searchParams.set('q', String(query));
  u.searchParams.set('count', String(Math.max(1, Number(maxResults) || 6)));
  return u.toString();
}

// Bing 结果页解析（b_algo 块：标题 a / 摘要 p）
export function parseBingHtml(html, limit = 6) {
  const out = [];
  const blocks = String(html).split(/<li class="b_algo"/i).slice(1);
  for (const b of blocks) {
    const titleM = b.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleM) continue;
    const url = titleM[1];
    const title = stripTags(titleM[2]);
    const snippetM = b.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetM ? stripTags(snippetM[1]).slice(0, 300) : '';
    out.push({ title, url, snippet });
    if (out.length >= limit) break;
  }
  return out;
}

function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

export function extractImages(html, baseUrl) {
  const out = [];
  const re = /<img[^>]+src="([^"]+)"/gi;
  for (const m of String(html).matchAll(re)) {
    try { out.push(new URL(m[1], baseUrl).toString()); } catch { /* 跳过非法 */ }
    if (out.length >= 20) break;
  }
  return out;
}

export function extractReadableText(html) {
  let s = String(html);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n');
  return stripTags(s).replace(/\n{3,}/g, '\n\n').trim();
}

export function createWebSearch({ cfg, http, log = console } = {}) {
  const readCfg = () => (typeof cfg === 'function' ? cfg() : cfg) ?? {};

  async function request(url, init = {}) {
    const response = await http.fetch(url, init);
    return { status: response.status, body: await response.text(), headers: response.headers,
      finalUrl: response.url || String(url), truncated: response.truncated === true };
  }

  function lockState() {
    const sec = readCfg().security ?? {};
    const bl = sec.browseLock ?? {};
    return { browseLocked: bl.enabled === true, allowedHosts: bl.hosts ?? [], allowPrivate: sec.allowPrivateImageHosts === true };
  }

  async function search(query, { maxResults = null, signal } = {}) {
    const { provider, conf, count, limit, timeoutMs } = selectSearchConfig(readCfg().webSearch, maxResults);
    const { browseLocked, allowedHosts, allowPrivate } = lockState();
    if (conf.type === 'bing') {
      const res = await request(buildBingUrl(conf.baseUrl, query, count), { browseLocked, allowedHosts, allowPrivate, signal, maxBytes: 2 * 1024 * 1024, timeoutMs });
      if (res.status >= 400) throw new Error('搜索失败：HTTP ' + res.status);
      const results = parseBingHtml(res.body, limit);
      return { query, results, ...(results.length ? {} : { note: '没有搜到结果，试试换关键词或更具体的说法。' }) };
    }
    const { url, body, headers } = searchJsonRequest(provider, conf, query, count);
    const res = await request(url, { method: 'POST', body, headers, timeoutMs, browseLocked, allowedHosts, allowPrivate, signal });
    if (res.status >= 400) throw new Error('搜索失败：HTTP ' + res.status);
    let data;
    try { data = JSON.parse(res.body); } catch { throw new Error('搜索失败：响应不是合法 JSON'); }
    const results = parseSearchResponse(provider, data, limit);
    return { query, results, note: results.length ? undefined : '没有搜到结果，试试换关键词。' };
  }

  async function fetchPage(url, { maxChars = MAX_FETCH_CHARS, signal } = {}) {
    const { browseLocked, allowedHosts } = lockState();
    // 图床内网例外仅用于媒体下载；网页读取始终逐跳拒绝私网地址。
    const res = await request(url, { browseLocked, allowedHosts, allowPrivate: false, signal, maxBytes: 5 * 1024 * 1024 });
    const text = extractReadableText(res.body);
    return {
      url: res.finalUrl, statusCode: res.status,
      truncated: res.truncated || text.length > maxChars,
      content: text.slice(0, maxChars),
      images: extractImages(res.body, res.finalUrl),
    };
  }

  return { search, fetchPage, lockState };
}

// Images have their own replaceable provider; webpage search substitutions do
// not need to implement image parsing or carry privileged host objects.
function decodeImageValue(value) {
  const raw = String(value ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  try { return JSON.parse('"' + raw + '"'); } catch { return raw.replace(/\\\//g, '/'); }
}

function imageCollector(limit) {
  const count = Math.min(12, Math.max(1, Number(limit) || 8)), seen = new Set(), result = [];
  const add = row => {
    const value = typeof row === 'string' ? row : row?.url;
    let url;
    try { url = new URL(String(value ?? '').trim()); } catch { return false; }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || seen.has(url.href)) return false;
    seen.add(url.href);
    result.push({ ...(row && typeof row === 'object' ? row : {}), url: url.href });
    return result.length >= count;
  };
  return { result, add };
}

export function normalizeImageResults(rows, limit = 8) {
  const collector = imageCollector(limit);
  for (const row of Array.isArray(rows) ? rows : []) if (collector.add(row)) break;
  return collector.result;
}

function parseBaiduImages(html, limit) {
  const collector = imageCollector(limit);
  for (const key of ['objURL', 'middleURL', 'thumbURL', 'hoverURL']) {
    const pattern = new RegExp('"' + key + '"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"', 'g');
    for (const match of String(html).matchAll(pattern)) if (collector.add({ url: decodeImageValue(match[1]) })) return collector.result;
  }
  return collector.result;
}

function parseBingImages(html, baseUrl, limit) {
  const collector = imageCollector(limit);
  for (const match of String(html).matchAll(/\bm\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    const raw = String(match[2]).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    let value;
    try { const data = JSON.parse(raw); value = data.murl || data.mediaurl; }
    catch { value = raw.match(/"murl"\s*:\s*"([^"]+)"/)?.[1]; }
    if (value && collector.add({ url: decodeImageValue(value) })) return collector.result;
  }
  // Preserve the current standalone murl path as well as old m-attribute JSON.
  for (const match of String(html).matchAll(/"murl"\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
    const value = decodeImageValue(match[1]);
    let decoded; try { decoded = decodeURIComponent(value); } catch { decoded = value; }
    if (collector.add({ url: decoded })) return collector.result;
  }
  if (collector.result.length) return collector.result;
  return normalizeImageResults(extractImages(html, baseUrl), limit);
}

/**
 * Public web.images contract, independent of web.search:
 * { search(query, { limit = 8, signal } = {}) -> Promise<{ results: [{ url, ... }], ... }> }
 * The tool requires results, filters HTTP(S) URLs, credentials, duplicates and count
 * (default 8, max 12), and keeps extra result metadata. A rejection stays a tool
 * failure; it never invokes the default behind a replacement provider's back.
 * Providers use their own scoped HTTP API and respect signal. Keep the returned
 * object/search method stable during a call; changing either discards its result.
 * This does not observe re-registration of an identical object and method.
 * Image links remain data; send_image keeps its existing download/media gates.
 */
export function createImageSearch({ cfg, http } = {}) {
  const readCfg = () => (typeof cfg === 'function' ? cfg() : cfg) ?? {};
  async function search(query, { limit = 8, signal } = {}) {
    const q = String(query ?? '').trim();
    if (!q) throw new Error('query 不能为空');
    const count = Math.min(12, Math.max(1, Number(limit) || 8));
    const current = readCfg(), lock = current.security?.browseLock ?? {};
    const network = { browseLocked: lock.enabled === true, allowedHosts: lock.hosts ?? [], allowPrivate: current.security?.allowPrivateImageHosts === true, maxBytes: 3 * 1024 * 1024, signal };
    const baidu = new URL('https://image.baidu.com/search/index');
    baidu.searchParams.set('tn', 'baiduimage'); baidu.searchParams.set('word', q);
    const bing = new URL(current.webSearch?.searchUrl || 'https://cn.bing.com/search');
    bing.pathname = '/images/search'; bing.searchParams.set('q', q);
    const sources = [], attempts = [
      { name: 'Baidu', url: baidu, parse: parseBaiduImages },
      { name: 'Bing', url: bing, parse: (html, limit2) => parseBingImages(html, bing.toString(), limit2) },
    ];
    for (const source of attempts) {
      if (signal?.aborted) throw signal.reason ?? new Error('图搜已中止');
      try {
        const response = await http.fetch(source.url.toString(), network);
        if (response.status >= 400) throw new Error('HTTP ' + response.status);
        const rows = source.parse(await response.text(), count);
        if (signal?.aborted) throw signal.reason ?? new Error('图搜已中止');
        sources.push({ name: source.name, status: rows.length ? 'ok' : 'empty' });
        if (rows.length) return { query: q, results: rows, sources };
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError' || /实例.*(?:失效|停止)|权限|授权|已中止/.test(String(error?.message ?? error))) throw signal?.reason ?? error;
        sources.push({ name: source.name, status: 'error', reason: String(error?.message ?? error) });
      }
    }
    if (sources.some(source => source.status === 'error')) {
      throw new Error('图片搜索未返回结果：' + sources.map(source => source.name + '：' + (source.status === 'empty' ? '无图片结果' : source.reason)).join('；'));
    }
    return { query: q, results: [], note: 'Baidu 与 Bing 均未返回图片结果。可换更具体的关键词。', sources };
  }
  return { search };
}

// 24 · web-search：Bing URL 构造 / b_algo 解析 / 正文提炼 / 图片抽取 / 浏览锁定
import { ok, eq, section, summary } from './helpers.mjs';
import { buildBingUrl, parseBingHtml, extractImages, extractReadableText, createWebSearch } from '../src/kernel/web-search.js';

section('buildBingUrl（URL 构造）');
const u = buildBingUrl('https://cn.bing.com/search', '今天天气', 6);
ok(u.startsWith('https://cn.bing.com/search?'), '基于 searchUrl');
ok(u.includes('q=' + encodeURIComponent('今天天气')), 'q 参数编码');
ok(u.includes('count=6'), 'count 参数');

section('parseBingHtml（b_algo 块解析）');
const html = `
<li class="b_algo"><h2><a href="https://a.com/1">标题一</a></h2><p>摘要一 &amp; 更多</p></li>
<li class="b_algo"><h2><a href="https://b.com/2"><strong>标题</strong>二</a></h2><p>摘要二</p></li>
`;
const results = parseBingHtml(html, 6);
eq(results.length, 2, '解析 2 条');
eq(results[0].url, 'https://a.com/1', 'URL 提取');
eq(results[0].title, '标题一', '标题提取');
ok(results[0].snippet.includes('&'), '实体解码（&amp; → &）');
eq(results[1].title, '标题二', '嵌套标签剥离');

section('parseBingHtml 空结果');
eq(parseBingHtml('<li class="b_algo">无 h2</li>', 6).length, 0, '无标题块忽略');

section('extractImages / extractReadableText');
const page = '<div><script>var x=1;</script><p>正文一</p><p>正文二</p><img src="/i/1.png"><img src="https://x.com/2.jpg"></div>';
eq(extractImages(page, 'https://base.com/page').length, 2, '抽 2 张图');
ok(extractImages(page, 'https://base.com/page')[0].startsWith('https://base.com/i/1.png'), '相对路径补全');
const text = extractReadableText(page);
ok(!text.includes('var x=1'), 'script 剔除');
ok(text.includes('正文一') && text.includes('正文二'), '正文保留');

section('createWebSearch（bing 零配置可用 + 零结果文案）');
let capturedUrl = null;
const ws = createWebSearch({
  cfg: () => ({ webSearch: { enabled: true, searchUrl: 'https://cn.bing.com/search', maxResults: 6, provider: 'bing' }, security: { allowPrivateImageHosts: false, browseLock: { enabled: false, hosts: [] } } }),
  log: {},
  fetchImpl: (...args) => globalThis.fetch(...args),
  dnsLookup: async () => [{ address: '8.8.8.8', family: 4 }],
});
// 显式注入 transport，避免固定 IP 的生产连接执行真实网络请求。
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  capturedUrl = String(url);
  return {
    status: 200,
    headers: { get: () => 'text/html' },
    body: {
      getReader() {
        let sent = false;
        return {
          read: async () => sent ? { done: true } : (sent = true, { done: false, value: Buffer.from('<li class="b_algo"><h2><a href="https://r.com">结果</a></h2><p>摘要</p></li>') }),
          cancel: async () => {},
        };
      },
    },
  };
};
const res = await ws.search('测试');
globalThis.fetch = realFetch;
ok(capturedUrl && capturedUrl.includes('cn.bing.com'), '走 bing 搜索');
ok(capturedUrl.includes('q=' + encodeURIComponent('测试')), 'q 参数');
eq(res.results.length, 1, '解析出 1 条结果');

section('零结果文案（不算错误）');
const ws2 = createWebSearch({
  cfg: () => ({ webSearch: { provider: 'bing', searchUrl: 'https://cn.bing.com/search' }, security: {} }),
  log: {},
  fetchImpl: (...args) => globalThis.fetch(...args),
  dnsLookup: async () => [{ address: '8.8.8.8', family: 4 }],
});
globalThis.fetch = async () => ({
  status: 200, headers: { get: () => 'text/html' },
  body: { getReader() { let sent = false; return { read: async () => sent ? { done: true } : (sent = true, { done: false, value: Buffer.from('<html>no results</html>') }), cancel: async () => {} }; } },
});
const empty = await ws2.search('冷门词');
globalThis.fetch = realFetch;
eq(empty.results.length, 0, '零结果');
ok(empty.note.includes('没有搜到结果'), '零结果提示文案');

section('API 型 provider 缺 Key 报错（人话）');
const ws3 = createWebSearch({
  cfg: () => ({ webSearch: { provider: 'bocha', bocha: { baseUrl: 'https://api.bocha.cn', apiKey: '' } }, security: {} }),
  log: {},
});
let err = null;
try { await ws3.search('x'); } catch (e) { err = e; }
ok(err && /缺少 API Key/.test(err.message), '缺 Key 报错');

section('lockState（浏览锁定状态读取）');
const ws4 = createWebSearch({
  cfg: () => ({ security: { allowPrivateImageHosts: true, browseLock: { enabled: true, hosts: ['kondius.cn'] } } }),
  log: {},
});
const lock = ws4.lockState();
eq(lock.browseLocked, true, 'browseLocked');
eq(lock.allowedHosts, ['kondius.cn'], 'hosts');
eq(lock.allowPrivate, true, 'allowPrivate');

summary('24-webtools');

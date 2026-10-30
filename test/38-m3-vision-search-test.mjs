import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createChatStore } from '../src/kernel/store.js';
import { mktmp, eq, ok, section, summary, sleep } from './helpers.mjs';

const dataDir = mktmp('qqa-m3-vision-search-');
const staticDir = mktmp('qqa-m3-vision-search-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html>');
const log = { error() {}, warn() {}, info() {}, recent: () => [], setLevel: (x) => x };
const config = createConfig({ dataDir, defaults: buildDefaultConfig({ personaText: '' }), log });
config.load();
config.update({
  server: { port: 0, token: 'vision-secret' },
  api: { provider: 'vision', baseUrl: 'https://vision.example/v1', apiKey: 'vision-key', model: 'vision-model' },
  providers: [{ id: 'vision', baseUrl: 'https://vision.example/v1', models: ['vision-model'] }],
  dshProviderKeys: { vision: 'vision-key' },
});
const busEvents = [];
const bus = { emit(name, payload) { busEvents.push({ name, payload }); } };
const fetchCalls = [];
const fetchImpl = async (url, opts = {}) => {
  fetchCalls.push({ url, opts });
  if (String(url).includes('vision.example')) {
    await sleep(30);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (String(url).includes('search.example')) {
    return new Response(JSON.stringify({ results: [{ title: '测试结果', url: 'https://result.example', snippet: 'ok' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`unexpected URL ${url}`);
};
const dnsLookup = async () => [{ address: '8.8.8.8' }];
const sessions = createSessionRegistry({ dataDir, log, bus });
const store = createChatStore({ dataDir, log });
const loader = { listEntries: () => [], promptSections: () => [], loadAll: async () => [], setEnabled: async () => [] };
const orchestrator = { status: () => ({}), pause() {}, resume() {}, retrySession: () => ({ ok: true }), abortSession: () => ({ ok: true }) };
const capability = { names: () => [], explain: () => ({}) };
const registry = { list: () => [] };
const http = createHttpServer({ config, log, staticDir, bus });
registerConsoleRoutes(http, { config, sessions, store, loader, orchestrator, log, capability, registry, dataDir, onebot: {}, bus, fetchImpl, dnsLookup });
const port = await http.listen();
async function req(method, url, body) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'x-console-token': 'vision-secret' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}

section('R36/R37 视觉扫描的 200、202、409 与 SSE 总线兼容');
let response = await req('GET', '/api/vision/results');
eq(response.status, 200, '初始视觉结果 200');
eq(response.data.scanning, false, '初始未扫描');
ok(response.data.results['vision|||vision-model'], '模型显示 unknown 结果');
response = await req('POST', '/api/vision/scan', { providerIds: ['vision'] });
eq(response.status, 202, '扫描异步接受');
eq(response.data.started, true, '扫描已启动');
response = await req('POST', '/api/vision/scan', {});
eq(response.status, 409, '运行中冲突');
eq(response.data.error, '已有一次扫描正在进行', '冲突文案');
await sleep(100);
response = await req('GET', '/api/vision/results');
eq(response.data.scanning, false, '扫描结束');
eq(response.data.results['vision|||vision-model'].verdict, 'vision', '带图探测成功');
ok(busEvents.some((event) => event.name === 'vision.scan' && event.payload.phase === 'start'), 'start SSE 总线事件');
ok(busEvents.some((event) => event.name === 'vision.scan' && event.payload.phase === 'done'), 'done SSE 总线事件');
ok(fetchCalls.some((call) => JSON.parse(call.opts.body ?? '{}').messages?.[0]?.content?.some((part) => part.type === 'image_url')), '探测请求真实带图');

section('R38-R41 搜索提供商脱敏、三态 key、clamp 和测试');
response = await req('POST', '/api/search-providers', { baseUrl: 'https://search.example/v1', type: 'openai', apiKey: 'search-key', count: 99, timeoutMs: 1 });
eq(response.status, 200, '新建提供商');
const provider = response.data.provider;
eq(provider.count, 20, 'count 上限 clamp');
eq(provider.timeoutMs, 5000, 'timeout 下限 clamp');
eq(provider.hasApiKey, true, '密钥仅标记');
ok(!('apiKey' in provider), '响应不泄露密钥');
response = await req('GET', '/api/search-providers');
eq(response.data.providers.length, 1, '列表含一项');
ok(!('apiKey' in response.data.providers[0]), '列表不泄露密钥');
response = await req('POST', '/api/search-providers', { baseUrl: 'https://search.example/v1', type: 'openai', apiKey: '******' });
eq(response.data.provider.hasApiKey, true, '掩码保持密钥');
response = await req('POST', '/api/search-providers', { baseUrl: 'https://search.example/v1', type: 'openai', apiKey: '' });
eq(response.data.provider.hasApiKey, false, '空串清除密钥');
response = await req('POST', '/api/search-providers', { baseUrl: 'https://search.example/v1', type: 'openai', apiKey: 'search-key', count: 2 });
config.update({ webSearch: { provider: `custom:${provider.id}` } });
response = await req('POST', '/api/search-providers/test', { providerId: provider.id });
eq(response.status, 200, '测试一律 200');
eq(response.data.result.ok, true, '可注入网络测试成功');
eq(response.data.result.count, 1, '测试结果数');
eq(response.data.result.sample, '测试结果', '测试标题');
response = await req('DELETE', '/api/search-provider', { id: provider.id });
eq(response.status, 200, '删除自定义源（单数兼容别名）');
eq(config.get().webSearch.provider, 'bing', '删除当前 custom 源回落 bing');
response = await req('POST', '/api/search-providers/test', { providerId: 'missing' });
eq(response.status, 200, '失败测试仍 200');
eq(response.data.result.ok, false, '失败以 result 表示');
response = await req('POST', '/api/search-providers', {});
eq(response.status, 400, '空地址 400');
eq(response.data.ok, false, '异常响应带 ok false');

await http.close();
summary('38-m3-vision-search');

import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { eq, ok, mktmp, section, summary, sleep } from './helpers.mjs';

const dataDir = mktmp('qqa-m3-provider-routes-');
const staticDir = mktmp('qqa-m3-provider-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), 'ok');
const log = { error() {}, warn() {}, info() {}, level: 'info', recent: () => [], setLevel: () => 'info' };
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log });
config.load();
config.update({
  server: { port: 0, token: 'provider-secret' },
  api: { baseUrl: 'https://api.example.test/v1', apiKey: 'top-key', model: 'top-model', provider: 'p1' },
  providers: [{ id: 'p1', baseUrl: 'https://api.example.test/v1' }],
  dshProviderKeys: { p1: 'provider-key' },
});
const calls = [];
let active = 0;
let peak = 0;
const fakeFetch = async (url, init = {}) => {
  calls.push({ url, init });
  active++; peak = Math.max(peak, active);
  await sleep(5);
  active--;
  if (String(url).includes('fail.example.test') && String(url).endsWith('/models')) return new Response('denied', { status: 401 });
  if (String(url).includes('missing.example.test') && String(url).endsWith('/models')) return new Response('', { status: 404 });
  if (String(url).includes('/chat/completions')) {
    if (String(url).includes('chat-fail.example.test')) return new Response('quota', { status: 429 });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const dnsLookup = async () => [{ address: '203.0.113.8', family: 4 }];
const bus = { emit() {} };
const sessions = createSessionRegistry({ dataDir, log, bus });
const store = createChatStore({ dataDir, log });
const memory = createMemoryStore({ dataDir, log });
const loader = { listEntries: () => [], promptSections: () => [], loadAll: async () => [], setEnabled: async () => [] };
const orchestrator = { status: () => ({}), pause() {}, resume() {}, stopProactiveLoop() {} };
const http = createHttpServer({ config, log, staticDir });
registerConsoleRoutes(http, { config, sessions, store, memory, loader, orchestrator, log, capability: { names: () => [], explain: () => ({}) }, registry: { list: () => [], availability: () => ({ ok: true }) }, dataDir, onebot: {}, fetchImpl: fakeFetch, dnsLookup });
const port = await http.listen();
async function request(pathname, body = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { method: 'POST', headers: { 'x-console-token': 'provider-secret', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

section('R27 获取模型：显式 Key、同来源渠道 Key、直连 Key 隔离与失败 502');
let response = await request('/api/providers/fetch-models', { baseUrl: 'https://fetch.example.test/v1', apiKey: 'explicit-key', providerId: 'p1' });
eq(response.status, 200, 'fetch models status');
eq(response.data.models[0].id, 'model-a', 'fetch models dto');
eq(calls.at(-1).init.headers.authorization, 'Bearer explicit-key', 'explicit key first');
response = await request('/api/providers/fetch-models', { baseUrl: 'https://api.example.test/v1', apiKey: '******', providerId: 'p1' });
eq(response.status,200,'same-origin saved provider key remains supported');
eq(calls.at(-1).init.headers.authorization, 'Bearer provider-key', 'provider key fallback');
let beforeCross=calls.length;
response=await request('/api/providers/fetch-models',{baseUrl:'https://fetch.example.test/v1',apiKey:'******',providerId:'p1'});
eq(response.status,502,'cross-origin automatic channel key rejected');eq(calls.length,beforeCross,'rejected request sends no credential');
config.update({ dshProviderKeys: {} });
response = await request('/api/providers/fetch-models', { baseUrl: 'https://fetch.example.test/v1', providerId: 'none' });
eq(response.status,502,'unknown channel does not borrow a global key');eq(calls.length,beforeCross,'unknown channel sends no credential');
response=await request('/api/providers/fetch-models',{baseUrl:'https://api.example.test/v1'});
eq(response.status,200,'direct-mode discovery works');eq(calls.at(-1).init.headers.authorization,'Bearer top-key','direct-mode same-origin global key remains supported');
response=await request('/api/providers/fetch-models',{baseUrl:'https://public.example.test/v1'});
eq(response.status,200,'public discovery can run anonymously');eq(calls.at(-1).init.headers.authorization,undefined,'public discovery does not borrow global direct key');
response = await request('/api/providers/fetch-models', {});
eq(response.status, 502, 'missing base url status');
eq(response.data.error, '请先填写 Base URL', 'missing base url error');
eq(response.data.ok, false, 'missing base URL failed DTO');
response = await request('/api/providers/fetch-models', { baseUrl: 'https://fail.example.test/v1' });
eq(response.status, 502, 'upstream HTTP failure status');
eq(response.data.error, '获取模型列表失败：HTTP 401', 'upstream HTTP failure body');
eq(response.data.ok, false, 'upstream HTTP failed DTO');

section('R28 单 provider 测试：恒 200、判定 DTO');
response = await request('/api/providers/test-one', { baseUrl: 'https://missing.example.test/v1' });
eq(response.status, 200, 'test one status');
eq(response.data.result.verdict, 'no-models-route', '404 verdict');
response = await request('/api/providers/test-one', { baseUrl: 'https://fail.example.test/v1' });
eq(response.data.result.verdict, 'bad-key', '401 verdict');
response = await request('/api/providers/test-one', {});
eq(response.data.result.verdict, 'no-endpoint', 'missing endpoint verdict');

section('R29 最小试聊：真实 OpenAI 兼容请求与人话失败');
response = await request('/api/providers/test-chat', { baseUrl: 'https://chat.example.test/v1', model: 'demo' });
eq(response.status, 200, 'test chat status');
eq(response.data.result.ok, true, 'test chat success');
eq(response.data.result.note, '模型回复：「pong」', 'test chat reply');
const chatCall = calls.at(-1);
const chatBody = JSON.parse(chatCall.init.body);
eq(chatBody.temperature, 0, 'temperature zero');
eq(chatBody.max_tokens, 16, 'tiny budget');
eq(chatBody.messages[0].content, '请只回复两个字符：pong', 'fixed probe prompt');
response = await request('/api/providers/test-chat', { baseUrl: 'https://chat-fail.example.test/v1', model: 'demo' });
eq(response.status, 200, 'chat HTTP failure remains 200');
eq(response.data.result.ok, false, 'chat HTTP failure dto');
ok(response.data.result.note.startsWith('HTTP 429：'), 'chat HTTP failure is readable');
response = await request('/api/providers/test-chat', { model: 'demo' });
eq(response.status, 400, 'chat missing base URL');
response = await request('/api/providers/test-chat', { baseUrl: 'https://chat.example.test/v1' });
eq(response.status, 400, 'chat missing model');

section('R35 批测：最多四并发且结果按 provider id');
config.update({ providers: Array.from({ length: 6 }, (_, index) => ({ id: `batch-${index}`, baseUrl: `https://batch-${index}.example.test/v1` })) });
peak = 0;
response = await request('/api/providers/test-all');
eq(response.status, 200, 'test all status');
eq(response.data.total, 6, 'test all total');
eq(response.data.okCount, 6, 'test all success count');
eq(Object.keys(response.data.results).length, 6, 'test all keyed results');
ok(peak <= 4, 'test all concurrency limited to four');

section('R42 当前 API 最小探针：成功与配置错误均为 DTO');
config.update({ api: { baseUrl: 'https://chat.example.test/v1', apiKey: 'top-key', model: 'top-model', provider: '' } });
response = await request('/api/test/api');
eq(response.status, 200, 'api test status');
eq(response.data.ok, true, 'api test success');
eq(response.data.reply, 'pong', 'api test reply');
config.update({ api: { baseUrl: '', apiKey: '', model: '' } });
response = await request('/api/test/api');
eq(response.status, 200, 'api missing config stays 200');
eq(response.data.ok, false, 'api missing config failure');

await http.close();
summary('33-m3-provider-routes');

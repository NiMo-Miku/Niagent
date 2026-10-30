import fs from 'node:fs';
import path from 'node:path';
import httpNode from 'node:http';
import zlib from 'node:zlib';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { assertForwardUrl } from '../src/console/route-adapters.js';
import { safeFetch } from '../src/kernel/safe-fetch.js';
import { eq, ok, mktmp, section, summary } from './helpers.mjs';

const dataDir = mktmp('qqa-m3-chat-forward-');
const staticDir = mktmp('qqa-m3-chat-forward-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), 'ok');
const log = { error() {}, warn() {}, info() {}, level: 'info', recent: () => [], setLevel: () => 'info' };
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log });
config.load();
config.update({ server: { port: 0, token: 'chat-forward-secret' }, allowAllWhenEmpty: true });
const calls = [];
const onebot = {
  client: { async call(action, params) { calls.push([action, params]); return { data: { group_name: '测试群' } }; } },
  // 归一化 actions 契约（routes 走 getGroupName，内部仍经 client.call 便于计数）
  actions: { async getGroupName(chatKey) { return (await onebot.client.call('get_group_info', { group_id: Number(String(chatKey).split(':').pop()) }))?.data?.group_name ?? ''; } },
};
const http = createHttpServer({ config, log, staticDir });
let forwarded;
const fetchImpl = async (url, opts) => {
  forwarded = { url: String(url), opts };
  return new Response('upstream', { status: 201, headers: { 'content-type': 'text/plain', 'content-encoding': 'gzip', 'set-cookie': 'secret=1', connection: 'close' } });
};
const noops = { listEntries: () => [], promptSections: () => [], names: () => [], explain: () => ({}), status: () => ({}), listChats: () => [{ chatKey: 'group:123', count: 1, lastActive: 1, lastText: '群消息', unread: 0 }, { chatKey: 'private:456', count: 1, lastActive: 2, lastText: '私聊消息', unread: 0 }] };
registerConsoleRoutes(http, {
  config, dataDir, fetchImpl, dnsLookup: async () => [{ address: '8.8.8.8', family: 4 }], log, onebot,
  sessions: { ...noops, listSummaries: () => [], get: () => null, delete: () => false, clearFinished: () => 0 },
  store: { ...noops, setMaxPerChat() {}, markAllRead: () => 0 }, loader: noops, orchestrator: noops, capability: noops,
});
const port = await http.listen();
const base = `http://127.0.0.1:${port}`;
async function request(method, suffix, body, headers = {}) {
  const response = await fetch(`${base}${suffix}`, { method, headers: { 'x-console-token': 'chat-forward-secret', ...headers }, ...(body === undefined ? {} : { body }) });
  return response;
}

section('R70 chat key/chatKey 与群名查询');
let response = await request('GET', '/api/chats');
let data = await response.json();
eq(data.chats[0].key, 'group_123', 'group key uses URL-compatible underscore');
eq(data.chats[0].chatKey, 'group:123', 'group chatKey remains canonical');
eq(data.chats[0].chatName, '测试群', 'group name comes from OneBot');
eq(data.chats[1].chatName, '', 'private chat name falls back empty');
eq(calls.length, 1, 'group info called once');
response = await request('GET', '/api/chats');
await response.arrayBuffer();
eq(calls.length, 1, 'group name cache avoids repeat call');

section('R90 白名单错误文案');
try { assertForwardUrl('https://example.com/'); } catch (error) { eq(error.status, 403, 'forward whitelist status'); eq(error.message, '目标不在转发白名单（仅 https 的 aliyuncs/alicdn 域）：example.com', 'forward whitelist exact message'); }

section('R90 content-encoding and hop-by-hop headers');
response = await request('POST', `/api/captcha-forward?u=${encodeURIComponent('https://a.aliyuncs.com/ok')}`, Buffer.from('raw\0bytes'), {
  'content-type': 'application/octet-stream', 'content-encoding': 'gzip', cookie: 'secret=1', 'x-custom': 'keep',
});
eq(response.status, 201, 'forward preserves upstream status');
eq(response.headers.get('content-encoding'), null, 'forward strips response content-encoding');
eq(response.headers.get('set-cookie'), null, 'forward strips response set-cookie');
eq(Buffer.from(await response.arrayBuffer()).toString(), 'upstream', 'forward preserves body bytes');
ok(!('host' in forwarded.opts.headers) && !('content-length' in forwarded.opts.headers) && !('content-encoding' in forwarded.opts.headers) && !('cookie' in forwarded.opts.headers) && !('x-console-token' in forwarded.opts.headers), 'forward strips sensitive and hop-by-hop request headers');
eq(forwarded.opts.headers['content-type'], 'application/octet-stream', 'forward preserves content type');
eq(forwarded.opts.headers['x-custom'], 'keep', 'forward preserves ordinary header');

section('safeFetch 自动解压压缩响应');
const compressionServer = httpNode.createServer((_req, res) => {
  const encoded = zlib.gzipSync(Buffer.from('压缩响应原文'));
  res.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/plain; charset=utf-8' });
  res.end(encoded);
});
await new Promise((resolve) => compressionServer.listen(0, '127.0.0.1', resolve));
const compressionPort = compressionServer.address().port;
const compressed = await safeFetch(`http://127.0.0.1:${compressionPort}/`, { allowPrivate: true, expectBinary: true });
eq(compressed.body.toString('utf8'), '压缩响应原文', 'Node fetch decompresses gzip body');
eq(compressed.headers.get('content-encoding'), 'gzip', 'safeFetch preserves source response header for caller semantics');
await new Promise((resolve) => compressionServer.close(resolve));

section('safeFetch body timeout');
let aborted = false;
const stallFetch = async (_url, opts) => {
  const stream = new ReadableStream({
    start(controller) {
      opts.signal.addEventListener('abort', () => { aborted = true; controller.error(new Error('请求超时')); }, { once: true });
    },
  });
  return new Response(stream, { status: 200 });
};
let timedOut = false;
try { await safeFetch('https://stall.example', { allowPrivate: true, timeoutMs: 20, fetchImpl: stallFetch }); }
catch { timedOut = true; }
ok(timedOut && aborted, 'safeFetch timeout covers stalled response body');

await http.close();
summary('39-m3-chat-forward');

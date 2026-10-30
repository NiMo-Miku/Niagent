import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { Bus } from '../src/kernel/bus.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createSseBridge } from '../src/console/sse-bridge.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { eq, ok, mktmp, section, summary } from './helpers.mjs';

const dataDir = mktmp('qqa-m3-core-route-');
const staticDir = mktmp('qqa-m3-core-route-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), 'ok');
const logCalls = [];
const log = {
  level: 'info',
  error() {}, warn() {}, info() {},
  recent(options) { logCalls.push(options); return options.minLevel === 'warn' ? [{ level: 'warn', text: 'warning' }] : []; },
  setLevel(level) { this.level = level; return this.level; },
};

section('R04 会话摘要保留 vendor');
const sessionDataDir = mktmp('qqa-m3-core-session-');
const sessions = createSessionRegistry({ dataDir: sessionDataDir, log });
const session = sessions.create('group:1');
sessions.finish(session.id, 'done', { vendor: 'openai', model: 'gpt-test' });
eq(sessions.listSummaries()[0].vendor, 'openai', 'session summary includes vendor');

const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log });
config.load();
config.update({ server: { port: 0, token: 'core-route-secret' } });
const bus = new Bus(log);
let pluginStatusEvents = 0;
bus.on('status', () => { pluginStatusEvents++; });
bus.emit('status', { internal: true });
eq(pluginStatusEvents, 0, 'status remains non-subscribable to plugins');
const http = createHttpServer({ config, log, staticDir });
createSseBridge({ bus, http });
const store = { setMaxPerChat() {}, listChats: () => [], markAllRead: () => 0 };
const memory = { replaceMember() { throw new Error('non-numeric uid must be rejected first'); } };
const orchestrator = { pause() {}, resume() {}, stopProactiveLoop() {}, status: () => ({ paused: false, running: [], waiting: [] }) };
const loader = {
  listEntries: () => [{
    id: 'secret-plugin', name: 'Secret Plugin', version: '1.0.0', kind: 'bundled', status: 'active', enabled: true,
    settings: { apiKey: 'status-secret-must-not-leak', plain: 'visible-value' },
    configSchema: { apiKey: { secret: true }, plain: { type: 'string' } }, tools: [], requires: [],
  }],
  promptSections: () => [],
};
registerConsoleRoutes(http, { config, sessions, store, memory, orchestrator, loader, log, bus, dataDir });
const port = await http.listen();

async function request(method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: { 'x-console-token': 'core-route-secret', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

section('R01 status 插件 DTO 脱敏');
let response = await request('GET', '/api/status');
eq(response.status, 200, 'status returns 200');
eq(response.data.plugins[0].settings.apiKey, '******', 'status plugin secret is masked');
eq(response.data.plugins[0].settings.plain, 'visible-value', 'status plugin non-secret setting remains visible');

section('R73 非数字 uid 到达验证器');
response = await request('PUT', '/api/memory-files/group_1/members/abc', { impressions: [] });
eq(response.status, 400, 'non-numeric member uid returns 400');
eq(response.data.error, 'userId 必须是数字 QQ 号', 'non-numeric member uid exact error');

section('R89 日志使用当前等级过滤');
response = await request('POST', '/api/logs/level', { level: 'warn' });
eq(response.data.level, 'warn', 'log level changes to warn');
response = await request('GET', '/api/logs?limit=3');
eq(logCalls.at(-1), { n: 3, minLevel: 'warn' }, 'logs request uses current minLevel');
eq(response.data.logs, [{ level: 'warn', text: 'warning' }], 'logs response is filtered by current level');
eq(response.data.level, 'warn', 'logs response reports current level');

section('POST config 与 pause 经真实 Bus/SSE 发布 status');
const controller = new AbortController();
const sse = await fetch(`http://127.0.0.1:${port}/api/events?token=core-route-secret`, { signal: controller.signal });
eq(sse.status, 200, 'SSE connection opens');
const reader = sse.body.getReader();
const decoder = new TextDecoder();
let stream = '';
async function readUntil(needle, start = 0) {
  while (!stream.slice(start).includes(needle)) {
    const { done, value } = await reader.read();
    if (done) break;
    stream += decoder.decode(value);
  }
}
await readUntil('event: hello');
let start = stream.length;
response = await request('POST', '/api/config', { persona: { botName: 'Core route test' } });
eq(response.status, 200, 'config update succeeds');
await readUntil('event: status\ndata: {"configUpdated":true}', start);
ok(stream.slice(start).includes('event: status\ndata: {"configUpdated":true}'), 'config update publishes status SSE event');
start = stream.length;
response = await request('POST', '/api/pause', { paused: true });
eq(response.status, 200, 'pause succeeds');
await readUntil('event: status\ndata: {"paused":true,"pauseReason":null}', start);
ok(stream.slice(start).includes('event: status\ndata: {"paused":true,"pauseReason":null}'), 'pause publishes status SSE event');

controller.abort();
await reader.cancel().catch(() => {});
await http.close();
summary('36-m3-core-route-semantics');

import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { eq, ok, mktmp, section, summary } from './helpers.mjs';

const dataDir = mktmp('qqa-memory-media-');
const staticDir = mktmp('qqa-memory-media-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), 'ok');
const mediaDir = path.join(dataDir, 'media');
fs.mkdirSync(mediaDir);
const directFile = path.join(mediaDir, 'direct.png');
const onebotFile = path.join(mediaDir, 'onebot.png');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
fs.writeFileSync(directFile, png);
fs.writeFileSync(onebotFile, png);

const log = { error() {}, warn() {}, info() {}, level: 'info', recent: () => [], setLevel: () => 'info' };
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log });
config.load();
config.update({ server: { port: 0, token: 'secret' }, api: { model: 'm1' }, security: { allowPrivateImageHosts: true } });
const events = [];
const bus = { emit: (name, payload) => events.push([name, payload]) };
const memory = createMemoryStore({ dataDir, log });
memory.replaceMember('group:123', { userId: '1', name: '甲', impressions: ['甲一', '甲二'] });
const sessions = createSessionRegistry({ dataDir, log, bus });
const store = createChatStore({ dataDir, log });
const noops = { listEntries: () => [], promptSections: () => [], loadAll: async () => [], setEnabled: async () => [], status: () => ({}), pause() {}, resume() {}, stopProactiveLoop() {}, retrySession: () => ({ ok: true }), abortSession: () => ({ ok: true }), todayUsage: () => ({}) };
let releaseConsolidation;
const memoryConsolidator = async ({ members }) => {
  await new Promise((resolve) => { releaseConsolidation = resolve; });
  return { members: members.map((member) => ({ ...member, impressions: member.impressions.slice(0, 1) })) };
};
// transport 契约：图片解析走 actions.getImage（provider 内），不再直调 client.call
const transport = { actions: { async getImage(file) { if (file === 'onebot-file-id') return { file: onebotFile }; throw new Error('image unavailable'); } } };
const onebot = { client: { connected: true, async call() { throw new Error('不应直调 OneBot action'); } } };
const http = createHttpServer({ config, log, staticDir });
registerConsoleRoutes(http, {
  config, sessions, store, memory, loader: noops, orchestrator: noops, capability: { providers: () => [] }, registry: noops,
  transport, onebot, bus, log, dataDir, mediaRoots: [mediaDir], memoryConsolidator,
  fetchImpl: async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }),
  dnsLookup: async () => [{ address: '203.0.113.1', family: 4 }],
});
const port = await http.listen();
async function request(method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers: { 'x-console-token': 'secret' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

section('R76 capability-backed 异步整理与互斥');
let response = await request('POST', '/api/memory-files/consolidate', { chatKey: 'group:123' });
eq(response.status, 202, 'consolidation returns accepted');
eq(response.data.started, true, 'consolidation started');
response = await request('POST', '/api/memory-files/consolidate', { chatKey: 'group:123' });
eq(response.status, 409, 'consolidation is mutually exclusive');
releaseConsolidation();
await new Promise((resolve) => setTimeout(resolve, 0));
eq(memory.query('group:123', { userId: '1' })[0].impressions.length, 1, 'consolidation only reduces memory');
ok(events.some(([name, payload]) => name === 'memory.update' && payload.phase === 'consolidate-start'), 'start event emitted');
ok(events.some(([name, payload]) => name === 'memory.update' && payload.phase === 'consolidate-done'), 'done event emitted');

section('R76 capability missing is explained, not a fake success');
const unavailableHttp = createHttpServer({ config, log, staticDir });
registerConsoleRoutes(unavailableHttp, { config, sessions, store, memory, loader: noops, orchestrator: noops, capability: { providers: () => [] }, registry: noops, transport, onebot, bus, log, dataDir });
const unavailablePort = await unavailableHttp.listen();
const unavailable = await fetch(`http://127.0.0.1:${unavailablePort}/api/memory-files/consolidate`, { method: 'POST', headers: { 'x-console-token': 'secret', 'content-type': 'application/json' }, body: JSON.stringify({ chatKey: 'group:123' }) });
eq(unavailable.status, 503, 'missing capability status');
eq((await unavailable.json()).code, 'CAPABILITY_MISSING', 'missing capability code');
await unavailableHttp.close();

section('R78 file → OneBot → url safety chain keeps positional results');
response = await request('POST', '/api/media-data', { items: [
  { file: directFile },
  { file: 'onebot-file-id' },
  { url: 'http://127.0.0.1/image.png' },
  { file: path.join(dataDir, 'outside.png') },
] });
eq(response.status, 200, 'media status');
eq(response.data.results.length, 4, 'media result count');
ok(response.data.results.slice(0, 3).every((value) => value?.startsWith('data:image/png;base64,')), 'each fallback produces data URL');
eq(response.data.results[3], null, 'unsafe or missing item is isolated');

await http.close();
summary('35-m3-memory-media-routes');

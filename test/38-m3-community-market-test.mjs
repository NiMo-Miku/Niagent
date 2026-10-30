import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createChatStore } from '../src/kernel/store.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { COMMUNITY_BASE_URL } from '../src/console/community-market-adapters.js';
import { eq, ok, mktmp, section, summary } from './helpers.mjs';

function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function zip(files, { deflate = false, declaredSize = null, localDeclaredSize = null, centralDeclaredSize = null } = {}) {
  const local = [], central = []; let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const n = Buffer.from(name); const raw = Buffer.from(value); const d = deflate ? zlib.deflateRawSync(raw) : raw; const crc = crc32(raw); const size = declaredSize ?? raw.length; const localSize = localDeclaredSize ?? size; const centralSize = centralDeclaredSize ?? size; const method = deflate ? 8 : 0; const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(method, 8); h.writeUInt32LE(crc, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(localSize, 22); h.writeUInt16LE(n.length, 26);
    local.push(h, n, d); const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(method, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(centralSize, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42); central.push(c, n); offset += h.length + n.length + d.length;
  }
  const cd = Buffer.concat(central); const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50); e.writeUInt16LE(Object.keys(files).length, 8); e.writeUInt16LE(Object.keys(files).length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16); return Buffer.concat([...local, cd, e]);
}

const dataDir = mktmp('qqa-m3-community-'); const appRoot = mktmp('qqa-m3-market-root-');
fs.mkdirSync(path.join(appRoot, 'skills', 'demo'), { recursive: true }); fs.writeFileSync(path.join(appRoot, 'skills', 'demo', 'skill.json'), '{"id":"demo"}');
const staticDir = mktmp('qqa-m3-community-static-'); fs.writeFileSync(path.join(staticDir, 'index.html'), 'ok');
const log = { error() {}, warn() {}, info() {}, level: 'info', recent: () => [], setLevel: () => 'info' };
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log }); config.load(); config.update({ server: { port: 0, token: 'community-secret' }, globalBlocklist: ['12345'], communityExemptions: [] });
const calls = []; let zipPayload = zip({ 'pkg/plugin.json': '{"id":"market-demo","kind":"plugin","entry":"index.js"}', 'pkg/index.js': 'export default {}' });
const fetchImpl = async (url, init = {}) => {
  calls.push({ url, init });
  if (url === `${COMMUNITY_BASE_URL}/blocklist/add`) return new Response(JSON.stringify({ ok: true, ids: ['12345', '67890', '99999'] }), { status: 200 });
  if (url === `${COMMUNITY_BASE_URL}/blocklist`) return new Response(JSON.stringify({ ok: true, ids: ['67890'] }), { status: 200 });
  if (url === `${COMMUNITY_BASE_URL}/auth/login`) return new Response(JSON.stringify({ ok: true, account: { username: 'alice', displayName: 'Alice', token: 'not-returned' }, token: 'secret-account-token' }), { status: 200 });
  if (url === `${COMMUNITY_BASE_URL}/auth/logout`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
  if (url === `${COMMUNITY_BASE_URL}/plugins`) return new Response(JSON.stringify({ok:true,items:[{id:'market-demo',type:'plugin',status:'approved',installCode:'ABC123'}]}));
  if (url === `${COMMUNITY_BASE_URL}/install/verify`) return new Response(JSON.stringify({ ok: true, results: [{ code: 'ABC123', ok: true, id: 'market-demo', type: 'plugin', author: 'QQ Agent', token: 'should-not-leak' }] }), { status: 200 });
  if (url === `${COMMUNITY_BASE_URL}/install/ABC123/download`) return new Response(zipPayload, { status: 200, headers: { 'content-type': 'application/zip' } });
  throw new Error(`unexpected ${url}`);
};
const busEvents = []; const bus = { emit(name, payload) { busEvents.push({ name, payload }); } };
const sessions = createSessionRegistry({ dataDir, log, bus }); const store = createChatStore({ dataDir, log });
const loader = { listEntries: () => [], loadDir: async (kind, dir) => { busEvents.push({ name: 'install-load', payload: { kind, dir, enabled: config.get().skills[path.basename(dir)]?.enabled } }); }, promptSections: () => [] };
const http = createHttpServer({ config, log, staticDir }); registerConsoleRoutes(http, { config, sessions, store, loader, log, dataDir, appRoot, bus, fetchImpl, dnsLookup: async () => [{ address: '203.0.113.8', family: 4 }] });
const port = await http.listen();
async function req(method, pathname, body) { const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers: { 'x-console-token': 'community-secret', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; } return { status: response.status, data }; }

section('R45 本地云端名单并集、豁免与脱敏');
fs.writeFileSync(path.join(dataDir, 'cloud-global-blocklist.json'), JSON.stringify({ ids: ['67890', 'bad', '12345'] }));
let response = await req('GET', '/api/community/blocklist'); eq(response.status, 200, 'blocklist GET'); eq(response.data.ids, ['12345', '67890'], 'union ids');

section('R46 追加/删除原子缓存、固定地址与 SSE');
response = await req('POST', '/api/community/blocklist', { ids: ['99999'], mode: 'add' }); eq(response.status, 200, 'blocklist add'); ok(calls.at(-1).url.startsWith(COMMUNITY_BASE_URL), 'fixed community URL'); ok(!JSON.stringify(calls.at(-1).init).includes('community-secret'), 'console key not sent upstream');
response = await req('POST', '/api/community/blocklist', { ids: ['12345'], mode: 'remove' }); eq(response.status, 200, 'blocklist remove'); ok(calls.at(-1).init.headers['x-community-key'] === undefined, 'no community key absent'); ok(busEvents.some((e) => e.name === 'status' && e.payload.communityBlocklistUpdated), 'blocklist status event');

section('R47-R49 market account DTOs and credential boundaries');
response = await req('POST', '/api/market/login', { loginId: 'alice', password: 'secret' }); eq(response.status, 200, 'login status'); ok(!JSON.stringify(response.data).includes('secret-account-token'), 'account token absent response'); ok(fs.readFileSync(path.join(dataDir, 'account.json'), 'utf8').includes('secret-account-token'), 'token only local account file');
response = await req('GET', '/api/market/accounts'); eq(response.status, 200, 'accounts status'); ok(!JSON.stringify(response.data).includes('secret-account-token'), 'accounts token absent');
response = await req('POST', '/api/market/logout', { username: 'alice' }); eq(response.status, 200, 'logout status');

section('R51 direct code verification is removed');
response = await req('POST', '/api/market/verify', { code:'ABC123' }); eq(response.status, 404, 'verify route removed');

section('R52 install uses verified server type, safe extraction, atomic rename and disabled load');
response = await req('POST', '/api/market/install', { id: 'market-demo', kind:'plugin' }); eq(response.status, 200, 'install status'); eq(response.data.kind, 'plugin', 'server type wins'); ok(fs.existsSync(path.join(appRoot, 'plugins', 'market-demo', 'plugin.json')), 'installed plugin'); ok(busEvents.some((e) => e.name === 'install-load' && e.payload.enabled === false), 'market package disabled before loader sees it');
zipPayload = zip({ '../escape.js': 'bad' }); response = await req('POST', '/api/market/install', { id: 'market-demo', kind:'plugin' }); eq(response.status, 502, 'path traversal rejected'); ok(!fs.existsSync(path.join(appRoot, 'escape.js')), 'traversal did not write outside');
zipPayload = zip({ 'pkg/run.exe': 'bad' }); response = await req('POST', '/api/market/install', { id: 'market-demo', kind:'plugin' }); eq(response.status, 502, 'executable rejected');
zipPayload = zip({ 'pkg/bomb.txt': 'A'.repeat(1024 * 1024) }, { deflate: true, declaredSize: 33 * 1024 * 1024 }); response = await req('POST', '/api/market/install', { id: 'market-demo', kind:'plugin' }); eq(response.status, 502, 'declared unpacked size rejected before inflate');
zipPayload = zip({ 'pkg/mismatch.txt': 'correct-size' }, { localDeclaredSize: 100 }); response = await req('POST', '/api/market/install', { id: 'market-demo', kind:'plugin' }); eq(response.status, 502, 'local and central size mismatch rejected');
zipPayload = zip({ 'pkg/plugin.json': '{"id":"compressed","kind":"plugin","entry":"index.js"}', 'pkg/index.js': 'export default {}', 'pkg/compressed.txt': 'A'.repeat(1024 * 1024) }, { deflate: true }); response = await req('POST', '/api/market/install', { id: 'market-demo', kind:'plugin' }); eq(response.status, 200, 'bounded compressed entry accepted');
await http.close(); summary('38-m3-community-market');

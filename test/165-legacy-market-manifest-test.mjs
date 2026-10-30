// Real kernel -> HTTP -> shared ZIP installer -> real disabled loader.
// All roots and data are temporary; upstream DNS/fetch are controlled peers.
// No bundled or installed extension entry is enabled or executed by this test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createKernel } from '../src/kernel/kernel.js';
import { createCommunityMarketAdapters, COMMUNITY_BASE_URL } from '../bundled/market/client.js';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const locals = [], central = []; let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const filename = Buffer.from(name), data = Buffer.from(value), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, filename); offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22), count = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-legacy165-'));
const dataDir = path.join(root, 'fixture-data'), token = 'synthetic-console165';
for (const dir of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(root, dir));
const canaryFile = path.join(root, 'ENTRY_CODE_MUST_NOT_EXECUTE');
const canaryKey = '__qqa165ManifestEntryExecuted';
const canary = `import fs from 'node:fs';\nglobalThis.${canaryKey}=(globalThis.${canaryKey}||0)+1;\nfs.writeFileSync(${JSON.stringify(canaryFile)},'executed');\nthrow new Error('QA165_EXTENSION_ENTRY_EXECUTED');\nexport default {};\n`;
const calls = [], dnsCalls = [], offers = new Map();
let blockedOutbound = 0, installerCalls = 0, base;
const kernel = createKernel({
  appRoot: root, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(root, 'absent-migration-source') }, headless: true,
  transport: { id: 'inert165', start() {}, stop() {}, status: () => ({ connected: false }), actions: {} },
  priceUpdates: { refresh: async () => ({ ok: true }) },
  fetchImpl: async () => { blockedOutbound++; throw new Error('QA165 outbound network is disabled'); },
});
kernel.log.setLevel('error');
kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false }, proactive: { enabled: false } });
// Rescans below are explicit HTTP operations, never filesystem timing races.
kernel.loader.startWatchers = () => {};
const upstreamFetch = async (url, init = {}) => {
  assert.equal(new URL(url).origin, new URL(COMMUNITY_BASE_URL).origin, 'only the fixed public market peer is reachable');
  assert.equal(new Headers(init.headers).has('x-account-token'), false, 'public installation sends no account token');
  assert.equal(new Headers(init.headers).has('x-console-token'), false, 'console authorization never reaches the peer');
  calls.push({ url, method: init.method, body: init.body });
  if (url === `${COMMUNITY_BASE_URL}/install/verify`) {
    const codes = JSON.parse(init.body).codes;
    return new Response(JSON.stringify({ ok: true, results: codes.map(code => {
      const offer = offers.get(code); assert.ok(offer, `controlled code ${code}`);
      return { code, ok: true, type: offer.type, id: offer.catalogId, name: 'Renamed public listing' };
    }) }), { headers: { 'content-type': 'application/json' } });
  }
  for (const [code, offer] of offers) if (url === `${COMMUNITY_BASE_URL}/install/${code}/download`) return new Response(offer.bytes, { headers: { 'content-type': 'application/zip' } });
  for (const kind of ['skill', 'plugin']) if (url === `${COMMUNITY_BASE_URL}/${kind}s`) return new Response(JSON.stringify({ ok: true, categories: { utility: '工具' }, items: [...offers.entries()].filter(([, offer]) => offer.type === kind && offer.public).map(([code, offer]) => ({ id: offer.catalogId, name: 'Renamed public listing', type: kind, status: 'approved', installCode: code, category: 'utility' })) }), { headers: { 'content-type': 'application/json' } });
  throw new Error(`QA165 unexpected controlled peer path ${url}`);
};
const market = createCommunityMarketAdapters({
  appRoot: root, dataDir, config: kernel.config, communityKey: '', fetchImpl: upstreamFetch,
  dnsLookup: async hostname => { dnsCalls.push(hostname); return [{ address: '203.0.113.8', family: 4 }]; },
  installZip: (...args) => {
    installerCalls++;
    const installer = kernel.capability.providers('extensions.installZip').find(item => item.ownerId === 'kernel')?.provider;
    assert.equal(typeof installer?.install, 'function');
    return installer.install(...args);
  },
});
// A host-owned controlled client avoids loading even a bundled extension entry.
kernel.capability.register('market.client', 'kernel', market);

const successful = [];
function rawManifest(id, extra = {}) {
  return { id, name: `Legacy ${id}`, apiVersion: 1, enabledByDefault: true,
    description: 'Synthetic legacy package; entry intentionally omitted',
    'x-unknown-market-data': { tags: ['保留', 'unknown'], nested: { enabled: true, value: 17 } },
    prompt: { sections: [{ id: 'legacy165', content: 'Synthetic metadata only', priority: 140, 'x-section-extra': { preserve: true } }] }, ...extra };
}
function packageFiles(raw, kind, { bom = false, prefix = '' } = {}) {
  return { [`${prefix}${kind}.json`]: `${bom ? '\uFEFF' : ''}${JSON.stringify(raw, null, 2)}`, [`${prefix}index.js`]: canary, [`${prefix}package.json`]: '{"type":"module"}', [`${prefix}assets/note.txt`]: 'nested asset retained' };
}
async function req(method, route, body) {
  const response = await fetch(base + route, { method, headers: { 'x-console-token': token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
const install = (files, options = {}) => req('POST', '/api/skills/install', { zipBase64: zip(files).toString('base64'), ...options });
function noExecution() { assert.equal(globalThis[canaryKey], undefined, 'extension top level never executes'); assert.equal(fs.existsSync(canaryFile), false, 'filesystem canary never executes'); }
function extensionTree() {
  const out = [];
  function walk(relative) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const next = path.join(relative, entry.name);
      if (entry.isDirectory()) { out.push([next, 'directory']); walk(next); }
      else out.push([next, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, next))).digest('hex')]);
    }
  }
  for (const domain of ['bundled', 'plugins', 'skills', '.extension-management-v1']) walk(domain);
  return out;
}
function beforeReject() { return { config: fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'), skills: structuredClone(kernel.config.get().skills), tree: extensionTree(), entries: kernel.loader.listEntries().map(({ id, kind, status }) => ({ id, kind, status })) }; }
async function rejected(name, action, status, message) {
  const before = beforeReject(), response = await action();
  assert.equal(response.status, status, `${name}: ${JSON.stringify(response.data)}`);
  if (message) assert.match(response.data.error ?? '', message, name);
  assert.equal(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'), before.config, `${name}: persistent configuration unchanged`);
  assert.deepEqual(kernel.config.get().skills, before.skills, `${name}: no disabled-config residue`);
  assert.deepEqual(extensionTree(), before.tree, `${name}: no target or staging residue`);
  assert.deepEqual(kernel.loader.listEntries().map(({ id, kind, status: state }) => ({ id, kind, status: state })), before.entries, `${name}: loader unchanged`);
  noExecution();
}
function installed(response, raw, kind, fileKind = kind) {
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(response.data.installed, raw.id); assert.equal(response.data.root, `${kind}s`); assert.equal(response.data.enabled, false);
  assert.equal(response.data.skill.kind, kind); assert.equal(response.data.skill.status, 'disabled'); assert.equal(response.data.skill.enabled, false);
  assert.equal(response.data.skill.code, 'disabled'); assert.ok(response.data.skill.fingerprint);
  const directory = path.join(root, `${kind}s`, raw.id), file = path.join(directory, `${fileKind}.json`);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')), { ...raw, kind }, 'persist the original raw manifest plus inferred kind, including nested unknown fields');
  assert.equal(fs.readFileSync(path.join(directory, 'index.js'), 'utf8'), canary);
  assert.equal(fs.readFileSync(path.join(directory, 'assets', 'note.txt'), 'utf8'), 'nested asset retained');
  assert.equal(fs.existsSync(path.join(root, kind === 'skill' ? 'plugins' : 'skills', raw.id)), false);
  assert.equal(kernel.config.get().skills[raw.id].enabled, false);
  const entry = kernel.loader.listEntries().find(item => item.id === raw.id);
  assert.equal(entry.kind, kind); assert.equal(entry.status, 'disabled'); assert.equal(entry.enabled, false);
  successful.push({ id: raw.id, kind, file, expected: { ...raw, kind } }); noExecution();
}

try {
  base = `http://127.0.0.1:${await kernel.start()}`;
  assert.deepEqual(kernel.loader.listEntries(), [], 'the temporary app root starts with no extension code');
  console.log('· Root skill/plugin manifests without kind, BOM, default index.js and lossless raw persistence');
  for (const kind of ['skill', 'plugin']) for (const bom of [false, true]) {
    const raw = rawManifest(`legacy-root-${kind}${bom ? '-bom' : ''}165`);
    // One install omits the requested kind too: classification must come from
    // the unique filename, rather than a selected page or generic loader default.
    const response = await install(packageFiles(raw, kind, { bom }), kind === 'plugin' && !bom ? {} : { kind });
    installed(response, raw, kind);
  }
  console.log('· All common wrapper directories are stripped, including waifu_draw/waifu_draw');
  const wrapped = rawManifest('waifu_draw165');
  installed(await install(packageFiles(wrapped, 'skill', { prefix: 'waifu_draw/waifu_draw/', bom: true }), { kind: 'skill' }), wrapped, 'skill');

  console.log('· Invalid explicit kinds and all preexisting identity, manifest and path checks still reject atomically');
  for (const [label, value] of [['null', null], ['empty', ''], ['unknown', 'extension'], ['number', 0]]) {
    const raw = rawManifest(`invalid-kind-${label}165`, { kind: value });
    await rejected(`explicit kind ${label}`, () => install(packageFiles(raw, 'plugin'), { kind: 'plugin' }), 400, /kind/);
  }
  await rejected('inferred filename vs requested kind', () => install(packageFiles(rawManifest('inferred-conflict165'), 'plugin'), { kind: 'skill' }), 400, /kind|类型/);
  await rejected('explicit kind vs requested kind', () => install(packageFiles(rawManifest('explicit-conflict165', { kind: 'plugin' }), 'plugin'), { kind: 'skill' }), 400, /kind|类型/);
  const dual = { ...packageFiles(rawManifest('dual165'), 'skill'), 'plugin.json': JSON.stringify(rawManifest('dual-plugin165')) };
  await rejected('two root manifests', () => install(dual), 400, /清单|skill\.json|plugin\.json/);
  await rejected('no manifest', () => install({ 'index.js': canary }), 400, /清单|skill\.json|plugin\.json/);
  await rejected('apiVersion 2', () => install(packageFiles(rawManifest('api-two165', { apiVersion: 2 }), 'skill')), 400, /apiVersion/);
  await rejected('entry outside root', () => install(packageFiles(rawManifest('entry-out165', { entry: '../outside165.js' }), 'skill')), 400, /entry|越界/);
  await rejected('zip path traversal', () => install({ ...packageFiles(rawManifest('zip-out165'), 'skill'), '../outside165.js': canary }), 400, /路径|越界|ZIP/);
  await rejected('duplicate identity across roots', () => install(packageFiles(rawManifest('legacy-root-skill165'), 'plugin'), { kind: 'plugin' }), 409, /存在|身份/);
  await rejected('case-insensitive duplicate identity', () => install(packageFiles(rawManifest('LEGACY-ROOT-SKILL165'), 'plugin'), { kind: 'plugin' }), 409, /存在|身份/);
  const independent = { ...packageFiles(rawManifest('independent-left165'), 'skill', { prefix: 'export/left/' }), ...packageFiles(rawManifest('independent-right165'), 'plugin', { prefix: 'export/right/' }) };
  await rejected('two independent extension directories', () => install(independent), 400, /清单|skill\.json|plugin\.json/);

  console.log('· Controlled public verify/download uses the real shared installer and package identity');
  for (const kind of ['skill', 'plugin']) {
    const raw = rawManifest(`actual-market-${kind}165`), code = kind === 'skill' ? 'SKILL165' : 'PLUGIN165';
    const offer = { type: kind, catalogId: `renamed-catalog-${kind}165`, bytes: zip(packageFiles(raw, kind, { bom: kind === 'plugin', prefix: `public-${kind}/public-${kind}/` })), public: true };
    offers.set(code, offer);
    const catalog = await req('GET', `/api/market/catalog?kind=${kind}`);
    assert.equal(catalog.status, 200); assert.equal(catalog.data.items[0].id, offer.catalogId); assert.notEqual(offer.catalogId, raw.id);
    assert.equal((await req('POST', '/api/market/verify', { code })).status, 404);
    const beforeCalls = installerCalls;
    const response = await req('POST', '/api/market/install', { kind, id: offer.catalogId });
    installed(response, raw, kind); assert.equal(response.data.id, raw.id); assert.equal(response.data.kind, kind);
    assert.equal(response.data.dir, path.join(root, `${kind}s`, raw.id)); assert.equal(installerCalls, beforeCalls + 1, 'public download reaches the actual shared kernel installer');
    assert.equal(fs.existsSync(path.join(root, `${kind}s`, offer.catalogId)), false, 'catalog DTO identity never chooses an installation directory');
  }
  offers.set('CONFLICT165', { type: 'skill', catalogId: 'wrong-type-catalog165', public: true, bytes: zip(packageFiles(rawManifest('market-kind-conflict165', { kind: 'plugin' }), 'plugin')) });
  await rejected('package explicit kind vs verified market type', () => req('POST', '/api/market/install', { id: 'wrong-type-catalog165', kind: 'skill' }), 502, /kind|类型/);
  offers.set('INFER165', { type: 'skill', catalogId: 'wrong-inferred-catalog165', public: true, bytes: zip(packageFiles(rawManifest('market-inferred-conflict165'), 'plugin')) });
  await rejected('package inferred kind vs verified market type', () => req('POST', '/api/market/install', { id: 'wrong-inferred-catalog165', kind: 'skill' }), 502, /kind|类型/);
  offers.set('TYPE165', { type: 'plugin', catalogId: 'wrong-selected-catalog165', public: true, bytes: zip(packageFiles(rawManifest('market-selected-conflict165'), 'plugin')) });
  const beforeDownloads = calls.filter(call => call.url.endsWith('/download')).length;
  await rejected('requested market vs verified market type', () => req('POST', '/api/market/install', { id: 'wrong-selected-catalog165', kind: 'skill' }), 409, /类型|市场|下架/);
  assert.equal(calls.filter(call => call.url.endsWith('/download')).length, beforeDownloads, 'verified kind conflict rejects before downloading');

  console.log('· HTTP rescans preserve inferred loader kind, disabled configuration and untouched canaries');
  for (let scan = 0; scan < 2; scan++) {
    const response = await req('POST', '/api/skills/reload', {}); assert.equal(response.status, 200); assert.deepEqual(response.data.loaded, []); assert.deepEqual(response.data.failed, []);
    const listing = await req('GET', '/api/skills'); assert.equal(listing.status, 200); assert.equal(listing.data.skills.length, successful.length);
    for (const item of successful) {
      const entry = listing.data.skills.find(entry => entry.id === item.id);
      assert.ok(entry); assert.equal(entry.kind, item.kind); assert.equal(entry.status, 'disabled'); assert.equal(entry.enabled, false);
      assert.equal(kernel.loader.hostEntry(item.id).manifest.kind, item.kind);
      assert.deepEqual(JSON.parse(fs.readFileSync(item.file, 'utf8').replace(/^\uFEFF/, '')), item.expected, 'rescan never rewrites the persisted raw manifest');
    }
    noExecution();
  }
  assert.equal(blockedOutbound, 0, 'no real outbound fetch was attempted');
  assert.ok(dnsCalls.length > 0 && dnsCalls.every(hostname => hostname === 'www.kondius.cn'), 'all public requests use a controlled DNS peer');
  assert.ok(calls.some(call => call.url.endsWith('/install/verify')) && calls.some(call => call.url.endsWith('/download')));
  assert.equal(kernel.loader.listEntries().some(entry => entry.status === 'active'), false);
  console.log(JSON.stringify({ test: '165-legacy-market-manifest', result: 'passed', installedDisabled: successful.length, realKernel: true, realZipInstaller: true, extensionEntriesExecuted: 0, outboundRequests: 0, controlledPublicCalls: calls.length }));
} finally {
  await kernel.stop();
  noExecution(); delete globalThis[canaryKey];
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()), 'cleanup stays inside the generated temporary root');
  fs.rmSync(root, { recursive: true, force: true });
}

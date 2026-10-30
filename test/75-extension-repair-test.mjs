// 回归：执行真实模块和生产接线；HTTP 只访问测试创建的本地服务。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import { gzipSync } from 'node:zlib';
import { createPermissions } from '../src/kernel/permissions.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { OneBotClient } from '../src/transports/onebot/client.js';
import { safeFetch, isPrivateAddress, downloadImageAsDataUrl } from '../src/kernel/safe-fetch.js';
import { segmentsToText } from '../src/kernel/transport.js';
import { createPluginLoader } from '../src/kernel/plugin-loader.js';
import { createScheduler } from '../src/kernel/scheduler.js';
import { createStorage } from '../src/kernel/storage.js';
import { Bus } from '../src/kernel/bus.js';
import { createKernel } from '../src/kernel/kernel.js';
import queryTools from '../bundled/query-tools/index.js';
import mediaTools from '../bundled/media-tools/index.js';
import stickerTools from '../bundled/sticker-tools/index.js';
import { fixtureCapability } from './bundled-fixture-sdk.mjs';

const log = { info() {}, warn() {}, error() {}, debug() {}, child() { return this; } };
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-extension-repair-'));
const servers = [];
let loader, scheduler, kernel;
const blockedNetwork = [], ownedOrigins = new Set(), ownedPorts = new Set(), dnsOriginals = [], requestOriginals = [];
const nativeFetch = globalThis.fetch;
let loopbackLookups = 0, pinnedRequests = 0, kernelEntries = null, voiceEntries = null;
globalThis.fetch = (input, init = {}) => {
  const url = new URL(input?.url ?? input);
  if (!ownedOrigins.has(url.origin)) { blockedNetwork.push({ kind: 'fetch', url: url.href }); return Promise.reject(new Error('75 forbids unowned HTTP')); }
  return nativeFetch(input, { ...init, redirect: 'error' });
};
for (const target of [dns, dnsPromises]) for (const key of Object.keys(target).filter(key => /^(lookup|resolve|reverse)/.test(key) && typeof target[key] === 'function')) {
  dnsOriginals.push([target, key, target[key]]);
  target[key] = (hostname, ...args) => {
    if (key === 'lookup' && ['127.0.0.1', '::1'].includes(hostname)) {
      loopbackLookups++;
      const address = { address: hostname, family: hostname === '::1' ? 6 : 4 }, options = args.find(value => value && typeof value === 'object');
      if (target === dnsPromises) return Promise.resolve(options?.all ? [address] : address);
      queueMicrotask(() => args.at(-1)(null, ...(options?.all ? [[address]] : [address.address, address.family]))); return;
    }
    blockedNetwork.push({ kind: 'dns', method: key }); throw new Error('75 forbids DNS');
  };
}
// safeFetch's native pinned transport bypasses global fetch. Gate that real
// boundary too, while retaining the original Host/redirect/fallback assertions.
for (const target of [http, https]) for (const key of ['request', 'get']) {
  const original = target[key]; requestOriginals.push([target, key, original]);
  target[key] = (input, ...args) => {
    const url = input instanceof URL || typeof input === 'string' ? new URL(input) : null;
    if (!url || url.protocol !== 'http:' || !ownedPorts.has(Number(url.port)) || !['127.0.0.1', 'pinned.invalid', 'sink.invalid'].includes(url.hostname)) {
      blockedNetwork.push({ kind: 'native-http', url: url?.href ?? '<unsupported options>' }); throw new Error('75 forbids unowned native HTTP');
    }
    if (url.hostname !== '127.0.0.1') {
      const options = args[0];
      if (typeof options?.lookup !== 'function') { blockedNetwork.push({ kind: 'unpinned-host' }); throw new Error('75 fixture aliases require pinned lookup'); }
      pinnedRequests++;
      args[0] = { ...options, lookup(hostname, lookupOptions, callback) {
        return options.lookup(hostname, lookupOptions, (error, addresses, family) => {
          if (error) return callback(error);
          const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family }];
          if (list.some(item => !['127.0.0.1', '127.0.0.2'].includes(item.address))) {
            blockedNetwork.push({ kind: 'nonlocal-pinned-address' }); return callback(new Error('75 pinned address must remain local'));
          }
          callback(null, addresses, family);
        });
      } };
    }
    return original.call(target, input, ...args);
  };
}
syncBuiltinESMExports();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, message) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { assert.ok(Date.now() < deadline, message); await pause(10); }
}
async function serve(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  ownedPorts.add(port); ownedOrigins.add(`http://127.0.0.1:${port}`);
  server.once('close', () => { ownedPorts.delete(port); ownedOrigins.delete(`http://127.0.0.1:${port}`); });
  return port;
}
async function bodyOf(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

try {
  console.log('· 真实 registry / permissions：recent 查询可执行，其它授权边界保留');
  const permissions = createPermissions({ log, headless: true });
  const registry = createToolRegistry({ log, permissions });
  queryTools.setup({
    capability: fixtureCapability({ store: { recent: () => [{ id: 1, mid: 42, senderId: '7', senderName: 'fixture', text: 'history' }] } }),
    registerTool: (def) => registry.register({ ...def, ownerId: 'query-tools', bundled: true }),
  });
  const recent = await registry.invoke('get_recent_messages', {}, { execCtx: { chatKey: 'group:1' } });
  assert.equal(recent.ok, true);
  assert.equal(recent.result.ok, true);
  assert.equal(recent.result.result.messages[0].text, 'history');
  assert.equal(permissions.check('other-bundled', 'data.sessions.read', { kind: 'bundled' }).decision, 'deny');
  assert.equal(permissions.check('query-tools', 'data.memory.read', { kind: 'bundled' }).decision, 'deny');
  assert.equal(permissions.check('query-tools', 'net.raw', { kind: 'bundled' }).decision, 'deny');
  assert.equal(permissions.check('user-plugin', 'data.sessions.read').decision, 'deny');
  permissions.close();

  console.log('· 真实 OneBotClient.close：清 socket / reconnect / self probe 资源');
  const client = new OneBotClient({ log });
  let closed = 0, terminated = 0, probed = 0;
  client.ws = { close: () => closed++, terminate: () => terminated++ };
  client.connected = true;
  client.call = async () => { probed++; return { data: { user_id: 1 } }; };
  client._selfInfoProbe(client._gen);
  client._reconnectTimer = setTimeout(() => { throw new Error('关闭后不应重连'); }, 50);
  await client.close();
  await pause(60);
  assert.equal(closed, 1); assert.equal(terminated, 1);
  assert.equal(client.ws, null); assert.equal(client.connected, false);
  assert.equal(client._reconnectTimer, null); assert.equal(client._probeTimers.size, 0);
  assert.equal(probed, 0);
  await client.close();
  assert.equal(closed, 1, '重复关闭保持幂等');

  console.log('· 异步 claim：null / skip / reject 都继续协商，旧同步 API 保留');
  const caps = createCapabilityRegistry({ log });
  const calls = [];
  caps.register('media.download', 'null', async () => { calls.push('null'); return null; });
  caps.register('media.download', 'skip', async () => { calls.push('skip'); return { status: 'skip' }; });
  caps.register('media.download', 'broken', async () => { calls.push('broken'); throw new Error('fixture failure'); });
  caps.register('media.download', 'winner', async () => { calls.push('winner'); return { segments: [{ type: 'text', text: 'downloaded' }] }; });
  const claim = await caps.claimAsync('media.download', {});
  assert.equal(claim.ownerId, 'winner');
  assert.deepEqual(calls, ['null', 'skip', 'broken', 'winner']);
  assert.equal(claim.result.segments[0].text, 'downloaded');
  assert.equal(await caps.claimAsync('absent'), null);
  caps.register('sync', 'sync', () => 'immediate');
  assert.deepEqual(caps.claim('sync'), { ownerId: 'sync', result: 'immediate' });

  console.log('· 异步 claim 生命周期：停用、注销及重注册都丢弃旧实例结果');
  for (const change of ['inactive', 'unregister', 'replace', 'reregister']) {
    let active = true, finish;
    const lifecycleCaps = createCapabilityRegistry({ log, isOwnerActive: (owner) => owner !== 'slow' || active });
    const slow = () => new Promise((resolve) => { finish = resolve; });
    lifecycleCaps.register('media.download', 'slow', slow);
    lifecycleCaps.register('media.download', 'fallback', () => 'current fallback');
    const pending = lifecycleCaps.claimAsync('media.download');
    if (change === 'inactive') active = false;
    else if (change === 'unregister') lifecycleCaps.unregisterOwner('slow');
    else if (change === 'replace') lifecycleCaps.register('media.download', 'slow', () => 'new instance');
    else lifecycleCaps.register('media.download', 'slow', slow);
    finish('stale instance');
    assert.deepEqual(await pending, { ownerId: 'fallback', result: 'current fallback' }, change);
  }
  const changedCaps = createCapabilityRegistry({ log });
  let finishFirst, oldNextCalls = 0;
  changedCaps.register('media.download', 'first', () => new Promise((resolve) => { finishFirst = resolve; }));
  changedCaps.register('media.download', 'next', () => { oldNextCalls++; return 'old next'; });
  const changedPending = changedCaps.claimAsync('media.download');
  changedCaps.register('media.download', 'next', () => 'new next');
  finishFirst(null);
  assert.equal(await changedPending, null);
  assert.equal(oldNextCalls, 0, '前一个等待期间替换的 provider 不可再调用');
  changedCaps.unregister('media.download', 'first');
  assert.deepEqual(await changedCaps.claimAsync('media.download'), { ownerId: 'next', result: 'new next' });
  let finishAborted, fallbackCalls = 0;
  const abortCaps = createCapabilityRegistry({ log }), claimController = new AbortController();
  abortCaps.register('media.download', 'slow', ({ signal }) => { assert.equal(signal, claimController.signal); return new Promise((resolve) => { finishAborted = resolve; }); });
  abortCaps.register('media.download', 'fallback', () => { fallbackCalls++; return 'late fallback'; });
  const abortedClaim = abortCaps.claimAsync('media.download', { signal: claimController.signal });
  claimController.abort(); finishAborted(null);
  assert.equal(await abortedClaim, null); assert.equal(fallbackCalls, 0);

  console.log('· safeFetch 原生连接固定 DNS 地址，拒绝 IPv6 内网及混合 DNS');
  for (const ip of ['::1', '0:0:0:0:0:0:0:1', '::ffff:7f00:1', '::ffff:c0a8:1', 'fe90::1', 'febf::1', 'fec0::1', 'ff02::1', '64:ff9b::7f00:1', '2002:7f00:1::']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['2606:4700:4700::1111', '::ffff:808:808', '2002:808:808::']) assert.equal(isPrivateAddress(ip), false, ip);
  let observedHost;
  const nativePort = await serve((req, res) => {
    observedHost = req.headers.host;
    if (req.url === '/gzip') { res.writeHead(200, { 'content-encoding': 'gzip' }); res.end(gzipSync('compressed fixture')); }
    else if (req.url === '/large') res.end('x'.repeat(10000));
    else if (req.url === '/304') { res.writeHead(304); res.end(); }
    else if (req.url === '/stall') { res.writeHead(200); res.write('start'); }
    else if (req.url === '/bad-gzip') { res.writeHead(200, { 'content-encoding': 'gzip' }); res.end('not gzip'); }
    else res.end('pinned fixture');
  });
  let lookups = 0;
  const dnsLookup = async (hostname) => {
    assert.ok(['pinned.invalid', 'sink.invalid'].includes(hostname));
    lookups++;
    return [{ address: '127.0.0.1', family: 4 }];
  };
  const localOptions = { allowPrivate: true, dnsLookup };
  const pinned = await safeFetch(`http://pinned.invalid:${nativePort}/`, localOptions);
  assert.equal(pinned.body, 'pinned fixture');
  assert.equal(observedHost, `pinned.invalid:${nativePort}`, '固定 IP 后仍保留 Host');
  assert.equal(lookups, 1, '连接不执行第二次 hostname DNS 查询');
  assert.equal((await safeFetch(`http://pinned.invalid:${nativePort}/`, { allowPrivate: true,
    dnsLookup: async () => [{ address: '127.0.0.2', family: 4 }, { address: '127.0.0.1', family: 4 }],
  })).body, 'pinned fixture', '连接回退仅使用同一批已经检查的地址');
  const compressed = await safeFetch(`http://pinned.invalid:${nativePort}/gzip`, localOptions);
  assert.equal(compressed.body, 'compressed fixture');
  assert.equal(compressed.headers.get('content-encoding'), 'gzip');
  assert.equal((await safeFetch(`http://pinned.invalid:${nativePort}/gzip`, { ...localOptions, method: 'HEAD' })).body, '');
  const bounded = await safeFetch(`http://pinned.invalid:${nativePort}/large`, { ...localOptions, maxBytes: 32 });
  assert.equal(bounded.bytes, 32); assert.equal(bounded.truncated, true);
  assert.equal((await safeFetch(`http://pinned.invalid:${nativePort}/304`, localOptions)).status, 304);
  await assert.rejects(safeFetch(`http://pinned.invalid:${nativePort}/stall`, { ...localOptions, timeoutMs: 20 }), /请求超时/);
  await assert.rejects(safeFetch(`http://pinned.invalid:${nativePort}/bad-gzip`, localOptions));
  for (const addresses of [[{ address: '::ffff:7f00:1' }], [{ address: '8.8.8.8' }, { address: '127.0.0.1' }]]) {
    await assert.rejects(safeFetch(`http://pinned.invalid:${nativePort}/`, { dnsLookup: async () => addresses }), /内网/);
  }
  await assert.rejects(safeFetch('http://[::1]/'), /内网/);
  await assert.rejects(safeFetch('http://pinned.invalid/', { timeoutMs: 10, dnsLookup: () => new Promise(() => {}) }), /请求超时/);

  console.log('· 真实跨域重定向：剥敏感头；301/302/303 转 GET，307/308 保持请求');
  const sinkPort = await serve(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ method: req.method, headers: req.headers, body: await bodyOf(req) }));
  });
  const originPort = await serve(async (req, res) => {
    await bodyOf(req);
    if (req.url === '/same') { res.writeHead(303, { location: '/result' }); res.end(); }
    else if (req.url === '/result') res.end(JSON.stringify({ headers: req.headers }));
    else { res.writeHead(Number(req.url.slice(1)), { location: `http://sink.invalid:${sinkPort}/result` }); res.end(); }
  });
  const secretHeaders = new Headers({ Authorization: 'Bearer fixture', Cookie: 'session=fixture', 'X-Api-Key': 'fixture-key', 'X-Console-Token': 'fixture-token', 'X-Request-Id': 'ordinary', 'Content-Type': 'text/plain' });
  for (const status of [301, 302, 303, 307, 308]) {
    const result = await safeFetch(`http://pinned.invalid:${originPort}/${status}`, { ...localOptions, method: 'POST', headers: secretHeaders, body: 'payload' });
    const received = JSON.parse(result.body);
    assert.equal(received.method, status < 307 ? 'GET' : 'POST');
    assert.equal(received.body, status < 307 ? '' : 'payload');
    for (const name of ['authorization', 'cookie', 'x-api-key', 'x-console-token']) assert.equal(received.headers[name], undefined, name);
    assert.equal(received.headers['x-request-id'], 'ordinary');
    assert.equal(received.headers['content-type'], status < 307 ? undefined : 'text/plain');
    assert.equal(result.hops.length, 2);
  }
  const same = await safeFetch(`http://pinned.invalid:${originPort}/same`, { ...localOptions, method: 'POST', headers: secretHeaders, body: 'payload' });
  assert.equal(JSON.parse(same.body).headers.authorization, 'Bearer fixture', '同源保留认证');

  console.log('· 图片和表情工具把运行的取消信号传给发送队列');
  const imagePort = await serve((_req, res) => {
    res.setHeader('content-type', 'image/png'); res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
  const sendSignal = new AbortController().signal;
  const toolDefs = new Map();
  const toolKernel = {
    cfg: () => ({ security: { allowPrivateImageHosts: true, imageSend: { requirePreview: false } } }),
    mediaReader: { image: ({ url }, opts) => downloadImageAsDataUrl(url, { ...opts, allowPrivate: true }) },
    send: {
      sendImage: async (_chat, _image, opts) => { assert.equal(opts.signal, sendSignal); return { sent: [] }; },
      sendSticker: async (_chat, _sticker, opts) => { assert.equal(opts.signal, sendSignal); return { sent: [] }; },
    },
    stickers: {
      get: () => ({ id: 'fixture', url: 'https://fixture.invalid/sticker.png' }), markUsed() {},
      ensureSendable: async (sticker, opts) => { assert.equal(opts.signal, sendSignal); return { id: sticker.id, url: sticker.url }; },
    },
  };
  const toolContext = { capability: fixtureCapability(toolKernel), registerTool: (def) => toolDefs.set(def.id, def) };
  mediaTools.setup(toolContext); stickerTools.setup(toolContext);
  for (const note of [undefined, 'fixture note']) {
    assert.equal((await toolDefs.get('send_image').execute({ url: `http://127.0.0.1:${imagePort}/image`, note }, { chatKey: 'group:1', session: {}, signal: sendSignal })).ok, true);
  }
  assert.equal((await toolDefs.get('send_sticker').execute({ stickerId: 'fixture' }, { chatKey: 'group:1', session: {}, signal: sendSignal })).ok, true);

  console.log('· 真实 loader / normalized record：转写可用，热更新保留 provider');
  const appRoot = path.join(fixtureRoot, 'voice-app');
  for (const dir of ['bundled/voice-to-text', 'plugins', 'skills', 'src/kernel']) fs.mkdirSync(path.join(appRoot, dir), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(appRoot, 'src/kernel/safe-fetch.js'), `export { safeFetch } from ${JSON.stringify(new URL('../src/kernel/safe-fetch.js', import.meta.url).href)};`);
  const voiceDir = path.join(appRoot, 'bundled/voice-to-text');
  fs.copyFileSync(new URL('../bundled/voice-to-text/skill.json', import.meta.url), path.join(voiceDir, 'skill.json'));
  const voiceSource = fs.readFileSync(new URL('../bundled/voice-to-text/index.js', import.meta.url), 'utf8');
  fs.writeFileSync(path.join(voiceDir, 'index.js'), voiceSource);
  let asrCalls = 0;
  const voicePort = await serve((req, res) => { res.setHeader('content-type', 'audio/silk'); res.end(Buffer.alloc(64, 85)); });
  const asrPort = await serve(async (req, res) => {
    const multipart = await bodyOf(req);
    assert.ok(multipart.includes('name="file"'));
    asrCalls++;
    res.setHeader('content-type', 'application/json'); res.end('{"text":"fixture transcription"}');
  });
  const settings = { skills: { 'voice-to-text': { enabled: true, settings: { enabled: true, baseUrl: `http://127.0.0.1:${asrPort}/v1` } } } };
  const voiceCaps = createCapabilityRegistry({ log });
  const voicePermissions = createPermissions({ log, headless: true });
  scheduler = createScheduler({ log });
  loader = createPluginLoader({ appRoot, log, bus: new Bus(log),
    registry: createToolRegistry({ log, permissions: voicePermissions }), capabilityRegistry: voiceCaps,
    permissions: voicePermissions, scheduler, config: { get: () => settings },
    storage: createStorage({ dataDir: path.join(appRoot, 'data'), log }),
    sdkHost: { fetch: (url, options) => safeFetch(new URL(url).hostname === 'voice.invalid' ? `http://127.0.0.1:${voicePort}/audio.silk` : url, { ...options, allowPrivate: true, expectBinary: true }) },
  });
  await loader.loadAll();
  voiceEntries = loader.listEntries().map(entry => entry.id).sort();
  assert.deepEqual(voiceEntries, ['voice-to-text']);
  assert.equal(loader.listEntries()[0].status, 'active');
  const firstProvider = voiceCaps.providers('media.transcribe')[0].provider;
  const record = { type: 'record', data: { file: 'cached-file-id', url: 'http://voice.invalid/audio.silk' } };
  const render = () => segmentsToText([record], { transcribe: (seg) => voiceCaps.consume('media.transcribe', seg) });
  assert.equal((await render()).text, '[语音转文字] fixture transcription');
  fs.writeFileSync(path.join(voiceDir, 'index.js'), `${voiceSource}\n// reload fixture\n`);
  await loader.loadDir('bundled', voiceDir, { hot: true });
  assert.equal(loader.isActive('voice-to-text'), true);
  assert.equal(voiceCaps.providers('media.transcribe').length, 1);
  assert.notEqual(voiceCaps.providers('media.transcribe')[0].provider, firstProvider);
  assert.equal((await render()).text, '[语音转文字] fixture transcription');
  assert.equal(asrCalls, 2);
  await loader.stopAll(); loader = null; scheduler.stop(); scheduler = null; voicePermissions.close();

  console.log('· 真实 kernel 入站媒体：等待异步 provider 后发送；停机取消下载与排队发送');
  let emit, mediaCalls = 0, releaseBlocker;
  const sends = [];
  const downloadSignals = [];
  const availablePort = await serve((_req, res) => res.end());
  await new Promise((resolve) => servers.at(-1).close(resolve));
  const transport = { id: 'fixture', selfId: '999', actions: {},
    bind(callbacks) { emit = callbacks.onEvent; }, async start() {}, async stop() {},
    toPlatformSegments: (segments) => segments,
    async send(chatKey, segments) {
      sends.push({ chatKey, segments });
      if (segments[0]?.text === 'queue blocker') await new Promise((resolve) => { releaseBlocker = resolve; });
      return { messageId: sends.length };
    },
    status: () => ({ connected: true }),
  };
  const kernelAppRoot = path.join(fixtureRoot, 'kernel-app'), workspace = path.resolve(import.meta.dirname, '..');
  for (const name of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(kernelAppRoot, name), { recursive: true });
  for (const name of ['src', 'ui']) fs.cpSync(path.join(workspace, name), path.join(kernelAppRoot, name), { recursive: true });
  fs.copyFileSync(path.join(workspace, 'package.json'), path.join(kernelAppRoot, 'package.json'));
  kernel = createKernel({ appRoot: kernelAppRoot, env: { QQ_AGENT_DATA_DIR: path.join(fixtureRoot, 'kernel-data'), QQ_AGENT_PORT: String(availablePort), QQ_AGENT_PROFILE: '1', QQ_AGENT_MIGRATE_FROM: path.join(fixtureRoot, 'absent-migration-source') }, transport,
    priceUpdates: { refresh: async () => ({ ok: true }) }, communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
    fetchImpl: async url => { blockedNetwork.push({ kind: 'host-fetch', url: String(url) }); throw new Error('75 kernel forbids host HTTP'); },
  });
  kernel.config.update({ allowAllWhenEmpty: true, telemetry: { enabled: false }, proactive: { enabled: false }, memory: { consolidateEnabled: false } });
  kernel.orchestrator.onIncoming = async () => {};
  await kernel.start();
  kernelEntries = kernel.loader.listEntries().map(entry => entry.id).sort();
  assert.deepEqual(kernelEntries, [], 'kernel media forwarding needs only the fixed providers below, not installed extensions');
  ownedPorts.add(kernel.httpServer.port); ownedOrigins.add(`http://127.0.0.1:${kernel.httpServer.port}`);
  kernel.capability._setActiveProbe(() => true);
  kernel.capability.register('media.download', 'fixture-null', async () => null);
  let finishDownload;
  kernel.capability.register('media.download', 'fixture-download', async ({ signal }) => {
    assert.ok(signal instanceof AbortSignal);
    downloadSignals.push(signal);
    const call = ++mediaCalls;
    if (call === 2) return new Promise((resolve) => { finishDownload = resolve; });
    await pause(10);
    return { segments: [{ type: 'text', text: call === 3 ? 'queued fixture' : 'downloaded fixture' }] };
  });
  const incoming = (id) => ({ kind: 'group', id: '1', type: 'message', event: { user_id: '7', message_id: id, sender: { nickname: 'fixture' }, message: [{ type: 'text', data: { text: 'https://b23.tv/fixture' } }] } });
  emit(incoming(1));
  await until(() => sends.length === 1, '异步媒体结果应经过发送队列');
  assert.equal(sends[0].chatKey, 'group:1'); assert.equal(sends[0].segments[0].text, 'downloaded fixture');
  emit(incoming(2));
  await until(() => typeof finishDownload === 'function', '第二次下载已开始');
  const blocked = kernel.send.sendSegments('group:1', [{ type: 'text', text: 'queue blocker' }]);
  await until(() => typeof releaseBlocker === 'function', '同一聊天的真实发送链已占用');
  let queuedMedia;
  const originalSendSegments = kernel.send.sendSegments;
  kernel.send.sendSegments = (chatKey, segments, opts) => {
    const pending = originalSendSegments(chatKey, segments, opts);
    if (opts?.source === 'media.download') {
      assert.equal(opts.signal, downloadSignals.at(-1), '发送沿用当次下载的提供者信号');
      queuedMedia = pending;
    }
    return pending;
  };
  emit(incoming(3));
  await until(() => Boolean(queuedMedia), '第三次下载已进入占用中的发送链');
  await kernel.stop(); kernel = null;
  assert.equal(downloadSignals.length, 3);
  assert.equal(downloadSignals.every((signal) => signal.aborted), true, '停机中止本生命周期的下载与发送信号');
  finishDownload({ segments: [{ type: 'text', text: 'late fixture' }] });
  releaseBlocker();
  await blocked;
  await assert.rejects(queuedMedia, /发送已中止/);
  await pause(40);
  assert.equal(sends.length, 2, '停机后的迟到下载与已排队媒体均不发送');
  assert.equal(sends[1].segments[0].text, 'queue blocker');
  console.log('✓ 75 extension repair：全部行为回归通过');
} finally {
  try {
  if (kernel) await kernel.stop();
  if (loader) await loader.stopAll();
  scheduler?.stop();
  for (const server of servers) {
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
  assert.deepEqual(blockedNetwork, [], 'actual fetch/DNS/native HTTP and kernel HTTP stayed within owned fixtures');
  console.log(JSON.stringify({ isolation: 75, kernelEntries, voiceEntries, blockedNetwork, loopbackLookups, pinnedRequests }));
  } finally {
  globalThis.fetch = nativeFetch;
  for (const [target, key, original] of dnsOriginals) target[key] = original;
  for (const [target, key, original] of requestOriginals) target[key] = original;
  syncBuiltinESMExports();
  const relative = path.relative(os.tmpdir(), fixtureRoot);
  assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(fixtureRoot).startsWith('qqa-extension-repair-'));
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

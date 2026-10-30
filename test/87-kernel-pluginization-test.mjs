import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKernel } from '../src/kernel/kernel.js';
import { buildToolAvailabilityContext } from '../src/kernel/tools.js';
import { requestMemoryConsolidation } from '../src/console/memory-media-adapters.js';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tick = () => new Promise(setImmediate);
const readKv = (kernel, id, key) => kernel.storage.namespace(id).get(key);
const owner = (kernel, name) => kernel.capability.providers(name)[0]?.ownerId;
function writePlugin(appRoot, id, source, { permissions = [], capabilities = [], requires = [] } = {}) {
  const dir = path.join(appRoot, 'plugins', id); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id, kind: 'plugin', version: '1.0.0', apiVersion: 1, enabledByDefault: true, permissions, capabilities, requires, entry: 'index.js' }));
  fs.writeFileSync(path.join(dir, 'index.js'), source);
  return dir;
}
async function fixture(t) {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-kernel-pluginization-'));
  for (const name of ['src', 'bundled']) fs.cpSync(path.join(workspace, name), path.join(appRoot, name), { recursive: true });
  fs.copyFileSync(path.join(workspace, 'package.json'), path.join(appRoot, 'package.json'));
  fs.symlinkSync(path.join(workspace, 'node_modules'), path.join(appRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const calls = { starts: 0, stops: 0, sends: [], network: [], price: 0, community: 0 };
  let callbacks;
  const injectedTransport = {
    id: 'offline-host', selfId: '800', segmentSupport: ['text', 'image'], everConnected: true,
    bind: (context) => { callbacks = context; },
    start() { calls.starts++; callbacks.onStatus({ connected: true, selfId: '800' }); },
    stop() { calls.stops++; },
    send(chatKey, segments) { calls.sends.push({ chatKey, segments }); return { msgId: 8100 + calls.sends.length }; },
    toPlatformSegments: (segments) => segments,
    actions: { listGroups: () => [{ id: 'offline-host-group' }] },
    status: () => ({ connected: true, selfId: '800', id: 'offline-host' }),
  };
  const kernel = createKernel({ appRoot, env: { QQ_AGENT_DATA_DIR: path.join(appRoot, 'data'), QQ_AGENT_MIGRATE_FROM: path.join(appRoot, 'absent-migration-source') },
    transport: injectedTransport,
    fetchImpl: async (url) => { calls.network.push(String(url)); throw new Error('test fixture forbids external HTTP'); },
    priceUpdates: { resolve: () => null, refresh: async () => { calls.price++; return { ok: true, remote: false }; } },
    communityMarket: { syncGlobalBlocklist: async () => { calls.community++; return { ok: true, ids: [] }; }, getBlocklist: () => ({ ok: true, ids: [] }), listAccounts: () => ({ ok: true, accounts: [] }) },
  });
  kernel.config.update({ allowAllWhenEmpty: true, telemetry: { enabled: false }, proactive: { enabled: false }, tools: { crossChatSend: true }, store: { contextSliderPos: 0, randomPercent: 0 }, send: { dedupeWindowMs: 0 } });
  kernel.log.setLevel('error');
  // HTTP behavior has a real socket regression in 86; this suite isolates host
  // lifecycle, while retaining actual route registration and the actual loader.
  kernel.httpServer.listen = async () => 48787;
  kernel.httpServer.close = async () => {};
  kernel.loader.startWatchers = () => {};
  t.after(async () => {
    await kernel.stop();
    assert.equal(kernel.scheduler.count(), 0);
    assert.equal(calls.network.length, 0, 'no live QQ, HTTP or model service is used');
    assert.equal(fs.existsSync(path.join(kernel.dataDir, 'qq-agent.lock')), false);
    const target = path.resolve(appRoot);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('qqa-kernel-pluginization-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  await kernel.start(); await kernel.services.idle(); await tick();
  return { kernel, appRoot, calls, injectedTransport, emitHost: (event) => callbacks.onEvent(event) };
}
const message = (mid, text) => ({ kind: 'group', id: '123', type: 'message', event: { message_id: mid, user_id: '456', sender: { nickname: 'fixture' }, message: [{ type: 'text', data: { text } }] } });
const transportSource = (version) => `export default { setup(ctx) {
  ctx.storage.set('hasKernel', Object.hasOwn(ctx, 'kernel'));
  ctx.registerTransport({ id: 'disk-${version}', create(host) {
    const count = key => ctx.storage.set(key, (ctx.storage.get(key) || 0) + 1);
    // Cleanup observes its own resource state; an inactive SDK cannot write KV.
    let stopCount = 0;
    return { id: 'disk-${version}', selfId: '900', actions: { listGroups: () => [{ id: 'disk-${version}' }] },
      start() { count('starts'); host.onStatus({ connected: true, selfId: '900' }); },
      stop() { stopCount++; }, get stopCount() { return stopCount; }, emit: host.onEvent,
      send(chatKey, segments) { count('sends'); ctx.storage.set('lastSend', { chatKey, segments, version: '${version}' }); return { msgId: 9001 }; },
      toPlatformSegments: segments => segments,
    };
  } });
} };`;
async function loadTransport(f, version = 'v1') {
  const dir = writePlugin(f.appRoot, 'disk-transport', transportSource(version), { permissions: ['net.outbound'] });
  await f.kernel.loader.loadDir('plugins', dir); await f.kernel.services.refresh();
  return dir;
}
async function authorize(kernel, id, scope = 'net.outbound') {
  assert.equal(kernel.permissions.setOverride(id, scope, 'allow'), true);
  await kernel.services.refresh();
}

test('real kernel boots all default service owners, exposes 27 tools, and gives plugins no ctx.kernel', async (t) => {
  const { kernel, calls } = await fixture(t);
  const defaults = {
    'transport.provider': 'kernel', 'media.reader': 'media-service', 'memory.consolidate': 'memory-service', 'web.search': 'web-tools',
    'market.client': 'market', 'community.client': 'community', 'telemetry.service': 'telemetry', 'reminders.service': 'reminders', 'llm.dialect': 'llm-dialects',
  };
  for (const [name, id] of Object.entries(defaults)) { assert.equal(owner(kernel, name), id, name); assert.ok(kernel.services.get(name), `${name} is a running public service`); }
  assert.ok(kernel.capability.explain('transport.provider').providers.some((item) => item.ownerId === 'transport-onebot' && item.default));
  const tools = kernel.registry.list(); assert.equal(tools.length, 27); assert.ok(tools.every((tool) => tool.ownerId !== 'kernel'));
  const context = buildToolAvailabilityContext(kernel.config.get(), kernel.loader);
  for (const tool of tools) assert.equal(kernel.registry.availability(tool.id, context).ok, true, tool.id);
  for (const entry of kernel.loader.listEntries()) {
    const loaded = kernel.loader.hostEntry(entry.id);
    if (loaded.manifest.enabledByDefault === false) { assert.equal(loaded.status, 'disabled'); continue; }
    assert.equal(loaded.status, 'active', `${entry.id}: ${JSON.stringify(entry.problems ?? [])}`);
    assert.equal(Object.hasOwn(loaded.ctx, 'kernel'), false, entry.id);
  }
  assert.equal(calls.starts, 1); assert.equal(calls.stops, 0); assert.equal(calls.price, 1); assert.equal(calls.community, 1);
  assert.ok(kernel.scheduler.count() > 0);
  const session = kernel.sessions.create('group:123', { trigger: 'manual' });
  const finish = await kernel.registry.invoke('finish', { reason: 'fixture-complete' }, { execCtx: { chatKey: 'group:123', session, cfg: kernel.config.get() } });
  assert.equal(finish.ok, true); assert.equal(finish.result.result.finished, true); assert.equal(session.finishReason, 'fixture-complete');
  kernel.store.appendIncoming('group:123', { mid: 600, senderId: '456', senderName: 'Fixture', text: 'query-gateway-fixture' });
  const execCtx = { chatKey: 'group:123', session, cfg: kernel.config.get() };
  const query = await kernel.registry.invoke('get_recent_messages', { limit: 1 }, { execCtx });
  assert.equal(query.ok, true); assert.equal(query.result.result.messages[0].text, 'query-gateway-fixture');
  const saved = await kernel.registry.invoke('memory_append', { category: 'memberImpression', userId: '456', target: 'Fixture', content: 'memory-gateway-fixture' }, { execCtx });
  assert.equal(saved.ok, true, saved.error); assert.equal(saved.result.ok, true); assert.equal(saved.result.result.saved, true);
  const memories = await kernel.registry.invoke('memory_query', { userId: '456' }, { execCtx });
  assert.equal(memories.ok, true, memories.error); assert.equal(memories.result.result.memberImpression[0].content, 'memory-gateway-fixture');
  const reminder = await kernel.registry.invoke('set_reminder', { text: 'reminder-gateway-fixture', delayMinutes: 60 }, { execCtx });
  assert.equal(reminder.ok, true, reminder.error); assert.equal(reminder.result.result.set, true);
});

test('an authorized disk transport takes over the real queue, disabling it restores the host, and late events are dropped', async (t) => {
  const f = await fixture(t); const { kernel, calls } = f;
  await loadTransport(f);
  assert.equal(kernel.services.get('transport.provider'), undefined, 'unapproved disk transport is not started');
  assert.equal(readKv(kernel, 'disk-transport', 'starts'), undefined);
  await authorize(kernel, 'disk-transport');
  const disk = kernel.services.get('transport.provider'); assert.equal(disk.id, 'disk-v1'); assert.equal(owner(kernel, 'transport.provider'), 'disk-transport');
  assert.equal(calls.stops, 1); assert.equal(readKv(kernel, 'disk-transport', 'starts'), 1); assert.equal(readKv(kernel, 'disk-transport', 'hasKernel'), false);
  const savedAction = kernel.transport.actions.listGroups;
  assert.deepEqual(await savedAction(), [{ id: 'disk-v1' }]);
  let sent = await kernel.send.sendTextBatch('group:123', 'disk-queue'); assert.equal(sent.sent[0].msgId, 9001); assert.equal(calls.sends.length, 0);
  assert.equal(readKv(kernel, 'disk-transport', 'lastSend').segments[0].text, 'disk-queue');
  const toolSend = await kernel.registry.invoke('send_message', { messages: 'default-tool-through-disk' }, { execCtx: { chatKey: 'group:123', session: { sent: [] }, cfg: kernel.config.get() } });
  assert.equal(toolSend.ok, true); assert.equal(toolSend.result.ok, true); assert.equal(readKv(kernel, 'disk-transport', 'sends'), 2); assert.equal(calls.sends.length, 0);
  disk.emit(message(701, 'accepted-current')); await tick(); await tick();
  assert.ok(kernel.store.findByMid('group:123', 701));
  await kernel.loader.setEnabled('disk-transport', false); await kernel.services.refresh();
  assert.equal(kernel.services.get('transport.provider').id, 'offline-host'); assert.equal(calls.starts, 2);
  assert.equal(disk.stopCount, 1, 'the disabled resource really stopped once');
  assert.deepEqual(await savedAction(), [{ id: 'offline-host-group' }], 'saved action still resolves the current provider');
  disk.emit(message(702, 'stale-disabled')); await tick(); assert.equal(kernel.store.findByMid('group:123', 702), null);
  sent = await kernel.send.sendTextBatch('group:123', 'fallback-queue'); assert.equal(sent.sent[0].msgId, 8101); assert.equal(calls.sends.length, 1);
});

test('transport reload changes identity, requires fresh authorization, and invalidates old callbacks and saved methods', async (t) => {
  const f = await fixture(t); const { kernel } = f; const dir = await loadTransport(f); await authorize(kernel, 'disk-transport');
  const oldEntry = kernel.loader.hostEntry('disk-transport'), old = kernel.services.get('transport.provider');
  const savedSend = kernel.transport.send;
  fs.writeFileSync(path.join(dir, 'index.js'), transportSource('v2'));
  await kernel.loader.loadDir('plugins', dir); await kernel.services.refresh();
  const current = kernel.loader.hostEntry('disk-transport');
  assert.notEqual(current.generation, oldEntry.generation); assert.notEqual(current.fingerprint, oldEntry.fingerprint);
  assert.equal(kernel.permissions.status('disk-transport', 'net.outbound').override, null);
  assert.equal(kernel.services.get('transport.provider'), undefined);
  assert.equal(old.stopCount, 1, 'reload stopped the old generation once');
  old.emit(message(703, 'stale-reloaded')); await tick(); assert.equal(kernel.store.findByMid('group:123', 703), null);
  await authorize(kernel, 'disk-transport'); assert.equal(kernel.services.get('transport.provider').id, 'disk-v2');
  await savedSend('group:123', [{ type: 'text', text: 'new-generation' }]);
  assert.equal(readKv(kernel, 'disk-transport', 'lastSend').version, 'v2');
  const fresh = kernel.services.get('transport.provider'); fresh.emit(message(704, 'fresh-reloaded')); await tick(); await tick(); assert.ok(kernel.store.findByMid('group:123', 704));
  await kernel.stop(); assert.equal(fresh.stopCount, 1); assert.equal(old.stopCount, 1);
  fresh.emit(message(705, 'stale-stopped')); await tick(); assert.equal(kernel.store.findByMid('group:123', 705), null);
});

test('provider pins and default service disable remove cached access and timers rather than retaining old implementations', async (t) => {
  const f = await fixture(t); const { kernel, calls } = f;
  await loadTransport(f); await authorize(kernel, 'disk-transport');
  kernel.config.update({ extensions: { providers: { 'transport.provider': 'kernel' } } }); await kernel.services.refresh();
  assert.equal(owner(kernel, 'transport.provider'), 'kernel'); assert.equal(kernel.services.get('transport.provider').id, 'offline-host');
  kernel.config.update({ extensions: { providers: { __replace__: {} } } }); await kernel.services.refresh();
  assert.equal(owner(kernel, 'transport.provider'), 'disk-transport'); assert.equal(kernel.services.get('transport.provider').id, 'disk-v1');
  const media = kernel.loader.hostEntry('media-tools').ctx.capability('media.reader'), search = kernel.loader.hostEntry('web-tools').ctx.capability('web.search');
  assert.ok(media); assert.ok(search);
  for (const [id, name] of [['media-service', 'media.reader'], ['memory-service', 'memory.consolidate'], ['reminders', 'reminders.service'], ['community', 'community.client'], ['telemetry', 'telemetry.service'], ['llm-dialects', 'llm.dialect'], ['web-tools', 'web.search'], ['market', 'market.client']]) {
    const timersBefore = kernel.scheduler.count();
    await kernel.loader.setEnabled(id, false); await kernel.services.refresh();
    assert.equal(kernel.capability.has(name), false, name); assert.equal(kernel.services.get(name), undefined, name);
    if (id === 'community') assert.equal(kernel.scheduler.count(), timersBefore - 1, 'community sync owner timer is removed');
    if (id === 'reminders') assert.equal(kernel.orchestrator.status().wakeTimers, 0, 'reminder runtime timer is removed');
  }
  await assert.rejects(Promise.resolve().then(() => media.image('https://fixture.invalid/img.png')), /未就绪|失效|不可用|缺少/);
  await assert.rejects(Promise.resolve().then(() => search.search('must-not-query')), /未就绪|失效|不可用|缺少/);
  assert.equal(calls.network.length, 0);
  await kernel.loader.setEnabled('market', true); await kernel.services.refresh();
  assert.deepEqual(await kernel.services.get('market.client').listAccounts(), { ok: true, accounts: [] });
  assert.equal(owner(kernel, 'market.client'), 'market');
});

test('the default media plugin retains video settings and invokes a frame provider with its arguments', async (t) => {
  const { kernel } = await fixture(t);
  const media = kernel.services.get('media.reader');
  let frameCalls = 0, options;
  kernel.capability.register('video.frames.available', 'kernel', () => true);
  kernel.capability.register('video.frames', 'kernel', (source, opts) => {
    frameCalls++; options = opts;
    assert.equal(source.size, 1);
    return { parts: Array.from({ length: opts.frames }, () => ({ type: 'image_url', image_url: { url: 'data:image/png;base64,Zml4dHVyZQ==' } })) };
  });
  kernel.config.update({ api: { videoMode: 'frames' }, skills: { 'video-frames': { enabled: false, settings: { frames: 7, apiKey: 'unrelated-secret' } } } });
  assert.equal(await media.framesAvailable(), false);
  await assert.rejects(media.probe({ size: 1 }), /未启用/);
  assert.equal(frameCalls, 0);
  kernel.config.update({ skills: { 'video-frames': { enabled: true } } });
  const result = await media.probe({ size: 1 });
  assert.equal(result.route, 'frames'); assert.equal(result.parts.length, 7);
  assert.equal(frameCalls, 1); assert.equal(options.frames, 7); assert.equal(options.count, 7);
  assert.deepEqual(kernel.loader.hostEntry('media-service').ctx.capability('extensions.state').videoFrames(), { enabled: true, frames: 7 });
});

test('core tools and already acquired media/search facades use replacement services and return to defaults', async (t) => {
  const f = await fixture(t); const { kernel } = f;
  const media = kernel.loader.hostEntry('media-tools').ctx.capability('media.reader'), search = kernel.loader.hostEntry('web-tools').ctx.capability('web.search');
  const dir = writePlugin(f.appRoot, 'replacement-services', `export default { setup(ctx) {
    const count = key => ctx.storage.set(key, (ctx.storage.get(key) || 0) + 1);
    let searchStops = 0, mediaStops = 0;
    ctx.registerCapability('web.search', {
      start() { count('searchStarts'); }, stop() { searchStops++; }, get stopCount() { return searchStops; },
      search(query) { count('queries'); return { source: 'replacement', query, results: [] }; },
      fetchPage(url) { return { source: 'replacement', url }; }, lockState() { return {}; }
    }, { lifecycle: true, scopes: ['net.outbound'] });
    ctx.registerCapability('media.reader', {
      start() { count('mediaStarts'); }, stop() { mediaStops++; }, get stopCount() { return mediaStops; },
      image(source) { count('images'); return { source, fixture: 'replacement' }; },
      imageParts() { return []; }, probe() { return {}; }, framesAvailable() { return false; }
    }, { lifecycle: true, scopes: ['net.outbound'] });
  } };`, { permissions: ['net.outbound'] });
  await kernel.loader.loadDir('plugins', dir); await kernel.services.refresh();
  assert.equal(kernel.services.get('media.reader'), undefined); assert.equal(kernel.services.get('web.search'), undefined);
  await authorize(kernel, 'replacement-services');
  const replacementMedia = kernel.services.get('media.reader'), replacementSearch = kernel.services.get('web.search');
  assert.equal(owner(kernel, 'media.reader'), 'replacement-services'); assert.equal(owner(kernel, 'web.search'), 'replacement-services');
  assert.deepEqual(await media.image('offline-fixture'), { source: 'offline-fixture', fixture: 'replacement' });
  assert.equal((await search.search('offline-query')).source, 'replacement');
  const result = await kernel.registry.invoke('web_search', { query: 'default-tool-query' }, { execCtx: { chatKey: 'group:123', cfg: kernel.config.get() } });
  assert.equal(result.ok, true); assert.equal(result.result.ok, true); assert.equal(result.result.result.source, 'replacement'); assert.equal(result.result.result.query, 'default-tool-query');
  assert.equal(readKv(kernel, 'replacement-services', 'queries'), 2); assert.equal(readKv(kernel, 'replacement-services', 'images'), 1);
  await kernel.loader.setEnabled('replacement-services', false); await kernel.services.refresh();
  assert.equal(owner(kernel, 'media.reader'), 'media-service'); assert.equal(owner(kernel, 'web.search'), 'web-tools');
  assert.equal(replacementSearch.stopCount, 1); assert.equal(replacementMedia.stopCount, 1);
  assert.ok(kernel.services.get('media.reader')); assert.ok(kernel.services.get('web.search'));
});

test('disabling reminders cancels their real runtime timer and reenabling delivers the pending item once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture(t); const { kernel, calls } = f;
  const reminders = kernel.capability.consume('data.reminders');
  const item = reminders.add({ chatKey: 'group:123', text: 'timer-fixture', dueAt: Date.now() - 1 });
  await kernel.loader.setEnabled('reminders', false); await kernel.services.refresh();
  assert.equal(kernel.orchestrator.status().wakeTimers, 0);
  t.mock.timers.tick(6000); await tick(); await tick();
  assert.equal(calls.sends.length, 0); assert.equal(reminders.pending().some((r) => r.id === item.id), true);
  await kernel.loader.setEnabled('reminders', true); await kernel.services.refresh();
  t.mock.timers.tick(5000); await tick(); await tick();
  assert.equal(calls.sends.length, 1); assert.ok(calls.sends[0].segments[0].text.includes('timer-fixture'));
  assert.equal(reminders.pending().some((r) => r.id === item.id), false);
  t.mock.timers.tick(20_000); await tick(); await tick(); assert.equal(calls.sends.length, 1);
});

test('memory consolidation uses the selected running service and never invokes an unauthorized disk provider', async (t) => {
  const f = await fixture(t); const { kernel } = f;
  kernel.config.update({ api: { model: 'offline-model' } });
  kernel.store.appendIncoming('group:123', { mid: 706, senderId: '456', senderName: 'Fixture', text: 'real identity for consolidation' });
  kernel.memory.append('group:123', { userId: '456', name: 'Fixture', content: 'existing-offline-impression' });
  const dir = writePlugin(f.appRoot, 'replacement-memory', `export default { setup(ctx) {
    const count = key => ctx.storage.set(key, (ctx.storage.get(key) || 0) + 1);
    let pending, stopCount = 0;
    ctx.registerCapability('memory.consolidate', {
      start() { count('starts'); }, stop() { stopCount++; }, get stopCount() { return stopCount; },
      hold() { let resolve; pending = new Promise(done => { resolve = done; }); return resolve; },
      async consolidate(args) {
        count('runs');
        if (pending) { const wait = pending; pending = null; await wait; return { members: args.members.map(member => ({ ...member, impressions: member.impressions.slice(0, 1) })) }; }
        return { members: args.members };
      }
    }, { lifecycle: true, scopes: ['net.outbound'] });
  } };`, { permissions: ['net.outbound'] });
  await kernel.loader.loadDir('plugins', dir); await kernel.services.refresh();
  assert.equal(owner(kernel, 'memory.consolidate'), 'replacement-memory'); assert.equal(kernel.services.get('memory.consolidate'), undefined);
  const request = () => requestMemoryConsolidation({ memory: kernel.memory, chatKey: 'group:123' });
  assert.equal(request().status, 503); await tick(); assert.equal(readKv(kernel, 'replacement-memory', 'runs'), undefined);
  await authorize(kernel, 'replacement-memory'); assert.equal(readKv(kernel, 'replacement-memory', 'starts'), 1);
  const replacementMemory = kernel.services.get('memory.consolidate');
  assert.equal(request().status, 202); await tick(); await tick(); assert.equal(readKv(kernel, 'replacement-memory', 'runs'), 1);
  assert.equal(kernel.memory.query('group:123')[0].impressions[0].content, 'existing-offline-impression');
  assert.equal(kernel.permissions.setOverride('replacement-memory', 'net.outbound', 'deny'), true); await kernel.services.refresh();
  assert.equal(replacementMemory.stopCount, 1, 'revocation stops the running resource once');
  assert.equal(request().status, 503); assert.equal(readKv(kernel, 'replacement-memory', 'runs'), 1);
  await authorize(kernel, 'replacement-memory');
  kernel.memory.append('group:123', { userId: '456', name: 'Fixture', content: 'second-impression-must-survive-late-result' });
  const beforeLate = structuredClone(kernel.memory.query('group:123')[0]);
  const resolveLate = kernel.services.get('memory.consolidate').hold();
  assert.equal(request().status, 202); await tick(); assert.equal(readKv(kernel, 'replacement-memory', 'runs'), 2);
  await kernel.loader.setEnabled('replacement-memory', false); await kernel.services.refresh();
  assert.equal(replacementMemory.stopCount, 2, 'restarted resource is stopped again on disable');
  assert.equal(owner(kernel, 'memory.consolidate'), 'memory-service'); assert.equal(typeof kernel.services.get('memory.consolidate'), 'function');
  resolveLate(); await tick(); await tick();
  const afterLate = kernel.memory.query('group:123')[0];
  assert.deepEqual(afterLate.impressions, beforeLate.impressions, 'a stopped provider cannot overwrite memory with its late proposal');
  assert.equal(afterLate.lastConsolidatedAt, beforeLate.lastConsolidatedAt, 'late results do not advance the consolidation cooldown');
  await kernel.loader.setEnabled('memory-service', false); await kernel.services.refresh();
  assert.equal(request().status, 503); assert.equal(readKv(kernel, 'replacement-memory', 'runs'), 2);
});

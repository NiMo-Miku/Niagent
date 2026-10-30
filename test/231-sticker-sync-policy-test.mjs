// Actual default stores, loader/SDK, tools, prompts and OneBot provider. All
// protocol/model responses stay in process; sockets and native processes fail closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createApplication } from '../src/kernel/composition.js';
import { defaultComponents as defaults } from '../bundled/runtime-defaults/components.js';
import { createOneBotProvider } from '../bundled/transport-onebot/provider.js';
import { OneBotClient } from '../bundled/transport-onebot/client.js';

const source = path.resolve(import.meta.dirname, '..');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64');
const image = 'data:image/png;base64,' + png.toString('base64');
const restores = [], unexpected = [];
function deny(object, key, label) {
  const previous = object[key];
  object[key] = () => { unexpected.push(label); throw new Error('231 forbids ' + label); };
  restores.push(() => { object[key] = previous; });
}
test.before(() => {
  deny(globalThis, 'fetch', 'fetch'); deny(dns, 'lookup', 'DNS'); deny(dnsPromises, 'lookup', 'promise DNS');
  for (const object of [http, https]) for (const key of ['request', 'get']) deny(object, key, 'HTTP ' + key);
  deny(http.Server.prototype, 'listen', 'HTTP listen'); deny(net.Socket.prototype, 'connect', 'socket');
  for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) deny(childProcess, key, 'native ' + key);
  syncBuiltinESMExports();
});
test.after(() => { for (const restore of restores.reverse()) restore(); syncBuiltinESMExports(); assert.deepEqual(unexpected, []); });
function deferred() { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; }
const tick = () => new Promise(setImmediate);
async function started(gate, observed = () => undefined) {
  let reached = false; gate.promise.then(() => { reached = true; });
  for (let i = 0; i < 200 && !reached; i++) await tick();
  assert.equal(reached, true, 'owned asynchronous operation entered its controlled gate: ' + JSON.stringify(observed()));
}
const remote = (id = 'REMOTE231', desc = 'remote note') => ({ id, emojiId: id, resId: id, url: 'https://fixture.invalid/' + id + '.png', desc });
const finish = () => ({ message: { role: 'assistant', content: '', tool_calls: [{ id: 'finish231', type: 'function', function: { name: 'finish', arguments: '{"reason":"offline complete"}' } }] }, finishReason: 'tool_calls' });
function cleanup(root) {
  const absolute = path.resolve(root);
  assert.equal(path.dirname(absolute).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(absolute).startsWith('qqa-sticker231-'));
  fs.rmSync(absolute, { recursive: true, force: true });
}
async function fixture(t, { layerMode = null, onebot = false, fetchImpl = null, pluginSource = null } = {}) {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-sticker231-')), dataDir = path.join(appRoot, 'data');
  let app, manager, mediaOverride = null;
  const clock = { value: 1_800_000_000_000 }, models = [], deliveries = [];
  for (const folder of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, folder));
  fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
  fs.cpSync(path.join(source, 'src'), path.join(appRoot, 'src'), { recursive: true });
  for (const id of ['core-tools', 'sticker-tools', 'media-service']) fs.cpSync(path.join(source, 'bundled', id), path.join(appRoot, 'bundled', id), { recursive: true });
  if (onebot) {
    const dir = path.join(appRoot, 'bundled', 'transport-onebot'); fs.mkdirSync(dir);
    fs.copyFileSync(path.join(source, 'bundled/transport-onebot/plugin.json'), path.join(dir, 'plugin.json'));
    fs.writeFileSync(path.join(dir, 'index.js'), `export { default } from ${JSON.stringify(pathToFileURL(path.join(source, 'bundled/transport-onebot/index.js')).href)};`);
  }
  if (pluginSource) {
    const dir = path.join(appRoot, 'plugins', 'favorites231'); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'favorites231', kind: 'plugin', apiVersion: 1, enabledByDefault: true, entry: 'index.js', permissions: ['net.outbound', 'qq.send', 'data.sessions.read'] }));
    fs.writeFileSync(path.join(dir, 'index.js'), pluginSource);
  }
  if (layerMode) {
    const layer = path.join(appRoot, 'overrides', 'stickers231'); fs.mkdirSync(layer, { recursive: true });
    fs.writeFileSync(path.join(layer, 'index.mjs'), `import { createStickerManager } from ${JSON.stringify(pathToFileURL(path.join(source, 'src/kernel/stickers.js')).href)};
export default options => { const base = createStickerManager(options); return { ...base,
 async syncFromQQ(options) { const result = await base.syncFromQQ(options); base.collect({id:'APPENDED231',desc:'selected sticker storage',source:'manual'}); return result; },
 collectIntoQQ: async () => ({ok:false,code:'APPENDED231_POLICY',error:'appended collection policy'}) }; };`);
    fs.writeFileSync(path.join(layer, 'composition.json'), JSON.stringify({ version: 1, id: 'stickers231', enabled: layerMode !== 'disabled', components: { 'data.stickers': 'index.mjs' } }));
  }
  const components = {
    'runtime.logger': options => defaults['runtime.logger']({ ...options, mirrorConsole: false }),
    'core.orchestrator': options => defaults['core.orchestrator']({ ...options, llmInvoker: async args => { models.push(structuredClone(args.messages)); return finish(); } }),
    ...(!layerMode ? { 'data.stickers': options => {
      manager = defaults['data.stickers']({ ...options, now: () => clock.value, mediaReader: () => mediaOverride ?? options.mediaReader() });
      return manager;
    } } : {}),
  };
  t.after(async () => { try { await app?.stop(); } finally { cleanup(appRoot); } });
  app = await createApplication({ appRoot, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_MIGRATE_FROM: path.join(appRoot, 'absent-migration'), QQ_AGENT_PORT: '0' }, components,
    ...(!onebot ? { transport: { id: 'offline231', start() {}, stop() {}, status: () => ({ connected: true }), selfId: '23199', actions: {}, async send(key, segments) { deliveries.push({ key, segments }); return { msgId: deliveries.length }; } } } : {}),
    priceUpdates: { refresh: async () => ({ ok: true, remote: false }), resolve: () => null },
    fetchImpl: fetchImpl ?? (async () => { throw new Error('231 has no HTTP transport'); }),
  });
  app.config.update({ api: { model: 'offline231', maxRounds: 2 }, telemetry: { enabled: false }, proactive: { enabled: false }, chatActive: { enabled: false },
    onebot: { wsUrl: 'ws://fixture.invalid', httpUrl: 'http://fixture.invalid' },
    memory: { consolidateEnabled: false }, sticker: { enabled: true, collectEnabled: true, maxCollectPerHour: 10 }, sessionRetryAttempts: 0,
    store: { contextTier: 4, contextSliderPos: 100, historyCount: 20, promptAnchor: { enabled: false } } });
  const save = patch => { app.config.update(patch); const disk = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')); app.config.load(); assert.deepEqual(app.config.get().sticker, disk.sticker); return disk; };
  save({});
  await app.loader.loadAll();
  const expected = ['core-tools', 'media-service', 'sticker-tools', ...(onebot ? ['transport-onebot'] : []), ...(pluginSource ? ['favorites231'] : [])].sort();
  assert.deepEqual(app.loader.listEntries().map(entry => entry.id).sort(), expected, 'only this test generation owns installed roots');
  for (const entry of app.loader.listEntries()) assert.equal(entry.status, 'active', entry.id + ': ' + entry.loadError);
  await app.services.start();
  assert.equal(app.httpServer.port, null, 'no application HTTP listener starts');
  const invoke = (id, args = {}, context = {}) => app.components['core.tools.bundle']({ c: app.config.get() }, { registry: app.registry, loader: app.loader }).invoke(id, args,
    { chatKey: 'group:23101', session: { id: 'tool231', sent: [] }, signal: new AbortController().signal, ...context });
  const list = async (args = {}, context) => { const result = await invoke('list_stickers', args, context); assert.equal(result.ok, true); assert.equal(result.result.ok, true); return result.result.result; };
  let mid = 0;
  const appendImage = (key = 'group:23101') => app.store.appendIncoming(key, { mid: ++mid, senderId: '23110', senderName: 'Synthetic', text: 'synthetic image', media: [{ kind: 'image', file: image }] });
  const collect = async (args = {}, context = {}) => { const m = appendImage(context.chatKey); const result = await invoke('collect_sticker', { messageId: m.mid, note: 'synthetic note', ...args }, context); assert.equal(result.ok, true); return result.result; };
  return { app, appRoot, dataDir, manager, clock, models, deliveries, invoke, list, collect, save, media: value => { mediaOverride = value; },
    disk: () => fs.existsSync(path.join(dataDir, 'stickers.json')) ? fs.readFileSync(path.join(dataDir, 'stickers.json'), 'utf8') : null,
    register(provider, ownerId = 'kernel') { app.capability.register('qq.emoji-favorites', ownerId, provider); },
    async prompt() { app.store.appendIncoming('group:23101', { mid: ++mid, senderId: '23110', senderName: 'Synthetic', text: 'PROMPT_TRIGGER_231', atMe: true }); await app.orchestrator.wake('group:23101'); return models.at(-1)?.at(-1)?.content; },
  };
}
function favorites(overrides = {}) {
  return { getAccountIdentity: () => 'account231', fetchCustomFaceDetails: async () => ({ entries: [remote()], complete: false }),
    addCustomFace: async () => ({ emojiId: 'ADDED231' }), modifyCustomFace: async () => ({ ok: true }), ...overrides };
}

test('sync coalesces same-generation calls, honors force/TTL/account identity, and preserves partial/empty libraries', async t => {
  const e = await fixture(t); let requests = 0, account = 'A', answer = { entries: [remote()], complete: false }, held;
  const provider = favorites({ getAccountIdentity: () => account, async fetchCustomFaceDetails() { requests++; return held ? held.promise : answer; } });
  e.register(provider); e.manager.collect({ id: 'unseen231', source: 'qq', desc: 'retain partial' });
  held = deferred(); const first = e.manager.syncFromQQ(), second = e.manager.syncFromQQ({ force: true }); await tick();
  assert.equal(requests, 1); held.resolve(answer); await Promise.all([first, second]); held = null;
  assert.equal(e.manager.all().length, 2); assert.equal((await e.manager.syncFromQQ()).fromCache, true); assert.equal(requests, 1);
  answer = { entries: [], complete: false }; await e.manager.syncFromQQ({ force: true }); assert.equal(e.manager.all().length, 2); assert.equal(requests, 2);
  e.clock.value += 60_000; await e.manager.syncFromQQ(); assert.equal(requests, 3);
  account = 'B'; await e.manager.syncFromQQ(); assert.equal(requests, 4, 'identity change invalidates prior account TTL');
  e.manager.collect({ id: 'manual231', source: 'manual' }); e.manager.collect({ id: 'ai231', source: 'ai' });
  answer = { entries: [], complete: true }; await e.manager.syncFromQQ({ force: true });
  assert.deepEqual(e.manager.all().map(x => x.id).sort(), ['ai231', 'manual231'], 'only a positively complete snapshot prunes old QQ entries');
});

test('held sync merges current disk cognition, local acknowledged collections and duplicate IDs without overlap', async t => {
  const e = await fixture(t), gate = deferred(), entered = deferred();
  e.register(favorites({ async fetchCustomFaceDetails() { entered.resolve(); return gate.promise; }, addCustomFace: async () => ({ emojiId: 'NEW231' }) }));
  e.manager.collect({ id: 'SHARED231', source: 'manual', desc: 'before' });
  const pending = e.manager.syncFromQQ(); await started(entered);
  e.manager.note('SHARED231', 'new local note'); e.manager.markUsed('SHARED231', 'new context');
  assert.equal((await e.manager.collectIntoQQ({ file: image, desc: 'new acknowledged note', buffer: png, tags: ['local'], usage: 'local usage' })).ok, true);
  gate.resolve({ entries: [remote('SHARED231', 'remote updated'), remote('SHARED231', 'remote final'), remote('NEW231', 'stale remote note')], complete: false });
  assert.equal((await pending).fromCache, false);
  const current = e.manager.all(); assert.equal(current.length, 2);
  const shared = e.manager.get('SHARED231'); assert.equal(shared.source, 'manual'); assert.equal(shared.desc, 'remote final'); assert.equal(shared.localNote, 'new local note'); assert.equal(shared.useCount, 1); assert.equal(shared.lastContext, 'new context');
  const added = e.manager.get('NEW231'); assert.equal(added.desc, 'new acknowledged note'); assert.deepEqual(added.tags, ['local']); assert.equal(added.usage, 'local usage'); assert.ok(added.localFile);
  const reread = defaults['data.stickers']({ dataDir: e.dataDir }); assert.deepEqual(reread.all(), current);
});

test('malformed/failed/unsupported/unknown-account sync and atomic rename faults preserve original disk and do not cache success', async t => {
  const e = await fixture(t); e.manager.collect({ id: 'cached231', source: 'qq' }); const before = e.disk(); let requests = 0;
  for (const result of [null, {}, { entries: [null] }, { entries: [{}] }, { entries: [{ id: 'bad', url: 'file:///outside.png' }] }]) {
    e.register(favorites({ async fetchCustomFaceDetails() { requests++; return result; } }));
    const synced = await e.manager.syncFromQQ({ force: true }); assert.equal(synced.degraded, true); assert.equal(e.disk(), before);
  }
  e.register(favorites({ fetchCustomFaceDetails: undefined })); assert.equal((await e.manager.syncFromQQ()).code, 'QQ_EMOJI_DETAILS_UNAVAILABLE');
  e.register(favorites({ getAccountIdentity: () => null })); assert.equal((await e.manager.syncFromQQ()).code, 'QQ_EMOJI_ACCOUNT_UNKNOWN'); assert.equal(e.disk(), before);
  e.register(favorites({ async fetchCustomFaceDetails() { requests++; return { entries: [remote()], complete: false }; } }));
  const rename = fs.renameSync; let fault = true;
  fs.renameSync = (from, to) => { if (fault && to === path.join(e.dataDir, 'stickers.json')) throw new Error('synthetic rename fault'); return rename(from, to); };
  try {
    const count = requests; assert.equal((await e.manager.syncFromQQ()).degraded, true); assert.equal(e.disk(), before);
    fault = false; assert.equal((await e.manager.syncFromQQ()).fromCache, false); assert.equal(requests, count + 2);
  } finally { fs.renameSync = rename; }
  assert.deepEqual(fs.readdirSync(e.dataDir).filter(name => name.endsWith('.tmp')), []);
});

test('a failed atomic temp write leaves disk unchanged and allows a real later sync', async t => {
  const e = await fixture(t); e.manager.collect({ id: 'cached231', source: 'qq' }); const before = e.disk();
  e.register(favorites()); const write = fs.writeFileSync;
  fs.writeFileSync = (name, ...args) => { if (String(name).startsWith(path.join(e.dataDir, 'stickers.json.') + '') && String(name).endsWith('.tmp')) throw new Error('synthetic temp write fault'); return write(name, ...args); };
  try { assert.equal((await e.manager.syncFromQQ()).degraded, true); assert.equal(e.disk(), before); }
  finally { fs.writeFileSync = write; }
  assert.equal((await e.manager.syncFromQQ()).fromCache, false); assert.equal(e.manager.get('REMOTE231').desc, 'remote note');
});

test('held sync rejects same-object re-registration, account change, caller cancellation and application stop', async t => {
  for (const event of ['register', 'account', 'cancel', 'stop']) await t.test(event, async st => {
    const e = await fixture(st), gate = deferred(), entered = deferred(), controller = new AbortController(); let account = 'A';
    const provider = favorites({ getAccountIdentity: () => account, async fetchCustomFaceDetails() { entered.resolve(); return gate.promise; } });
    e.register(provider); e.manager.collect({ id: 'cached231', source: 'qq' }); const before = e.disk();
    const pending = e.manager.syncFromQQ({ signal: controller.signal }); pending.catch(() => {}); await started(entered);
    if (event === 'register') e.register(provider);
    if (event === 'account') account = 'B';
    if (event === 'cancel') controller.abort(new Error('synthetic caller cancel'));
    if (event === 'stop') await e.app.stop();
    gate.resolve({ entries: [remote('LATE231')], complete: true });
    if (event === 'cancel' || event === 'stop') await assert.rejects(pending, /cancel|停止/);
    else assert.equal((await pending).degraded, true);
    await tick(); assert.equal(e.disk(), before);
  });
});

test('saved collection disable refuses the actual tool and direct store before image/provider effects', async t => {
  const e = await fixture(t); let reads = 0, effects = 0, identities = 0;
  e.register(favorites({ getAccountIdentity: () => { identities++; return 'A'; }, addCustomFace: async () => { effects++; return { emojiId: 'X' }; }, modifyCustomFace: async () => { effects++; return { ok: true }; } }));
  e.media({ async image() { reads++; return { buffer: png }; } });
  e.save({ sticker: { collectEnabled: false } });
  assert.equal((await e.collect()).code, 'QQ_EMOJI_COLLECT_DISABLED');
  assert.equal((await e.manager.collectIntoQQ({ file: image })).code, 'QQ_EMOJI_COLLECT_DISABLED');
  assert.deepEqual({ reads, effects, identities, disk: e.disk() }, { reads: 0, effects: 0, identities: 0, disk: null });
});

test('one rolling-hour quota covers concurrent chats and promptly cancelled queued requests', async t => {
  const e = await fixture(t), entered = deferred(), gate = deferred(); let adds = 0, reads = 0;
  e.save({ sticker: { maxCollectPerHour: 1 } });
  e.register(favorites({ addCustomFace: async () => ({ emojiId: 'COLLECT' + ++adds }) }));
  e.media({ async image() { reads++; entered.resolve(); await gate.promise; return { buffer: png }; } });
  const first = e.collect({}, { chatKey: 'group:23101' }); await started(entered);
  const second = e.collect({}, { chatKey: 'group:23102' });
  const aborter = new AbortController(), queued = e.manager.collectIntoQQ({ file: image, signal: aborter.signal });
  aborter.abort(new Error('queued cancel'));
  assert.equal((await queued).code, 'QQ_EMOJI_CANCELLED'); assert.equal(adds, 0);
  gate.resolve(); assert.equal((await first).ok, true); assert.equal((await second).code, 'QQ_EMOJI_RATE_LIMIT');
  assert.equal(adds, 1); assert.equal(reads, 1, 'over-quota queued work never acquires an image');
  e.clock.value += 3_600_000 - 1; assert.equal((await e.collect()).code, 'QQ_EMOJI_RATE_LIMIT');
  e.clock.value++; assert.equal((await e.collect()).ok, true); assert.equal(adds, 2);
});

test('policy is reread after an awaited image and a queued caller never receives an obsolete allowance', async t => {
  for (const change of ['disable', 'reduce-limit']) await t.test(change, async st => {
    const e = await fixture(st), entered = deferred(), gate = deferred(); let adds = 0;
    e.register(favorites({ addCustomFace: async () => ({ emojiId: 'ADDED' + ++adds }) }));
    if (change === 'reduce-limit') assert.equal((await e.manager.collectIntoQQ({ file: image, buffer: png })).ok, true);
    e.media({ async image() { entered.resolve(); await gate.promise; return { buffer: png }; } });
    const pending = e.collect(); await started(entered);
    e.save({ sticker: change === 'disable' ? { collectEnabled: false } : { maxCollectPerHour: 1 } });
    gate.resolve(); const result = await pending;
    assert.equal(result.code, change === 'disable' ? 'QQ_EMOJI_COLLECT_DISABLED' : 'QQ_EMOJI_RATE_LIMIT');
    assert.equal(adds, change === 'disable' ? 0 : 1);
  });
});

test('definite rejection, missing ID and full QQ library preserve precise errors and release the allowance', async t => {
  for (const scenario of ['reject', 'no-id', 'full']) await t.test(scenario, async st => {
    const e = await fixture(st); let attempts = 0;
    e.save({ sticker: { maxCollectPerHour: 1 } });
    e.register(favorites({ async addCustomFace() { if (++attempts > 1) return { emojiId: 'RECOVERED' }; if (scenario === 'no-id') return {}; throw new Error(scenario === 'full' ? 'QQ 1000 上限' : 'definite rejection'); } }));
    const failed = await e.manager.collectIntoQQ({ file: image, buffer: png });
    assert.equal(failed.code, scenario === 'full' ? 'QQ_EMOJI_LIMIT' : scenario === 'no-id' ? 'QQ_EMOJI_NO_ID' : 'QQ_EMOJI_ADD_FAILED');
    assert.equal(e.disk(), null);
    assert.equal((await e.manager.collectIntoQQ({ file: image, buffer: png })).ok, true); assert.equal(attempts, 2);
  });
});

test('acknowledged add keeps its slot after note failure, cancellation or failed local index; ambiguous timeout is honest', async t => {
  for (const scenario of ['note', 'cancel', 'index', 'timeout']) await t.test(scenario, async st => {
    const e = await fixture(st), controller = new AbortController(); let adds = 0, notes = 0;
    e.save({ sticker: { maxCollectPerHour: 1 } });
    e.register(favorites({ async addCustomFace() { adds++; if (scenario === 'timeout') throw new Error('synthetic network timeout'); if (scenario === 'cancel') controller.abort(new Error('cancel after add')); return { emojiId: 'ACK231' }; },
      async modifyCustomFace() { notes++; return { ok: scenario !== 'note' }; } }));
    const rename = fs.renameSync;
    if (scenario === 'index') fs.renameSync = (from, to) => { if (to === path.join(e.dataDir, 'stickers.json')) throw new Error('index fault231'); return rename(from, to); };
    let result;
    try { result = await e.manager.collectIntoQQ({ file: image, buffer: png, desc: 'note', signal: controller.signal }); }
    finally { fs.renameSync = rename; }
    assert.equal(e.disk(), null);
    if (scenario === 'index') { assert.equal(result.ok, true); assert.match(result.indexFailed, /index fault/); }
    else { assert.equal(result.ok, false); assert.equal(result.code, scenario === 'note' ? 'QQ_EMOJI_NOTE_FAILED' : scenario === 'cancel' ? 'QQ_EMOJI_CANCELLED' : 'QQ_EMOJI_ADD_FAILED'); }
    if (scenario === 'timeout') assert.match(result.error, /结果未知.*保守计入/);
    await tick(); assert.equal((await e.manager.collectIntoQQ({ file: image, buffer: png })).code, 'QQ_EMOJI_RATE_LIMIT');
    assert.equal(adds, 1); assert.equal(notes, scenario === 'note' || scenario === 'index' ? 1 : 0);
  });
});

test('old compatible quota normalization is bounded for zero, negative, fractional, invalid and nonfinite values', async t => {
  for (const [value, allowed] of [[0, 10], [-1, 1], [1.2, 2], ['bad', 10], [Infinity, 10]]) await t.test(String(value), async st => {
    const e = await fixture(st); let adds = 0;
    e.register(favorites({ async addCustomFace() { return { emojiId: 'NORMAL' + ++adds }; } }));
    if (value === Infinity) e.app.config.get().sticker.maxCollectPerHour = value; // defensive unsaved input only
    else e.save({ sticker: { maxCollectPerHour: value } });
    for (let i = 0; i < allowed; i++) assert.equal((await e.manager.collectIntoQQ({ file: image, buffer: png })).ok, true);
    assert.equal((await e.manager.collectIntoQQ({ file: image, buffer: png })).code, 'QQ_EMOJI_RATE_LIMIT'); assert.equal(adds, allowed);
  });
});

const loadedFavorites = `export default { setup(ctx) {
 ctx.registerCapability('qq.emoji-favorites', {
  getAccountIdentity: () => 'owned-plugin-account231',
  async fetchCustomFaceDetails() { const response = await ctx.http.fetch('https://fixture.invalid/details231'); const result = await response.json(); await ctx.capability('qa.hold231').wait(); return result; },
  async addCustomFace() { const response = await ctx.http.fetch('https://fixture.invalid/add231'); const result = await response.json(); await ctx.capability('qa.hold231').wait(); return result; },
  async modifyCustomFace() { await ctx.http.fetch('https://fixture.invalid/note231'); return {ok:true}; }
 });
 ctx.registerTool({id:'sync',name:'Sync',execute:async(args,c)=>ctx.capability('data.stickers').syncFromQQ({force:true,signal:c.signal})});
 ctx.registerTool({id:'read',name:'Read favorites',execute:async(args,c)=>ctx.capability('qq.emoji-favorites').fetchCustomFaceDetails({limit:1,signal:c.signal})});
 ctx.registerTool({id:'write',name:'Write favorites',execute:async()=>ctx.capability('qq.emoji-favorites').addCustomFace('synthetic')});
} };`;

test('actual loaded provider authorization receipts survive neither deny/allow nor revocation/disable while held', async t => {
  for (const change of ['deny-allow', 'revoke', 'disable']) for (const operation of ['sync', 'collect']) await t.test(change + ':' + operation, async st => {
    const requests = [];
    const e = await fixture(st, { pluginSource: loadedFavorites, fetchImpl: async url => { requests.push(String(url)); return new Response(JSON.stringify(String(url).includes('/add231') ? { emojiId: 'OWNED231' } : { entries: [remote('OWNED231')], complete: true })); } });
    const entry = e.app.loader.hostEntry('favorites231');
    for (const scope of ['net.outbound', 'qq.send']) assert.equal(e.app.permissions.setOverride('favorites231', scope, 'allow', { fingerprint: entry.fingerprint }), true);
    const gate = deferred(), entered = deferred(); e.app.capability.register('qa.hold231', 'kernel', { async wait() { entered.resolve(); await gate.promise; } });
    e.manager.collect({ id: 'CACHED231', source: 'qq' }); const before = e.disk();
    const pending = operation === 'sync' ? e.manager.syncFromQQ({ force: true }) : e.manager.collectIntoQQ({ file: image, buffer: png, desc: 'note' });
    await started(entered);
    if (change === 'disable') { e.save({ skills: { favorites231: { enabled: false } } }); await e.app.loader.loadAll(); }
    else if (change === 'revoke') e.app.permissions.revokePlugin('favorites231');
    else { e.app.permissions.setOverride('favorites231', 'net.outbound', 'deny', { fingerprint: entry.fingerprint }); e.app.permissions.setOverride('favorites231', 'net.outbound', 'allow', { fingerprint: entry.fingerprint }); }
    gate.resolve(); const result = await pending;
    assert.equal(result.ok === true || result.fromCache === false, false); assert.equal(e.disk(), before, 'old provider receipt cannot commit after a permission round trip');
    assert.equal(requests.some(url => url.endsWith('/note231')), false, 'old acknowledged add cannot write its ID into a newly authorized account/provider');
    if (operation === 'collect') assert.match(result.error, /已收藏|结果未知/);
  });
});

test('rich favorites SDK read needs sessions-read and network, and never borrows QQ write permission', async t => {
  const e = await fixture(t, { pluginSource: loadedFavorites }); const entry = e.app.loader.hostEntry('favorites231'); let adds = 0, details = 0;
  e.register(favorites({ async fetchCustomFaceDetails(options) { details++; assert.equal(options.limit, 1); assert.ok(options.signal); return { entries: [remote()], complete: false }; }, async addCustomFace() { adds++; return { emojiId: 'FORBIDDEN' }; } }));
  e.save({ extensions: { providers: { 'qq.emoji-favorites': 'kernel' } } });
  e.app.permissions.setOverride('favorites231', 'net.outbound', 'allow', { fingerprint: entry.fingerprint });
  assert.equal((await e.invoke('favorites231__read')).ok, false); assert.equal(details, 0);
  e.app.permissions.setOverride('favorites231', 'data.sessions.read', 'allow', { fingerprint: entry.fingerprint });
  const read = await e.invoke('favorites231__read'); assert.equal(read.ok, true); assert.equal(read.result.entries[0].id, 'REMOTE231'); assert.equal(details, 1);
  assert.equal((await e.invoke('favorites231__write')).ok, false); assert.equal(adds, 0);
});

test('collection pins account and provider through image, add and note gates; late effects never create an index', async t => {
  for (const stage of ['image', 'add', 'note']) for (const change of ['register', 'account', 'cancel', 'stop']) await t.test(stage + ':' + change, async st => {
    const e = await fixture(st), gate = deferred(), entered = deferred(), controller = new AbortController(); let account = 'A', adds = 0, notes = 0;
    const hold = async name => { if (stage === name) { entered.resolve(); await gate.promise; } };
    const provider = favorites({ getAccountIdentity: () => account,
      async addCustomFace() { adds++; await hold('add'); return { emojiId: 'HELD231' }; },
      async modifyCustomFace() { notes++; await hold('note'); return { ok: true }; },
    });
    e.register(provider); e.media({ async image() { await hold('image'); return { buffer: png }; } });
    const pending = e.manager.collectIntoQQ({ file: image, desc: 'note', signal: controller.signal }); pending.catch(() => {}); await started(entered);
    if (change === 'register') e.register(provider);
    if (change === 'account') account = 'B';
    if (change === 'cancel') controller.abort(new Error('held collect cancel'));
    if (change === 'stop') await e.app.stop();
    gate.resolve(); const result = await pending; await tick();
    assert.equal(result.ok, false); assert.equal(result.code, 'QQ_EMOJI_CANCELLED'); assert.equal(e.disk(), null);
    assert.equal(adds, stage === 'image' ? 0 : 1); assert.equal(notes, stage === 'note' ? 1 : 0);
    if (stage === 'note') assert.match(result.error, /已收藏/);
  });
});

test('actual SDK consumer revocation cancels held synchronization without a late disk commit', async t => {
  const e = await fixture(t, { pluginSource: loadedFavorites, fetchImpl: async () => new Response(JSON.stringify({ entries: [remote()], complete: false })) });
  const entry = e.app.loader.hostEntry('favorites231');
  e.app.permissions.setOverride('favorites231', 'net.outbound', 'allow', { fingerprint: entry.fingerprint });
  e.app.permissions.setOverride('favorites231', 'data.sessions.read', 'allow', { fingerprint: entry.fingerprint });
  const entered = deferred(), gate = deferred(); e.register(favorites({ async fetchCustomFaceDetails() { entered.resolve(); return gate.promise; } }));
  e.save({ extensions: { providers: { 'qq.emoji-favorites': 'kernel' } } });
  assert.equal(e.app.capability.providers('qq.emoji-favorites')[0].ownerId, 'kernel');
  const pending = e.invoke('favorites231__sync'); let observed;
  pending.then(value => { observed = value; }, error => { observed = { error: error.message }; });
  await started(entered, () => observed);
  e.app.permissions.setOverride('favorites231', 'net.outbound', 'deny', { fingerprint: entry.fingerprint });
  gate.resolve({ entries: [remote('LATE231')], complete: true });
  const result = await pending; assert.equal(result.ok === true && result.result?.fromCache === false, false);
  await tick(); assert.equal(e.disk(), null);
});

test('appended data.stickers changes actual list/prompt/collection and disabling restores the repaired default', async t => {
  for (const mode of ['appended', 'disabled']) await t.test(mode, async st => {
    const e = await fixture(st, { layerMode: mode }); let adds = 0;
    e.register(favorites({ async addCustomFace() { return { emojiId: 'DEFAULT231-' + ++adds }; } }));
    assert.equal(e.app.composition.owners['data.stickers'], mode === 'appended' ? 'stickers231' : 'defaults');
    const result = await e.list(); assert.equal(result.items.some(item => item.id === 'APPENDED231'), mode === 'appended');
    assert.equal(result.items.some(item => item.id === 'REMOTE231'), true, 'selected implementation preserves real remote sync');
    const prompt = await e.prompt(); assert.equal(prompt?.includes('APPENDED231'), mode === 'appended'); assert.ok(prompt?.includes('REMOTE231'));
    const collected = await e.collect();
    if (mode === 'appended') { assert.equal(collected.code, 'APPENDED231_POLICY'); assert.equal(adds, 0); }
    else { assert.equal(collected.ok, true); assert.equal(adds, 1); }
    const persisted = JSON.parse(e.disk()); assert.equal(persisted.some(item => item.id === 'APPENDED231'), mode === 'appended');
  });
});

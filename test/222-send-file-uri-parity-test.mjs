// Pure Node synthetic fixtures only: actual send queues, owned files and trusted
// composition layers. No listener, browser, model, QQ or installed extension.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createSendQueue, toFileUri } from '../src/kernel/send.js';
import { createApplication } from '../src/kernel/composition.js';
import { defaultComponents } from '../bundled/runtime-defaults/components.js';

const workspace = path.resolve(import.meta.dirname, '..');
const cfg = () => ({ send: { minGapMs: 200, maxGapMs: 200, byLengthMs: 0, dedupeWindowMs: 8000 } });
function environment({ send, getImage, mediaReader } = {}) {
  const calls = [], stored = [], emitted = [];
  const transport = { actions: { getImage }, async send(chatKey, segments, options) {
    const record = { chatKey, segments: structuredClone(segments), options: { replyToMessageId: options.replyToMessageId, atUserId: options.atUserId } };
    calls.push(record);
    if (send) await send(record, calls.length);
    return { msgId: 222000 + calls.length };
  } };
  const queue = createSendQueue({ cfg, transport, mediaReader, log: {}, store: { appendSelf: (chatKey, entry) => stored.push({ chatKey, entry }) }, bus: { emit: (...args) => emitted.push(args) } });
  return { queue, calls, stored, emitted };
}

test('file URI parity reaches real queues, fallbacks, cancellation and replaceable core.send', { timeout: 15000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa222-send-uri-'));
  const nativeFetch = globalThis.fetch, nativeSpawn = childProcess.spawn;
  let externalRequests = 0, nativeProcessStarts = 0;
  globalThis.fetch = async () => { externalRequests++; throw new Error('222 fixture forbids network'); };
  childProcess.spawn = () => { nativeProcessStarts++; throw new Error('222 fixture forbids native processes'); };
  syncBuiltinESMExports();
  t.after(() => {
    globalThis.fetch = nativeFetch; childProcess.spawn = nativeSpawn; syncBuiltinESMExports();
    const target = path.resolve(root);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('qqa222-send-uri-'));
    fs.rmSync(target, { recursive: true, force: true });
    assert.equal(externalRequests, 0); assert.equal(nativeProcessStarts, 0);
  });

  // Exact goldens from the checked 0.4 behavior; no reference checkout is needed
  // at test runtime. Raw path percent signs and preexisting URI escapes differ.
  const matrix = [
    ['empty', '', ''], ['null', null, ''], ['spaces-only', '  ', ''],
    ['windows', 'C:\\synthetic\\a.png', 'file:///C:/synthetic/a.png'],
    ['forward', 'C:/synthetic/a.png', 'file:///C:/synthetic/a.png'],
    ['existing-lowercase', 'file:///C:/synthetic/a.png', 'file:///C:/synthetic/a.png'],
    ['existing-uppercase', 'FILE:///C:/synthetic/a.png', 'FILE:///C:/synthetic/a.png'],
    ['existing-mixed', 'FiLe:///C:/synthetic/a%20b.png', 'FiLe:///C:/synthetic/a%20b.png'],
    ['existing-uri-encoded', 'file:///C:/synthetic/a%23b%3Fc%25.png', 'file:///C:/synthetic/a%23b%3Fc%25.png'],
    ['literal-percent', 'C:/synthetic/a%20b%.png', 'file:///C:/synthetic/a%2520b%25.png'],
    ['space-unicode', 'C:/synthetic dir/猫.png', 'file:///C:/synthetic%20dir/%E7%8C%AB.png'],
    ['reserved', 'C:/synthetic/a#b?.png', 'file:///C:/synthetic/a%23b%3F.png'],
    ['unc-backslash', '\\\\synthetic-host\\share\\a#b?.png', 'file://synthetic-host/share/a%23b%3F.png'],
    ['unc-forward', '//synthetic-host/share/猫 %?.png', 'file://synthetic-host/share/%E7%8C%AB%20%25%3F.png'],
    ['relative', 'synthetic/a.png', 'file:///synthetic/a.png'],
    ['absolute-posix', '/synthetic/a.png', 'file:///synthetic/a.png'],
    ['trim', ' C:/synthetic/a.png ', 'file:///C:/synthetic/a.png'],
  ];
  for (const [name, input, expected] of matrix) await t.test(`URI golden and actual image/sticker transport: ${name}`, async () => {
    assert.equal(toFileUri(input), expected);
    if (typeof input !== 'string' || !input.trim()) return;
    assert.equal(toFileUri(expected), expected, 'an output URI remains idempotent');
    const image = environment();
    assert.equal((await image.queue.sendImage('group:222-matrix', { file: input })).ok, true);
    assert.deepEqual(image.calls[0].segments, [{ type: 'image', file: expected }]);
    const sticker = environment();
    assert.equal((await sticker.queue.sendSticker('group:222-matrix', { localPath: input })).ok, true);
    assert.deepEqual(sticker.calls[0].segments, [{ type: 'image', file: expected }]);
    if (name === 'unc-backslash') {
      const uri = new URL(image.calls[0].segments[0].file);
      assert.equal(uri.pathname, '/share/a%23b%3F.png');
      assert.equal(uri.search, ''); assert.equal(uri.hash, '');
    }
  });

  await t.test('file rejection falls back once, records success once and dedupes the logical image', async () => {
    const f = environment({ send: (_record, count) => { if (count === 1) throw new Error('synthetic file rejection'); } });
    const image = { file: 'C:/synthetic/a#b?.png', dataUrl: 'data:image/png;base64,YQ==' };
    const sent = await f.queue.sendImage('group:2221', image, { replyToMessageId: '222', atUserId: '222', note: 'synthetic note' });
    assert.equal(sent.ok, true);
    assert.deepEqual(f.calls.map(call => call.segments.find(part => part.type === 'image').file), ['file:///C:/synthetic/a%23b%3F.png', 'base64://YQ==']);
    assert.ok(f.calls.every(call => call.options.replyToMessageId === '222' && call.options.atUserId === '222'));
    assert.ok(f.calls.every(call => call.segments.some(part => part.type === 'at' && part.id === '222') && call.segments.some(part => part.type === 'text' && part.text === 'synthetic note')));
    assert.equal(f.stored.length, 1); assert.equal(f.emitted.length, 1);
    assert.equal((await f.queue.sendImage('group:2221', image)).deduped, true);
    assert.equal(f.calls.length, 2);
  });

  await t.test('total failure never marks the image as delivered or prevents a later retry', async () => {
    let fail = true;
    const f = environment({ send: () => { if (fail) throw new Error('synthetic total failure'); } });
    const image = { file: 'C:/synthetic/failed.png', base64: 'YQ==' };
    await assert.rejects(f.queue.sendImage('group:2222', image), /synthetic total failure/);
    assert.equal(f.stored.length, 0); assert.equal(f.emitted.length, 0);
    fail = false;
    assert.equal((await f.queue.sendImage('group:2222', image)).ok, true);
    assert.equal(f.calls.length, 3); assert.equal(f.stored.length, 1);
  });

  await t.test('sticker cache fallback converts the real getImage result including UNC delimiters', async () => {
    let resolveCalls = 0;
    const f = environment({ send: (_record, count) => { if (count === 1) throw new Error('synthetic local rejection'); }, getImage: async fileId => {
      resolveCalls++; assert.equal(fileId, 'synthetic-id'); return { file: '\\\\synthetic-host\\cache\\猫 #?.png' };
    } });
    assert.equal((await f.queue.sendSticker('group:2223', { localPath: 'C:/synthetic/local.png', fileId: 'synthetic-id' })).ok, true);
    assert.equal(resolveCalls, 1);
    assert.deepEqual(f.calls.map(call => call.segments[0].file), ['file:///C:/synthetic/local.png', 'file://synthetic-host/cache/%E7%8C%AB%20%23%3F.png']);
  });

  await t.test('sticker disk fallback reads only the owned filename and sends its exact bytes', async () => {
    const local = path.join(root, '猫 # %.png'), bytes = Buffer.from('synthetic local bytes');
    fs.writeFileSync(local, bytes);
    const f = environment({ send: record => { if (!record.segments[0].file.startsWith('base64://')) throw new Error('synthetic URI rejection'); } });
    assert.equal((await f.queue.sendSticker('group:2224', { localPath: local })).ok, true);
    assert.deepEqual(f.calls.map(call => call.segments[0].file), [pathToFileURL(local).href, `base64://${bytes.toString('base64')}`]);
    assert.equal(f.stored.length, 1);
  });

  await t.test('queued abort sends neither file nor fallback and leaves a later identical send usable', async () => {
    let release, enter;
    const entered = new Promise(resolve => { enter = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    const controller = new AbortController();
    const f = environment({ send: async (_record, count) => { if (count === 1) { enter(); await held; } } });
    const first = f.queue.sendImage('group:2225', { file: 'C:/synthetic/one.png' });
    await entered;
    const queued = f.queue.sendImage('group:2225', { file: 'C:/synthetic/two.png', base64: 'YQ==' }, { signal: controller.signal });
    const rejection = assert.rejects(queued, /中止/);
    controller.abort('synthetic queued cancel'); release();
    assert.equal((await first).ok, true); await rejection;
    assert.equal(f.calls.length, 1);
    assert.equal((await f.queue.sendImage('group:2225', { file: 'C:/synthetic/two.png', base64: 'YQ==' })).ok, true);
    assert.equal(f.calls.length, 2);
  });

  await t.test('abort after primary rejection prevents trying the base64 candidate', async () => {
    const controller = new AbortController();
    const f = environment({ send: () => { controller.abort('synthetic rejection cancellation'); throw new Error('synthetic primary rejected'); } });
    await assert.rejects(f.queue.sendImage('group:2226', { file: 'C:/synthetic/abort.png', base64: 'YQ==' }, { signal: controller.signal }), /中止/);
    assert.equal(f.calls.length, 1); assert.equal(f.stored.length, 0);
  });

  await t.test('a preaborted sticker performs no physical send, cache lookup or download', async () => {
    let reads = 0, cacheReads = 0;
    const f = environment({ getImage: () => { cacheReads++; throw new Error('must not query'); }, mediaReader: { image() { reads++; throw new Error('must not download'); } } });
    const controller = new AbortController(); controller.abort('synthetic prior cancellation');
    await assert.rejects(f.queue.sendSticker('group:2227', { localPath: 'C:/synthetic/never.png', fileId: 'never' }, { signal: controller.signal }), /中止/);
    assert.equal(f.calls.length, 0); assert.equal(reads, 0); assert.equal(cacheReads, 0);
  });

  await t.test('uppercase existing file URI falls back through fileURLToPath to actual owned disk', async () => {
    const local = path.join(root, 'uppercase-uri.png'), bytes = Buffer.from('synthetic uppercase uri fallback');
    fs.writeFileSync(local, bytes);
    const upperURI = pathToFileURL(local).href.replace(/^file:/, 'FILE:');
    const f = environment({ send: record => { if (!record.segments[0].file.startsWith('base64://')) throw new Error('synthetic URI rejection'); } });
    assert.equal((await f.queue.sendSticker('group:222-upper', { localPath: upperURI })).ok, true);
    assert.deepEqual(f.calls.map(call => call.segments[0].file), [upperURI, 'base64://' + bytes.toString('base64')]);
    assert.equal(f.stored.length, 1);
  });

  await t.test('actual core.send consumes an appended factory and disabling it restores the default', async () => {
    const appRoot = path.join(root, 'synthetic-app');
    for (const directory of ['bundled', 'skills', 'plugins', 'overrides/20-send']) fs.mkdirSync(path.join(appRoot, directory), { recursive: true });
    fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
    const layer = path.join(appRoot, 'overrides/20-send');
    // One independently added factory changes the image supplied to the actual
    // queue. Neither the default registry nor kernel integration is edited.
    fs.writeFileSync(path.join(layer, 'send.mjs'), `import {createSendQueue} from ${JSON.stringify(pathToFileURL(path.join(workspace, 'src/kernel/send.js')).href)};
export default options => {
  const queue=createSendQueue(options), original=queue.sendImage;
  queue.sendImage=(chatKey,image,sendOptions)=>original(chatKey,{...image,file:'C:/appended/猫 #?.png'},sendOptions);
  return queue;
};`);
    const manifest = { version: 1, id: 'send-uri-fixture', components: { 'core.send': './send.mjs' } };
    for (const mode of ['default', 'appended', 'disabled']) {
      if (mode !== 'default') fs.writeFileSync(path.join(layer, 'composition.json'), JSON.stringify({ ...manifest, enabled: mode !== 'disabled' }));
      const calls = []; let starts = 0, stops = 0;
      const app = await createApplication({ appRoot, env: { QQ_AGENT_DATA_DIR: path.join(appRoot, `data-${mode}`), QQ_AGENT_MIGRATE_FROM: path.join(root, 'absent') },
        components: { 'runtime.logger': args => defaultComponents['runtime.logger']({ ...args, mirrorConsole: false }) },
        transport: { id: 'inert-222', start() { starts++; }, stop() { stops++; }, actions: {}, send(chatKey, segments) { calls.push({ chatKey, segments: structuredClone(segments) }); return { msgId: 222 }; } },
        priceUpdates: { resolve() { return null; }, refresh: async () => ({ ok: true, remote: false }) }, fetchImpl: globalThis.fetch,
      });
      try {
        app.config.update({ telemetry: { enabled: false }, proactive: { enabled: false }, memory: { consolidateEnabled: false }, });
        assert.deepEqual(app.loader.listEntries(), []);
        await app.services.start();
        assert.equal((await app.send.sendImage('group:222-composition', { file: 'FILE:///C:/synthetic.png' })).ok, true);
        const expected = mode === 'appended' ? 'file:///C:/appended/%E7%8C%AB%20%23%3F.png' : 'FILE:///C:/synthetic.png';
        assert.deepEqual(calls, [{ chatKey: 'group:222-composition', segments: [{ type: 'image', file: expected }] }]);
        assert.equal(app.composition.owners['core.send'], mode === 'appended' ? 'send-uri-fixture' : 'defaults');
        assert.equal(app.httpServer.port, null, 'kernel start/listen is never used');
        assert.deepEqual(app.loader.listEntries(), []);
      } finally { await app.stop(); }
      assert.equal(starts, 1); assert.equal(stops, 1);
    }
  });
});

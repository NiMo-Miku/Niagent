import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKernel } from '../src/kernel/kernel.js';
import { defaultComponents } from '../bundled/runtime-defaults/components.js';

export async function verifyDefaultMediaPolicy() {
  const forward = defaultComponents['core.media.forward'];
  let generation = 1, active = true, claims = 0;
  let answer = { ownerId: 'fixture', result: { segments: [{ type: 'text', text: 'fixture media' }] } };
  const sent = [];
  const context = {
    runtimeState: () => ({ active, generation }), cfg: () => ({ marker: 'fixture-config' }),
    capability: { claimAsync: async (name, args) => { claims++; assert.equal(name, 'media.download'); assert.equal(args.cfg.marker, 'fixture-config'); return answer; } },
    send: { sendSegments: async (...args) => { sent.push(args); return { sent: [{ msgId: sent.length }] }; } },
  };
  assert.deepEqual(await forward('group:58', { text: 'ordinary text https://example.invalid/' }, context), { claimed: false });
  assert.equal(claims, 0, 'unrelated text does not claim a platform media provider');
  for (const host of ['bilibili.com', 'b23.tv', 'douyin.com', 'v.douyin.com']) {
    const result = await forward('group:58', { text: `https://${host}/fixture` }, context);
    assert.equal(result.sent, true, `${host} reaches the default consumer`);
    assert.equal(result.ownerId, 'fixture');
    assert.equal(sent.at(-1)[0], 'group:58');
    assert.deepEqual(sent.at(-1)[1], answer.result.segments);
    assert.equal(sent.at(-1)[2].source, 'media.download');
  }
  answer = null;
  assert.deepEqual(await forward('group:58', { text: 'https://b23.tv/no-provider' }, context), { claimed: false, reason: 'no-provider' });
  assert.equal(sent.length, 4, 'no-provider fallback emits nothing');
  answer = { ownerId: 'fixture', result: { segments: [] } };
  assert.equal((await forward('group:58', { text: 'https://b23.tv/empty' }, context)).reason, 'provider-empty');
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  context.capability.claimAsync = () => pending;
  const late = forward('group:58', { text: 'https://b23.tv/late' }, context);
  generation++; active = false;
  resolve({ ownerId: 'fixture', result: { segments: [{ type: 'text', text: 'must not send' }] } });
  assert.equal((await late).reason, 'stopped');
  assert.equal(sent.length, 4, 'a completed claim cannot send into a stopped generation');
}

export async function verifySelectedMediaConsumer() {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-media-consumer-'));
  const sent = [];
  let callbacks, selected = 0, completed = false;
  const kernel = createKernel({
    appRoot, env: { QQ_AGENT_DATA_DIR: path.join(appRoot, 'data'), QQ_AGENT_MIGRATE_FROM: path.join(appRoot, 'absent-source') },
    priceUpdates: { refresh: async () => ({ ok: true }), updateCheck: async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },
    transport: {
      id: 'offline-media-fixture', selfId: '5900', actions: {},
      bind: value => { callbacks = value; }, start() { callbacks.onStatus({ connected: true, selfId: '5900' }); }, stop() {},
      send(chatKey, segments) { sent.push({ chatKey, segments }); return { msgId: 5901 }; },
      toPlatformSegments: segments => segments,
    },
    fetchImpl: () => { throw new Error('fixture forbids external services'); },
    components: {
      'runtime.logger': args => defaultComponents['runtime.logger']({ ...args, mirrorConsole: false }),
      'runtime.http': args => ({ ...defaultComponents['runtime.http'](args), listen: async () => 48059 }),
      'runtime.plugins': args => {
        const loader = defaultComponents['runtime.plugins'](args);
        loader.startWatchers = () => {};
        return loader;
      },
      'core.media.forward': async (chatKey, entry, context) => {
        selected++;
        const result = await defaultComponents['core.media.forward'](chatKey, { ...entry, text: 'https://b23.tv/selected-policy' }, context);
        completed = true;
        return result;
      },
    },
  });
  try {
    kernel.config.update({ allowAllWhenEmpty: true, api: { model: '' }, proactive: { enabled: false }, send: { dedupeWindowMs: 0 } });
    kernel.capability.register('media.download', 'kernel', () => ({ segments: [{ type: 'text', text: 'selected policy result' }] }));
    await kernel.start();
    callbacks.onEvent({ kind: 'group', id: '59', type: 'message', event: {
      message_id: 5900, user_id: '5901', sender: { nickname: 'fixture' }, message: [{ type: 'text', data: { text: 'ordinary incoming text' } }],
    } });
    for (let i = 0; i < 100 && !completed; i++) await new Promise(setImmediate);
    assert.equal(completed, true);
    assert.equal(selected, 1, 'the provider event uses the selected core.media.forward hook');
    assert.deepEqual(sent, [{ chatKey: 'group:59', segments: [{ type: 'text', text: 'selected policy result' }] }]);
    assert.ok(kernel.store.recent('group:59', 10).some(entry => entry.self && entry.text === 'selected policy result'), 'actual SendQueue persists the forwarded output');
  } finally {
    await kernel.stop();
    const target = path.resolve(appRoot);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('qqa-media-consumer-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
}

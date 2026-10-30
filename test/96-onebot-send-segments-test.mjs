// Real OneBot provider/client -> controlled local HTTP, through the real queue/store.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { getEventListeners } from 'node:events';
import { createOneBotProvider } from '../src/transports/onebot/provider.js';
import { createSendQueue } from '../src/kernel/send.js';
import { createChatStore } from '../src/kernel/store.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function within(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('controlled OneBot operation did not settle')), 3000);
    })]);
  } finally { clearTimeout(timer); }
}

async function fixture(t, { maxPerMinute = 80 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-onebot-send96-'));
  const requests = [], sentEvents = [], heldResponses = new Map();
  let reply = { status: 200, body: { status: 'ok', retcode: 0, data: { message_id: -96 } } };
  const server = http.createServer(async (request, response) => {
    let text = ''; for await (const part of request) text += part;
    requests.push({ action: new URL(request.url, 'http://127.0.0.1').pathname.slice(1), body: JSON.parse(text) });
    const held = heldResponses.get(requests.length);
    if (held) {
      response.once('close', () => held.closed.resolve({ acknowledged: response.writableEnded }));
      held.arrived.resolve(requests.at(-1));
      await held.released.promise;
    }
    try {
      if (!response.destroyed) {
        response.writeHead(reply.status, { 'content-type': 'application/json' }); response.end(JSON.stringify(reply.body));
      }
    } finally { held?.finished.resolve(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const log = { info() {}, warn() {}, error() {} };
  const provider = createOneBotProvider({ cfg: () => ({ onebot: { httpUrl: `http://127.0.0.1:${server.address().port}`, wsUrl: 'ws://127.0.0.1:1' } }), log });
  const store = createChatStore({ dataDir: root, log });
  const queue = createSendQueue({ transport: provider, store, log,
    bus: { emit(event, payload) { if (event === 'message.sent') sentEvents.push(payload); } },
    cfg: () => ({ send: { minGapMs: 0, maxGapMs: 0, byLengthMs: 0, maxPerMinute, maxPerHour: 500, dedupeWindowMs: 8000 } }),
  });
  t.after(async () => {
    for (const held of heldResponses.values()) held.released.resolve();
    await provider.stop(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true });
  });
  return { provider, queue, store, requests, sentEvents,
    holdResponse(number = requests.length + 1) {
      assert.ok(Number.isInteger(number) && number > requests.length && !heldResponses.has(number));
      const held = { arrived: deferred(), released: deferred(), closed: deferred(), finished: deferred() };
      heldResponses.set(number, held);
      return { arrived: held.arrived.promise, closed: held.closed.promise, finished: held.finished.promise, release: held.released.resolve };
    },
    respond: (body, status = 200) => { reply = { body, status }; } };
}

test('video reaches real OneBot HTTP and the queue archives only the confirmed delivery', async (t) => {
  const f = await fixture(t);
  const segments = [{ type: 'video', url: 'http://127.0.0.1/fixture.mp4' }];
  const result = await f.queue.sendSegments('group:10001', segments);
  assert.equal(result.ok, true); assert.equal(result.sent[0].msgId, -96);
  assert.deepEqual(f.requests[0], { action: 'send_group_msg', body: { group_id: 10001, message: [{ type: 'video', data: { file: segments[0].url } }] } });
  assert.deepEqual(f.store.recent('group:10001', 1)[0].media, segments);
  assert.equal(f.provider.segmentSupport.video, true); assert.equal(f.provider.segmentSupport.file, true);
});

test('flat segments map supported message types in order, including JSON cards and protocol file/forward extensions', async (t) => {
  const f = await fixture(t);
  const card = { app: 'qa.card', data: { cardField: 'data is part of this card' }, meta: { title: 'local fixture' } };
  const segments = [
    { type: 'text', text: 'literal [CQ:at,qq=8]' }, { type: 'at', id: 'all' },
    { type: 'image', url: 'http://127.0.0.1/a.png', summary: 'image', cache: 0 }, { type: 'face', id: 0 },
    { type: 'record', file: 'base64://YQ==', magic: 1 }, { type: 'video', file: 'file:///C:/fixture.mp4', thumb: 'http://127.0.0.1/thumb.png' },
    { type: 'reply', msgId: '-9007199254740993' }, { type: 'json', data: card },
    { type: 'forward', id: 'fixture-forward-resource' }, { type: 'file', url: 'http://127.0.0.1/a.zip', name: '资料.zip' },
  ];
  const before = structuredClone(segments);
  assert.deepEqual(await f.provider.send('qq:private:20001', segments), [{ msgId: -96 }]);
  const { action, body } = f.requests[0]; assert.equal(action, 'send_private_msg'); assert.equal(body.user_id, 20001);
  assert.deepEqual(body.message, [
    { type: 'text', data: { text: 'literal [CQ：at,qq=8]' } }, { type: 'at', data: { qq: 'all' } },
    { type: 'image', data: { file: 'http://127.0.0.1/a.png', summary: 'image', cache: 0 } }, { type: 'face', data: { id: '0' } },
    { type: 'record', data: { file: 'base64://YQ==', magic: 1 } }, { type: 'video', data: { file: 'file:///C:/fixture.mp4', thumb: 'http://127.0.0.1/thumb.png' } },
    { type: 'reply', data: { id: '-9007199254740993' } }, { type: 'json', data: { data: JSON.stringify(card) } },
    { type: 'forward', data: { id: 'fixture-forward-resource' } }, { type: 'file', data: { file: 'http://127.0.0.1/a.zip', name: '资料.zip' } },
  ]);
  assert.deepEqual(segments, before, 'conversion does not mutate caller segments');
});

test('native OneBot segments retain payload and supported send options instead of becoming empty or undefined', async (t) => {
  const f = await fixture(t);
  const segments = [
    { type: 'text', data: { text: 'native [cq:at,qq=2]' } }, { type: 'at', data: { qq: '20001' } },
    { type: 'image', data: { file: 'base64://Yg==', type: 'flash', summary: 'native', cache: false, timeout: 15 } },
    { type: 'face', data: { id: '123' } }, { type: 'record', data: { url: 'http://127.0.0.1/a.mp3', magic: false } },
    { type: 'video', data: { file: 'http://127.0.0.1/a.mp4', thumb: 'file:///C:/thumb.png', cache: 0 } },
    { type: 'reply', data: { id: '-7' } }, { type: 'json', data: { data: '{"app":"native"}' } },
    { type: 'forward', data: { id: 'native-resource' } }, { type: 'file', data: { file: 'file:///C:/资料.zip', name: '资料.zip' } },
  ];
  await f.provider.send('group:10001', segments);
  assert.equal(f.requests[0].body.message.length, segments.length);
  assert.deepEqual(f.requests[0].body.message, segments.map((segment) => {
    const data = structuredClone(segment.data);
    if (segment.type === 'text') data.text = 'native [CQ：at,qq=2]';
    if (segment.type === 'record') { data.file = data.url; delete data.url; }
    return { type: segment.type, data };
  }));
});

test('unknown, malformed, empty and reply-only content fails before any HTTP request, including mixed valid/invalid content', async (t) => {
  const f = await fixture(t);
  const invalid = [[], [null], [{ type: 'unimplemented', data: {} }], [{ type: 'video' }], [{ type: 'file', name: 'missing file' }],
    [{ type: 'json', data: '{broken' }], [{ type: 'forward', id: '' }], [{ type: 'at', id: 'not-an-id' }],
    [{ type: 'reply', id: 0 }], [{ type: 'reply', id: -7 }], [{ type: 'text', text: '' }],
    [{ type: 'text', text: 'should not leak as a partial send' }, { type: 'unsupported' }],
  ];
  for (const segments of invalid) await assert.rejects(f.provider.send('group:10001', segments), /消息|段|OneBot/);
  for (const chatKey of ['bad-key', 'tg:group:10001', 'group:NaN', 'private:0', 'group:9007199254740993']) {
    await assert.rejects(f.provider.send(chatKey, [{ type: 'text', text: 'bad target' }]), /会话|chatKey|OneBot/);
  }
  assert.equal(f.requests.length, 0);
  assert.equal(f.store.recent('group:10001', 20).length, 0);
});

test('missing or invalid message_id cannot mark a failed delivery as sent, consume quota, or poison dedupe', async (t) => {
  const f = await fixture(t, { maxPerMinute: 1 });
  const segments = [{ type: 'video', url: 'http://127.0.0.1/retry.mp4' }];
  for (const messageId of [undefined, null, 0, '', 'not-a-message-id', 1.5]) {
    f.respond({ status: 'ok', retcode: 0, data: messageId === undefined ? {} : { message_id: messageId } });
    await assert.rejects(f.queue.sendSegments('group:10001', segments), /message_id/);
    assert.equal(f.store.recent('group:10001', 20).length, 0);
  }
  f.respond({ status: 'ok', retcode: 0, data: { message_id: '-9007199254740993' } });
  assert.equal((await f.queue.sendSegments('group:10001', segments)).sent[0].msgId, '-9007199254740993');
  assert.equal(f.store.recent('group:10001', 20).length, 1);
  const requests = f.requests.length;
  assert.equal((await f.queue.sendSegments('group:10001', segments)).deduped, true);
  assert.equal(f.requests.length, requests, 'only a confirmed success enters dedupe');
  await assert.rejects(f.queue.sendSegments('group:10001', [{ type: 'video', url: 'http://127.0.0.1/other.mp4' }]), /每分钟上限 1/);
});

test('protocol rejection and HTTP failure propagate even when the envelope contains a plausible message ID', async (t) => {
  const f = await fixture(t);
  const segments = [{ type: 'file', file: 'http://127.0.0.1/a.txt', name: 'a.txt' }];
  for (const body of [
    { status: 'failed', retcode: 100, wording: 'file unsupported', data: { message_id: 77 } },
    { status: 'ok', retcode: 100, wording: 'file unsupported', data: { message_id: 77 } },
    { status: 'async', retcode: 1, data: { message_id: 77 } },
  ]) {
    f.respond(body); await assert.rejects(f.queue.sendSegments('private:20001', segments), /失败|retcode|确认/);
  }
  f.respond({ error: 'fixture network failure' }, 503);
  await assert.rejects(f.queue.sendSegments('private:20001', segments), /HTTP 503/);
  assert.equal(f.store.recent('private:20001', 20).length, 0);
  f.respond({ status: 'ok', retcode: 0, data: { message_id: 78 } });
  assert.equal((await f.queue.sendSegments('private:20001', segments)).sent[0].msgId, 78);
});

test('reply option uses the signed ID without precision loss and empty option adds no reply segment', async (t) => {
  const f = await fixture(t);
  await f.provider.send('group:10001', [{ type: 'text', text: 'reply' }], { replyToMessageId: '-9007199254740993' });
  assert.deepEqual(f.requests[0].body.message[0], { type: 'reply', data: { id: '-9007199254740993' } });
  await f.provider.send('group:10001', [{ type: 'text', text: 'no reply' }], { replyToMessageId: '' });
  assert.deepEqual(f.requests[1].body.message, [{ type: 'text', data: { text: 'no reply' } }]);
  await assert.rejects(f.provider.send('group:10001', [{ type: 'text', text: 'bad reply' }], { replyToMessageId: 'not-an-id' }), /reply|引用|消息段/);
  assert.equal(f.requests.length, 2);
});

test('cancellation: already-aborted provider sends make no HTTP request for either chat kind', async t => {
  const f = await fixture(t), controller = new AbortController();
  controller.abort(new Error('synthetic caller cancellation'));
  for (const chatKey of ['group:10001', 'private:20001']) {
    await assert.rejects(f.provider.send(chatKey, [{ type: 'text', text: 'never start' }], { signal: controller.signal }),
      error => error.name === 'AbortError' && error.__aborted === true);
  }
  assert.equal(f.requests.length, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

for (const scenario of [
  { name: 'group text', chatKey: 'group:10001', action: 'send_group_msg',
    send: (f, options) => f.queue.sendTextBatch('group:10001', 'retryable cancelled text', options) },
  { name: 'private image with fallback', chatKey: 'private:20001', action: 'send_private_msg',
    send: (f, options) => f.queue.sendImage('private:20001', { url: 'http://127.0.0.1/cancelled.png', dataUrl: 'data:image/png;base64,YQ==' }, options) },
]) test(`cancellation: in-flight ${scenario.name} closes HTTP without archiving, charging quota or poisoning retry`, async t => {
  const f = await fixture(t, { maxPerMinute: 1 }), held = f.holdResponse(), controller = new AbortController();
  const pending = scenario.send(f, { signal: controller.signal }).then(value => ({ value }), error => ({ error }));
  assert.equal((await within(held.arrived)).action, scenario.action);
  controller.abort(new Error('synthetic caller cancellation'));
  const outcome = await within(pending);
  assert.match(outcome.error?.message ?? '', /已取消|已中止/);
  assert.equal(outcome.value, undefined);
  assert.equal((await within(held.closed)).acknowledged, false, 'the real client cancels the unacknowledged HTTP request');
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  held.release(); await within(held.finished);
  assert.equal(f.requests.length, 1, 'cancellation cannot start an image fallback');
  assert.equal(f.store.recent(scenario.chatKey, 20).length, 0);
  assert.equal(f.sentEvents.length, 0);

  const retried = await scenario.send(f, { signal: new AbortController().signal });
  assert.equal(retried.ok, true); assert.equal(retried.sent.length, 1);
  assert.equal(f.requests.length, 2, 'the cancelled attempt consumed neither dedupe nor the one-message quota');
  assert.equal(f.store.recent(scenario.chatKey, 20).length, 1); assert.equal(f.sentEvents.length, 1);
  assert.equal((await scenario.send(f, {})).deduped, true);
  assert.equal(f.requests.length, 2, 'only the successful retry enters dedupe');
});

test('cancellation: a partial batch keeps confirmed delivery and cancels the current and remaining messages', async t => {
  const f = await fixture(t), held = f.holdResponse(2), controller = new AbortController();
  const pending = f.queue.sendTextBatch('group:10001', ['confirmed first', 'cancelled second', 'never third'], { signal: controller.signal });
  // Attach handlers before abort so a regression cannot leave an unhandled rejection.
  const observed = pending.then(value => ({ value }), error => ({ error }));
  await within(held.arrived); controller.abort(new Error('synthetic partial-batch cancellation'));
  const outcome = await within(observed);
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.value.ok, false); assert.equal(outcome.value.aborted, true);
  assert.deepEqual(outcome.value.sent.map(item => item.text), ['confirmed first']);
  assert.equal(outcome.value.failed[0].index, 1);
  assert.equal((await within(held.closed)).acknowledged, false);
  held.release(); await within(held.finished);
  assert.equal(f.requests.length, 2, 'the third message never reaches the protocol');
  assert.deepEqual(f.store.recent('group:10001', 20).map(item => item.text), ['confirmed first']);
  assert.equal(f.sentEvents.length, 1);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal((await f.queue.sendTextBatch('group:10001', 'cancelled second')).ok, true);
  assert.equal(f.requests.length, 3, 'unconfirmed cancelled content remains retryable');
});

test('cancellation: a queued cancelled send does not cancel or block a different healthy send', async t => {
  const f = await fixture(t), held = f.holdResponse(), controller = new AbortController();
  const healthy = f.queue.sendTextBatch('group:10001', 'healthy first').then(value => ({ value }), error => ({ error }));
  await within(held.arrived);
  const cancelled = f.queue.sendTextBatch('group:10001', 'cancelled while queued', { signal: controller.signal })
    .then(value => ({ value }), error => ({ error }));
  controller.abort(new Error('synthetic queued cancellation'));
  held.release();
  const first = await within(healthy), second = await within(cancelled);
  assert.equal(first.error, undefined); assert.equal(first.value.ok, true);
  assert.match(second.error?.message ?? '', /已中止/);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.store.recent('group:10001', 20).map(item => item.text), ['healthy first']);
  assert.equal((await f.queue.sendTextBatch('group:10001', 'healthy after cancellation')).ok, true);
  assert.equal(f.requests.length, 2);
});

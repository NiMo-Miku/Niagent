import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSendQueue } from '../src/kernel/send.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { sessionTelemetryTotals } from '../src/kernel/telemetry.js';
import { createOneBotProvider } from '../src/transports/onebot/provider.js';

const temporary = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-repair77-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

function sender({ limit = 80, fail = () => false, onSent } = {}) {
  const actual = [];
  const queue = createSendQueue({
    cfg: () => ({ send: { minGapMs: 200, maxGapMs: 200, byLengthMs: 0, maxPerMinute: limit, maxPerHour: 500, dedupeWindowMs: 8000 } }),
    log: {}, onSent,
    transport: { async send(chatKey, segments) {
      if (fail(segments)) throw new Error('fixture send failed');
      actual.push({ chatKey, segments });
      return { msgId: actual.length };
    } },
  });
  return { queue, actual };
}

test('each delivered item consumes quota, including partial batches and media', async () => {
  const { queue, actual } = sender({ limit: 1 });
  const batch = await queue.sendTextBatch('group:1', ['a', 'b', 'c']);
  assert.equal(batch.ok, false);
  assert.equal(batch.sent.length, 1);
  assert.match(batch.failed[0].error, /每分钟上限 1/);
  assert.equal(actual.length, 1);
  const media = [{ type: 'video', url: 'https://example.com/a.mp4' }];
  await queue.sendSegments('group:2', media);
  await assert.rejects(queue.sendSegments('group:2', [{ type: 'video', url: 'https://example.com/b.mp4' }]), /每分钟上限 1/);
  assert.equal((await queue.sendSegments('group:2', media)).deduped, true);
});

test('concurrent sends dedupe inside their serialized queue; duplicate batch entries also skip', async () => {
  const { queue, actual } = sender();
  const results = await Promise.all([queue.sendTextBatch('group:1', 'same'), queue.sendTextBatch('group:1', 'same')]);
  assert.equal(actual.length, 1);
  assert.equal(results.filter((r) => r.deduped).length, 1);
  await queue.sendTextBatch('group:2', ['repeat', 'repeat']);
  assert.equal(actual.filter((x) => x.chatKey === 'group:2').length, 1);
  const image = { url: 'https://example.com/a.png' };
  await Promise.all([queue.sendImage('group:3', image), queue.sendImage('group:3', image)]);
  assert.equal(actual.filter((x) => x.chatKey === 'group:3').length, 1);
});

test('partial success is accounted immediately; failed content can still retry', async () => {
  let failOnce = true;
  const { queue, actual } = sender({ limit: 2, fail: (segments) => {
    if (segments[0].text === 'b' && failOnce) { failOnce = false; return true; }
    return false;
  } });
  const first = await queue.sendTextBatch('group:1', ['a', 'b']);
  assert.equal(first.sent.length, 1);
  assert.equal(first.ok, false);
  const retry = await queue.sendTextBatch('group:1', ['a', 'b']);
  assert.equal(retry.sent.length, 1);
  assert.deepEqual(actual.map((x) => x.segments[0].text), ['a', 'b']);
  await assert.rejects(queue.sendTextBatch('group:1', 'c'), /每分钟上限 2/);
});

test('abort stops queued and remaining batch items without forgetting sent items', async () => {
  const controller = new AbortController();
  const { queue, actual } = sender({ onSent: () => controller.abort() });
  const result = await queue.sendTextBatch('group:1', ['a', 'b'], { signal: controller.signal });
  assert.equal(result.ok, false);
  assert.equal(result.sent.length, 1);
  assert.equal(actual.length, 1);
  const queued = new AbortController(); queued.abort();
  await assert.rejects(queue.sendTextBatch('group:2', 'never', { signal: queued.signal }), /中止|abort/i);
  assert.equal(actual.length, 1);
});

test('live session snapshots exclude persistence timers, clone deeply and remain serializable', async (t) => {
  const dataDir = temporary(t);
  const sessions = createSessionRegistry({ dataDir, log: {} });
  t.after(() => sessions.stop());
  const session = sessions.create('group:1');
  sessions.update(session, { messages: [{ role: 'assistant', content: 'hello' }], rounds: 1 });
  const copy = sessions.get(session.id);
  copy.messages[0].content = 'modified';
  assert.equal(sessions.peek(session.id).messages[0].content, 'hello');
  assert.doesNotThrow(() => JSON.stringify(copy));
  assert.equal(Object.hasOwn(copy, '_throttleTimer'), false);
  await new Promise((resolve) => setTimeout(resolve, 2100));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions', `${session.id}.json`))).rounds, 1);
});

test('retention trims completed sessions on finish and setting changes, preserving pending sessions', (t) => {
  const dataDir = temporary(t);
  const sessions = createSessionRegistry({ dataDir, log: {} });
  t.after(() => sessions.stop());
  const pending = sessions.create('group:pending', { waitUntil: Date.now() + 60000 });
  for (let i = 0; i < 3; i++) {
    const s = sessions.create(`group:${i}`);
    s.startedAt = i + 1;
    sessions.finish(s.id, 'done');
  }
  sessions.setKeepFiles(1);
  assert.equal(sessions.listSummaries().filter((s) => s.status === 'done').length, 1);
  assert.equal(sessions.get(pending.id).status, 'waiting');
  const newest = sessions.create('group:new');
  sessions.finish(newest.id, 'done');
  assert.equal(sessions.listSummaries().filter((s) => s.status === 'done').length, 1);
  assert.ok(sessions.get(newest.id));
  sessions.flushIndexCache();
  const index = JSON.parse(fs.readFileSync(path.join(dataDir, 'session-index-cache.json')));
  assert.equal(index.entries.length, 1);
});

test('legacy memory is visible before explicit query, backed up exactly, and migration is idempotent', (t) => {
  const dataDir = temporary(t);
  const root = path.join(dataDir, 'memory'); fs.mkdirSync(root);
  const legacy = '\ufeff' + JSON.stringify({ memberImpression: [
    { target: '123456', content: 'newer', createdAt: 20 },
    { target: '备注', content: 'older', createdAt: 10 },
    { target: '未知/姓名', content: 'named', createdAt: 30 },
  ], activeTopic: ['obsolete'] });
  fs.writeFileSync(path.join(root, 'group_100.json'), legacy);
  const cfg = () => ({ memberNotes: { '123456': '备注' } });
  const memory = createMemoryStore({ dataDir, cfg, log: {} });
  assert.equal(memory.listFiles()[0].chatKey, 'group:100');
  const member = memory.query('group:100', { userId: '123456' })[0];
  assert.deepEqual(member.impressions.map((x) => x.content), ['newer', 'older']);
  assert.equal(fs.existsSync(path.join(root, 'group_100.json')), false);
  const backups = fs.readdirSync(path.join(root, 'backups'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(root, 'backups', backups[0]), 'utf8'), legacy);
  assert.equal(memory.query('group:100').length, 2);
  assert.equal(fs.readdirSync(path.join(root, 'group_100')).some((x) => x.includes('/')), false);
  assert.equal(createMemoryStore({ dataDir, cfg, log: {} }).query('group:100', { userId: '123456' })[0].impressions.length, 2);
});

test('same-name memory merges into identified member without losing impressions', (t) => {
  const dataDir = temporary(t);
  const dir = path.join(dataDir, 'memory', 'group_1'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '_n_小明.json'), JSON.stringify({ userId: '', name: '小明', impressions: [{ content: 'a', createdAt: 2 }] }));
  fs.writeFileSync(path.join(dir, '123456.json'), JSON.stringify({ userId: '123456', name: '小明', impressions: [{ content: 'b', createdAt: 1 }] }));
  const memory = createMemoryStore({ dataDir, log: {} });
  assert.equal(memory.query('group:1').length, 1);
  assert.deepEqual(memory.query('group:1')[0].impressions.map((x) => x.content), ['a', 'b']);
  assert.equal(fs.existsSync(path.join(dir, '_n_小明.json')), false);
});

test('telemetry counts executed tool traces once and includes unsuccessful LLM attempts', () => {
  const totals = sessionTelemetryTotals({ traceVersion: 1, usage: { calls: 2, totalTokens: 3 }, messages: [
    { role: 'assistant', raw: { usage: { prompt_tokens: 2, completion_tokens: 1 } }, tool_calls: [{ function: { name: 'send_message' } }] },
    { role: 'tool', toolCall: { name: 'send_message' } },
  ] });
  assert.equal(totals.calls, 2);
  assert.equal(totals.toolCounts.send_message, 1);
  assert.equal(sessionTelemetryTotals({ messages: [{ role: 'assistant', tool_calls: [{ function: { name: 'legacy' } }] }] }).toolCounts.legacy, 1);
});

test('reopening the same session and late abort usage add only new consumption', (t) => {
  const dataDir = temporary(t);
  const sessions = createSessionRegistry({ dataDir, log: {} });
  t.after(() => sessions.stop());
  const s = sessions.create('group:1');
  const usage = (calls, totalTokens) => ({ calls, totalTokens, promptTokens: totalTokens, completionTokens: 0, cachedTokens: 0 });
  const trace = (count) => Array.from({ length: count }, () => ({ role: 'tool', toolCall: { name: 'query' } }));
  sessions.finish(s.id, 'error', { traceVersion: 1, usage: usage(1, 10), messages: trace(1) });
  sessions.update(s, { status: 'waiting', endedAt: null });
  sessions.update(s, { status: 'running', usage: usage(2, 15), messages: trace(2) });
  sessions.finish(s.id, 'aborted');
  sessions.update(s, { usage: usage(3, 20), messages: trace(3) });
  sessions.update(s, { usage: usage(3, 20), messages: trace(3) });
  const totals = JSON.parse(fs.readFileSync(path.join(dataDir, 'telemetry-totals.json')));
  assert.equal(totals.calls, 3); assert.equal(totals.totalTokens, 20); assert.equal(totals.toolCounts.query, 3);
  assert.equal(sessions.todayUsage().totalTokens, 20); assert.equal(sessions.todayUsage().runs, 1);
});

test('late usage after retention or explicit deletion does not resurrect files or SSE entries', (t) => {
  const dataDir = temporary(t);
  const events = [];
  const sessions = createSessionRegistry({ dataDir, log: {}, keepSessionFiles: () => 1, bus: { emit: (...event) => events.push(event) } });
  t.after(() => sessions.stop());
  const a = sessions.create('group:1'); a.startedAt = 1;
  sessions.finish(a.id, 'aborted', { traceVersion: 1, usage: { calls: 1, totalTokens: 10 } });
  const b = sessions.create('group:2');
  sessions.finish(b.id, 'done', { traceVersion: 1, usage: { calls: 1, totalTokens: 20 } });
  assert.equal(sessions.get(a.id), null);
  const count = events.length;
  sessions.update(a, { usage: { calls: 1, totalTokens: 15 } });
  assert.equal(events.length, count, '已删除的条目不得由更新事件重新出现在控制台');
  assert.equal(fs.existsSync(path.join(dataDir, 'sessions', `${a.id}.json`)), false);
  assert.equal(fs.readdirSync(path.join(dataDir, 'sessions')).filter((name) => name.endsWith('.json')).length, 1);
  assert.equal(sessions.todayUsage().totalTokens, 35);
  assert.equal(sessions.delete(b.id), true);
  sessions.update(b, { usage: { calls: 1, totalTokens: 25 } });
  assert.equal(sessions.get(b.id), null);
  assert.equal(fs.readdirSync(path.join(dataDir, 'sessions')).filter((name) => name.endsWith('.json')).length, 0);
  const totals = JSON.parse(fs.readFileSync(path.join(dataDir, 'telemetry-totals.json')));
  assert.equal(totals.calls, 2); assert.equal(totals.totalTokens, 40);
});

test('damaged totals recover history before adding a new completion or retry delta', (t) => {
  const dataDir = temporary(t);
  let sessions = createSessionRegistry({ dataDir, log: {} });
  const a = sessions.create('group:1');
  sessions.finish(a.id, 'done', { traceVersion: 1, usage: { calls: 1, totalTokens: 10 } });
  sessions.stop();
  // 使用全新 registry，确保恢复来自磁盘，而非碰巧命中进程内缓存。
  sessions = createSessionRegistry({ dataDir, log: {} });
  t.after(() => sessions.stop());
  fs.writeFileSync(path.join(dataDir, 'telemetry-totals.json'), '{damaged');
  const b = sessions.create('group:2');
  sessions.finish(b.id, 'error', { traceVersion: 1, usage: { calls: 1, totalTokens: 20 } });
  let totals = JSON.parse(fs.readFileSync(path.join(dataDir, 'telemetry-totals.json')));
  assert.equal(totals.calls, 2); assert.equal(totals.totalTokens, 30);
  sessions.update(b, { status: 'running', endedAt: null });
  fs.writeFileSync(path.join(dataDir, 'telemetry-totals.json'), '{}');
  sessions.finish(b.id, 'done', { usage: { calls: 2, totalTokens: 25 } });
  totals = JSON.parse(fs.readFileSync(path.join(dataDir, 'telemetry-totals.json')));
  assert.equal(totals.calls, 3); assert.equal(totals.totalTokens, 35);
});

test('downloaded data URLs and prefixed base64 encode as valid OneBot image payloads', async () => {
  const { queue, actual } = sender();
  const provider = createOneBotProvider({ cfg: () => ({}), clientFactory: class {}, log: {} });
  for (const [key, image] of [
    ['group:1', { dataUrl: 'data:image/png;base64,aGVsbG8=' }],
    ['group:2', { dataUrl: 'base64://aGVsbG8=' }],
    ['group:3', { base64: 'aGVsbG8=' }],
  ]) {
    await queue.sendImage(key, image);
    const encoded = provider.toPlatformSegments(actual.at(-1).segments);
    assert.equal(encoded[0].data.file, 'base64://aGVsbG8=');
    assert.equal(Buffer.from(encoded[0].data.file.slice('base64://'.length), 'base64').toString(), 'hello');
  }
  await assert.rejects(queue.sendImage('group:4', { dataUrl: 'data:image/png,raw' }), /base64/);
});

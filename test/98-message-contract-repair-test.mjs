// Real local default OneBot + loaded tools. Never touches the headed QA directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createKernel } from '../src/kernel/kernel.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { startHeadedQaFixture } from '../scripts/headed-qa-fixture.mjs';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const waitFor = async (predicate) => {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 10)); }
  assert.fail('local OneBot did not connect');
};

test('98 default message contracts: first quote, private poke target, deletion counts', async (t) => {
  const baseDir = path.join(workspace, '.qa-local', `repair-98-${process.pid}-${Date.now()}`);
  const fixture = await startHeadedQaFixture({ baseDir });
  let kernel;
  t.after(async () => {
    try { await kernel?.stop(); } finally {
      await fixture.close();
      const absolute = path.resolve(baseDir);
      assert.ok(absolute.startsWith(path.join(workspace, '.qa-local') + path.sep));
      assert.ok(path.basename(absolute).startsWith('repair-98-'));
      fs.rmSync(absolute, { recursive: true, force: true });
    }
  });
  kernel = createKernel({ appRoot: fixture.appRoot,
    env: { QQ_AGENT_DATA_DIR: fixture.dataDir, QQ_AGENT_PORT: String(fixture.consolePort), QQ_AGENT_PROFILE: '99', QQ_AGENT_MIGRATE_FROM: path.join(baseDir, 'absent') },
    priceUpdates: { resolve: () => null, refresh: async () => ({ ok: false, synthetic: true }) },
  });
  kernel.config.update({ send: { minGapMs: 10, maxGapMs: 10, byLengthMs: 0, dedupeWindowMs: 8000 } });
  kernel.log.setLevel('error'); kernel.loader.startWatchers = () => {};
  await kernel.start(); await kernel.services.idle();
  await waitFor(() => kernel.transport.status().selfId === '900001');
  const context = (chatKey) => ({ chatKey, session: { sent: [] }, cfg: kernel.config.get(), signal: new AbortController().signal });
  const call = async (id, args, chatKey = 'group:10001') => {
    const response = await kernel.registry.invoke(id, args, { execCtx: context(chatKey) });
    assert.equal(response.ok, true, response.error); return response.result;
  };
  const sendActions = (begin) => fixture.state.actions.slice(begin).filter((action) => /^send_(?:group|private)_msg$/.test(action.action));
  const quoteCounts = (actions) => actions.map((action) => action.params.message.filter((part) => part.type === 'reply').length);

  await t.test('array quote and mention attach only to its first physical message', async () => {
    const begin = fixture.state.actions.length;
    const result = await call('send_message', { messages: ['98 first', '98 second', '98 third'], replyToMessageId: '-5001', atUserId: '20001' });
    assert.equal(result.ok, true); assert.equal(result.result.sent.length, 3);
    const actions = sendActions(begin); assert.deepEqual(quoteCounts(actions), [1, 0, 0]);
    assert.deepEqual(actions.map((action) => action.params.message.filter((part) => part.type === 'at').length), [1, 0, 0]);
    assert.equal(String(actions[0].params.message.find((part) => part.type === 'reply').data.id), '-5001');
  });
  await t.test('hard split of one long message does not repeat its quote', async () => {
    kernel.config.update({ send: { hardSplitAt: 4 } }); const begin = fixture.state.actions.length;
    const result = await call('send_message', { messages: 'abcdefghij', replyToMessageId: '5001' });
    assert.equal(result.ok, true); assert.equal(result.result.sent.length, 3);
    assert.deepEqual(quoteCounts(sendActions(begin)), [1, 0, 0]);
    kernel.config.update({ send: { hardSplitAt: 4000 } });
  });
  await t.test('dedupe skipping the array prefix keeps quote on the first actual send', async () => {
    await call('send_message', { messages: '98 repeated' }); const begin = fixture.state.actions.length;
    const result = await call('send_message', { messages: ['98 repeated', '98 after skip', '98 final'], replyToMessageId: '5002' });
    assert.equal(result.ok, true); assert.equal(result.result.sent.length, 2);
    assert.deepEqual(quoteCounts(sendActions(begin)), [1, 0]);
  });
  await t.test('omitted private poke uses the current friend and explicit group target remains intact', async () => {
    assert.equal((await call('send_poke', {}, 'private:20001')).ok, true);
    assert.equal(fixture.state.actions.at(-1).params.user_id, 20001);
    const missing = await call('send_poke', {}); assert.equal(missing.ok, false);
    assert.equal((await call('send_poke', { targetUserId: '20002' })).ok, true);
    assert.equal(fixture.state.actions.at(-1).params.user_id, 20002);
    assert.equal(fixture.state.actions.at(-1).params.group_id, 10001);
  });
  await t.test('exact impression deletion reports its true count and survives a new store instance', async () => {
    for (const content of ['98 remove me', '98 keep me']) assert.equal((await call('memory_append', { category: 'memberImpression', userId: '20098', target: '同名', content })).ok, true);
    const result = await call('memory_remove', { userId: '20098', target: 'wrong name', content: '98 remove me' });
    assert.equal(result.ok, true); assert.equal(result.result.removed, 1);
    const reopened = createMemoryStore({ dataDir: fixture.dataDir, log: {} });
    assert.deepEqual(reopened.query('group:10001', { userId: '20098' })[0].impressions.map((item) => item.content), ['98 keep me']);
    const absent = await call('memory_remove', { userId: '20098', content: '98 missing' }); assert.equal(absent.ok, false);
    assert.equal(kernel.memory.query('group:10001', { userId: '20098' })[0].impressions.length, 1);
  });
  await t.test('whole-member deletion counts impressions and preserves same-name QQ and other chats', async () => {
    await call('memory_append', { category: 'memberImpression', userId: '20099', target: '同名', content: '98 another member' });
    await call('memory_append', { category: 'memberImpression', userId: '20098', content: '98 second remaining' });
    await call('memory_append', { category: 'memberImpression', userId: '20098', content: '98 other chat' }, 'group:10002');
    const result = await call('memory_remove', { userId: '20098' }); assert.equal(result.ok, true); assert.equal(result.result.removed, 2);
    assert.equal(kernel.memory.query('group:10001', { userId: '20098' }).length, 0);
    assert.equal(kernel.memory.query('group:10001', { userId: '20099' })[0].impressions.length, 1);
    assert.equal(kernel.memory.query('group:10002', { userId: '20098' })[0].impressions.length, 1);
    assert.equal(fs.existsSync(path.join(fixture.dataDir, 'memory', 'group_10001', '20098.json')), false);
  });
  await t.test('actual registry web_fetch denies private HTML even with the image-host exception enabled', async () => {
    let requests = 0;
    const server = http.createServer((_request, response) => { requests++; response.end('<h1>must not read this private page</h1>'); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      kernel.config.update({ security: { allowPrivateImageHosts: true } });
      const result = await call('web_fetch', { url: `http://127.0.0.1:${server.address().port}/private-page` });
      assert.equal(result.ok, false); assert.match(result.error, /内网/); assert.equal(requests, 0);
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });
});

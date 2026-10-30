// SPEC §8 查询契约：真实 registry / permissions / store，仅传输动作使用受控本地 fixture。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPermissions } from '../src/kernel/permissions.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createChatStore } from '../src/kernel/store.js';
import queryTools from '../bundled/query-tools/index.js';
import { createMediaReader } from '../src/kernel/media.js';
import { fixtureCapability } from './bundled-fixture-sdk.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-query-contract-'));
const log = { info() {}, warn() {}, error() {} };
const permissions = createPermissions({ log, headless: true });
const registry = createToolRegistry({ log, permissions });
const store = createChatStore({ dataDir: root, log });
let forwardCalls = 0;
let getForward = async () => ({ messages: [] });
const kernel = { store, transport: { actions: { getForward: (mid) => { forwardCalls++; return getForward(mid); } } } };
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64');
const mediaReader = createMediaReader({ cfg: { security: { allowPrivateImageHosts: true } }, fetchImpl: async () => new Response(imageBytes), ffmpegPath: '__missing_ffmpeg__' });
kernel.mediaReader = mediaReader;
queryTools.setup({ capability: fixtureCapability(kernel), registerTool: (tool) => registry.register({ ...tool, ownerId: 'query-tools', bundled: true }) });
async function invoke(id, args = {}, session = {}, chatKey = 'group:1') {
  const response = await registry.invoke(id, args, { execCtx: { chatKey, session } });
  assert.equal(response.ok, true, response.error);
  return response.result;
}
async function result(id, args, session, chatKey) {
  const response = await invoke(id, args, session, chatKey);
  assert.equal(response.ok, true, response.error);
  return response.result;
}
const mids = (data) => data.messages.map((message) => message.messageId);
const disk = (key) => fs.readFileSync(path.join(root, 'messages', `${key.replace(':', '_')}.json`), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));

try {
  console.log('· 最近消息：默认30、limit/旧count、offset与提示词历史补偿，支持500条以外翻页');
  for (let id = 1; id <= 600; id++) store.appendIncoming('group:1', { mid: 1000 + id, ts: id, senderId: '7', senderName: 'Fixture', text: `message ${id}` });
  const recentBefore = disk('group:1');
  const defaults = await result('get_recent_messages');
  assert.equal(defaults.count, 30); assert.equal(defaults.messages[0].messageId, 1571); assert.equal(defaults.messages.at(-1).messageId, 1600);
  assert.deepEqual(defaults.messages.at(-1), { messageId: 1600, time: 600, sender: 'Fixture(QQ:7)', senderId: '7', text: 'message 600' });
  assert.deepEqual(mids(await result('get_recent_messages', { limit: 3, offset: 2 }, { pastStateCount: 4 })), [1592, 1593, 1594]);
  const compensation = await result('get_recent_messages', {}, { pastStateCount: 20 });
  assert.equal(compensation.count, 30); assert.equal(compensation.messages[0].messageId, 1551); assert.equal(compensation.messages.at(-1).messageId, 1580);
  assert.deepEqual(mids(await result('get_recent_messages', { limit: 2, offset: 550 })), [1049, 1050]);
  assert.deepEqual(mids(await result('get_recent_messages', { count: 3, beforeId: 10 })), [1007, 1008, 1009]);
  assert.deepEqual(mids(await result('get_recent_messages', { limit: 3, offset: 2, beforeId: 300 }, { pastStateCount: 4 })), [1291, 1292, 1293]);
  assert.equal((await result('get_recent_messages', { limit: 2, count: 10 })).count, 2);
  for (const limit of [0, -8]) assert.deepEqual(mids(await result('get_recent_messages', { limit })), [1600]);
  assert.equal((await result('get_recent_messages', { limit: 500 })).count, 100);
  assert.equal((await result('get_recent_messages', { limit: 2.9 })).count, 2);
  assert.deepEqual(mids(await result('get_recent_messages', { limit: 2, offset: -8 }, { pastStateCount: -4 })), [1599, 1600]);
  assert.deepEqual(await result('get_recent_messages', { offset: 900 }), { count: 0, messages: [] });
  assert.equal(disk('group:1'), recentBefore, '所有查询必须保持存档原样');
  assert.ok(registry.get('get_recent_messages').params.properties.limit);
  assert.ok(registry.get('get_recent_messages').params.properties.offset);

  console.log('· 活跃成员：默认10、clamp1~20，保留发言排行和days兼容');
  const now = Date.now();
  for (let user = 1; user <= 25; user++) for (let count = 0; count < user; count++) {
    store.appendIncoming('group:2', { mid: 2000 + user * 30 + count, ts: now, senderId: String(100 + user), senderName: `Member ${user}`, text: 'recent' });
  }
  store.appendSelf('group:2', { mid: 3000, ts: now, text: 'exclude self' });
  store.appendIncoming('group:2', { mid: 3001, ts: now - 8 * 86400000, senderId: 'old', text: 'exclude old' });
  const membersBefore = disk('group:2');
  const members = await result('get_active_members', {}, {}, 'group:2');
  assert.equal(members.members.length, 10); assert.equal(members.total, 325);
  assert.deepEqual(members.members[0], { userId: '125', name: 'Member 25', lastSeen: now, recentCount: 25 });
  for (const [limit, count] of [[0, 1], [-8, 1], [3, 3], [100, 20]]) assert.equal((await result('get_active_members', { limit }, {}, 'group:2')).members.length, count);
  assert.equal((await result('get_active_members', { days: 10, limit: 20 }, {}, 'group:2')).total, 326);
  assert.equal(disk('group:2'), membersBefore);

  console.log('· 聊天列表：默认20、clamp1~50，最近活跃降序与recentText前30字');
  const longText = 'abcdefghijklmnopqrstuvwxyz0123456789-archive-text';
  for (let id = 3; id <= 65; id++) store.appendIncoming(`group:${id}`, { mid: 4000 + id, ts: now + id, senderId: '7', text: longText });
  const chats = await result('get_chats');
  assert.equal(chats.count, 20); assert.equal(chats.chats[0].chatKey, 'group:65');
  assert.equal(chats.chats[0].recentText, longText.slice(0, 30));
  assert.equal(chats.chats.every((chat, index, items) => chat.recentText.length <= 30 && (!index || items[index - 1].lastActive >= chat.lastActive)), true);
  for (const [limit, count] of [[0, 1], [-8, 1], [3, 3], [100, 50]]) assert.equal((await result('get_chats', { limit })).count, count);

  console.log('· 转发展开：字符串/raw/扁平段兼容，图片并入真实存档供看图工具读取');
  const forwardKey = 'group:70', placeholder = '[合并转发聊天记录]';
  store.appendIncoming(forwardKey, { mid: 7000, text: placeholder, media: [{ kind: 'forward', id: 'res-id' }] });
  getForward = async (mid) => {
    assert.equal(mid, 7000);
    return { messages: [
      { sender: { nickname: 'String message' }, message: 'message string' },
      { sender: { nickname: 'String content' }, content: 'content string' },
      { sender: { nickname: 'Raw' }, message: [{ type: 'text', data: { text: 'raw text' } }, { type: 'image', data: { url: 'https://raw.invalid/image.png', file: 'raw-file' } }] },
      { sender: { nickname: 'Flat' }, content: [{ type: 'text', text: 'flat text' }, { type: 'image', url: 'https://flat.invalid/image.png' }] },
    ] };
  };
  const expanded = await result('read_forward', { messageId: '7000' }, {}, forwardKey);
  assert.equal(expanded.messageId, 7000); assert.equal(expanded.images, 2); assert.equal(expanded.count, 4);
  for (const text of ['message string', 'content string', 'raw text', 'flat text']) assert.ok(expanded.text.includes(text));
  assert.equal(store.findByMid(forwardKey, 7000).text, expanded.text);
  assert.deepEqual(store.findByMid(forwardKey, 7000).media, [
    { kind: 'forward', id: 'res-id' },
    { kind: 'image', url: 'https://raw.invalid/image.png', file: 'raw-file' },
    { kind: 'image', url: 'https://flat.invalid/image.png', file: undefined },
  ]);
  const imageResult = await invoke('get_message_images', { messageId: 7000 }, {}, forwardKey);
  assert.equal(imageResult.ok, true);
  assert.deepEqual(imageResult.mediaParts, [
    { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBytes.toString('base64')}` } },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBytes.toString('base64')}` } },
  ]);
  const expandedDisk = disk(forwardKey), beforeCached = forwardCalls;
  kernel.store = createChatStore({ dataDir: root, log });
  kernel.transport.actions.getForward = undefined;
  const cached = await result('read_forward', { messageId: 7000 }, {}, forwardKey);
  assert.equal(cached.note, '该转发已展开（读的是存档）'); assert.equal(cached.text, expanded.text); assert.equal(cached.images, 2);
  assert.equal(forwardCalls, beforeCached); assert.equal(disk(forwardKey), expandedDisk);
  kernel.store = store;
  kernel.transport.actions.getForward = (mid) => { forwardCalls++; return getForward(mid); };

  console.log('· 空转发与上游失败保持原占位，长首条不被当成空内容');
  store.appendIncoming(forwardKey, { mid: 7001, text: placeholder, media: [{ kind: 'forward', id: 'empty-res' }] });
  const emptyDisk = disk(forwardKey);
  for (const payload of [{ messages: [] }, { nodes: [] }, { messages: [{ message: '' }] }, { messages: [{ content: [{ type: 'text', text: '   ' }] }] }]) {
    getForward = async () => payload;
    const empty = await invoke('read_forward', { messageId: 7001 }, {}, forwardKey);
    assert.equal(empty.ok, false); assert.match(empty.error, /展开失败：转发内容为空/); assert.equal(disk(forwardKey), emptyDisk);
  }
  getForward = async () => { throw new Error('fixture unavailable'); };
  const unavailable = await invoke('read_forward', { messageId: 7001 }, {}, forwardKey);
  assert.equal(unavailable.ok, false); assert.match(unavailable.error, /展开失败：fixture unavailable/); assert.equal(disk(forwardKey), emptyDisk);
  getForward = async () => ({ nodes: [{ content: 'x'.repeat(4000) }] });
  const long = await result('read_forward', { messageId: 7001 }, {}, forwardKey);
  assert.ok(long.text.includes('x'.repeat(100))); assert.ok(long.text.length < 3100);

  console.log('· 并发展开仅追加一次媒体，后到响应返回已经落盘的内容');
  store.appendIncoming(forwardKey, { mid: 7002, text: placeholder, media: [{ kind: 'forward', id: 'concurrent-res' }] });
  const finish = [];
  getForward = () => new Promise((resolve) => { finish.push(resolve); });
  const first = result('read_forward', { messageId: 7002 }, {}, forwardKey);
  const second = result('read_forward', { messageId: 7002 }, {}, forwardKey);
  await flush(); assert.equal(finish.length, 2);
  finish[0]({ messages: [{ message: [{ type: 'image', data: { url: 'https://first.invalid/image.png' } }] }] });
  const firstResult = await first;
  const firstDisk = disk(forwardKey);
  finish[1]({ messages: [{ content: [{ type: 'image', url: 'https://late.invalid/image.png' }] }] });
  const secondResult = await second;
  assert.equal(secondResult.note, '该转发已展开（读的是存档）'); assert.equal(secondResult.text, firstResult.text); assert.equal(secondResult.images, 1);
  assert.equal(store.findByMid(forwardKey, 7002).media.length, 2); assert.equal(disk(forwardKey), firstDisk);
  console.log('✓ 79-query-contract-repair：全部真实行为回归通过');
} finally {
  mediaReader.close();
  permissions.close();
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('qqa-query-contract-'));
  fs.rmSync(root, { recursive: true, force: true });
}

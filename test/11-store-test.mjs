// 11 · store：messages 仓契约（文件名/字段/self 字面量/atMe null/trim/0.4 兼容读取）
import { ok, eq, section, summary, mktmp } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createChatStore } from '../src/kernel/store.js';

const dir = mktmp('qqa-store-');
const store = createChatStore({ dataDir: dir, log: {} });

section('入库字段与 self 字面量（12-data §3.4）');
const m = store.appendIncoming('group:123', {
  mid: 1001, ts: 1000, senderId: '555', senderName: '小明', text: '你好',
  atMe: true, atNames: ['@小鲸鱼'], media: [], reply: null,
});
eq(m.id, 1, 'id 从 1 开始递增');
eq(m.self, false, 'self=false');
eq(m.read, false, '新消息未读');
eq(m.atMe, true, 'atMe 保留');
const self = store.appendSelf('group:123', { mid: 2002, text: '在的' });
eq(self.senderId, 'self', "self 条目 senderId='self'（字面量）");
eq(self.senderName, '我', "self 条目 senderName='我'（字面量）");
eq(self.read, true, '自己发的视为已读');

section('文件名 sanitize + 只认数字 id');
eq(fs.existsSync(path.join(dir, 'messages', 'group_123.json')), true, 'group:123 → group_123.json');
store.appendIncoming('private:456', { ts: 1, senderId: '456', senderName: 'p', text: 'hi', atMe: null });
eq(fs.existsSync(path.join(dir, 'messages', 'private_456.json')), true, 'private:456 → private_456.json');
const chats = store.listChats();
eq(chats.length, 2, 'listChats 枚举两个会话');
eq(chats[0].unread + chats[1].unread, 2, '两个会话各 1 条未读');

section('atMe null（老存档未标注）');
const legacy = store.appendIncoming('private:456', { ts: 2, senderId: '456', senderName: 'p', text: 'x' });
eq(legacy.atMe, null, '未传 atMe → null（老存档语义）');

section('read/未读操作');
eq(store.unread('group:123').length, 1, '未读 1 条');
store.markAllRead('group:123');
eq(store.unread('group:123').length, 0, 'markAllRead 清空');
eq(store.markUnreadInWindow('group:123', 0, Date.now() + 1e9) >= 1, true, 'markUnreadInWindow 翻回未读（重试）');

section('isPoke 不进未读');
const poke = store.appendIncoming('group:123', { ts: 3, senderId: '555', senderName: 'A', text: '[拍一拍] A 拍了拍 我', isPoke: true, atMe: true });
eq(poke.isPoke, true, 'isPoke 标记');
// 前面 markUnreadInWindow 把普通消息翻回了未读；isPoke 本身不占未读
eq(store.unread('group:123').filter((m) => !m.isPoke).length > 0, true, 'isPoke 不占未读（§6.3）');
eq(store.unread('group:123').some((m) => m.isPoke), false, 'unread() 不含 isPoke');

section('mid 主键操作（可为负数）');
store.appendIncoming('group:123', { mid: -99, ts: 4, senderId: '555', senderName: 'A', text: '旧' });
eq(store.findByMid('group:123', -99).text, '旧', '负数 mid 可查');
store.markRecalled('group:123', -99);
eq(store.findByMid('group:123', -99).recalled, true, 'markRecalled（幂等）');
store.updateByMid('group:123', -99, { text: '改' });
eq(store.findByMid('group:123', -99).text, '改', 'updateByMid');

section('原子写与 0.4 存量兼容读取（BOM/顺序）');
const dir2 = mktmp('qqa-store2-');
fs.mkdirSync(path.join(dir2, 'messages'), { recursive: true });
// 模拟 0.4 存档（含 BOM、atMe:null、media 字段）
const legacyData = { chatKey: 'group:999', nextLocalId: 3, messages: [
  { id: 1, mid: 10, ts: 1, senderId: '1', senderName: 'A', text: 'a', self: false, read: true, reply: null, media: [], isPoke: false, atMe: null, atNames: [] },
  { id: 2, mid: 11, ts: 2, senderId: 'self', senderName: '我', text: 'b', self: true, read: true, reply: null, media: [], isPoke: false, atMe: null, atNames: [] },
] };
fs.writeFileSync(path.join(dir2, 'messages', 'group_999.json'), '\uFEFF' + JSON.stringify(legacyData));
const store2 = createChatStore({ dataDir: dir2, log: {} });
eq(store2.recent('group:999', 10).length, 2, 'BOM 存量可读');
eq(store2.recent('group:999', 10)[0].atMe, null, '老条目 atMe:null 保留');
const nid = store2.appendIncoming('group:999', { ts: 3, senderId: '2', senderName: 'B', text: 'c' });
eq(nid.id, 3, 'nextLocalId 从存量续接');

section('maxMessagesPerChat trim（id 不回退）');
const dir3 = mktmp('qqa-store3-');
const store3 = createChatStore({ dataDir: dir3, log: {}, maxMessagesPerChat: () => 3 });
for (let i = 0; i < 5; i++) store3.appendIncoming('group:1', { ts: i, senderId: 'x', senderName: 'x', text: `m${i}` });
const kept = store3.recent('group:1', 10);
eq(kept.length, 3, 'trim 到 3 条');
eq(kept[0].text, 'm2', '裁掉最旧（保留尾部）');
eq(kept[2].id, 5, 'id 保持递增不回退');

section('损坏文件当空重建');
const dir4 = mktmp('qqa-store4-');
fs.mkdirSync(path.join(dir4, 'messages'), { recursive: true });
fs.writeFileSync(path.join(dir4, 'messages', 'group_5.json'), '{broken');
const store4 = createChatStore({ dataDir: dir4, log: {} });
eq(store4.recent('group:5', 10).length, 0, '损坏当空重建');

section('clearChat');
store.clearChat('group:123');
eq(store.recent('group:123', 10).length, 0, 'clearChat 清空');
eq(store.recent('group:123', 10).length === 0 && store.appendIncoming('group:123', { ts: 1, senderId: 'a', senderName: 'a', text: 'z' }).id === 1, true, '清空后 id 重置');

summary('11-store');

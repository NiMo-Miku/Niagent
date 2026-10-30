import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { eq, ok, mktmp, section, summary } from './helpers.mjs';

const dataDir = mktmp('qqa-m3-route-close-');
const staticDir = mktmp('qqa-m3-route-close-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), 'ok');
const log = { error() {}, warn() {}, info() {}, level: 'info', recent: () => [], setLevel: (level) => ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info' };
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log });
config.load();
config.update({ server: { port: 0, token: 'secret' }, allowAllWhenEmpty: true, providers: [{ id: 'p1', baseUrl: 'https://api.example.test', models: ['m1'] }], dshProviderKeys: { p1: 'provider-key' } });
const events = [];
const bus = { emit: (name, payload) => events.push([name, payload]) };
const sessions = createSessionRegistry({ dataDir, log, bus });
const store = createChatStore({ dataDir, log });
const memory = createMemoryStore({ dataDir, log });
const loader = { listEntries: () => [], promptSections: () => [], loadAll: async () => [], setEnabled: async () => [] };
const orchestrator = { status: () => ({ paused: false, running: [], waiting: [] }), pause() {}, resume() {}, retrySession: () => ({ ok: true }), abortSession: () => ({ ok: true }), stopProactiveLoop() {} };
const capability = { names: () => [], explain: () => ({}) };
const registry = { list: () => [], availability: () => ({ ok: true }) };
const calls = [];
const onebot = {
  client: { connected: true, async call(action, params) { calls.push([action, params]); if (action === 'get_group_list') return { data: [{ group_id: 1, group_name: '群' }] }; if (action === 'get_friend_list') return { data: [{ user_id: 2, nickname: '友' }] }; if (action === 'get_group_member_list') return { data: [{ user_id: 3, nickname: '乙', card: '甲' }] }; if (action.startsWith('send_')) return { data: { message_id: 99 } }; return { data: [] }; } },
  // provider 发送契约（test-send 走 transport.send）
  async send(chatKey, segments) {
    const kind = chatKey.split(':')[0];
    const action = kind === 'group' ? 'send_group_msg' : 'send_private_msg';
    const id = chatKey.split(':').pop();
    const res = await this.client.call(action, kind === 'group' ? { group_id: Number(id), message: segments } : { user_id: Number(id), message: segments });
    return [{ msgId: res?.data?.message_id ?? null }];
  },
  // 归一化 actions 契约（routes 消费；内部仍经 client.call 保持 calls 断言有效）
  actions: {
    async listGroups() { return (await onebot.client.call('get_group_list', {})).data.map((g) => ({ id: String(g.group_id), name: g.group_name || String(g.group_id) })); },
    async listFriends() { return (await onebot.client.call('get_friend_list', {})).data.map((f) => ({ id: String(f.user_id), name: f.remark || f.nickname || String(f.user_id) })); },
    async getGroupMembers(groupId) { return (await onebot.client.call('get_group_member_list', { group_id: Number(groupId) })).data.map((m) => ({ userId: String(m.user_id), nickname: m.nickname ?? '', card: m.card ?? '' })); },
  },
};
const http = createHttpServer({ config, log, staticDir });
registerConsoleRoutes(http, { config, sessions, store, memory, loader, orchestrator, capability, registry, onebot, bus, log, dataDir });
const port = await http.listen();
async function request(method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers: { 'x-console-token': 'secret' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

section('R04/R05 空会话统计真实 DTO');
let response = await request('GET', '/api/usage/stats?range=7');
eq(response.status, 200, 'usage stats status');
ok(Array.isArray(response.data.days) && Array.isArray(response.data.hours) && response.data.hours.length === 24, 'usage dimensions');
response = await request('GET', '/api/usage/breakdown?by=model');
eq(response.status, 200, 'usage breakdown status');
ok(Array.isArray(response.data.rows) && response.data.totals.token === 0, 'breakdown totals');

section('R17/R18/R79 OneBot 调用与 DTO');
eq((await request('GET', '/api/onebot/groups')).data.groups[0].name, '群', 'groups dto');
eq((await request('GET', '/api/onebot/friends')).data.friends[0].name, '友', 'friends dto');
eq((await request('GET', '/api/groups/1/members')).data.members[0].card, '甲', 'members dto');
ok(calls.some(([action]) => action === 'get_group_list'), 'group call made');

section('R19-R21 人设模板规范路径');
response = await request('POST', '/api/persona-templates', { name: '测试', text: '设定' });
eq(response.status, 200, 'create persona');
const personaTemplates = (await request('GET', '/api/persona-templates')).data.templates;
eq(personaTemplates[0].id, 'xiaojingyu', 'builtin persona precedes custom personas');
ok(/^custom_[a-f0-9]{32}$/.test(personaTemplates[1].id), 'list stable custom persona after builtin');
eq((await request('DELETE', `/api/persona-templates/${personaTemplates[1].id}`, { expected: personaTemplates[1].revision })).status, 200, 'delete the observed persona revision');

section('R71-R75 记忆文件全链路');
response = await request('PUT', '/api/memory-files/group_123/members/456', { name: '用户', note: '备注', impressions: [' 第一条 ', ''] });
eq(response.status, 200, 'memory upsert');
eq(response.data.member.impressions[0].content, '第一条', 'memory trims text');
response = await request('GET', '/api/memory-files');
eq(response.data.files[0].chatKey, 'group:123', 'memory list');
response = await request('GET', '/api/memory-files/group_123');
eq(response.data.members[0].userId, '456', 'memory detail');
eq((await request('DELETE', '/api/memory-files/group_123/members/456')).status, 200, 'memory remove');
eq((await request('DELETE', '/api/memory-files/group_123')).status, 200, 'memory clear');
ok(events.some(([name]) => name === 'memory.update'), 'memory update emitted');

section('R81 测试发送落档并通知');
response = await request('POST', '/api/chats/group_123/test-send', { text: 'hello' });
eq(response.status, 200, 'test send status');
eq(response.data.messageId, 99, 'test send message id');
eq(store.recent('group:123', 1)[0].self, true, 'self message persisted');
ok(events.some(([name]) => name === 'chat.update'), 'chat update emitted');

section('R80/R82-R87 控制语义');
eq((await request('POST', '/api/chats/group_123/wake', {})).status, 410, 'wake removed');
store.appendIncoming('group:123', { senderId: '7', text: 'unread' });
eq((await request('POST', '/api/chats/group_123/mute', {})).data.marked, 1, 'mute marks read');
eq((await request('POST', '/api/pause', { paused: true })).data.paused, true, 'pause status');
eq((await request('DELETE', '/api/pause')).data.paused, false, 'pause delete resumes');

await http.close();
summary('31-m3-route-closure');

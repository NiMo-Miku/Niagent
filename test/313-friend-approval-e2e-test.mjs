// 313 · friend-approval 0.5 端到端（开发任务三验收）：
// 真 WS/HTTP mock OneBot + 真内核 + 真插件——
// 好友申请 → 私聊请示审批人 → 审批人私聊「同意」→ set_friend_add_request(flag,approve)
// → 预批准名单（admin_add_friend）→ 后续申请自动通过；chat.member-info 三种角色查询。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createApplication } from '../src/kernel/composition.js';
import { defaultComponents } from '../bundled/runtime-defaults/components.js';

const workspace = path.resolve(import.meta.dirname, '..');
// friend-approval 随插件仓库分发，不随本体入库；没装就跳过，而不是报失败。
if (!fs.existsSync(path.join(workspace, 'plugins', 'friend-approval', 'plugin.json'))) {
  console.log('SKIP 313-friend-approval-e2e：本机未安装 plugins/friend-approval');
  process.exit(0);
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-friend-approval-313-'));
const dataDir = path.join(temporary, 'data'), appRoot = path.join(temporary, 'app');
fs.mkdirSync(appRoot);
fs.cpSync(path.join(workspace, 'ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const folder of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, folder));
fs.cpSync(path.join(workspace, 'plugins', 'friend-approval'), path.join(appRoot, 'plugins', 'friend-approval'), { recursive: true });
// 传输走真实 transport-onebot 插件（setFriendAddRequest 是被测代码），须随夹具一起复制。
fs.cpSync(path.join(workspace, 'bundled', 'transport-onebot'), path.join(appRoot, 'bundled', 'transport-onebot'), { recursive: true });
// 插件快照在 appRoot 下解析运行时依赖（ws）：junction 到真实 node_modules。
fs.symlinkSync(path.join(workspace, 'node_modules'), path.join(appRoot, 'node_modules'), 'junction');
// 微型探针插件：把 ctx 暴露出来，供测试直调 chat.member-info 能力。
const probeDir = path.join(appRoot, 'plugins', 'probe-313');
fs.mkdirSync(probeDir);
fs.writeFileSync(path.join(probeDir, 'plugin.json'), JSON.stringify({ id: 'probe-313', name: '探针', version: '0.0.1', apiVersion: 1, kind: 'plugin', entry: 'index.js', enabledByDefault: false, permissions: ['data.sessions.read', 'net.outbound'] }));
const stateKey = '__probe313__';
fs.writeFileSync(path.join(probeDir, 'index.js'), `export async function setup(ctx){globalThis[${JSON.stringify(stateKey)}]=ctx;}\nexport function dispose(){delete globalThis[${JSON.stringify(stateKey)}];}\n`);

// ---- mock OneBot 协议端（反向 WS + HTTP 动作）----
const privateSends = [], friendRequests = [], llmPrompts = [];
let llmScript = () => null; // (promptText) => toolCalls | null
const mock = await new Promise((resolve) => {
  const httpServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const action = req.url.split('?')[0].replace('/', '');
      const params = JSON.parse(body || '{}');
      let data = {};
      if (action === 'get_login_info') data = { user_id: 999999, nickname: '小鲸鱼' };
      else if (action === 'send_group_msg' || action === 'send_private_msg') {
        data = { message_id: Math.floor(Math.random() * 100000) };
        privateSends.push({ action, params });
      } else if (action === 'set_friend_add_request') {
        friendRequests.push(params); data = {};
      } else if (action === 'get_stranger_info') data = { user_id: params.user_id, nickname: `用户${params.user_id}` };
      else if (action === 'get_friend_list') data = [];
      else if (action === 'get_group_member_info') {
        const role = String(params.user_id) === '55555' ? 'owner' : String(params.user_id) === '55666' ? 'admin' : 'member';
        data = { user_id: params.user_id, role, card: `名片${params.user_id}`, nickname: `昵称${params.user_id}`, join_time: 1700000000, shut_up_timestamp: 0 };
      } else if (action === 'get_group_member_list') data = [];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', retcode: 0, data }));
    });
  });
  const wss = new WebSocketServer({ server: httpServer });
  const sockets = [];
  wss.on('connection', (ws) => sockets.push(ws));
  httpServer.listen(0, '127.0.0.1', () => resolve({
    port: httpServer.address().port,
    connected: () => sockets.length > 0,
    pushEvent: (ev) => { for (const ws of sockets) ws.send(JSON.stringify(ev)); },
    close: () => { for (const ws of sockets) ws.close(); wss.close(); httpServer.close(); },
  }));
});

let kernel;
async function until(predicate, label = '条件') {
  const end = Date.now() + 15000;
  while (!predicate()) {
    assert.ok(Date.now() < end, `等待超时：${label}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}
const privateMessage = (userId, text) => ({
  post_type: 'message', message_type: 'private', user_id: userId, message_id: Math.floor(Math.random() * 1e6),
  time: Math.floor(Date.now() / 1000), sender: { nickname: `用户${userId}`, user_id: userId },
  message: [{ type: 'text', data: { text } }],
});

try {
  kernel = await createApplication({
    appRoot, headless: true,
    env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_MIGRATE_FROM: path.join(temporary, 'absent') },
    components: {
      'runtime.logger': (options) => defaultComponents['runtime.logger']({ ...options, mirrorConsole: false }),
      'llm.complete': async (args) => {
        const prompt = (args.messages ?? []).map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
        llmPrompts.push(prompt);
        const tools = llmScript(prompt);
        if (tools) return { message: { role: 'assistant', content: '', tool_calls: tools }, finish_reason: 'tool_calls' };
        return { message: { role: 'assistant', content: '' }, finish_reason: 'stop' };
      },
    },
    fetchImpl: async () => { throw new Error('外呼被禁用'); },
    priceUpdates: { resolve: () => null, refresh: async () => ({ ok: true }), updateCheck: async () => ({ ok: true, current: '0.5.0', latest: '0.5.0', hasUpdate: false }) },
    communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
  });
  kernel.config.update({
    server: { port: 0, token: 'synthetic-313' },
    api: { model: 'mock-313', maxRounds: 6 },
    allow: { groups: ['100'], private: ['88888'] }, allowAllWhenEmpty: true,
    store: { contextTier: 4, randomPercent: 100, keywords: [], historyCount: 80, promptAnchor: { enabled: false }, maxMessagesPerChat: 0 },
    wakeDelayMs: 300, send: { minGapMs: 0, maxGapMs: 0, byLengthMs: 0, maxPerMinute: 500, maxPerHour: 5000, hardSplitAt: 4000, dedupeWindowMs: 0 },
    onebot: { wsUrl: `ws://127.0.0.1:${mock.port}`, httpUrl: `http://127.0.0.1:${mock.port}`, accessToken: '', httpAccessToken: '' },
    memory: { consolidateEnabled: false }, telemetry: { enabled: false }, proactive: { enabled: false }, chatActive: { enabled: false },
    skills: { 'friend-approval': { enabled: true, settings: { approvers: '88888', maxPendingHours: 12 } }, 'probe-313': { enabled: true } },
  });
  await kernel.start();
  await until(() => kernel.loader.hostEntry('friend-approval')?.status === 'active', 'friend-approval 激活');
  await until(() => kernel.loader.hostEntry('probe-313')?.status === 'active', 'probe 激活');
  for (const [id, scopes] of [['friend-approval', ['qq.send', 'data.sessions.read', 'net.outbound']], ['probe-313', ['data.sessions.read', 'net.outbound']]]) {
    for (const scope of scopes) {
      assert.equal(kernel.permissions.setOverride(id, scope, 'allow', { fingerprint: kernel.loader.hostEntry(id).fingerprint }), true, `授权 ${id}:${scope}`);
    }
  }
  await until(() => mock.connected(), '协议端反向 WS 建连');

  console.log('· ① 好友申请事件 → 私聊请示审批人（确定性分发，不经模型）');
  const llmBefore = llmPrompts.length;
  mock.pushEvent({ post_type: 'request', request_type: 'friend', user_id: 66666, comment: '群里聊过的小明', flag: 'F1' });
  await until(() => privateSends.some((s) => s.params.user_id === 88888 && /申请加我为好友/.test(s.params.message?.map?.((seg) => seg?.data?.text).join('') ?? '')), '请示私聊');
  const ask = privateSends.find((s) => s.params.user_id === 88888);
  assert.ok(/QQ:66666|66666/.test(ask.params.message.map((seg) => seg.data.text).join('')), '请示里带申请人 QQ');
  assert.ok(/群里聊过的小明/.test(ask.params.message.map((seg) => seg.data.text).join('')), '请示里带验证消息');
  assert.equal(llmPrompts.length, llmBefore, '事件分发不经模型');

  console.log('· ② 审批人私聊「同意」→ 模型调用 decide_friend_request → set_friend_add_request(flag,approve)');
  llmScript = (prompt) => /审批好友申请|同意|拍板/.test(prompt) && prompt.includes('66666')
    ? [{ id: 'c1', type: 'function', function: { name: 'friend-approval__decide_friend_request', arguments: JSON.stringify({ decision: 'approve', userId: '66666' }) } }]
    : null;
  mock.pushEvent(privateMessage(88888, '同意'));
  await until(() => friendRequests.length > 0, 'set_friend_add_request');
  assert.deepEqual(friendRequests.at(-1), { flag: 'F1', approve: true }, 'flag 原样回传 + approve');

  console.log('· ③ 审批人下令加好友（admin_add_friend）→ 预批准 → 后续申请自动通过');
  llmScript = (prompt) => prompt.includes('88888') && /77777/.test(prompt)
    ? [{ id: 'c2', type: 'function', function: { name: 'friend-approval__admin_add_friend', arguments: JSON.stringify({ userId: '77777', note: '同事' }) } }]
    : null;
  mock.pushEvent(privateMessage(88888, '去加 77777 为好友'));
  await until(() => privateSends.some((s) => s.params.user_id === 77777), '通知 777 发申请(预批准已记录)');
  const before = friendRequests.length;
  mock.pushEvent({ post_type: 'request', request_type: 'friend', user_id: 77777, comment: '', flag: 'F2' });
  await until(() => friendRequests.length > before, '自动通过');
  assert.deepEqual(friendRequests.at(-1), { flag: 'F2', approve: true }, '预批准后申请自动通过');

  console.log('· ④ chat.member-info：群成员身份查询（owner/admin/member 三种角色）');
  const probe = globalThis[stateKey];
  assert.ok(probe, '探针插件 ctx 就绪');
  const owner = await probe.capability('chat.member-info').member('group:100', '55555', {});
  assert.equal(owner.role, 'owner');
  const admin = await probe.capability('chat.member-info').member('group:100', '55666', {});
  assert.equal(admin.role, 'admin');
  const member = await probe.capability('chat.member-info').member('group:100', '55777', {});
  assert.equal(member.role, 'member');
  assert.equal(member.card, '名片55777');
  await assert.rejects(probe.capability('chat.member-info').member('group:100', '', {}), /无效|无效/, '非法入参拒绝');

  console.log('✓ 313-friend-approval-e2e：申请 → 请示 → 同意 → 自动通过 + member-info 全链通过');
} finally {
  try { await kernel?.stop(); } catch { /* 尽力 */ }
  mock.close();
  delete globalThis[stateKey];
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
  fs.rmSync(temporary, { recursive: true, force: true });
}

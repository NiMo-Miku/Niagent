// 49 · transport 注入契约：provider 归一化 actions + makeChatKey/store 三段式 + orchestrator 慢路径解耦
import { ok, eq, section, summary, mktmp as makeTemporary } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import { makeChatKey, parseChatKey } from '../src/kernel/transport.js';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createSendQueue } from '../src/kernel/send.js';
import { createOrchestrator } from '../src/kernel/orchestrator.js';
import { createOneBotProvider } from '../src/transports/onebot/provider.js';
import { createKernel } from '../src/kernel/kernel.js';

const temporaryRoots = [], disposers = [], blocked = [], ownedOrigins = new Set();
const mktmp = prefix => { const folder = makeTemporary(prefix); temporaryRoots.push(folder); return folder; };
const nativeFetch = globalThis.fetch, dnsOriginals = [];
let loopbackLookups = 0;
globalThis.fetch = (input, init = {}) => {
  const url = new URL(input?.url ?? input);
  if (!ownedOrigins.has(url.origin)) { blocked.push({ kind: 'fetch', url: url.href }); return Promise.reject(new Error('49 forbids unowned HTTP')); }
  return nativeFetch(input, { ...init, redirect: 'error' });
};
for (const target of [dns, dnsPromises]) for (const key of Object.keys(target).filter(key => /^(lookup|resolve|reverse)/.test(key) && typeof target[key] === 'function')) {
  dnsOriginals.push([target, key, target[key]]);
  target[key] = (hostname, ...args) => {
    if (key === 'lookup' && ['127.0.0.1', '::1'].includes(hostname)) {
      loopbackLookups++;
      const address = { address: hostname, family: hostname === '::1' ? 6 : 4 }, options = args.find(value => value && typeof value === 'object');
      if (target === dnsPromises) return Promise.resolve(options?.all ? [address] : address);
      queueMicrotask(() => args.at(-1)(null, ...(options?.all ? [[address]] : [address.address, address.family]))); return;
    }
    blocked.push({ kind: 'dns', method: key }); throw new Error('49 forbids DNS');
  };
}
syncBuiltinESMExports();
try {
section('makeChatKey：两段式（默认，0.4 口径）与三段式（显式 platform）');
eq(makeChatKey('group', 123), 'group:123', '缺省 = 两段式');
eq(makeChatKey('group', 123, null), 'group:123', 'null = 两段式');
eq(makeChatKey('private', 456, 'qq'), 'qq:private:456', '显式 platform = 三段式');
eq(parseChatKey(makeChatKey('group', 123)), { platform: 'qq', kind: 'group', id: '123' }, '两段式 parse 补 platform=qq');
eq(parseChatKey(makeChatKey('private', 456, 'wechat')), { platform: 'wechat', kind: 'private', id: '456' }, '三段式 parse 保留 platform');

section('store：三段式 chatKey 落盘与 listChats 还原');
{
  const dir = mktmp('qqa-t49-store-');
  const store = createChatStore({ dataDir: dir, log: {} });
  store.appendIncoming('group:123', { mid: 1, ts: 1, senderId: '5', senderName: 'a', text: 'x', atMe: null });
  eq(fs.existsSync(path.join(dir, 'messages', 'group_123.json')), true, '两段式文件名不变（0.4 兼容）');
  // 三段式：直接写文件模拟（append 走 sanitize 落盘后文件名应可被 listChats 反解）
  const triDir = mktmp('qqa-t49-tri-');
  fs.writeFileSync(path.join(triDir, 'messages'), '', 'utf8'); // 确保父目录存在失败也无妨
} {
  // 三段式文件名反解：模拟 provider 产 qq:group:123 时 sanitize 落盘为 qq_group_123.json
  const dir = mktmp('qqa-t49-tri2-');
  fs.mkdirSync(path.join(dir, 'messages'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'messages', 'qq_group_789.json'),
    JSON.stringify({ chatKey: 'qq:group:789', nextLocalId: 2, messages: [
      { id: 1, mid: 9, ts: 5, self: false, read: true, isPoke: false, senderId: '1', senderName: 'b', text: 'hi', atMe: null, media: [] },
      { id: 2, mid: 10, ts: 6, self: false, read: false, isPoke: false, senderId: '2', senderName: 'c', text: 'yo', atMe: null, media: [] },
    ] }), 'utf8');
  const store = createChatStore({ dataDir: dir, log: {} });
  const chats = store.listChats();
  eq(chats.length, 1, '三段式文件被枚举');
  eq(chats[0]?.chatKey, 'qq:group:789', 'chatKey 还原为三段式');
  eq(chats[0]?.unread, 1, '未读计数正常');
  // 两段式 + 三段式共存
  fs.writeFileSync(path.join(dir, 'messages', 'group_100.json'),
    JSON.stringify({ chatKey: 'group:100', nextLocalId: 1, messages: [
      { id: 1, mid: 1, ts: 9, self: false, read: false, isPoke: false, senderId: '3', senderName: 'd', text: 'z', atMe: null, media: [] },
    ] }), 'utf8');
  eq(store.listChats().length, 2, '两段式与三段式共存枚举');
  // 非法文件名不枚举
  fs.writeFileSync(path.join(dir, 'messages', 'garbage.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(dir, 'messages', 'notegroup_1.json'), '{}', 'utf8');
  const all = store.listChats().map((c) => c.chatKey);
  ok(!all.some((k) => k.includes('garbage')), '非法文件名不枚举');
  ok(!all.includes('note:group:1'), '前缀非平台语义（note_）不误判为会话——notegroup_1 整体不匹配');
}

section('OneBot provider：归一化 actions 与入站回调行为');
{
  const calls = [];
  const events = [];
  const statuses = [];
  class FakeClient {
    constructor(options) {
      this.options = options;
      this.selfId = '20001';
      this.connected = false;
      this.closed = false;
    }
    async connect() {
      this.connected = true;
      this.options.onStatus({ connected: true, selfId: this.selfId });
      this.options.onEvent({ post_type: 'message', message_type: 'group', group_id: 111, user_id: 222, message_id: -7, raw_message: 'hello', sender: { nickname: '阿明' }, message: [{ type: 'text', data: { text: 'hello' } }] });
    }
    async close() { this.closed = true; this.connected = false; this.options.onStatus({ connected: false }); }
    reconnect() { this.options.onStatus({ connected: true, selfId: this.selfId, reconnect: true }); }
    async call(action, params) {
      calls.push([action, params]);
      if (action === 'get_group_list') return { data: [{ group_id: 111, group_name: '测试群' }] };
      if (action === 'get_friend_list') return { data: [{ user_id: 222, remark: '阿明', nickname: '明' }] };
      if (action === 'get_group_member_list') return { data: [{ user_id: 1, nickname: 'n1', card: 'c1' }, { user_id: 2, nickname: 'n2', card: '' }] };
      if (action === 'get_group_member_info') return { data: { shut_up_timestamp: params.group_id === 100 ? Math.floor(Date.now() / 1000) + 600 : 0 } };
      if (action === 'get_forward_msg') return { data: { messages: [{ user_id: 1, message: 'forwarded' }] } };
      if (action === 'get_image') return { data: { file: '/tmp/a.png', url: 'https://img.example/a.png' } };
      if (action.startsWith('send_')) return { data: { message_id: 99 } };
      return { data: {} };
    }
  }
  const provider = createOneBotProvider({
    cfg: () => ({}), log: {}, clientFactory: FakeClient,
    onEvent: (event) => events.push(event), onStatus: (status) => statuses.push(status), tokenCandidates: () => [''],
  });
  await provider.start();
  eq(events[0]?.type, 'message', 'OneBot 原始消息归一化为 message 事件');
  eq(events[0]?.kind, 'group', '入站事件 kind=group');
  eq(events[0]?.id, '111', '入站事件 id=group_id');
  eq(statuses[0]?.selfId, '20001', 'status 传出 selfId');
  eq(provider.status().connected, true, 'status() 读取 provider 状态');
  eq(await provider.actions.listGroups(), [{ id: '111', name: '测试群' }], 'listGroups 归一化');
  eq(await provider.actions.listFriends(), [{ id: '222', name: '阿明' }], 'listFriends 归一化');
  eq((await provider.actions.getGroupMembers(111))[0], { userId: '1', nickname: 'n1', card: 'c1' }, 'getGroupMembers 归一化');
  eq((await provider.actions.getForward(-7)).messages[0].message, 'forwarded', 'getForward 走 provider');
  eq((await provider.actions.getImage('file-x')).url, 'https://img.example/a.png', 'getImage 走 provider');
  eq((await provider.actions.getSelfMemberInfo('group:100')).muted, true, '未来禁言时间 → muted=true');
  eq((await provider.actions.getSelfMemberInfo('group:101')).muted, false, '过期/零禁言时间 → muted=false');
  provider.reconnect();
  eq(statuses.at(-1)?.reconnect, true, 'reconnect 由 provider 暴露');
  await provider.stop();
  eq(statuses.at(-1)?.connected, false, 'stop 传出 disconnected');
  ok(calls.some(([action]) => action === 'get_forward_msg'), 'getForward 使用原始 action 但只在 provider 内');
  ok(calls.some(([action]) => action === 'get_image'), 'getImage 使用原始 action 但只在 provider 内');
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function withFakeIntervals(run) {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const timers = new Set();
  const created = [];
  globalThis.setInterval = (callback) => {
    const timer = { callback, unref() {} };
    timers.add(timer);
    created.push(timer);
    return timer;
  };
  globalThis.clearInterval = (timer) => timers.delete(timer);
  try {
    await run({ timers, created, tick: async () => {
      for (const timer of [...timers]) await timer.callback();
    } });
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
}

section('默认 OneBot provider：portProbe 驱动晚启动重连，stop 停探测');
await withFakeIntervals(async ({ timers, tick }) => {
  let reconnects = 0;
  let probes = 0;
  let connects = 0;
  class LateStartClient {
    constructor(options) { this.options = options; this.selfId = '999'; this.connected = false; }
    // 启动时协议端未就绪：连不上
    async connect() { connects++; this.connected = false; this.options.onStatus({ connected: false, error: 'ECONNREFUSED' }); }
    async close() { this.connected = false; }
    reconnect() { reconnects++; this.connected = true; this.options.onStatus({ connected: true, selfId: this.selfId }); }
    async call() { return { data: {} }; }
  }
  const provider = createOneBotProvider({
    cfg: () => ({ onebot: { wsUrl: 'ws://127.0.0.1:3001' } }), log: {}, clientFactory: LateStartClient,
    onEvent: () => {}, onStatus: () => {}, tokenCandidates: () => [''],
    portProbe: async () => { probes++; return true; },   // 端口已就绪
    portProbeIntervalMs: 10,
  });
  await Promise.all([provider.start(), provider.start()]);
  await provider.start();
  eq(connects, 1, '并发及重复 start 只连接一次');
  eq(timers.size, 1, '并发及重复 start 只创建一个探测定时器');
  eq(provider.connected, false, '启动时未连上（外部服务未起）');
  await tick();
  ok(probes >= 1, '端口探测在跑');
  eq(reconnects, 1, '探测到端口就绪后触发重连');
  eq(provider.connected, true, '重连成功');
  const probesWhenHealthy = probes;
  await tick();
  eq(probes, probesWhenHealthy, '连接健康后不再端口探测');
  eq(reconnects, 1, '连接健康后不再反复重连');
  await provider.stop();
  eq(timers.size, 0, 'stop 清除全部探测定时器');
  const probesAfterStop = probes;
  await tick();
  eq(probes, probesAfterStop, 'stop 后探测停止');
  provider.reconnect();
  eq(reconnects, 1, 'stop 后显式 reconnect 不复活连接');
  eq(provider.connected, false, 'stop 后显式 reconnect 保持断开');
});

section('OneBot provider：停止时未完成的探测与旧代际回调不能复活连接');
await withFakeIntervals(async ({ timers, created }) => {
  let probes = 0;
  let reconnects = 0;
  const pending = [];
  class DeferredProbeClient {
    constructor() { this.connected = false; }
    async connect() { this.connected = false; }
    async close() { this.connected = false; }
    reconnect() { reconnects++; this.connected = true; }
  }
  const provider = createOneBotProvider({
    cfg: () => ({}), log: {}, clientFactory: DeferredProbeClient,
    portProbe: () => { probes++; const probe = deferred(); pending.push(probe); return probe.promise; },
    portProbeIntervalMs: 10,
  });
  await provider.start();
  const firstTimer = created.at(-1);
  const stoppedProbe = firstTimer.callback();
  eq(probes, 1, '受控探测已经开始');
  await firstTimer.callback();
  eq(probes, 1, '同一代探测未完成时不并发探测');
  await provider.stop();
  pending[0].resolve(true);
  await stoppedProbe;
  eq(reconnects, 0, 'stop 清定时器后迟到的探测结果不触发重连');
  eq(provider.connected, false, '迟到的探测结果保持已停止状态');
  await firstTimer.callback();
  eq(probes, 1, '停止后已排队的旧定时器回调不再探测');

  await provider.start();
  const oldTimer = created.at(-1);
  const oldProbe = oldTimer.callback();
  await provider.stop();
  await provider.start();
  const newTimer = created.at(-1);
  const newProbe = newTimer.callback();
  eq(probes, 3, '重启后新一代不被旧代未完成探测阻塞');
  await oldTimer.callback();
  eq(probes, 3, '重启后旧代定时器回调不再启动探测');
  pending[1].resolve(true);
  await oldProbe;
  eq(reconnects, 0, '旧代成功结果不得重连新一代');
  await newTimer.callback();
  eq(probes, 3, '旧代 finally 不得释放新一代探测互斥闸');
  pending[2].reject(new Error('临时探测失败'));
  await newProbe;
  const retryProbe = newTimer.callback();
  eq(probes, 4, '探测失败后当前代允许下一轮重试');
  provider.client.connected = true;
  pending[3].resolve(true);
  await retryProbe;
  eq(reconnects, 0, 'await 探测期间连接恢复则不拆健康连接');
  provider.client.connected = false;
  const readyProbe = newTimer.callback();
  pending[4].resolve(true);
  await readyProbe;
  eq(reconnects, 1, '当前代成功探测仍能正常重连');
  await provider.stop();
  eq(timers.size, 0, '多次启停后不遗留定时器');
});

section('OneBot provider：start 等待 connect 期间 stop 与重启保持代际隔离');
await withFakeIntervals(async ({ timers }) => {
  const connects = [];
  let reconnects = 0;
  class DeferredConnectClient {
    constructor() { this.connected = false; }
    connect() { const connect = deferred(); connects.push(connect); return connect.promise; }
    async close() { this.connected = false; }
    reconnect() { reconnects++; }
  }
  const provider = createOneBotProvider({
    cfg: () => ({}), log: {}, clientFactory: DeferredConnectClient,
    portProbe: async () => true, portProbeIntervalMs: 10,
  });
  const stoppedStart = provider.start();
  await provider.start();
  eq(connects.length, 1, 'connect 未完成时重复 start 不重复连接');
  await provider.stop();
  connects[0].resolve();
  await stoppedStart;
  eq(timers.size, 0, 'stop 后迟到的 connect 不创建探测定时器');
  provider.reconnect();
  eq(reconnects, 0, '迟到 connect 完成后显式 reconnect 仍被停机闸拦截');

  const oldStart = provider.start();
  await provider.stop();
  const newStart = provider.start();
  connects[2].resolve();
  await newStart;
  connects[1].resolve();
  await oldStart;
  eq(timers.size, 1, '旧代 connect 晚于新代完成仍只保留新代定时器');
  provider.reconnect();
  eq(reconnects, 1, '新一代启动后显式 reconnect 恢复可用');
  await provider.stop();
  eq(timers.size, 0, 'connect 交错启停后不遗留定时器');

  const failedStart = provider.start().then(() => false, () => true);
  connects[3].reject(new Error('连接失败'));
  eq(await failedStart, true, '当前代 connect 失败仍向调用方抛错');
  const retryStart = provider.start();
  eq(connects.length, 5, 'connect 失败后允许重新 start');
  connects[4].resolve();
  await retryStart;
  await provider.stop();

  const staleFailedStart = provider.start().then(() => false, () => true);
  await provider.stop();
  const healthyStart = provider.start();
  connects[6].resolve();
  await healthyStart;
  connects[5].reject(new Error('旧代连接失败'));
  eq(await staleFailedStart, true, '旧代 connect 失败仍通知原调用方');
  provider.reconnect();
  eq(reconnects, 2, '旧代 connect 失败不关闭新代 started 闸');
  eq(timers.size, 1, '旧代 connect 失败不影响新代定时器');
  await provider.stop();
  eq(timers.size, 0, '失败及重试后停机不遗留定时器');
});

section('createKernel：transportFactory 收到 callbacks，入站事件进入内核');
{
  const dir = mktmp('qqa-t49-kernel-');
  const appRoot = path.join(dir, 'app'), workspace = path.resolve(import.meta.dirname, '..');
  for (const name of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, name), { recursive: true });
  for (const name of ['src', 'ui']) fs.cpSync(path.join(workspace, name), path.join(appRoot, name), { recursive: true });
  fs.copyFileSync(path.join(workspace, 'package.json'), path.join(appRoot, 'package.json'));
  const factoryArgs = [];
  const statuses = [];
  const events = [];
  const fakeTransport = {
    id: 'injected-test',
    selfId: 'test-self',
    connected: false,
    bind({ onEvent, onStatus }) { this.onEvent = onEvent; this.onStatus = onStatus; return this; },
    async start() {
      this.connected = true;
      this.onStatus({ connected: true, selfId: 'test-self' });
      this.onEvent({ kind: 'private', id: '200', type: 'message', event: {
        user_id: '200', message_id: 'm-1', time: Math.floor(Date.now() / 1000),
        raw_message: 'factory ingress', message_type: 'private',
        sender: { nickname: 'Factory User' }, message: [{ type: 'text', data: { text: 'factory ingress' } }],
      } });
    },
    async stop() { this.connected = false; },
    async send() { return [{ msgId: 'out-1' }]; },
    toPlatformSegments: (segments) => segments,
    actions: {},
    segmentSupport: { text: true },
    status() { return { id: this.id, connected: this.connected, selfId: this.selfId }; },
  };
  const kernel = createKernel({
    appRoot,
    env: { QQ_AGENT_DATA_DIR: path.join(dir, 'data'), QQ_AGENT_PORT: '0', QQ_AGENT_PROFILE: '1', QQ_AGENT_MIGRATE_FROM: path.join(dir, 'absent-migration-source') },
    headless: true,
    transportFactory: (context) => { factoryArgs.push(context); return fakeTransport; },
    priceUpdates: { resolve: () => null, refresh: async () => ({ ok: true, remote: false }) },
    communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
    fetchImpl: async url => { blocked.push({ kind: 'host-fetch', url: String(url) }); throw new Error('transport fixture forbids external HTTP'); },
  });
  disposers.push(() => kernel.stop());
  kernel.bus.on('message.in', (event) => events.push(event), { internal: true });
  kernel.bus.on('transport.status', (status) => statuses.push(status), { internal: true });
  kernel.config.update({ allowAllWhenEmpty: true, server: { port: 0, token: 't49-token' }, telemetry: { enabled: false }, proactive: { enabled: false }, memory: { consolidateEnabled: false } });
  const kernelPort = await kernel.start();
  ownedOrigins.add(`http://127.0.0.1:${kernelPort}`);
  eq(kernel.loader.listEntries().map(entry => entry.id), [], 'injected transport kernel scans only its empty owned extension roots');
  await new Promise((resolve) => setTimeout(resolve, 30));
  eq(Object.keys(factoryArgs[0] ?? {}).sort(), ['cfg', 'current', 'emit', 'log', 'onEvent', 'onStatus', 'signal'], 'trusted factory 获得明确依赖、受控事件和代际回调，不暴露 raw kernel');
  eq(typeof factoryArgs[0].cfg, 'function', 'trusted factory 保留配置 getter');
  eq(typeof factoryArgs[0].emit, 'function', 'factory 获得受控事件发布入口');
  eq(factoryArgs[0].current(), true, '运行中的 factory 代际有效');
  eq(factoryArgs[0].signal.aborted, false, '运行中的 factory 取消信号未中止');
  eq(kernel.transport.id, 'injected-test', '注入 provider 暴露为 kernel.transport');
  eq(kernel.onebot.id, 'injected-test', 'deprecated kernel.onebot 兼容别名');
  eq(kernel.store.unread('private:200').length, 1, 'provider 入站消息进入 ingest/store');
  ok(statuses.some((status) => status.selfId === 'test-self'), 'transport status 包含 selfId');
  ok(statuses.some((status) => status.id === 'injected-test'), 'transport status 包含 provider id');

  // 控制台 status DTO 必须反映 provider 状态（不能只看内核 selfId）
  const statusRes = await fetch(`http://127.0.0.1:${kernelPort}/api/status`, { headers: { 'x-console-token': 't49-token' } });
  eq(statusRes.status, 200, '/api/status 200');
  const dto = (await statusRes.json()).onebot;
  eq(dto.connected, true, '控制台 status 反映 provider connected');
  eq(dto.selfId, 'test-self', '控制台 status 反映 provider selfId');
  eq(dto.id, 'injected-test', '控制台 status 带 provider id');

  // 停机后 provider 的迟到事件不得再进入内核
  const before = kernel.store.unread('private:200').length;
  fakeTransport.onEvent({ kind: 'private', id: '300', type: 'message', event: {
    user_id: '300', message_id: 'm-late', time: Math.floor(Date.now() / 1000), raw_message: 'late',
    message_type: 'private', sender: { nickname: 'Late' }, message: [{ type: 'text', data: { text: 'late' } }],
  } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  eq(kernel.store.unread('private:200').length, before, '停机前事件仍处理');

  await kernel.stop();
  eq(fakeTransport.connected, false, 'kernel.stop 调 provider.stop');
  eq(factoryArgs[0].current(), false, '停机后旧 factory 代际失效');
  eq(factoryArgs[0].signal.aborted, true, '停机后旧 factory 取消信号中止');
  fakeTransport.onEvent({ kind: 'private', id: '400', type: 'message', event: {
    user_id: '400', message_id: 'm-after-stop', time: Math.floor(Date.now() / 1000), raw_message: 'after stop',
    message_type: 'private', sender: { nickname: 'After' }, message: [{ type: 'text', data: { text: 'after stop' } }],
  } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  eq(kernel.store.unread('private:400').length, 0, '停机后迟到事件被忽略');
}

section('orchestrator：慢路径走 transport.actions（平台词不再出现在调度器）');
{
  const dir = mktmp('qqa-t49-orch-');
  const cfg = () => ({
    api: { model: 'test-model', maxRounds: 12, timeoutMs: 5000 },
    wake: { tier: 4, randomPercent: 100 },
  });
  const store = createChatStore({ dataDir: dir, log: {} });
  const memory = createMemoryStore({ dataDir: dir, log: {} });
  const sessions = createSessionRegistry({ dataDir: dir, log: {}, bus: null, keepSessionFiles: () => 0 });
  const slowCalls = [];
  const mockTransport = {
    id: 'mock',
    selfId: '999',
    async start() {}, async stop() {},
    toPlatformSegments: (s) => s,
    async send() { return [{ msgId: 1 }]; },
    actions: {
      async getSelfMemberInfo(chatKey) { slowCalls.push(chatKey); return { muted: true }; },
    },
    segmentSupport: {},
  };
  const send = createSendQueue({ transport: mockTransport, store, log: {}, cfg, bus: null });
  const orch = createOrchestrator({
    cfg, store, sessions, memory, send, registry: { list: () => [], availability: () => ({ ok: true }) },
    log: {},
    loader: { promptSections: () => [], hooksOf: () => [], listEntries: () => [], isActive: () => true },
    transport: mockTransport,
    buildToolsFor: () => ({ tools: [], excludedTools: [], invoke: async () => ({ ok: true, result: 'ok' }) }),
    execContextFor: () => ({ send }),
  });
  disposers.push(() => { orch.stop(); sessions.stop(); });
  store.appendIncoming('group:100', { mid: 1, ts: Date.now(), senderId: '555', senderName: 'A', text: '@x 在吗', atMe: true, atNames: [] });
  const sess = sessions.create('group:100', { trigger: 'x' });
  await orch.wake('group:100', { waitingSessionId: sess.id, verified: true });
  eq(slowCalls.length, 1, '慢路径调用 transport.actions.getSelfMemberInfo');
  eq(slowCalls[0], 'group:100', '入参为 chatKey（不再拼 group_id/user_id）');
  eq(sessions.peek(sess.id).status, 'aborted', 'muted=true → 闸 3 拦截');
  ok(String(sessions.peek(sess.id).error ?? '').includes('禁言'), '错误文案含禁言');
}

section('orchestrator：兼容键 onebot 仍被接受（存量调用方）');
{
  const dir = mktmp('qqa-t49-orch2-');
  const cfg = () => ({ api: { model: 'test-model', maxRounds: 12, timeoutMs: 5000 } });
  const store = createChatStore({ dataDir: dir, log: {} });
  const memory = createMemoryStore({ dataDir: dir, log: {} });
  const sessions = createSessionRegistry({ dataDir: dir, log: {}, bus: null, keepSessionFiles: () => 0 });
  const slowCalls = [];
  const legacyOnebot = {
    selfId: '999',
    actions: { async getSelfMemberInfo(chatKey) { slowCalls.push(chatKey); return { muted: false }; } },
  };
  const send = createSendQueue({ transport: legacyOnebot, store, log: {}, cfg, bus: null });
  const orch = createOrchestrator({
    cfg, store, sessions, memory, send, registry: { list: () => [], availability: () => ({ ok: true }) },
    log: {},
    loader: { promptSections: () => [], hooksOf: () => [], listEntries: () => [], isActive: () => true },
    onebot: legacyOnebot, // 旧键
    llmInvoker: async () => ({ message: { role: 'assistant', content: '' }, finishReason: 'stop' }),
    buildToolsFor: () => ({ tools: [], excludedTools: [], invoke: async () => ({ ok: true, result: 'ok' }) }),
    execContextFor: () => ({ send }),
  });
  disposers.push(() => { orch.stop(); sessions.stop(); });
  store.appendIncoming('group:100', { mid: 1, ts: Date.now(), senderId: '555', senderName: 'A', text: '@x 在吗', atMe: true, atNames: [] });
  const sess = sessions.create('group:100', { trigger: 'x' });
  await orch.wake('group:100', { waitingSessionId: sess.id, verified: true });
  eq(slowCalls.length, 1, '兼容键 onebot → 慢路径同样生效');
}

section('orchestrator：旧式 onebot.call（无 actions）→ 慢路径静默降级 muted=false');
{
  const dir = mktmp('qqa-t49-orch3-');
  const cfg = () => ({ api: { model: 'test-model', maxRounds: 12, timeoutMs: 5000 } });
  const store = createChatStore({ dataDir: dir, log: {} });
  const memory = createMemoryStore({ dataDir: dir, log: {} });
  const sessions = createSessionRegistry({ dataDir: dir, log: {}, bus: null, keepSessionFiles: () => 0 });
  const legacyStyle = { call: async () => ({ data: { shut_up_timestamp: 0 } }), selfId: '999' }; // 18 测试的 mock 形态
  const send = createSendQueue({ transport: legacyStyle, store, log: {}, cfg, bus: null });
  const orch = createOrchestrator({
    cfg, store, sessions, memory, send, registry: { list: () => [], availability: () => ({ ok: true }) },
    log: {},
    loader: { promptSections: () => [], hooksOf: () => [], listEntries: () => [], isActive: () => true },
    transport: legacyStyle,
    llmInvoker: async () => ({ message: { role: 'assistant', content: '' }, finishReason: 'stop' }),
    buildToolsFor: () => ({ tools: [], excludedTools: [], invoke: async () => ({ ok: true, result: 'ok' }) }),
    execContextFor: () => ({ send }),
  });
  disposers.push(() => { orch.stop(); sessions.stop(); });
  store.appendIncoming('group:100', { mid: 1, ts: Date.now(), senderId: '555', senderName: 'A', text: '@x 在吗', atMe: true, atNames: [] });
  const sess = sessions.create('group:100', { trigger: 'x' });
  await orch.wake('group:100', { waitingSessionId: sess.id, verified: true });
  ok(sessions.peek(sess.id).status !== 'aborted' || !String(sessions.peek(sess.id).error ?? '').includes('禁言'), '无 actions 契约 → 不误判禁言（降级 muted=false）');
}

} finally {
  for (const dispose of disposers.reverse()) await dispose();
  globalThis.fetch = nativeFetch;
  for (const [target, key, original] of dnsOriginals) target[key] = original;
  syncBuiltinESMExports();
  eq(blocked, [], 'actual Node fetch/DNS and host HTTP stay within the owned console origin');
  console.log(JSON.stringify({ isolation: 49, entries: [], blocked, loopbackLookups, ownedOrigins: [...ownedOrigins] }));
  for (const folder of temporaryRoots) {
    const target = path.resolve(folder);
    if (path.dirname(target).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase() || !path.basename(target).startsWith('qqa-t49-')) throw new Error('49 unsafe cleanup');
    fs.rmSync(target, { recursive: true, force: true });
  }
}
summary('49-transport-inject');

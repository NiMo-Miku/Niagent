// 312 · 好友申请链路（开发任务三,宿主侧）：
// ① provider 解析 request_type==='friend' → 归一化 friend_request 事件（群申请不受影响）
// ② transport actions.setFriendAddRequest({flag,approve}) 原样回传 flag
// ③ core.events 把 friend_request 确定性分发给 friend.request 能力（claimAsync,无人认领=留待人工）
import assert from 'node:assert/strict';
import { createOneBotProvider } from '../src/transports/onebot/provider.js';
import { handleProviderEvent } from '../bundled/runtime-defaults/business.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createChatStore } from '../src/kernel/store.js';
import { Bus } from '../src/kernel/bus.js';
import { mktmp } from './helpers.mjs';

// ---- mock OneBot client：记录 call,允许测试注入事件 ----
function makeMockClient() {
  const calls = [];
  const handlers = {
    get_login_info: () => ({ user_id: 999999, nickname: '小鲸鱼' }),
    get_stranger_info: ({ user_id }) => ({ user_id, nickname: `用户${user_id}` }),
    get_friend_list: () => [],
    set_friend_add_request: () => ({}),
  };
  const client = {
    selfId: '999999',
    _configurationGeneration: 0,
    emit(raw) { client._opts?.onEvent?.(raw); },
    async call(action, params = {}) {
      calls.push({ action, params: structuredClone(params) });
      const handler = handlers[action];
      if (!handler) throw new Error(`mock client 未实现动作 ${action}`);
      return { status: 'ok', retcode: 0, data: handler(params) };
    },
    configure() {}, reconnect() {},
  };
  return { client, calls };
}

const { client, calls } = makeMockClient();
const events = [];
const provider = createOneBotProvider({
  cfg: () => ({ onebot: { wsUrl: 'ws://127.0.0.1:1', httpUrl: 'http://127.0.0.1:1', accessToken: '' } }),
  onEvent: (event) => events.push(event),
  clientFactory: function MockClient(options) { client._opts = options; return client; },
});

console.log('· provider 解析：request_type=friend → friend_request;群申请事件形状不变');
client.emit({ post_type: 'request', request_type: 'friend', user_id: 666, comment: '我是群里的小明', flag: 'F1', time: 1 });
assert.deepEqual(events.at(-1), { kind: 'friend', id: '666', type: 'friend_request', event: { post_type: 'request', request_type: 'friend', user_id: 666, comment: '我是群里的小明', flag: 'F1', time: 1 } });
client.emit({ post_type: 'request', request_type: 'group', sub_type: 'add', group_id: 100, user_id: 777, comment: '想进群', flag: 'G1' });
assert.equal(events.at(-1).type, 'join_request', '群入群申请事件形状不变');
assert.equal(events.at(-1).kind, 'group');

console.log('· setFriendAddRequest：flag 原样回传;非法入参拒绝');
await provider.actions.setFriendAddRequest({ flag: 'F1', approve: true });
assert.deepEqual(calls.find((c) => c.action === 'set_friend_add_request'), { action: 'set_friend_add_request', params: { flag: 'F1', approve: true } });
await provider.actions.setFriendAddRequest({ flag: 'x'.repeat(500), approve: false });
assert.deepEqual(calls.at(-1).params, { flag: 'x'.repeat(500), approve: false });
await assert.rejects(provider.actions.setFriendAddRequest({ flag: '', approve: true }), /标识/);
await assert.rejects(provider.actions.setFriendAddRequest({ flag: 'F1' }), /approve/);
await assert.rejects(provider.actions.setFriendAddRequest({ approve: true }), /标识/);
assert.equal(calls.filter((c) => c.action === 'set_friend_add_request').length, 2, '非法入参不触达协议端');

console.log('· core.events 确定性分发：friend.request 收到归一化载荷;无人认领=留待人工不报错');
const dir = mktmp('qqa-friend-312-');
const store = createChatStore({ dataDir: dir, log: {} });
const bus = new Bus({ error: () => {}, warn: () => {} });
const registry = createCapabilityRegistry({ log: {} });
const received = [];
registry.register('friend.request', 'fixture-plugin', async (payload) => {
  received.push(payload);
  return { handled: true };
});
const context = {
  ingest: { ingestMessage: async () => ({ accepted: false }) },
  orchestrator: { onIncoming: async () => {}, isPaused: () => false },
  cfg: () => ({ commandMute: { enabled: false } }), config: { update() {} }, store, bus, log: { info() {}, warn() {}, error() {} },
  capability: registry, selfIdOf: () => '999999', forwardMedia: async () => ({}), signal: null, current: () => true,
};
await handleProviderEvent({ kind: 'friend', id: '666', type: 'friend_request', event: { user_id: 666, comment: '  群里的小明  ', flag: 'F2' } }, context);
assert.deepEqual({ ...received[0], signal: undefined }, { kind: 'friend', userId: '666', comment: '  群里的小明  ', flag: 'F2', signal: undefined }, '载荷归一化（comment 原样透传,由消费插件自行 trim;signal 为宿主取消链）');
assert.ok('signal' in received[0], '载荷含 signal');

const emptyContext = { ...context, capability: createCapabilityRegistry({ log: {} }) };
await handleProviderEvent({ kind: 'friend', id: '777', type: 'friend_request', event: { user_id: 777, comment: '', flag: 'F3' } }, emptyContext);
assert.equal(received.length, 1, '无人认领不报错不重试');

console.log('· 多提供者：按注册序第一个认领者获胜;抛错提供者被跳过');
const registry2 = createCapabilityRegistry({ log: {} });
const order = [];
registry2.register('friend.request', 'bad-plugin', async () => { order.push('bad'); throw new Error('boom'); });
registry2.register('friend.request', 'good-plugin', async (payload) => { order.push('good'); return payload.flag === 'F4' ? { handled: true } : null; });
await handleProviderEvent({ kind: 'friend', id: '888', type: 'friend_request', event: { user_id: 888, comment: '', flag: 'F4' } }, { ...context, capability: registry2 });
assert.deepEqual(order, ['bad', 'good'], '抛错不连累后续提供者');

console.log('✓ 312-friend-request：好友申请事件/动作/分发合同全部通过');

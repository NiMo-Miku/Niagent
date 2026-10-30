// 04 · 能力注册表：函数提供者不丢 / 多提供者 / claim-skip / owner 活性 / explain
import { ok, eq, section, summary } from './helpers.mjs';
import { createCapabilityRegistry, MULTI_PROVIDER_CAPABILITIES } from '../src/kernel/capability.js';

const logs = [];
const reg = createCapabilityRegistry({ log: { error: (m) => logs.push(m) } });

section('函数提供者不丢（0.4 真实事故：只判 typeof object 静默丢函数）');
reg.register('media.transcribe', 'plugin-a', (v) => `T:${v}`);
eq(reg.has('media.transcribe'), true, '函数提供者 has=true');
eq(reg.consume('media.transcribe', 'hi'), 'T:hi', '函数提供者可消费');
eq(typeof reg.providers('media.transcribe')[0].provider, 'function', '函数提供者原样保留在 providers 里');
eq(reg.explain('media.transcribe').providers[0].kind, 'function', 'explain kind=function');

section('null 占位登记（capabilities[] 只声明不实现）');
reg.register('media.download', 'plugin-b', null);
eq(reg.has('media.download'), false, '纯占位 = 不可用');

section('多提供者（6 个天生多提供者能力）');
eq([...MULTI_PROVIDER_CAPABILITIES].length, 6, '6 个多提供者能力');
reg.register('media.download', 'bili', (url) => url.includes('bilibili') ? { ok: true, src: 'bili' } : null);
reg.register('media.download', 'douyin', (url) => url.includes('douyin') ? { ok: true, src: 'dy' } : null);
const bili = reg.claim('media.download', 'https://bilibili.com/x');
eq(bili.result.src, 'bili', 'B站链接被 bili 认领');
const dy = reg.claim('media.download', 'https://douyin.com/y');
eq(dy.result.src, 'dy', '抖音链接被 douyin 认领');
eq(reg.claim('media.download', 'https://example.com'), null, '无人认领返回 null');

section('owner 覆盖注册（热重载语义：同 owner 覆盖不叠加）');
reg.register('chat.ban-state', 'plugin-a', { check: 1 });
reg.register('chat.ban-state', 'plugin-a', { check: 2 });
eq(reg.providers('chat.ban-state').length, 1, '同 owner 覆盖，不叠加');
eq(reg.consume('chat.ban-state').check, 2, '取到新版本');

section('owner 活性过滤（SPEC §7.5：has 与 providers 同口径）');
let active = { 'plugin-a': true, bili: true, douyin: true };
const reg2 = createCapabilityRegistry({ log: {} });
reg2._setActiveProbe((id) => active[id] ?? false);
reg2.register('tool.guard', 'plugin-a', () => ({ block: false }));
reg2.register('tool.guard', 'bili', () => ({ block: true, reason: 'no' }));
eq(reg2.has('tool.guard'), true, '双提供者 active');
active['bili'] = false;
const guards = reg2.providers('tool.guard');
eq(guards.length, 1, '失活 owner 的提供者被过滤');
eq(guards[0].ownerId, 'plugin-a', '剩下的是 active 的');

section('提供者抛错不外溢（claim 时跳过）');
const reg3 = createCapabilityRegistry({ log: { error: (m) => logs.push(m) } });
reg3._setActiveProbe(() => true);
reg3.register('media.download', 'bad', () => { throw new Error('boom'); });
reg3.register('media.download', 'good', (u) => ({ u }));
eq(reg3.claim('media.download', 'x').result.u, 'x', '抛错的提供者被跳过，下一个认领');
ok(logs.length > 0, '提供者异常被记录');

section('unregisterOwner（热重载清旧能力）');
reg2.register('llm.usage', 'plugin-a', {});
reg2.unregisterOwner('plugin-a');
eq(reg2.has('llm.usage'), false, 'owner 注销后能力消失');

section('explain（排障明细）');
const exp = reg.explain('media.download');
eq(exp.exists, true, 'explain.exists');
eq(exp.multi, true, 'media.download 标记 multi');
ok(Array.isArray(exp.providers), 'providers 明细数组');

summary('04-capability');

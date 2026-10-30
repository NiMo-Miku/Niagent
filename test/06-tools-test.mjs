// 06 · 工具注册表：注册守卫 / 覆盖语义 / 八层可用性 / 八步管线（权限闸/参数/guard/否决/超时）
import { ok, eq, throws, section, summary } from './helpers.mjs';
import { createToolRegistry } from '../src/kernel/tools.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { Bus } from '../src/kernel/bus.js';

const logs = [];
const bus = new Bus({ error: (m) => logs.push(m), warn: () => {} });
const caps = createCapabilityRegistry({ log: {} });
const perms = createPermissions({ log: {} });
const reg = createToolRegistry({ log: { error: (m) => logs.push(m), warn: () => {} }, bus, permissions: perms, capabilities: caps });

section('注册守卫（SPEC §7.4：id 正则 / name+execute 必填 / 违规抛错）');
throws(() => reg.register({ id: 'bad id!', name: 'x', execute: () => {} }), '非法 id 抛错');
throws(() => reg.register({ id: 'ok_id', execute: () => {} }), '缺 name 抛错');
throws(() => reg.register({ id: 'ok_id', name: 'x' }), '缺 execute 抛错');
throws(() => reg.register({ id: 'a'.repeat(65), name: 'x', execute: () => {} }), '超 64 字符抛错');
reg.register({ id: 't1', name: 'T1', execute: () => 'a' });
eq(reg.get('t1').name, 'T1', '正常注册');
// 重复 id 覆盖无告警（SUSPECT 复刻：0.4 无告警）
reg.register({ id: 't1', name: 'T1v2', execute: () => 'b' });
eq(reg.get('t1').name, 'T1v2', '重复 id 静默覆盖');

section('可用性判定（SPEC §7.8 八层短路，reason 指向真正原因）');
reg.register({ id: 'send_to', name: '跨发', execute: () => {}, category: 'messaging' });
eq(reg.availability('send_to', {}).code, 'tool-disabled', '5.5 send_to 硬编码闸：crossChatSend 未开 → 不可见（SUSPECT C-02 复刻）');
eq(reg.availability('send_to', { crossChatSend: true }).code, 'ok', '开启后可见');
eq(reg.availability('t1', { toolsEnabled: false }).code, 'tools-disabled', '1 总开关');
eq(reg.availability('t1', { categoryEnabled: (c) => c !== 'system' }).code, 'category-disabled', '4 分类开关');
eq(reg.availability('t1', { override: () => false }).code, 'tool-disabled', '5 单工具 override');
eq(reg.availability('t1', { skillActive: () => false }).code, 'ok', '2 无 ownerId 的工具跳过 skill 活性检查');
reg.register({ id: 'vision_tool', name: 'V', execute: () => {}, requiresVision: true });
eq(reg.availability('vision_tool', { visionEnabled: false }).code, 'no-vision', '6 no-vision 文案');
reg.register({ id: 'search_tool', name: 'S', execute: () => {}, requiresSearch: true });
eq(reg.availability('search_tool', { searchEnabled: false }).code, 'no-search', '6 no-search');
reg.register({ id: 'dep_tool', name: 'D', execute: () => {}, requires: ['media.transcribe'] });
eq(reg.availability('dep_tool', {}).code, 'CAPABILITY_MISSING', '3 硬依赖能力缺失');
caps.register('media.transcribe', 'prov', () => {});
eq(reg.availability('dep_tool', {}).code, 'ok', '能力就绪后可用');

section('tool.guard（多提供者；guard 抛异常不阻断——SUSPECT 复刻：0.4 静默吞）');
caps.register('tool.guard', 'guardian', (id) => (id === 't1' ? { block: true, reason: '测试拦截' } : null));
eq(reg.availability('t1', {}).code, 'skill-guard', '7 guard 否决');
caps.register('tool.guard', 'bad-guard', () => { throw new Error('guard boom'); });
eq(reg.availability('t1', {}).code, 'skill-guard', 'guard 抛异常不阻断判定（继续用其它 guard）');

section('八步管线：权限闸 → 参数校验 → guard → 否决 → 执行');
reg.register({ id: 'free_tool', name: 'F', execute: () => 'free' });
const r1 = await reg.invoke('free_tool', {}, {});
eq(r1.ok, true, '普通工具调用成功');
eq(r1.result, 'free', '结果归一透传');

// 权限闸（第 2 步）
reg.register({ id: 'perm_tool', name: 'P', execute: () => 'secret', scopes: ['net.raw'], ownerId: 'evil' });
const r2 = await reg.invoke('perm_tool', {}, {});
eq(r2.ok, false, 'deny scope 工具被拒');
ok(r2.error.includes('权限不足'), '人话错误文案');

// 参数校验
reg.register({
  id: 'arg_tool', name: 'A',
  params: { type: 'object', properties: { must: { type: 'string' } }, required: ['must'] },
  execute: () => 'ok',
});
const r3 = await reg.invoke('arg_tool', {}, {});
eq(r3.ok, false, '缺 required 参数被拒');
ok(r3.error.includes('must'), '错误指明缺哪个参数');

// before-tool 插件否决（第 5 步）
const r4 = await reg.invoke('free_tool', {}, { beforeToolHooks: [() => ({ block: true, reason: 'nope' })] });
eq(r4.ok, false, '插件钩子可否决');
ok(r4.error.includes('nope'), '否决原因透传');

// 执行超时
reg.register({ id: 'slow_tool', name: '慢', execute: () => new Promise(() => {}) });
const t0 = Date.now();
const r5 = await reg.invoke('slow_tool', {}, {});
ok(!r5.ok && r5.error.includes('超时'), '慢工具超时失败');

section('byOwner / unregister（孤儿清扫支撑）');
reg.register({ id: 'own_a', name: 'a', ownerId: 'p1', execute: () => {} });
reg.register({ id: 'own_b', name: 'b', ownerId: 'p1', execute: () => {} });
eq(reg.byOwner('p1').sort(), ['own_a', 'own_b'], 'byOwner 列表');
reg.unregister('own_b');
eq(reg.byOwner('p1'), ['own_a'], 'unregister 生效');

summary('06-tools');

// 02 · 事件总线：白名单、监听器异常不打崩
import { ok, eq, section, summary } from './helpers.mjs';
import { Bus } from '../src/kernel/bus.js';

const errors = [];
const bus = new Bus({ error: (m) => errors.push(m), warn: () => {}, });
section('白名单');
ok(bus.emit('log', { x: 1 }), '白名单内事件 emit 成功');
ok(!bus.emit('nonexistent-event', {}), '白名单外事件 emit 返回 false');
ok(errors.length > 0, '白名单外 emit 记 error');
errors.length = 0;

section('监听器异常不打崩');
let secondRan = false;
bus.on('server.ready', () => { throw new Error('listener boom'); });
bus.on('server.ready', () => { secondRan = true; });
bus.emit('server.ready', {});
ok(secondRan, '一个监听器抛错不影响后续监听器');
ok(errors.length > 0, '监听器异常被记录');

section('once 与 off');
let hits = 0;
bus.once('plugin.loaded', () => hits++);
bus.emit('plugin.loaded', {});
bus.emit('plugin.loaded', {});
eq(hits, 1, 'once 只触发一次');
const off = bus.on('plugin.unloaded', () => hits++);
off();
bus.emit('plugin.unloaded', {});
eq(hits, 1, 'off 后不再触发');

section('插件可订阅子集（写操作类不开放）');
const bus2 = new Bus({ warn: () => {}, error: () => {} });
ok(bus2.on('message.in', () => {}) !== undefined, 'message.in 可订阅');
bus2.on('message.out', () => {});
eq(bus2.listenerCount('message.out'), 0, 'message.out（写操作类）插件订阅被拒');
bus2.on('message.out', () => {}, { internal: true });
eq(bus2.listenerCount('message.out'), 1, '内核 internal 订阅 message.out 放行');
ok(bus2.emit('message.out', {}) === true, '内核 emit message.out 正常（只是插件订阅不到）');

summary('02-bus');

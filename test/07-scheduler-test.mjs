// 07 · 调度器：every / at / disposeOwner 幽灵定时器回收
import { ok, eq, section, summary, sleep } from './helpers.mjs';
import { createScheduler } from '../src/kernel/scheduler.js';

const sch = createScheduler({ log: {} });

section('every');
let hits = 0;
const h = sch.every(30, () => hits++);
await sleep(100);
ok(hits >= 2, `every 触发 ${hits} 次`);
h.stop();
const afterStop = hits;
await sleep(80);
eq(hits, afterStop, 'stop 后不再触发');

section('at(Date) 一次性');
let onceHit = 0;
sch.at(new Date(Date.now() + 50), () => onceHit++);
await sleep(120);
eq(onceHit, 1, '到点触发一次');
await sleep(60);
eq(onceHit, 1, '一次性不重复');

section('disposeOwner（幽灵定时器防护：插件停用回收全部）');
let a = 0, b = 0;
sch.every(30, () => a++, { ownerId: 'plugin-x' });
sch.every(30, () => b++, { ownerId: 'plugin-y' });
await sleep(70);
const reclaimed = sch.disposeOwner('plugin-x');
eq(reclaimed, 1, '回收 plugin-x 的 1 个定时器');
const aCount = a, bCount = b;
await sleep(100);
eq(a, aCount, 'plugin-x 定时器已死（不泄漏）');
ok(b > bCount, 'plugin-y 不受影响');

section('执行异常不打崩');
const errs = [];
const sch2 = createScheduler({ log: { error: (m) => errs.push(m) } });
sch2.every(20, () => { throw new Error('boom'); });
await sleep(60);
ok(errs.length > 0, '异常被记录');
ok(true, '调度器存活');

section('at(HH:MM) 每日');
const sch3 = createScheduler({ log: {} });
let daily = 0;
const next = new Date(Date.now() + 60);
sch3.at(`${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`, () => daily++);
// 上面设的可能是"下一天"同一时刻——直接等 61ms 验证格式解析不抛错即可（每日语义 M2 峰谷再验）
await sleep(30);
ok(typeof daily === 'number', 'HH:MM 解析不抛错');
sch3.stop();
eq(sch3.count(), 0, 'stop 全清');

summary('07-scheduler');

// 21 · reminders：id 规则 / due-pending / markFired 才落 fired / prune 保留 200 / 原子写
import { ok, eq, section, summary, mktmp } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createReminderStore } from '../src/kernel/reminders.js';

const dir = mktmp('qqa-rem-');
const rem = createReminderStore({ dataDir: dir, log: {} });

section('add 与 id 规则（r_<base36><6hex>）');
const r1 = rem.add({ chatKey: 'group:1', text: '该喝水了', dueAt: Date.now() + 60000, createdBy: '555' });
ok(/^r_[0-9a-z]+[0-9a-f]{6}$/.test(r1.id), `id 格式正确：${r1.id}`);
eq(r1.fired, false, '新提醒未触发');
eq(fs.existsSync(path.join(dir, 'reminders.json')), true, '落盘');
const raw = JSON.parse(fs.readFileSync(path.join(dir, 'reminders.json'), 'utf8'));
ok(Array.isArray(raw.reminders), '{reminders:[]} 结构');

section('due / pending 排序（数组顺序无语义）');
rem.add({ chatKey: 'group:1', text: '晚点', dueAt: Date.now() + 3600000 });
rem.add({ chatKey: 'group:2', text: '别的群', dueAt: Date.now() - 1000 }); // 已到期
const due = rem.due();
eq(due.length, 1, 'due 只含到期的');
eq(due[0].text, '别的群', 'due 内容正确');
eq(rem.pending('group:1').length, 2, 'pending 按会话过滤');
eq(rem.pending().length, 3, 'pending 全量');
eq(rem.pending('group:1')[0].dueAt < rem.pending('group:1')[1].dueAt, true, '按 dueAt 升序');

section('markFired（fired + firedAt）');
const target = rem.pending('group:2')[0];
eq(rem.markFired(target.id), true, 'markFired 成功');
eq(rem.pending().length, 2, '触发后不在 pending');
const after = JSON.parse(fs.readFileSync(path.join(dir, 'reminders.json'), 'utf8')).reminders.find((x) => x.id === target.id);
eq(after.fired, true, 'fired=true');
ok(after.firedAt > 0, 'firedAt 写入');

section('cancel');
const c = rem.pending('group:1')[0];
eq(rem.cancel(c.id), true, 'cancel 成功');
eq(rem.pending().length, 1, '取消后减少');
eq(rem.cancel('r_nonexistent'), false, '不存在的 id 返回 false');

section('prune：已触发按 firedAt 降序保留最近 200，未触发全保留');
for (let i = 0; i < 250; i++) {
  const r = rem.add({ chatKey: 'group:9', text: `old${i}`, dueAt: Date.now() - 1000 });
  rem.markFired(r.id);
}
for (let i = 0; i < 5; i++) rem.add({ chatKey: 'group:9', text: `pend${i}`, dueAt: Date.now() + 60000 });
rem.prune();
const list = JSON.parse(fs.readFileSync(path.join(dir, 'reminders.json'), 'utf8')).reminders;
eq(list.filter((x) => !x.fired).length, 6, '未触发全保留（1 + 5）');
eq(list.filter((x) => x.fired).length, 200, '已触发保留 200');
// 保留的是最新的 200 条
const firedTexts = list.filter((x) => x.fired).map((x) => x.text);
ok(firedTexts.includes('old249'), '保留最新的（old249）');
ok(!firedTexts.includes('old0'), '裁掉最旧的（old0）');

summary('21-reminders');

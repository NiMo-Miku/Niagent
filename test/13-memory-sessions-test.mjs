// 13 · memory + sessions：成员印象仓（去重/升序维护/降序查询/formatForPrompt）+ 会话仓（节流写/僵尸回收/索引缓存）
import { ok, eq, section, summary, mktmp, sleep } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createMemoryStore } from '../src/kernel/memory.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';

const dir = mktmp('qqa-ms-');

section('memory：追加/去重/查询/容量');
const memory = createMemoryStore({ dataDir: dir, log: {} });
memory.append('group:1', { userId: '555', name: '小明', content: '喜欢梗图' });
memory.append('group:1', { userId: '555', name: '小明', content: '喜欢梗图' }); // 重复
eq(memory.query('group:1', { userId: '555' })[0].impressions.length, 1, 'content 全等去重');
memory.append('group:1', { userId: '555', name: '小明', content: '喜欢摸鱼' });
eq(memory.query('group:1', { userId: '555' })[0].impressions.length, 2, '追加成功');
// 升序维护、降序查询
const list = memory.query('group:1', { userId: '555' })[0].impressions;
eq(list[0].content, '喜欢摸鱼', '降序查询（最新在前）');

section('memory：文件名规则');
memory.append('group:1', { userId: '123', name: '纯数字', content: 'x' });
ok(fs.existsSync(path.join(dir, 'memory', 'group_1', '123.json')), '纯数字 → <QQ>.json');
memory.append('group:1', { userId: 'abc-x', name: '非数字', content: 'y' });
ok(fs.existsSync(path.join(dir, 'memory', 'group_1', 'u_abc_x.json')), '非纯数字 → u_<sanitize>.json');
memory.append('group:1', { name: '无名', content: 'z' });
ok(fs.existsSync(path.join(dir, 'memory', 'group_1', '_n_无名.json')), '无 userId → _n_<名字>.json');

section('memory：formatForPrompt（≤3 条/人，≤15 人）');
for (let i = 0; i < 5; i++) memory.append('group:1', { userId: '555', name: '小明', content: `条目${i}` });
const promptText = memory.formatForPrompt('group:1', { userIds: ['555'] });
ok(promptText.includes('【对群友的印象】'), '含标题');
ok(promptText.includes('小明'), '含名字');
eq((promptText.match(/条目\d/g) ?? []).length, 3, '每人最多 3 条');
const memStats = memory.stats('group:1');
ok(memStats.maxPerMember >= 5, 'stats.maxPerMember');

section('memory：remove');
eq(memory.remove('group:1', { userId: '555', content: '条目0' }).ok, true, '按内容删除');
eq(memory.remove('group:1', { userId: '555', content: '不存在' }).ok, false, '不存在报错');
eq(memory.remove('group:1', { userId: '555' }).ok, true, '不指定内容=删成员');
eq(memory.query('group:1', { userId: '555' }).length, 0, '成员已删');

section('memory：markConsolidated');
memory.markConsolidated('group:1');
ok(memory.lastConsolidatedAt('group:1') > 0, '_meta.json 写入');

section('sessions：create/update/finish/节流');
const sessions = createSessionRegistry({ dataDir: dir, log: {} });
const s = sessions.create('group:1', { trigger: '测试' });
eq(s.status, 'running', 'create 默认 running');
ok(fs.existsSync(path.join(dir, 'sessions', `${s.id}.json`)), 'create 立即落盘');
sessions.update(s, { rounds: 3 });
await sleep(2300); // 2s 节流
sessions.finish(s.id, 'done', { sent: [{ text: 'x' }] });
const final = JSON.parse(fs.readFileSync(path.join(dir, 'sessions', `${s.id}.json`), 'utf8'));
eq(final.status, 'done', 'finish 立即落最终态');
eq(final.endedAt != null, true, 'endedAt 写入');

section('sessions：删除事件状态不会被历史 summary 覆盖 / 清空有聚合事件');
const eventBus = { events: [], emit(name, payload) { this.events.push([name, payload]); } };
const eventSessions = createSessionRegistry({ dataDir: mktmp('qqa-ms-events-'), log: {}, bus: eventBus });
const eventSession = eventSessions.create('group:1', { trigger: 'delete' });
eventSessions.finish(eventSession.id, 'done');
ok(eventSessions.delete(eventSession.id), '终态会话可删除');
const deleted = eventBus.events.at(-1)[1];
eq(deleted.status, 'deleted', '删除事件状态为 deleted');
eq(deleted.sessionId, eventSession.id, '删除事件带 sessionId');
const clearOne = eventSessions.create('group:1', { trigger: 'clear' });
eventSessions.finish(clearOne.id, 'noreply');
eq(eventSessions.clearFinished(), 1, '清空返回删除数量');
const cleared = eventBus.events.at(-1)[1];
eq(cleared.status, 'cleared', '清空结束后有聚合事件');
eq(cleared.removed, 1, '聚合事件带 removed');

section('sessions：peek 不克隆 / get 克隆');
const s2 = sessions.create('group:1', { trigger: 'x' });
const peeked = sessions.peek(s2.id);
const got = sessions.get(s2.id);
peeked.rounds = 99;
eq(sessions.peek(s2.id).rounds, 99, 'peek 活对象可改');
eq(got.rounds, 0, 'get 克隆不受活对象污染');

section('sessions：usage-today 汇总');
// usage-today 只在会话终态（done/noreply 等）且非零消耗时写
const sU = sessions.create('group:1', { trigger: 'usage' });
sU.usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15, cachedTokens: 2, calls: 1 };
sessions.finish(sU.id, 'done', { sent: [{ text: 'x' }] });
const todayFile = path.join(dir, 'usage-today.json');
const today = JSON.parse(fs.readFileSync(todayFile, 'utf8'));
eq(today.dayKey !== undefined, true, 'dayKey 存在');
ok(today.totalTokens >= 15, 'usage-today 累计 token');
ok(today.runs >= 1, 'usage-today runs 累计');

section('sessions：僵尸回收（启动时 waiting/running → abortedOnBoot）');
const dir2 = mktmp('qqa-ms2-');
fs.mkdirSync(path.join(dir2, 'sessions'), { recursive: true });
fs.writeFileSync(path.join(dir2, 'sessions', 'zombie.json'), JSON.stringify({
  id: 'zombie', chatKey: 'group:1', startedAt: 1, status: 'running', messages: [], sent: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, calls: 0 },
}));
const sessions2 = createSessionRegistry({ dataDir: dir2, log: {} });
sessions2.reconcileInBackground();
await sleep(200); // setImmediate 后台
const z = JSON.parse(fs.readFileSync(path.join(dir2, 'sessions', 'zombie.json'), 'utf8'));
eq(z.status, 'aborted', '僵尸 running → aborted');
eq(z.abortedOnBoot, true, 'abortedOnBoot=true');

summary('13-memory-sessions');

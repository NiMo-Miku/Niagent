// F-103 / notes12 §3.12: memberNotes is a live display override, not a stored name.
import fs from 'node:fs';
import path from 'node:path';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { createChatStore } from '../src/kernel/store.js';
import { formatEntry } from '../src/kernel/prompt.js';
import { createMemoryConsolidator } from '../bundled/memory-service/consolidator.js';
import { createMemoryConsolidationAdapter } from '../src/console/memory-media-adapters.js';
import { eq, ok, section, summary, mktmp } from './helpers.mjs';

const dataDir = mktmp('qqa-memory-note145-'), log = { warn() {}, error() {} };
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log });
config.load();
config.update({ api: { model: 'qa-memory145' }, memory: { useChatModel: true }, memberNotes: { '20002': '另一位独立备注' } });
const cfg = () => config.get(), memory = createMemoryStore({ dataDir, cfg, log }), store = createChatStore({ dataDir, log });
for (const key of ['group:10001', 'group:10002']) {
  memory.replaceMember(key, { userId: '20001', name: '原群名片甲', impressions: [{ content: '喜欢先确认事实', createdAt: 1 }, { content: '重复印象待整理', createdAt: 2 }] });
  memory.replaceMember(key, { userId: '20002', name: '原群名片乙', impressions: [{ content: '独立保留事实', createdAt: 1 }] });
}
const memberFile = (key, uid) => path.join(dataDir, 'memory', key.replace(':', '_'), `${uid}.json`);
const readMember = (key, uid) => JSON.parse(fs.readFileSync(memberFile(key, uid), 'utf8'));
const beforeFiles = new Map(['group:10001', 'group:10002'].flatMap(key => ['20001', '20002'].map(uid => [memberFile(key, uid), fs.readFileSync(memberFile(key, uid), 'utf8')])));
const entry = { senderId: '20001', senderName: '原群名片甲', text: '正文', ts: 1760000000000 };
const setNote = note => config.update({ memberNotes: { __replace__: { '20002': '另一位独立备注', ...(note ? { '20001': note } : {}) } } });

section('F-103 备注编辑实时作用记忆提示词、跨聊天一致且不写原名');
setNote('备注甲');
for (const key of ['group:10001', 'group:10002']) {
  const prompt = memory.formatForPrompt(key);
  ok(prompt.includes('- 备注甲：喜欢先确认事实'), `${key} 使用即时备注而非旧原名`);
  ok(prompt.includes('- 另一位独立备注：独立保留事实'), `${key} 其它成员仍使用其独立备注`);
}
ok(formatEntry(entry, { memberNotes: cfg().memberNotes }).includes('备注甲'), '普通发言上下文使用同一备注');
setNote('即时新备注甲');
const renamed = memory.formatForPrompt('group:10001', { userIds: ['20001'] });
ok(renamed.includes('- 即时新备注甲：') && !renamed.includes('- 备注甲：'), '编辑备注无需重新整理即生效');
ok(!renamed.includes('独立保留事实'), '相关成员过滤仍隔离其它成员');
for (const [file, raw] of beforeFiles) eq(fs.readFileSync(file, 'utf8'), raw, '显示备注变化不修改记忆业务文件');
setNote('');
const cleared = memory.formatForPrompt('group:10001');
ok(cleared.includes('- 原群名片甲：') && !cleared.includes('即时新备注甲'), '空串删除备注后立即回退真实原名');
ok(cleared.includes('- 另一位独立备注：'), '清甲备注不影响乙备注');
ok(formatEntry(entry, { memberNotes: cfg().memberNotes }).includes('原群名片甲'), '清后发言上下文同样回退原名');

section('整理仅用备注展示模型输入，写回保留成员原名');
setNote('整理时显示备注');
const requests = [];
const run = createMemoryConsolidator({ cfg, memory, store, log, callLLM: async ({ messages }) => {
  const input = JSON.parse(messages[1].content.split('\n').at(-1)); requests.push(input);
  return { message: { content: JSON.stringify({ impressions: input.impressions.slice(0, 1) }) }, usage: {} };
} });
const events = [], adapter = createMemoryConsolidationAdapter({ cfg, memory, store, memoryConsolidator: run, emit: (_name, payload) => events.push(payload) });
eq(adapter.start({ chatKey: 'group:10001', userIds: ['20001'] }).status, 202, '实际异步适配器接受指定成员整理');
for (let i = 0; i < 100 && adapter.running.size; i++) await new Promise(resolve => setTimeout(resolve, 10));
eq(events.at(-1)?.phase, 'consolidate-done', '真实适配器验证并完成写回');
eq(requests[0]?.name, '整理时显示备注', '模型输入使用当前备注帮助识别');
eq(readMember('group:10001', '20001').name, '原群名片甲', '整理不能把备注覆盖成持久原名');
eq(readMember('group:10001', '20001').impressions.length, 1, '真实整理写回一个保留事实');
eq(fs.readFileSync(memberFile('group:10001', '20002'), 'utf8'), beforeFiles.get(memberFile('group:10001', '20002')), '指定整理不写另一成员档');
eq(fs.readFileSync(memberFile('group:10002', '20001'), 'utf8'), beforeFiles.get(memberFile('group:10002', '20001')), '指定整理不写另一个聊天档');
setNote('');
ok(memory.formatForPrompt('group:10001').includes('- 原群名片甲：'), '整理后清备注仍可回退原名');

section('新建成员使用真实发言人原名，无法恢复的旧名保守保留');
config.update({ memberNotes: { __replace__: { '20003': '新建显示备注', '20004': '旧档现存名称' } } });
store.appendIncoming('group:10001', { ...entry, senderId: '20003', senderName: '真实发言原名丙' });
const creationRequests = [];
const createRun = createMemoryConsolidator({ cfg, memory, store, log, callLLM: async ({ messages }) => {
  creationRequests.push(JSON.parse(messages[1].content.split('\n').at(-1)));
  return { message: { content: '{"impressions":[{"content":"基于真实发言提炼","createdAt":3}]}' }, usage: {} };
} });
const created = await createRun({ chatKey: 'group:10001', members: [], userIds: ['20003'], create: true });
eq(creationRequests[0]?.name, '新建显示备注', '新建提炼的模型输入仍使用当前备注');
eq(created.members[0]?.name, '真实发言原名丙', '新建输出保留真实发言原名，备注保持独立');
memory.replaceMember('group:10001', { userId: '20004', name: '旧档现存名称', impressions: [{ content: '旧事实', createdAt: 1 }] });
const legacy = await run({ chatKey: 'group:10001', members: memory.query('group:10001', { userId: '20004' }) });
eq(legacy.members[0]?.name, '旧档现存名称', '已缺失的更早原名不猜测还原');
const noName = await createRun({ chatKey: 'group:10001', members: [{ userId: '20005', name: '', impressions: [{ content: '无名旧事实', createdAt: 1 }] }] });
eq(noName.members[0]?.name, '', '旧档空原名也不被人为猜填');
run.stop(); createRun.stop();
summary('145-memory-note-identity');

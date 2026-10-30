// 23 · migrator：detect 双闸 / config 键迁移 / messages-memory-stickers-reminders 复制 / 只读源三断言
import { ok, eq, section, summary, mktmp } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { detectMigrationSource, migrateFrom04 } from '../src/kernel/migrator.js';

// 仿真 0.4 data/ 目录
function make04Source() {
  const src = mktmp('qqa-04-');
  fs.writeFileSync(path.join(src, 'config.json'), JSON.stringify({
    api: { model: 'deepseek-v4', apiKey: 'sk-old', stream: true, hasApiKey: true, temperature: 0.8 },
    budget: 12, // 废弃键
    store: { contextSliderPos: 55, atCount: 8 },
    persona: { botName: '小鲸鱼', roleText: '老人设' },
    allow: { groups: ['100'], private: [] },
    server: { token: 'old-token', port: 3210 },
    unknownKeyFuture: { keep: 'me' }, // 未知键
  }));
  fs.mkdirSync(path.join(src, 'messages'), { recursive: true });
  fs.writeFileSync(path.join(src, 'messages', 'group_100.json'), JSON.stringify({
    chatKey: 'group:100', nextLocalId: 3,
    messages: [
      { id: 1, mid: 10, ts: 1, senderId: '555', senderName: 'A', text: '老消息', self: false, read: true, atMe: null, atNames: [], media: [], isPoke: false },
      { id: 2, mid: 11, ts: 2, senderId: 'self', senderName: '我', text: '我的回复', self: true, read: true, atMe: null, atNames: [], media: [], isPoke: false },
    ],
  }));
  fs.mkdirSync(path.join(src, 'memory', 'group_100'), { recursive: true });
  fs.writeFileSync(path.join(src, 'memory', 'group_100', '555.json'), JSON.stringify({
    userId: '555', name: '小明', impressions: [{ content: '喜欢梗图', createdAt: 1 }], updatedAt: 1, lastConsolidatedAt: 0,
  }));
  fs.writeFileSync(path.join(src, 'stickers.json'), JSON.stringify([{ id: 's1', desc: '笑', source: 'qq', md5: 'abc' }]));
  fs.mkdirSync(path.join(src, 'sticker-images'), { recursive: true });
  fs.writeFileSync(path.join(src, 'sticker-images', 's1.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(src, 'reminders.json'), JSON.stringify({
    reminders: [
      { id: 'r_1', chatKey: 'group:100', text: '未触发', dueAt: Date.now() + 60000, createdAt: 1, createdBy: '555', fired: false },
      { id: 'r_2', chatKey: 'group:100', text: '已触发', dueAt: 1, createdAt: 1, createdBy: '555', fired: true, firedAt: 2 },
    ],
  }));
  fs.writeFileSync(path.join(src, 'telemetry.json'), JSON.stringify({ installId: 'abc-123-uuid', createdAt: 1 }));
  fs.mkdirSync(path.join(src, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(src, 'sessions', 's1.json'), JSON.stringify({ id: 's1', status: 'done' }));
  fs.mkdirSync(path.join(src, 'onebot'), { recursive: true });
  return src;
}

// 快照源目录（只读断言用）
function snapshot(dir) {
  const out = {};
  (function walk(d, rel = '') {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const r = path.join(rel, e.name);
      if (e.isDirectory()) walk(p, r);
      else out[r] = fs.statSync(p).size + ':' + fs.readFileSync(p).toString('base64').slice(0, 32);
    }
  })(dir);
  return out;
}

section('detect 双闸（目标非空 → 不合格）');
const src = make04Source();
const targetNonEmpty = mktmp('qqa-target-');
fs.writeFileSync(path.join(targetNonEmpty, 'config.json'), '{}');
let d = detectMigrationSource(targetNonEmpty, src);
eq(d.eligible, false, '目标非空拒绝');
eq(d.reason, '目标 data/ 非空', '原因明确');

const targetEmpty = mktmp('qqa-target-');
d = detectMigrationSource(targetEmpty, src);
eq(d.eligible, true, '空目标 + 显式源 → 合格');
eq(d.source, path.resolve(src), '源路径正确');

section('执行迁移（非 dry-run）');
const before = snapshot(src);
const target = mktmp('qqa-target-');
const report = migrateFrom04({ source: src, targetDataDir: target, log: {} });
eq(report.errors.length, 0, '无 error');
ok(report.sections.config.ok, 'config 段 ok');
ok(report.sections.messages.ok, 'messages 段 ok');
ok(report.sections.memory.ok, 'memory 段 ok');
ok(report.sections.stickers.ok, 'stickers 段 ok');
ok(report.sections.reminders.ok, 'reminders 段 ok');
eq(report.sections.reminders.pending, 1, 'pending 计数正确');

section('config 键迁移（废弃键剔除 / 派生标记丢弃 / 未知键保留）');
const cfg = JSON.parse(fs.readFileSync(path.join(target, 'config.json'), 'utf8'));
eq(cfg.api.model, 'deepseek-v4', 'model 保留');
eq(cfg.api.apiKey, 'sk-old', 'apiKey 保留（迁移不做脱敏）');
ok(!('stream' in cfg.api), '废弃键 api.stream 剔除');
ok(!('hasApiKey' in cfg.api), '派生标记 hasApiKey 丢弃');
ok(!('budget' in cfg), '顶层废弃键 budget 剔除');
ok(!('atCount' in cfg.store), 'store.atCount 剔除');
eq(cfg.store.contextSliderPos, 55, '滑条保留');
eq(cfg.unknownKeyFuture.keep, 'me', '未知键保留（前向兼容）');
eq(cfg.server.token, 'old-token', 'token 保留');

section('messages 复制（字段完整 + atMe:null 老条目）');
const msgs = JSON.parse(fs.readFileSync(path.join(target, 'messages', 'group_100.json'), 'utf8'));
eq(msgs.messages.length, 2, '两条消息');
eq(msgs.messages[0].atMe, null, '老条目 atMe:null 保留');
eq(msgs.messages[1].senderName, '我', "self 条目字面量保留");

section('memory 复制');
const mem = JSON.parse(fs.readFileSync(path.join(target, 'memory', 'group_100', '555.json'), 'utf8'));
eq(mem.impressions[0].content, '喜欢梗图', '印象保留');

section('stickers 复制（含图片）');
ok(fs.existsSync(path.join(target, 'stickers.json')), 'stickers.json 复制');
ok(fs.existsSync(path.join(target, 'sticker-images', 's1.png')), 'sticker-images 复制');

section('reminders 复制（含已触发的）');
const rem = JSON.parse(fs.readFileSync(path.join(target, 'reminders.json'), 'utf8'));
eq(rem.reminders.length, 2, '全部提醒复制（含已触发）');

section('telemetry installId 沿用');
const tel = JSON.parse(fs.readFileSync(path.join(target, 'telemetry.json'), 'utf8'));
eq(tel.installId, 'abc-123-uuid', 'installId 沿用（官网不清零）');

section('sessions 可弃（不复制，只记录）');
ok(!fs.existsSync(path.join(target, 'sessions')), 'sessions 不复制');
ok(report.sections.sessions.note.includes('可弃'), '报告标注可弃');

section('只读源三断言（0.4 目录永不回写）');
const after = snapshot(src);
eq(Object.keys(after).length, Object.keys(before).length, '文件数不变');
eq(JSON.stringify(after), JSON.stringify(before), '内容逐字节不变（只读）');
ok(fs.existsSync(path.join(src, 'config.json')), '源 config 仍在');

section('报告落盘');
ok(fs.existsSync(path.join(target, 'migration-report.json')), 'migration-report.json 写入');

section('dry-run 不写目标');
const target2 = mktmp('qqa-target2-');
migrateFrom04({ source: src, targetDataDir: target2, log: {}, dryRun: true });
ok(!fs.existsSync(path.join(target2, 'config.json')), 'dry-run 不写 config');
ok(!fs.existsSync(path.join(target2, 'migration-report.json')), 'dry-run 不写报告');

section('部分复制失败必须报告文件与原因，继续复制其它文件');
const failedTarget = mktmp('qqa-copy-failure-');
const originalCopy = fs.copyFileSync;
let partial;
try {
  fs.copyFileSync = (from, to, ...rest) => {
    if (from === path.join(src, 'memory', 'group_100', '555.json')) {
      throw new Error('fixture: copy denied');
    }
    return originalCopy(from, to, ...rest);
  };
  partial = migrateFrom04({ source: src, targetDataDir: failedTarget, log: {} });
} finally {
  fs.copyFileSync = originalCopy;
}
eq(partial.sections.memory.ok, false, 'memory 部分失败不是成功');
eq(partial.errors.length, 1, '单文件失败只汇总一次');
ok(partial.errors.some((e) => e.section === 'memory' && e.source.endsWith('555.json') && e.reason.includes('copy denied')), '错误汇总包含源路径和原因');
ok(partial.sections.messages.ok, '其它段继续迁移');
ok(fs.existsSync(path.join(failedTarget, 'stickers.json')), '其它文件仍复制');
eq(JSON.stringify(snapshot(src)), JSON.stringify(before), '失败迁移仍不改源');
eq(partial.ok, false, '总体不报成功');

section('损坏配置与提醒明确失败');
const damaged = make04Source();
fs.writeFileSync(path.join(damaged, 'config.json'), 'not json');
fs.writeFileSync(path.join(damaged, 'reminders.json'), '{"reminders":null}');
const badTarget = mktmp('qqa-damaged-');
const bad = migrateFrom04({ source: damaged, targetDataDir: badTarget, log: {} });
eq(bad.sections.config.ok, false, '损坏配置失败');
eq(bad.sections.reminders.ok, false, '损坏提醒失败');
ok(bad.errors.some((e) => e.section === 'config'), '汇总配置错误');
ok(bad.errors.some((e) => e.section === 'reminders'), '汇总提醒错误');
ok(!fs.existsSync(path.join(badTarget, 'reminders.json')), '不写假空提醒');

section('dry-run 递归计数一致且目标完全不写入');
const previewTarget = mktmp('qqa-preview-');
const preview = migrateFrom04({ source: src, targetDataDir: previewTarget, dryRun: true, log: {} });
eq(preview.sections.messages.files, report.sections.messages.files, '消息计数一致');
eq(preview.sections.memory.files, report.sections.memory.files, '记忆计数一致');
eq(preview.sections.stickers.bytes, report.sections.stickers.bytes, '图片和索引字节一致');
eq(fs.readdirSync(previewTarget), [], 'dry-run 无任何输出');

summary('23-migrator');

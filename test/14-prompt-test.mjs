// 14 · prompt：15 段系统提示 / 覆盖路径 / priority 排序 / 段落组装 / 锚点 / formatEntry
import { ok, eq, section, summary } from './helpers.mjs';
import { buildSystemPrompt, buildUserPrompt, buildPastState, formatEntry, resolvePromptAnchor, participationText } from '../src/kernel/prompt.js';

const cfg = {
  persona: { botName: '小鲸鱼', roleText: '我是人设', participation: 'medium', customRules: '', systemPromptOverride: '' },
  api: { vision: true }, webSearch: { enabled: true }, sticker: { encourage: 1 },
};

section('系统提示 15 段顺序（06b §2.2）');
const sp = buildSystemPrompt({ cfg });
const idx = (s) => sp.indexOf(s);
ok(idx('你是「小鲸鱼」') < idx('【安全规则'), '身份开场在最前');
ok(idx('【安全规则') < idx('【工具协议'), '安全规则 → 工具协议');
ok(idx('【工具协议') < idx('【去 AI 味'), '→ 去 AI 味');
ok(idx('【去 AI 味') < idx('【主体性'), '→ 主体性');
ok(idx('【主体性') < idx('【该说/不该说'), '→ 参与度段');
ok(idx('【该说/不该说') < idx('【群聊不是客服队列'), '→ 非客服队列');
ok(idx('【群聊不是客服队列') < idx('【像真人一样'), '→ 真人节奏');
ok(idx('【像真人一样') < idx('【不要当群管家'), '→ 非群管家');
ok(idx('【不要当群管家') < idx('【引用与点名'), '→ 引用点名');
ok(idx('【引用与点名') < idx('【轻量记忆'), '→ 轻量记忆');
ok(idx('【轻量记忆') < idx('【表情包策略'), '→ 表情包');
ok(idx('【表情包策略') < idx('【QQ 场景规则'), '→ QQ 场景');
ok(idx('【QQ 场景规则') < idx('【发送与汇报禁令'), '→ 汇报禁令');
ok(sp.includes('你的文本输出只是思考过程'), '工具协议关键句原文');

section('参与度段随配置变化');
eq(participationText('low'), '安静', 'low');
eq(participationText('high'), '活跃', 'high');
eq(participationText(undefined), '普通', '缺省 medium');
ok(buildSystemPrompt({ cfg: { ...cfg, persona: { ...cfg.persona, participation: 'high' } } }).includes('参与度参考：活跃'), '参与度生效');

section('vision/search 开关影响 QQ 场景段');
ok(buildSystemPrompt({ cfg: { ...cfg, api: { vision: false } } }).includes('你无法查看图片内容'), 'vision=false 分支');
ok(buildSystemPrompt({ cfg: { ...cfg, webSearch: { enabled: false } } }).includes('你没有联网能力'), 'search=false 分支');

section('Skill 片段 priority 降序 + 上限 99（永不压过核心规则）');
const sp2 = buildSystemPrompt({
  cfg,
  skillSections: [
    { id: 'a', content: '【片段A】', priority: 30 },
    { id: 'b', content: '【片段B】', priority: 90 },
    { id: 'c', content: '【片段C】', priority: 999 },
  ],
});
ok(sp2.indexOf('【片段B】') < sp2.indexOf('【片段A】'), 'priority 降序');
ok(sp2.indexOf('【安全规则') < sp2.indexOf('【片段C】'), 'Skill 片段永远在核心规则之后（拼接顺序保证）');
ok(sp2.indexOf('【片段C】') < sp2.indexOf('【片段B】'), 'priority 999 钳到 99 仍最高');

section('extraSections（owner 规则 priority 72）');
const sp3 = buildSystemPrompt({ cfg, skillSections: [{ id: 'x', content: '【X】', priority: 50 }], extraSections: [{ id: 'owner', content: '【主人规则】', priority: 72 }] });
ok(sp3.indexOf('【主人规则】') < sp3.indexOf('【X】'), 'extraSection 72 排在 50 前');

section('customRules 追加最末');
const sp4 = buildSystemPrompt({ cfg: { ...cfg, persona: { ...cfg.persona, customRules: '不许说脏话' } } });
ok(sp4.indexOf('【管理员附加规则】') > sp4.indexOf('【发送与汇报禁令】'), 'customRules 在最末');

section('systemPromptOverride 覆盖路径（安全规则+工具协议强制保留）');
const sp5 = buildSystemPrompt({ cfg: { ...cfg, persona: { ...cfg.persona, systemPromptOverride: '你是 {botName}，人设是 {roleText}，参与度 {participation}' } } });
ok(sp5.startsWith('你是 小鲸鱼，人设是 我是人设，参与度 普通'), '占位符替换');
ok(sp5.includes('【安全规则'), '安全规则强制保留（不可覆盖）');
ok(sp5.includes('【工具协议'), '工具协议强制保留');
ok(!sp5.includes('【去 AI 味'), '默认段被整体替换');

section('formatEntry（06b §4.1）');
const line = formatEntry({ ts: new Date(2026, 7, 30, 21, 33).getTime(), mid: 1024, senderId: '10001', senderName: '群友A', text: '在吗' });
ok(/^\[08-30 21:33\] #1024 群友A\(QQ:10001\)：在吗$/.test(line), `格式正确：${line}`);
const lineSelf = formatEntry({ ts: Date.now(), mid: null, senderId: 'self', senderName: '我', text: '咋了', self: true });
ok(lineSelf.includes('<我>') === false && lineSelf.includes('我：咋了'), 'self 显示"我"');
const lineReply = formatEntry({ ts: Date.now(), mid: 1, senderId: '1', senderName: 'A', text: 'x', reply: { mid: 2, sender: 'B', text: 'y', status: 'resolved' } });
ok(lineReply.includes('[引用 B：y]'), '引用前缀');
const lineMedia = formatEntry({ ts: Date.now(), mid: 5, senderId: '1', senderName: 'A', text: '看', media: [{ kind: 'image' }] });
ok(lineMedia.includes('#5'), '带媒体时显示 mid');
const noMid = formatEntry({ ts: Date.now(), mid: 5, senderId: '1', senderName: 'A', text: '看' }, { withId: false });
ok(!noMid.includes('#5'), '纯文本不显示 mid（数字噪音）');

section('buildPastState（撤回/isPoke/排除触发批/屏蔽）');
const msgs = [
  { id: 1, mid: 1, ts: 1, senderId: 'a', senderName: 'A', text: 'm1', self: false },
  { id: 2, mid: 2, ts: 2, senderId: 'b', senderName: 'B', text: 'm2', recalled: true },
  { id: 3, mid: 3, ts: 3, senderId: 'c', senderName: 'C', text: 'poke', isPoke: true },
  { id: 4, mid: 4, ts: 4, senderId: 'd', senderName: 'D', text: 'm4' },
  { id: 5, mid: 5, ts: 5, senderId: 'blocked', senderName: 'X', text: 'm5' },
];
const past = buildPastState(msgs, { excludeIds: new Set([4]), globalBlocklist: ['blocked'], limit: 10 });
eq(past.messages.map((m) => m.id), [1], '撤回/isPoke/触发批/屏蔽全过滤');
const limited = buildPastState(msgs, { limit: 1 });
eq(limited.messages.length, 1, 'limit 生效');

section('buildUserPrompt 段落顺序（时间最末）');
const up = buildUserPrompt({
  chatPersona: { roleText: '人设X' },
  triggerEntries: [{ id: 9, mid: 9, ts: 9, senderId: 'a', senderName: 'A', text: '新消息', atMe: true, atNames: [] }],
  pastState: past,
  memText: '【对群友的印象】\n- A：好人',
  stickerListText: '表情1',
});
ok(up.indexOf('【角色设定') < up.indexOf('【记忆】'), '角色设定在记忆前');
ok(up.indexOf('【记忆】') < up.indexOf('【已读信息】'), '记忆在已读前');
ok(up.indexOf('【已读信息】') < up.indexOf('【未读信息】'), '已读在未读前');
ok(up.indexOf('【未读信息】') < up.indexOf('【当前时间】'), '当前时间最末（易变段殿后）');
ok(up.includes('（这些都已经看过）'), '已读段尾注');
const upEmpty = buildUserPrompt({ pastState: { count: 0, text: '' } });
ok(upEmpty.includes('暂无历史记录'), '首次会话提示');

section('resolvePromptAnchor（锚定/重置/超预算重置）');
const readMsgs = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, ts: i, senderId: 'a', senderName: 'A', text: `m${i}` }));
const fresh = resolvePromptAnchor({ readMessages: readMsgs, allReadMessages: readMsgs, prevAnchor: null, maxExtraRead: 5 });
eq(fresh.mode, 'reset', '首次 reset');
const anchor = { readIds: readMsgs.map((m) => m.id), readCount: 10, memberIds: ['a'] };
const extended = readMsgs.concat([{ id: 11, ts: 10, senderId: 'a', senderName: 'A', text: 'new' }]);
const anchored = resolvePromptAnchor({ readMessages: readMsgs, allReadMessages: extended, prevAnchor: anchor, maxExtraRead: 5 });
eq(anchored.mode, 'anchor', '连续轮次锚定');
eq(anchored.extraMessages.length, 1, '追加 1 条');
const tooMany = readMsgs.concat(Array.from({ length: 7 }, (_, i) => ({ id: 20 + i, ts: 20 + i, senderId: 'a', senderName: 'A', text: 'x' })));
const reset = resolvePromptAnchor({ readMessages: readMsgs, allReadMessages: tooMany, prevAnchor: anchor, maxExtraRead: 5 });
eq(reset.mode, 'reset', '追加超 maxExtraRead → 整体重置（防无限膨胀）');
const rolled = resolvePromptAnchor({ readMessages: [readMsgs[5]], allReadMessages: [readMsgs[5]], prevAnchor: anchor, maxExtraRead: 5 });
eq(rolled.mode, 'reset', '锚点头滚出窗口 → reset');

summary('14-prompt');

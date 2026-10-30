// 12 · wake 判定：四档独立短路（用户钦定权威口径 2026-10-06，见 SPEC §6.4）
//   1 档：被 @ 才响应
//   2 档：被 @ 或命中关键词
//   3 档：被 @ 或命中关键词；否则**骰一次**，命中概率内响应；未命中 → 置已读看后续
//   4 档：有消息就回
// 核心不变量：一条消息在整条判定链上最多只骰一次。
import { ok, eq, section, summary } from './helpers.mjs';
import { isAtMe, hitKeyword, stripMentions, resolveContextTier, triggerLabels } from '../src/kernel/wake.js';

section('isAtMe 三种写法（昵称/机器人名/CQ 码按 QQ 号）');
ok(isAtMe('@小鲸鱼 在吗', { botName: '小鲸鱼' }), '机器人名');
ok(isAtMe('@鲸鱼酱', { selfNickname: '鲸鱼酱' }), '昵称');
ok(isAtMe('[CQ:at,qq=20001] 在吗', { selfId: '20001' }), 'CQ 码');
ok(!isAtMe('[CQ:at,qq=999999999] 在吗', { selfId: '20001' }), 'CQ 码别人的号不命中');
ok(!isAtMe('小鲸鱼 在吗', { botName: '小鲸鱼' }), '无 @ 符号不命中');
ok(!isAtMe('', { botName: '小鲸鱼' }), '空文本');

section('hitKeyword');
ok(hitKeyword('今天吃鱼', ['鱼']), '命中');
ok(!hitKeyword('今天吃鱼', []), '空表不命中');
ok(hitKeyword('今天吃FISH', ['fish']), '大小写不敏感');

section('stripMentions（@ 片段 + 引用块剥除）');
eq(stripMentions('@A 在吗', ['@A']), '在吗', 'atNames 精确剥除');
eq(stripMentions('@A 在吗', []), '在吗', '无 atNames 粗剥');
eq(stripMentions('[引用 大肥鱼批发商：便宜吗] 贵不贵', []), '贵不贵', '引用块剥除');
eq(stripMentions('[引用 A：[图片] x] 在吗', []), '在吗', '嵌套方括号剥除');

const base = { contextTier: 4, randomPercent: 10, keywords: ['鱼'] };
const say = { text: '无关内容', atMe: false };

section('4 档：有消息就回');
eq(resolveContextTier({ entry: say, cfg: base, isPrivate: false }).shouldRespond, true, '4 档必响应');
eq(resolveContextTier({ entry: say, cfg: base, isPrivate: false }).tier, 4, 'tier=4');

section('1 档：只被 @ 才响应');
const t1 = { ...base, contextTier: 1 };
eq(resolveContextTier({ entry: { text: '@我 x', atMe: true }, cfg: t1, isPrivate: false }).shouldRespond, true, '1 档 @我 → 响应');
eq(resolveContextTier({ entry: { text: '鱼', atMe: false }, cfg: t1, isPrivate: false }).shouldRespond, false, '1 档关键词不响应');
eq(resolveContextTier({ entry: say, cfg: t1, isPrivate: false }).shouldRespond, false, '1 档普通消息不响应');
// 1 档绝不能掷骰（概率再高也不该插嘴）
eq(resolveContextTier({ entry: say, cfg: { ...t1, randomPercent: 100 }, isPrivate: false }).shouldRespond, false, '1 档即使概率 100 也不掷骰');

section('2 档：被 @ 或命中关键词');
const t2 = { ...base, contextTier: 2 };
eq(resolveContextTier({ entry: { text: '@我 x', atMe: true }, cfg: t2, isPrivate: false }).shouldRespond, true, '2 档 @我 → 响应');
eq(resolveContextTier({ entry: { text: '今天吃鱼', atMe: false }, cfg: t2, isPrivate: false }).shouldRespond, true, '2 档关键词 → 响应');
eq(resolveContextTier({ entry: say, cfg: t2, isPrivate: false }).shouldRespond, false, '2 档无关 → 不响应');
eq(resolveContextTier({ entry: say, cfg: { ...t2, randomPercent: 100 }, isPrivate: false }).shouldRespond, false, '2 档不掷骰（概率 100 也不插嘴）');

section('3 档：@/关键词之外骰一次');
const t3 = { ...base, contextTier: 3 };
// 3.1 命中确定性信号时不掷骰
let threw = false;
const realRandom = Math.random;
try {
  Math.random = () => { threw = true; return 0; };
  eq(resolveContextTier({ entry: { text: '@我 x', atMe: true }, cfg: t3, isPrivate: false }).shouldRespond, true, '3 档 @我 → 响应');
  eq(threw, false, '3 档 @我 命中不掷骰');
  threw = false;
  eq(resolveContextTier({ entry: { text: '今天吃鱼', atMe: false }, cfg: t3, isPrivate: false }).shouldRespond, true, '3 档 关键词 → 响应');
  eq(threw, false, '3 档 关键词 命中不掷骰');
} finally { Math.random = realRandom; }

// 3.2 无信号时才掷骰，且只掷一次
// ⚠️ Math.random 返回 [0,1)，代码内部 ×100，所以 mock 要给 0.2 这种值而非 20
let rollCount = 0;
try {
  Math.random = () => { rollCount += 1; return 0.2; };
  const hit = resolveContextTier({ entry: say, cfg: { ...t3, randomPercent: 50 }, isPrivate: false });
  eq(hit.shouldRespond, true, '3 档 骰子 20<50 → 响应');
  eq(rollCount, 1, '3 档全程只掷 1 次骰');
  ok(hit.reason.includes('20'), '骰子值带回 reason（会话页可解释）');
} finally { Math.random = realRandom; }

try {
  Math.random = () => 0.9;
  const miss = resolveContextTier({ entry: say, cfg: { ...t3, randomPercent: 50 }, isPrivate: false });
  eq(miss.shouldRespond, false, '3 档 骰子 90≥50 → 不响应（该条置已读）');
  ok(miss.reason.includes('50'), '未命中 reason 带上阈值便于排障');
} finally { Math.random = realRandom; }

// 3.3 外部传入 roll 时不掷骰，且结果可复现
try {
  let count = 0;
  Math.random = () => { count += 1; return 99; };
  const fixed = resolveContextTier({ entry: say, cfg: { ...t3, randomPercent: 50 }, isPrivate: false, roll: 20 });
  eq(fixed.shouldRespond, true, '传入 roll=20 命中');
  eq(count, 0, '传入 roll 时完全不掷骰');
  eq(fixed.reason, resolveContextTier({ entry: say, cfg: { ...t3, randomPercent: 50 }, isPrivate: false, roll: 20 }).reason,
    '同一 roll 复现同一 reason（判定可重放）');
} finally { Math.random = realRandom; }

section('3 档与 1/2 档不互相污染');
eq(resolveContextTier({ entry: say, cfg: { ...t3, randomPercent: 0 }, isPrivate: false }).shouldRespond, false, '3 档概率 0 → 永不插嘴');
eq(resolveContextTier({ entry: { text: '鱼', atMe: false }, cfg: { ...t1, contextTier: 1, randomPercent: 100 }, isPrivate: false }).shouldRespond, false,
  '1 档不会因3 档概率而插嘴');

section('拍一拍不分档位（与 @ 同级）');
for (const t of [1, 2, 3, 4]) {
  const v = resolveContextTier({ entry: { text: '[拍一拍] A 拍了拍 我', atMe: false, isPoke: true }, cfg: { ...base, contextTier: t }, isPrivate: false });
  eq(v.shouldRespond, true, `${t} 档拍一拍 → 响应`);
}
eq(resolveContextTier({ entry: { text: '[拍一拍] A 拍了拍 我', atMe: false, isPoke: true }, cfg: { ...t3, randomPercent: 0 }, isPrivate: false }).shouldRespond, true,
  '3 档概率 0 时拍一拍仍响应（不需要掷骰）');

section('档位钳位 [1,4]（与 0.4 prompt.js:465 逐值对齐）');
eq(resolveContextTier({ entry: say, cfg: { ...base, contextTier: 99 }, isPrivate: false }).tier, 4, '99 → 4');
eq(resolveContextTier({ entry: say, cfg: { ...base, contextTier: 0 }, isPrivate: false }).tier, 1, '0 → 1（不是被||4 吞成 4）');
eq(resolveContextTier({ entry: say, cfg: { ...base, contextTier: -5 }, isPrivate: false }).tier, 1, '-5 → 1');
eq(resolveContextTier({ entry: say, cfg: { ...base, contextTier: 2.6 }, isPrivate: false }).tier, 3, '2.6 → 3（四舍五入）');
eq(resolveContextTier({ entry: say, cfg: { ...base, contextTier: 2.4 }, isPrivate: false }).tier, 2, '2.4 → 2');
eq(resolveContextTier({ entry: say, cfg: { ...base, contextTier: 'abc' }, isPrivate: false }).tier, 4, 'NaN 回落 4（未设置）');
eq(resolveContextTier({ entry: say, cfg: { ...base, contextTier: null }, isPrivate: false }).tier, 1, 'null→0→钳到 1');
eq(resolveContextTier({ entry: say, cfg: { ...base, contextTier: undefined }, isPrivate: false }).tier, 4, 'undefined=NaN 回落 4');

section('统一模式私聊恒响应；非统一模式跟随全局档位');
for (const t of [1, 2, 3, 4]) {
  eq(resolveContextTier({ entry: say, cfg: { ...base, contextTier: t }, isPrivate: true }).shouldRespond, true, `${t} 档私聊恒响应`);
}
for (const unifiedTier of [false,true,undefined,'false']) {
  const split=unifiedTier===false;
  eq(resolveContextTier({entry:say,cfg:{...t1,unifiedTier},isPrivate:true}).shouldRespond,!split,`${String(unifiedTier)} 私聊只在非统一模式按全局 1 档判定`);
  eq(resolveContextTier({entry:{text:'鱼',atMe:false},cfg:{...t2,unifiedTier},isPrivate:true}).shouldRespond,true,'私聊全局 2 档关键词仍响应');
  eq(resolveContextTier({entry:say,cfg:{...t3,unifiedTier,randomPercent:50},isPrivate:true,roll:60}).shouldRespond,!split,'私聊全局 3 档遵循固定骰子');
  eq(resolveContextTier({entry:say,cfg:{...base,unifiedTier,commandMuteTier:1},isPrivate:true}).shouldRespond,false,'私聊全局 4 档不能绕过明确安静状态');
}

section('指令禁言强制 1 档');
const muted = { ...base, commandMuteTier: 1 };
eq(resolveContextTier({ entry: { text: '鱼', atMe: false }, cfg: { ...muted, contextTier: 3 }, isPrivate: false }).shouldRespond, false, '禁言后 3 档降为 1 档：关键词无效');
eq(resolveContextTier({ entry: say, cfg: { ...muted, contextTier: 3, randomPercent: 100 }, isPrivate: false }).shouldRespond, false, '禁言后概率 100 也不插嘴');
eq(resolveContextTier({ entry: { text: '@我 x', atMe: true }, cfg: muted, isPrivate: false }).shouldRespond, true, '禁言后 @ 仍响应');
eq(resolveContextTier({ entry: say, cfg: muted, isPrivate: false }).tier, 1, '禁言后 tier=1');

section('@ 判定：QQ 号优先 / 老存档回落');
eq(resolveContextTier({ entry: { text: '@小鲸鱼 x', atMe: null }, cfg: { ...t1, botName: '小鲸鱼' }, isPrivate: false }).shouldRespond, true, 'atMe:null 文本兜底命中');
eq(resolveContextTier({ entry: { text: '@鲸鱼 x', atMe: null }, cfg: { ...t1, botName: '小鲸鱼' }, isPrivate: false }).shouldRespond, false, 'atMe:null 文本不命中');
eq(resolveContextTier({ entry: { text: '@重名的人 x', atMe: false }, cfg: t1, isPrivate: false }).shouldRespond, false, '@别人不触发');

section('关键词：@ 段原文里的词剔除（0.4 事故项）');
eq(resolveContextTier({ entry: { text: '@大肥鱼批发商 你好', atMe: false, atNames: ['@大肥鱼批发商'] }, cfg: t2, isPrivate: false }).shouldRespond, false,
  '@ 一个名字里带关键词的群友不误触发');
eq(resolveContextTier({ entry: { text: '@小鲸鱼 今天吃鱼', atMe: true, atNames: ['@小鲸鱼'] }, cfg: t2, isPrivate: false }).shouldRespond, true,
  '@机器人 + 正文关键词 正常触发');

section('triggerLabels');
eq(triggerLabels({ text: '在吗？', atMe: true }), ['提问', '@我'], '提问+@我');
eq(triggerLabels({ text: '[拍一拍] A 拍了拍 我' }), ['拍一拍'], '拍一拍');
ok(!triggerLabels({ text: '@A 你好', atMe: false }).includes('@我'), '@别人的裸前缀不标 @我（SUSPECT 复刻）');

summary('12-wake');

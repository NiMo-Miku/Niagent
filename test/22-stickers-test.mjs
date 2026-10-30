// 22 · stickers：顶层数组 / md5 大写 / normalize 丢运行期字段 / basename 搬家自愈 / prompt 不含 useCount
import { ok, eq, section, summary, mktmp } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createStickerManager, normalizeStickerEntry } from '../src/kernel/stickers.js';

section('normalizeStickerEntry（字段表 + 运行期字段丢弃）');
const n = normalizeStickerEntry({
  id: 's1', md5: 'abcdef', source: 'ai', tags: ['a', 'b'],
  sourceUrl: 'http://should-drop', _persistTried: true, useCount: '3',
});
eq(n.md5, 'ABCDEF', 'md5 转大写');
eq(n.source, 'ai', 'source 保留');
eq(n.useCount, 3, 'useCount 数字化');
ok(!('sourceUrl' in n), 'sourceUrl 运行期字段丢弃');
ok(!('_persistTried' in n), '_persistTried 丢弃');
eq(normalizeStickerEntry({ id: 'x', source: 'illegal' }).source, 'qq', '非法 source 回落 qq');
eq(normalizeStickerEntry({ id: 'x', tags: Array.from({ length: 30 }, (_, i) => `t${i}`) }).tags.length, 20, 'tags 最多 20');

section('顶层数组（不是 {entries:[]}）');
const dir = mktmp('qqa-stk-');
fs.writeFileSync(path.join(dir, 'stickers.json'), JSON.stringify([
  normalizeStickerEntry({ id: 'a', desc: '笑' }),
]));
const sm = createStickerManager({ dataDir: dir, log: {} });
eq(sm.all().length, 1, '顶层数组可读');
eq(sm.all()[0].desc, '笑', '字段正确');

section('list clamp 100（SUSPECT C-06 复刻）');
for (let i = 0; i < 120; i++) sm.collect({ id: `c${i}`, url: `http://x/${i}.png`, source: 'ai' });
eq(sm.list({ limit: 500 }).length, 100, 'limit 上限 100');
eq(sm.list({ limit: 10 }).length, 10, 'limit 生效');

section('note / markUsed');
const noteRes = sm.note('a', '这是笑哭');
ok(noteRes && noteRes.localNote === '这是笑哭', 'note 写入');
sm.markUsed('a', '上次接梗用的');
const a = sm.get('a');
eq(a.useCount, 1, 'useCount 累加');
eq(a.lastContext, '上次接梗用的', 'lastContext 记录');

section('collect（新条目 + 更新已有）');
const col = sm.collect({ id: 'new1', url: 'http://x/new.png', desc: '新图', source: 'manual' });
eq(col.source, 'manual', 'source 保留');
eq(sm.get('new1').url, 'http://x/new.png', 'url 写入');

section('basename 搬家自愈');
const dir2 = mktmp('qqa-stk2-');
fs.mkdirSync(path.join(dir2, 'sticker-images'), { recursive: true });
fs.writeFileSync(path.join(dir2, 'sticker-images', 'moved.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
fs.writeFileSync(path.join(dir2, 'stickers.json'), JSON.stringify([
  { id: 'm1', localFile: 'file:///D:/old/path/moved.png', url: 'file:///D:/old/path/moved.png', source: 'qq' },
]));
const sm2 = createStickerManager({ dataDir: dir2, log: {} });
const healed = sm2.get('m1');
ok(healed.localFile.includes('moved.png') && healed.localFile.includes(dir2.replaceAll('\\', '/')), `basename 重定位：${healed.localFile.slice(-40)}`);

section('mergeFromQQ（QQ 收藏没有的 source=qq 条目被删）');
const dir3 = mktmp('qqa-stk3-');
fs.writeFileSync(path.join(dir3, 'stickers.json'), JSON.stringify([
  { id: 'q1', source: 'qq', desc: '旧' }, { id: 'm1', source: 'manual', desc: '我收藏的' },
]));
const sm3 = createStickerManager({ dataDir: dir3, log: {} });
sm3.mergeFromQQ([{ id: 'q2', desc: '新' }]);
const after = sm3.all().map((x) => x.id).sort();
eq(after, ['m1', 'q2'], 'q1 被删（QQ 里没有了），manual 保留，q2 新增');

section('buildPromptContext（不含 useCount —— 缓存前缀保护）');
const txt = sm3.buildPromptContext(10);
ok(txt.includes('#m1'), '含 id');
ok(!txt.includes('useCount'), '不含 useCount（每次变会挤出缓存前缀）');

section('BOM 容错');
const dir4 = mktmp('qqa-stk4-');
fs.writeFileSync(path.join(dir4, 'stickers.json'), '\uFEFF' + JSON.stringify([{ id: 'bom1', source: 'qq' }]));
const sm4 = createStickerManager({ dataDir: dir4, log: {} });
eq(sm4.all().length, 1, 'BOM 文件可读');

summary('22-stickers');

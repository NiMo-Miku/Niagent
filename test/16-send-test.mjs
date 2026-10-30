// 16 · send 队列：限频/去重成功后才记账/真人停顿/hardSplitAt/部分失败/表情三级回退
import { ok, eq, section, summary, sleep } from './helpers.mjs';
import { createSendQueue, mdToPlain, imageFingerprint } from '../src/kernel/send.js';

function makeEnv({ sendCfg = {} } = {}) {
  const sentLog = [];
  const stored = [];
  const transport = {
    async send(chatKey, segments) {
      sentLog.push({ chatKey, segments });
      return [{ msgId: sentLog.length }];
    },
  };
  const store = { appendSelf: (chatKey, entry) => stored.push({ chatKey, ...entry }) };
  const cfg = () => ({
    send: { minGapMs: 200, maxGapMs: 200, byLengthMs: 0, maxPerMinute: 80, maxPerHour: 500, hardSplitAt: 4000, dedupeWindowMs: 8000, ...sendCfg },
  });
  const q = createSendQueue({ transport, store, log: {}, cfg });
  return { q, sentLog, stored };
}

section('mdToPlain');
eq(mdToPlain('**粗** _斜_ `码`'), '粗 斜 码', 'Markdown 清理');
eq(mdToPlain('## 标题\n内容'), '标题\n内容', '标题清理');

section('基础发送 + 留档（appendSelf）');
const e1 = makeEnv();
const r1 = await e1.q.sendTextBatch('group:1', '你好');
eq(r1.ok, true, '发送成功');
eq(e1.sentLog.length, 1, '一次发送');
eq(e1.stored.length, 1, 'appendSelf 留档');
eq(e1.stored[0].text, '你好', '留档文本');

section('数组分条发送');
const e2 = makeEnv();
const r2 = await e2.q.sendTextBatch('group:1', ['第一句', '第二句', '第三句']);
eq(r2.sent.length, 3, '三条消息');
eq(e2.sentLog.length, 3, '串行发送 3 次');

section('空内容拦截');
const e3 = makeEnv();
let err3 = null;
try { await e3.q.sendTextBatch('group:1', '   '); } catch (e) { err3 = e; }
ok(err3 && /消息内容为空/.test(err3.message), '全空白 → 抛"消息内容为空"');
let err4 = null;
try { await e3.q.sendTextBatch('group:1', { a: 1 }); } catch (e) { err4 = e; }
ok(err4 && /必须是字符串/.test(err4.message), '非字符串参数报错');

section('hardSplitAt 4000 切分');
const e5 = makeEnv({ sendCfg: { hardSplitAt: 10 } });
const r5 = await e5.q.sendTextBatch('group:1', 'x'.repeat(25));
eq(r5.sent.length, 3, '25 字按 10 切 3 条');

section('限频（分钟上限抛错给模型）');
const e6 = makeEnv({ sendCfg: { maxPerMinute: 2, dedupeWindowMs: 0 } });
await e6.q.sendTextBatch('group:1', 'a');
await e6.q.sendTextBatch('group:1', 'b');
let err6 = null;
try { await e6.q.sendTextBatch('group:1', 'c'); } catch (e) { err6 = e; }
ok(err6 && /每分钟上限 2/.test(err6.message), '超限抛错且文案含上限');
// 不同会话独立计数
const r6 = await e6.q.sendTextBatch('group:2', 'c');
eq(r6.ok, true, '限频按会话独立');

section('去重：成功后才记账（R-02）');
const e7 = makeEnv({ sendCfg: { dedupeWindowMs: 8000 } });
await e7.q.sendTextBatch('group:1', '重复内容');
const r7 = await e7.q.sendTextBatch('group:1', '重复内容');
eq(r7.deduped, true, '8s 窗口内重复被跳过');
eq(e7.sentLog.length, 1, '实际只发一次');
const r7b = await e7.q.sendTextBatch('group:1', '不同内容');
eq(r7b.deduped, undefined, '不同内容不跳过');

section('发送失败不记账（失败的消息允许重试不被误判重复）');
const e8 = makeEnv({ sendCfg: { dedupeWindowMs: 8000 } });
let failOnce = true;
e8.q = createSendQueue({
  transport: {
    async send(chatKey, segments) {
      if (failOnce) { failOnce = false; throw new Error('网络断了'); }
      e8.sentLog.push({ chatKey, segments });
      return [{ msgId: 1 }];
    },
  },
  store: { appendSelf: () => {} },
  log: {}, cfg: () => ({ send: { minGapMs: 200, maxGapMs: 200, byLengthMs: 0, maxPerMinute: 80, maxPerHour: 500, hardSplitAt: 4000, dedupeWindowMs: 8000 } }),
});
let err8 = null;
try { await e8.q.sendTextBatch('group:1', '会失败'); } catch (e) { err8 = e; }
ok(err8, '首次失败抛错');
const r8 = await e8.q.sendTextBatch('group:1', '会失败');
eq(r8.ok, true, '重试同一内容不被去重误杀（失败未记账）');

section('部分失败（failed[] 带 index+原文+错误）');
const e9 = makeEnv();
e9.q = createSendQueue({
  transport: {
    async send(chatKey, segments) {
      const text = segments.find((s) => s.type === 'text')?.text ?? '';
      if (text === '第二条') throw new Error('第二条失败');
      e9.sentLog.push({ chatKey, segments });
      return [{ msgId: 1 }];
    },
  },
  store: { appendSelf: () => {} },
  log: {}, cfg: () => ({ send: { minGapMs: 200, maxGapMs: 200, byLengthMs: 0, maxPerMinute: 80, maxPerHour: 500, hardSplitAt: 4000, dedupeWindowMs: 0 } }),
});
const r9 = await e9.q.sendTextBatch('group:1', ['第一条', '第二条', '第三条']);
eq(r9.ok, false, '部分失败 ok=false');
eq(r9.sent.length, 1, '成功 1 条');
eq(r9.failed[0].index, 1, 'failed 带 index');
eq(r9.failed[0].text, '第二条', 'failed 带原文');
ok(r9.failed[0].error.includes('第二条失败'), 'failed 带错误');

section('图片去重键（url > file > data:长度:前64）');
eq(imageFingerprint({ url: 'u' }), 'url:u', 'url 优先');
eq(imageFingerprint({ file: 'f', url: 'u' }), 'url:u', 'url 覆盖 file');
eq(imageFingerprint({ file: 'f' }), 'file:f', 'file');
eq(imageFingerprint({ dataUrl: 'abcdef' }), 'data:6:abcdef', 'dataUrl 指纹');

section('图片发送（file URI 本地路径 + base64 回退）');
const e10 = makeEnv();
const r10 = await e10.q.sendImage('group:1', { file: 'C:\\a\\b.png' });
eq(r10.ok, true, 'file 路径发送');
ok(e10.sentLog[0].segments[0].file.startsWith('file:///'), '本地路径转 file URI');

section('表情三级回退（file → get_image 缓存 → base64）');
const e11 = makeEnv();
let attempt = 0;
let resolvedFileId = null;
e11.q = createSendQueue({
  transport: {
    actions: { async getImage(fileId) { resolvedFileId = fileId; return { file: 'C:\\protocol-cache\\a.png' }; } },
    async send(chatKey, segments) {
      attempt++;
      if (attempt === 1) throw new Error('本地文件失败');
      e11.sentLog.push({ chatKey, segments });
      return [{ msgId: 1 }];
    },
  },
  store: { appendSelf: () => {} },
  log: {}, cfg: () => ({ send: { minGapMs: 200, maxGapMs: 200, byLengthMs: 0, maxPerMinute: 80, maxPerHour: 500, hardSplitAt: 4000, dedupeWindowMs: 0 } }),
});
const r11 = await e11.q.sendSticker('group:1', { localPath: 'C:\\s\\a.png', fileId: 'fid' });
eq(r11.ok, true, '三级回退成功');
eq(attempt, 2, '第一级失败后第二级成功');
eq(resolvedFileId, 'fid', '第二级通过真实协议缓存查询解析 fileId');
eq(e11.sentLog[0].segments.length, 1, '成功只发送一个图片段');
ok(e11.sentLog[0].segments[0].file.includes('/protocol-cache/a.png'), '第二级发送缓存文件 URI');

section('真人停顿（非最后一条有异步延迟）');
const e12 = makeEnv({ sendCfg: { minGapMs: 200, maxGapMs: 200, byLengthMs: 0 } });
const t0 = Date.now();
await e12.q.sendTextBatch('group:1', ['a', 'b']);
const elapsed = Date.now() - t0;
ok(elapsed >= 100, `条目间有停顿（实测 ${elapsed}ms）`);

section('CQ 转义在 provider 层（send 只透传段）');
const e13 = makeEnv();
await e13.q.sendTextBatch('group:1', '看这个 [CQ:at,qq=1]');
eq(e13.sentLog[0].segments[0].text, '看这个 [CQ:at,qq=1]', 'send 层不转义（转义在 provider.toPlatformSegments）');

await sleep(10);
summary('16-send');

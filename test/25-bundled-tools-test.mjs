// 25 · 捆绑工具集：27 个工具全部装载 / 裸 id（A-2）/ 可用性过滤 / 契约抽验
//★ 2026-10-06：sticker_note 已删除（表情备注改由 collect_sticker 写入 QQ 侧表情包，
//    单独记笔记的工具多余）。工具数 28 → 27，sticker 类 4 → 3。
import { ok, eq, section, summary, mktmp } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';

const dataDir = mktmp('qqa-bt-');
const workspace = path.resolve(import.meta.dirname, '..'), appRoot = path.join(dataDir, 'app');
const expectedEntries = ['core-tools', 'query-tools', 'sticker-tools', 'memory-tools', 'web-tools', 'media-tools', 'system-tools'].sort();
for (const name of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, name), { recursive: true });
for (const name of ['src', 'ui']) fs.cpSync(path.join(workspace, name), path.join(appRoot, name), { recursive: true });
for (const name of expectedEntries) fs.cpSync(path.join(workspace, 'bundled', name), path.join(appRoot, 'bundled', name), { recursive: true });
fs.copyFileSync(path.join(workspace, 'package.json'), path.join(appRoot, 'package.json'));
const blocked = [], nativeFetch = globalThis.fetch, dnsOriginals = [];
let loopbackLookups = 0, loadedEntries = [];
globalThis.fetch = async input => { blocked.push({ kind: 'fetch', url: String(input?.url ?? input) }); throw new Error('25 forbids network'); };
for (const target of [dns, dnsPromises]) for (const key of Object.keys(target).filter(key => /^(lookup|resolve|reverse)/.test(key) && typeof target[key] === 'function')) {
  dnsOriginals.push([target, key, target[key]]);
  target[key] = (hostname, ...args) => {
    if (key === 'lookup' && ['127.0.0.1', '::1'].includes(hostname)) {
      loopbackLookups++;
      const address = { address: hostname, family: hostname === '::1' ? 6 : 4 }, options = args.find(value => value && typeof value === 'object');
      if (target === dnsPromises) return Promise.resolve(options?.all ? [address] : address);
      queueMicrotask(() => args.at(-1)(null, ...(options?.all ? [[address]] : [address.address, address.family]))); return;
    }
    blocked.push({ kind: 'dns', method: key }); throw new Error('25 forbids DNS');
  };
}
syncBuiltinESMExports();

const outgoing = [];
let kernel;
try {
kernel = createKernel({ appRoot, env: { QQ_AGENT_DATA_DIR: path.join(dataDir, 'data'), QQ_AGENT_PORT: '0', QQ_AGENT_PROFILE: '1', QQ_AGENT_MIGRATE_FROM: path.join(dataDir, 'absent-migration-source') }, headless: true,
  transport: { id: 'fixture', selfId: '999', actions: {}, start() {}, stop() {}, toPlatformSegments: (segments) => segments,
    async send(chatKey, segments) { outgoing.push({ chatKey, segments }); return { messageId: outgoing.length }; }, status: () => ({ connected: true }) },
  priceUpdates: { refresh: async () => ({ ok: true }) }, communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
  fetchImpl: async url => { blocked.push({ kind: 'host-fetch', url: String(url) }); throw new Error('25 forbids host HTTP'); },
});
kernel.config.update({ telemetry: { enabled: false }, send: { minGapMs: 0, maxGapMs: 0, dedupeWindowMs: 0 } });
await kernel.start();
loadedEntries = kernel.loader.listEntries().map(entry => entry.id).sort();
eq(loadedEntries, expectedEntries, 'only the seven copied real bundled tool sets are scanned');
ok(kernel.loader.listEntries().every(entry => entry.status === 'active'), 'every required actual bundled tool set is active');

section('27 个工具全部装载（裸 id）');
const EXPECTED = [
  'send_message', 'send_to', 'send_sticker', 'send_poke',
  'list_stickers', 'get_sticker_image', 'collect_sticker',
  'get_recent_messages', 'read_forward', 'get_active_members', 'get_chats', 'get_message_detail', 'get_message_images', 'read_video',
  'memory_append', 'memory_query', 'memory_remove',
  'web_search', 'web_fetch', 'search_images',
  'send_image',
  'report_feedback', 'finish', 'set_reminder', 'list_reminders', 'cancel_reminder', 'check_holiday',
];
const registered = kernel.registry.list().map((t) => t.id);
eq(registered.length, 27, `注册 27 个工具（实际 ${registered.length}）`);
for (const id of EXPECTED) {
  ok(registered.includes(id), `工具 ${id} 已注册`);
}
// sticker_note 必须已移除（备注改写 QQ 侧，见 stickers.collectIntoQQ）
ok(!registered.includes('sticker_note'), 'sticker_note 已删除（备注随收藏写入 QQ 表情包）');
//裸 id（无 __ 前缀，A-2 裁决）
const prefixed = registered.filter((id) => id.includes('__'));
eq(prefixed, [], '无带前缀工具（捆绑域裸 id，行为等价）');

section('分类分布');
const byCat = {};
for (const t of kernel.registry.list()) byCat[t.category] = (byCat[t.category] ?? 0) + 1;
eq(byCat.messaging, 4, `messaging 4 个（send_message/send_to/send_sticker/send_poke）=${byCat.messaging}`);
eq(byCat.sticker, 3, `sticker 3 个（sticker_note 已删）=${byCat.sticker}`);
eq(byCat.query, 7, `query 7 个=${byCat.query}`);
eq(byCat.memory, 3, `memory 3 个=${byCat.memory}`);
eq(byCat.web, 3, `web 3 个=${byCat.web}`);
eq(byCat.media, 1, `media 1 个=${byCat.media}`);
eq(byCat.system, 6, `system 6 个（report_feedback/finish/set_reminder/list_reminders/cancel_reminder/check_holiday）=${byCat.system}`);

section('可用性过滤（唯一口径）');
const bundle = kernel.orchestrator._active ? null : null;
void bundle;
// 通过 buildToolBundle 的等价口径直接测 registry.availability
const cfgNow = kernel.config.get();
const ctxBase = {
  toolsEnabled: true,
  categoryEnabled: () => true,
  override: () => undefined,
  crossChatSend: false,
  visionEnabled: true,
  searchEnabled: true,
  skillActive: () => true,
  skillProblem: () => null,
};
eq(kernel.registry.availability('send_to', ctxBase).code, 'tool-disabled', 'send_to 跨会话闸（crossChatSend=false）');
ok(kernel.registry.availability('send_to', ctxBase).reason.includes('跨会话'), `reason 文案：${kernel.registry.availability('send_to', ctxBase).reason}`);
eq(kernel.registry.availability('send_message', ctxBase).ok, true, 'send_message 可用');
eq(kernel.registry.availability('web_search', { ...ctxBase, searchEnabled: false }).code, 'no-search', 'web_search 受 searchEnabled 门');
eq(kernel.registry.availability('get_message_images', { ...ctxBase, visionEnabled: false }).code, 'no-vision', '看图工具受 vision 门');
eq(kernel.registry.availability('web_search', { ...ctxBase, categoryEnabled: (c) => c !== 'web' }).code, 'category-disabled', '分类开关门');
eq(kernel.registry.availability('web_search', { ...ctxBase, override: () => false }).code, 'tool-disabled', '单工具开关门');
eq(kernel.registry.availability('web_search', { ...ctxBase, toolsEnabled: false }).code, 'tools-disabled', '总开关门');

section('工具 schema 契约抽验');
const sendMsg = kernel.registry.get('send_message');
ok(sendMsg.params.properties.texts, 'texts 参数声明');
ok(sendMsg.description.includes('数组'), '描述讲清分条');
const poke = kernel.registry.get('send_poke');
eq(poke.params.required, [], 'send_poke required 为空（SUSPECT C-05 复刻）');
const finish = kernel.registry.get('finish');
eq(finish.category, 'system', 'finish 分类');
ok(finish.description.includes('activeTopic'), 'finish 描述提 activeTopic');
const readVideo = kernel.registry.get('read_video');
eq(readVideo.category, 'query', "read_video 归 query（SUSPECT 复刻：0.4 分类如此）");

section('工具调用（真实发送队列、离线传输）');
const inv = await kernel.registry.invoke('send_message', { texts: '测试' }, {
  execCtx: { chatKey: 'group:1', session: { sent: [] } },
});
eq(inv.ok, true, `send_message 真实队列调用成功${inv.error ? '：' + inv.error : ''}`);
eq(outgoing.length, 1, '实际向离线传输发送一条');
eq(outgoing[0]?.chatKey, 'group:1', '发送目标经过公共facade到传输');
eq(outgoing[0]?.segments?.[0]?.text, '测试', '发送内容完整保留');

section('check_holiday 纯本地计算');
const ch = kernel.registry.get('check_holiday');
const holidayCtx = {};
const holidayRes = await ch.execute({ days: 7 }, { chatKey: 'group:1', session: {} });
eq(holidayRes.ok, true, 'check_holiday 可调用');
ok(typeof holidayRes.result.note === 'string', '返回 note 文案');

section('memory 工具契约');
const memCtx = { chatKey: 'group:1', session: {} };
const appendTool = kernel.registry.get('memory_append');
const badUid = await appendTool.execute({ category: 'memberImpression', userId: 'abc', content: 'x' }, memCtx);
eq(badUid.ok, false, '非数字 userId 报错');
ok(badUid.error.includes('数字 QQ 号'), `错误文案含引导：${badUid.error.slice(0, 40)}`);
const goodUid = await appendTool.execute({ category: 'memberImpression', userId: '555', target: '小明', content: '喜欢梗图' }, memCtx);
eq(goodUid.ok, true, '合法 userId 记录成功');
const dup = await appendTool.execute({ category: 'memberImpression', userId: '555', target: '小明', content: '喜欢梗图' }, memCtx);
eq(dup.result.deduped, true, '同名去重');
ok(dup.result.saved === false, '重复记录不写入');
const q = await kernel.registry.get('memory_query').execute({ userId: '555' }, memCtx);
eq(q.result.count, 1, 'memory_query 查到');
const rm = await kernel.registry.get('memory_remove').execute({ userId: '555', content: '喜欢梗图' }, memCtx);
eq(rm.ok, true, 'memory_remove 成功');

section('reminder 工具契约');
const setR = kernel.registry.get('set_reminder');
const badTime = await setR.execute({ text: 'x', atTime: '乱写' }, memCtx);
eq(badTime.ok, false, '非法时间报错');
ok(badTime.error.includes('时间格式不对'), '错误文案');
const noTime = await setR.execute({ text: 'x' }, memCtx);
eq(noTime.ok, false, '缺时间参数报错');
const delayR = await setR.execute({ text: '喝水', delayMinutes: 30 }, memCtx);
eq(delayR.ok, true, 'delayMinutes 设提醒成功');
const listR = await kernel.registry.get('list_reminders').execute({}, memCtx);
eq(listR.result.reminders.length, 1, 'list 查到 1 条');
const reminderId = listR.result.reminders[0].match(/\[([^\]]+)\]/)?.[1];
const cancelR = await kernel.registry.get('cancel_reminder').execute({ id: reminderId }, memCtx);
eq(cancelR.ok, true, '取消成功');
const cancelAgain = await kernel.registry.get('cancel_reminder').execute({ id: reminderId }, memCtx);
ok(!cancelAgain.ok, '重复取消报错');

section('权限闸：deny scope 工具被拒');
// net.raw 不可放行——用一个假工具验证（真实工具都不声明 net.raw）
kernel.registry.register({ id: 'evil_net', name: 'E', execute: async () => ({ ok: true }), scopes: ['net.raw'], ownerId: 'evil', bundled: false });
const evilRes = await kernel.registry.invoke('evil_net', {}, {});
eq(evilRes.ok, false, 'deny scope 工具被权限闸拒绝');
ok(evilRes.error.includes('权限不足'), `人话错误：${evilRes.error}`);
kernel.registry.unregister('evil_net');

} finally {
  await kernel?.stop();
  globalThis.fetch = nativeFetch;
  for (const [target, key, original] of dnsOriginals) target[key] = original;
  syncBuiltinESMExports();
  eq(blocked, [], 'actual Node fetch/DNS and host HTTP made no outbound attempt');
  console.log(JSON.stringify({ isolation: 25, entries: loadedEntries, blocked, loopbackLookups }));
  eq(path.dirname(path.resolve(dataDir)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase(), 'cleanup remains under temporary root');
  if (path.dirname(path.resolve(dataDir)).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase() || !path.basename(dataDir).startsWith('qqa-bt-')) throw new Error('25 unsafe cleanup');
  fs.rmSync(dataDir, { recursive: true, force: true });
}
summary('25-bundled-tools');

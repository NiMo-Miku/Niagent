// 309 · 提示词组装调试预览:/api/debug/prompt/* 与真实运行同一套组装函数。
// 真 loader + 真记忆/存档 + 插件 prompt.add;无浏览器、无外部服务。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKernel } from '../src/kernel/kernel.js';
import { isolateConsoleFixture } from './console-fixture-isolation.mjs';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-promptpreview-309-'));
const isolation = isolateConsoleFixture(dataDir, '309');
fs.writeFileSync(path.join(isolation.appRoot, 'package.json'), JSON.stringify({ type: 'module' }));
fs.cpSync(new URL('../src', import.meta.url), path.join(isolation.appRoot, 'src'), { recursive: true });
fs.cpSync(new URL('../bundled/core-tools', import.meta.url), path.join(isolation.appRoot, 'bundled', 'core-tools'), { recursive: true });
const pluginDir = path.join(isolation.appRoot, 'plugins', 'preview-probe');
fs.mkdirSync(pluginDir, { recursive: true });
fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
  id: 'preview-probe', name: '预览探针', version: '0.0.1', apiVersion: 1, kind: 'plugin',
  enabledByDefault: true, entry: 'index.js',
  prompt: { sections: [{ id: 'probe-static', priority: 60, content: '探针静态片段 PROBE-STATIC-309' }] },
}, null, 2));
fs.writeFileSync(path.join(pluginDir, 'index.js'), `export default {
  setup(ctx) {
    ctx.prompt.add({ id: 'probe-dynamic', priority: 60, render: () => '探针动态片段 PROBE-DYNAMIC-309' });
  },
};`);

const token = 'promptpreview309-console';
const kernel = createKernel({
  appRoot: isolation.appRoot, env: isolation.env, headless: true,
  fetchImpl: (...args) => fetch(...args),
  transport: { id: 'fixture', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
  priceUpdates: { refresh: async () => ({ ok: true }), updateCheck: async () => ({ ok: true, current: '0.5.0', latest: '0.5.0', hasUpdate: false }) },
});
kernel.config.update({
  server: { port: 0, token }, telemetry: { enabled: false }, proactive: { enabled: false },
  persona: { botName: '预览机器人', roleText: '测试人设 PERSONA-ROLETEXT-309' },
});
kernel.loader.startWatchers = () => {};

let base = '';
const api = async (method, pathname, sendToken = true) => {
  const response = await fetch(`${base}${pathname}`, {
    method, headers: sendToken ? { 'x-console-token': token } : {},
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};
let port = 0, failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

try {
  port = await kernel.start();
  base = isolation.allowOrigin(`http://127.0.0.1:${port}`);

  // 种数据:聊天存档 + 印象记忆
  kernel.store.appendIncoming('group:100', { mid: 1, ts: Date.now(), senderId: '777', senderName: '老王', text: '今晚吃什么' });
  kernel.memory.append('group:100', { userId: '777', name: '老王', content: '选择困难,晚饭要别人帮他拿主意' });

  const noAuth = await api('GET', '/api/debug/prompt/sections', false);
  check('安全: 无令牌访问被拒', noAuth.status === 401, String(noAuth.status));

  const sections = await api('GET', '/api/debug/prompt/sections');
  check('片段: 列出扩展注入的静态+动态片段', sections.status === 200 && sections.body?.sections?.some((s) => s.owner === 'preview-probe' && s.text.includes('PROBE-STATIC-309'))
    && sections.body.sections.some((s) => s.owner === 'preview-probe' && s.text.includes('PROBE-DYNAMIC-309')), JSON.stringify(sections.body?.sections?.map((s) => s.owner)));

  const generic = await api('GET', '/api/debug/prompt/full');
  check('整卷: 无聊天上下文骨架可组装', generic.status === 200 && generic.body?.ok === true && typeof generic.body.system === 'string', String(generic.body?.counts?.systemChars));
  check('整卷: 系统提示含 botName、用户提示含人设文本', generic.body.system.includes('预览机器人') && generic.body.user.includes('PERSONA-ROLETEXT-309'));
  check('整卷: 系统提示含插件片段(静态+动态)', generic.body.system.includes('PROBE-STATIC-309') && generic.body.system.includes('PROBE-DYNAMIC-309'));
  check('整卷: 系统提示含记忆使用规则', generic.body.system.includes('memory_append'));
  check('整卷: 通用骨架不含聊天记忆', !generic.body.system.includes('选择困难') && !generic.body.user.includes('选择困难'));
  check('计数: 字符统计齐备', generic.body.counts?.systemChars > 0 && generic.body.counts?.toolCount > 0, JSON.stringify(generic.body.counts));

  const scoped = await api('GET', '/api/debug/prompt/full?chatKey=' + encodeURIComponent('group:100'));
  check('聊天: 用户提示含已读存档消息', scoped.body?.user?.includes('今晚吃什么'), '');
  check('聊天: 用户提示含【记忆】印象', scoped.body?.user?.includes('选择困难'), '');
  check('聊天: 工具清单非空且含描述', Array.isArray(scoped.body?.tools) && scoped.body.tools.some((t) => t.id === 'send_message'), String(scoped.body?.tools?.length));

  const bad = await api('GET', '/api/debug/prompt/full?chatKey=' + encodeURIComponent('group:999'));
  check('聊天: 空聊天回退通用骨架不报错', bad.status === 200 && bad.body?.ok === true, String(bad.status));
} finally {
  await kernel.stop().catch(() => {});
  try { isolation.restore?.(); } catch {}
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
}
console.log(failed ? `✗ 309：${failed} 项失败` : '✓ 309：提示词组装调试预览端到端全部通过');
process.exit(failed ? 1 : 0);

// 312 · 配置页人设下拉：真实 trpg-dice 插件 + 真实控制台路由 + 真实 ui/config.js。
// 守护两个曾把下拉框打空的坑：
//   1) ctx.call 返回执行信封 {ok, result}，工具值在 result.result 里（少穿一层 → 空）；
//   2) 用户插件的能力方法是异步的（授权租约），插件端漏 await → Promise 序列化成 {}。
// 这里把 /api/panels/:id/call 的真实响应喂给页面脚本，再断言 <select> 里真的有选项。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApplication } from '../src/kernel/composition.js';
import { defaultComponents } from '../bundled/runtime-defaults/components.js';

const workspace = path.resolve(import.meta.dirname, '..');
// trpg-dice 随插件仓库分发，不随本体入库；没装就跳过。
if (!fs.existsSync(path.join(workspace, 'plugins', 'trpg-dice', 'plugin.json'))) {
  console.log('SKIP 312-trpg-persona-dropdown-ui：本机未安装 plugins/trpg-dice');
  process.exit(0);
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-persona-ui-312-'));
const dataDir = path.join(temporary, 'data'), appRoot = path.join(temporary, 'app');
fs.mkdirSync(appRoot);
fs.cpSync(path.join(workspace, 'ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const folder of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, folder));
fs.cpSync(path.join(workspace, 'plugins', 'trpg-dice'), path.join(appRoot, 'plugins', 'trpg-dice'), { recursive: true });

// ── 最小 DOM：只实现 config.js 用到的那部分 ──────────────────────────────
class Option { constructor(text, value) { this.text = text; this.value = value ?? ''; } }
class Fragment { constructor() { this.children = []; } append(...items) { for (const item of items) this.children.push(item); } }
class Element {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.dataset = {}; this.listeners = {};
    this.className = ''; this.textContent = ''; this._value = ''; this.checked = false; this.rows = 0;
    this.type = ''; this.placeholder = ''; this.title = ''; this.hidden = false; this.disabled = false;
    this.selectionStart = 0; this.selectionEnd = 0;
  }
  // 真实 <select> 只接受已存在的 option 值；不存在的值会回落成 ''。这里照此实现，
  // 免得测试替浏览器把 bug 放过去。
  get value() { return this._value; }
  set value(next) {
    this._value = String(next ?? '');
    if (this.tagName === 'SELECT' && !this.children.some((child) => child instanceof Option && child.value === this._value)) this._value = '';
  }
  append(...items) { for (const item of items) this.children.push(item); }
  replaceChildren(...items) { this.children = [...items]; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatchEvent(event) { for (const fn of this.listeners[event?.type] ?? []) fn(event); return true; }
  focus() {}
  querySelector(tag) {
    return collect(this, tag)[0] ?? null;
  }
}
function collect(node, tag) {
  const want = String(tag).toUpperCase(), out = [];
  const walk = (current) => {
    for (const child of current?.children ?? []) {
      if (child?.tagName === want) out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}
const byId = new Map([['fields', new Element('div')], ['status', new Element('span')], ['save', new Element('button')]]);
const document = {
  createElement: (tag) => new Element(tag),  createDocumentFragment: () => new Fragment(),
  getElementById: (id) => byId.get(id) ?? null,
};

// 把真实页面脚本注入最小 DOM；只替换那一行绝对路径 import。
const pageSource = fs.readFileSync(path.join(workspace, 'plugins', 'trpg-dice', 'ui', 'config.js'), 'utf8')
  .replace(/^import \{ ctx \} from '\/panels\/panel-client\.js';$/m, '');
const runPage = (ctx) => new Function('ctx', 'document', 'Option', 'Event', `return (async () => {\n${pageSource}\n})();`)(ctx, document, Option, Event);

let kernel, base, failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

try {
  kernel = await createApplication({
    appRoot, headless: true,
    env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_MIGRATE_FROM: path.join(temporary, 'absent') },
    transportFactory: () => ({
      id: 'fixture-312', selfId: '999999', selfNickname: '小鲸鱼',
      bind() {}, async start() {}, stop() {},
      status: () => ({ connected: true, selfId: '999999', everConnected: true }),
      async send() { return [{ msgId: 1 }]; },
    }),
    components: { 'runtime.logger': (options) => defaultComponents['runtime.logger']({ ...options, mirrorConsole: false }) },
    fetchImpl: async () => { throw new Error('外呼被禁用'); },
    priceUpdates: { resolve: () => null, refresh: async () => ({ ok: true }), updateCheck: async () => ({ ok: true, current: '0.5.0', latest: '0.5.0', hasUpdate: false }) },
    communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
  });
  kernel.config.update({
    server: { port: 0, token: 'persona-ui-312' }, telemetry: { enabled: false },
    proactive: { enabled: false }, skills: { 'trpg-dice': { enabled: true, settings: { trpgPersonaEnabled: true } } },
    customPersonas: [{ id: 'custom_probe312', name: '测试人设', text: '你是测试人设', customRules: '' }],
  });
  base = `http://127.0.0.1:${await kernel.start()}`;
  const entry = kernel.loader.hostEntry('trpg-dice');
  assert.equal(entry?.status, 'active', 'trpg-dice 已激活');
  for (const scope of ['qq.send', 'ui.panel', 'persona.read', 'persona.write']) {
    kernel.permissions.setOverride('trpg-dice', scope, 'allow', { fingerprint: entry.fingerprint });
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  const api = async (method, pathname, body) => {
    const response = await fetch(`${base}${pathname}`, {
      method, headers: { 'x-console-token': 'persona-ui-312', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  const panels = (await api('GET', '/api/panels')).body?.panels ?? [];
  const panel = panels.find((item) => item.id === 'trpg-dice_config');
  assert.ok(panel, '配置页面板已列出（ui.panel 授权有效）');

  const envelope = (await api('POST', '/api/panels/trpg-dice_config/call', {
    generation: panel.generation, tool: 'trpg-dice__trpg_list_personas', args: {},
  })).body;
  check('接口: 工具返回人设数组（含出厂 + 自定义）',
    Array.isArray(envelope?.result?.personas) && envelope.result.personas.length === 2,
    JSON.stringify(envelope).slice(0, 200));

  // 用真实接口响应当 ctx.call 的返回值，跑真实页面脚本。
  const customId = envelope?.result?.personas?.find((p) => p.id !== 'xiaojingyu')?.id;
  assert.ok(customId, '自定义人设在返回里可识别');

  const ctx = {
    getConfig: async () => ({ trpgPersonaEnabled: true, trpgPersonaId: customId }),
    call: async () => envelope,
    setConfig: async (patch) => ({ ok: true, config: patch }),
    notify: async () => {},
  };
  await runPage(ctx);
  await new Promise((resolve) => setTimeout(resolve, 30));

  const fields = byId.get('fields');
  const select = collect(fields, 'select')[0];
  const options = select?.children?.filter((child) => child instanceof Option) ?? [];
  check('渲染: 人设区出现下拉框', Boolean(select), select ? `${options.length} 个选项` : '无 select');
  check('渲染: 选项含“不切换”+ 出厂人设 + 自定义人设',
    options.some((o) => o.value === '') && options.some((o) => o.value === 'xiaojingyu') && options.some((o) => o.value === customId),
    JSON.stringify(options.map((o) => `${o.text}:${o.value}`)));
  check('渲染: 已保存的人设 ID 被选中（不是回落成空）', select?.value === customId, String(select?.value));
  check('渲染: 没有出现“人设没读出来”告警', !byId.get('status').textContent.includes('人设未加载'), byId.get('status').textContent);
} finally {
  await kernel?.stop().catch(() => {});
  try { fs.rmSync(temporary, { recursive: true, force: true }); } catch {}
}
console.log(failed ? `✗ 312：${failed} 项失败` : '✓ 312：配置页人设下拉端到端通过');
process.exit(failed ? 1 : 0);

import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { buildDefaultConfig, createConfig } from '../src/kernel/config.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { eq, ok, mktmp, section, summary } from './helpers.mjs';

const dataDir = mktmp('qqa-m3-skill-config-');
const staticDir = mktmp('qqa-m3-skill-config-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), 'ok');
const log = { error() {}, warn() {}, info() {}, level: 'info', recent: () => [], setLevel: () => 'info' };
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log });
config.load();
config.update({
  server: { port: 0, token: 'console-token' },
  skills: { demo: { enabled: true, settings: { title: '原始标题', apiToken: 'kept-secret', undeclared: 'nope' } } },
});

let entries = [{
  id: 'demo', name: '演示技能', version: '1.2.3', kind: 'skill', category: 'utility', root: 'skills',
  status: 'active', loadError: null, enabled: true, tools: ['demo__echo'], requires: ['demo.capability'],
  settings: { title: '默认标题', apiToken: '' },
  configSchema: { title: { type: 'string' }, apiToken: { type: 'string', secret: true } },
}];
const loader = {
  listEntries: () => entries.map((entry) => ({
    ...structuredClone(entry),
    settings: { ...entry.settings, ...(config.get().skills?.[entry.id]?.settings ?? {}) },
  })), 
  promptSections: () => [],
  isActive: (id) => entries.some((entry) => entry.id === id && entry.status === 'active'),
  async setEnabled(id, enabled) {
    const entry = entries.find((item) => item.id === id);
    entry.enabled = enabled;
    entry.status = enabled ? 'active' : 'disabled';
    config.update({ skills: { [id]: { enabled } } });
  },
  async loadAll() { entries = entries.filter((entry) => entry.id !== 'removed'); return this.listEntries(); },
};
const registry = createToolRegistry();
const capability = {
  names: () => ['demo.capability'],
  explain: () => ({ name: 'demo.capability', exists: true, providers: [{ ownerId: 'demo', kind: 'function', active: true }, { ownerId: 'other', kind: 'placeholder', active: false }] }),
};
registry.register({ id: 'demo__echo', ownerId: 'demo', name: '回显', category: 'utility', execute: () => ({ ok: true }) });
registry.register({ id: 'vision', name: '看图', category: 'media', requiresVision: true, execute: () => ({ ok: true }) });
const effects = { max: [], keep: [], proactive: 0, stopped: 0, price: 0 };
const store = createChatStore({ dataDir, log });
store.setMaxPerChat = (value) => effects.max.push(value);
const sessions = createSessionRegistry({ dataDir, log });
sessions.setKeepFiles = (value) => effects.keep.push(value);
const http = createHttpServer({ config, log, staticDir });
registerConsoleRoutes(http, {
  config, sessions, store, memory: createMemoryStore({ dataDir, log }), loader,
  orchestrator: { status: () => ({}), startProactiveLoop: () => effects.proactive++, stopProactiveLoop: () => effects.stopped++ },
  capability, registry, log, dataDir,
  initPriceFeed: () => effects.price++,
});
const port = await http.listen();
async function request(method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method, headers: { 'x-console-token': 'console-token' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

section('R53 清单 DTO 使用 loader 元数据且掩码密钥');
let response = await request('GET', '/api/skills');
const skill = response.data.skills[0];
eq(skill.configSchema.title.type, 'string', '返回 manifest configSchema');
eq(skill.requires, ['demo.capability'], '返回 manifest requires');
eq(skill.settings.title, '原始标题', '返回已存非密钥设置');
eq(skill.settings.apiToken, '******', '密钥设置掩码');

section('R56 schema 过滤及密钥三态保留');
response = await request('POST', '/api/skills/demo', { settings: { title: '新标题', apiToken: '******', undeclared: 'discarded' } });
eq(response.status, 200, '技能设置保存成功');
eq(config.get().skills.demo.settings.title, '新标题', '已声明普通设置更新');
eq(config.get().skills.demo.settings.apiToken, 'kept-secret', '占位符保留密钥');
eq(config.get().skills.demo.settings.undeclared, 'nope', '未声明设置未被本次请求写入');
await request('POST', '/api/skills/demo', { settings: { apiToken: '' } });
eq(config.get().skills.demo.settings.apiToken, 'kept-secret', '空串保留密钥');
await request('POST', '/api/skills/demo', { settings: { apiToken: 'replaced-secret' }, enabled: false });
eq(config.get().skills.demo.settings.apiToken, 'replaced-secret', '明文覆盖密钥');
eq(entries[0].status, 'disabled', '禁用触发生命周期入口');

section('R54 真实前后差报告 pruned');
entries.push({ ...entries[0], id: 'removed', name: '已删除', status: 'active' });
response = await request('POST', '/api/skills/reload', {});
eq(response.data.pruned, ['removed'], '重扫返回真实 pruned 条目');

section('R57 能力 DTO 标明可用和提供者可用性');
response = await request('GET', '/api/skills/capabilities');
const capabilityDto = response.data.capabilities[0];
eq(capabilityDto.available, true, '能力存在时可用');
eq(capabilityDto.providers[0].usable, true, '活跃实现者可用');
eq(capabilityDto.providers[1].usable, false, '占位或非活跃提供者不可用');

section('R58 availability 与运行时配置同口径');
config.update({ tools: { enabled: true, categories: { media: true } }, api: { vision: false } });
response = await request('GET', '/api/tools/availability');
const vision = response.data.tools.find((tool) => tool.id === 'vision');
eq(vision.code, 'no-vision', 'vision 工具不可用原因正确');
config.update({ tools: { enabled: false } });
response = await request('GET', '/api/tools/availability');
eq(response.data.tools.find((tool) => tool.id === 'demo__echo').code, 'tools-disabled', '总工具开关生效');

section('R59 保存配置立即调用已提供副作用');
response = await request('POST', '/api/config', { store: { maxMessagesPerChat: 33, keepSessionFiles: 7 }, proactive: { enabled: true } });
eq(response.status, 200, '配置保存成功');
eq(effects.max.at(-1), 33, '存档上限立即生效');
eq(effects.keep.at(-1), 7, '会话保留数立即生效');
eq(effects.proactive, 1, '主动循环立即启动');
eq(effects.price, 1, '价格源在可用时刷新');

await http.close();
summary('33-m3-skill-config');

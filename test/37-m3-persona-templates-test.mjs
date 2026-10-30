import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { eq, ok, mktmp, section, summary } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mktmp('qqa-m3-persona-');
const staticDir = mktmp('qqa-m3-persona-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), 'ok');
const log = { error() {}, warn() {}, info() {}, level: 'info', recent: () => [], setLevel: () => 'info' };
const config = createConfig({ dataDir, defaults: buildDefaultConfig({ personaText: '' }), log });
config.load();
config.update({
  server: { port: 0, token: 'persona-secret' },
  customPersonas: [{ name: '自定义', text: '我的角色卡', customRules: '规则' }],
});
const http = createHttpServer({ config, log, staticDir });
const loader = { listEntries: () => [], promptSections: () => [], loadAll: async () => [], setEnabled: async () => [] };
const orchestrator = { status: () => ({}), pause() {}, resume() {}, stopProactiveLoop() {} };
registerConsoleRoutes(http, {
  config,
  sessions: createSessionRegistry({ dataDir, log }),
  store: createChatStore({ dataDir, log }),
  memory: createMemoryStore({ dataDir, log }),
  loader,
  orchestrator,
  registry: { list: () => [], availability: () => ({ ok: true }) },
  capability: { names: () => [], explain: () => ({}) },
  log,
  dataDir,
});
const port = await http.listen();
const response = await fetch(`http://127.0.0.1:${port}/api/persona-templates`, {
  headers: { 'x-console-token': 'persona-secret' },
});
const data = await response.json();
const asset = fs.readFileSync(path.join(ROOT, 'assets', 'personas', 'xiaojingyu.txt'), 'utf8').trimEnd();

section('R19 内置人设在前且复用角色卡资产');
eq(response.status, 200, 'persona template status');
eq(data.templates[0].id, 'xiaojingyu', 'factory persona has stable id');
eq(data.templates[0].builtin, true, 'factory persona is marked builtin');
eq(data.templates[0].text, asset, 'factory persona text exactly matches asset');
ok(typeof data.templates[1].id === 'string' && data.templates[1].id !== 'custom_0', 'custom persona has a stable identity instead of an array index');
const beforeRead = fs.readFileSync(config.file, 'utf8');
const reread = await (await fetch(`http://127.0.0.1:${port}/api/persona-templates`, { headers: { 'x-console-token': 'persona-secret' } })).json();
eq(reread.templates[1].id, data.templates[1].id, 'legacy template keeps the same identity across reads');
eq(fs.readFileSync(config.file, 'utf8'), beforeRead, 'reading a legacy identity does not rewrite configuration');
eq(data.templates[1].builtin, false, 'custom persona remains non-builtin');
eq(data.templates[1].customRules, '规则', 'custom persona preserves custom rules');
ok(data.templates.every((item) => typeof item.name === 'string' && typeof item.text === 'string'), 'all template DTOs expose name and text');

await http.close();
summary('37-m3-persona-templates');

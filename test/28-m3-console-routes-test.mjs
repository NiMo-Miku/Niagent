import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createChatStore } from '../src/kernel/store.js';
import { mktmp, eq, ok, section, summary, sleep } from './helpers.mjs';

const dataDir = mktmp('qqa-m3-routes-');
const staticDir = mktmp('qqa-m3-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html>');
const log = { error() {}, warn() {}, info() {}, recent: () => [], setLevel: (x) => ['debug','info','warn','error'].includes(x) ? x : 'info' };
const config = createConfig({ dataDir, defaults: buildDefaultConfig({ personaText: '' }), log });
config.load();
config.update({ server: { port: 0, token: 'route-secret' }, api: { apiKey: 'real-key', model: 'm' }, providers: [{ id: 'p', apiKey: 'provider-key' }], dshProviderKeys: { p: 'provider-key' } });
const bus = { emit() {} };
const sessions = createSessionRegistry({ dataDir, log, bus });
const store = createChatStore({ dataDir, log });
const finished = sessions.create('group:123'); sessions.finish(finished.id, 'done', { messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'secret prompt' });
const running = sessions.create('group:123');
store.appendIncoming('group:123', { senderId: '7', senderName: 'A', text: 'hello', ts: 10 });
const loader = { listEntries: () => [{ id: 'demo', name: 'Demo', version: '1.0.0', kind: 'skill', status: 'active', enabled: true, tools: [] }], promptSections: () => [], loadAll: async () => loader.listEntries(), setEnabled: async () => loader.listEntries() };
const orchestrator = { status: () => ({ paused: false, running: 0 }), retrySession: () => ({ ok: true }), abortSession: () => ({ ok: true }), pause() {}, resume() {} };
const capability = { names: () => [], explain: (n) => ({ name: n, available: true }) };
const registry = { list: () => [{ id: 'tool', description: 'tool', category: 'utility', params: { type: 'object' } }] };
const http = createHttpServer({ config, log, staticDir });
registerConsoleRoutes(http, { config, sessions, store, loader, orchestrator, log, capability, registry, dataDir, onebot: {} });
const port = await http.listen();
async function req(method, url, body, extra = {}) { const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'x-console-token': 'route-secret', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }); const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; } return { status: r.status, data }; }

section('R43 config 脱敏与密钥保留');
const cfg = await req('GET', '/api/config');
eq(cfg.status, 200, 'config status');
ok(!('apiKey' in cfg.data.api) && cfg.data.api.hasApiKey === true, 'apiKey removed + hasApiKey');
ok(!('apiKey' in cfg.data.providers[0]) && cfg.data.providers[0].hasApiKey === true, 'provider key removed');
const saved = await req('POST', '/api/config', { api: { model: 'changed' }, providers: [{ id: 'p', hasApiKey: true }] });
eq(saved.status, 200, 'config patch status');
eq(config.get().api.apiKey, 'real-key', 'scalar key preserved');
eq(config.get().providers[0].apiKey, 'provider-key', 'array key preserved');

section('R44 prompt preview 临时合并');
const before = config.get().persona.botName;
const preview = await req('POST', '/api/prompt-preview', { persona: { botName: 'Temporary' } });
eq(preview.status, 200, 'preview status');
ok(preview.data.systemPrompt.includes('Temporary'), 'preview applies patch');
eq(config.get().persona.botName, before, 'preview does not persist');

section('R53 skills view/reload/availability');
const skills = await req('GET', '/api/skills');
ok(Array.isArray(skills.data.skills) && skills.data.summary.total === 1, 'skills summary');
const reload = await req('POST', '/api/skills/reload');
eq(reload.status, 200, 'reload status');
const tools = await req('GET', '/api/tools');
eq(tools.data.tools[0].id, 'tool', 'tools DTO');

section('R65-R69 sessions');
const detail = await req('GET', `/api/sessions/${finished.id}`);
eq(detail.status, 200, 'detail status');
ok(Array.isArray(detail.data.messages), 'detail includes messages');
eq((await req('DELETE', `/api/sessions/${running.id}`)).status, 409, 'running delete conflict');
const anotherFinished = sessions.create('group:123'); sessions.finish(anotherFinished.id, 'done');
eq((await req('DELETE', `/api/sessions/${finished.id}`)).status, 200, 'finished delete');
const cleared = await req('POST', '/api/sessions/clear-finished');
eq(cleared.status, 200, 'clear finished status');
eq(cleared.data.removed, 1, 'clear finished removes terminal session');

section('R77 chat key and limit');
const messages = await req('GET', '/api/chats/group_123/messages?limit=1');
eq(messages.status, 200, 'messages status');
eq(messages.data.chatKey, 'group:123', 'underscore key conversion');
eq(messages.data.messages.length, 1, 'limit respected');

await http.close();
summary('28-m3-console-routes');

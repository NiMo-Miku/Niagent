import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createChatStore } from '../src/kernel/store.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { eq, ok, mktmp, section, summary } from './helpers.mjs';

const dataDir = mktmp('qqa-m3-breakdown-subset-');
const staticDir = mktmp('qqa-m3-breakdown-subset-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), 'ok');
const log = { error() {}, warn() {}, info() {} };
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log });
config.load();
config.update({ server: { port: 0, token: 'subset-secret' }, allowAllWhenEmpty: true, api: { useOfficialPrice: false, priceInputPerM: 10, priceOutputPerM: 20 } });
const sessions = createSessionRegistry({ dataDir, log, bus: { emit() {} } });
const store = createChatStore({ dataDir, log });
const orch = { status: () => ({ paused: false, running: [], waiting: [] }) };
const http = createHttpServer({ config, log, staticDir });
registerConsoleRoutes(http, { config, sessions, store, orchestrator: orch, dataDir, log });
const port = await http.listen();
async function request(pathname) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { headers: { 'x-console-token': 'subset-secret' } });
  return { status: response.status, data: await response.json() };
}
function dayKey(offset = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const day = dayKey();
const at = Date.now() - 60_000;
fs.mkdirSync(path.join(dataDir, 'usage-days'), { recursive: true });
fs.writeFileSync(path.join(dataDir, 'usage-days', `${day}.json`), JSON.stringify({
  version: 1, day, savedAt: Date.now(), aggregates: {
    totals: { cost: 0.003, promptTokens: 100, completionTokens: 50, totalTokens: 150, cachedTokens: 0, runs: 1, exactCalls: 1 },
    chats: [{ chatKey: 'group:1', cost: 0.003, token: 150, promptTokens: 100, completionTokens: 50, totalTokens: 150, runs: 1, exactCalls: 1 }],
    models: [{ model: 'm-snapshot', vendor: 'v', cost: 0.003, token: 150, promptTokens: 100, completionTokens: 50, totalTokens: 150, runs: 1, exactCalls: 1 }],
    hours: [{ hour: new Date(at).getHours(), cost: 0.003, token: 150, promptTokens: 100, completionTokens: 50, totalTokens: 150, runs: 1, exactCalls: 1 }],
    searchCount: 0, toolCounts: {},
  },
}, null, 2));

// 完整会话用于交叉下钻；该日有快照，但交叉维度必须跳过快照扫描 session。
const session = sessions.create('group:1');
session.startedAt = at; session.model = 'm-session'; session.vendor = 'v2';
sessions.finish(session.id, 'done', { startedAt: at, usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, cachedTokens: 0, calls: 1 }, messages: [] });

section('R05 同维度快照过滤 totals 与 rows 一致');
let response = await request(`/api/usage/breakdown?range=1&dim=chat&key=group%3A1&by=chat`);
eq(response.status, 200, 'chat breakdown status');
eq(response.data.totals.token, 150, 'chat snapshot total');
eq(response.data.rows.reduce((sum, row) => sum + row.token, 0), response.data.totals.token, 'chat rows sum to totals');

section('R05 chat×model 交叉强制完整 session 扫描');
response = await request(`/api/usage/breakdown?range=1&dim=chat&key=group%3A1&by=model`);
eq(response.status, 200, 'cross breakdown status');
eq(response.data.totals.token, 150, 'cross session total');
eq(response.data.rows.reduce((sum, row) => sum + row.token, 0), response.data.totals.token, 'cross rows sum to totals');
eq(response.data.rows[0].model, 'm-session', 'cross uses full session model');

section('R05 model×chat 交叉 totals 是子集');
response = await request(`/api/usage/breakdown?range=1&dim=model&key=m-session&by=chat`);
eq(response.data.totals.token, 150, 'reverse cross total');
eq(response.data.rows.reduce((sum, row) => sum + row.token, 0), response.data.totals.token, 'reverse rows sum to totals');

await http.close();
summary('39-m3-usage-breakdown-subset');

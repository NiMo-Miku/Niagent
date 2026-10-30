// Channel/model identities must survive retention without assigning old
// aggregate baselines to a provider or charging them twice.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createUsageDayStore } from '../src/kernel/usage-days.js';
import { registerConsoleRoutes, usageCost } from '../src/console/routes.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-usage163-'));
const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-usage163-static-'));
const log = { error() {}, warn() {}, info() {} }, token = 'usage163-fixture';
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log });
config.load();
config.update({ server: { port: 0, token }, telemetry: { enabled: false }, api: { useOfficialPrice: false, priceInputPerM: 10, priceOutputPerM: 20, priceCachedPerM: 2 } });
const days = createUsageDayStore({ dataDir, log, costFor: s => usageCost(s.usage, s.model, s.startedAt, config.get()) });
const sessions = createSessionRegistry({ dataDir, log, keepSessionFiles: () => 1, onFinishedSession: days.record });
const http = createHttpServer({ config, log, staticDir });
registerConsoleRoutes(http, { config, sessions, dataDir, log });
let base;
let endedAt = Date.now();
const model = 'shared-model', alpha = 'alpha', beta = 'beta&渠道/one';
const usage = (tokens, calls = 1) => ({ promptTokens: tokens, completionTokens: 0, totalTokens: tokens, cachedTokens: 0, calls });
const dayKey = value => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const at = offset => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(10, 0, 0, 0); return d.getTime(); };
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
async function api(url) { const r = await fetch(base + url, { headers: { 'x-console-token': token } }); assert.equal(r.status, 200); return r.json(); }
const detail = params => api(`/api/usage/breakdown?${new URLSearchParams({ range: 'all', dim: 'model', key: model, by: 'model', ...params })}`);
function seed(providerId, tokens, startedAt, baseline = null) {
  const s = sessions.create('group:163');
  Object.assign(s, { model, providerId, vendor: 'same-display-vendor', startedAt, usage: usage(tokens, baseline ? 2 : 1) });
  if (baseline) s.accountedUsage = { ...usage(baseline), counted: true };
  sessions.finish(s.id, 'done', { endedAt: ++endedAt });
  return s;
}

try {
  base = `http://127.0.0.1:${await http.listen()}`;
  const modernA = seed(alpha, 100, at(-2)), modernB = seed(beta, 200, at(-2));
  assert.equal(fs.existsSync(path.join(dataDir, 'sessions', `${modernA.id}.json`)), false, 'fixture removes a session file while its durable record remains');
  let stats = await api('/api/usage/stats?range=all');
  assert.equal(stats.models.length, 2);
  assert.deepEqual(new Set(stats.models.map(r => r.provider)), new Set([alpha, beta]));
  assert.equal(new Set(stats.models.map(r => r.modelKey)).size, 2);
  for (const row of stats.models) { assert.equal(row.model, model); assert.deepEqual(JSON.parse(row.modelKey), [row.provider, model]); }
  assert.equal(stats.totals.totalTokens, 300);
  near(stats.totals.cost, 0.003, 'modern total uses recorded costs');
  const archiveFile = path.join(dataDir, 'usage-days', `${dayKey(at(-2))}.json`), archiveBefore = fs.readFileSync(archiveFile, 'utf8');

  console.log('· same raw model is separated by actual recorded provider, including retained archives');
  config.update({ api: { priceInputPerM: 1000000, priceOutputPerM: 2000000 } });
  let result = await detail({ provider: alpha, by: 'session' });
  assert.equal(result.totals.totalTokens, 100); near(result.totals.cost, 0.001, 'provider filter keeps archived price');
  assert.equal(result.rows[0].key, modernA.id);
  result = await detail({ provider: beta, by: 'chat' });
  assert.equal(result.totals.totalTokens, 200); assert.equal(result.rows[0].key, 'group:163');
  result = await detail({});
  assert.equal(result.rows.length, 2); assert.equal(result.totals.totalTokens, 300);
  assert.equal(result.rows.reduce((n, row) => n + row.totalTokens, 0), 300, 'raw model query without provider still includes all channels');
  assert.equal((await detail({ provider: 'missing' })).totals.totalTokens, 0);
  assert.equal((await detail({ provider: alpha, dim: 'provider', key: beta })).totals.totalTokens, 0, 'provider scope is intersected with the original dimension');
  assert.equal(fs.readFileSync(archiveFile, 'utf8'), archiveBefore, 'usage reads do not rewrite or reprice history');

  console.log('· legacy baseline remains unassigned while only known record contributions gain a provider');
  const legacyDay = dayKey(at(-1));
  const legacy = { totals: { promptTokens: 100, totalTokens: 100, cost: 90, runs: 7, exactCalls: 7 },
    models: [{ model, vendor: 'ambiguous-old-vendor', promptTokens: 100, totalTokens: 100, token: 100, cost: 90, runs: 7, exactCalls: 7 }],
    chats: [{ chatKey: 'group:old', totalTokens: 100, cost: 90 }], hours: [], searchCount: 0, toolCounts: {} };
  fs.writeFileSync(path.join(dataDir, 'usage-days', `${legacyDay}.json`), JSON.stringify({ version: 1, day: legacyDay, aggregates: legacy }));
  const legacyA = seed(alpha, 12, at(-1), 10), legacyB = seed(beta, 23, at(-1), 20);
  stats = await api('/api/usage/stats?range=all');
  assert.equal(stats.totals.totalTokens, 405); near(stats.totals.cost, 95.003, 'legacy baseline plus new contributions counted once');
  assert.equal(stats.models.reduce((n, row) => n + row.totalTokens, 0), 405);
  near(stats.models.reduce((n, row) => n + row.cost, 0), stats.totals.cost, 'all model costs sum to unchanged total');
  assert.equal(stats.models.find(row => row.provider === null).totalTokens, 100);
  assert.equal(stats.models.find(row => row.provider === alpha).totalTokens, 102);
  assert.equal(stats.models.find(row => row.provider === beta).totalTokens, 203);
  assert.equal(stats.models.find(row => row.provider === null).vendor, 'ambiguous-old-vendor', 'a display vendor cannot establish a unique provider');
  for (const provider of [alpha, beta]) {
    const expected = stats.models.find(row => row.provider === provider);
    for (const by of ['model', 'day', 'chat', 'session', 'provider']) {
      result = await detail({ provider, by });
      assert.equal(result.totals.totalTokens, expected.totalTokens, `${provider}/${by} matches its clicked model row`);
      near(result.totals.cost, expected.cost, `${provider}/${by} preserves contribution cost`);
      assert.equal(result.rows.reduce((n, row) => n + row.totalTokens, 0), result.totals.totalTokens);
      near(result.rows.reduce((n, row) => n + row.cost, 0), result.totals.cost, 'scoped detail costs reconcile');
    }
  }
  for (const by of ['model', 'day']) {
    result = await detail({ provider: '', by });
    assert.equal(result.provider, ''); assert.equal(result.totals.totalTokens, 100); assert.equal(result.totals.cost, 90);
    assert.equal(result.rows.reduce((n, row) => n + row.totalTokens, 0), 100);
  }
  for (const by of ['chat', 'session', 'hour', 'provider']) {
    result = await detail({ provider: '', by });
    assert.equal(result.totals.totalTokens, 100); assert.equal(result.detailUnavailable, true); assert.deepEqual(result.rows, [], 'no historical model cross table is invented');
  }
  result = await detail({});
  assert.equal(result.totals.totalTokens, 405); assert.equal(result.rows.length, 3, 'absent provider remains the full raw-model scope');

  console.log('· retries add only live increments and repeated finishing cannot duplicate a provider contribution');
  sessions.update(legacyB, { status: 'running', usage: usage(26, 3) });
  stats = await api('/api/usage/stats?range=all');
  assert.equal(stats.totals.totalTokens, 408); near(stats.totals.cost, 98.003, 'live delta adds once above archived baseline');
  result = await detail({ provider: beta, by: 'session' });
  assert.equal(result.totals.totalTokens, 206); near(result.totals.cost, 6.002, 'scoped retry adds live increment to recorded contribution');
  assert.equal(result.rows.find(row => row.key === legacyB.id).totalTokens, 6);
  sessions.finish(legacyB.id, 'done');
  sessions.finish(legacyB.id, 'done');
  const after = await api('/api/usage/stats?range=all');
  assert.equal(after.totals.totalTokens, stats.totals.totalTokens); near(after.totals.cost, stats.totals.cost, 'repeated finish is idempotent');
  const disk = JSON.parse(fs.readFileSync(path.join(dataDir, 'usage-days', `${legacyDay}.json`)));
  assert.deepEqual(disk.legacyAggregates, legacy);
  assert.equal(disk.records[legacyA.id].providerId, alpha);
  assert.equal(disk.records[legacyB.id].contributionCost, 6);
  assert.equal(fs.readFileSync(archiveFile, 'utf8'), archiveBefore);
  console.log('✓ 163 provider/model identities, legacy scope, retained prices and no-overcount passed');
} finally {
  await http.close(); sessions.stop();
  fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(staticDir, { recursive: true, force: true });
}

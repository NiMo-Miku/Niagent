// Real console HTTP and kernel terminal-usage persistence, offline synthetic data only.
import fs from 'node:fs';
import path from 'node:path';
import { createKernel } from '../src/kernel/kernel.js';
import { createHttpServer } from '../src/kernel/http.js';
import { registerConsoleRoutes, usageCost } from '../src/console/routes.js';
import { createPriceUpdateAdapters, PRICE_FEED_URL } from '../src/console/price-update-adapters.js';
import { eq, ok, mktmp, section, summary } from './helpers.mjs';

const dataDir = mktmp('qqa-price146-data-'), staticDir = mktmp('qqa-price146-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), '146 local price fixture');
const log = { info() {}, warn() {}, error() {}, child() { return this; }, recent: () => [] };
let config, mode = 'offline';const requests = [];
const fetchImpl = async (url, options) => {
  requests.push({ url, method: options.method, hasBody: options.body !== undefined });
  if (mode === 'offline') throw new Error('146 synthetic offline');
  return new Response(JSON.stringify(mode === 'invalid' ? { prices: { broken: { in: -1, out: 2 } } } : { prices: {
    'glm-5.3': { in: 3, out: 4, cached: 1 }, 'qa-remote146': { in: 5, out: 6, cached: 0 },
    'qa-negative146': { in: -10, out: 2 }, 'qa-text146': { in: 'not-price', out: 2 },
  } }), { headers: { 'content-type': 'application/json' } });
};
const prices = createPriceUpdateAdapters({ dataDir, config: { get: () => config.get() }, fetchImpl });
const kernel = createKernel({ env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0' }, headless: true, log,
  priceUpdates: prices, transport: { id: 'fixture', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
  communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
});
config = kernel.config;
config.update({ server: { port: 0, token: 'QA_ONLY_PRICE146_CONSOLE' }, telemetry: { enabled: false }, api: {
  model: 'glm-5.3', useOfficialPrice: true, priceInputPerM: 10, priceOutputPerM: 20, priceCachedPerM: 5,
} });
const http = createHttpServer({ config, log, staticDir });
registerConsoleRoutes(http, { config, log, dataDir, sessions: kernel.sessions, store: kernel.store, loader: kernel.loader, fetchImpl });
const port = await http.listen();
async function req(method, pathname) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers: { 'x-console-token': 'QA_ONLY_PRICE146_CONSOLE' } });
  return { status: response.status, data: await response.json() };
}
const cacheFile = path.join(dataDir, 'price-feed-cache.json');
const u = { promptTokens: 1000000, completionTokens: 1000000, totalTokens: 2000000, cachedTokens: 200000, calls: 1 };
const sameRates = (a, b, reason) => eq([a?.in, a?.out, a?.cached, a?.source, a?.matched], [b?.in, b?.out, b?.cached, b?.source, b?.matched], reason);
try {
  section('146 first offline startup has a historical builtin table, matching and nonempty prices');
  let response = await req('GET', '/api/model-prices');
  eq(response.status, 200, 'price table HTTP succeeds offline');
  ok(response.data.prices.length >= 140, 'complete versioned builtin table is available before any network fetch');
  ok(response.data.builtin?.historical === true && response.data.builtin?.sourceSha256 && response.data.builtin?.version, 'builtin snapshot exposes historical version/provenance');
  eq(response.data.current?.source, 'official', 'builtin rates resolve as official reference');
  eq(response.data.current?.origin, 'builtin', 'builtin origin remains explicit');
  sameRates(response.data.current, prices.resolve('glm-5.3'), 'UI table and runtime resolve same builtin rates');
  response = await req('GET', '/api/model-prices?model=Vendor%2FGLM-5.3%40qa146');
  eq(response.data.current?.matched, 'glm-5.3', 'case/provider and separator suffix use longest base model');
  eq((await req('GET', '/api/model-prices?model=glm-5.30')).data.current?.source, 'manual', 'unrelated numeric-prefix model uses manual fallback');
  response = await req('POST', '/api/model-prices/refresh');
  eq(response.data.ok, false, 'cold refresh fails honestly');
  ok(response.data.prices.length >= 140, 'cold refresh failure keeps builtin data');
  ok(!fs.existsSync(cacheFile), 'failed cold refresh does not create fake successful cache');
  const foreignCache = JSON.stringify({ url: 'https://untrusted.invalid/prices', fetchedAt: Date.now(), prices: { 'glm-5.3': { in: 999, out: 999 } } });
  fs.writeFileSync(cacheFile, foreignCache);
  response = await req('GET', '/api/model-prices');
  eq(response.data.current?.origin, 'builtin', 'cache belonging to another URL is not trusted as official feed');
  eq(fs.readFileSync(cacheFile, 'utf8'), foreignCache, 'ignoring foreign cache does not erase its file');
  fs.unlinkSync(cacheFile);

  section('146 custom wins remote, remote overlays builtin, validation and official toggle agree');
  mode = 'success';response = await req('POST', '/api/model-prices/refresh');
  eq(response.data.ok, true, 'valid remote feed refreshes');
  eq(response.data.current?.in, 3, 'remote rate overrides same builtin model');
  eq(response.data.current?.origin, 'remote', 'remote origin explicit');
  ok(response.data.prices.some(row => row.origin === 'builtin'), 'partial remote table retains remaining builtin models');
  ok(!response.data.prices.some(row => ['qa-negative146', 'qa-text146'].includes(row.id)), 'invalid/negative remote rates are rejected');
  ok(response.data.remote.dropped >= 2, 'rejected remote rows counted');
  const cacheBeforeFailure = fs.readFileSync(cacheFile, 'utf8');
  config.update({ api: { modelPrices: { 'glm-5.3': { in: 9, out: 10, cached: 0 }, 'qa-free146': { in: 0, out: 0, cached: 0 } } } });
  response = await req('GET', '/api/model-prices');
  eq(response.data.current?.source, 'custom', 'HTTP current uses custom before remote');
  eq(response.data.prices.find(row => row.id === 'glm-5.3')?.in, 9, 'HTTP table itself also uses custom before remote');
  sameRates(response.data.current, prices.resolve('glm-5.3'), 'HTTP/runtime custom rates agree');
  eq(prices.resolve('Vendor/GLM-5.3@qa146')?.in, 9, 'custom price retains priority through provider/case/suffix matching');
  config.update({ api: { modelPrices: { 'deepseek-flash': { in: 7, out: 9, cached: 0 }, 'qa-numeric146': { in: '2', out: '3', cached: '0' } } } });
  const customPeak = (await req('GET', '/api/model-prices?model=deepseek-flash')).data.current;
  eq(customPeak?.peak, undefined, 'custom row does not inherit builtin peak tiers');
  eq(prices.resolve('qa-numeric146')?.cached, 0, 'legacy custom numeric strings normalize without losing free cache rate');
  const free = (await req('GET', '/api/model-prices?model=qa-free146')).data.current;
  eq(free?.source, 'custom', 'explicit zero-rate custom row is not treated as missing');
  eq(usageCost(u, 'qa-free146', Date.now(), config.get(), { resolveModelPrice: prices.resolve }).cost, 0, 'free custom row costs exactly zero');
  mode = 'invalid';response = await req('POST', '/api/model-prices/refresh');
  eq(response.data.ok, false, 'all-invalid remote feed is not accepted');
  eq(fs.readFileSync(cacheFile, 'utf8'), cacheBeforeFailure, 'invalid remote update leaves last valid cache exact');
  eq(response.data.current?.in, 9, 'failure retains custom precedence');
  config.update({ api: { useOfficialPrice: false, modelPrices: { __replace__: {} } } });
  response = await req('GET', '/api/model-prices?model=glm-5.3');
  eq(response.data.current?.source, 'manual', 'official off means global manual even for matched builtin/remote');
  eq(response.data.current?.cached, 5, 'explicit global cached rate is preserved');
  eq(prices.resolve('glm-5.3'), null, 'optional official resolver still yields when official switch is off');
  config.update({ api: { priceCachedPerM: 0 } });
  eq((await req('GET', '/api/model-prices?model=glm-5.3')).data.current?.cached, 10, 'global zero cache rate exposes conservative input-rate fallback');
  eq(usageCost({ promptTokens: 1000000, cachedTokens: 1000000, completionTokens: 0 }, 'qa-manual-cache146', Date.now(), config.get()).cost, 10, 'global unset cache is billed at input rate rather than accidentally free');
  config.update({ api: { priceCachedPerM: 5 } });

  section('146 unknown official model falls back to manual and recorded history is never repriced');
  config.update({ api: { useOfficialPrice: true, model: 'qa-unknown146' } });
  response = await req('GET', '/api/model-prices');
  eq(response.data.current?.source, 'manual', 'unknown official model exposes actual manual fallback');
  const old = kernel.sessions.create('group:146');old.model = 'qa-unknown146';
  kernel.sessions.finish(old.id, 'done', { usage: { ...u }, messages: [] });
  const files = fs.readdirSync(path.join(dataDir, 'usage-days')).filter(name => name.endsWith('.json'));
  const usageFile = path.join(dataDir, 'usage-days', files[0]);
  const rawBefore = fs.readFileSync(usageFile, 'utf8'), recordBefore = JSON.parse(rawBefore).records[old.id];
  eq(recordBefore.cost, 29, 'actual kernel terminal callback charges manual fallback 8 fresh + 1 cached + 20 output');
  eq(recordBefore.costInfo.prices.cached, 5, 'durable record stores actual cached unit price');
  config.update({ api: { priceInputPerM: 100, priceOutputPerM: 200 } });
  mode = 'success';await req('POST', '/api/model-prices/refresh');
  response = await req('GET', `/api/usage/breakdown?range=all&dim=model&key=qa-unknown146&by=session`);
  eq(response.status, 200, 'historical usage HTTP succeeds');
  eq(response.data.totals.cost, 29, 'price/config change does not reprice old record');
  eq(fs.readFileSync(usageFile, 'utf8'), rawBefore, 'read/price refresh does not rewrite stored usage file');
  const fresh = kernel.sessions.create('group:146');fresh.model = 'qa-unknown146';
  kernel.sessions.finish(fresh.id, 'done', { usage: { ...u }, messages: [] });
  const archive = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
  eq(archive.records[old.id].costInfo, recordBefore.costInfo, 'new record preserves old fixed rate and contribution');
  eq(archive.records[fresh.id].cost, 281, 'new terminal record uses changed manual fallback');
  response = await req('GET', '/api/usage/breakdown?range=all&dim=model&key=qa-unknown146&by=session');
  eq(response.data.totals.cost, 310, 'actual usage combines old fixed 29 and new 281');
  eq(response.data.rows.reduce((sum, row) => sum + row.cost, 0), 310, 'HTTP detail rows reconcile with exact total');
  ok(requests.every(row => row.url === PRICE_FEED_URL && row.method === 'GET' && !row.hasBody), 'feed uses fixed GET address only, never credentials or arbitrary URL');
} finally {
  await http.close();await kernel.stop();kernel.sessions.stop();
  for (const dir of [dataDir, staticDir]) fs.rmSync(dir, { recursive: true, force: true });
}
summary('146-price-fallback-integrity');

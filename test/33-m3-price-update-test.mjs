import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createChatStore } from '../src/kernel/store.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { PRICE_FEED_URL, UPDATE_INFO_URL, compareSemver, createPriceUpdateAdapters } from '../src/console/price-update-adapters.js';
import { eq, ok, mktmp, section, summary } from './helpers.mjs';
import { createKernel } from '../src/kernel/kernel.js';

const dataDir = mktmp('qqa-m3-price-');
const staticDir = mktmp('qqa-m3-price-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), 'ok');
const log = { error() {}, warn() {}, info() {}, recent: () => [], setLevel: () => 'info' };
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log });
config.load();
config.update({ server: { port: 0, token: 'price-secret' }, api: { model: 'remote-model', modelPrices: { local: { in: 1, out: 2 } } } });
const requested = [];
let mode = 'success';
const fetchImpl = async (url, options) => {
  requested.push({ url, options });
  if (mode === 'network-fail') throw new Error('离线');
  if (mode === 'bad-version') return { ok: true, status: 200, json: async () => ({ notes: 'missing version' }) };
  if (url === PRICE_FEED_URL) return { ok: true, status: 200, json: async () => ({ prices: [{ id: 'remote-model', in: 3, out: 4, cached: 1 }, { id: 'free-model', in: 0, out: 0 }], version: 'test' }) };
  if (url === UPDATE_INFO_URL) return { ok: true, status: 200, json: async () => ({ version: '0.5.1.99', url: 'https://example.test/release', notes: '更新说明' }) };
  throw new Error(`unexpected URL ${url}`);
};
const http = createHttpServer({ config, log, staticDir });
const sessions = createSessionRegistry({ dataDir, log, bus: { emit() {} } });
const store = createChatStore({ dataDir, log });
const priceUpdates = createPriceUpdateAdapters({ dataDir, config, version: '0.5.0', fetchImpl });
registerConsoleRoutes(http, { config, sessions, store, log, dataDir, version: '0.5.0', fetchImpl });
const port = await http.listen();
async function request(method, pathname) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers: { 'x-console-token': 'price-secret' } });
  return { status: response.status, data: await response.json() };
}

section('R06 本地价格 DTO');
let response = await request('GET', '/api/model-prices?model=local');
eq(response.status, 200, '价格读取始终成功');
eq(response.data.current.matched, 'local', 'query model 优先于当前配置');
eq(response.data.remote.url, PRICE_FEED_URL, '固定价格地址');

section('R07 远程刷新、覆盖与原子缓存');
response = await request('POST', '/api/model-prices/refresh');
eq(response.status, 200, '刷新 HTTP 200');
eq(response.data.ok, true, '刷新成功');
eq(response.data.current.in, 3, '远程价格命中当前模型');
ok(response.data.prices.some((entry) => entry.id === 'remote-model' && entry.remote === true), '远程条目有标记');
eq(requested[0].url, PRICE_FEED_URL, '仅请求固定价格 URL');
eq(requested[0].options.cache, 'no-store', '价格请求禁止缓存');
const cacheFile = path.join(dataDir, 'price-feed-cache.json');
ok(fs.existsSync(cacheFile), '刷新写入缓存');
ok(!fs.existsSync(`${cacheFile}.${process.pid}.tmp`), '原子临时文件已替换');
response = await request('GET', '/api/model-prices');
eq(response.data.remote.source, 'cache', '读取使用缓存状态');
eq(response.data.current.id, 'remote-model', '缓存覆盖本地同名价格');

section('价格 resolver：自定义优先、缓存官方匹配和关闭官方后的兜底');
const cacheResolved = priceUpdates.resolve('remote-model', config.get());
eq(cacheResolved.source, 'official', '缓存模型按官方价格解析');
eq(cacheResolved.matched, 'remote-model', '缓存模型保持匹配 id');
config.update({ api: { modelPrices: { 'remote-model': { in: 9, out: 10, cached: 2 } } } });
const customResolved = priceUpdates.resolve('remote-model', config.get());
eq(customResolved.source, 'custom', '模型自定义价格优先于缓存官方价');
eq(customResolved.in, 9, '自定义输入价格生效');
config.update({ api: { useOfficialPrice: false, modelPrices: { __replace__: {} } } });
eq(priceUpdates.resolve('remote-model', config.get()), null, '关闭官方价格不读取远程缓存价格');
config.update({ api: { useOfficialPrice: true, modelPrices: { __replace__: {} } } });

section('R07 失败仍返回 HTTP 200 和缓存回退');
mode = 'network-fail';
response = await request('POST', '/api/model-prices/refresh');
eq(response.status, 200, '失败仍为 HTTP 200');
eq(response.data.ok, false, '刷新失败标识');
ok(response.data.remote.error.includes('离线'), '失败原因进入 remote.error');
eq(response.data.current.id, 'remote-model', '失败沿用已有缓存');

section('R62 更新检查与三段版本比较');
mode = 'success';
response = await request('GET', '/api/update-check');
eq(response.status, 200, '更新检查 HTTP 200');
eq(response.data.ok, true, '更新检查成功');
eq(response.data.latest, '0.5.1.99', '返回远端版本');
eq(response.data.hasUpdate, true, '前三段判断有更新');
eq(requested.at(-1).url, UPDATE_INFO_URL, '仅请求固定版本 URL');
eq(requested.at(-1).options.cache, 'no-store', '版本请求禁止缓存');
eq(compareSemver('1.2.3.99', '1.2.3.1'), 0, '忽略第四段');
mode = 'bad-version';
response = await request('GET', '/api/update-check');
eq(response.status, 200, '更新异常仍为 HTTP 200');
eq(response.data.ok, false, '缺失版本标记失败');
ok(response.data.error.includes('version.json 缺少 version 字段'), '返回规范错误');

await http.close();

section('内核装配：缓存官方价格参与 status 成本估算');
const kernelDataDir = mktmp('qqa-m3-price-kernel-');
fs.writeFileSync(path.join(kernelDataDir, 'price-feed-cache.json'), JSON.stringify({
  url: PRICE_FEED_URL,
  fetchedAt: Date.now(),
  prices: { 'remote-model': { in: 3, out: 4, cached: 1 } },
}));
// This integration only needs cached pricing and HTTP. Never scan the working
// checkout's installed extensions or connect its default protocol endpoint.
const kernelAppRoot=mktmp('qqa-m3-price-app-');
const cachedPrices=createPriceUpdateAdapters({dataDir:kernelDataDir,fetchImpl:async()=>{throw new Error('QA33 offline price source');}});
const kernel = createKernel({appRoot:kernelAppRoot, env: { QQ_AGENT_DATA_DIR: kernelDataDir, QQ_AGENT_PORT: '0' }, headless: true,
  transport:{id:'qa33-inert',start(){},stop(){},status:()=>({connected:false}),actions:{}},priceUpdates:cachedPrices,
  communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})}});
kernel.config.update({ server: { port: 0, token: 'kernel-price-secret' }, api: { model: 'remote-model', useOfficialPrice: true },telemetry:{enabled:false},proactive:{enabled:false} });
const running = kernel.sessions.create('group:77');
running.model = 'remote-model';
running.usage = { promptTokens: 1000000, completionTokens: 1000000, totalTokens: 2000000, cachedTokens: 0, calls: 1 };
const kernelPort = await kernel.start();
const statusResponse = await fetch(`http://127.0.0.1:${kernelPort}/api/status`, { headers: { 'x-console-token': 'kernel-price-secret' } });
const statusPayload = await statusResponse.json();
eq(statusResponse.status, 200, '内核状态读取成功');
eq(statusPayload.cost.source, 'official', '内核状态使用缓存官方价格');
eq(statusPayload.cost.prices.in, 3, '内核状态读取缓存输入价格');
eq(statusPayload.cost.prices.out, 4, '内核状态读取缓存输出价格');
ok(statusPayload.cost.cost > 0, '内核状态返回非零成本');
await kernel.stop();

summary('33-m3-price-update');

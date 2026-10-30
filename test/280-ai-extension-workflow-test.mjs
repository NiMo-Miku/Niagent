// Real kernel / console / loader / send queue / market adapter. Every upstream
// response is an in-memory fixture: this does not publish to the real community.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKernel } from '../src/kernel/kernel.js';
import { createCommunityMarketAdapters, COMMUNITY_BASE_URL } from '../bundled/market/client.js';
import { packExtension, checkExtension } from '../scripts/lib/extension-dev.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-ai-workflow-280-'));
const originalFetch = globalThis.fetch;
const examples = ['roll-dice', 'http-query', 'image-generate'];
const packages = new Map(), publications = [], marketRequests = [], httpRequests = [], deliveries = [], kernels = [];
const token = 'test-console-token-280', accountToken = 'test-market-account-token-280', serviceToken = 'test-service-token-280', imageKey = 'test-image-key-280';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCJkAAAAASUVORK5CYII=';
let assertions = 0, blockedGlobalRequests = 0, nextSlow = null;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const yes = (condition, message) => { assert.ok(condition, message); assertions++; };
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
globalThis.fetch = async () => { blockedGlobalRequests++; throw new Error('280 forbids all global upstream requests'); };

function awaitSlow() {
  let begun, release;
  const started = new Promise(resolve => { begun = resolve; });
  const slow = { started, begun, late() { release?.(); } };
  slow.run = signal => new Promise((resolve, reject) => {
    const abort = () => { signal?.removeEventListener('abort', abort); reject(signal?.reason ?? new Error('cancelled')); };
    release = () => { signal?.removeEventListener('abort', abort); resolve(json({ data: [{ b64_json: png }], answer: 'late answer' })); };
    signal?.addEventListener('abort', abort, { once: true }); slow.begun(); if (signal?.aborted) abort();
  });
  return slow;
}

async function publicFetch(url, init = {}) {
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'https:'); assert.ok(['api.example.test', 'images.example.test'].includes(parsed.hostname));
  const body = JSON.parse(init.body), headers = new Headers(init.headers);
  httpRequests.push({ host: parsed.hostname, body });
  const expected = parsed.hostname === 'api.example.test' ? serviceToken : imageKey;
  assert.equal(headers.get('authorization'), `Bearer ${expected}`);
  if (nextSlow) { const slow = nextSlow; nextSlow = null; return slow.run(init.signal); }
  if (parsed.hostname === 'api.example.test') { assert.deepEqual(body, { query: 'cat' }); return json({ answer: 'controlled answer' }); }
  assert.deepEqual(body, { model: 'test-image-model', prompt: 'a cat', response_format: 'b64_json' });
  return json({ data: [{ b64_json: png }] });
}

async function upstreamFetch(url, init = {}) {
  assert.equal(new URL(url).origin, new URL(COMMUNITY_BASE_URL).origin);
  const route = new URL(url).pathname.slice(new URL(COMMUNITY_BASE_URL).pathname.length), headers = new Headers(init.headers);
  marketRequests.push(route);
  assert.equal(headers.has('x-console-token'), false, 'local console credentials never reach upstream');
  if (route === '/auth/login') {
    assert.deepEqual(JSON.parse(init.body), { loginId: 'test-author', password: 'test-password' });
    return json({ ok: true, token: accountToken, account: { username: 'test-author', displayName: 'Synthetic author' } });
  }
  if (route === '/market/publish') {
    assert.equal(headers.get('x-account-token'), accountToken);
    const boundary = headers.get('content-type').match(/boundary=(.+)$/)[1], body = Buffer.from(init.body);
    const fieldAt = body.indexOf(Buffer.from('name="file";')), start = body.indexOf(Buffer.from('\r\n\r\n'), fieldAt) + 4, end = body.indexOf(Buffer.from(`\r\n--${boundary}`), start);
    assert.ok(fieldAt >= 0 && start > fieldAt && end > start);
    const bytes = body.subarray(start, end), found = [...packages].find(([, item]) => item.bytes.equals(bytes));
    assert.ok(found, 'multipart file equals an exact original production ZIP');
    publications.push({ id: found[0], bytes: Buffer.from(bytes), status: 'pending' });
    return json({ ok: true, item: { id: found[0], type: 'skill', status: 'pending', name: found[0] }, note: 'Synthetic upstream accepted submission; pending review' });
  }
  assert.equal(headers.has('x-account-token'), false, 'public catalog/download do not attach login credentials');
  if (route === '/skills') return json({ ok: true, categories: { utility: 'Utility' }, items: [{ id: 'example-roll-dice', type: 'skill', status: 'approved', installCode: 'DICE0280', category: 'utility', name: 'Controlled approved fixture' }] });
  if (route === '/install/verify') {
    assert.deepEqual(JSON.parse(init.body), { codes: ['DICE0280'] });
    return json({ ok: true, results: [{ code: 'DICE0280', ok: true, type: 'skill', id: 'example-roll-dice' }] });
  }
  if (route === '/install/DICE0280/download') return new Response(packages.get('example-roll-dice').bytes, { headers: { 'content-type': 'application/zip' } });
  throw new Error(`Unexpected controlled community path ${route}`);
}

function makeKernel(label) {
  const appRoot = path.join(root, label), dataDir = path.join(appRoot, 'data');
  for (const dir of ['bundled', 'skills', 'plugins']) fs.mkdirSync(path.join(appRoot, dir), { recursive: true });
  // Only the production market plugin is scanned. Its source dependencies point
  // to the repository runtime; all state/appRoot arguments remain temporary.
  fs.symlinkSync(path.join(repository, 'src'), path.join(appRoot, 'src'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.cpSync(path.join(repository, 'bundled', 'market'), path.join(appRoot, 'bundled', 'market'), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}');
  let kernel;
  const market = createCommunityMarketAdapters({ appRoot, dataDir, config: { get: () => kernel.config.get(), update: patch => kernel.config.update(patch) }, communityKey: '', fetchImpl: upstreamFetch,
    dnsLookup: async () => [{ address: '203.0.113.8', family: 4 }],
    installZip: (...args) => kernel.capability.providers('extensions.installZip').find(item => item.ownerId === 'kernel').provider.install(...args),
  });
  kernel = createKernel({ appRoot, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(appRoot, 'absent-migration') }, headless: true, communityMarket: market, fetchImpl: publicFetch,
    transport: { id: 'controlled280', selfId: '10000', actions: {}, start() {}, stop() {}, status: () => ({ connected: true, selfId: '10000' }), async send(chatKey, segments, options) { if (options?.signal?.aborted) throw options.signal.reason; deliveries.push({ instance: label, chatKey, segments }); return [{ msgId: 28000 + deliveries.length }]; } },
    priceUpdates: { refresh: async () => ({ ok: true }) },
  });
  kernel.log.setLevel('error'); kernel.loader.startWatchers = () => {};
  kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false }, proactive: { enabled: false }, send: { minGapMs: 200, maxGapMs: 200, byLengthMs: 1 } });
  kernels.push(kernel); return { kernel, appRoot, dataDir, base: null };
}

async function request(instance, method, route, body) {
  const url = new URL(route, instance.base);
  assert.equal(url.hostname, '127.0.0.1');
  const response = await originalFetch(url, { method, headers: { 'x-console-token': token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
function grant(kernel, id, scopes) { for (const scope of scopes) assert.equal(kernel.permissions.setOverride(id, scope, 'allow', { fingerprint: kernel.loader.hostEntry(id).fingerprint }), true); }
function invoke(instance, id, args, signal = new AbortController().signal) { return instance.kernel.registry.invoke(id, args, { execCtx: { chatKey: 'private:10001', signal, session: { id: 'offline280' } } }); }

try {
  for (const name of examples) {
    const source = path.join(repository, 'examples', 'extensions', name), out = path.join(root, `${name}.zip`), packed = packExtension(source, out);
    yes(packed.ok, `pack ${name}: ${JSON.stringify(packed)}`);
    yes(packed.files.includes('README.md') && packed.files.includes('extension.check.json'), `${name} includes authoring instructions and executable self-checks`);
    packages.set(packed.id, { bytes: fs.readFileSync(out), source });
  }
  const first = makeKernel('author'); first.base = `http://127.0.0.1:${await first.kernel.start()}`;
  eq(first.kernel.loader.listEntries().map(item => item.id), ['market'], 'only production market is initially loaded');
  for (const [id, item] of packages) {
    const installed = await request(first, 'POST', '/api/skills/install', { kind: 'skill', zipBase64: item.bytes.toString('base64') });
    eq([installed.status, installed.data.installed, installed.data.enabled, installed.data.skill.status], [200, id, false, 'disabled'], `${id} initially installs disabled`);
    yes(checkExtension(path.join(first.appRoot, 'skills', id)).ok, `${id} installed source checks again`);
    eq(first.kernel.registry.byOwner(id), [], `${id} disabled install registers no tools`);
  }
  const configurations = {
    'example-roll-dice': { defaultSides: 1, maxRolls: 20 },
    'example-http-query': { endpoint: 'https://api.example.test/query', token: serviceToken },
    'example-image-generate': { endpoint: 'https://images.example.test/v1/images/generations', apiKey: imageKey, model: 'test-image-model' },
  };
  for (const [id, settings] of Object.entries(configurations)) {
    const configured = await request(first, 'POST', `/api/skills/${id}`, { enabled: true, settings });
    eq([configured.status, configured.data.skill.status], [200, 'active'], `${id} configures and enables through console API`);
    yes(!JSON.stringify(configured.data).includes(serviceToken) && !JSON.stringify(configured.data).includes(imageKey), `${id} HTTP response hides configured credentials`);
    grant(first.kernel, id, first.kernel.loader.hostEntry(id).manifest.permissions);
  }
  eq(first.kernel.config.get().skills['example-roll-dice'].settings.maxRolls, 20, 'documented maximum dice setting persists through the real configuration API');
  eq((await request(first, 'POST', '/api/skills/example-roll-dice', { settings: { defaultSides: 1.5 } })).status, 400, 'integer dice schema rejects fractions before executing a tool');
  eq((await request(first, 'POST', '/api/skills/example-roll-dice', { settings: { maxRolls: 21 } })).status, 400, 'documented numeric range rejects excessive values at configuration time');
  const rolled = await invoke(first, 'example-roll-dice__roll', { count: 2 });
  eq([rolled.ok, rolled.result.total, rolled.result.rollCount], [true, 2, 1], 'configured dice runs through production registry');
  eq(first.kernel.storage.namespace('example-roll-dice').get('stats').rollCount, 1, 'dice statistics persist in real namespaced storage');
  const queried = await invoke(first, 'example-http-query__query', { query: 'cat' });
  eq(queried, { ok: true, result: 'controlled answer' }, 'HTTP skill uses configured token and returns controlled text');
  const drawn = await invoke(first, 'example-image-generate__draw', { prompt: 'a cat' });
  eq([drawn.ok, drawn.result.sent, drawn.result.messageIds], [true, true, [28001]], 'image result carries production send queue receipt');
  yes(deliveries.length === 1 && deliveries[0].segments.some(segment => segment.type === 'image' && segment.file === `base64://${png}`), 'validated image traverses actual send queue to controlled transport');
  yes(first.kernel.store.recent('private:10001', 10).some(item => item.self === true && item.mid === 28001), 'send queue archives successful self delivery');
  const duplicate = await invoke(first, 'example-image-generate__draw', { prompt: 'a cat' });
  eq([duplicate.ok, duplicate.result.sent, duplicate.result.deduped, deliveries.length], [true, false, true, 1], 'real queue dedupe never claims a second delivery');

  let slow = awaitSlow(); nextSlow = slow;
  const cancellation = new AbortController(), pending = invoke(first, 'example-http-query__query', { query: 'cancel' }, cancellation.signal);
  await slow.started; cancellation.abort(new Error('test cancel'));
  const cancelled = await pending; slow.late();
  yes(cancelled.ok === false && /取消/.test(cancelled.error) && deliveries.length === 1, 'cancelled production HTTP cannot send a late result');
  slow = awaitSlow(); nextSlow = slow;
  const pendingImage = invoke(first, 'example-image-generate__draw', { prompt: 'stop' }); await slow.started;
  const stopped = await request(first, 'POST', '/api/skills/example-image-generate', { enabled: false });
  const stoppedResult = await pendingImage; slow.late();
  eq([stopped.status, stopped.data.skill.status, stoppedResult.ok, deliveries.length], [200, 'disabled', false, 1], 'disable aborts pending image generation with no new transport delivery');

  const login = await request(first, 'POST', '/api/market/login', { loginId: 'test-author', password: 'test-password' });
  eq([login.status, login.data.accounts[0].username], [200, 'test-author'], 'real market adapter saves synthetic account after controlled authentication');
  yes(!JSON.stringify(login.data).includes(accountToken), 'market login HTTP reply never exposes account token');
  for (const [id] of packages) {
    const published = await request(first, 'POST', '/api/market/publish', { kind: 'skill', id, displayName: id, description: 'Offline integration fixture', accountUsername: 'test-author' });
    eq([published.status, published.data.ok, published.data.item.status], [200, true, 'pending'], `${id} submission preserves simulated pending review status`);
  }
  eq(publications.length, 3, 'three exact ZIPs reached only the controlled community peer');
  yes(publications.every(item => item.bytes.equals(packages.get(item.id).bytes) && !item.bytes.includes(Buffer.from(serviceToken)) && !item.bytes.includes(Buffer.from(imageKey)) && !item.bytes.includes(Buffer.from(accountToken))), 'publication ZIPs equal originals and exclude runtime credentials');

  const second = makeKernel('recipient'); second.base = `http://127.0.0.1:${await second.kernel.start()}`;
  const catalog = await request(second, 'GET', '/api/market/catalog?kind=skill');
  eq([catalog.status, catalog.data.items[0].installCode], [200, 'DICE0280'], 'recipient queries controlled approved catalog separately from pending submissions');
  const received = await request(second, 'POST', '/api/market/install', { kind: 'skill', id: 'example-roll-dice' });
  eq([received.status, received.data.installed, received.data.enabled, received.data.skill.status], [200, 'example-roll-dice', false, 'disabled'], 'verified download uses real ZIP installer and starts disabled');
  yes(checkExtension(path.join(second.appRoot, 'skills', 'example-roll-dice')).ok, 'downloaded extension passes same static check');
  await request(second, 'POST', '/api/skills/example-roll-dice', { enabled: true, settings: { defaultSides: 1 } });
  const rerolled = await invoke(second, 'example-roll-dice__roll', { count: 3 });
  eq([rerolled.ok, rerolled.result.total, rerolled.result.rollCount], [true, 3, 1], 'clean recipient configures and executes received skill with independent storage');
  eq(first.kernel.storage.namespace('example-roll-dice').get('stats').rollCount, 1, 'recipient execution does not modify author data');
  yes(marketRequests.includes('/install/verify') && marketRequests.includes('/install/DICE0280/download'), 'real catalog/verify/download path is consumed');
  eq(blockedGlobalRequests, 0, 'no global or real upstream fetch is attempted');
  console.log(JSON.stringify({ test: '280-ai-extension-workflow', result: 'passed', assertions, examples: 3, realKernel: true, realConsole: true, realSendQueue: true, realMarketAdapter: true, simulatedCommunity: true, realCommunityPublished: false, publicationStatuses: publications.map(item => item.status), recipientExecuted: true, controlledCommunityCalls: marketRequests.length, controlledSkillHttpCalls: httpRequests.length, controlledDeliveries: deliveries.length }));
} finally {
  for (const kernel of kernels.reverse()) await kernel.stop();
  globalThis.fetch = originalFetch;
  const relative = path.relative(fs.realpathSync(os.tmpdir()), fs.realpathSync(root));
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && !fs.lstatSync(root).isSymbolicLink());
  fs.rmSync(root, { recursive: true, force: true });
}

// Full kernel + real HTTP/SSE: the loader alone owns plugin lifecycle events.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createKernel } from '../src/kernel/kernel.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-hot-event107-'));
const dataDir = path.join(root, 'data'), id = 'hot-event', token = 'hot-event107-console';
for (const folder of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(root, folder));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
const dir = path.join(root, 'skills', id);fs.mkdirSync(dir);
fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({ id, kind: 'skill', version: '1.0.0', entry: 'index.js' }));
const source = `import {value} from './helper.js';export default{setup(ctx){ctx.registerTool({id:'value',name:'Value',execute:async()=>value});}};`;
fs.writeFileSync(path.join(dir, 'index.js'), source);
fs.writeFileSync(path.join(dir, 'helper.js'), `export const value='old';`);
const kernel = createKernel({
  env: { ...process.env, QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0' }, appRoot: root, headless: true,
  transport: { id: 'fixture', start() {}, stop() {}, status: () => ({ connected: true }), actions: {} },
  priceUpdates: { refresh: async () => ({ ok: true }) },
  communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
});
kernel.config.update({ server: { port: 0, token }, telemetry: { enabled: false }, skills: { watch: false, [id]: { enabled: true } }, extensions: { hotReload: false } });
const loaded = [], logs = [], frames = [];
kernel.bus.on('plugin.loaded', payload => loaded.push(payload), { internal: true });
kernel.bus.on('log', payload => logs.push(payload), { internal: true });
let streamRequest, streamResponse;
async function until(check) {
  for (let i = 0; i < 200; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error('Timed out waiting for ordered production SSE events');
}
try {
  const port = await kernel.start(), base = `http://127.0.0.1:${port}`;
  assert.equal(kernel.loader.isActive(id), true);
  assert.equal(await kernel.registry.get(`${id}__value`).execute(), 'old');
  streamResponse = await new Promise((resolve, reject) => {
    streamRequest = http.get(`${base}/api/events`, { headers: { 'x-console-token': token } }, resolve);
    streamRequest.on('error', reject);
  });
  assert.equal(streamResponse.statusCode, 200);
  let buffer = '';
  streamResponse.setEncoding('utf8');
  streamResponse.on('data', chunk => {
    buffer += chunk;
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary);buffer = buffer.slice(boundary + 2);
      const event = block.match(/^event: (.+)$/m)?.[1], data = block.match(/^data: (.+)$/m)?.[1];
      if (event && data) frames.push({ event, data: JSON.parse(data) });
    }
  });
  await until(() => frames.some(frame => frame.event === 'hello'));
  async function reload() {
    const before = frames.filter(frame => frame.event === 'status' && frame.data.configUpdated === true).length;
    const response = await fetch(`${base}/api/skills/${id}/hot-reload`, { method: 'POST', headers: { 'x-console-token': token, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 200);
    const result = await response.json();
    await until(() => frames.filter(frame => frame.event === 'status' && frame.data.configUpdated === true).length === before + 1);
    return result;
  }
  function eventCount() { return frames.filter(frame => frame.event === 'plugin-loaded' && frame.data.id === id).length; }
  function noInvalidEvents() { assert.deepEqual(logs.filter(log => log.level === 'error' && /\[bus\].*未注册事件/.test(log.msg)), [], 'the real Bus reports no unregistered internal event'); }

  console.log('· Changed code is loaded once and produces exactly one official lifecycle/SSE event');
  const initialLoaded = loaded.length;
  fs.writeFileSync(path.join(dir, 'helper.js'), `export const value='new';`);
  let result = await reload();
  assert.equal(result.ok, true);assert.equal(result.fingerprintChanged, true);
  assert.equal(await kernel.registry.get(`${id}__value`).execute(), 'new');
  assert.equal(loaded.length, initialLoaded + 1);
  assert.equal(eventCount(), 1);
  noInvalidEvents();

  console.log('· Repeating a successful reload does not duplicate the loader event at the route');
  result = await reload();
  assert.equal(result.ok, true);assert.equal(result.fingerprintChanged, false);
  assert.equal(loaded.length, initialLoaded + 2);
  assert.equal(eventCount(), 2);
  noInvalidEvents();

  console.log('· A failed reload retains the previous generation and emits no successful-load event');
  const retainedTool = kernel.registry.get(`${id}__value`);
  fs.writeFileSync(path.join(dir, 'index.js'), `export default{setup(){throw new Error('107 controlled setup failure');}};`);
  result = await reload();
  assert.equal(result.ok, false);assert.match(result.error, /107 controlled setup failure/);
  assert.equal(result.retainedStatus, 'active');
  assert.equal(kernel.registry.get(`${id}__value`), retainedTool, 'the previous generation is retained');
  assert.equal(loaded.length, initialLoaded + 2);
  assert.equal(eventCount(), 2);
  noInvalidEvents();
  // The public SDK correctly rejects the old generation while disk content has
  // another fingerprint. Restoring its code lets the retained tool run again.
  fs.writeFileSync(path.join(dir, 'index.js'), source);
  assert.equal(await retainedTool.execute(), 'new');
  console.log('✓ 107 Real hot-reload lifecycle, one SSE delivery and strict bus event contract passed');
} finally {
  if (streamResponse && !streamResponse.destroyed) {
    await new Promise(resolve => { streamResponse.once('close', resolve); streamRequest.destroy(); });
  } else streamRequest?.destroy();
  await kernel.stop();
  fs.rmSync(root, { recursive: true, force: true });
}

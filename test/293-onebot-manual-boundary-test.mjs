import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createOneBotConnectionResolver } from '../bundled/transport-onebot/connection.js';
import transportPlugin from '../bundled/transport-onebot/index.js';
import { buildDefaultConfig } from '../src/kernel/config.js';
const config = (extra = {}) => ({ onebot: { wsUrl: 'ws://127.0.0.1:3001/events', httpUrl: 'http://127.0.0.1:3000/actions', accessToken: 'SYNTHETIC_WS', httpAccessToken: '', ...extra } });
test('manual resolver only uses explicit OneBot settings and never reads files', () => {
  const resolve = createOneBotConnectionResolver(), original = fs.readFileSync;
  fs.readFileSync = () => { throw new Error('unexpected filesystem read'); };
  try {
    const connection = resolve(config());
    assert.equal(connection.mode, 'manual'); assert.equal(connection.connectionError, null);
    assert.equal(connection.wsUrl, config().onebot.wsUrl); assert.equal(connection.httpToken, 'SYNTHETIC_WS');
    assert.equal(connection.bindingKey, resolve(config()).bindingKey);
    assert.notEqual(connection.bindingKey, resolve(config({accessToken: 'ROTATED'})).bindingKey);
  } finally { fs.readFileSync = original; }
});
test('HTTP credential fallback remains within same host and TLS level', () => {
  const resolve = createOneBotConnectionResolver();
  assert.equal(resolve(config({wsUrl: 'ws://localhost:3001/events'})).httpToken, 'SYNTHETIC_WS');
  assert.equal(resolve(config({httpUrl: 'http://different.invalid/actions'})).httpToken, '');
  assert.equal(resolve(config({wsUrl: 'wss://127.0.0.1/events'})).httpToken, '');
  assert.equal(resolve(config({httpAccessToken: 'SYNTHETIC_HTTP'})).httpToken, 'SYNTHETIC_HTTP');
});
test('credentials embedded in URLs and malformed endpoints fail before connection', () => {
  const resolve = createOneBotConnectionResolver();
  for (const wsUrl of ['', 'http://127.0.0.1/events', 'ws://user:pass@127.0.0.1/events', 'ws://127.0.0.1/events?token=x', 'ws://127.0.0.1/events#part']) {
    assert.equal(resolve(config({wsUrl})).connectionCode, 'ONEBOT_URL_INVALID');
  }
});
test('default transport exposes protocol only, without process or favorite capabilities', async () => {
  const descriptors = [], capabilities = [], stops = [];
  transportPlugin.setup({ capability: () => ({get: () => buildDefaultConfig()}), log: {}, registerTransport: item => descriptors.push(item), registerCapability: (...args) => capabilities.push(args), lifecycle: {onStop: fn => stops.push(fn)} });
  assert.equal(descriptors.length, 1); assert.deepEqual(descriptors[0].scopes, ['net.outbound']);
  const instance = descriptors[0].create({});
  assert.equal(instance.processes, undefined); assert.deepEqual(capabilities, []);
  for (const name of ['addCustomFace','modifyCustomFace','deleteCustomFace','fetchCustomFaces','fetchCustomFaceDetails']) assert.equal(instance.actions[name], undefined);
  await instance.stop();
  assert.deepEqual(Object.keys(buildDefaultConfig().onebot).sort(), ['accessToken','httpAccessToken','httpUrl','wsUrl']);
});


test('default sticker tools keep the local library usable and gate optional account writes', async () => {
  const { createToolRegistry } = await import('../src/kernel/tools.js');
  const { default: stickerTools } = await import('../bundled/sticker-tools/index.js');
  const available = new Set();
  const registry = createToolRegistry({capabilities: {has: name => available.has(name)}});
  const local = { all: () => [{id: 'LOCAL', desc: 'local note', tags: []}] };
  stickerTools.setup({capability: name => name === 'data.stickers' ? local : {}, registerTool: tool => registry.register(tool)});
  assert.equal(registry.availability('collect_sticker').code, 'CAPABILITY_MISSING');
  for (const id of ['list_stickers', 'get_sticker_image', 'send_sticker']) assert.equal(registry.availability(id).ok, true);
  const result = await registry.get('list_stickers').execute({}, {});
  assert.equal(result.ok, true); assert.equal(result.result.items[0].id, 'LOCAL');
  available.add('qq.emoji-favorites'); assert.equal(registry.availability('collect_sticker').ok, true);
  available.delete('qq.emoji-favorites'); assert.equal(registry.availability('collect_sticker').ok, false);
});

// Real loopback shutdown checks. Clients stay open until the server closes them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createSseBridge } from '../src/console/sse-bridge.js';
import { Bus } from '../src/kernel/bus.js';

const workspace = path.resolve(import.meta.dirname, '..');
const option = process.argv.indexOf('--http-source');
assert.ok(option === -1 || option === 2);
assert.equal(process.argv.length, option === -1 ? 2 : 4);
const httpSource = path.resolve(option === -1 ? path.join(workspace, 'src/kernel/http.js') : process.argv[option + 1]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-http-shutdown162-'));
let modulePath = httpSource;
if (option !== -1) {
  modulePath = path.join(root, 'http-selected.mjs');
  fs.writeFileSync(modulePath, fs.readFileSync(httpSource, 'utf8').replace("'../console/key-access.js'", JSON.stringify(pathToFileURL(path.join(workspace, 'src/console/key-access.js')).href)));
}
const { createHttpServer } = await import(pathToFileURL(modulePath));
const log = { info() {}, warn() {}, error() {} };
const config = { get: () => ({ server: { port: 0, token: '' } }) };
const clients = new Set();
const servers = new Set();
let passed = 0;
let failed = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function within(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]);
  } finally { clearTimeout(timer); }
}
async function check(name, fn) {
  try { await fn(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
}
async function makeServer() {
  const server = createHttpServer({ config, log, staticDir: root });
  servers.add(server);
  const port = await server.listen();
  return { server, port };
}
async function spareConnection(port) {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  clients.add(socket);
  socket.on('error', () => {});
  await once(socket, 'connect');
  return socket;
}
async function openSse(port) {
  const request = http.get({ host: '127.0.0.1', port, path: '/api/events', agent: false });
  request.on('error', () => {});
  clients.add(request);
  const [response] = await once(request, 'response');
  response.on('error', () => {});
  response.setEncoding('utf8');
  let body = '';
  response.on('data', (chunk) => { body += chunk; });
  const ended = once(response, 'end');
  await within((async () => { while (!body.includes('event: hello')) await sleep(5); })(), 1000, 'SSE hello did not arrive');
  return { response, ended, text: () => body };
}

try {
  await check('shutdown ends active SSE without requiring the client to disconnect', async () => {
    const { server, port } = await makeServer();
    const bus = new Bus(log);
    const bridge = createSseBridge({ bus, http: server });
    const sse = await openSse(port);
    assert.equal(server.sseCount(), 1);
    bus.emit('plugin.unloaded', { name: 'qa-shutdown-only' });
    await within((async () => { while (!sse.text().includes('event: plugin-unloaded')) await sleep(5); })(), 1000, 'SSE unload did not arrive');
    bridge.close();
    await within(server.close(), 2000, 'active SSE blocked shutdown');
    await within(sse.ended, 1000, 'SSE response did not end');
    assert.equal(server.sseCount(), 0);
  });

  await check('a browser spare TCP connection cannot hold shutdown indefinitely', async () => {
    const { server, port } = await makeServer();
    const socket = await spareConnection(port);
    const socketClosed = once(socket, 'close');
    // Ensure the connection is accepted before shutdown. No HTTP bytes follow.
    await sleep(20);
    await within(server.close(), 2500, 'unstarted browser connection blocked shutdown');
    await within(socketClosed, 1000, 'server did not close the spare connection');
    assert.equal(socket.destroyed, true);
  });

  await check('an in-flight response can finish during the graceful drain', async () => {
    const { server, port } = await makeServer();
    let entered;
    const requestEntered = new Promise((resolve) => { entered = resolve; });
    server.route('GET', '/api/qa162/drain', async () => {
      entered();
      await sleep(100);
      return { completed: true };
    });
    const request = http.get({ host: '127.0.0.1', port, path: '/api/qa162/drain', agent: false });
    clients.add(request);
    request.on('error', () => {});
    const result = new Promise((resolve, reject) => {
      request.once('error', reject);
      request.once('response', (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.once('error', reject);
        response.once('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
      });
    });
    await within(requestEntered, 1000, 'request did not reach handler');
    const closing = server.close();
    assert.deepEqual(await within(result, 1500, 'draining response was interrupted'), { status: 200, body: { completed: true } });
    await within(closing, 2000, 'drained request blocked shutdown');
  });
} finally {
  for (const client of clients) client.destroy();
  await Promise.all([...servers].map((server) => server.close()));
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('qqa-http-shutdown162-'));
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ test: '162-http-shutdown-connections', passed, failed, httpSource, realLoopback: true, realDataUsed: false }));
if (failed) process.exitCode = 1;

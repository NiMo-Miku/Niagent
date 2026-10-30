// Actual sockets, stores and server.js processes in a temporary application.
// The CLI preload blocks all external requests and delivers shutdown by local
// IPC, because Windows child.kill('SIGINT') does not invoke Node signal handlers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createKernel } from '../src/kernel/kernel.js';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-port-profile126-'));
const appRoot = path.join(root, 'app');
fs.mkdirSync(appRoot);
fs.cpSync(path.join(workspace, 'src'), path.join(appRoot, 'src'), { recursive: true });
fs.cpSync(path.join(workspace, 'bundled'), path.join(appRoot, 'bundled'), { recursive: true });
fs.copyFileSync(path.join(workspace, 'package.json'), path.join(appRoot, 'package.json'));
fs.symlinkSync(path.join(workspace, 'node_modules'), path.join(appRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const preload = path.join(root, 'offline-cli.mjs');
fs.writeFileSync(preload, `globalThis.fetch = async () => { throw new Error('126 offline fixture blocks all external requests'); };
process.on('message', (message) => { if (message === '126-shutdown') process.emit('SIGINT'); });
`);
const kernels = [], sockets = [], children = [];
const disabledSkills = Object.fromEntries(fs.readdirSync(path.join(appRoot, 'bundled')).flatMap(name => {
  const dir = path.join(appRoot, 'bundled', name);
  const manifest = ['plugin.json', 'skill.json'].map(file => path.join(dir, file)).find(file => fs.existsSync(file));
  return manifest ? [[JSON.parse(fs.readFileSync(manifest, 'utf8')).id, { enabled: false }]] : [];
}));
let externalRequests = 0, passed = 0;
const readConfig = dataDir => JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
const lock = dataDir => path.join(dataDir, 'qq-agent.lock');
const writeConfig = (name, port) => {
  const dataDir = path.join(root, name); fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ server: { port }, persona: { botName: name }, telemetry: { enabled: false }, skills: disabledSkills }));
  return dataDir;
};
const makeKernel = (dataDir, envPort, profile = '2', selfId = '90002') => {
  let publish;
  const kernel = createKernel({ appRoot, headless: true,
    env: { ...(dataDir ? { QQ_AGENT_DATA_DIR: dataDir } : {}), QQ_AGENT_PROFILE: profile,
      ...(envPort === undefined ? {} : { QQ_AGENT_PORT: envPort }), QQ_AGENT_MIGRATE_FROM: path.join(root, 'absent') },
    transport: { id: `offline-${profile}`, selfId, actions: {},
      bind({ onStatus }) { publish = onStatus; }, start() { publish?.({ connected: true, selfId }); }, stop() {},
      status: () => ({ connected: true, selfId }) },
    fetchImpl: async () => { externalRequests++; throw new Error('External request forbidden'); },
    priceUpdates: { refresh: async () => ({ ok: true }), resolve: () => null },
    communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
  });
  // A config file also prevents auto-migration from inspecting legacy user data.
  if (!fs.existsSync(path.join(kernel.dataDir, 'config.json'))) kernel.config.update({ telemetry: { enabled: false }, skills: disabledSkills });
  kernel.log.setLevel('error'); kernels.push(kernel); return kernel;
};
const listen = port => new Promise((resolve, reject) => {
  const socket = net.createServer(); socket.once('error', reject);
  socket.listen(port, '127.0.0.1', () => { sockets.push(socket); resolve(socket); });
});
const close = socket => new Promise(resolve => socket.listening ? socket.close(resolve) : resolve());
async function reserveRange() {
  const refusals = new Map(), candidates = new Set();
  // An OS-assigned port need not be >=20000 and says nothing about the next
  // nine ports. Pick distinct explicit windows; only successful real binds
  // establish fixture ownership. Also probe base+10 used by later assertions.
  for (let i = 0; i < 128; i++) {
    const owned = [];
    try {
      let base;
      do { base = randomInt(20000, 48000); } while (candidates.has(base));
      candidates.add(base);
      if (base <= 31403 && base + 10 >= 31402) throw new Error('Excluded QA ports');
      for (let n = 0; n <= 10; n++) owned.push(await listen(base + n));
      await close(owned.pop());
      assert.equal(owned.length, 10);
      owned.forEach((socket, index) => { assert.equal(socket.listening, true); assert.equal(socket.address().port, base + index); });
      console.log(`126 reserved actual loopback range ${JSON.stringify({base,ports:owned.map(socket=>socket.address().port),attempts:i+1,refusals:Object.fromEntries(refusals)})}`);
      return { base, owned };
    } catch (error) { refusals.set(error.code ?? error.message, (refusals.get(error.code ?? error.message) ?? 0) + 1); await Promise.all(owned.map(close)); }
  }
  throw new Error(`Could not reserve ten safe loopback ports: ${JSON.stringify({candidates:[...candidates],refusals:Object.fromEntries(refusals)})}`);
}
async function json(port, endpoint = '/api/status') {
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200); return response.json();
}
function startCli(dataDir, envPort, profile = '2') {
  const env = { ...process.env, QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PROFILE: profile, QQ_AGENT_MIGRATE_FROM: path.join(root, 'absent') };
  delete env.QQ_AGENT_PORT;
  if (envPort !== undefined) env.QQ_AGENT_PORT = String(envPort);
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, path.join(appRoot, 'src', 'server.js')], {
    cwd: appRoot, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  children.push(child);
  let output = '', exited = false;
  child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', (code, signal) => { exited = true; resolve({ code, signal }); });
  });
  const boundedCompletion = async () => {
    let timer;
    try { return await Promise.race([completion, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`CLI timeout: ${output}`)), 10000); })]); }
    finally { clearTimeout(timer); }
  };
  return { child, completion: boundedCompletion, get output() { return output; },
    async ready() {
      for (let i = 0; i < 400; i++) {
        const match = output.match(/控制台：http:\/\/127\.0\.0\.1:(\d+)\//);
        if (match) return Number(match[1]);
        if (exited) throw new Error(`CLI exited before ready: ${output}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error(`CLI readiness timeout: ${output}`);
    },
    async stop() { if (!exited) child.send('126-shutdown'); assert.equal((await boundedCompletion()).code, 0); },
  };
}
async function test(name, run) { await run(); passed++; console.log(`✓ ${name}`); }

try {
  await test('Environment 0 overrides a stored fixed port without rewriting it', async () => {
    const { base: saved, owned } = await reserveRange();
    const dataDir = writeConfig('zero-override', saved), before = fs.readFileSync(path.join(dataDir, 'config.json'));
    const kernel = makeKernel(dataDir, '0'), actual = await kernel.start();
    assert.ok(actual > 0); assert.notEqual(actual, saved); assert.equal(kernel.httpServer.port, actual);
    assert.equal(kernel.config.get().server.port, saved); assert.equal((await json(actual)).dataDir, dataDir);
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'config.json')), before);
    await kernel.stop(); assert.ok(!fs.existsSync(lock(dataDir))); await Promise.all(owned.map(close));
  });
  await test('Environment fixed port wins through nine conflicts, and reload cannot move the bound socket', async () => {
    const { base, owned } = await reserveRange(); await close(owned[9]);
    const oldPort = base + 10;
    const oldSocket = await listen(oldPort); await close(oldSocket);
    const dataDir = writeConfig('nine-conflicts', oldPort), before = fs.readFileSync(path.join(dataDir, 'config.json'));
    const kernel = makeKernel(dataDir, String(base)); const actual = await kernel.start();
    assert.equal(actual, base + 9); assert.equal(kernel.httpServer.port, actual);
    assert.equal(kernel.config.get().server.port, oldPort); assert.deepEqual(fs.readFileSync(path.join(dataDir, 'config.json')), before);
    const nextSocket = await listen(0), nextPort = nextSocket.address().port;
    kernel.config.update({ server: { port: nextPort }, persona: { botName: 'saved-during-env-override' } });
    kernel.config.load(); assert.equal(kernel.config.get().server.port, nextPort);
    assert.equal(await kernel.start(), actual); assert.equal(kernel.httpServer.port, actual);
    assert.equal((await json(actual)).dataDir, dataDir);
    await kernel.stop(); await close(nextSocket); await Promise.all(owned.map(close));
    const restarted = makeKernel(dataDir, undefined); assert.equal(await restarted.start(), nextPort);
    assert.equal(readConfig(dataDir).server.port, nextPort); assert.equal(readConfig(dataDir).persona.botName, 'saved-during-env-override');
    await restarted.stop();
  });
  await test('Missing, blank and invalid env keep stored ports; invalid values have a clear diagnostic', async () => {
    for (const [index, value] of [undefined, '', '  ', 'abc', '-1', '1.5', '65536', 'Infinity'].entries()) {
      const dataDir = writeConfig(`invalid-${index}`, 0), kernel = makeKernel(dataDir, value);
      const actual = await kernel.start(); assert.ok(actual > 0); assert.equal(kernel.config.get().server.port, 0);
      assert.equal((await json(actual)).dataDir, dataDir);
      const warned = kernel.log.recent().some(entry => /QQ_AGENT_PORT/.test(entry.msg));
      assert.equal(warned, index >= 3); await kernel.stop(); assert.equal(readConfig(dataDir).server.port, 0);
    }
  });
  await test('Real server.js fixed env port overrides persisted configuration and exits gracefully', async () => {
    const reserved = await listen(0), wanted = reserved.address().port; await close(reserved);
    const dataDir = writeConfig('cli-fixed', 0), before = fs.readFileSync(path.join(dataDir, 'config.json'));
    const cli = startCli(dataDir, wanted); assert.equal(await cli.ready(), wanted);
    assert.equal((await json(wanted)).dataDir, dataDir); assert.ok(fs.existsSync(lock(dataDir)));
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'config.json')), before);
    await cli.stop(); assert.ok(!fs.existsSync(lock(dataDir))); assert.match(cli.output, /收到 SIGINT，清理退出/);
  });
  await test('Real server.js respects the tenth candidate and rejects all ten occupied ports', async () => {
    const { base, owned } = await reserveRange(); await close(owned[9]);
    const dataDir = writeConfig('cli-conflicts', 0), cli = startCli(dataDir, base);
    assert.equal(await cli.ready(), base + 9); assert.equal((await json(base + 9)).dataDir, dataDir);
    await cli.stop(); assert.ok(!fs.existsSync(lock(dataDir))); owned[9] = await listen(base + 9);
    const failure = startCli(dataDir, base); assert.equal((await failure.completion()).code, 1);
    assert.match(failure.output, /\[server\] 启动失败：/); assert.match(failure.output, /EADDRINUSE/);
    assert.ok(failure.output.includes(`127.0.0.1:${base + 9}`)); assert.ok(!fs.existsSync(lock(dataDir)));
    const eleventh = await listen(base + 10); assert.ok(eleventh.listening); await close(eleventh);
    assert.equal(readConfig(dataDir).server.port, 0); await Promise.all(owned.map(close));
  });
  await test('Two profiles run concurrently with distinct data, ports, protocol identities and histories', async () => {
    const two = makeKernel(undefined, undefined, '2', '90002'), three = makeKernel(undefined, undefined, '3', '90003');
    const [a, b] = await Promise.all([two.start(), three.start()]);
    assert.notEqual(a, b); assert.equal(two.dataDir, path.join(appRoot, 'data-2')); assert.equal(three.dataDir, path.join(appRoot, 'data-3'));
    assert.equal(two.config.get().server.port, 3310); assert.equal(three.config.get().server.port, 3410);
    assert.equal(two.config.get().onebot.wsUrl, 'ws://127.0.0.1:3101'); assert.equal(three.config.get().onebot.wsUrl, 'ws://127.0.0.1:3201');
    assert.equal((await json(a)).onebot.selfId, '90002'); assert.equal((await json(b)).onebot.selfId, '90003');
    assert.equal((await json(a, '/api/version')).profile, 2); assert.equal((await json(b, '/api/version')).profile, 3);
    two.store.appendIncoming('group:900001', { mid: '126-profile-2', senderId: '90002', text: 'only-profile-2', ts: Date.now() });
    assert.equal(three.store.recent('group:900001', 10).length, 0);
    const duplicate = startCli(two.dataDir, 0, '3'); assert.equal((await duplicate.completion()).code, 1);
    assert.match(duplicate.output, /已有实例正在运行/); assert.ok(duplicate.output.includes(`DATA_DIR=${two.dataDir}`));
    assert.equal(fs.readFileSync(lock(two.dataDir), 'utf8'), String(process.pid)); assert.equal((await json(a)).onebot.selfId, '90002');
    await two.stop(); await three.stop(); assert.ok(!fs.existsSync(lock(two.dataDir)) && !fs.existsSync(lock(three.dataDir)));
  });
  assert.equal(externalRequests, 0); console.log(`126 ports/profiles/instance: ${passed} scenarios passed, external sockets prevented`);
} finally {
  for (const kernel of kernels) try { await kernel.stop(); } catch {}
  await Promise.all(sockets.map(close));
  for (const child of children) if (child.exitCode === null && !child.killed) {
    child.kill(); await new Promise(resolve => child.once('exit', resolve));
  }
  const target = path.resolve(root);
  assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('qqa-port-profile126-'));
  fs.rmSync(target, { recursive: true, force: true });
}

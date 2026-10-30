// Real copied application, disk layers, passive ingest and loopback HTTP only.
// These regressions exercise explicit wrapper cooperation, not inferred merging
// of incompatible implementations or whole-page semantic intent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApplication as createOriginalApplication } from '../src/kernel/composition.js';

const workspace = path.resolve(import.meta.dirname, '..');
const tick = () => new Promise(setImmediate);

function temporaryRoot(t, prefix, beforeCleanup = async () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  t.after(async () => {
    await beforeCleanup();
    const target = path.resolve(root);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith(prefix));
    fs.rmSync(target, { recursive: true, force: true });
  });
  return root;
}

function writeLayer(root, directory, manifest, source) {
  const folder = path.join(root, 'overrides', directory);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'composition.json'), JSON.stringify({ version: 2, ...manifest }));
  fs.writeFileSync(path.join(folder, 'implementation.mjs'), source);
  return folder;
}

function assertMessagesSelection(application, chain, history, conflict = null) {
  const composition = application.composition;
  const selected = composition.selection.components['data.messages'];
  assert.equal(selected.ownerId, chain.at(-1)[0]);
  assert.equal(composition.owners['data.messages'], selected.ownerId);
  assert.deepEqual(selected.chain.map(row => [row.ownerId, row.mode]), chain);
  assert.deepEqual(selected.history.map(row => [row.ownerId, row.active]), history);
  const messagesConflict = composition.conflicts.find(row => row.target === 'component:data.messages');
  if (conflict === null) assert.equal(messagesConflict, undefined, 'one added provider has no overlap conflict');
  else {
    assert.equal(messagesConflict.winner, selected.ownerId);
    assert.equal(messagesConflict.resolution, conflict);
    assert.deepEqual(messagesConflict.contributors, ['overlap-a', 'overlap-b']);
    assert.deepEqual(messagesConflict.chain, chain.map(row => row[0]));
    assert.equal(messagesConflict.tiedOrder, false);
  }
  assert.equal(composition.selection.components['runtime.kernel'].ownerId, 'defaults', 'per-key conflicts do not change unrelated runtime ownership');
}

const wrapperSource = label => `
import fs from 'node:fs';
import path from 'node:path';
export async function wrap(previousFactory, context) {
  await Promise.resolve();
  return options => {
    const store = previousFactory(options);
    const append = store.appendIncoming.bind(store);
    const events = path.join(options.dataDir, 'overlap-resources.jsonl');
    fs.appendFileSync(events, JSON.stringify({ event: 'acquire', label: '${label}', ...context }) + '\\n');
    options.lifecycle.onStop(() => {
      fs.appendFileSync(events, JSON.stringify({ event: 'release', label: '${label}' }) + '\\n');
    });
    store.feature${label} = () => '${label}-independent';
    store.overlapTrace ??= [];
    store.appendIncoming = (chatKey, entry) => {
      store.overlapTrace.push('${label}');
      return append(chatKey, { ...entry, text: '${label}(' + entry.text + ')' });
    };
    return store;
  };
}
`;

const replacementSource = `
import fs from 'node:fs';
import path from 'node:path';
import { createChatStore } from '../../src/kernel/store.js';
export function replace(options) {
  const store = createChatStore(options);
  const append = store.appendIncoming.bind(store);
  const events = path.join(options.dataDir, 'overlap-resources.jsonl');
  fs.appendFileSync(events, JSON.stringify({ event: 'acquire', label: 'R' }) + '\\n');
  options.lifecycle.onStop(() => {
    fs.appendFileSync(events, JSON.stringify({ event: 'release', label: 'R' }) + '\\n');
  });
  store.featureB = () => 'B-replacement-independent';
  store.overlapTrace = [];
  store.appendIncoming = (chatKey, entry) => {
    store.overlapTrace.push('R');
    return append(chatKey, { ...entry, text: 'R(' + entry.text + ')' });
  };
  return store;
}
`;

test('overlapping disk wrappers retain independent features through disable, remove and full replacement generations', async t => {
  const applications = [];
  const calls = { starts: 0, stops: 0, model: 0, sends: [], network: [] };
  const root = temporaryRoot(t, 'qqa-overlap179-', async () => {
    for (const application of applications) await application.stop();
    assert.equal(calls.network.length, 0, 'all service boundaries stay local');
    assert.equal(calls.model, 0, 'no agent/model execution');
    assert.equal(calls.sends.length, 0, 'no outbound account messages');
  });
  for (const name of ['src', 'bundled', 'ui']) fs.cpSync(path.join(workspace, name), path.join(root, name), { recursive: true });
  fs.symlinkSync(path.join(workspace, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const { createApplication } = await import(pathToFileURL(path.join(root, 'src/kernel/composition.js')));
  const { defaultComponents } = await import(pathToFileURL(path.join(root, 'bundled/runtime-defaults/components.js')));
  const dataDir = path.join(root, 'data');

  const manifestA = { id: 'overlap-a', order: 10, components: { 'data.messages': { module: './implementation.mjs', export: 'wrap', mode: 'wrap' } } };
  const manifestB = { id: 'overlap-b', order: 20, components: { 'data.messages': { module: './implementation.mjs', export: 'wrap', mode: 'wrap' } } };
  const folderA = writeLayer(root, '10-a', manifestA, wrapperSource('A'));
  let folderB = writeLayer(root, '20-b', manifestB, wrapperSource('B'));
  const resources = () => fs.existsSync(path.join(dataDir, 'overlap-resources.jsonl'))
    ? fs.readFileSync(path.join(dataDir, 'overlap-resources.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    : [];
  const transitions = [];
  let incomingId = 17900;

  async function boot(expectedAcquisitions) {
    // Previous resources must already be released before constructing any new
    // store, rather than relying on a later asynchronous cleanup side effect.
    assert.deepEqual(resources().map(row => `${row.event}:${row.label}`), transitions);
    let callbacks;
    const transport = {
      id: 'passive-overlap-179', selfId: '9179', everConnected: true, segmentSupport: ['text'], actions: {},
      bind(context) { callbacks = context; },
      start() { calls.starts++; callbacks.onStatus({ connected: true, selfId: '9179' }); },
      stop() { calls.stops++; },
      status: () => ({ id: 'passive-overlap-179', connected: true, selfId: '9179' }),
      toPlatformSegments: segments => segments,
      send(chatKey, segments) { calls.sends.push({ chatKey, segments }); return { msgId: 179 }; },
    };
    const application = await createApplication({
      appRoot: root, headless: true, transport,
      env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(root, 'absent-migration-source') },
      fetchImpl: async url => { calls.network.push(String(url)); throw new Error('fixture forbids external HTTP'); },
      priceUpdates: { resolve: () => null, refresh: async () => ({ ok: true, remote: false }) },
      communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }), getBlocklist: () => ({ ok: true, ids: [] }), listAccounts: () => ({ ok: true, accounts: [] }) },
      components: {
        'runtime.logger': args => defaultComponents['runtime.logger']({ ...args, mirrorConsole: false }),
        'llm.complete': async () => { calls.model++; throw new Error('fixture forbids model execution'); },
      },
    });
    applications.push(application);
    transitions.push(...expectedAcquisitions.map(label => `acquire:${label}`));
    assert.deepEqual(resources().map(row => `${row.event}:${row.label}`), transitions);
    application.log.setLevel('error');
    application.config.update({
      server: { token: 'synthetic-overlap-179-token' }, allowAllWhenEmpty: true,
      telemetry: { enabled: false }, proactive: { enabled: false }, memory: { consolidateEnabled: false }, });
    application.orchestrator.pause();
    const port = await application.start();
    await application.services.idle();
    assert.equal(application.components['runtime.kernel'], defaultComponents['runtime.kernel']);
    assert.equal(application.components['runtime.http'], defaultComponents['runtime.http']);
    assert.equal(application.components['core.ingest'], defaultComponents['core.ingest']);
    assert.equal(application.components['core.orchestrator'], defaultComponents['core.orchestrator']);
    return {
      application,
      async incoming(text, expectedText, expectedTrace) {
        const messageId = ++incomingId;
        callbacks.onEvent({ kind: 'private', id: '179', type: 'message', event: {
          message_id: messageId, user_id: '179', sender: { nickname: 'Synthetic member' }, message: [{ type: 'text', data: { text } }],
        } });
        for (let attempt = 0; attempt < 100 && !application.store.findByMid('private:179', messageId); attempt++) await tick();
        const stored = application.store.findByMid('private:179', messageId);
        assert.ok(stored, 'the real transport/ingest consumes the composed store');
        assert.equal(stored.text, expectedText);
        assert.deepEqual(application.store.overlapTrace ?? [], expectedTrace);
        const response = await fetch(`http://127.0.0.1:${port}/api/chats/private_179/messages`, { headers: { 'x-console-token': 'synthetic-overlap-179-token' } });
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.messages.find(row => row.mid === messageId)?.text, expectedText, 'the unchanged HTTP controller exposes the same composed behavior');
      },
      async stop() {
        await application.stop();
        transitions.push(...[...expectedAcquisitions].reverse().map(label => `release:${label}`));
        assert.deepEqual(resources().map(row => `${row.event}:${row.label}`), transitions);
        await application.stop();
        assert.deepEqual(resources().map(row => `${row.event}:${row.label}`), transitions, 'stopping twice releases each resource once');
        assert.equal(application.scheduler.count(), 0);
        assert.equal(fs.existsSync(path.join(dataDir, 'qq-agent.lock')), false);
      },
    };
  }

  const both = await boot(['A', 'B']);
  assert.equal(both.application.store.featureA(), 'A-independent');
  assert.equal(both.application.store.featureB(), 'B-independent');
  assert.equal(both.application.composition.owners['data.messages'], 'overlap-b');
  assertMessagesSelection(both.application,
    [['defaults', 'replace'], ['overlap-a', 'wrap'], ['overlap-b', 'wrap']],
    [['defaults', true], ['overlap-a', true], ['overlap-b', true]], 'wrap');
  assert.deepEqual(resources().filter(row => row.event === 'acquire').map(row => [row.key, row.ownerId, row.previousOwnerId]), [
    ['data.messages', 'overlap-a', 'defaults'], ['data.messages', 'overlap-b', 'overlap-a'],
  ]);
  await both.incoming('both', 'A(B(both))', ['B', 'A']);
  await both.stop();

  fs.writeFileSync(path.join(folderB, 'composition.json'), JSON.stringify({ version: 2, ...manifestB, enabled: false }));
  const disabled = await boot(['A']);
  assert.equal(disabled.application.store.featureA(), 'A-independent');
  assert.equal(disabled.application.store.featureB, undefined);
  assert.equal(disabled.application.composition.owners['data.messages'], 'overlap-a');
  assertMessagesSelection(disabled.application,
    [['defaults', 'replace'], ['overlap-a', 'wrap']], [['defaults', true], ['overlap-a', true]]);
  await disabled.incoming('disabled', 'A(disabled)', ['A']);
  await disabled.stop();

  const archivedB = path.join(root, 'archived-b');
  assert.equal(path.dirname(folderB), path.join(root, 'overrides'));
  fs.renameSync(folderB, archivedB);
  const removed = await boot(['A']);
  assert.equal(removed.application.store.featureA(), 'A-independent');
  assert.equal(removed.application.store.featureB, undefined);
  assertMessagesSelection(removed.application,
    [['defaults', 'replace'], ['overlap-a', 'wrap']], [['defaults', true], ['overlap-a', true]]);
  await removed.incoming('removed', 'A(removed)', ['A']);
  await removed.stop();

  // A later full replacement deliberately starts a new chain for this key.
  folderB = writeLayer(root, '20-b', { ...manifestB, components: { 'data.messages': { module: './implementation.mjs', export: 'replace' } } }, replacementSource);
  const replaced = await boot(['R']);
  assert.equal(replaced.application.store.featureA, undefined);
  assert.equal(replaced.application.store.featureB(), 'B-replacement-independent');
  assert.equal(replaced.application.composition.owners['data.messages'], 'overlap-b');
  assertMessagesSelection(replaced.application,
    [['overlap-b', 'replace']], [['defaults', false], ['overlap-a', false], ['overlap-b', true]], 'replace');
  await replaced.incoming('replacement', 'R(replacement)', ['R']);
  await replaced.stop();

  const archivedA = path.join(root, 'archived-a');
  assert.equal(path.dirname(folderA), path.join(root, 'overrides'));
  fs.renameSync(folderA, archivedA);
  const noPrevious = await boot(['R']);
  assert.equal(noPrevious.application.store.featureA, undefined);
  assert.equal(noPrevious.application.store.featureB(), 'B-replacement-independent');
  assert.deepEqual(noPrevious.application.composition.layers.map(layer => layer.id), ['overlap-b']);
  assertMessagesSelection(noPrevious.application,
    [['overlap-b', 'replace']], [['defaults', false], ['overlap-b', true]]);
  await noPrevious.incoming('no-previous', 'R(no-previous)', ['R']);
  await noPrevious.stop();

  fs.renameSync(folderB, path.join(root, 'archived-replacement-b'));
  const defaults = await boot([]);
  assert.equal(defaults.application.components['data.messages'], defaultComponents['data.messages']);
  assert.equal(defaults.application.composition.owners['data.messages'], 'defaults');
  assert.equal(defaults.application.store.featureA, undefined);
  assert.equal(defaults.application.store.featureB, undefined);
  assertMessagesSelection(defaults.application, [['defaults', 'replace']], [['defaults', true]]);
  await defaults.incoming('default', 'default', []);
  assert.ok(defaults.application.store.recent('private:179', 20).some(row => row.text === 'A(B(both))'), 'generation selection preserves existing synthetic archives');
  await defaults.stop();
  assert.equal(calls.starts, 6);
  assert.equal(calls.stops, 6);
});

test('asynchronous wrapper failure and invalid factory stop application creation before any kernel construction', async t => {
  const root = temporaryRoot(t, 'qqa-overlap-fail179-');
  let kernels = 0;
  const lifecycle = await import('../src/kernel/composition-lifecycle.js');
  for (const [source, expected] of [
    ['export async function wrap() { await Promise.resolve(); throw new Error("async wrapper fixture failed"); }', /async wrapper fixture failed/],
    ['export async function wrap() { await Promise.resolve(); return { invalid: true }; }', /函数|function|factory/i],
  ]) {
    writeLayer(root, 'a', { id: 'async-failing', components: { 'data.messages': { module: './implementation.mjs', export: 'wrap', mode: 'wrap' } } }, source);
    const generation = lifecycle.createCompositionLifecycle();
    let cleanups = 0;
    generation.onStop(() => { cleanups++; });
    await assert.rejects(createOriginalApplication({
      appRoot: root, lifecycle: generation,
      components: { 'runtime.kernel': () => { kernels++; throw new Error('kernel must not construct'); } },
    }), expected);
    assert.equal(kernels, 0);
    assert.equal(generation.signal.aborted, true);
    assert.equal(cleanups, 1, 'failed asynchronous composition closes its generation');
    await generation.close();
    assert.equal(cleanups, 1);
    assert.equal(fs.existsSync(path.join(root, 'data')), false, 'failed composition opens no application stores');
  }
});

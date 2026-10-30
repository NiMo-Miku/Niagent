// Offline business proof: saved config -> ingest -> orchestration -> actual
// prompt/tool bundle/runner. Only the transport and model boundary are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadComposition } from '../src/kernel/composition.js';
import { defaultComponents as defaults } from '../bundled/runtime-defaults/components.js';
import coreTools from '../bundled/core-tools/index.js';
import { fixtureCapability } from './bundled-fixture-sdk.mjs';

const log = { info() {}, warn() {}, error() {} };
const NativeDate = Date;
const at = text => new NativeDate(2026, 9, 17, ...text.split(':').map(Number)).getTime();
const peak = (start, end, sliderPos) => ({ start, end, sliderPos });
const cases = [
  { id: 'invalid-end-does-not-silence', at: '23:30', peak: peak('22:00', '25:70', 10), valley: 100, tier: 4 },
  { id: 'invalid-end-does-not-wake', at: '23:30', peak: peak('22:00', '25:70', 100), valley: 10, tier: 1 },
  { id: 'invalid-minute', at: '10:30', peak: peak('09:70', '11:00', 100), valley: 10, tier: 1 },
  { id: 'invalid-start-hour', at: '03:00', peak: peak('25:00', '06:00', 100), valley: 10, tier: 1 },
  { id: 'trimmed-valid-times', at: '23:30', peak: peak(' 22:00 ', ' 06:00 ', 10), valley: 100, tier: 1 },
  { id: 'string-false-disabled', at: '12:00', enabled: 'false', global: 10, peak: peak('09:00', '18:00', 100), valley: 100, tier: 1 },
  { id: 'numeric-one-disabled', at: '12:00', enabled: 1, global: 10, peak: peak('09:00', '18:00', 100), valley: 100, tier: 1 },
  { id: 'group-invalid-window-uses-valley', at: '23:30', unified: false, peak: peak('22:00', '25:70', 10), groupPeak: { peak: 55, valley: 15 }, tier: 2 },
  { id: 'cross-before-start', at: '21:59', keyword: true, tier: 3 },
  { id: 'cross-start-inclusive', at: '22:00', keyword: true, tier: 2 },
  { id: 'cross-before-end', at: '05:59', keyword: true, tier: 2 },
  { id: 'cross-end-exclusive', at: '06:00', tier: 3 },
  { id: 'regular-start-inclusive', at: '09:00', peak: peak('09:00', '18:00', 15), keyword: true, tier: 2 },
  { id: 'regular-before-end', at: '17:59', peak: peak('09:00', '18:00', 15), keyword: true, tier: 2 },
  { id: 'regular-end-exclusive', at: '18:00', peak: peak('09:00', '18:00', 15), tier: 3 },
  { id: 'equal-times-use-valley', at: '12:00', peak: peak('09:00', '09:00', 15), tier: 3 },
  { id: 'empty-start-uses-valley', at: '12:00', peak: peak('', '18:00', 15), tier: 3 },
  { id: 'historical-invalid-text', at: '12:00', peak: peak('bad historical value', '18:00', 15), tier: 3 },
  { id: 'one-digit-hour', at: '09:00', peak: peak('9:00', '18:00', 15), keyword: true, tier: 2 },
  { id: 'disabled-unified-slot2', at: '23:30', enabled: false, global: 15, keyword: true, tier: 2 },
  { id: 'disabled-independent-slot3', at: '23:30', enabled: false, unified: false, groupSlider: 55, tier: 3 },
  { id: 'independent-peak-slot3', at: '23:30', unified: false, groupPeak: { peak: 55, valley: 15 }, tier: 3 },
  { id: 'independent-valley-slot2', at: '12:00', unified: false, groupPeak: { peak: 55, valley: 15 }, keyword: true, tier: 2 },
  { id: 'unmapped-group-global-peak', at: '23:30', key: 'group:22602', unified: false, keyword: true, tier: 2 },
  { id: 'unmapped-group-global-valley', at: '12:00', key: 'group:22602', unified: false, tier: 3 },
  { id: 'slot3-miss-archived-once', at: '23:30', unified: false, groupPeak: { peak: 55, valley: 15 }, dice: 0.99, tier: 3 },
  { id: 'slot2-unmatched-no-dice', at: '23:30', tier: 2 },
  { id: 'zero-group-slider', at: '23:30', unified: false, groupPeak: { peak: 0, valley: 55 }, tier: 1 },
  { id: 'partial-group-retains-global-fallback', at: '23:30', unified: false, groupPeak: {}, keyword: true, tier: 2 },
  { id: 'strict-unified-string-false', at: '23:30', unified: 'false', groupPeak: { peak: 100, valley: 100 }, keyword: true, tier: 2 },
  { id: 'strict-unified-null', at: '23:30', unified: null, groupPeak: { peak: 100, valley: 100 }, keyword: true, tier: 2 },
  { id: 'strict-unified-zero', at: '23:30', unified: 0, groupPeak: { peak: 100, valley: 100 }, keyword: true, tier: 2 },
  { id: 'unified-ignores-group-pair', at: '23:30', unified: true, groupPeak: { peak: 100, valley: 100 }, keyword: true, tier: 2 },
  { id: 'private-unified-retains-tier4', at: '23:30', key: 'private:22603', unified: true, tier: 2, wakeTier: 4 },
  { id: 'private-split-inherits-global-peak', at: '23:30', key: 'private:22603', unified: false, tier: 2 },
  { id: 'private-split-global-keyword-responds', at: '23:30', key: 'private:22603', unified: false, keyword: true, tier: 2 },
  { id: 'private-split-global-valley-miss', at: '12:00', key: 'private:22603', unified: false, dice: 0.99, tier: 3 },
  { id: 'private-split-global-valley-hit', at: '12:00', key: 'private:22603', unified: false, dice: 0, tier: 3 },
  { id: 'unmapped-group-global-single', at: '12:00', key: 'group:22602', unified: false, enabled: false, global: 0, tier: 1 },
  { id: 'private-split-global-single', at: '12:00', key: 'private:22603', unified: false, enabled: false, global: 0, tier: 1 },
  { id: 'private-numeric-group-override-never-leaks', at: '12:00', key: 'private:22601', unified: false, enabled: false, global: 0, groupSlider: 100, tier: 1 },
  { id: 'private-group-pair-never-leaks', at: '23:30', key: 'private:22601', unified: false, groupPeak: { peak: 100, valley: 100 }, tier: 2 },
  { id: 'zero-zero-not-full-day', at: '00:00', peak: peak('00:00', '00:00', 15), tier: 3 },
  { id: 'ninety-retains-tier4', at: '23:30', peak: peak('22:00', '06:00', 90), tier: 4 },
  { id: 'injected-clock-peak', at: '12:00', nowAt: '23:30', keyword: true, tier: 2 },
  { id: 'injected-clock-valley', at: '23:30', nowAt: '12:00', tier: 3 },
  { id: 'waiting-crosses-start-no-second-verdict', at: '21:59', afterIncomingAt: '22:00', tier: 3 },
  { id: 'waiting-crosses-end-no-second-verdict', at: '05:59', afterIncomingAt: '06:00', keyword: true, tier: 2 },
  { id: 'hour24-invalid', at: '23:30', peak: peak('22:00', '24:00', 100), valley: 10, tier: 1 },
  { id: 'minute60-invalid', at: '10:00', peak: peak('09:60', '11:00', 100), valley: 10, tier: 1 },
  { id: 'string-true-disabled', at: '12:00', enabled: 'true', global: 10, peak: peak('09:00', '18:00', 100), valley: 100, tier: 1 },
  { id: 'last-valid-minute-inclusive', at: '23:59', peak: peak('23:59', '00:00', 15), keyword: true, tier: 2 },
  { id: 'midnight-end-exclusive', at: '00:00', peak: peak('23:59', '00:00', 15), tier: 3 },
];

function temporary() { return fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-peak226-')); }
function removeTemporary(root) {
  const absolute = path.resolve(root);
  assert.equal(path.dirname(absolute).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(absolute).startsWith('qqa-peak226-'));
  fs.rmSync(absolute, { recursive: true, force: true });
}
async function runScenario(spec, selected = defaults) {
  const saved = { Date: globalThis.Date, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, fetch: globalThis.fetch, random: Math.random };
  const clock = { value: at(spec.at) }, timers = new Map();
  let diceCalls = 0, orch, sessions;
  const dice = spec.dice ?? 0.4;
  const dataDir = temporary();
  class ControlledDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [clock.value])); }
    static now() { return clock.value; }
  }
  globalThis.Date = ControlledDate;
  globalThis.setTimeout = (fn, delay = 0) => { const handle = { unref() { return this; } }; timers.set(handle, { fn, delay: Number(delay) }); return handle; };
  globalThis.clearTimeout = handle => timers.delete(handle);
  globalThis.fetch = async () => { throw new Error('226 forbids network access'); };
  Math.random = () => { diceCalls++; return dice; };
  try {
    const config = selected['runtime.config']({ dataDir, defaults: selected['runtime.config.defaults']({ personaText: 'Synthetic peak parity persona' }), log });
    config.load();
    config.update({
      api: { model: 'offline-peak226', maxRounds: 2 }, allow: { groups: ['22601', '22602'], private: ['22601','22603'] },
      store: { contextSliderPos: spec.global ?? 10, unifiedTier: Object.hasOwn(spec, 'unified') ? spec.unified : true,
        historyCount: 20, keywords: ['KEYWORD'], promptAnchor: { enabled: false },
        groupSliderPos: { 22601: spec.groupSlider ?? 100 }, groupPeakPos: { 22601: spec.groupPeak ?? { peak: 100, valley: 100 } },
        peakSchedule: { enabled: Object.hasOwn(spec, 'enabled') ? spec.enabled : true,
          peak: spec.peak ?? peak('22:00', '06:00', 15), valley: { sliderPos: spec.valley ?? 55 } },
      },
      chatActive: { enabled: false }, proactive: { enabled: false }, memory: { consolidateEnabled: false },
      sessionRetryAttempts: 0, wakeDelayMs: 200, drainDelayMs: 200,
    });
    const disk = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
    config.load();
    assert.deepEqual(config.get().store, disk.store, 'actual saved config is reread before consumption');
    const cfg = () => config.get(), key = spec.key ?? 'group:22601';
    const store = selected['data.messages']({ dataDir, log });
    sessions = selected['data.sessions']({ dataDir, log });
    const registry = selected['runtime.tools']({ log });
    const verdicts = [], runnerInputs = [], requests = [], sends = [];
    const transport = { selfId: '22699', actions: { async getSelfMemberInfo() { return { muted: false }; } }, async send(chatKey, segments) { sends.push({ chatKey, segments }); return { msgId: sends.length }; } };
    const send = selected['core.send']({ cfg, store, transport, log });
    coreTools.setup({ capability: fixtureCapability({ cfg, store, send }), registerTool: definition => registry.register({ ...definition, bundled: true, ownerId: 'core-tools' }) });
    const loader = { isActive: () => true, hooksOf: () => [], promptSections: () => [] };
    const components = { ...selected,
      'core.wake.resolve': args => { const result = selected['core.wake.resolve'](args); verdicts.push({ cfg: structuredClone(args.cfg), result: structuredClone(result) }); return result; },
      'core.agentRunner': args => { runnerInputs.push({ tier: args.session.contextTier, prompt: args.userPrompt, tools: args.tools.map(tool => tool.function.name) }); return selected['core.agentRunner'](args); },
    };
    orch = components['core.orchestrator']({ cfg, store, sessions, memory: {}, send, registry, loader, transport, log, components,
      now: () => spec.nowAt ? at(spec.nowAt) : clock.value,
      buildToolsFor: args => components['core.tools.bundle'](args, { registry, loader }),
      execContextFor: ({ chatKey, session }) => ({ chatKey, session, send }),
      llmInvoker: async args => {
        requests.push(structuredClone(args.messages));
        return { message: { role: 'assistant', content: '', tool_calls: [{ id: 'finish-226', type: 'function', function: { name: 'finish', arguments: '{"reason":"offline parity complete"}' } }] }, finishReason: 'tool_calls' };
      },
    });
    const ingest = selected['core.ingest']({ cfg, store, selfIdOf: () => transport.selfId, log });
    const accepted = await ingest.ingestMessage({ kind: key.split(':')[0], id: key.split(':')[1], event: { user_id: '22610', message_id: 22601,
      time: clock.value / 1000, raw_message: `${spec.keyword ? 'KEYWORD' : 'ordinary synthetic message'} CASE-${spec.id}`, sender: { nickname: 'Synthetic member' } } });
    assert.equal(accepted.accepted, true);
    await orch.onIncoming(accepted.chatKey, accepted.entry);
    if (spec.afterIncomingAt) clock.value = at(spec.afterIncomingAt);
    const current = sessions.current(key);
    if (current) {
      const waiting = [...timers].find(([, task]) => task.delay === 200);
      assert.ok(waiting, 'default orchestration scheduled the actual waiting timer');
      timers.delete(waiting[0]); waiting[1].fn();
      for (let i = 0; i < 100 && ['waiting', 'running'].includes(sessions.peek(current.id)?.status); i++) await new Promise(setImmediate);
      assert.ok(!['waiting', 'running'].includes(sessions.peek(current.id)?.status), 'real runner completed without wall-clock waiting');
    }
    assert.equal(verdicts.length, 1, 'one incoming message is judged only once, including boundary crossings');
    assert.equal(verdicts[0].cfg.contextTier, spec.tier, 'effective config reaches the selected actual wake consumer');
    const isPrivate = key.startsWith('private:');
    const privateAlways=isPrivate&&spec.unified!==false;
    const respond = privateAlways || spec.tier === 4 || (spec.tier >= 2 && !!spec.keyword) || (spec.tier === 3 && dice < verdicts[0].cfg.randomPercent / 100);
    assert.equal(requests.length, respond ? 1 : 0, 'response decision reaches the model boundary');
    assert.equal(runnerInputs.length, requests.length);
    if (respond) {
      assert.equal(runnerInputs[0].tier, spec.wakeTier ?? spec.tier);
      assert.ok(runnerInputs[0].prompt.includes(`CASE-${spec.id}`));
      assert.ok(runnerInputs[0].tools.includes('finish'), 'actual registered core tool bundle reaches runner');
      assert.equal(requests[0].at(-1).content, runnerInputs[0].prompt);
      assert.equal(sessions.get(current.id).contextTier, spec.wakeTier ?? spec.tier, 'waiting retains the first verdict');
    }
    assert.equal(diceCalls, spec.tier === 3 && !spec.keyword && !privateAlways ? 1 : 0, 'slot3 rolls once; keywords/other slots do not roll');
    assert.equal(sends.length, 0);
    assert.equal(store.unread(key).length, 0, 'both non-triggering and finished messages are archived');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).store, disk.store, 'runtime replacement never rewrites the saved schedule');
  } finally {
    try { orch?.stop(); sessions?.stop(); }
    finally {
      Object.assign(globalThis, { Date: saved.Date, setTimeout: saved.setTimeout, clearTimeout: saved.clearTimeout, fetch: saved.fetch });
      Math.random = saved.random;
      removeTemporary(dataDir);
    }
  }
}

test('peak schedule uses strict saved times and enable flags through the actual default incoming path', async t => {
  for (const spec of cases) await t.test(spec.id, () => runScenario(spec));
});

test('whole core.orchestrator supports appended replacement, wrapping, and disabled restoration', async t => {
  // This is the whole orchestrator extension boundary; peak parsing is not a
  // separately exposed strategy component.
  for (const mode of ['replace', 'wrap']) await t.test(mode, async () => {
    const appRoot = temporary(), layer = path.join(appRoot, 'overrides', `peak226-${mode}`);
    try {
      fs.mkdirSync(layer, { recursive: true });
      const overrideConfig = `options => { const value = options.cfg(); return { ...value, store: { ...value.store, contextTier: 4, contextSliderPos: 100, unifiedTier: true, peakSchedule: { ...value.store.peakSchedule, enabled: false } } }; }`;
      const source = mode === 'replace'
        ? `import { createOrchestrator } from ${JSON.stringify(new URL('../src/kernel/orchestrator.js', import.meta.url).href)}; const configFor = ${overrideConfig}; export default options => createOrchestrator({ ...options, cfg: () => configFor(options) });`
        : `const configFor = ${overrideConfig}; export default previous => options => previous({ ...options, cfg: () => configFor(options) });`;
      fs.writeFileSync(path.join(layer, 'index.mjs'), source);
      const manifest = { version: 2, id: `peak226-${mode}`, components: { 'core.orchestrator': { module: 'index.mjs', mode } } };
      const manifestFile = path.join(layer, 'composition.json');
      fs.writeFileSync(manifestFile, JSON.stringify(manifest));
      const chosen = await loadComposition({ appRoot });
      assert.notEqual(chosen.components['core.orchestrator'], defaults['core.orchestrator']);
      assert.equal(chosen.composition.owners['core.orchestrator'], manifest.id);
      assert.equal(chosen.components['core.prompt.user'], defaults['core.prompt.user']);
      assert.equal(chosen.components['core.agentRunner'], defaults['core.agentRunner']);
      const spec = { id: `appended-${mode}`, at: '23:30', peak: peak('22:00', '06:00', 10), tier: 4 };
      await runScenario(spec, chosen.components);
      fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, enabled: false }));
      const restored = await loadComposition({ appRoot });
      assert.equal(restored.components['core.orchestrator'], defaults['core.orchestrator']);
      await runScenario({ ...spec, id: `disabled-${mode}`, tier: 1 }, restored.components);
    } finally { removeTemporary(appRoot); }
  });
});

// Invoke the shipped system tool through the production registry and reminder
// store, then drive the production scheduler/send queue with an offline transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import systemTools from '../bundled/system-tools/index.js';
import { defaultComponents } from '../bundled/runtime-defaults/components.js';
import { fixtureCapability } from './bundled-fixture-sdk.mjs';

const log = { info() {}, warn() {}, error() {} };
const key = 'group:20501';
const frozen = new Date(2026, 9, 16, 12, 0, 0).getTime();
function runtime(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-reminder-parity-205-'));
  const reminders = defaultComponents['data.reminders']({ dataDir, log });
  const registry = defaultComponents['runtime.tools']({ log });
  systemTools.setup({ capability: fixtureCapability({ reminders }), registerTool: def => registry.register({ ...def, bundled: true, ownerId: 'system-tools' }) });
  const disk = () => fs.existsSync(path.join(dataDir, 'reminders.json')) ? JSON.parse(fs.readFileSync(path.join(dataDir, 'reminders.json'), 'utf8')).reminders : [];
  const reopen = () => defaultComponents['data.reminders']({ dataDir, log });
  const invoke = async (id, args) => {
    const transportResult = await registry.invoke(id, args, { execCtx: { chatKey: key, senderId: '20510' } });
    return transportResult.ok ? transportResult.result : transportResult;
  };
  t.after(() => {
    const absolute = path.resolve(dataDir);
    assert.equal(path.dirname(absolute).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(absolute).startsWith('qqa-reminder-parity-205-'));
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  return { dataDir, reminders, disk, reopen,
    invoke,
    set: args => invoke('set_reminder', { text: 'fixture reminder', ...args }),
  };
}

test('registered set_reminder rejects invalid HH:MM without creating or changing persisted reminders', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: frozen });
  const e = runtime(t);
  for (const atTime of ['24:00', '25:99', '23:60', '00:60', '99:59']) {
    const result = await e.set({ atTime });
    assert.equal(result.ok, false, `${atTime} is rejected instead of Date normalization`);
    assert.match(result.error, /时间格式/);
    assert.deepEqual(e.disk(), []); assert.deepEqual(e.reopen().pending(key), []);
  }
  assert.equal(fs.existsSync(path.join(e.dataDir, 'reminders.json')), false, 'invalid requests never reach add/save');
  assert.equal((await e.set({ atTime: '23:59' })).ok, true);
  const before = fs.readFileSync(path.join(e.dataDir, 'reminders.json'), 'utf8');
  for (const atTime of ['24:01', '12:99', '2026-02-30 12:00']) {
    assert.equal((await e.set({ atTime })).ok, false);
    assert.equal(fs.readFileSync(path.join(e.dataDir, 'reminders.json'), 'utf8'), before, 'invalid input preserves an existing reminder byte for byte');
  }
});

test('registered reminders preserve valid boundaries, tomorrow rollover, delay validation and reload/list/cancel', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: frozen });
  const e = runtime(t);
  const cases = [
    ['00:00', new Date(2026, 9, 17, 0, 0).getTime()],
    ['23:59', new Date(2026, 9, 16, 23, 59).getTime()],
    ['12:00', new Date(2026, 9, 17, 12, 0).getTime()],
    ['9:05', new Date(2026, 9, 17, 9, 5).getTime()],
    ['2026-10-17 08:30', new Date(2026, 9, 17, 8, 30).getTime()],
  ];
  for (const [atTime, dueAt] of cases) {
    const result = await e.set({ atTime });
    assert.equal(result.ok, true, atTime); assert.equal(result.result.dueAt, dueAt);
    const saved = e.reopen().pending(key).find(item => item.id === result.result.id);
    assert.equal(saved.dueAt, dueAt); assert.equal(saved.createdBy, '20510'); assert.equal(saved.fired, false);
  }
  const delayed = await e.set({ delayMinutes: 2.5 });
  assert.equal(delayed.ok, true); assert.equal(delayed.result.dueAt, frozen + 150000);
  for (const delayMinutes of [0, -1, Infinity, NaN]) assert.equal((await e.set({ delayMinutes })).ok, false);
  assert.equal(e.disk().length, 6);
  const listing = await e.invoke('list_reminders', {});
  assert.equal(listing.ok, true); assert.equal(listing.result.reminders.length, 6);
  assert.equal((await e.invoke('cancel_reminder', { id: delayed.result.id })).ok, true);
  assert.equal(e.reopen().pending(key).some(item => item.id === delayed.result.id), false);
});

test('a tool-created reminder reloads into the default scheduler and sends through the default queue', async t => {
  const e = runtime(t);
  const created = await e.set({ text: 'TOOL-TO-SCHEDULER-205', delayMinutes: 1 });
  assert.equal(created.ok, true);
  const store = defaultComponents['data.messages']({ dataDir: e.dataDir, log });
  const deliveries = [];
  const cfg = () => ({ send: { minGapMs: 200, maxGapMs: 200, byLengthMs: 1, hardSplitAt: 4000, dedupeWindowMs: 0 } });
  const send = defaultComponents['core.send']({ cfg, store, log, transport: { async send(chatKey, segments) { deliveries.push({ chatKey, segments }); return { msgId: 205 }; } } });
  const tasks = new Map();
  const orch = defaultComponents['core.orchestrator']({ cfg, store, sessions: {}, send, log,
    now: () => created.result.dueAt + 1,
    setTimeoutFn: (fn, ms) => { const token = { unref() {} }; tasks.set(token, { fn, ms }); return token; },
    clearTimeoutFn: token => tasks.delete(token),
  });
  t.after(() => { orch.stop(); assert.equal(tasks.size, 0); });
  orch.startReminderLoop(e.reopen());
  const [token, first] = [...tasks][0]; tasks.delete(token);
  assert.equal(first.ms, 5000); await first.fn();
  assert.deepEqual(deliveries, [{ chatKey: key, segments: [{ type: 'text', text: 'TOOL-TO-SCHEDULER-205' }] }]);
  const saved = e.disk().find(item => item.id === created.result.id);
  assert.equal(saved.fired, true); assert.ok(saved.firedAt > 0); assert.equal(e.reopen().pending(key).length, 0);
  assert.equal(defaultComponents['data.messages']({ dataDir: e.dataDir, log }).recent(key, 10)[0].text, 'TOOL-TO-SCHEDULER-205');
  assert.equal([...tasks.values()][0].ms, 20000);
});

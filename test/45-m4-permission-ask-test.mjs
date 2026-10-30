// 45 · M4 权限 ask 三态 broker：异步等待、once/always/deny、超时 fail-closed
import { strict as assert } from 'node:assert';
import { createPermissions } from '../src/kernel/permissions.js';

const events = [];
const pm = createPermissions({ log: {}, bus: { emit(name, payload) { events.push({ name, payload }); } } });
const waiting = pm.checkAsync('demo', 'proc.exec', { kind: 'user', detail: '工具 demo' });
assert.equal(pm.pending().length, 1);
const req = pm.pending()[0];
assert.equal(req.detail, '工具 demo');
assert.ok(req.id && !JSON.stringify(req).includes('secret'));
assert.equal(pm.resolveAsk(req.id, 'once').ok, true);
assert.equal((await waiting).decision, 'allow');

const alwaysWait = pm.checkAsync('demo', 'proc.exec', { kind: 'user', detail: '第二次' });
const alwaysReq = pm.pending()[0];
assert.equal(pm.resolveAsk(alwaysReq.id, 'always').decision, 'always');
assert.equal((await alwaysWait).decision, 'allow');
assert.equal(pm.check('demo', 'proc.exec', { kind: 'user' }).decision, 'allow');

// Resolve is exercised above; unknown ids and non-askable scopes fail closed.
assert.equal(pm.resolveAsk('missing', 'once').ok, false);
assert.equal(pm.check('demo', 'net.raw', { kind: 'user' }).decision, 'deny');
assert.equal(pm.check('demo', 'unknown.scope', { kind: 'user' }).decision, 'deny');
const deniedWait = pm.checkAsync('demo-deny', 'proc.exec', { kind: 'user', detail: '拒绝测试' });
const deniedReq = pm.pending().find((item) => item.pluginId === 'demo-deny');
assert.equal(pm.resolveAsk(deniedReq.id, 'deny').decision, 'deny');
assert.equal((await deniedWait).decision, 'deny');
const headless = createPermissions({ headless: true, log: {} });
assert.equal((await headless.checkAsync('demo', 'proc.exec', { kind: 'user' })).decision, 'deny');
assert.ok(events.some((event) => event.name === 'permission.ask'));
assert.ok(events.some((event) => event.name === 'permission.decision'));

// 可控时钟：验证两个 waiter 共享同一 request，且 stale timeout 不会影响新 pending。
let clock = 1_000;
const timers = new Map();
let nextTimer = 0;
const fakeSetTimeout = (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms, cleared: false }); return id; };
const fakeClearTimeout = (id) => { const timer = timers.get(id); if (timer) timer.cleared = true; };
const runTimer = (id) => timers.get(id)?.fn();
const controlled = createPermissions({
  log: {}, now: () => clock, setTimeoutFn: fakeSetTimeout, clearTimeoutFn: fakeClearTimeout,
  bus: { emit(name, payload) { events.push({ name, payload }); } },
});
const firstWait = controlled.checkAsync('race-plugin', 'proc.exec', { kind: 'user', detail: 'first' });
const firstRequest = controlled.pending()[0];
const secondWait = controlled.checkAsync('race-plugin', 'proc.exec', { kind: 'user', detail: 'second' });
assert.equal(controlled.pending().length, 1);
assert.equal(controlled.pending()[0].id, firstRequest.id);
assert.equal(controlled.resolveAsk(firstRequest.id, 'once').decision, 'once');
assert.equal((await firstWait).decision, 'allow');
assert.equal((await secondWait).decision, 'allow');
const staleTimerId = 1;
runTimer(staleTimerId);
const newWait = controlled.checkAsync('race-plugin', 'proc.exec', { kind: 'user', detail: 'new' });
const newRequest = controlled.pending()[0];
assert.notEqual(newRequest.id, firstRequest.id);
runTimer(staleTimerId);
assert.equal(controlled.pending()[0].id, newRequest.id);
assert.equal(controlled.resolveAsk(firstRequest.id, 'once').ok, false);
controlled.close('race close');
assert.equal((await newWait).decision, 'deny');
runTimer(2);
assert.equal(controlled.pending().length, 0);
const afterClose = controlled.checkAsync('race-plugin', 'proc.exec', { kind: 'user' });
assert.equal(controlled.pending().length, 0);
assert.equal((await afterClose).decision, 'deny');
console.log('45-m4-permission-ask：通过');

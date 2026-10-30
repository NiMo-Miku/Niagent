import assert from 'node:assert/strict';
import { createRefreshQueue } from '../ui/shell/refresh-queue.js';

let runs = 0;
const merged = createRefreshQueue(async ({ isCurrent }) => { runs++; assert.equal(isCurrent(), true); });
await Promise.all(Array.from({ length: 80 }, () => merged.request()));
assert.equal(runs, 1, 'one synchronous notification burst uses one fresh read');

let release, firstTicket, latest = 1;
const committed = [], observed = [];
const trailing = createRefreshQueue(async ticket => {
  const snapshot = latest;
  observed.push(snapshot);
  if (observed.length === 1) { firstTicket = ticket; await new Promise(resolve => { release = resolve; }); }
  if (ticket.isCurrent()) committed.push(snapshot);
});
const first = trailing.request();
await Promise.resolve();
latest = 2;
for (let i = 0; i < 40; i++) trailing.request();
assert.equal(firstTicket.isCurrent(), false, 'a newer notification invalidates the pending snapshot');
release(); await first;
assert.deepEqual(observed, [1, 2], 'events during a read cause one trailing fresh read');
assert.deepEqual(committed, [2], 'an obsolete response cannot restore old panel definitions');

let closeRelease, closeTicket, closedRuns = 0, closedCommits = 0;
const disposable = createRefreshQueue(async ticket => {
  closedRuns++; closeTicket = ticket;
  await new Promise(resolve => { closeRelease = resolve; });
  if (ticket.isCurrent()) closedCommits++;
});
const waiting = disposable.request(); await Promise.resolve();
disposable.request(); disposable.close();
assert.equal(closeTicket.isCurrent(), false);
closeRelease(); await waiting; await disposable.request();
assert.equal(closedRuns, 1); assert.equal(closedCommits, 0, 'closed UI never commits or restarts a request');

let attempts = 0;
const retry = createRefreshQueue(async () => { if (++attempts === 1) throw new Error('synthetic failure'); });
await assert.rejects(retry.request(), /synthetic failure/);
await retry.request(); assert.equal(attempts, 2, 'failure releases the single-flight gate for an explicit retry');

let rejectOld, recoveries = 0;
const recoverTrailing = createRefreshQueue(async () => {
  if (++recoveries === 1) await new Promise((resolve,reject) => { rejectOld = reject; });
});
const outdatedFailure = recoverTrailing.request(); await Promise.resolve();
recoverTrailing.request(); rejectOld(new Error('obsolete failure'));
await outdatedFailure;
assert.equal(recoveries, 2, 'a failed obsolete read does not drop the pending fresh notification');
console.log('✓ 139 Shell refresh bursts, trailing freshness, obsolete responses, close and retry passed');

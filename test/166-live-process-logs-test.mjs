// Generic application log stream; no external service or process is managed.
import assert from 'node:assert/strict';
import { Bus } from '../src/kernel/bus.js';
import { createSseBridge } from '../src/console/sse-bridge.js';
const bus = new Bus({ warn() {}, error() {} }), received = [];
const dispose = createSseBridge({ bus, http: { broadcast: (name, payload) => received.push({name, payload}) } });
const records = Array.from({length: 8}, (_, i) => ({ level: 'info', text: `APP_LOG_${i}`, ts: i }));
for (const record of records) bus.emit('log', record);
assert.deepEqual(received, records.map(payload => ({name: 'log', payload})));
if (typeof dispose === 'function') dispose();
console.log('166 generic application log events preserve order and content');

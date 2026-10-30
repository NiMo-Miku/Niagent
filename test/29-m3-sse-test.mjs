import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSseBridge } from '../src/console/sse-bridge.js';
import { Bus } from '../src/kernel/bus.js';
import { mktmp, eq, ok, section, summary, sleep } from './helpers.mjs';
const dataDir = mktmp('qqa-m3-sse-data-'); const staticDir = mktmp('qqa-m3-sse-static-'); fs.writeFileSync(path.join(staticDir,'index.html'),'x');
const log = { error() {}, warn() {}, info() {} }; const config = createConfig({ dataDir, defaults: buildDefaultConfig({ personaText: '' }), log }); config.load(); config.update({ server: { port: 0, token: 'sse-secret' } });
const http = createHttpServer({ config, log, staticDir }); const bus = new Bus(log); createSseBridge({ bus, http }); const captured = []; const captureBus = new Bus(log); createSseBridge({ bus: captureBus, http: { broadcast: (event, payload) => captured.push([event, payload]) } }); const port = await http.listen();
async function raw(url, headers={}) { const r = await fetch(`http://127.0.0.1:${port}${url}`, { headers }); return r; }
section('SSE guards'); eq((await raw('/api/events')).status, 401, 'missing token 401'); eq((await raw('/api/events?token=sse-secret', { origin: 'http://evil.example' })).status, 403, 'bad origin 403');
const ctrl = new AbortController(); const res = await raw('/api/events?token=sse-secret'); eq(res.status, 200, 'SSE 200'); const reader = res.body.getReader(); const dec = new TextDecoder(); let text = ''; async function readUntil(needle) { while (!text.includes(needle)) { const { done, value } = await reader.read(); if (done) break; text += dec.decode(value); } }
await readUntil('event: hello'); ok(text.startsWith('event: hello'), 'hello first frame');
const all = [['session.start',{id:'s'}],['session.update',{id:'s'}],['session.end',{id:'s'}],['chat.update',{chatKey:'group:1'}],['memory.update',{chatKey:'group:1'}],['onebot.status',{connected:true}],['log',{level:'info'}]]; for (const [name, payload] of all) { bus.emit(name, payload); captureBus.emit(name, payload); }
await sleep(100); const events = captured;
for (const n of ['session-start','session-update','session-end','chat-update','memory-update','onebot-status','log']) ok(events.some(([event]) => event === n), `event ${n}`);
ctrl.abort(); await http.close(); summary('29-m3-sse');

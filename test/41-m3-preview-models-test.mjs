import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { mktmp, eq, ok, section, summary } from './helpers.mjs';

const dataDir = mktmp('qqa-m3-preview-models-');
const log = { error() {}, warn() {}, info() {}, recent: () => [], setLevel: (x) => x };
const config = createConfig({ dataDir, defaults: buildDefaultConfig({ personaText: '' }), log });
config.load();
config.update({ server: { token: 'route-secret' }, api: { baseUrl: 'https://api.example.test/v1', provider: 'p', model: 'vision-model', apiKey: 'api-key' }, providers: [{ id: 'p', apiKey: 'provider-key' }], dshProviderKeys: { p: 'dsh-key' }, visionResults: { 'p|||vision-model': { verdict: 'no-vision' } }, tools: { categories: { web: true }, overrides: {} } });
const loader = { listEntries: () => [], promptSections: () => [] };
const defs = [
  { id: 'vision_tool', name: 'Vision', description: 'vision', category: 'media', requiresVision: true },
  { id: 'search_tool', name: 'Search', description: 'search', category: 'web', requiresSearch: true },
  { id: 'off_tool', name: 'Off', description: 'off', category: 'system', defaultEnabled: false },
];
const registry = {
  list: () => defs,
  availability: (id, ctx) => ({ ok: ctx.toolsEnabled !== false && ctx.categoryEnabled(defs.find((d) => d.id === id)?.category) && (id !== 'vision_tool' || ctx.visionEnabled !== false) && (id !== 'search_tool' || ctx.searchEnabled !== false) && (id !== 'off_tool'), code: 'ok', reason: null }),
};
let body = JSON.stringify({ data: [{ id: 'first' }, { model: 'second' }, '', null] });
let status = 200;
let seenHeaders;
const fetchImpl = async (_url, options) => { seenHeaders = options.headers; return { status, headers: new Headers(), body: null, arrayBuffer: async () => Buffer.from(body) }; };
const http = createHttpServer({ config, log, fetchImpl, dnsLookup: async () => [{ address: '203.0.113.10', family: 4 }] });
registerConsoleRoutes(http, { config, loader, registry, dataDir, log, fetchImpl, dnsLookup: async () => [{ address: '203.0.113.10', family: 4 }], capability: { names: () => [], explain: () => ({}) }, orchestrator: {}, sessions: { listSummaries: () => [], todayUsage: () => ({}) }, store: { listChats: () => [] }, onebot: {} });
const port = await http.listen();
async function req(method, url, payload) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'x-console-token': 'route-secret', 'content-type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

section('R44 preview filters effective availability and does not persist');
const before = config.get();
const preview = await req('POST', '/api/prompt-preview', { tools: { enabled: true }, api: { vision: true } });
eq(preview.status, 200, 'preview status');
eq(preview.data.tools.map((tool) => tool.id).join(','), 'search_tool', 'preview excludes no-vision/default-disabled tools');
ok(!('requiresVision' in preview.data.tools[0]), 'preview DTO is minimal');
eq(config.get().api.model, before.api.model, 'preview patch does not persist');
const availability = await req('GET', '/api/tools/availability');
eq(availability.status, 200, 'availability status');
eq(availability.data.tools.find((tool) => tool.id === 'vision_tool').enabled, false, 'no-vision also disables availability');

section('R63 provider key priority and response shapes');
let models = await req('GET', '/api/models');
eq(models.status, 200, 'models status');
eq(models.data.models.map((m) => m.id).join(','), 'first,second', 'data and model fields parsed');
eq(seenHeaders.authorization, 'Bearer dsh-key', 'dsh provider key wins');
config.update({ dshProviderKeys: { __replace__: {} } });
body = JSON.stringify([{ id: 'array-id' }, { model: 'array-model' }, 'array-string', { id: '' }]);
models = await req('GET', '/api/models');
eq(models.status, 200, 'top-level array status');
eq(models.data.models.map((m) => m.id).join(','), 'array-id,array-model,array-string', 'top-level array parsed and blanks filtered');
eq(seenHeaders.authorization, 'Bearer provider-key', 'provider apiKey fallback');
status = 500;
const failed = await req('GET', '/api/models');
eq(failed.status, 502, 'HTTP error status');
status = 200; body = '{not-json';
const invalid = await req('GET', '/api/models');
eq(invalid.status, 502, 'invalid JSON status');
await http.close();
summary('41-m3-preview-models');

// Production console HTTP routes and bundled client; upstream is an offline fixture.
// Primary auth contract: https://www.kondius.cn/qq-agent/skill-market/ (GET, 2026-10-14).
import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../src/kernel/http.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createChatStore } from '../src/kernel/store.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { COMMUNITY_BASE_URL } from '../src/console/community-market-adapters.js';
import { eq, ok, mktmp, section, summary } from './helpers.mjs';

const dataDir = mktmp('qqa-auth144-data-'), appRoot = mktmp('qqa-auth144-app-'), staticDir = mktmp('qqa-auth144-static-');
fs.writeFileSync(path.join(staticDir, 'index.html'), 'Local auth boundary fixture');
const log = { error() {}, warn() {}, info() {}, level: 'info', recent: () => [] };
const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log });config.load();
config.update({ server: { port: 0, token: 'QA-only-console-auth144' } });
const calls = [];
const validResponse = { ok: true, account: { id: 'local144', username: 'alice', loginId: 'alice', displayName: 'Alice', token: 'unlisted-account-property' }, token: 'QA-only-account-token144' };
let upstream = { status: 200, body: validResponse };
const fetchImpl = async (url, init = {}) => {
  calls.push({ url, init });
  if (url === `${COMMUNITY_BASE_URL}/auth/logout`) return new Response('{"ok":true}');
  return new Response(JSON.stringify(upstream.body), { status: upstream.status ?? 200, headers: upstream.headers });
};
const http = createHttpServer({ config, log, staticDir });
registerConsoleRoutes(http, {
  config, log, dataDir, appRoot, fetchImpl, dnsLookup: async () => [{ address: '203.0.113.8', family: 4 }],
  sessions: createSessionRegistry({ dataDir, log }), store: createChatStore({ dataDir, log }),
  loader: { listEntries: () => [], promptSections: () => [] },
});
const port = await http.listen();
const accountFile = path.join(dataDir, 'account.json');
async function req(body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/market/login`, {
    method: 'POST', headers: { 'x-console-token': 'QA-only-console-auth144', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
try {
  section('144 official login/register fields and local-only credential storage');
  let response = await req({ mode: 'register', loginId: 'alice', displayName: 'Alice', password: 'QA-only-register-secret144', captchaVerifyParam: 'not-an-official-auth-field' });
  eq(response.status, 200, 'registration succeeds with official response');
  eq(calls.at(-1).url, `${COMMUNITY_BASE_URL}/auth/register`, 'registration endpoint');
  eq(JSON.parse(calls.at(-1).init.body), { loginId: 'alice', password: 'QA-only-register-secret144', displayName: 'Alice' }, 'registration sends only official auth fields');
  ok(!JSON.stringify(response.data).includes(validResponse.token), 'registration does not return account token');
  ok(!JSON.stringify(response.data).includes('unlisted-account-property'), 'account DTO strips unknown credential property');
  const savedBefore = fs.readFileSync(accountFile, 'utf8');
  eq(JSON.parse(savedBefore).accounts[0].token, validResponse.token, 'token is saved only in account file');
  const password = 'QA-only-submitted-password144';

  section('144 remote errors redact password/token; malformed success never replaces saved credentials');
  upstream = { status: 401, body: { ok: false, error: `登录失败：${password} / QA-only-failed-token144`, token: 'QA-only-failed-token144' } };
  response = await req({ loginId: 'alice', password });
  eq(response.status, 502, 'upstream authentication rejection remains market error');
  ok(!JSON.stringify(response.data).includes(password), 'upstream error cannot return submitted password');
  ok(!JSON.stringify(response.data).includes('QA-only-failed-token144'), 'upstream error cannot return remote token');
  ok(String(response.data.error).includes('登录失败'), 'non-secret remote failure description remains visible');
  eq(fs.readFileSync(accountFile, 'utf8'), savedBefore, 'authentication rejection preserves saved credentials');
  upstream = { body: validResponse };
  // Transport errors must have the same credential redaction as JSON error bodies.
  upstream = { body: validResponse, get status() { throw new Error(`transport failed for ${password}`); } };
  response = await req({ loginId: 'alice', password });
  eq(response.status, 502, 'transport exception remains market error');
  ok(!JSON.stringify(response.data).includes(password), 'transport exception cannot return submitted password');
  eq(fs.readFileSync(accountFile, 'utf8'), savedBefore, 'transport exception preserves saved credentials');
  for (const [name, payload] of [
    ['object token', { ok: true, token: { value: 'not-a-token' }, account: { username: 'broken-token' } }],
    ['blank token', { ok: true, token: '   ', account: { username: 'blank-token' } }],
    ['truthy ok', { ok: 'true', token: 'invalid-ok-token', account: { username: 'invalid-ok' } }],
    ['missing account', { ok: true, token: 'missing-account-token' }],
  ]) {
    upstream = { body: payload };
    response = await req({ loginId: 'alice', password });
    eq(response.status, 502, `${name} response rejected`);
    eq(fs.readFileSync(accountFile, 'utf8'), savedBefore, `${name} response preserves exact credential file`);
  }

  section('144 malformed local inputs do not contact upstream or overwrite accounts');
  upstream = { body: validResponse };
  for (const body of [
    { loginId: '', password }, { loginId: { value: 'alice' }, password },
    { loginId: 'alice', password: { value: password } }, { loginId: 'alice', password: '' },
    { loginId: 'alice', password, mode: 'unexpected' },
    { loginId: 'alice', password, mode: 'register', displayName: '' },
  ]) {
    const before = calls.length;
    response = await req(body);
    eq(response.status, 400, 'invalid input rejected locally');
    eq(calls.length, before, 'invalid input sends no upstream request');
    eq(fs.readFileSync(accountFile, 'utf8'), savedBefore, 'invalid input preserves credentials');
  }
  section('144 authentication redirects do not replay password bodies');
  upstream = { status: 307, headers: { location: `${COMMUNITY_BASE_URL}/auth/redirect-target` }, body: { ok: false, error: '认证地址发生重定向' } };
  const beforeRedirect = calls.length;
  response = await req({ loginId: 'alice', password });
  eq(response.status, 502, 'redirect is reported as upstream error');
  eq(calls.length - beforeRedirect, 1, 'authentication credentials are not replayed to redirect target');
  eq(fs.readFileSync(accountFile, 'utf8'), savedBefore, 'redirect preserves saved credentials');

  upstream = { body: validResponse };
  response = await req({ loginId: 'alice', password, captchaVerifyParam: 'unused-proof144' });
  eq(response.status, 200, 'ordinary login still succeeds after failures');
  eq(calls.at(-1).url, `${COMMUNITY_BASE_URL}/auth/login`, 'login endpoint');
  eq(JSON.parse(calls.at(-1).init.body), { loginId: 'alice', password }, 'login sends no invented proof field');
  ok(!JSON.stringify(response.data).includes(validResponse.token), 'login response still excludes token');
} finally {
  await http.close();
  for (const dir of [dataDir, appRoot, staticDir]) fs.rmSync(dir, { recursive: true, force: true });
}
summary('144-market-auth-boundaries');

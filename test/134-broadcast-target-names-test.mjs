// Real provider normalization -> console HTTP -> Chromium iframe/RPC. No live QQ.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';
import { createOneBotProvider } from '../bundled/transport-onebot/provider.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-broadcast134-'));
// The real imported default kernel/UI is under test; no installed extension
// belongs in this regression's temporary application root.
const appRoot = path.join(dataDir, 'application'); fs.mkdirSync(appRoot);
fs.cpSync(path.resolve(import.meta.dirname, '../ui'), path.join(appRoot, 'ui'), { recursive: true });
for (const directory of ['bundled', 'plugins', 'skills']) fs.mkdirSync(path.join(appRoot, directory));
let isolatedOutbound = 0, dnsCalls = 0; const browserOutbound = [], ownedOrigins = new Set();
const nativeFetch = globalThis.fetch, nativeLookup = dns.lookup;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (ownedOrigins.has(url.origin)) return nativeFetch(input, options);
  isolatedOutbound++; throw new Error('QA134 external fetch disabled');
};
dns.lookup = async () => { dnsCalls++; throw new Error('QA134 external DNS disabled'); };
const routeOwnedPage = (page, base, onBlocked = () => {}) => page.route('**/*', route => {
  const url = route.request().url();
  if (new URL(url).origin === new URL(base).origin) return route.continue();
  browserOutbound.push(url); onBlocked(url); return route.abort();
});
function assertOffline() {
  assert.equal(isolatedOutbound, 0, 'no external Node fetch was attempted');
  assert.equal(dnsCalls, 0, 'no external DNS was attempted');
  assert.deepEqual(browserOutbound, [], 'all browser pages used only their owned console origin');
}

const token = 'synthetic-broadcast134', calls = [], errors = [];
class LocalActionClient {
  selfId = '999'; connected = false;
  async connect() { this.connected = true; }
  async close() { this.connected = false; }
  async call(action, params) {
    calls.push({ action, params });
    const data = action === 'get_group_list' ? [
      { group_id: 10001, group_name: 'QA · 本地功能验收群' },
      { group_id: 10002, group_name: 'QA · 第二测试群' },
      { group_id: 'abc', group_name: '非法群 abc' },
      { group_id: '10001/extra', group_name: '非法路径群' },
    ] : action === 'get_friend_list' ? [
      { user_id: 20001, remark: '合成私聊联系人', nickname: '被备注覆盖的昵称' },
      { user_id: 20002, nickname: '合成成员' },
      { user_id: '-1', nickname: '非法好友负数' },
      { user_id: '1.5', nickname: '非法好友小数' },
    ] : action === 'send_group_msg' || action === 'send_private_msg' ? { message_id: 134000 + calls.length } : null;
    assert.notEqual(data, null, `Unexpected protocol action: ${action}`);
    return { status: 'ok', retcode: 0, data };
  }
}
const transport = createOneBotProvider({ cfg: () => ({}), clientFactory: LocalActionClient });
const kernel = createKernel({ appRoot, env: { QQ_AGENT_DATA_DIR: dataDir, QQ_AGENT_PORT: '0', QQ_AGENT_MIGRATE_FROM: path.join(dataDir, 'absent') },
  transport, priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },
  communityMarket: { syncGlobalBlocklist: async () => ({ ok: true, ids: [] }) },
  fetchImpl: async () => { isolatedOutbound++; throw new Error('134 forbids external HTTP'); },
});
kernel.config.update({ server: { token }, telemetry: { enabled: false }, proactive: { enabled: false },
  api: { baseUrl: 'http://127.0.0.1:9/v1', model: 'synthetic-broadcast134' },
  allow: { groups: ['10001', '10002', '10003', '10004', '10005'], private: ['20001', '20002', '20003', '20004', '20005', '20006'] },
});
kernel.log.setLevel('error'); kernel.loader.startWatchers = () => {};
const sends = () => calls.filter(call => call.action === 'send_group_msg' || call.action === 'send_private_msg');
let browser;
try {
  const port = await kernel.start(), base = `http://127.0.0.1:${port}`; ownedOrigins.add(base);
  assert.notEqual(port, 15967); assert.deepEqual(kernel.loader.listEntries(), []);
  const api = async route => {
    const response = await fetch(base + route, { headers: { 'x-console-token': token } });
    assert.equal(response.status, 200); return response.json();
  };
  const groups = (await api('/api/onebot/groups')).groups, friends = (await api('/api/onebot/friends')).friends;
  assert.deepEqual(groups.slice(0, 2), [{ id: '10001', name: 'QA · 本地功能验收群' }, { id: '10002', name: 'QA · 第二测试群' }]);
  assert.deepEqual(friends.slice(0, 2), [{ id: '20001', name: '合成私聊联系人' }, { id: '20002', name: '合成成员' }]);
  assert.equal(groups[0].group_name, undefined, 'The production console DTO is normalized, not a raw OneBot row');
  assert.equal(friends[0].remark, undefined);

  const playwright = createRequire(import.meta.url)('playwright-core');
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  const versions = fs.readdirSync(cache).filter(v => /^chromium-\d+$/.test(v)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? versions.map(v => path.join(cache, v, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file));
  assert.ok(executablePath, '134 requires an already installed local Chromium');
  browser = await playwright.chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await routeOwnedPage(page, base);
  page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?token=${token}`);
  const frame = page.frameLocator('#panel-host iframe');
  await frame.locator('#sessions-panel[data-ready=true]').waitFor();
  await frame.locator('#broadcast').click();
  const dialog = frame.locator('dialog:not(.confirm-panel)'), confirm = frame.locator('dialog.confirm-panel');
  await dialog.locator('textarea').waitFor();
  console.log('· Normalized HTTP target names reach the actual broadcast labels; malformed ids are excluded');
  assert.deepEqual(await dialog.locator('label').allTextContents(), [
    'QA · 本地功能验收群 · group_10001', 'QA · 第二测试群 · group_10002',
    '合成私聊联系人 · private_20001', '合成成员 · private_20002',
  ]);
  assert.deepEqual(await dialog.locator('input[type=checkbox]').evaluateAll(inputs => inputs.map(input => input.value)), ['group_10001', 'group_10002', 'private_20001', 'private_20002']);
  const send = dialog.getByRole('button', { name: '发送到选中目标', exact: true });
  console.log('· Empty message/no target validation and cancelled confirmation make no protocol send');
  await send.click(); await dialog.locator('p').filter({ hasText: '请填写消息并选择目标' }).waitFor();
  assert.equal(await confirm.count(), 0); assert.equal(sends().length, 0);
  await dialog.locator('textarea').fill('  本地群发验收  '); await send.click();
  assert.equal(await confirm.count(), 0); assert.equal(sends().length, 0);
  await dialog.locator('input[value=group_10002]').check();
  await dialog.locator('textarea').fill('   '); await send.click();
  assert.equal(await confirm.count(), 0); assert.equal(sends().length, 0);
  await dialog.locator('textarea').fill('  本地群发验收  '); await send.click();
  await confirm.getByRole('button', { name: '取消', exact: true }).click();
  await confirm.waitFor({ state: 'detached' });
  assert.equal(await dialog.locator('input[value=group_10002]').isChecked(), true);
  assert.equal(await dialog.locator('textarea').inputValue(), '  本地群发验收  ');
  assert.equal(sends().length, 0);
  await send.click(); await confirm.getByRole('button', { name: '确认', exact: true }).click();
  await dialog.locator('p').filter({ hasText: '已发送 1/1' }).waitFor();
  assert.deepEqual(sends().map(call => call.params), [{ group_id: 10002, message: [{ type: 'text', data: { text: '本地群发验收' } }] }]);
  assert.equal(await dialog.locator('input[value=group_10002]').isChecked(), true);
  assert.equal(kernel.store.recent('group:10002', 10).at(-1).text, '本地群发验收');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click(); await dialog.waitFor({ state: 'detached' });

  console.log('· Legacy raw fields and id fallback remain usable; normalized name takes precedence');
  // A legacy provider can still return raw rows. Keep the real console route and send provider.
  transport.actions.listGroups = async () => [
    { group_id: '10003', group_name: '旧格式群名' },
    { id: '10004', name: '标准群名', group_name: '过时群名' },
    { id: '10005' }, { id: 'bad', group_name: '非法旧群' },
  ];
  transport.actions.listFriends = async () => [
    { user_id: '20003', remark: '旧格式备注', nickname: '过时昵称' },
    { user_id: '20004', nickname: '旧格式昵称' },
    { id: '20005', name: '标准好友名', remark: '过时备注' },
    { id: '20006' }, { id: '../20007', nickname: '非法旧好友' },
  ];
  await frame.locator('#broadcast').click(); await dialog.locator('textarea').waitFor();
  assert.deepEqual(await dialog.locator('label').allTextContents(), [
    '旧格式群名 · group_10003', '标准群名 · group_10004', '10005 · group_10005',
    '旧格式备注 · private_20003', '旧格式昵称 · private_20004', '标准好友名 · private_20005', '20006 · private_20006',
  ]);
  assert.ok(await dialog.locator('input[type=checkbox]').evaluateAll(inputs => inputs.every(input => /^(group|private)_\d+$/.test(input.value))));
  await dialog.locator('textarea').fill('旧格式兼容验收');
  await dialog.locator('input[value=group_10003]').check(); await dialog.locator('input[value=private_20003]').check();
  await send.click(); await confirm.locator('p').filter({ hasText: '确认向 2 个目标发送消息？' }).waitFor();
  await confirm.getByRole('button', { name: '确认', exact: true }).click();
  await dialog.locator('p').filter({ hasText: '已发送 2/2' }).waitFor();
  assert.deepEqual(sends().slice(1).map(call => call.params), [
    { group_id: 10003, message: [{ type: 'text', data: { text: '旧格式兼容验收' } }] },
    { user_id: 20003, message: [{ type: 'text', data: { text: '旧格式兼容验收' } }] },
  ]);
  assert.deepEqual(errors, []);
  console.log('✓ 134 normalized names, legacy fallback, target validation, selected state, confirmation and real isolated sends passed');
} finally {
  await browser?.close(); await kernel.stop();
  assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(dataDir).startsWith('qqa-broadcast134-'));
  globalThis.fetch = nativeFetch; dns.lookup = nativeLookup;
  fs.rmSync(dataDir, { recursive: true, force: true });
  assertOffline(); assert.deepEqual(kernel.loader.listEntries(), []);
}

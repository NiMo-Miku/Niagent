// Supplemental HEADLESS evidence. This never controls the headed QA app or its data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { startHeadedQaFixture } from '../scripts/headed-qa-fixture.mjs';
import { runSecurityEvidence } from '../scripts/qa-fixtures/runtime/security-evidence.mjs';
import { createKernel } from '../src/kernel/kernel.js';
import { buildToolAvailabilityContext } from '../src/kernel/tools.js';
import { safeFetch } from '../src/kernel/safe-fetch.js';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, ms = 12000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = await predicate(); if (value) return value; await sleep(20); }
  assert.fail(`Timed out: ${label}`);
};
const evidence = [], toolCalls = [];
function brief(value, depth = 0) {
  if (depth > 7) return '[nested]';
  if (typeof value === 'string') return value.startsWith('data:') ? `[${value.slice(0, value.indexOf(',') + 1)} chars=${value.length}]` : value.slice(0, 700);
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => brief(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key, item]) => !/apiKey|dshKey|password|secret|authorization|^token$|accessToken/i.test(key) && typeof item !== 'function').map(([key, item]) => [key, brief(item, depth + 1)]));
  return value;
}
async function verify(t, id, title, fn) {
  await t.test(`${id} ${title}`, async () => {
    const startedAt = Date.now();
    try { const detail = await fn(); evidence.push({ id, title, status: detail?.deviation ? 'partial' : 'passed', startedAt, elapsedMs: Date.now() - startedAt, detail: brief(detail) }); }
    catch (error) { evidence.push({ id, title, status: 'failed', startedAt, elapsedMs: Date.now() - startedAt, error: String(error.stack || error) }); throw error; }
  });
}

test('94 independent local headless tool, API, wake, cancellation and provider evidence', async (t) => {
  const baseDir = path.join(workspace, '.qa-local', `runtime-94-${process.pid}-${Date.now()}`);
  const fixture = await startHeadedQaFixture({ baseDir });
  let kernel, webBase;
  const replacementTransports = [];
  const webRequests = [];
  const web = http.createServer(async (req, res) => {
    const url = new URL(req.url, webBase);
    const row = { path: url.pathname, ts: Date.now() }; webRequests.push(row);
    if (url.pathname.startsWith('/bad-v1/')) { for await (const part of req) void part; res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'QA94 local controlled invalid request' } })); }
    if (url.pathname === '/slow') { await sleep(500); res.writeHead(200); return res.end('QA94 local slow body'); }
    if (url.pathname === '/images/search') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(`{"murl":"${fixture.imageUrl}"}`); }
    if (url.pathname === '/search') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(`<li class="b_algo"><h2><a href="${webBase}/article">QA94 local result</a></h2><p>QA94 real default Bing parser.</p></li>`); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html><body><h1>QA94 local article</h1><script>bad()</script><p>${'bounded text '.repeat(2200)}</p><img src="${fixture.imageUrl}"></body></html>`);
  });
  await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve)); webBase = `http://127.0.0.1:${web.address().port}`;
  const logicalWebBase = 'http://qa94-web.invalid';
  // Only this logical host uses injected DNS/socket routing. Production safeFetch
  // still validates every hop/options; sockets only connect to the local web server.
  const publicHttpFixture = async (input, init = {}) => {
    const logical = new URL(input);
    const routeInjected = logical.origin === logicalWebBase;
    const dto = await safeFetch(input, { ...init, expectBinary: true, followRedirects: init.redirect !== 'manual', ...(routeInjected ? {
      dnsLookup: async (host) => { assert.equal(host, 'qa94-web.invalid'); return [{ address: '8.8.8.8', family: 4 }]; },
      fetchImpl: async (target, options) => {
        const parsed = new URL(target); assert.equal(parsed.origin, logicalWebBase);
        const local = new URL(webBase); local.pathname = parsed.pathname; local.search = parsed.search;
        return fetch(local, { ...options, redirect: 'manual' });
      },
    } : {}) });
    const response = new Response(dto.body, { status: dto.status, headers: dto.headers });
    Object.defineProperties(response, { url: { value: dto.finalUrl }, truncated: { value: dto.truncated }, redirected: { value: dto.hops.length > 1 } });
    return response;
  };
  const reportPath = path.join(workspace, '.qa-local', 'runtime-evidence-94.json');
  t.after(async () => {
    try {
      await kernel?.stop();
      for (const instance of replacementTransports) assert.equal(instance.stopCount, 1, 'each real replacement generation stopped exactly once');
      assert.equal(kernel.scheduler.count(), 0); assert.equal(fs.existsSync(path.join(fixture.dataDir, 'qq-agent.lock')), false);
    }
    finally {
      await fixture.close(); await new Promise((resolve) => web.close(resolve));
      fs.writeFileSync(reportPath, JSON.stringify({ version: 1, mode: 'headless', synthetic: true, testedAt: new Date().toISOString(), baseDir, appRoot: fixture.appRoot, dataDir: fixture.dataDir, fixtureBaseUrl: fixture.baseUrl, webBase, rows: evidence, toolCalls, onebotActions: brief(fixture.state.actions), modelRequests: fixture.state.modelRequests.map(({ ts, body, status, clientDisconnected }) => ({ ts, model: body.model, messageRoles: body.messages?.map((message) => message.role), status, clientDisconnected })), webRequests, cleanup: { kernelLockReleased: !fs.existsSync(path.join(fixture.dataDir, 'qq-agent.lock')), timers: kernel?.scheduler.count() } }, null, 2));
      const target = path.resolve(baseDir);
      assert.ok(target.startsWith(path.resolve(workspace, '.qa-local') + path.sep)); assert.ok(path.basename(target).startsWith('runtime-94-'));
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
  kernel = createKernel({ appRoot: fixture.appRoot,
    fetchImpl: publicHttpFixture,
    env: { QQ_AGENT_DATA_DIR: fixture.dataDir, QQ_AGENT_PORT: String(fixture.consolePort), QQ_AGENT_PROFILE: '99', QQ_AGENT_MIGRATE_FROM: path.join(baseDir, 'absent-migration-source') },
    priceUpdates: { resolve: () => null, refresh: async () => ({ ok: false, remote: false, synthetic: true }), updateCheck: async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },
  });
  kernel.config.update({ tools: { crossChatSend: true }, webSearch: { provider: 'bing', searchUrl: `${webBase}/search` }, api: { videoMode: 'native', video: false }, skills: { hello: { enabled: true } }, send: { dedupeWindowMs: 0, minGapMs: 10, maxGapMs: 10, byLengthMs: 0 } });
  kernel.log.setLevel('error'); kernel.loader.startWatchers = () => {};
  await kernel.start(); await kernel.services.idle();
  await until(() => fixture.wss.clients.size === 1 && kernel.transport.status().selfId === '900001', 'actual default OneBot connection');
  const session = kernel.sessions.create('group:10001', { trigger: '94 privileged headless registry fixture' });
  const controller = new AbortController();
  const execCtx = { chatKey: session.chatKey, session, cfg: kernel.config.get(), signal: controller.signal, senderId: '20001' };
  const api = async (method, route, body) => {
    const response = await fetch(fixture.consoleUrl + route, { method, headers: { 'x-console-token': fixture.token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  async function invoke(id, args = {}, context = execCtx, allowBusinessFailure = false) {
    const result = await kernel.registry.invoke(id, args, { execCtx: context });
    toolCalls.push({ id, ownerId: kernel.registry.get(id)?.ownerId, args: brief(args), result: brief(result) });
    if (allowBusinessFailure && !result.ok) return { ok: false, error: result.error };
    assert.equal(result.ok, true, `${id}: ${result.error}`);
    if (!allowBusinessFailure) assert.equal(result.result?.ok, true, `${id}: ${JSON.stringify(brief(result.result))}`);
    return result.result;
  }
  const registered = kernel.registry.list().map((tool) => tool.id).sort();
  assert.equal(registered.length, 28, '27 default business tools plus explicitly enabled Hello SDK sample');
  const imageMessage = kernel.store.appendIncoming('group:10001', { mid: 80101, senderId: '20001', senderName: 'QA', text: 'QA94 local image', media: [{ kind: 'image', file: 'qa-image', url: fixture.imageUrl }] });
  kernel.store.appendIncoming('group:10001', { mid: 80102, senderId: '20001', senderName: 'QA', text: 'QA94 local video', media: [{ kind: 'video', file: 'qa-video', url: fixture.videoUrl }] });
  kernel.store.appendIncoming('group:10001', { mid: 80103, senderId: '20002', senderName: 'QA2', text: '[合并转发]', media: [{ kind: 'forward', id: 'qa-forward-1' }] });
  kernel.store.markAllRead('group:10001');
  let collectedId, reminderId;

  await verify(t, 'B01', 'send_message string/array/texts, @ and quote actual OneBot segments', async () => {
    const begin = fixture.state.actions.length;
    await invoke('send_message', { messages: ['QA94 first', 'QA94 second'], atUserId: '20001', replyToMessageId: '5001' });
    await invoke('send_message', { texts: 'QA94 legacy texts' });
    const bad = await invoke('send_message', { messages: '' }, execCtx, true); assert.equal(bad.ok, false);
    const sends = fixture.state.actions.slice(begin).filter((action) => action.action === 'send_group_msg');
    assert.equal(sends.length, 3); assert.equal(session.sent.length, 3);
    const atCounts = sends.slice(0, 2).map((item) => item.params.message.filter((seg) => seg.type === 'at').length);
    const quoteCounts = sends.slice(0, 2).map((item) => item.params.message.filter((seg) => seg.type === 'reply').length);
    assert.deepEqual(atCounts, [1, 0]); assert.deepEqual(quoteCounts, [1, 0]);
    return { delivered: 3, emptyRejected: true, atCounts, quoteCounts, repairedFrom: 'Before repair: both physical messages contained reply (see runtime-evidence-94-before-repair.json).' };
  });
  await verify(t, 'B02', 'send_to real target and rejection gates', async () => {
    kernel.config.update({ tools: { crossChatSend: false } });
    assert.equal(kernel.registry.availability('send_to', buildToolAvailabilityContext(kernel.config.get(), kernel.loader)).ok, false);
    kernel.config.update({ tools: { crossChatSend: true } });
    const denied = await invoke('send_to', { targetChatKey: 'group:99999', messages: 'must not send' }, execCtx, true); assert.equal(denied.ok, false);
    const same = await invoke('send_to', { targetChatKey: execCtx.chatKey, messages: 'must not send' }, execCtx, true); assert.equal(same.ok, false);
    await invoke('send_to', { targetChatKey: 'private:20001', messages: 'QA94 cross-chat local send' });
    const action = fixture.state.actions.at(-1); assert.equal(action.action, 'send_private_msg'); assert.equal(action.params.user_id, 20001);
    return { disabledAvailability: true, absentWhitelistRejected: true, sameChatRejected: true, actualTarget: action.params.user_id };
  });
  await verify(t, 'B04', 'send_poke group and private actual target', async () => {
    const bad = await invoke('send_poke', {}, execCtx, true); assert.equal(bad.ok, false);
    await invoke('send_poke', { targetUserId: '20001' }); assert.equal(fixture.state.actions.at(-1).params.user_id, 20001);
    await invoke('send_poke', {}, { ...execCtx, chatKey: 'private:20001' });
    const actual = fixture.state.actions.at(-1).params.user_id;
    assert.equal(actual, 20001);
    return { groupMissingRejected: true, groupTarget: 20001, actualPrivateTarget: actual, repairedFrom: 'Before repair: omitted private target produced user_id=0.' };
  });
  await verify(t, 'B05', 'list_stickers query and bounds from real store', async () => {
    const result = await invoke('list_stickers', { query: 'QA', limit: 1 }); assert.equal(result.result.items.length, 1);
    return { id: result.result.items[0].id, count: 1 };
  });
  await verify(t, 'B06', 'get_sticker_image real image parts and unknown id', async () => {
    const good = await invoke('get_sticker_image', { stickerId: 'qa-local-image' }); assert.match(good.mediaParts[0].image_url.url, /^data:image\/png;base64,/);
    const bad = await invoke('get_sticker_image', { stickerId: 'missing' }, execCtx, true); assert.equal(bad.ok, false);
    return { imageParts: good.mediaParts.length, unknownRejected: true };
  });
  await verify(t, 'B07', 'account collection is unavailable without an independent capability plugin', async () => {
    const availability = kernel.registry.availability('collect_sticker');
    assert.equal(availability.ok, false); assert.equal(availability.code, 'CAPABILITY_MISSING');
    collectedId = 'qa-local-image';
    const listed = await invoke('list_stickers', { query: 'QA' });
    assert.ok(listed.result.items.some(item => item.id === collectedId));
    return { accountCollectionAvailable: false, localLibraryAvailable: true };
  });
  await verify(t, 'B03', 'send_sticker actual single image segment and usage', async () => {
    assert.ok(collectedId); await invoke('send_sticker', { stickerId: collectedId });
    const action = fixture.state.actions.at(-1); assert.equal(action.action, 'send_group_msg'); assert.deepEqual(action.params.message.map((seg) => seg.type), ['image']);
    const listed = await invoke('list_stickers', {}); assert.equal(listed.result.items.find((item) => item.id === collectedId).useCount, 1);
    return { segmentTypes: ['image'], useCount: 1 };
  });
  await verify(t, 'B08', 'get_recent_messages actual offset and beforeId window', async () => {
    const ctx = { ...execCtx, session: { ...session, pastStateCount: 2 } };
    const result = await invoke('get_recent_messages', { limit: 2, offset: 1 }, ctx);
    const expected = kernel.store.recent(execCtx.chatKey, 5).slice(0, 2).map((item) => item.mid ?? item.id);
    assert.deepEqual(result.result.messages.map((item) => item.messageId), expected);
    const before = await invoke('get_recent_messages', { beforeId: imageMessage.id, limit: 100 }); assert.ok(before.result.messages.every((item) => Number(item.messageId) !== 80101));
    return { limit: 2, skipped: 3, actualMessageIds: expected, beforeBoundaryExcluded: true };
  });
  await verify(t, 'B09', 'read_forward actual protocol action and idempotent archive cache', async () => {
    const count = fixture.state.actions.filter((action) => action.action === 'get_forward_msg').length;
    const first = await invoke('read_forward', { messageId: 80103 }); assert.match(first.result.text, /QA 合成转发内容/);
    const second = await invoke('read_forward', { messageId: 80103 }); assert.match(second.result.note, /存档/);
    assert.equal(fixture.state.actions.filter((action) => action.action === 'get_forward_msg').length, count + 1);
    return { count: first.result.count, protocolCalls: 1, archived: true };
  });
  await verify(t, 'B10', 'get_active_members actual history sorted by activity', async () => {
    const result = await invoke('get_active_members', { days: 7, limit: 2 }); const rows = result.result.members;
    assert.equal(rows.length, 2); assert.ok(rows[0].recentCount >= rows[1].recentCount); assert.ok(rows.every((row) => /^\d+$/.test(row.userId)));
    return { total: result.result.total, members: rows };
  });
  await verify(t, 'B11', 'get_chats actual three distinct local chats', async () => {
    const result = await invoke('get_chats', { limit: 20 }); assert.ok(result.result.chats.some((chat) => chat.chatKey === 'private:20001')); assert.ok(result.result.count >= 3);
    return { chatKeys: result.result.chats.map((chat) => chat.chatKey) };
  });
  await verify(t, 'B12', 'get_message_detail actual image record and unknown id', async () => {
    const result = await invoke('get_message_detail', { messageId: 80101 }); assert.equal(result.result.media[0].kind, 'image');
    const missing = await invoke('get_message_detail', { messageId: 999999 }, execCtx, true); assert.equal(missing.ok, false);
    return { mid: result.result.mid, kind: result.result.media[0].kind, missingRejected: true };
  });
  await verify(t, 'B13', 'get_message_images real reader mediaParts', async () => {
    const result = await invoke('get_message_images', { messageId: 80101 }); assert.match(result.mediaParts[0].image_url.url, /^data:image\/png;base64,/);
    return { parts: result.mediaParts.length, dataUrlCharacters: result.mediaParts[0].image_url.url.length };
  });
  await verify(t, 'B14', 'read_video actual local MP4 and native video parts', async () => {
    const result = await invoke('read_video', { messageId: 80102, frames: 2 }); assert.equal(result.result.route, 'native'); assert.equal(result.mediaParts[0].type, 'video_url'); assert.equal(result.mediaParts[0].video_url.url, fixture.videoUrl);
    return { route: result.result.route, meta: result.result.meta, videoParts: result.mediaParts.length, framesNotClaimed: true };
  });
  await verify(t, 'B15', 'memory_append persisted fact, dedupe, invalid QQ rejection', async () => {
    const result = await invoke('memory_append', { category: 'memberImpression', userId: '20001', target: 'QA 小林', content: 'QA94 唯一受控印象。' }); assert.equal(result.result.saved, true);
    const again = await invoke('memory_append', { category: 'memberImpression', userId: '20001', content: 'QA94 唯一受控印象。' }); assert.equal(again.result.deduped, true);
    const bad = await invoke('memory_append', { category: 'memberImpression', userId: 'not-qq', content: 'must not save' }, execCtx, true); assert.equal(bad.ok, false);
    assert.ok(kernel.memory.query(execCtx.chatKey, { userId: '20001' })[0].impressions.some((item) => item.content === 'QA94 唯一受控印象。'));
    return { saved: true, deduped: true, invalidQQRejected: true };
  });
  await verify(t, 'B16', 'memory_query current chat and exact QQ filtering', async () => {
    const result = await invoke('memory_query', { userId: '20001' }); assert.ok(result.result.memberImpression.every((item) => item.userId === '20001')); assert.ok(result.result.count >= 3);
    return { count: result.result.count, userIds: [...new Set(result.result.memberImpression.map((item) => item.userId))] };
  });
  await verify(t, 'B17', 'memory_remove exact original text preserves other facts', async () => {
    const result = await invoke('memory_remove', { userId: '20001', content: 'QA94 唯一受控印象。' });
    const after = kernel.memory.query(execCtx.chatKey, { userId: '20001' })[0].impressions; assert.equal(after.length, 2);
    assert.ok(!after.some((item) => item.content === 'QA94 唯一受控印象。'));
    assert.equal(result.result.removed, 1);
    return { actualRemoved: 1, reportedRemoved: result.result.removed, originalFactsRemaining: 2, repairedFrom: 'Before repair: deleted one impression but returned removed=0.' };
  });
  await verify(t, 'B18', 'web_search real default parser and controlled HTTP results', async () => {
    const result = await invoke('web_search', { query: 'QA94 local search' }); assert.equal(result.result.results.length, 1); assert.equal(result.result.results[0].url, webBase + '/article');
    return { result: result.result.results[0], liveSearchEngine: false };
  });
  await verify(t, 'B19', 'web_fetch real registry/conversion and local HTTP with injected public DNS/socket route', async () => {
    const result = await invoke('web_fetch', { url: `${logicalWebBase}/article` }); assert.equal(result.result.content.length, 20000); assert.equal(result.result.truncated, true); assert.ok(!result.result.content.includes('bad()'));
    kernel.config.update({ security: { allowPrivateImageHosts: false } }); const count = webRequests.length;
    try {
      const denied = await invoke('web_fetch', { url: `${webBase}/article` }, execCtx, true); assert.equal(denied.ok, false); assert.match(denied.error, /内网/); assert.equal(webRequests.length, count);
    } finally { kernel.config.update({ security: { allowPrivateImageHosts: true } }); }
    const countEnabled = webRequests.length;
    const deniedEnabled = await invoke('web_fetch', { url: `${webBase}/article` }, execCtx, true); assert.equal(deniedEnabled.ok, false); assert.match(deniedEnabled.error, /内网/); assert.equal(webRequests.length, countEnabled);
    return { characters: result.result.content.length, truncated: true, images: result.result.images.length, defaultPrivateBlockedBeforeRequest: true, imageExceptionCannotAllowPrivateWebpage: true, publicDnsAndSocketRouteInjected: true, actualSocketTarget: webBase, noPublicConnection: true, repairedFrom: 'Before repair: image-only allowPrivateImageHosts also permitted web_fetch to read private HTML.' };
  });
  await verify(t, 'B20', 'search_images actual controlled Bing HTML and no protocol send', async () => {
    const count = fixture.state.actions.filter((action) => action.action.startsWith('send_')).length;
    const result = await invoke('search_images', { query: 'QA94 image', limit: 1 }); assert.equal(result.result.results[0].url, fixture.imageUrl);
    assert.equal(fixture.state.actions.filter((action) => action.action.startsWith('send_')).length, count);
    return { results: 1, sent: 0, liveImageSearch: false };
  });
  await verify(t, 'B21', 'send_image real preview then protocol image and preview gate', async () => {
    const blocked = await invoke('send_image', { url: fixture.imageUrl }, execCtx, true); assert.equal(blocked.ok, false);
    const preview = await invoke('send_image', { url: fixture.imageUrl, preview: true }); assert.equal(preview.mediaParts.length, 1);
    const sent = await invoke('send_image', { url: fixture.imageUrl }); assert.equal(sent.result.sent.length, 1); assert.ok(fixture.state.actions.at(-1).params.message.some((seg) => seg.type === 'image'));
    return { unpreviewedRejected: true, previews: session.sendImageState.previews, imageSends: session.sendImageState.sent };
  });
  await verify(t, 'B22', 'actual default send queue maps multiple images and video segments', async () => {
    const images = await kernel.send.sendSegments(execCtx.chatKey, [{ type: 'image', url: fixture.imageUrl }, { type: 'image', url: fixture.imageUrl }]);
    assert.equal(images.ok, true); assert.equal(fixture.state.actions.at(-1).params.message.filter((part) => part.type === 'image').length, 2);
    const video = await kernel.send.sendSegments(execCtx.chatKey, [{ type: 'video', url: fixture.videoUrl }]);
    const actual = fixture.state.actions.at(-1).params.message;
    assert.equal(video.ok, true); assert.deepEqual(actual.map((part) => part.type), ['video']); assert.equal(actual[0].data.file, fixture.videoUrl);
    return { imageSegments: 2, videoReportedSuccess: video.ok, videoActualSegmentTypes: ['video'], repairedFrom: 'Before repair: video mapping sent empty message and reported success.' };
  });
  await verify(t, 'B24', 'set_reminder actual persisted future schedule and invalid input', async () => {
    const result = await invoke('set_reminder', { text: 'QA94 scheduled reminder', delayMinutes: 60 }); reminderId = result.result.id;
    const bad = await invoke('set_reminder', { text: 'bad', delayMinutes: 0 }, execCtx, true); assert.equal(bad.ok, false);
    return { reminderId, dueInFuture: result.result.dueAt > Date.now(), zeroRejected: true };
  });
  await verify(t, 'B25', 'list_reminders current chat actual persisted id', async () => {
    const result = await invoke('list_reminders', {}); assert.ok(result.result.reminders.some((line) => line.includes(reminderId)));
    return { pending: result.result.reminders.length, containsCreated: true };
  });
  await verify(t, 'B26', 'cancel_reminder actual delete and repeat failure', async () => {
    const result = await invoke('cancel_reminder', { id: reminderId }); assert.equal(result.result.cancelled, true);
    const again = await invoke('cancel_reminder', { id: reminderId }, execCtx, true); assert.equal(again.ok, false);
    const file = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'reminders.json'), 'utf8')); assert.ok(!file.reminders.some((item) => item.id === reminderId));
    return { persistedRemoval: true, absentRejected: true };
  });
  await verify(t, 'B27', 'check_holiday real local date pure function result', async () => {
    const result = await invoke('check_holiday', { days: 7 }); assert.ok(result.result && typeof result.result === 'object');
    return { response: result.result, officialCalendarAuditNotClaimed: true };
  });
  await verify(t, 'B28', 'report_feedback actual local bus and session only', async () => {
    let received; const unbind = kernel.bus.on('feedback', (payload) => { received = payload; });
    const result = await invoke('report_feedback', { level: 'warning', message: 'QA94 local feedback' }); unbind?.();
    assert.equal(result.result.reported, true); assert.equal(received.message, 'QA94 local feedback'); assert.equal(session.feedbacks.at(-1).level, 'warning');
    return { busDelivered: true, savedInSession: true, externalFeedback: false };
  });
  await verify(t, 'B23', 'finish actual session reason and activeTopic', async () => {
    const result = await invoke('finish', { reason: 'QA94 registry batch ended', activeTopic: 'QA94 local topic' }); assert.equal(result.result.finished, true); assert.equal(session.activeTopic, 'QA94 local topic');
    kernel.sessions.finish(session.id, 'done');
    return { reason: session.finishReason, activeTopic: session.activeTopic, immediateLoopTerminationCoveredByLaterWake: true };
  });
  await verify(t, 'SDK-HELLO', 'hello_say real loader, schema config and namespace counter', async () => {
    const result = await invoke('hello_say', { name: 'QA94' }); assert.equal(result.text, '你好，QA94'); assert.equal(kernel.storage.namespace('hello').get('uses'), 1);
    assert.deepEqual([...new Set(toolCalls.map((call) => call.id))].sort(), registered.filter(id => id !== 'collect_sticker'));
    return { totalRegistered: 28, uniqueActualToolsInvoked: 27, unavailableOptionalTools: ['collect_sticker'], helloExplicitlyEnabled: true };
  });

  await verify(t, 'SSRF', 'controlled native transport SSRF and cancellation boundary suite', async () => ({ rows: await runSecurityEvidence({ localUrl: webBase }) }));
  await verify(t, 'U05/U06', 'real usage HTTP running/retry deltas, zero and deletion archive', async () => {
    const first = (await api('GET', '/api/usage/stats?range=all')).body;
    const billing = kernel.sessions.create('group:10002');
    const base = { model: 'qa-chat', providerId: 'qa-local', traceVersion: 1, messages: [] };
    kernel.sessions.update(billing, { ...base, usage: { calls: 1, promptTokens: 10, completionTokens: 5, totalTokens: 15, cachedTokens: 0 } });
    let stats = (await api('GET', '/api/usage/stats?range=all')).body; assert.equal(stats.totals.totalTokens, first.totals.totalTokens + 15);
    kernel.sessions.finish(billing.id, 'error');
    kernel.sessions.update(billing, { status: 'running', usage: { calls: 2, promptTokens: 15, completionTokens: 10, totalTokens: 25, cachedTokens: 0 } });
    stats = (await api('GET', '/api/usage/stats?range=all')).body; assert.equal(stats.totals.totalTokens, first.totals.totalTokens + 25);
    kernel.sessions.finish(billing.id, 'done');
    const zero = kernel.sessions.create('group:10002'); kernel.sessions.finish(zero.id, 'noreply');
    stats = (await api('GET', '/api/usage/stats?range=all')).body; assert.equal(stats.totals.runs, first.totals.runs + 1);
    const archivedCost = stats.sessions.find((row) => row.sessionId === billing.id).cost;
    kernel.config.update({ api: { modelPrices: { 'qa-chat': { in: 100, out: 200, cached: 0.1 } } } });
    stats = (await api('GET', '/api/usage/stats?range=all')).body; assert.equal(stats.sessions.find((row) => row.sessionId === billing.id).cost, archivedCost);
    assert.equal((await api('DELETE', `/api/sessions/${billing.id}`)).status, 200);
    stats = (await api('GET', '/api/usage/stats?range=all')).body; assert.equal(stats.totals.totalTokens, first.totals.totalTokens + 25); assert.equal(stats.sessions.find((row) => row.sessionId === billing.id).cost, archivedCost);
    assert.equal(fs.existsSync(path.join(fixture.dataDir, 'sessions', `${billing.id}.json`)), false);
    return { cumulativeDelta: 25, additionalRuns: 1, zeroAdditionalRuns: 0, historicCost: archivedCost, deletionRetainsUsage: true, explicitSyntheticUsage: true };
  });

  const llmMode = (body) => fetch(`${fixture.baseUrl}/qa/llm`, { method: 'POST', body: JSON.stringify(body) });
  const newSessions = () => new Set(kernel.sessions.listSummaries().map((item) => item.id));
  const terminal = (before) => kernel.sessions.listSummaries().find((item) => !before.has(item.id) && ['done', 'noreply', 'error', 'aborted'].includes(item.status));
  await verify(t, 'R03/R05', 'real WS admission, precise @ and fixed batch countdown', async () => {
    await llmMode({ mode: 'silent', toolCall: null }); kernel.config.update({ store: { contextSliderPos: 0, keywords: [] }, wakeDelayMs: 350 });
    const requests = fixture.state.modelRequests.length;
    const denied = fixture.emit({ groupId: 99999, text: 'must be denied' }); await sleep(60); assert.equal(kernel.store.findByMid('group:99999', denied.event.message_id), null);
    const wrongAt = fixture.emit({ message: [{ type: 'at', data: { qq: '20002' } }, { type: 'text', data: { text: '@QA 小鲸鱼 same-name other QQ' } }] });
    const stored = await until(() => kernel.store.findByMid('group:10001', wrongAt.event.message_id), 'wrong-QQ stored'); assert.equal(stored.atMe, false); assert.equal(stored.read, true);
    assert.equal(fixture.state.modelRequests.length, requests);
    const before = newSessions(); const first = fixture.emit({ text: 'QA94 batch first @ bot' });
    const waiting = await until(() => kernel.sessions.listSummaries().find((s) => !before.has(s.id) && s.status === 'waiting'), 'waiting first');
    await sleep(60); const second = fixture.emit({ at: false, text: 'QA94 batch second' }); await sleep(40);
    assert.equal(kernel.sessions.peek(waiting.id).waitUntil, waiting.waitUntil);
    const ended = await until(() => terminal(before), 'batch terminal'); assert.equal(ended.id, waiting.id);
    const full = kernel.sessions.get(ended.id); assert.ok(full.triggerEntryIds.includes(kernel.store.findByMid('group:10001', first.event.message_id).id)); assert.ok(full.triggerEntryIds.includes(kernel.store.findByMid('group:10001', second.event.message_id).id));
    assert.equal(fixture.state.modelRequests.length, requests + 1);
    return { excludedChatNotStored: true, atOtherQQDoesNotWake: true, countdownUnchanged: true, triggerCount: full.triggerEntryIds.length, actualRequests: 1 };
  });
  await verify(t, 'R05-DICE', 'actual WS tier 3 rejection and success each roll only once', async () => {
    kernel.config.update({ store: { contextSliderPos: 55, keywords: [] } });
    const native = Math.random; let rolls = 0, dice = 0.9;
    Math.random = () => { rolls++; return dice; };
    try {
      let before = newSessions(); const no = fixture.emit({ at: false, text: 'QA94 dice reject' }); await until(() => kernel.store.findByMid('group:10001', no.event.message_id)?.read, 'dice marked read');
      assert.equal(rolls, 1); assert.equal(terminal(before), undefined); await sleep(450); assert.equal(rolls, 1);
      rolls = 0; dice = 0.1; before = newSessions(); fixture.emit({ at: false, text: 'QA94 dice accepted' });
      const ended = await until(() => terminal(before), 'dice accepted terminal'); assert.equal(ended.contextTier, 3); assert.match(ended.contextReason, /随机\(10/); assert.equal(rolls, 1);
      return { rejectedRolls: 1, acceptedRolls: 1, contextReason: ended.contextReason, negativeMarkedRead: true };
    } finally { Math.random = native; }
  });
  await verify(t, 'R01/R08', 'actual poke and private bypass tier, pause keeps unread and resume drains', async () => {
    kernel.config.update({ store: { contextSliderPos: 0 } });
    let before = newSessions(); fixture.emit({ kind: 'poke' }); let ended = await until(() => terminal(before), 'poke terminal'); assert.equal(ended.contextReason, '@我');
    const pokeReason = ended.contextReason; const pokeId = kernel.sessions.get(ended.id).triggerEntryIds[0]; assert.equal(kernel.store.recent('group:10001', 500).find((entry) => entry.id === pokeId)?.isPoke, true);
    before = newSessions(); fixture.emit({ kind: 'private', at: false, text: 'QA94 private plain tier1' }); ended = await until(() => terminal(before), 'private terminal'); assert.equal(ended.contextTier, 4);
    kernel.config.update({ store: { contextSliderPos: 100 } }); kernel.orchestrator.pause();
    const calls = fixture.state.modelRequests.length; const paused = fixture.emit({ at: false, text: 'QA94 paused unread' }); await until(() => kernel.store.findByMid('group:10001', paused.event.message_id), 'paused stored'); await sleep(400);
    assert.equal(kernel.store.findByMid('group:10001', paused.event.message_id).read, false); assert.equal(fixture.state.modelRequests.length, calls);
    before = newSessions(); kernel.orchestrator.resume(); await until(() => terminal(before), 'resume drain'); assert.equal(kernel.store.findByMid('group:10001', paused.event.message_id).read, true);
    return { pokeReason, pokeMarkedAtMe: true, privateTier: 4, pausedUnprocessed: true, resumeProcessed: true };
  });
  await verify(t, 'S07', 'actual failed HTTP model session retries original id/batch with cumulative billing', async () => {
    const originalProviders = structuredClone(kernel.config.get().providers), originalApi = structuredClone(kernel.config.get().api);
    kernel.config.update({ api: { baseUrl: `${webBase}/bad-v1` }, providers: originalProviders.map((provider) => provider.id === 'qa-local' ? { ...provider, baseURL: `${webBase}/bad-v1` } : provider) });
    const before = newSessions(); const event = fixture.emit({ kind: 'private', userId: 20002, at: false, text: 'QA94 manual retry original trigger' });
    const failed = await until(() => terminal(before), 'controlled 400 error'); assert.equal(failed.status, 'error'); const original = kernel.sessions.get(failed.id); assert.equal(original.sent.length, 0); assert.equal(original.usage.calls, 1);
    kernel.config.update({ api: originalApi, providers: originalProviders }); await llmMode({ mode: 'normal', toolCall: null });
    assert.equal((await api('POST', `/api/sessions/${failed.id}/retry`, {})).status, 200);
    const done = await until(() => kernel.sessions.get(failed.id)?.status === 'done' && kernel.sessions.get(failed.id), 'retry original id done');
    assert.equal(done.usage.calls, 3); assert.equal(done.usage.totalTokens, 300); assert.deepEqual(done.triggerEntryIds, original.triggerEntryIds); assert.ok(done.triggerEntryIds.includes(kernel.store.findByMid('private:20002', event.event.message_id).id));
    assert.equal(kernel.sessions.listSummaries().filter((s) => !before.has(s.id)).length, 1);
    assert.equal((await api('POST', `/api/sessions/${failed.id}/retry`, {})).status, 409);
    return { originalId: failed.id, newSessionCount: 1, requestsCumulative: 3, tokens: 300, originalTriggerRestored: true, sentRetryRejected: true };
  });
  await verify(t, 'S08/R12', 'abort real slow request and LLM backoff without late send or retry', async () => {
    await llmMode({ mode: 'slow', delayMs: 600 }); let before = newSessions(); let requests = fixture.state.modelRequests.length;
    let sends = fixture.state.actions.filter((action) => action.action.startsWith('send_')).length;
    fixture.emit({ groupId: 10002, text: 'QA94 slow abort' }); let running = await until(() => kernel.sessions.running().find((s) => !before.has(s.id)) && fixture.state.modelRequests.length > requests && kernel.sessions.running().find((s) => !before.has(s.id)), 'actual slow request');
    assert.equal((await api('POST', `/api/sessions/${running.id}/abort`, {})).status, 200); await until(() => fixture.state.modelRequests.at(-1).clientDisconnected, 'server sees abort'); await sleep(650);
    assert.equal(kernel.sessions.get(running.id).status, 'aborted'); assert.equal(fixture.state.actions.filter((action) => action.action.startsWith('send_')).length, sends);
    await llmMode({ mode: 'error' }); before = newSessions(); requests = fixture.state.modelRequests.length;
    fixture.emit({ groupId: 10002, text: 'QA94 abort inside retry backoff' }); running = await until(() => kernel.sessions.running().find((s) => !before.has(s.id)) && fixture.state.modelRequests.length > requests && fixture.state.modelRequests.at(-1).status === 503 && kernel.sessions.running().find((s) => !before.has(s.id)), 'failed HTTP before backoff');
    assert.equal((await api('POST', `/api/sessions/${running.id}/abort`, {})).status, 200); await sleep(1250);
    assert.equal(fixture.state.modelRequests.length, requests + 1); assert.equal(kernel.sessions.get(running.id).usage.calls, 1); await llmMode({ mode: 'normal' });
    return { slowSocketAborted: true, lateProtocolSends: 0, backoffActualCalls: 1, noBackoffRetry: true };
  });
  await verify(t, 'B23-LOOP', 'actual HTTP LLM finish terminates at one round and keeps active topic', async () => {
    await llmMode({ mode: 'normal', toolCall: { name: 'finish', args: { reason: 'QA94 controlled finish', activeTopic: 'QA94 topic survives' } } }); const before = newSessions(), calls = fixture.state.modelRequests.length;
    fixture.emit({ groupId: 10002, text: 'QA94 finish stop' }); const ended = await until(() => terminal(before), 'finish terminal'); const full = kernel.sessions.get(ended.id);
    assert.equal(full.finishReason, 'QA94 controlled finish'); assert.equal(full.activeTopic, 'QA94 topic survives'); assert.equal(full.sent.length, 0); assert.equal(fixture.state.modelRequests.length, calls + 1);
    await llmMode({ mode: 'normal', toolCall: null }); return { actualRequests: 1, protocolSends: 0, reason: full.finishReason, activeTopic: full.activeTopic };
  });
  await verify(t, 'R16', 'actual default reminder first/20-second scheduler fires once', async () => {
    const context = { ...execCtx, session: { sent: [] } };
    const created = await invoke('set_reminder', { text: 'QA94 real timed reminder', delayMinutes: 0.001 }, context); const start = Date.now();
    await until(() => fixture.state.actions.find((action) => action.action === 'send_group_msg' && JSON.stringify(action.params).includes('QA94 real timed reminder')), 'actual reminder timer', 23000);
    const data = await until(() => JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'reminders.json'), 'utf8')).reminders.find((item) => item.id === created.result.id && item.fired), 'successful reminder persisted after protocol response'); assert.equal(data.fired, true);
    assert.equal(fixture.state.actions.filter((action) => JSON.stringify(action.params).includes('QA94 real timed reminder')).length, 1);
    return { realWaitMs: Date.now() - start, firedPersisted: true, actualSends: 1, real20sScheduler: true, longRunNotClaimed: true };
  });
  await verify(t, 'E14/E15', 'real loaded transport replacement drops old-generation callbacks and saved methods resolve current', async () => {
    kernel.config.update({ store: { contextSliderPos: 0 } }); const dir = path.join(fixture.appRoot, 'plugins', 'qa94-transport'); fs.mkdirSync(dir, { recursive: true });
    // Cleanup observes private resource state, without using an inactive SDK KV.
    const source = (version) => `export default { setup(ctx) { ctx.registerTransport({ id:'qa94-${version}', create(host) { let stopCount=0; return { id:'qa94-${version}', selfId:'900001', start(){host.onStatus({connected:true,selfId:'900001'})}, stop(){stopCount++}, get stopCount(){return stopCount}, emit:host.onEvent, send(chatKey,segments){ctx.storage.set('sent',{version:'${version}',chatKey,segments});return {msgId:94001}}, toPlatformSegments:s=>s, actions:{listGroups:()=>[{id:'${version}'}]} }; } }); } };`;
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'qa94-transport', kind: 'plugin', version: '1.0.0', apiVersion: 1, enabledByDefault: true, entry: 'index.js', permissions: ['net.outbound'] })); fs.writeFileSync(path.join(dir, 'index.js'), source('v1'));
    await kernel.loader.loadDir('plugins', dir); await kernel.services.refresh(); assert.equal(kernel.services.get('transport.provider'), undefined);
    kernel.permissions.setOverride('qa94-transport', 'net.outbound', 'allow'); await kernel.services.refresh(); const old = kernel.services.get('transport.provider'); assert.equal(old.id, 'qa94-v1'); replacementTransports.push(old); const savedSend = kernel.transport.send;
    fs.writeFileSync(path.join(dir, 'index.js'), source('v2')); await kernel.loader.loadDir('plugins', dir); await kernel.services.refresh();
    assert.equal(old.stopCount, 1, 'reload stopped the old generation once');
    assert.equal(kernel.services.get('transport.provider'), undefined); kernel.permissions.setOverride('qa94-transport', 'net.outbound', 'allow'); await kernel.services.refresh();
    const msg = (mid, text) => ({ kind: 'group', id: '10001', type: 'message', event: { message_id: mid, user_id: 20001, sender: { nickname: 'QA' }, message: [{ type: 'text', data: { text } }] } });
    try { await old.emit(msg(88901, 'must ignore old generation')); } catch {} await sleep(40); assert.equal(kernel.store.findByMid('group:10001', 88901), null);
    const current = kernel.services.get('transport.provider'); replacementTransports.push(current); await current.emit(msg(88902, 'current generation accepted')); await until(() => kernel.store.findByMid('group:10001', 88902), 'current callback accepted');
    await savedSend('group:10001', [{ type: 'text', text: 'saved facade now v2' }]); assert.equal(kernel.storage.namespace('qa94-transport').get('sent').version, 'v2');
    await kernel.loader.setEnabled('qa94-transport', false); await kernel.services.refresh(); assert.equal(kernel.services.get('transport.provider').id, 'onebot');
    assert.equal(current.stopCount, 1, 'disable stopped the current generation once'); assert.equal(old.stopCount, 1);
    try { await current.emit(msg(88903, 'disabled late callback')); } catch {} await sleep(40); assert.equal(kernel.store.findByMid('group:10001', 88903), null);
    return { unauthorizedNotStarted: true, generationReauthorization: true, oldEventArchived: false, currentEventArchived: true, savedFacadeVersion: 'v2', disableFallback: 'onebot', disabledEventArchived: false, generationStopCounts: [old.stopCount, current.stopCount] };
  });
  console.log(`HEADLESS evidence: ${reportPath}`);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHeadedQaFixture } from '../scripts/headed-qa-fixture.mjs';
import { createKernel } from '../src/kernel/kernel.js';
import { requestMemoryConsolidation } from '../src/console/memory-media-adapters.js';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const until = async (predicate, label, timeout = 12000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out: ${label}`);
};

test('headed QA uses real default services with isolated synthetic OneBot, model, media, memory, and billing', async (t) => {
  const baseDir = path.join(workspace, '.qa-local', `test-fixture-${process.pid}-${Date.now()}`);
  const fixture = await startHeadedQaFixture({ baseDir });
  let kernel;
  const network = [];
  t.after(async () => {
    await kernel?.stop();
    await fixture.close();
    assert.equal(fs.existsSync(path.join(fixture.dataDir, 'qq-agent.lock')), false);
    const target = path.resolve(baseDir);
    assert.ok(target.startsWith(path.resolve(workspace, '.qa-local') + path.sep));
    assert.ok(path.basename(target).startsWith('test-fixture-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  kernel = createKernel({ appRoot: fixture.appRoot,
    env: { QQ_AGENT_DATA_DIR: fixture.dataDir, QQ_AGENT_PORT: String(fixture.consolePort), QQ_AGENT_PROFILE: '99', QQ_AGENT_MIGRATE_FROM: path.join(baseDir, 'absent-migration-source') },
    fetchImpl: async (url, options) => {
      const address = new URL(url); network.push(address.href);
      assert.equal(address.hostname, '127.0.0.1', 'SDK HTTP cannot reach real external services');
      return fetch(url, options);
    },
    priceUpdates: { resolve: () => null, refresh: async () => ({ ok: false, remote: false, synthetic: true }), updateCheck: async()=>({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },
  });
  kernel.log.setLevel('error');
  kernel.loader.startWatchers = () => {};
  await kernel.start(); await kernel.services.idle();
  await until(() => fixture.wss.clients.size === 1 && kernel.transport.status().selfId === '900001', 'real default OneBot connected');

  await t.test('production copy, seed, console auth, models and binary media are real', async () => {
    assert.equal(fs.readFileSync(path.join(fixture.appRoot, 'electron', 'main.js'), 'utf8'), fs.readFileSync(path.join(workspace, 'electron', 'main.js'), 'utf8'));
    for (const [name, id] of [['transport.provider', 'transport-onebot'], ['media.reader', 'media-service'], ['memory.consolidate', 'memory-service'], ['reminders.service', 'reminders']]) {
      assert.equal(kernel.capability.providers(name)[0]?.ownerId, id);
      assert.ok(kernel.services.get(name), name);
    }
    assert.equal(kernel.store.listChats().length, 3);
    assert.equal(kernel.sessions.listSummaries().length, 7);
    assert.ok(kernel.memory.query('group:10001').length >= 2);
    assert.ok(JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'stickers.json'), 'utf8')).some((sticker) => sticker.id === 'qa-local-image'));
    assert.ok(JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'reminders.json'), 'utf8')).reminders.some((reminder) => !reminder.fired));
    assert.equal((await fetch(`${fixture.consoleUrl}/api/config`)).status, 401);
    const config = await (await fetch(`${fixture.consoleUrl}/api/config`, { headers: { 'x-console-token': fixture.token } })).json();
    assert.ok(JSON.stringify(config).includes('qa-chat'), JSON.stringify(config));
    assert.deepEqual((await (await fetch(`${fixture.llmUrl}/models`)).json()).data.map((row) => row.id), ['qa-chat', 'qa-vision', 'qa-memory', 'qa-fail']);
    const image = await kernel.services.get('media.reader').imageParts({ url: fixture.imageUrl });
    assert.equal(image.mime, 'image/png');
    assert.ok(image.parts[0].image_url.url.startsWith('data:image/png;base64,'));
    const video = await fetch(fixture.videoUrl), videoBytes = Buffer.from(await video.arrayBuffer());
    assert.equal(video.headers.get('content-type'), 'video/mp4');
    assert.equal(videoBytes.toString('ascii', 4, 8), 'ftyp');
    const audio = await fetch(fixture.audioUrl), audioBytes = Buffer.from(await audio.arrayBuffer());
    assert.equal(audio.headers.get('content-type'), 'audio/wav');
    assert.equal(audioBytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(audioBytes.toString('ascii', 8, 12), 'WAVE');
    const groups = await kernel.transport.actions.listGroups();
    assert.ok(groups.some((row) => String(row.id) === '10001'));
    const today = kernel.sessions.todayUsage();
    const date = new Date(), dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const todays = kernel.sessions.listSummaries().filter((session) => session.startedAt >= dayStart);
    assert.equal(today.totalTokens, todays.reduce((sum, session) => sum + session.usage.totalTokens, 0));
  });

  await t.test('a genuine WS group trigger invokes the actual tool and OneBot send path, with persisted model trace and usage', async () => {
    const before = new Set(kernel.sessions.listSummaries().map((s) => s.id));
    const event = fixture.emit({ kind: 'group', text: 'QA real chain fixture, please reply.' });
    assert.equal(event.clients, 1);
    const done = await until(() => kernel.sessions.listSummaries().find((s) => !before.has(s.id) && s.status === 'done'), 'normal tool session complete');
    const session = kernel.sessions.get(done.id);
    assert.equal(session.model, 'qa-chat');
    assert.equal(session.providerId, 'qa-local');
    assert.equal(session.usage.calls, 2);
    assert.equal(session.usage.totalTokens, 300);
    assert.equal(session.finishReason, 'QA 本地验收结束');
    assert.equal(session.sent.length, 1);
    assert.ok(session.messages.some((message) => message.role === 'tool' && message.toolCall?.name === 'send_message'));
    assert.ok(session.messages.some((message) => message.role === 'tool' && message.toolCall?.name === 'finish'));
    assert.equal(fixture.state.modelRequests.length, 2);
    const replies = fixture.state.actions.filter((action) => action.action === 'send_group_msg' && action.params.group_id === 10001);
    assert.equal(replies.length, 1, 'exactly one actual protocol reply');
    assert.ok(Array.isArray(replies[0].params.message));
    const physicalText = replies[0].params.message.filter((part) => part.type === 'text').map((part) => part.data.text).join('');
    assert.ok(physicalText.includes('QA_LOCAL_SYNTHETIC'), 'literal identifier underscores survive normal text preparation');
    assert.equal(session.sent[0].text, physicalText, 'acknowledged receipt preserves actual protocol text');
    assert.equal(kernel.store.findByMid(session.chatKey, session.sent[0].msgId).text, physicalText, 'the acknowledged physical reply is really archived');
    const archivedTrigger=kernel.store.findByMid('group:10001', event.event.message_id);
    assert.equal(archivedTrigger.text, '@QA 成员QA real chain fixture, please reply.');
    assert.equal(archivedTrigger.atMe,true,'resolving the mention label preserves the actual bot-target trigger');
    assert.ok(fixture.state.actions.some(action=>action.action==='get_group_member_info'&&Number(action.params.group_id)===10001&&Number(action.params.user_id)===900001),'cold member name comes from the real protocol action');
    const saved = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'sessions', `${session.id}.json`), 'utf8'));
    assert.equal(saved.usage.totalTokens, 300);
    const dayFile = fs.readdirSync(path.join(fixture.dataDir, 'usage-days')).map((name) => JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'usage-days', name), 'utf8'))).find((day) => day.records?.[session.id]);
    assert.equal(dayFile.records[session.id].usage.totalTokens, 300);
  });

  await t.test('silent responses do not send QQ actions, and controlled HTTP failures are explicit synthetic responses', async () => {
    const count = fixture.state.actions.filter((action) => action.action === 'send_private_msg').length;
    await fetch(`${fixture.baseUrl}/qa/llm`, { method: 'POST', body: JSON.stringify({ mode: 'silent' }) });
    const before = new Set(kernel.sessions.listSummaries().map((s) => s.id));
    fixture.emit({ kind: 'private', text: 'QA silent fixture.' });
    await until(() => kernel.sessions.listSummaries().find((s) => !before.has(s.id) && s.status === 'noreply'), 'silent session complete');
    assert.equal(fixture.state.actions.filter((action) => action.action === 'send_private_msg').length, count);
    await fetch(`${fixture.baseUrl}/qa/llm`, { method: 'POST', body: JSON.stringify({ mode: 'error' }) });
    const error = await fetch(`${fixture.llmUrl}/chat/completions`, { method: 'POST', body: JSON.stringify({ model: 'qa-chat', messages: [] }) });
    assert.equal(error.status, 503);
    assert.match((await error.json()).error.message, /QA_LOCAL_SYNTHETIC/);
    await fetch(`${fixture.baseUrl}/qa/llm`, { method: 'POST', body: JSON.stringify({ mode: 'normal' }) });
  });

  await t.test('slow actual LLM request can be aborted before any OneBot send', async () => {
    const before = new Set(kernel.sessions.listSummaries().map((s) => s.id));
    const count = fixture.state.actions.filter((action) => action.action === 'send_group_msg').length;
    const calls = fixture.state.modelRequests.length;
    await fetch(`${fixture.baseUrl}/qa/llm`, { method: 'POST', body: JSON.stringify({ mode: 'slow', delayMs: 500 }) });
    fixture.emit({ groupId: 10002, text: 'QA abort fixture.' });
    const running = await until(() => kernel.sessions.running().find((s) => !before.has(s.id)) && fixture.state.modelRequests.length > calls ? kernel.sessions.running().find((s) => !before.has(s.id)) : null, 'slow model request started');
    assert.equal(kernel.orchestrator.abortSession(running.id).ok, true);
    await until(() => fixture.state.modelRequests.at(-1).clientDisconnected === true, 'model endpoint observed aborted socket');
    await new Promise((resolve) => setTimeout(resolve, 550));
    assert.equal(kernel.sessions.get(running.id).status, 'aborted');
    assert.equal(fixture.state.actions.filter((action) => action.action === 'send_group_msg').length, count);
    await fetch(`${fixture.baseUrl}/qa/llm`, { method: 'POST', body: JSON.stringify({ mode: 'normal' }) });
  });

  await t.test('default memory service uses dedicated real local model and preserves actual source facts', async () => {
    const prior = kernel.memory.query('group:10001').find((member) => member.userId === '20001');
    assert.equal(prior.impressions.length, 2);
    const result = requestMemoryConsolidation({ memory: kernel.memory, chatKey: 'group:10001', userIds: ['20001'] });
    assert.equal(result.status, 202);
    await until(() => kernel.memory.query('group:10001').find((member) => member.userId === '20001').impressions.length === 1, 'actual memory replacement');
    assert.equal(kernel.memory.query('group:10001').find((member) => member.userId === '20001').impressions[0].content, prior.impressions[0].content);
    assert.ok(fixture.state.modelRequests.some((request) => request.body.model === 'qa-memory'));
    const session = kernel.sessions.listSummaries().find((s) => s.background && s.status === 'done');
    assert.equal(session.usage.totalTokens, 150);
    assert.equal(session.providerId, 'qa-local');
    assert.ok(network.every((address) => address.startsWith(fixture.baseUrl)));
  });

  await t.test('a controlled model tool request executes the actual published memory tool', async () => {
    const before = new Set(kernel.sessions.listSummaries().map((s) => s.id));
    await fetch(`${fixture.baseUrl}/qa/llm`, { method: 'POST', body: JSON.stringify({ mode: 'normal', toolCall: { name: 'memory_query', args: { userId: '20001' } } }) });
    fixture.emit({ groupId: 10002, text: 'QA controlled real tool fixture.' });
    const ended = await until(() => kernel.sessions.listSummaries().find((s) => !before.has(s.id) && s.status === 'noreply'), 'controlled memory tool session complete');
    const session = kernel.sessions.get(ended.id);
    assert.equal(session.sent.length, 0);
    const tool = session.messages.find((message) => message.role === 'tool' && message.toolCall?.name === 'memory_query');
    assert.ok(tool);
    assert.ok(JSON.stringify(tool).includes('常在本地验收中提出问题'));
    await fetch(`${fixture.baseUrl}/qa/llm`, { method: 'POST', body: JSON.stringify({ mode: 'normal', toolCall: null }) });
  });
});

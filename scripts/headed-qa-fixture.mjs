// Local, headed QA: production application copied verbatim, isolated data,
// real OneBot/LLM/media clients talking to explicitly synthetic local servers.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createChatStore } from '../src/kernel/store.js';
import { createMemoryStore } from '../src/kernel/memory.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createReminderStore } from '../src/kernel/reminders.js';
import { createStickerManager } from '../src/kernel/stickers.js';
import { createUsageDayStore } from '../src/kernel/usage-days.js';
import { usageCost } from '../src/console/routes.js';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = { info() {}, warn() {}, error() {} };
const groups = [{ group_id: 10001, group_name: 'QA · 本地功能验收群', member_count: 4, max_member_count: 200 }, { group_id: 10002, group_name: 'QA · 第二测试群', member_count: 3, max_member_count: 200 }];
const friends = [{ user_id: 20001, nickname: 'QA 小林', remark: '合成私聊联系人' }, { user_id: 20002, nickname: 'QA 小周', remark: '合成成员' }];
const selfId = 900001;
const json = (response, status, body) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)); };
const readBody = async (request) => { let body = ''; for await (const part of request) { body += part; if (body.length > 8 * 1024 * 1024) throw new Error('QA request too large'); } return body ? JSON.parse(body) : {}; };
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const localDay = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function syntheticWav() {
  const rate = 16000, frames = rate, data = Buffer.alloc(44 + frames * 2);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 1000), 44 + i * 2);
  return data;
}

function copyApplication(appRoot) {
  fs.mkdirSync(appRoot, { recursive: true });
  for (const name of ['src', 'bundled', 'ui', 'electron', 'assets']) fs.cpSync(path.join(workspace, name), path.join(appRoot, name), { recursive: true });
  for (const name of ['scripts/lib']) {
    const source = path.join(workspace, name);
    if (!fs.existsSync(source)) continue;
    const target = path.join(appRoot, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
  }
  fs.copyFileSync(path.join(workspace, 'package.json'), path.join(appRoot, 'package.json'));
  const modules = path.join(appRoot, 'node_modules');
  if (!fs.existsSync(modules)) fs.symlinkSync(path.join(workspace, 'node_modules'), modules, process.platform === 'win32' ? 'junction' : 'dir');
  for (const name of ['plugins', 'skills']) fs.mkdirSync(path.join(appRoot, name), { recursive: true });
}

function seedData(dataDir, cfg, baseUrl) {
  const markerFile = path.join(dataDir, 'qa-seeded.json');
  if (fs.existsSync(markerFile)) {
    const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
    if (marker.fixtureVersion < 2) {
      // Upgrade only the original synthetic seed, before a desktop owns the lock.
      const today = { dayKey: localDay(Date.now()), promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, runs: 0, webSearchCount: 0 };
      for (const name of fs.readdirSync(path.join(dataDir, 'sessions'))) {
        if (!name.endsWith('.json')) continue;
        const s = JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions', name), 'utf8'));
        if (localDay(s.startedAt) !== today.dayKey || !s.id || ['running', 'waiting'].includes(s.status)) continue;
        for (const key of ['promptTokens', 'completionTokens', 'totalTokens', 'cachedTokens']) today[key] += Number(s.usage?.[key]) || 0;
        if (s.usage?.calls || s.usage?.totalTokens) today.runs++;
        today.webSearchCount += Number(s.webSearchCount) || 0;
      }
      writeJson(path.join(dataDir, 'usage-today.json'), today);
      createStickerManager({ dataDir, log, cfg: () => cfg }).collect({ id: 'qa-local-image', url: `${baseUrl}/media/qa.png`, buffer: fs.readFileSync(path.join(workspace, 'assets', 'icon.png')), desc: 'QA 合成本地表情样例', source: 'manual' });
      writeJson(markerFile, { ...marker, fixtureVersion: 2 });
    }
    return;
  }
  const store = createChatStore({ dataDir, log }), memory = createMemoryStore({ dataDir, log, cfg: () => cfg });
  const now = Date.now(); let mid = 5000;
  for (const [chatKey, name] of [['group:10001', 'QA 主群'], ['group:10002', 'QA 第二群'], ['private:20001', 'QA 私聊']]) {
    for (let index = 0; index < 12; index++) store.appendIncoming(chatKey, { mid: ++mid, ts: now - (12 - index) * 60000, senderId: index % 2 ? '20001' : '20002', senderName: index % 2 ? 'QA 小林' : 'QA 小周', text: `${name}：合成历史消息 ${index + 1}。这里仅用于本地界面验收。`, atMe: false });
    store.appendIncoming(chatKey, { mid: ++mid, ts: now - 40000, senderId: '20001', senderName: 'QA 小林', text: '[图片] 合成媒体样例', media: [{ kind: 'image', url: `${baseUrl}/media/qa.png`, file: 'qa-image', summary: 'QA 本地测试图片' }], atMe: false });
    store.appendSelf(chatKey, { mid: ++mid, ts: now - 20000, text: 'QA 合成机器人历史回复。' }); store.markAllRead(chatKey);
    memory.append(chatKey, { userId: '20001', name: 'QA 小林', content: '常在本地验收中提出问题。' });
    memory.append(chatKey, { userId: '20001', name: 'QA 小林', content: '喜欢先检查事实再给结论。' });
    memory.append(chatKey, { userId: '20002', name: 'QA 小周', content: '负责记录本地功能验收结果。' });
  }
  const archive = createUsageDayStore({ dataDir, log, costFor: (session) => usageCost(session.usage, session.model, session.startedAt, cfg) });
  const sessions = createSessionRegistry({ dataDir, log, onFinishedSession: (session, previous) => archive.record(session, previous) });
  const today = { dayKey: localDay(now), promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, runs: 0, webSearchCount: 0 };
  for (let index = 0; index < 7; index++) {
    const s = sessions.create(index % 2 ? 'private:20001' : 'group:10001', { trigger: `QA 合成会话 ${index + 1}` });
    const promptTokens = 150 + index * 80, completionTokens = 40 + index * 10;
    sessions.update(s, { startedAt: now - [150000, 1800000, 7200000, 86400000, 7 * 86400000, 31 * 86400000, 400 * 86400000][index], model: index % 2 ? 'qa-vision' : 'qa-chat', providerId: 'qa-local', provider: 'qa-local', vendor: `${baseUrl}/v1`, contextTier: (index % 4) + 1, contextReason: '本地合成验收', rounds: 2, promptChars: 800 + index * 100, traceVersion: 1,
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, cachedTokens: index * 20, calls: 2 },
      messages: [{ role: 'system', content: 'QA 合成系统提示词。' }, { role: 'user', content: 'QA 合成触发消息。' }, { role: 'assistant', content: '', tool_calls: [{ id: `qa-call-${index}`, type: 'function', function: { name: 'send_message', arguments: '{"messages":"QA 合成工具回复"}' } }], raw: { usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } } }, { role: 'tool', tool_call_id: `qa-call-${index}`, content: '{"sent":true}', toolCall: { name: 'send_message', args: { messages: 'QA 合成工具回复' }, result: '{"sent":true}', ok: true } }],
      sent: [{ msgId: ++mid, text: 'QA 合成工具回复', ts: now - 1000 }], reasoning: 'QA 合成推理摘要，用于详情显示。', systemPrompt: 'QA 合成系统提示词。', userPrompt: 'QA 合成用户提示词。', excludedTools: [{ id: 'send_to', reason: '跨会话发送尚未开启' }],
    });
    sessions.finish(s.id, index === 1 ? 'error' : index === 2 ? 'aborted' : 'done', { finishReason: index === 1 ? null : 'QA 合成会话结束', error: index === 1 ? 'QA 合成错误分支：用于重试按钮验收' : null, endedAt: s.startedAt + 3000 });
    if (localDay(s.startedAt) === today.dayKey) { for (const key of ['promptTokens', 'completionTokens', 'totalTokens', 'cachedTokens']) today[key] += s.usage[key]; today.runs++; }
  }
  sessions.stop();
  writeJson(path.join(dataDir, 'usage-today.json'), today);
  const stickers = createStickerManager({ dataDir, log, cfg: () => cfg });
  stickers.collect({ id: 'qa-local-image', url: `${baseUrl}/media/qa.png`, buffer: fs.readFileSync(path.join(workspace, 'assets', 'icon.png')), desc: 'QA 合成本地表情样例', source: 'manual' });
  createReminderStore({ dataDir, log }).add({ chatKey: 'group:10001', text: 'QA 本地待办提醒（不会发送到真实 QQ）', dueAt: now + 3600000, createdBy: '20001' });
  writeJson(markerFile, { synthetic: true, seededAt: now, fixtureVersion: 2 });
}

export function writeQaElectronWrapper(appRoot, dataDir, consolePort, baseDir) {
  const wrapper = path.join(appRoot, 'qa-electron.mjs');
  fs.writeFileSync(wrapper, `// QA adapter only; production electron/main.js remains unchanged.\nimport fs from 'node:fs';\nimport http from 'node:http';\nimport https from 'node:https';\nimport { app, shell } from 'electron';\nprocess.env.QQ_AGENT_DATA_DIR=${JSON.stringify(dataDir)};\nprocess.env.QQ_AGENT_PORT=${JSON.stringify(String(consolePort))};\nprocess.env.QQ_AGENT_PROFILE='99';\nprocess.env.QQ_AGENT_MIGRATE_FROM=${JSON.stringify(path.join(baseDir, 'absent-migration-source'))};\nconst record=(kind,data)=>fs.appendFileSync(${JSON.stringify(path.join(baseDir, 'desktop-adapter.jsonl'))},JSON.stringify({ts:Date.now(),synthetic:true,kind,data})+'\\n');\napp.setLoginItemSettings=options=>record('setLoginItemSettings',options); shell.openExternal=async url=>{record('openExternal',{url,externalOpened:false});};\nconst loopback=hostname=>['127.0.0.1','localhost','[::1]','::1'].includes(hostname);\nconst nativeFetch=globalThis.fetch;\nglobalThis.fetch=(input,options)=>{const raw=typeof input==='string'?input:input?.url || String(input);const url=new URL(raw);if(!loopback(url.hostname)){record('blockedExternalFetch',{url:raw});return Promise.reject(new Error('QA_OFFLINE_EXTERNAL: '+url.hostname));}return nativeFetch(input,options);};\nfor(const transport of [http,https])for(const name of ['request','get']){const native=transport[name];transport[name]=function(input,...rest){const url=typeof input==='string'||input instanceof URL?new URL(input):null;const hostname=url?.hostname || input?.hostname || String(input?.host||'localhost').split(':')[0];if(!loopback(hostname)){record('blockedExternalRequest',{hostname});throw new Error('QA_OFFLINE_EXTERNAL: '+hostname);}return native.call(this,input,...rest);};}\nawait import('./electron/main.js');\n`);
  return wrapper;
}

// Explicit sync helper: UI assets can be refreshed while a QA window is open;
// main/kernel changes take effect after the root tester restarts that window.
export function syncHeadedQaApplication({ baseDir = path.join(workspace, '.qa-local', 'headed-20261011'), files = null } = {}) {
  const descriptor = JSON.parse(fs.readFileSync(path.join(baseDir, 'fixture.json'), 'utf8'));
  if (!path.resolve(descriptor.appRoot).startsWith(path.resolve(workspace, '.qa-local') + path.sep)) throw new Error('Refusing to sync outside isolated QA app');
  if (files) for (const name of files) {
    const source = path.resolve(workspace, name), destination = path.resolve(descriptor.appRoot, name);
    if (!source.startsWith(workspace + path.sep) || !destination.startsWith(path.resolve(descriptor.appRoot) + path.sep)) throw new Error('Unsafe QA sync path');
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination);
  } else copyApplication(descriptor.appRoot);
  writeQaElectronWrapper(descriptor.appRoot, descriptor.dataDir, descriptor.consolePort, descriptor.baseDir);
  return { appRoot: descriptor.appRoot, files: files || ['src', 'bundled', 'ui', 'electron', 'assets', 'package.json'], restartForRuntimeChanges: true };
}

export async function startHeadedQaFixture({ baseDir = path.join(workspace, '.qa-local', 'headed-20261011'), copy = true, seed = true, servicePort, consolePort: requestedConsolePort } = {}) {
  baseDir = path.resolve(baseDir);
  const intended = path.resolve(workspace, '.qa-local');
  if (!baseDir.startsWith(intended + path.sep)) throw new Error('QA fixture must stay inside this workspace .qa-local directory');
  const appRoot = path.join(baseDir, 'app'), dataDir = path.join(baseDir, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(path.join(dataDir, 'qq-agent.lock'))) throw new Error('QA data is already locked by a running kernel; stop that instance before restarting fixture');
  const previous = fs.existsSync(path.join(baseDir, 'fixture.json')) ? JSON.parse(fs.readFileSync(path.join(baseDir, 'fixture.json'), 'utf8')) : null;
  const preferredPort = servicePort ?? (previous ? Number(new URL(previous.baseUrl).port) : 0);
  if (copy) copyApplication(appRoot);
  const state = { synthetic: true, startedAt: Date.now(), actions: [], modelRequests: [], audioRequests: [], events: [], mode: 'normal', delayMs: 15000, nextMid: 7000 };
  let baseUrl, wss;
  const image = fs.readFileSync(path.join(workspace, 'assets', 'icon.png'));
  const audio = syntheticWav(), video = fs.readFileSync(path.join(workspace, 'scripts', 'qa-fixtures', 'runtime', 'qa.mp4'));
  const save = () => writeJson(path.join(baseDir, 'state.json'), state);
  const emit = (input = {}) => {
    const privateChat = input.kind === 'private' || input.private === true, groupId = Number(input.groupId || 10001), userId = Number(input.userId || 20001);
    const content = String(input.text || 'QA 本地测试消息：请用工具回复。');
    const media = input.kind === 'image' ? [{ type: 'image', data: { file: 'qa-image', url: `${baseUrl}/media/qa.png`, summary: 'QA 本地测试图片' } }] : input.kind === 'video' ? [{ type: 'video', data: { file: 'qa-video', url: `${baseUrl}/media/qa.mp4` } }] : input.kind === 'record' ? [{ type: 'record', data: { file: `${baseUrl}/media/qa.wav`, url: `${baseUrl}/media/qa.wav` } }] : input.kind === 'forward' ? [{ type: 'forward', data: { id: 'qa-forward-1' } }] : [];
    const message = input.message || [...(input.at === false ? [] : [{ type: 'at', data: { qq: String(selfId) } }]), { type: 'text', data: { text: content } }, ...media];
    const notice = input.kind === 'poke' ? { post_type: 'notice', notice_type: 'notify', sub_type: 'poke', target_id: selfId } : input.kind === 'recall' ? { post_type: 'notice', notice_type: privateChat ? 'friend_recall' : 'group_recall', message_id: Number(input.messageId || state.nextMid), operator_id: userId } : input.kind === 'ban' ? { post_type: 'notice', notice_type: 'group_ban', sub_type: input.duration === 0 ? 'lift_ban' : 'ban', user_id: selfId, operator_id: userId, duration: Number(input.duration ?? 60) } : null;
    const event = input.event || { time: Math.floor(Date.now() / 1000), self_id: selfId, post_type: 'message', message_type: privateChat ? 'private' : 'group', sub_type: privateChat ? 'friend' : 'normal', message_id: ++state.nextMid, ...(privateChat ? {} : { group_id: groupId }), user_id: userId, sender: { user_id: userId, nickname: userId === 20002 ? 'QA 小周' : 'QA 小林', card: '' }, message, raw_message: message.filter((item) => item.type === 'text').map((item) => item.data.text).join(''), ...(notice || {}) };
    let clients = 0; for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(event)); clients++; }
    state.events.push({ ts: Date.now(), clients, event }); save(); return { ok: true, clients, event };
  };
  function onebot(action, params) {
    state.actions.push({ ts: Date.now(), action, params });
    let data = {};
    if (action === 'get_login_info') data = { user_id: selfId, nickname: 'QA 小鲸鱼' };
    else if (action === 'get_group_list') data = groups;
    else if (action === 'get_friend_list') data = friends;
    else if (action === 'get_group_info') data = groups.find((group) => group.group_id === Number(params.group_id)) || groups[0];
    else if (['get_stranger_info', 'get_friend_info'].includes(action)) data = friends.find((friend) => friend.user_id === Number(params.user_id)) || friends[0];
    else if (action === 'get_group_member_info') data = { user_id: Number(params.user_id), nickname: 'QA 成员', card: '', role: 'member', shut_up_timestamp: 0 };
    else if (action === 'get_group_member_list') data = [...friends.map((friend) => ({ ...friend, card: '', role: 'member', group_id: Number(params.group_id) })), { user_id: selfId, nickname: 'QA 小鲸鱼', card: '', role: 'member', group_id: Number(params.group_id) }];
    else if (/^send_(group|private)_msg$/.test(action)) data = { message_id: ++state.nextMid };
    else if (['get_image', 'get_file', 'get_video', 'get_record'].includes(action)) {
      const suffix = action === 'get_video' || params.file === 'qa-video' ? 'mp4' : action === 'get_record' ? 'wav' : 'png';
      data = { file: `${baseUrl}/media/qa.${suffix}`, url: `${baseUrl}/media/qa.${suffix}`, file_size: ({ mp4: video, wav: audio, png: image })[suffix].length, file_name: `qa.${suffix}`, ...(suffix === 'mp4' ? { duration: 1, width: 160, height: 90, codec: 'h264', format: 'mp4' } : {}) };
    }
    else if (action === 'get_forward_msg') data = { messages: [{ user_id: 20001, nickname: 'QA 小林', content: [{ type: 'text', data: { text: 'QA 合成转发内容。' } }] }] };
    save(); return { status: 'ok', retcode: 0, data };
  }
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, baseUrl || 'http://127.0.0.1');
      if (request.method === 'GET' && ['/qa/state', '/qa/status'].includes(url.pathname)) return json(response, 200, { ...state, clients: wss.clients.size, baseUrl, consoleUrl: descriptor?.consoleUrl, appRoot, dataDir });
      if (url.pathname === '/media/qa.png') { response.writeHead(200, { 'content-type': 'image/png', 'content-length': image.length }); return response.end(image); }
      if (url.pathname === '/media/qa.wav' || url.pathname === '/media/qa.mp4') {
        const content = url.pathname.endsWith('.wav') ? audio : video;
        response.writeHead(200, { 'content-type': url.pathname.endsWith('.wav') ? 'audio/wav' : 'video/mp4', 'content-length': content.length }); return response.end(content);
      }
      if (url.pathname.endsWith('/models')) return json(response, 200, { object: 'list', data: ['qa-chat', 'qa-vision', 'qa-memory', 'qa-fail'].map((id) => ({ id, object: 'model', owned_by: 'QA_LOCAL_SYNTHETIC' })) });
      if (url.pathname.endsWith('/audio/transcriptions')) {
        let bytes = 0; for await (const part of request) { bytes += part.length; if (bytes > 8 * 1024 * 1024) throw new Error('QA audio request too large'); }
        state.audioRequests.push({ ts: Date.now(), contentType: request.headers['content-type'], bytes, synthetic: true }); save();
        return json(response, 200, { text: 'QA_LOCAL_SYNTHETIC：这是一条本地合成语音转写。' });
      }
      const body = await readBody(request);
      if (request.method === 'POST' && ['/qa/emit', '/qa/event'].includes(url.pathname)) return json(response, 200, emit(body));
      if (url.pathname === '/qa/llm') {
        if (body.mode) state.mode = String(body.mode);
        if (Number.isFinite(body.delayMs)) state.delayMs = body.delayMs;
        if (Object.hasOwn(body, 'toolCall')) state.toolCall = body.toolCall && { name: String(body.toolCall.name), args: body.toolCall.args ?? {} };
        save(); return json(response, 200, { ok: true, mode: state.mode, delayMs: state.delayMs, toolCall: state.toolCall ?? null });
      }
      if (url.pathname.endsWith('/chat/completions')) {
        const record = { ts: Date.now(), path: url.pathname, body, mode: state.mode, status: 'pending' }; state.modelRequests.push(record); save();
        response.on('close', () => { if (!response.writableFinished) { record.clientDisconnected = true; save(); } });
        if (state.mode === 'slow') await wait(state.delayMs);
        if (state.mode === 'error' || body.model === 'qa-fail') { record.status = 503; save(); return json(response, 503, { error: { message: 'QA_LOCAL_SYNTHETIC: model temporarily unavailable' } }); }
        const text = (body.messages || []).map((message) => typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).join('\n');
        const functions = (body.tools || []).map((tool) => tool.function?.name);
        const usedTool = (body.messages || []).some((message) => message.role === 'tool');
        let message = { role: 'assistant', content: 'QA_LOCAL_SYNTHETIC：本地模型已收到请求。', reasoning_content: 'QA 合成推理，不来自真实模型。' }, reason = 'stop';
        if (body.model === 'qa-memory' || /不得增加事实|原有印象|整理.*印象/.test(text)) {
          let member; for (const line of text.split('\n').reverse()) { try { const parsed = JSON.parse(line); if (Array.isArray(parsed.impressions)) { member = parsed; break; } } catch {} }
          const facts = member?.impressions?.length ? member.impressions.slice(0, 1).map((item) => ({ content: String(item.content ?? item), ...(item.createdAt ? { createdAt: item.createdAt } : {}) })) : [{ content: `最近说过：${String(member?.messages?.at(-1)?.text || 'QA 本地合成发言').slice(0, 90)}` }];
          message.content = JSON.stringify({ impressions: facts });
        }
        else if (state.mode === 'silent') message.content = '';
        else if (state.mode === 'text') message.content = 'QA_LOCAL_SYNTHETIC：纯文本响应测试。';
        else if (state.toolCall && !usedTool && functions.includes(state.toolCall.name)) {
          message = { role: 'assistant', content: '', tool_calls: [{ id: `qa-controlled-${state.modelRequests.length}`, type: 'function', function: { name: state.toolCall.name, arguments: JSON.stringify(state.toolCall.args) } }] }; reason = 'tool_calls';
        }
        else if (functions.includes('send_message') && !usedTool) { message = { role: 'assistant', content: '', reasoning_content: 'QA 合成工具调用。', tool_calls: [{ id: `qa-tool-${state.modelRequests.length}`, type: 'function', function: { name: 'send_message', arguments: JSON.stringify({ messages: 'QA_LOCAL_SYNTHETIC：通过本地 OneBot 替身收到测试消息。' }) } }] }; reason = 'tool_calls'; }
        else if (functions.includes('finish') && usedTool) { message.tool_calls = [{ id: `qa-finish-${state.modelRequests.length}`, type: 'function', function: { name: 'finish', arguments: JSON.stringify({ reason: 'QA 本地验收结束' }) } }]; reason = 'tool_calls'; }
        const payload = { id: `qa-completion-${state.modelRequests.length}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: body.model || 'qa-chat', choices: [{ index: 0, message, finish_reason: reason }], usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, prompt_tokens_details: { cached_tokens: 20 }, completion_tokens_details: { reasoning_tokens: 5 } } };
        record.status = 200; record.response = payload; save(); return json(response, 200, payload);
      }
      return json(response, 200, onebot(url.pathname.split('/').filter(Boolean).pop() || '', body));
    } catch (error) { json(response, 500, { error: `QA_LOCAL_FIXTURE: ${error.message}` }); }
  });
  wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => { ws.send(JSON.stringify({ time: Math.floor(Date.now() / 1000), self_id: selfId, post_type: 'meta_event', meta_event_type: 'lifecycle', sub_type: 'connect' })); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(preferredPort, '127.0.0.1', resolve); }); baseUrl = `http://127.0.0.1:${server.address().port}`;
  const reserve = http.createServer(); await new Promise((resolve, reject) => { reserve.once('error', reject); reserve.listen(requestedConsolePort ?? previous?.consolePort ?? 0, '127.0.0.1', resolve); }); const consolePort = reserve.address().port; await new Promise((resolve) => reserve.close(resolve));
  const existingConfig = fs.existsSync(path.join(dataDir, 'config.json'));
  const config = createConfig({ dataDir, defaults: buildDefaultConfig(), log }); config.load();
  if (!existingConfig) config.update({ api: { baseUrl: `${baseUrl}/v1`, apiKey: 'qa-local-synthetic-key', model: 'qa-chat', provider: 'qa-local', maxRounds: 6, timeoutMs: 60000, useOfficialPrice: false, priceInputPerM: 1, priceOutputPerM: 2, priceCachedPerM: 0.1, modelPrices: { 'qa-chat': { in: 1, out: 2, cached: 0.1 }, 'qa-vision': { in: 2, out: 3, cached: 0.2 } }, vision: true }, providers: [{ id: 'qa-local', name: 'QA 本地合成模型服务', baseURL: `${baseUrl}/v1`, apiKey: 'qa-local-synthetic-key', enabled: true, models: ['qa-chat', 'qa-vision', 'qa-memory', 'qa-fail'] }],
    onebot: { dir: '', wsUrl: baseUrl.replace('http:', 'ws:') + '/onebot/ws', httpUrl: baseUrl + '/onebot', accessToken: 'qa-local-onebot-token', httpAccessToken: 'qa-local-onebot-token' },
    allow: { groups: ['10001', '10002'], private: ['20001', '20002'] }, allowAllWhenEmpty: false, wakeDelayMs: 100, drainDelayMs: 300, send: { minGapMs: 20, maxGapMs: 50, byLengthMs: 0, dedupeWindowMs: 100 }, store: { contextSliderPos: 100, historyCount: 80 },
    persona: { botName: 'QA 小鲸鱼', selfNickname: 'QA 本地机器人', customRules: '当前全部会话与服务为本地合成验收环境。' }, memberNotes: { '20001': 'QA 小林', '20002': 'QA 小周' },
    memory: { consolidateEnabled: false, useChatModel: false, provider: 'qa-local', model: 'qa-memory', discoverMaxMembers: 0 }, proactive: { enabled: false }, telemetry: { enabled: false },
    security: { allowPrivateImageHosts: true }, server: { port: consolePort, token: 'qa-local-console-token', autoStart: false, closeToTray: false },
    skills: { community: { enabled: false }, telemetry: { enabled: false }, market: { enabled: false } },
  });
  else config.update({ api: { ...(config.get().api.provider === 'qa-local' ? { baseUrl: `${baseUrl}/v1` } : {}) }, providers: (config.get().providers ?? []).map((provider) => provider.id === 'qa-local' ? { ...provider, baseURL: `${baseUrl}/v1` } : provider), onebot: { wsUrl: baseUrl.replace('http:', 'ws:') + '/onebot/ws', httpUrl: baseUrl + '/onebot' }, server: { port: consolePort } });
  if (seed) seedData(dataDir, config.get(), baseUrl);
  const wrapper = writeQaElectronWrapper(appRoot, dataDir, consolePort, baseDir);
  const descriptor = { synthetic: true, baseDir, appRoot, dataDir, baseUrl, onebotWs: baseUrl.replace('http:', 'ws:') + '/onebot/ws', onebotHttp: baseUrl + '/onebot', llmUrl: baseUrl + '/v1', imageUrl: baseUrl + '/media/qa.png', videoUrl: baseUrl + '/media/qa.mp4', audioUrl: baseUrl + '/media/qa.wav', asrUrl: baseUrl + '/v1', consolePort, consoleUrl: `http://127.0.0.1:${consolePort}`, token: config.get().server.token, wrapper,
    launchCommand: `& '${path.join(workspace, 'node_modules', 'electron', 'dist', 'electron.exe')}' '${wrapper}' --force-renderer-accessibility`,
    note: 'Real production UI/kernel/default services; OneBot, LLM and media servers are synthetic loopback fixtures. OS autostart is recorded by QA adapter, never changed. External fetch is blocked in the QA wrapper.' };
  writeJson(path.join(baseDir, 'fixture.json'), descriptor); save();
  return { ...descriptor, state, emit, server, wss, async close() { for (const client of wss.clients) client.terminate(); await new Promise((resolve) => wss.close(resolve)); await new Promise((resolve) => server.close(resolve)); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = await startHeadedQaFixture({ copy: !process.argv.includes('--no-copy') });
  console.log(JSON.stringify(fixture, (key, value) => ['state', 'server', 'wss'].includes(key) || typeof value === 'function' ? undefined : value, 2));
  let closing = false;
  const stop = async () => { if (closing) return; closing = true; await fixture.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}

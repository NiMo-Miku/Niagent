// SPEC §8/§11：真实媒体服务/registry/store/send，离线 HTTP 与受控协议动作。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createMediaReader, controlledMediaPath } from '../src/kernel/media.js';
import { safeFetch, downloadImageAsDataUrl } from '../src/kernel/safe-fetch.js';
import { createSendQueue } from '../src/kernel/send.js';
import { createStickerManager } from '../src/kernel/stickers.js';
import { createChatStore } from '../src/kernel/store.js';
import { createCapabilityRegistry } from '../src/kernel/capability.js';
import { createPermissions } from '../src/kernel/permissions.js';
import { createToolRegistry } from '../src/kernel/tools.js';
import queryTools from '../bundled/query-tools/index.js';
import mediaTools from '../bundled/media-tools/index.js';
import stickerTools from '../bundled/sticker-tools/index.js';
import { createMediaDataAdapter } from '../src/console/memory-media-adapters.js';
import { readArchivedForward } from '../src/console/forward-adapter.js';
import { createConfig, buildDefaultConfig } from '../src/kernel/config.js';
import { createSessionRegistry } from '../src/kernel/sessions.js';
import { createHttpServer } from '../src/kernel/http.js';
import { registerConsoleRoutes } from '../src/console/routes.js';
import { fixtureCapability } from './bundled-fixture-sdk.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqa-media-spec-'));
const log = { info() {}, warn() {}, error() {} };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK9kAAAAASUVORK5CYII=', 'base64');
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const wav = Buffer.alloc(46);
wav.write('RIFF', 0); wav.writeUInt32LE(38, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(2, 40);
const mp4Signature = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypisom'), Buffer.alloc(12)]);
const cache = path.join(root, 'protocol.png'); fs.writeFileSync(cache, png);
let videoFixture = null;
const requests = []; const actionCalls = []; const sent = [];
let sendImpl = async () => ({ msgId: 1000 + sent.length });
let imageImpl = async (file) => file === 'cached-image' ? { file: cache } : file === 'url-image' ? { url: `${base}/image.png` } : null;
let videoImpl = async () => ({ file: path.join(root, 'missing.mp4') });
let fileImpl = async () => videoFixture ? { file: videoFixture, duration: 2, width: 640, height: 360 } : { url: `${base}/video`, duration: 2, width: 640, height: 360 };
const server = http.createServer((req, res) => {
  requests.push(req.url);
  if (req.url === '/image.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); }
  else if (req.url === '/gif') { res.writeHead(200, { 'content-type': 'image/gif' }); res.end(gif); }
  else if (req.url === '/html') { res.writeHead(200, { 'content-type': 'image/png' }); res.end('<!doctype html><html>not an image</html>'); }
  else if (req.url === '/fake') { res.writeHead(200, { 'content-type': 'image/png' }); res.end('not an image'); }
  else if (req.url === '/empty') res.end();
  else if (req.url === '/large') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(Buffer.concat([png, Buffer.alloc(4096)])); }
  else if (req.url === '/oversize-image') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(Buffer.concat([png, Buffer.alloc(1024 * 1024)])); }
  else if (req.url === '/video') res.end(videoFixture ? fs.readFileSync(videoFixture) : Buffer.from('offline video fixture'));
  else if (req.url === '/audio') res.end(wav);
  else if (req.url === '/play-video') res.end(videoFixture ? fs.readFileSync(videoFixture) : mp4Signature);
  else if (req.url === '/slow') { res.writeHead(200); res.write(png); }
  else { res.writeHead(404); res.end('missing'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const transport = {
  actions: {
    getImage: async (file, opts) => { actionCalls.push(['getImage', file]); return imageImpl(file, opts); },
    getVideo: async (file, opts) => { actionCalls.push(['getVideo', file]); return videoImpl(file, opts); },
    getFile: async (file, opts) => { actionCalls.push(['getFile', file]); return fileImpl(file, opts); },
  },
  send: async (chatKey, segments, opts) => { sent.push({ chatKey, segments, opts }); return sendImpl(chatKey, segments, opts); },
};
const cfg = { api: { vision: true, video: false, videoMode: 'auto', videoModel: '' },
  security: { allowPrivateImageHosts: true, imageSend: { requirePreview: true, maxPerRun: 3, maxPreviewsPerRun: 5, maxBytesMB: 5 } },
  skills: { 'video-frames': { enabled: true, settings: { frames: 3 } } }, send: { dedupeWindowMs: 0, hardSplitAt: 4000 } };
const capability = createCapabilityRegistry({ log });
const reader = createMediaReader({ cfg: () => cfg, transport, capability, log, ffmpegPath: '__missing_ffmpeg__', ffprobePath: '__missing_ffprobe__' });
const store = createChatStore({ dataDir: root, log });
const permissions = createPermissions({ log, headless: true });
const registry = createToolRegistry({ log, permissions });
const send = createSendQueue({ transport, store, cfg: () => cfg, log, mediaReader: () => reader });
let addImpl = async () => ({ emojiId: 'QQ:../emoji' });
let noteImpl = async () => ({ ok: true });
capability.register('qq.emoji-favorites', 'kernel', {
  addCustomFace: async (file) => { actionCalls.push(['addCustomFace', file]); return addImpl(file); },
  modifyCustomFace: async (id, note) => { actionCalls.push(['modifyCustomFace', id, note]); return noteImpl(id, note); },
});
const stickers = createStickerManager({ dataDir: root, log, cfg: () => cfg, capability, mediaReader: () => reader });
const kernel = { store, cfg: () => cfg, capability, transport, send, stickers, mediaReader: () => reader };
for (const [ownerId, module] of [['query-tools', queryTools], ['media-tools', mediaTools], ['sticker-tools', stickerTools]]) {
  module.setup({ capability: fixtureCapability(kernel), registerTool: (def) => registry.register({ ...def, ownerId, bundled: true }) });
}
async function invoke(id, args, session = {}, chatKey = 'group:81', signal) {
  const response = await registry.invoke(id, args, { execCtx: { chatKey, session, signal } });
  assert.equal(response.ok, true, response.error);
  return response.result;
}
const imageMessage = (mid, media) => store.appendIncoming('group:81', { mid, text: '[图片]', senderId: '7', media });
const missing = createMediaReader({ cfg: { api: { videoMode: 'frames' }, security: { allowPrivateImageHosts: true } }, transport, capability: createCapabilityRegistry({ log }), log, ffmpegPath: '__missing_ffmpeg__', ffprobePath: '__missing_ffprobe__' });
let nativeReader;
let pricingHttp;
try {
  console.log('· safeFetch 真 HTTP：流式落盘、magic、空内容/伪造MIME/HTML/超限/取消');
  const file = path.join(root, 'stream.bin'); const handle = await fs.promises.open(file, 'w');
  let streamed;
  try { streamed = await safeFetch(`${base}/image.png`, { allowPrivate: true, onChunk: (chunk) => handle.write(chunk) }); } finally { await handle.close(); }
  assert.equal(streamed.body, null); assert.equal(streamed.bytes, png.length); assert.deepEqual(fs.readFileSync(file), png);
  for (const [route, error] of [['empty', /为空/], ['fake', /不是图片/], ['html', /网页（HTML）/], ['large', /超过下载上限/]]) {
    await assert.rejects(() => downloadImageAsDataUrl(`${base}/${route}`, { allowPrivate: true, maxBytes: 100 }), error);
  }
  const abort = new AbortController();
  const slow = safeFetch(`${base}/slow`, { allowPrivate: true, signal: abort.signal });
  await new Promise((resolve) => setTimeout(resolve, 50)); abort.abort(new Error('fixture cancel'));
  await assert.rejects(() => slow, /fixture cancel/);

  console.log('· 图片工具：无图成功、协议文件/URL回退、实际字节、部分失败/全失败');
  imageMessage(8101, [{ kind: 'image', url: `${base}/image.png` }, { kind: 'image', url: `${base}/missing` }]);
  const partial = await invoke('get_message_images', { messageId: 8101 });
  assert.equal(partial.ok, true); assert.match(partial.result, /共 1 张图（另有 1 张获取失败）/);
  assert.deepEqual(partial.mediaParts, [{ type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } }]);
  imageMessage(8102, [{ kind: 'image', file: 'cached-image' }, { kind: 'image', file: 'url-image' }]);
  const cached = await invoke('get_message_images', { messageId: 8102 }); assert.equal(cached.ok, true); assert.equal(cached.mediaParts.length, 2);
  imageMessage(8103, []); const none = await invoke('get_message_images', { messageId: 8103 }); assert.equal(none.ok, true); assert.equal(none.mediaParts.length, 0);
  imageMessage(8104, [{ kind: 'image', url: `${base}/fake` }, { kind: 'image', url: `${base}/missing` }]);
  const failed = await invoke('get_message_images', { messageId: 8104 }); assert.equal(failed.ok, false); assert.match(failed.error, /不是图片/); assert.match(failed.error, /404/);
  await assert.rejects(() => reader.image({ file: cache }), /受控目录/);
  assert.equal((await reader.image({ localFile: cache }, { localRoots: [root] })).mime, 'image/png');
  assert.equal(controlledMediaPath(cache, [stickers.imagesDir]), null);
  cfg.api.video = true;
  assert.equal((await reader.imageParts({ url: `${base}/gif` })).parts[0].type, 'image_url', '无ffmpeg时GIF回落原图');
  cfg.api.video = false;

  console.log('· 视频服务：开关、metadata白名单、off/frames/native/auto、离散帧与countclamp');
  store.appendIncoming('group:81', { mid: 8201, text: '[视频]', media: [{ kind: 'video', file: 'protocol-video', duration: 2, width: 640, height: 360, parts: [{ video_url: { url: 'data:secret' } }] }] });
  capability.register('video.frames.available', 'kernel', () => true);
  let lastFrames;
  capability.register('video.frames', 'kernel', async (_media, options) => {
    lastFrames = options.frames;
    return { parts: Array.from({ length: options.frames }, () => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } })), frameTimes: [0.5, 1], secret: 'data:base64,never-in-text' };
  });
  cfg.api.videoMode = 'frames';
  const frames = await invoke('read_video', { messageId: 8201, frames: 99 });
  assert.equal(frames.ok, true); assert.equal(lastFrames, 12); assert.equal(frames.mediaParts.length, 12); assert.match(frames.result.note, /不是连续视频/);
  assert.equal(frames.result.meta.duration, 2); assert.equal(frames.result.meta.width, 640);
  assert.ok(!JSON.stringify(frames.result).includes('base64')); assert.equal(frames.result.parts, undefined);
  assert.deepEqual(actionCalls.filter(([method, value]) => value === 'protocol-video').slice(0, 2).map(([method]) => method), ['getVideo', 'getFile']);
  await invoke('read_video', { messageId: 8201, frames: -8 }); assert.equal(lastFrames, 1);
  await invoke('read_video', { messageId: 8201, frames: 0 }); assert.equal(lastFrames, 1);
  await invoke('read_video', { messageId: 8201 }); assert.equal(lastFrames, 3);
  cfg.api.videoMode = 'off'; const off = await invoke('read_video', { messageId: 8201 }); assert.equal(off.result.route, 'meta'); assert.equal(off.mediaParts.length, 0); assert.match(off.result.routeReason, /关闭/);
  cfg.api.videoMode = 'native'; const original = await invoke('read_video', { messageId: 8201 }); assert.equal(original.result.route, 'native'); assert.equal(original.mediaParts[0].video_url.url, `${base}/video`);
  cfg.api.videoMode = 'auto'; cfg.api.videoModel = 'full-modal'; assert.equal((await invoke('read_video', { messageId: 8201 })).result.route, 'native');
  cfg.api.videoModel = ''; assert.equal((await invoke('read_video', { messageId: 8201 })).result.route, 'frames');
  cfg.skills['video-frames'].enabled = false; const disabled = await invoke('read_video', { messageId: 8201 }); assert.equal(disabled.ok, false); assert.match(disabled.error, /未启用/); cfg.skills['video-frames'].enabled = true;
  assert.equal((await missing.probe({ url: `${base}/video` })).route, 'meta'); assert.match((await missing.probe({ url: `${base}/video` })).routeReason, /抽帧能力不可用/);

  console.log('· send_image：未预览不联网、额度、真实预览、mime拒绝、URL→base64与同气泡备注');
  const session = {};
  const before = requests.length; const unpreviewed = await invoke('send_image', { url: `${base}/image.png` }, session);
  assert.equal(unpreviewed.ok, false); assert.match(unpreviewed.error, /先调用/); assert.equal(requests.length, before);
  assert.equal((await invoke('send_image', { url: 'file:///C:/secret' }, session)).ok, false); assert.equal(requests.length, before);
  capability.register('image.mime-support', 'kernel', () => false);
  const invisible = await invoke('send_image', { url: `${base}/image.png`, preview: true }, session); assert.equal(invisible.ok, true); assert.equal(invisible.mediaParts.length, 0);
  capability.register('image.mime-support', 'kernel', () => true);
  const preview = await invoke('send_image', { url: `${base}/image.png`, preview: true }, session); assert.equal(preview.mediaParts[0].type, 'image_url');
  sendImpl = async (_chat, parts) => { if (parts.some((part) => part.url)) throw new Error('protocol URL rejected'); return { msgId: 2000 + sent.length }; };
  const sendStart = sent.length;
  const result = await invoke('send_image', { url: `${base}/image.png`, note: 'with image' }, session);
  assert.equal(result.ok, true); assert.equal(session.sendImageState.sent, 1); assert.equal(session.sent.length, 1);
  assert.equal(sent[sendStart].segments[1].url, `${base}/image.png`); assert.ok(sent[sendStart + 1].segments[1].file.startsWith('base64://'));
  assert.deepEqual(sent[sendStart].segments[0], { type: 'text', text: 'with image' }); assert.deepEqual(sent[sendStart + 1].segments[0], { type: 'text', text: 'with image' });
  assert.equal(store.recent('group:81', 1)[0].text, 'with image[图片]');
  session.sendImageState.sent = 3; const noSend = sent.length; assert.equal((await invoke('send_image', { url: `${base}/image.png` }, session)).ok, false); assert.equal(sent.length, noSend);
  session.sendImageState.previews = 5; assert.equal((await invoke('send_image', { url: `${base}/image.png`, preview: true }, session)).ok, false);
  cfg.security.imageSend.maxBytesMB = 1;
  assert.match((await invoke('send_image', { url: `${base}/oversize-image`, preview: true }, {})).error, /超过下载上限/); cfg.security.imageSend.maxBytesMB = 5;
  await assert.rejects(() => send.sendImage('group:large', { base64: Buffer.alloc(15 * 1024 * 1024 + 1).toString('base64') }), /15 MB/);

  console.log('· 收藏/发送表情：下载→QQ→备注→受控缓存，file→getImage→base64，成功才记账');
  const collectStart = actionCalls.length;
  const collection = await invoke('collect_sticker', { messageId: 8102, note: 'fixture note' });
  assert.equal(collection.ok, true); assert.equal(collection.result.id, 'QQ:../emoji');
  assert.equal(actionCalls.slice(collectStart).find(([method]) => method === 'addCustomFace')[1], `base64://${png.toString('base64')}`);
  const entry = stickers.get(collection.result.id); assert.ok(entry.localFile); assert.ok(stickers.controlledLocal(entry.localFile));
  assert.equal(fs.readdirSync(stickers.imagesDir).length, 1); assert.ok(!fs.readdirSync(stickers.imagesDir)[0].includes('..'));
  imageImpl = async () => ({ file: cache });
  sendImpl = async (_chat, parts) => { if (!parts[0]?.file?.startsWith('base64://')) throw new Error('file send rejected'); return { msgId: 3000 + sent.length }; };
  const stickerStart = sent.length; const stickerSession = {};
  const stickerSent = await invoke('send_sticker', { stickerId: entry.id }, stickerSession);
  assert.equal(stickerSent.ok, true); assert.equal(sent.length - stickerStart, 3);
  assert.ok(sent[stickerStart].segments[0].file.startsWith('file:')); assert.equal(sent[stickerStart + 1].segments[0].file, pathToFileURL(cache).href); assert.ok(sent[stickerStart + 2].segments[0].file.startsWith('base64://'));
  assert.ok(sent.slice(stickerStart).every((item) => item.segments.length === 1)); assert.equal(stickers.get(entry.id).useCount, 1);
  const foreign = path.join(root, 'outside.png'); fs.writeFileSync(foreign, png);
  stickers.collect({ id: 'outside', url: pathToFileURL(foreign).href });
  const deniedStart = sent.length; assert.equal((await invoke('send_sticker', { stickerId: 'outside' })).ok, false); assert.equal(sent.length, deniedStart);
  stickers.collect({ id: 'http-sticker', url: `${base}/image.png` });
  const ready = await stickers.ensureSendable('http-sticker'); assert.ok(ready.localPath); assert.ok(controlledMediaPath(ready.localPath, [stickers.imagesDir]));
  addImpl = async () => { throw new Error('1000 limit'); };
  const beforeIndex = fs.readFileSync(path.join(root, 'stickers.json'));
  const limit = await invoke('collect_sticker', { messageId: 8102 }); assert.equal(limit.ok, false); assert.equal(limit.code, 'QQ_EMOJI_LIMIT'); assert.deepEqual(fs.readFileSync(path.join(root, 'stickers.json')), beforeIndex);
  addImpl = async () => ({ emojiId: 'new' }); noteImpl = async () => ({ ok: false });
  const badNote = await invoke('collect_sticker', { messageId: 8102, note: 'must confirm' }); assert.equal(badNote.ok, false); assert.equal(badNote.code, 'QQ_EMOJI_NOTE_FAILED'); assert.deepEqual(fs.readFileSync(path.join(root, 'stickers.json')), beforeIndex);
  const tooBig = path.join(root, 'big-cache.png'); fs.writeFileSync(tooBig, Buffer.alloc(15 * 1024 * 1024 + 1));
  imageImpl = async () => ({ file: tooBig });
  await assert.rejects(() => send.sendSticker('group:too-big', { fileId: 'oversize' }), /15 MB/);

  console.log('· 原生ffmpeg为可选运行能力：可用时验证真实探测/抽帧/GIF视频，无安装要求');
  if (spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status === 0 && spawnSync('ffprobe', ['-version'], { windowsHide: true }).status === 0) {
    videoFixture = path.join(root, 'fixture.mp4');
    const made = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=12:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', videoFixture], { windowsHide: true });
    assert.equal(made.status, 0, String(made.stderr));
    nativeReader = createMediaReader({ cfg: () => cfg, transport, capability, log });
    const standaloneReader = createMediaReader({ cfg: () => cfg, transport, log });
    cfg.api.videoMode = 'frames';
    const actualFrames = await standaloneReader.probe({ file: 'video-fixture' }, { count: 2 }); assert.equal(actualFrames.route, 'frames'); assert.equal(actualFrames.parts.length, 2); assert.equal(actualFrames.meta.width, 640); assert.equal(actualFrames.meta.height, 360);
    assert.ok(actualFrames.parts.every((part) => part.image_url.url.startsWith('data:image/jpeg;base64,'))); assert.ok(!JSON.stringify({ ...actualFrames, parts: undefined }).includes('base64'));
    cfg.api.video = true;
    const converted = await nativeReader.imageParts({ url: `${base}/gif` }); assert.equal(converted.parts[0].type, 'video_url'); assert.ok(converted.parts[0].video_url.url.startsWith('data:video/mp4;base64,'));
    cfg.api.vision = false; assert.equal((await nativeReader.imageParts({ url: `${base}/gif` })).parts[0].type, 'image_url'); cfg.api.vision = true;
    cfg.api.video = false; capability.register('image.mime-support', 'kernel', () => false);
    const firstFrame = await nativeReader.imageParts({ url: `${base}/gif` }); assert.equal(firstFrame.converted, 'gif-first-frame'); assert.ok(firstFrame.parts[0].image_url.url.startsWith('data:image/png;base64,'));
    cfg.api.video = true; capability.register('image.mime-support', 'kernel', () => true);
    cfg.api.videoMode = 'native';
    const nativeVideo = await nativeReader.probe({ url: `${base}/video` }); assert.equal(nativeVideo.route, 'native'); assert.ok(nativeVideo.parts[0].video_url.url.startsWith('data:video/mp4;base64,'));
    standaloneReader.close();
    cfg.api.videoMode = 'frames';
    const cancellingReader = createMediaReader({ cfg: () => cfg, transport, log });
    const nativePending = cancellingReader.probe({ path: videoFixture }, { count: 12 });
    let finished = false; nativePending.then(() => { finished = true; }, () => { finished = true; });
    const deadline = Date.now() + 5000;
    while (!fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(`qqa-media-${process.pid}-`)).some((name) => fs.existsSync(path.join(os.tmpdir(), name, 'frame-0.jpg')))) {
      assert.ok(!finished && Date.now() < deadline, '等待第一帧写出以取消真实抽帧子进程');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    cancellingReader.close(); await assert.rejects(() => nativePending, /服务已关闭/);
    console.log('  ✓ 本机ffmpeg/ffprobe真实执行通过');
  } else console.log('  SKIP 原生ffmpeg分支：当前执行环境不能调用ffmpeg/ffprobe（缺工具或执行权限）；能力提供者与不可用降级已验证');

  console.log('· 控制台音视频adapter：getRecord/getVideo、本地受控缓存、远端回退、失败逐项保留');
  const controlledDir = path.join(root, 'media'); fs.mkdirSync(controlledDir);
  const recordFile = path.join(controlledDir, 'record.wav'), movieFile = path.join(controlledDir, 'video.mp4');
  const playerImage = path.join(controlledDir, 'image.png'); fs.writeFileSync(playerImage, png);
  fs.writeFileSync(recordFile, wav); fs.writeFileSync(movieFile, videoFixture ? fs.readFileSync(videoFixture) : mp4Signature);
  const foreignRecord = path.join(root, 'outside.wav'); fs.writeFileSync(foreignRecord, wav);
  const playerCalls = [];
  const playerTransport = { actions: {
    sources: { recordFile, movieFile, playerImage, audioUrl: `${base}/audio`, videoUrl: `${base}/play-video` },
    async getRecord(id) {
      playerCalls.push(['getRecord', id]);
      if (id === 'record-local') return { data: { file: this.sources.recordFile } };
      if (id === 'record-url') return { url: this.sources.audioUrl };
      if (id === 'outside-record') return { file: foreignRecord };
      throw new Error('protocol record unavailable');
    },
    async getVideo(id) { playerCalls.push(['getVideo', id]); if (id === 'video-local') return { file: this.sources.movieFile }; if (id === 'video-url') return { url: this.sources.videoUrl }; throw new Error('protocol video unavailable'); },
    async getImage(id) { playerCalls.push(['getImage', id]); if (id === 'image-local') return { file: this.sources.playerImage }; throw new Error('protocol image unavailable'); },
  } };
  const playerCfg = { security: { allowPrivateImageHosts: true, browseLock: { enabled: true, hosts: ['127.0.0.1'] } } };
  const player = createMediaDataAdapter({ transport: playerTransport, dataDir: root, cfg: () => playerCfg });
  const playable = await player.resolveAll([
    { kind: 'record', file: 'record-local' }, { kind: 'video', file: 'video-local' },
    { kind: 'audio', file: 'record-url' }, { kind: 'video', file: 'video-url' },
    { kind: 'record', file: 'protocol-error', url: `${base}/audio` },
    { kind: 'video', file: 'protocol-error', url: `${base}/missing` },
    { kind: 'record', file: 'outside-record' }, { kind: 'image', url: `${base}/image.png` },
    { kind: 'image', file: 'image-local' },
  ]);
  assert.ok(playable[0].startsWith('data:audio/wav;base64,')); assert.ok(playable[1].startsWith('data:video/mp4;base64,'));
  assert.ok(playable[2].startsWith('data:audio/wav;base64,')); assert.ok(playable[3].startsWith('data:video/mp4;base64,')); assert.equal(playable[4], playable[0]);
  assert.equal(playable[5], null); assert.equal(playable[6], null); assert.ok(playable[7].startsWith('data:image/png;base64,'));
  assert.equal(playable[8], playable[7]); assert.ok(playerCalls.some(([method, id]) => method === 'getImage' && id === 'image-local'));
  assert.ok(playerCalls.some(([method, id]) => method === 'getRecord' && id === 'record-local')); assert.ok(playerCalls.some(([method, id]) => method === 'getVideo' && id === 'video-url'));
  playerCfg.security.browseLock.hosts = ['allowed.invalid']; const lockedStart = requests.length;
  assert.deepEqual(await player.resolveAll([{ kind: 'audio', url: `${base}/audio` }, { kind: 'video', url: `${base}/play-video` }, { kind: 'image', url: `${base}/image.png` }]), [null, null, null]);
  assert.equal(requests.length, lockedStart, '所有媒体远端入口一致遵守浏览锁定');

  console.log('· 转发两入口并发：model先赢只落一次，缓存保留图片，空节点不覆盖占位');
  const forwardMessage = store.appendIncoming('group:81', { mid: 8301, text: '[合并转发聊天记录]', media: [{ kind: 'forward', id: 'forward-fixture' }] });
  let forwardCalls = 0, releaseForward;
  const forwardData = { messages: [{ sender: { nickname: 'Fixture' }, message: [{ type: 'text', data: { text: 'forward picture' } }, { type: 'image', data: { url: `${base}/image.png` } }] }] };
  transport.actions.getForward = () => ++forwardCalls === 1 ? new Promise((resolve) => { releaseForward = resolve; }) : Promise.resolve(forwardData);
  const uiPending = readArchivedForward({ store, transport, chatKey: 'group:81', localId: forwardMessage.id });
  await new Promise((resolve) => setImmediate(resolve));
  const modelForward = await invoke('read_forward', { messageId: 8301 }); assert.equal(modelForward.ok, true);
  const modelDisk = fs.readFileSync(path.join(root, 'messages', 'group_81.json'));
  releaseForward(forwardData); const uiForward = await uiPending;
  assert.equal(uiForward.cached, true); assert.equal(store.findByMid('group:81', 8301).media.filter((item) => item.kind === 'image').length, 1);
  assert.deepEqual(fs.readFileSync(path.join(root, 'messages', 'group_81.json')), modelDisk);
  assert.ok(uiForward.messages.some((item) => item.media.some((media) => media.kind === 'image' && media.url === `${base}/image.png`)));
  const emptyForward = store.appendIncoming('group:81', { mid: 8302, text: '[empty forward placeholder]', media: [{ kind: 'forward', id: 'empty-forward' }] });
  const emptyDisk = fs.readFileSync(path.join(root, 'messages', 'group_81.json'));
  transport.actions.getForward = async () => ({ messages: [{ message: [] }, { content: '  ' }] });
  await assert.rejects(() => readArchivedForward({ store, transport, chatKey: 'group:81', localId: emptyForward.id }), /内容为空/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'messages', 'group_81.json')), emptyDisk);

  console.log('· 真实HTTP计费：手填cached=0按input计、custom=0免费，空provider按vendor分开');
  const pricingDir = path.join(root, 'pricing'); const pricingConfig = createConfig({ dataDir: pricingDir, defaults: buildDefaultConfig(), log }); pricingConfig.load();
  pricingConfig.update({ server: { port: 0, token: 'fixture-pricing' }, api: { useOfficialPrice: false, priceInputPerM: 10, priceOutputPerM: 0, priceCachedPerM: 0 } });
  const usageSessions = createSessionRegistry({ dataDir: pricingDir, log });
  for (const vendor of ['https://first.invalid/v1', 'https://second.invalid/v1']) {
    const session = usageSessions.create('group:81'); session.model = 'same-model'; session.providerId = ''; session.provider = ''; session.vendor = vendor;
    usageSessions.finish(session.id, 'done', { usage: { promptTokens: 1000000, cachedTokens: 1000000, completionTokens: 0, totalTokens: 1000000, calls: 1 }, messages: [] });
  }
  const staticDir = path.join(pricingDir, 'static'); fs.mkdirSync(staticDir); fs.writeFileSync(path.join(staticDir, 'index.html'), 'fixture');
  pricingHttp = createHttpServer({ config: pricingConfig, log, staticDir });
  registerConsoleRoutes(pricingHttp, { config: pricingConfig, sessions: usageSessions, store, dataDir: pricingDir, log, orchestrator: { status: () => ({}) } });
  const pricingPort = await pricingHttp.listen();
  const usage = () => fetch(`http://127.0.0.1:${pricingPort}/api/usage/breakdown?range=today&by=provider`, { headers: { 'x-console-token': 'fixture-pricing' } }).then((response) => response.json());
  const manualCost = await usage(); assert.equal(manualCost.totals.cost, 20); assert.equal(manualCost.rows.length, 2); assert.ok(manualCost.rows.every((row) => row.cost === 10));
  pricingConfig.update({ api: { modelPrices: { 'same-model': { in: 10, out: 0, cached: 0 } } } }); assert.equal((await usage()).totals.cost, 0);
  await pricingHttp.close(); pricingHttp = null;

  console.log('· close释放pending协议读取，不等待不可取消的远端Promise');
  const held = createMediaReader({ transport: { actions: { getImage: () => new Promise(() => {}) } }, log });
  const pending = held.image({ file: 'held' }); await new Promise((resolve) => setImmediate(resolve)); held.close(); await assert.rejects(() => pending, /服务已关闭/);
  assert.equal(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(`qqa-media-${process.pid}-`)).length, 0, '每次处理都清理自己创建的临时媒体目录');
  console.log('✓ 81-media-spec-completion：真实媒体行为全部通过');
} finally {
  reader.close(); missing.close(); nativeReader?.close(); permissions.close();
  await pricingHttp?.close();
  server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('qqa-media-spec-'));
  fs.rmSync(root, { recursive: true, force: true });
}

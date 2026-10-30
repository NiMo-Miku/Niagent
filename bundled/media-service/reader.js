// 媒体读取：受限下载、协议缓存回退与可选 ffmpeg。二进制只出现在 parts 中。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { safeFetch, downloadImageAsDataUrl, detectMime, validateMediaUrl } from '../../src/kernel/safe-fetch.js';

const MB = 1024 * 1024;
const http = (value) => /^https?:\/\//i.test(String(value ?? ''));
const clamp = (value, fallback, max) => Math.max(1, Math.min(max, Math.floor(value !== undefined && Number.isFinite(Number(value)) ? Number(value) : Number(fallback) || 3)));
const message = (err) => String(err?.message ?? err);
const localPath = (value) => String(value ?? '').startsWith('file:') ? fileURLToPath(value) : String(value ?? '');
// Re-encoding is not a reason to enlarge the source. Video encoders need even
// dimensions, with a two-pixel floor for one-pixel GIFs and very thin images.
function downscaleFilter(max, even = false) {
  if (!even) return `scale='min(${max},iw)':'min(${max},ih)':force_original_aspect_ratio=decrease`;
  const ratio = `min(1,min(${max}/iw,${max}/ih))`;
  return `scale='max(2,2*trunc(iw*${ratio}/2))':'max(2,2*trunc(ih*${ratio}/2))'`;
}
async function cancellable(promise, signal) {
  let abort;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      abort = () => reject(signal.reason ?? new Error('媒体读取已中止'));
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    })]);
  } finally { signal.removeEventListener('abort', abort); }
}
export function controlledMediaPath(value, roots = []) {
  try {
    const target = fs.realpathSync(localPath(value));
    if (!fs.statSync(target).isFile()) return null;
    return roots.some((root) => {
      const relative = path.relative(fs.realpathSync(root), target);
      return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    }) ? target : null;
  } catch { return null; }
}

function runProcess(command, args, { signal, timeoutMs = 25000, maxOutput = 2 * MB } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new Error('媒体读取已中止')); return; }
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = []; const errors = []; let size = 0; let settled = false; let stoppedError;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const stop = (error) => {
      if (settled || stoppedError) return;
      stoppedError = error;
      try { child.kill(); } catch (err) { finish(err); }
    };
    const abort = () => stop(signal.reason ?? new Error('媒体读取已中止'));
    const timer = setTimeout(() => stop(new Error('媒体处理超时')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (data) => {
      size += data.length;
      if (size > maxOutput) stop(new Error('媒体探测输出超限')); else output.push(data);
    });
    child.stderr.on('data', (data) => { if (errors.reduce((n, item) => n + item.length, 0) < 8192) errors.push(data); });
    child.on('error', (error) => finish(error));
    child.on('close', (code) => finish(stoppedError ?? (code === 0 ? null : new Error(`媒体处理失败：${Buffer.concat(errors).toString('utf8').slice(-1000)}`)), Buffer.concat(output).toString('utf8')));
  });
}

export function createMediaReader({ cfg, transport, capability, log = console, fetchImpl, dnsLookup,
  ffmpegPath = 'ffmpeg', ffprobePath = 'ffprobe' } = {}) {
  const readCfg = () => (typeof cfg === 'function' ? cfg() : cfg) ?? {};
  const operations = new Set(); const native = new Map(); let closed = false;
  const fetchOptions = () => {
    const security = readCfg().security ?? {};
    return { fetchImpl, dnsLookup, allowPrivate: security.allowPrivateImageHosts === true,
      browseLocked: security.browseLock?.enabled === true, allowedHosts: security.browseLock?.hosts ?? [] };
  };
  async function operation(signal, fn) {
    if (closed) throw new Error('媒体读取服务已关闭');
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason ?? new Error('媒体读取已中止'));
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    operations.add(controller);
    try {
      if (controller.signal.aborted) throw controller.signal.reason;
      const result = await fn(controller.signal);
      if (controller.signal.aborted) throw controller.signal.reason;
      return result;
    } finally { operations.delete(controller); signal?.removeEventListener('abort', abort); }
  }
  async function available(command, signal) {
    if (!command) return false;
    const cached = native.get(command);
    if (cached && (cached.ok || Date.now() - cached.at < 60000)) return cached.ok;
    try { await runProcess(command, ['-version'], { signal, timeoutMs: 5000 }); native.set(command, { ok: true }); return true; }
    catch (err) { if (signal?.aborted) throw err; native.set(command, { ok: false, at: Date.now() }); return false; }
  }
  async function inTemp(fn) {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `qqa-media-${process.pid}-`));
    try { return await fn(dir); }
    finally { await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch((err) => log.warn?.(`媒体临时文件清理失败：${message(err)}`)); }
  }
  function imageBytes(buffer, maxBytes) {
    if (!buffer.length) throw new Error('图片内容为空');
    if (buffer.length > maxBytes) throw new Error('图片超过下载上限');
    const mime = detectMime(buffer);
    if (!mime) throw new Error('文件不是 png/jpg/gif/webp 图片');
    return { buffer, mime, bytes: buffer.length, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
  }
  async function readImage(media, { signal, maxBytes = 5 * MB, localRoots = [] } = {}) {
    const errors = []; const tried = new Set();
    const attempt = async (source, trustedLocal = false) => {
      const key = `${trustedLocal}:${source}`;
      if (!source || tried.has(key)) return null;
      tried.add(key);
      try {
        if (http(source)) return await downloadImageAsDataUrl(source, { ...fetchOptions(), signal, maxBytes });
        if (/^data:image\/[\w.+-]+;base64,/i.test(source)) return imageBytes(Buffer.from(String(source).split(',')[1], 'base64'), maxBytes);
        const file = trustedLocal ? localPath(source) : controlledMediaPath(source, localRoots);
        if (!file) throw new Error('本地图片不在受控目录中');
        const stat = await fs.promises.stat(file);
        if (!stat.isFile() || stat.size > maxBytes) throw new Error('图片文件不存在或超过下载上限');
        return imageBytes(await fs.promises.readFile(file), maxBytes);
      } catch (err) { if (signal?.aborted) throw err; errors.push(message(err)); return null; }
    };
    for (const source of [media?.url, media?.path, http(media?.file) || String(media?.file).startsWith('data:') ? media.file : null]) {
      const result = await attempt(source); if (result) return result;
    }
    const own = await attempt(media?.localFile ?? media?.file); if (own) return own;
    if (media?.file && transport?.actions?.getImage) {
      try {
        const cached = await cancellable(transport.actions.getImage(media.file, { signal }), signal);
        for (const source of [cached?.file, cached?.path, cached?.url]) { const result = await attempt(source, !http(source)); if (result) return result; }
      } catch (err) { if (signal?.aborted) throw err; errors.push(message(err)); }
    }
    throw new Error(errors.join('；') || '图片地址已失效');
  }
  const image = (media, options = {}) => operation(options.signal, (signal) => readImage(media, { ...options, signal }));

  async function convertImage(data, signal) {
    const api = readCfg().api ?? {};
    let gifUnsupported = false;
    if (data.mime === 'image/gif' && api.vision === true) {
      const support = capability?.providers?.('image.mime-support')[0]?.provider;
      if (typeof support === 'function') {
        try { gifUnsupported = await cancellable(Promise.resolve(support(data.mime)), signal) === false; }
        catch (err) { if (signal.aborted) throw err; }
      }
    }
    if (!(data.mime === 'image/gif' && api.vision === true && (api.video === true || gifUnsupported)) && (data.mime === 'image/gif' || data.bytes <= 512 * 1024)) {
      return { ...data, parts: [{ type: 'image_url', image_url: { url: data.dataUrl } }] };
    }
    if (!await available(ffmpegPath, signal)) return { ...data, parts: [{ type: 'image_url', image_url: { url: data.dataUrl } }] };
    return inTemp(async (dir) => {
      const input = path.join(dir, 'input'); await fs.promises.writeFile(input, data.buffer);
      if (data.mime === 'image/gif' && api.vision === true && api.video === true) {
        try {
          let duration = 0;
          if (await available(ffprobePath, signal)) {
            const info = JSON.parse(await runProcess(ffprobePath, ['-v', 'error', '-show_format', '-of', 'json', input], { signal, timeoutMs: 15000 }));
            duration = Number(info.format?.duration) || 0;
          }
          const fps = duration > 0 ? Math.max(1, Math.min(24, 24 / duration)) : 12;
          const output = path.join(dir, 'gif.mp4');
          await runProcess(ffmpegPath, ['-y', '-v', 'error', '-i', input, '-vf', `fps=${fps},${downscaleFilter(480,true)}`, '-frames:v', '24', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-fs', String(8 * MB), output], { signal, timeoutMs: 45000 });
          const stat = await fs.promises.stat(output);
          if (stat.size && stat.size <= 8 * MB) {
            const dataUrl = `data:video/mp4;base64,${(await fs.promises.readFile(output)).toString('base64')}`;
            return { ...data, parts: [{ type: 'video_url', video_url: { url: dataUrl } }], converted: 'gif-video' };
          }
        } catch (err) { if (signal.aborted) throw err; log.warn?.(`GIF 转视频失败，使用原图：${message(err)}`); }
      }
      if (data.mime === 'image/gif' && gifUnsupported) {
        try {
          const output = path.join(dir, 'first-frame.png');
          await runProcess(ffmpegPath, ['-y', '-v', 'error', '-i', input, '-vf', downscaleFilter(768), '-frames:v', '1', output], { signal, timeoutMs: 20000 });
          const frame = imageBytes(await fs.promises.readFile(output), 4 * MB);
          return { ...frame, parts: [{ type: 'image_url', image_url: { url: frame.dataUrl } }], converted: 'gif-first-frame' };
        } catch (err) { if (signal.aborted) throw err; }
      }
      if (data.mime !== 'image/gif' && data.bytes > 512 * 1024) {
        try {
          const output = path.join(dir, 'image.jpg');
          await runProcess(ffmpegPath, ['-y', '-v', 'error', '-i', input, '-vf', downscaleFilter(1568), '-frames:v', '1', '-q:v', '4', output], { signal });
          const smaller = await fs.promises.readFile(output);
          if (smaller.length < data.bytes) { const compressed = imageBytes(smaller, data.bytes); return { ...compressed, parts: [{ type: 'image_url', image_url: { url: compressed.dataUrl } }] }; }
        } catch (err) { if (signal.aborted) throw err; }
      }
      return { ...data, parts: [{ type: 'image_url', image_url: { url: data.dataUrl } }] };
    });
  }
  const imageParts = (media, options = {}) => operation(options.signal, async (signal) => convertImage(await readImage(media, { ...options, signal }), signal));

  async function framesAvailable(signal) {
    if (readCfg().skills?.['video-frames']?.enabled === false) return false;
    const provider = capability?.providers?.('video.frames.available')[0]?.provider;
    if (provider !== undefined) {
      try { return (typeof provider === 'function' ? await (signal ? cancellable(Promise.resolve(provider()), signal) : provider()) : provider) === true; } catch (err) { if (signal?.aborted) throw err; return false; }
    }
    return Boolean(capability?.providers?.('video.frames')?.length) || available(ffmpegPath, signal);
  }
  async function localize(media, dir, signal) {
    const errors = []; const tried = new Set(); let details = media ?? {};
    const attempt = async (source, trusted = false) => {
      if (!source || tried.has(String(source))) return null;
      tried.add(String(source));
      try {
        if (!http(source)) {
          if (!trusted) return null;
          const file = localPath(source); const stat = await fs.promises.stat(file);
          if (!stat.isFile() || stat.size > 200 * MB) throw new Error('视频文件不存在或超过 200 MB 上限');
          let url = http(details.url) ? details.url : http(media.url) ? media.url : null;
          if (url) { try { url = await validateMediaUrl(url, { ...fetchOptions(), signal }); } catch { url = null; } }
          return { file, bytes: stat.size, url, details };
        }
        const file = path.join(dir, 'video'); const handle = await fs.promises.open(file, 'w'); let response;
        try { response = await safeFetch(source, { ...fetchOptions(), signal, maxBytes: 200 * MB, timeoutMs: 30000, onChunk: (chunk) => handle.write(chunk) }); }
        finally { await handle.close(); }
        if (response.status !== 200 || !response.bytes || response.truncated) throw new Error(`视频下载失败（HTTP ${response.status}，空内容或超过 200 MB 上限）`);
        return { file, bytes: response.bytes, url: response.finalUrl, details };
      } catch (err) { if (signal?.aborted) throw err; errors.push(message(err)); }
      return null;
    };
    const direct = await attempt(media?.path, true); if (direct) return direct;
    if (media?.file) for (const method of ['getVideo', 'getFile', 'getImage']) {
      if (!transport?.actions?.[method]) continue;
      try {
        const found = await cancellable(transport.actions[method](media.file, { signal }), signal);
        details = { ...details, ...(found ?? {}) };
        for (const source of [found?.file, found?.path, found?.url]) {
          const result = await attempt(source, !http(source)); if (result) return result;
        }
      } catch (err) { if (signal?.aborted) throw err; errors.push(message(err)); }
    }
    for (const url of [media?.url, http(media?.file) ? media.file : null]) { const result = await attempt(url); if (result) return result; }
    return { file: null, bytes: Number(media?.size) || 0, url: null, details, error: errors.join('；') || '视频地址已失效' };
  }
  async function probeVideo(media, { signal, count } = {}) {
    if (readCfg().skills?.['video-frames']?.enabled === false) throw new Error('视频服务未启用');
    return inTemp(async (dir) => {
      const source = await localize(media, dir, signal);
      let format = {}; let video = {};
      if (source.file && await available(ffprobePath, signal)) {
        try {
          const info = JSON.parse(await runProcess(ffprobePath, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', source.file], { signal, timeoutMs: 15000 }));
          format = info.format ?? {}; video = info.streams?.find((item) => item.codec_type === 'video') ?? {};
        } catch (err) { if (signal.aborted) throw err; source.error = message(err); }
      }
      const details = source.details;
      const numeric = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
      const label = (value) => /^[\w., -]{0,120}$/.test(String(value ?? '')) ? String(value ?? '') : '';
      const meta = { duration: numeric(format.duration ?? video.duration ?? details.duration),
        width: numeric(video.width ?? details.width), height: numeric(video.height ?? details.height),
        size: source.bytes, format: label(format.format_name ?? details.format), codec: label(video.codec_name ?? details.codec) };
      const configured = readCfg().api?.videoMode ?? 'auto';
      const mode = ['auto', 'native', 'frames', 'off'].includes(configured) ? configured : 'auto';
      const frameCount = clamp(count, readCfg().skills?.['video-frames']?.settings?.frames ?? 3, 12);
      const hasFrames = mode !== 'off' && await framesAvailable(signal);
      const route = mode === 'off' ? 'meta' : mode === 'native' ? source.url ? 'native' : 'meta'
        : mode === 'frames' ? hasFrames ? 'frames' : 'meta'
          : readCfg().api?.videoModel && source.url ? 'native' : hasFrames ? 'frames' : 'meta';
      if (route === 'native') {
        let url = source.url;
        if (readCfg().api?.video === true && source.file && await available(ffmpegPath, signal)) {
          try {
            const output = path.join(dir, 'native.mp4');
            await runProcess(ffmpegPath, ['-y', '-v', 'error', '-i', source.file, '-vf', `fps=24,${downscaleFilter(480,true)}`, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-fs', String(20 * MB), output], { signal, timeoutMs: 120000 });
            const stat = await fs.promises.stat(output);
            if (stat.size && stat.size <= 20 * MB) url = `data:video/mp4;base64,${(await fs.promises.readFile(output)).toString('base64')}`;
          } catch (err) { if (signal.aborted) throw err; }
        }
        return { meta, route, note: '原生视频', parts: [{ type: 'video_url', video_url: { url } }] };
      }
      if (route === 'frames') {
        try {
          if (capability?.providers?.('video.frames')?.length) {
            const input = { ...media, path: source.file ?? media.path, signal };
            const result = capability.claimAsync ? (await cancellable(capability.claimAsync('video.frames', input, { frames: frameCount, count: frameCount, signal }), signal))?.result
              : await cancellable(Promise.resolve(capability.providers('video.frames')[0].provider(input, { frames: frameCount, count: frameCount, signal })), signal);
            const parts = (Array.isArray(result) ? result : result?.parts ?? result?.frames ?? []).filter((part) => part?.type === 'image_url' && typeof part.image_url?.url === 'string').slice(0, frameCount);
            if (parts.length) return { meta, route, count: parts.length, frameTimes: (result.frameTimes ?? []).slice(0, parts.length).map(Number).filter(Number.isFinite), note: '以下是离散抽帧，不是连续视频', parts };
          }
          if (source.file && await available(ffmpegPath, signal)) {
            const parts = []; const frameTimes = [];
            for (let i = 0; i < frameCount; i++) {
              const at = meta.duration > 0 ? meta.duration * (i + 1) / (frameCount + 1) : i;
              const file = path.join(dir, `frame-${i}.jpg`);
              await runProcess(ffmpegPath, ['-y', '-v', 'error', '-ss', String(at), '-i', source.file, '-vf', downscaleFilter(1568), '-frames:v', '1', '-q:v', '4', file], { signal });
              const data = imageBytes(await fs.promises.readFile(file), 5 * MB);
              parts.push({ type: 'image_url', image_url: { url: data.dataUrl } }); frameTimes.push(at);
            }
            return { meta, route, count: parts.length, frameTimes, note: '以下是离散抽帧，不是连续视频', parts };
          }
        } catch (err) { if (signal.aborted) throw err; source.error = message(err); }
      }
      return { meta, route: 'meta', routeReason: mode === 'off' ? '视频模式已关闭' : source.error || (mode === 'native' ? '没有可用的视频 URL' : '抽帧能力不可用'), note: '只给视频元信息', parts: [] };
    });
  }
  const probe = (media, options = {}) => operation(options.signal, (signal) => probeVideo(media, { ...options, signal }));
  function close() { closed = true; for (const controller of operations) controller.abort(new Error('媒体读取服务已关闭')); }
  return { image, imageParts, probe, framesAvailable, close };
}

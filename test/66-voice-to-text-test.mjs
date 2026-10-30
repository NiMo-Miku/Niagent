// voice-to-text 端到端验证：起假 ASR + 假语音源，真跑 provider。
// 证明：SSRF 防护默认拒绝内网；注入 fetch 后 multipart / 解析 / 降级各路径都正确。
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'bundled/voice-to-text/skill.json'), 'utf8'));
const mod = await import(pathToFileURL(path.join(root, 'bundled/voice-to-text/index.js')).href);
const { safeFetch } = await import(pathToFileURL(path.join(root, 'src/kernel/safe-fetch.js')).href);

/* ---------- 假服务 ---------- */
let received = { hasFile: false, model: '', language: '' };
const asr = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('latin1');
    received.hasFile = /name="file"; filename="voice"/.test(raw);
    received.model = /name="model"\r\n\r\n([^\r]*)/.exec(raw)?.[1] ?? '';
    received.language = /name="language"\r\n\r\n([^\r]*)/.exec(raw)?.[1] ?? '';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ text: '今天天气不错' }));
  });
});
await new Promise((r) => asr.listen(0, '127.0.0.1', r));

const voice = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'audio/silk' });
  res.end(Buffer.concat([Buffer.from([0x02, 0x01]), Buffer.alloc(2048, 0x55)]));
});
await new Promise((r) => voice.listen(0, '127.0.0.1', r));

const failing = http.createServer((req, res) => { res.writeHead(500); res.end('nope'); });
await new Promise((r) => failing.listen(0, '127.0.0.1', r));

const asrPort = asr.address().port;
const voicePort = voice.address().port;
const failPort = failing.address().port;

/**
 * 注入用 fetch：把虚拟 host 重写到对应本机端口（仅测试；插件生产路径没有这条路）。
 * 通过公开 HTTP facade 注入测试传输；虚拟音频 host 重写到本机，ASR 保持其本机端口。
 */
const routes = { 'voice.test': voicePort };
const injectFetch = () => async (url, init) => {
  const u = new URL(String(url));
  const port = routes[u.hostname];
  return fetch(port ? `http://127.0.0.1:${port}${u.pathname}` : String(url), init);
};

const SEG = { type: 'record', data: { file: 'http://voice.test/v.record' } };
const asrBase = () => `http://127.0.0.1:${asrPort}/v1`;

function makeCtx(settings, inject) {
  const registered = [];
  mod.default.setup({
    registerCapability: (n, fn) => registered.push({ n, fn }),
    log: { info() {}, warn() {}, debug() {} },
    config: { get: (k) => settings[k], all: () => ({ ...settings }) },
    http: { fetch: async (url, init) => {
      const dto = await safeFetch(url, { ...init, expectBinary: true, ...(inject ? { fetchImpl: inject, allowPrivate: true } : {}) });
      const response = new Response(dto.body, { status: dto.status, headers: dto.headers });
      Object.defineProperty(response, 'truncated', { value: dto.truncated === true });
      return response;
    } },
  });
  return registered.find((r) => r.n === 'media.transcribe')?.fn;
}

/* ---------- A. 清单契约 ---------- */
console.log('=== A. 清单契约 ===');
{
  assert.equal(manifest.id, 'voice-to-text');
  assert.equal(manifest.kind, 'skill');
  assert.equal(manifest.enabledByDefault, false, '默认不启用（外部付费调用须用户显式打开）');
  assert.ok(manifest.permissions.includes('net.outbound'), '声明 net.outbound');
  for (const key of ['enabled', 'baseUrl', 'model', 'apiKey', 'language', 'maxBytes', 'timeoutMs']) {
    assert.ok(manifest.configSchema[key], `configSchema 声明 ${key}`);
  }
  assert.equal(manifest.configSchema.apiKey.format, 'password', '密钥标 password（内核遮蔽）');
  assert.equal(manifest.configSchema.apiKey.secret, true, '密钥标 secret');
  assert.ok(manifest.configSchema.maxBytes.minimum >= 1 && manifest.configSchema.maxBytes.maximum <= 20, '大小上下界合理');
  assert.ok(manifest.configSchema.timeoutMs.maximum <= 120000, '超时上界合理');
  console.log('✓ 清单契约齐备（默认关 / 权限 / 密钥遮蔽 / 上下界）');
}

/* ---------- B. SSRF 防护默认生效 ---------- */
console.log('=== B. SSRF 防护：语音 URL 指向内网被拒 ===');
{
  await assert.rejects(
    () => safeFetch(`http://127.0.0.1:${voicePort}/v.record`, { expectBinary: true }),
    /拒绝访问内网地址/,
    'safeFetch 拒绝内网（语音只该来自 QQ 官方服务器）',
  );
  const provider = makeCtx({ enabled: true, baseUrl: asrBase(), model: 'whisper-1', timeoutMs: 5000 });
  assert.equal(
    await provider({ type: 'record', data: { file: `http://127.0.0.1:${voicePort}/v.record` } }),
    null,
    '插件默认路径也不会去取内网音频',
  );
  console.log('✓ 内网地址被拒，且插件默认不放行');
}

/* ---------- C. 端到端转写 ---------- */
console.log('=== C. 端到端转写成功 ===');
{
  const provider = makeCtx(
    { enabled: true, baseUrl: asrBase(), model: 'whisper-1', language: 'zh', maxBytes: 8, timeoutMs: 8000, apiKey: 'sk-test' },
    injectFetch(),
  );
  const text = await provider(SEG);
  assert.equal(text, '今天天气不错', `转写结果正确（实际 ${JSON.stringify(text)}）`);
  assert.ok(received.hasFile, 'multipart 带了 file 段');
  assert.equal(received.model, 'whisper-1', 'model 传对了');
  assert.equal(received.language, 'zh', 'language 传对了');
  console.log('✓ 语音字节 → multipart → ASR → 文本，全链路通');
}

/* ---------- D. 降级路径 ---------- */
console.log('=== D. 任何失败都退 null（内核退 [语音] 占位符）===');
{
  const cases = [
    ['未启用', { enabled: false, baseUrl: asrBase() }, SEG],
    ['无baseUrl', { enabled: true, baseUrl: '' }, SEG],
    ['语音地址非绝对 URL', { enabled: true, baseUrl: asrBase() }, { type: 'record', data: { file: '/local/a.silk' } }],
    ['缺 file 字段', { enabled: true, baseUrl: asrBase() }, { type: 'record', data: {} }],
  ];
  for (const [name, settings, seg] of cases) {
    const provider = makeCtx(settings, injectFetch());
    assert.equal(await provider(seg), null, `${name} → null`);
  }
  // ASR 返回 500（baseUrl 直指真实端口，走全局 fetch）
  const failProvider = makeCtx({ enabled: true, baseUrl: `http://127.0.0.1:${failPort}/v1`, timeoutMs: 5000 }, injectFetch());
  assert.equal(await failProvider(SEG), null, 'ASR 500 → null');

  // 语音源 404：只有 /v.record 正常，其它路径 404
  const picky = http.createServer((req, res) => {
    if (req.url === '/v.record') {
      res.writeHead(200, { 'content-type': 'audio/silk' });
      res.end(Buffer.concat([Buffer.from([2, 1]), Buffer.alloc(512, 85)]));
    } else { res.writeHead(404); res.end('nope'); }
  });
  await new Promise((r) => picky.listen(0, '127.0.0.1', r));
  routes['picky.test'] = picky.address().port;
  const badProvider = makeCtx({ enabled: true, baseUrl: asrBase(), timeoutMs: 5000 }, injectFetch());
  assert.equal(await badProvider({ type: 'record', data: { file: 'http://picky.test/missing' } }), null, '语音 404 → null');
  picky.close();
  console.log('✓ 未启用 / 无地址 / 非法地址 / 缺字段 / ASR 500 / 语音 404，全部安全退 null');
}

/* ---------- E. 响应解析容错 ---------- */
console.log('=== E. 响应解析容错 ===');
{
  const cases = [
    ['标准 {text}', '{"text":"甲"}', '甲'],
    ['嵌套 {data:{text}}', '{"data":{"text":"乙"}}', '乙'],
    ['result.text', '{"result":{"text":"丙"}}', '丙'],
    ['空 text', '{"text":""}', null],
    ['非法 JSON', 'not json', null],
  ];
  let port = 41100;
  for (const [name, payload, expect] of cases) {
    const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(payload); });
    await new Promise((r) => srv.listen(port, '127.0.0.1', r));
    // ASR 用真实端口（POST 走全局 fetch）；语音 URL 才用虚拟 host（走注入）
    const provider = makeCtx({ enabled: true, baseUrl: `http://127.0.0.1:${port}/v1`, timeoutMs: 5000 }, injectFetch());
    const out = await provider(SEG);
    assert.equal(out, expect, `${name} → ${JSON.stringify(expect)}（实际 ${JSON.stringify(out)}）`);
    srv.close();
    port += 1;
  }
  console.log('✓ 五种响应形状解析正确');
}

/* ---------- F. 超长截断 ---------- */
console.log('=== F. 超长文本截断 ===');
{
  const long = '啊'.repeat(5000);
  const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ text: long })); });
  await new Promise((r) => srv.listen(41999, '127.0.0.1', r));
  const provider = makeCtx({ enabled: true, baseUrl: 'http://127.0.0.1:41999/v1', timeoutMs: 5000 }, injectFetch());
  const out = await provider(SEG);
  assert.ok(out.length < 4100, `超长被截断（${out.length}）`);
  assert.ok(out.endsWith('…（已截断）'), '截断有明确标记');
  srv.close();
  console.log('✓ 超长截断并标记');
}

asr.close(); voice.close(); failing.close();
console.log('\n✓ 66 语音转文字端到端：全部通过');

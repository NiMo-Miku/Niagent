// voice-to-text：QQ 语音转文字（SPEC §8 媒体能力 / media.transcribe）。
//
// 内核链路已就位：OneBot 把语音归一为 {type:'record', file, url}，ingest 调 media.transcribe
// 能力，拿不到就退[语音] 占位符。本插件提供该能力的默认实现，走 OpenAI 兼容的
// /audio/transcriptions，因此任何兼容服务都能用（用户自填地址与密钥）。
//
// 安全与边界：
//   - 语音下载与转写 POST 都走公共 HTTP 门（授权、逐跳 SSRF 校验与实例取消）。
//   - 密钥只从ctx.config.get('apiKey') 读（内核按 configSchema 遮蔽，不回传明文到日志）。
//   - 大小/超时/返回长度都设上限；任何失败都返回 null，由内核退占位符（绝不让语音拖垮收消息）。
//   - 插件默认不启用（enabledByDefault:false）：要花钱的外部调用必须由用户显式打开。
const MAX_TEXT = 4000;

export default {
  setup(ctx) {
    const log = ctx.log;

    const setting = (key, fallback) => {
      const v = ctx.config.get(key);
      return v === undefined || v === null || v === '' ? fallback : v;
    };

    /**
     * 语音 URL → { buf, mime }（走 SSRF 防护，失败返回 null）。
     * 公共 HTTP 门负责权限、超时和字节上限；插件不持有原始 fetch。
     */
    async function fetchAudio(url, maxBytes) {
      const res = await ctx.http.fetch(url, {
        maxBytes, expectBinary: true, timeoutMs: setting('timeoutMs', 30000),
      });
      if (!res || res.status < 200 || res.status >= 300) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > maxBytes || res.truncated) return null;
      // detectMime 只认图片魔数，音频靠 content-type（QQ 语音多为 silk/amr/ogg）
      const header = String(res.headers?.get?.('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const mime = header || guessAudioMime(url) || 'application/octet-stream';
      return { buf, mime };
    }

    function guessAudioMime(url) {
      const ext = String(url).split('?')[0].split('.').pop()?.toLowerCase();
      return ({
        silk: 'audio/silk', amr: 'audio/amr', mp3: 'audio/mpeg', wav: 'audio/wav',
        ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/opus',
      })[ext] ?? null;
    }

    /** 组装 multipart/form-data（Node 20+ 有原生 FormData/Blob）。 */
    function buildForm(buf, filename, mime) {
      const form = new FormData();
      form.append('model', String(setting('model', 'whisper-1')));
      const language = String(setting('language', '')).trim();
      if (language) form.append('language', language);
      form.append('file', new Blob([buf], { type: mime || 'application/octet-stream' }), filename);
      return form;
    }

    /** 解析响应：兼容 {text} 与 {data:{text}} 两种形状。 */
    function extractText(payload) {
      const raw = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
      let data = null;
      try { data = JSON.parse(raw); } catch { data = null; }
      const text = data?.text ?? data?.data?.text ?? data?.result?.text ?? (typeof data === 'string' ? data : '');
      const value = String(text ?? '').trim();
      if (!value) return null;
      return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…（已截断）` : value;
    }

    /**
     * media.transcribe provider：入参 {type:'record', data:{file}}，返回转写文本或 null。
     * 任何异常都吞掉并返回 null —— 内核会退成 [语音] 占位符。
     */
    /**
     * media.transcribe provider：入参 {type:'record', data:{file}}，返回转写文本或 null。
     *整体 try/catch 兜底：网络异常、SSRF 拒绝、JSON 解析失败等一切问题都退 null，
     * 由内核退成 [语音] 占位符——绝不让语音处理打断收消息链路。
     */
    async function transcribe(seg) {
      try {
        if (setting('enabled', false) !== true) return null;
        const baseUrl = String(setting('baseUrl', '')).trim().replace(/\/+$/, '');
        const file = [seg?.url, seg?.file, seg?.data?.url, seg?.data?.file]
          .find((value) => /^https?:\/\//i.test(String(value ?? '')));
        if (!baseUrl || !file) return null;

        const url = /^https?:\/\//i.test(String(file)) ? String(file) : null;
        if (!url) return null; // 只接受绝对 URL；其它形态（本地缓存 id）本实现不处理

        const maxBytes = Math.max(1, Number(setting('maxBytes', 8))) * 1024 * 1024;
        const audio = await fetchAudio(url, maxBytes);
        if (!audio) return null;
        if (!/^audio\//i.test(audio.mime)) {
          log?.debug?.(`[voice-to-text] 非音频内容（${audio.mime}），放弃转写`);
          return null;
        }

        const form = buildForm(audio.buf, 'voice', audio.mime);
        const headers = {};
        const apiKey = String(setting('apiKey', '')).trim();
        if (apiKey) headers.authorization = `Bearer ${apiKey}`;

        const response = await ctx.http.fetch(`${baseUrl}/audio/transcriptions`, {
          method: 'POST', headers, body: form, timeoutMs: setting('timeoutMs', 30000), maxBytes: 1024 * 1024,
        });
        if (!response.ok) {
          log?.warn?.(`[voice-to-text] 转写失败：HTTP ${response.status}`);
          return null;
        }
        return extractText(await response.text());
      } catch (err) {
        // 含 SSRF 拒绝、超时、DNS 失败、非音频等；一律降级，不外抛
        log?.debug?.(`[voice-to-text] 转写异常，已降级为占位符：${err?.message ?? err}`);
        return null;
      }
    }

    ctx.registerCapability('media.transcribe', transcribe);
    log?.info?.('[voice-to-text] 已注册 media.transcribe 能力（需在设置里填 ASR 地址并启用）');
  },
};

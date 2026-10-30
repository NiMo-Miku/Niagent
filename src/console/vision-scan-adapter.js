import { requestModelEndpoint } from './model-request.js';

const PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0XQAAAABJRU5ErkJggg==';

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function modelId(model) {
  return text(typeof model === 'string' ? model : model?.id ?? model?.model, 200);
}

function providerModels(provider, fallbackModel = '') {
  const models = Array.isArray(provider?.models) ? provider.models.map(modelId).filter(Boolean) : [];
  if (fallbackModel && !models.includes(fallbackModel)) models.push(fallbackModel);
  return models;
}

function endpoint(baseUrl) {
  const base = text(baseUrl, 1000);
  if (!base) return '';
  return /\/chat\/completions\/?$/i.test(base)
    ? base
    : new URL('chat/completions', base.endsWith('/') ? base : `${base}/`).toString();
}

function responseVerdict(status, body) {
  if (status >= 200 && status < 300) return 'vision';
  const detail = text(body, 500).toLowerCase();
  if (status === 400 || status === 415 || /image|vision|multimodal|content.*type/.test(detail)) return 'no-vision';
  return 'unknown';
}

export function visionKey(providerId, model) {
  return `${providerId}|||${model}`;
}

export function createVisionScanAdapter({ cfg, config, fetchImpl, dnsLookup, emit = () => {} } = {}) {
  let running = false;
  const readCfg = () => (typeof cfg === 'function' ? cfg() : cfg) ?? {};

  function providers() {
    const current = readCfg();
    const configured = (current.providers ?? []).map((provider) => {
      const id = text(provider?.id, 100) || 'default';
      const selected = current.api?.provider === id ? text(current.api?.model, 200) : '';
      return {
        id,
        baseUrl: provider?.baseUrl ?? provider?.baseURL ?? '',
        apiKey: [current.dshProviderKeys?.[id], provider?.apiKey, provider?.apiKeyFrom && process.env[provider.apiKeyFrom]].find((value) => typeof value === 'string' && value.trim() && value !== '******') ?? '',
        models: providerModels(provider, selected),
      };
    });
    const selectedId = text(current.api?.provider, 100) || 'default';
    const active = configured.find((provider) => provider.id === selectedId);
    if (active) {
      if (!active.baseUrl) active.baseUrl = current.api?.baseUrl ?? '';
      if (!active.apiKey) active.apiKey = current.api?.apiKey ?? '';
      if (current.api?.model && !active.models.includes(current.api.model)) active.models.push(current.api.model);
    } else if (current.api?.baseUrl && current.api?.model) {
      configured.push({ id: selectedId, baseUrl: current.api.baseUrl, apiKey: current.api.apiKey ?? '', models: [current.api.model] });
    }
    return configured;
  }

  function snapshot() {
    const stored = readCfg().visionResults && typeof readCfg().visionResults === 'object' ? readCfg().visionResults : {};
    const results = {};
    for (const provider of providers()) {
      for (const model of provider.models) {
        const key = visionKey(provider.id, model);
        const item = stored[key] ?? {};
        const verdict = ['vision', 'no-vision', 'unknown'].includes(item.verdict) ? item.verdict : 'unknown';
        results[key] = { providerId: provider.id, model, ...item, providerId: provider.id, model, verdict };
      }
    }
    for (const [key, item] of Object.entries(stored)) {
      if (!results[key] && item && typeof item === 'object') {
        const [providerId = '', model = ''] = key.split('|||');
        const verdict = ['vision', 'no-vision', 'unknown'].includes(item.verdict) ? item.verdict : 'unknown';
        results[key] = { ...item, providerId: text(item.providerId ?? providerId, 100), model: text(item.model ?? model, 200), verdict };
      }
    }
    return results;
  }

  async function probe(provider, model, timeoutMs) {
    if (!provider.baseUrl) return { providerId: provider.id, model, verdict: 'unknown', note: '未配置模型接口地址', scannedAt: Date.now() };
    const url = endpoint(provider.baseUrl);
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: [
        { type: 'text', text: '请只回复 ok。' },
        { type: 'image_url', image_url: { url: PIXEL_PNG } },
      ] }],
      max_tokens: 8,
      temperature: 0,
    });
    try {
      const response = await requestModelEndpoint(url, {
        config: readCfg(),
        method: 'POST', body, timeoutMs, fetchImpl, dnsLookup,
        headers: {
          'content-type': 'application/json',
          ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
        },
      });
      return {
        providerId: provider.id, model, verdict: responseVerdict(response.status, response.body),
        ...(response.status >= 200 && response.status < 300 ? {} : { note: `HTTP ${response.status}` }),
        scannedAt: Date.now(),
      };
    } catch (err) {
      return { providerId: provider.id, model, verdict: 'unknown', note: text(err?.message, 300), scannedAt: Date.now() };
    }
  }

  async function scan({ onlyProviderIds = null, timeoutMs = 25_000, limit = 3 } = {}) {
    if (running) throw Object.assign(new Error('已有一次扫描正在进行'), { status: 409, expose: true });
    running = true;
    const wanted = Array.isArray(onlyProviderIds) ? new Set(onlyProviderIds.map((id) => String(id))) : null;
    const targets = providers().filter((provider) => !wanted || wanted.has(provider.id)).flatMap((provider) => provider.models.map((model) => ({ provider, model })));
    emit('vision.scan', { phase: 'start', total: targets.length });
    try {
      const results = snapshot();
      for (let start = 0; start < targets.length; start += Math.max(1, Math.floor(limit) || 1)) {
        const batch = targets.slice(start, start + Math.max(1, Math.floor(limit) || 1));
        for (const item of await Promise.all(batch.map(({ provider, model }) => probe(provider, model, Math.max(5_000, Number(timeoutMs) || 25_000))))) {
          results[visionKey(item.providerId, item.model)] = item;
        }
      }
      config?.update?.({ visionResults: { __replace__: results } });
      emit('vision.scan', { phase: 'done', total: targets.length });
      return { total: targets.length };
    } catch (err) {
      emit('vision.scan', { phase: 'error', error: text(err?.message, 300) });
      throw err;
    } finally {
      running = false;
    }
  }

  return { get running() { return running; }, snapshot, scan, providers };
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectMime, downloadImageAsDataUrl, safeFetch } from '../kernel/safe-fetch.js';
import { resolveGlobalBlocklist } from '../kernel/ingest.js';

export const MEDIA_MAX_BYTES = 15 * 1024 * 1024;

// 自动整理与控制台手动整理共用同一个适配器实例/提供者。
// 以 memory 实例为键，避免在 orchestrator 里再起一套整理循环。
const consolidationAdapters = new WeakMap();

export function requestMemoryConsolidation({ memory, chatKey, userIds = null, create = false, mode = '', createUserIds = null, signal = null } = {}) {
  const adapter = memory && consolidationAdapters.get(memory);
  if (!adapter) return { status: 503, body: { ok: false, available: false, code: 'CAPABILITY_MISSING', reason: '记忆整理能力未安装或未启用（需要 memory.consolidate capability）' } };
  try { return adapter.start({ chatKey, force: true, userIds, create, mode, createUserIds, signal }); }
  catch { return { status: 503, body: { ok: false, available: false, code: 'CAPABILITY_MISSING', reason: '记忆整理能力不可用' } }; }
}

function json(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(raw),
    'cache-control': 'no-store',
  });
  res.end(raw);
}

function toMemoryMembers(memory, chatKey, userIds) {
  const selected = userIds?.length ? new Set(userIds.map(String)) : null;
  return (memory?.query?.(chatKey) ?? []).filter((member) => !selected || !member.userId || selected.has(String(member.userId))).map((member) => ({
    userId: String(member.userId ?? ''),
    name: String(member.name ?? ''),
    impressions: (member.impressions ?? []).map((item) => ({
      content: String(item?.content ?? item),
      createdAt: item?.createdAt,
    })),
  }));
}

function maxKeepFor(cfg) {
  const configured = Number(cfg()?.memory?.maxImpressionsPerMember);
  return Math.max(2, Number.isFinite(configured) && configured > 0 ? configured : 5);
}

function validateProposedMembers(proposed, beforeById, maxKeep, { create = false, eligible = new Set(), identities = new Map(), createCandidates = null } = {}) {
  if (!Array.isArray(proposed)) throw new Error('记忆整理能力返回格式错误（需要 members 数组）');
  const seenMembers = new Set();
  const changes = [];
  for (const member of proposed) {
    if (!member || typeof member !== 'object') throw new Error('记忆整理结果包含非法成员');
    const userId = String(member.userId ?? '');
    const sources = Array.isArray(member._sources) ? member._sources : member._source ? [member._source] : [];
    let original = userId ? beforeById.get(userId) : identities.get(`\0${String(member.name ?? '')}`);
    let priorMembers = original ? [original] : [];
    if (sources.length) {
      const originals = sources.map((source) => {
        const prior = identities.get(`${String(source.userId ?? '')}\0${String(source.name ?? '')}`);
        if (!prior || /^\d+$/.test(String(source.userId ?? '')) && String(source.userId) !== userId || !/^\d{1,15}$/.test(userId) && String(source.userId ?? '') !== userId) throw new Error('整理结果成员身份映射无效');
        return prior;
      });
      const seen = new Set();
      priorMembers = originals;
      original = { ...originals[0], impressions: originals.flatMap((item) => item.impressions).filter((item) => !seen.has(item.content) && seen.add(item.content)) };
    }
    const newMember = (!original || !original.impressions.length) && create && /^\d{1,15}$/.test(userId) && eligible.has(userId) && (!createCandidates || createCandidates.has(userId));
    if (!original && !newMember) throw new Error(`整理结果包含不存在的成员（${userId}），已放弃本轮`);
    const identity = userId || `name:${member.name}`;
    if (seenMembers.has(identity)) throw new Error(`整理结果重复包含成员（${userId}），已放弃本轮`);
    seenMembers.add(identity);
    if (!Array.isArray(member.impressions)) throw new Error(`整理结果缺少 impressions 数组（${userId}），已放弃本轮`);
    if ((!newMember && member.impressions.length > original.impressions.length) || member.impressions.length > maxKeep) {
      throw new Error(`整理结果疑似增加记忆（${userId}），已放弃本轮`);
    }
    const seenContent = new Set();
    const impressions = member.impressions.map((item) => {
      if (!item || typeof item !== 'object') throw new Error(`整理结果包含非法印象（${userId}），已放弃本轮`);
      const content = String(item.content ?? '');
      const originalItem = original?.impressions.find((entry) => entry.content === content);
      const createdAt = Number(item.createdAt ?? originalItem?.createdAt);
      if (!content || content.length > 120 || !Number.isFinite(createdAt)) {
        throw new Error(`整理结果包含非法印象（${userId}），已放弃本轮`);
      }
      if (seenContent.has(content)) throw new Error(`整理结果包含重复印象（${userId}），已放弃本轮`);
      seenContent.add(content);
      return { content, createdAt };
    });
    changes.push({ userId, name: String(member.name ?? original?.name ?? userId), impressions, originals: priorMembers, sources: sources.filter((source) => !source.userId && userId) });
  }
  return changes;
}

function consolidationProvider({ capability, memoryConsolidator, resolveConsolidator }) {
  if (resolveConsolidator) return resolveConsolidator();
  if (memoryConsolidator) return memoryConsolidator;
  const item = capability?.providers?.('memory.consolidate')?.[0];
  return item?.provider ?? null;
}

function callableConsolidator(provider) {
  if (typeof provider === 'function') return provider;
  if (typeof provider?.consolidate === 'function') return provider.consolidate.bind(provider);
  return null;
}

// The fallback supports stand-alone adapters. The composed host supplies the same
// selection proof plus its retained permission receipt through serviceLeaseOf.
function localServiceLease(name, { capability, resolve, resolveToken, signal } = {}) {
  const selected = capability?.providers?.(name)?.[0] ?? null;
  const provider = resolve ? resolve() : selected?.provider;
  const version = capability?.version?.(name, selected?.ownerId);
  const token = resolveToken?.();
  const controller = new AbortController();
  let disposed = false;
  const isValid = () => {
    const current = capability?.providers?.(name)?.[0] ?? null;
    return !disposed && !controller.signal.aborted && !signal?.aborted
      && (!resolve || resolve() === provider)
      && (!resolveToken || token != null && resolveToken() === token)
      && (!capability || current?.ownerId === selected?.ownerId && current?.provider === selected?.provider
        && capability?.version?.(name, selected?.ownerId) === version);
  };
  const cancel = () => controller.abort(signal?.reason ?? new Error('记忆整理已取消'));
  const off = capability?.onChange?.(() => { if (!isValid()) controller.abort(new Error('记忆整理所选提供者已变更')); });
  if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
  return { provider, signal: controller.signal, isValid,
    dispose() { if (disposed) return; disposed = true; off?.(); signal?.removeEventListener('abort', cancel); controller.abort(new Error('记忆整理租约已结束')); },
  };
}

function awaitMemoryOperation(operation, signal) {
  if (!signal) return Promise.resolve(operation);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action, value) => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', cancel); action(value);
    };
    const cancel = () => finish(reject, signal.reason ?? new Error('记忆整理已取消'));
    if (signal.aborted) { cancel(); Promise.resolve(operation).catch(() => {}); return; }
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve(operation).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

function blockedMemoryMember(member, blocked, history, c) {
  const id = String(member.userId ?? '');
  if (blocked.has(id)) return true;
  if (/^\d{1,15}$/.test(id)) return false;
  const name = String(member.name ?? '');
  if (!name) return false;
  // Historical name-only files must not be silently renamed or deleted. If a
  // blocked identity shares that label, leave the original file out of this job.
  return Object.entries(c.memberNotes ?? {}).some(([uid, note]) => note === name && blocked.has(uid))
    || history.some(entry => entry.senderName === name && blocked.has(String(entry.senderId)));
}

function memoryHistory(history, blocked) {
  return history.filter(entry => !entry.self && !entry.isPoke && !entry.recalled && !blocked.has(String(entry.senderId)))
    .map(entry => ({ senderId: String(entry.senderId ?? ''), senderName: String(entry.senderName ?? ''), text: String(entry.text ?? ''), ts: entry.ts }));
}

/**
 * M3 only owns the asynchronous endpoint and the no-expansion guard. The model
 * workflow remains a separately registered M4 capability (`memory.consolidate`).
 */
export function createMemoryConsolidationAdapter({ capability, memory, store, memoryConsolidator, resolveConsolidator, resolveToken, serviceLeaseOf = null, globalBlocklistOf = null, emit = () => {}, cfg = () => ({}) } = {}) {
  const running = new Set();

  function availability() {
    if (cfg()?.memory?.useChatModel === false ? !cfg()?.memory?.model || !cfg()?.memory?.provider : !cfg()?.api?.model) {
      return { available: false, code: 'MODEL_NOT_CONFIGURED', reason: '未配置模型，无法整理记忆' };
    }
    if (!callableConsolidator(consolidationProvider({ capability, memoryConsolidator, resolveConsolidator }))) {
      return { available: false, code: 'CAPABILITY_MISSING', reason: '记忆整理能力未安装或未启用（需要 memory.consolidate capability）' };
    }
    return { available: true };
  }

  function start({ chatKey, userIds, force = true, create = false, mode = '', createUserIds = null, signal = null }) {
    if (running.has(chatKey)) return { status: 409, body: { ok: false, error: '该群已在整理中' } };
    const ready = availability();
    if (!ready.available) return { status: 503, body: { ok: false, available: false, ...ready } };

    const before = toMemoryMembers(memory, chatKey, userIds);
    const selected = userIds?.length ? new Set(userIds.map(String)) : null;
    const createCandidates = createUserIds == null ? null : new Set(createUserIds.map(String));
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason ?? new Error('记忆整理已取消'));
    if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    const sourceLease = serviceLeaseOf?.('community.client', { signal: controller.signal })
      ?? localServiceLease('community.client', { capability, signal: controller.signal });
    const memoryLease = serviceLeaseOf?.('memory.consolidate', { signal: controller.signal })
      ?? localServiceLease('memory.consolidate', { capability, signal: controller.signal,
        resolve: () => consolidationProvider({ capability, memoryConsolidator, resolveConsolidator }), resolveToken });
    const cancelLease = () => controller.abort(new Error('记忆整理所选提供者或授权已失效，原档保留'));
    for (const lease of [sourceLease, memoryLease]) lease.signal?.addEventListener('abort', cancelLease, { once: true });
    const checkProvider = () => {
      if (sourceLease.isValid?.() === false || memoryLease.isValid?.() === false) cancelLease();
      if (controller.signal.aborted) throw controller.signal.reason ?? new Error('记忆整理所选提供者或授权已失效，原档保留');
    };
    const readBlocked = async () => {
      checkProvider();
      const c = cfg();
      const reader = typeof sourceLease.provider?.getBlocklist === 'function'
        ? options => sourceLease.provider.getBlocklist(options) : globalBlocklistOf;
      const ids = await awaitMemoryOperation(resolveGlobalBlocklist(c,
        typeof reader === 'function' ? () => reader({ signal: controller.signal }) : null), controller.signal);
      checkProvider(); // A failed old source cannot acquire a new fallback proof.
      return new Set([...ids, ...(cfg()?.blocklist?.[chatKey.split(':').pop()] ?? [])].map(String));
    };
    const run = callableConsolidator(memoryLease.provider);
    running.add(chatKey);
    emit('memory.update', { chatKey, phase: 'consolidate-start' });

    void Promise.resolve().then(async () => {
      checkProvider();
      const blocked = await readBlocked();
      const rawHistory = store?.recent?.(chatKey, 2000) ?? [];
      const history = memoryHistory(rawHistory, blocked);
      const allowedBefore = before.filter(member => !blockedMemoryMember(member, blocked, rawHistory, cfg()));
      const beforeById = new Map(allowedBefore.map(member => [member.userId, member]));
      const identities = new Map(allowedBefore.map(member => [`${member.userId}\0${member.name}`, member]));
      const eligible = new Set(history.filter(entry => !selected || selected.has(String(entry.senderId))).map(entry => String(entry.senderId)));
      const allowedUserIds = userIds?.filter(id => !blocked.has(String(id))) ?? null;
      const allowedCreateIds = createUserIds?.filter(id => !blocked.has(String(id))) ?? null;
      if (selected && !allowedUserIds?.length) throw new Error('所选成员已被当前名单排除，原档保留');
      if (!run) throw new Error('记忆整理能力不可用');
      const output = await awaitMemoryOperation(run({ chatKey, userIds: allowedUserIds, force, create, mode, createUserIds: allowedCreateIds,
        members: structuredClone(allowedBefore), history: structuredClone(history), signal: controller.signal }), controller.signal);
      checkProvider();
      const proposed = Array.isArray(output) ? output : output?.members;
      if (Array.isArray(proposed) && !proposed.length && output?.failures?.length) throw new Error(output.failures.map((item) => `${item.name || item.userId}：${item.error}`).join('；'));
      const changes = validateProposedMembers(proposed, beforeById, maxKeepFor(cfg), { create: create || mode === 'create', eligible, identities, createCandidates });
      if ((create || mode === 'create') && !changes.length) throw new Error('没有可用于新建印象的真实发言');
      const failures = [...(output?.failures ?? [])]; let updated = 0, policyChanged = false;
      for (const change of changes) {
        const currentBlocked = await readBlocked();
        if (blockedMemoryMember(change, currentBlocked, rawHistory, cfg()) || change.originals.some(member => blockedMemoryMember(member, currentBlocked, rawHistory, cfg()))) {
          failures.push({ userId: change.userId, name: change.name, error: '成员已被当前名单排除，原档保留' }); policyChanged = true; continue;
        }
        const originals = change.originals;
        const currentMembers = toMemoryMembers(memory, chatKey);
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const currentFor = (member) => currentMembers.find((entry) => member.userId ? entry.userId === member.userId : !entry.userId && entry.name === member.name);
        const changed = originals.some((prior) => !same(prior, currentFor(prior))) || (!beforeById.has(change.userId) && !originals.some((prior) => prior.userId === change.userId) && currentMembers.some((member) => member.userId === change.userId));
        if (changed) { failures.push({ userId: change.userId, name: change.name, error: '整理期间记忆已修改，保留最新内容，请重新整理' }); continue; }
        checkProvider();
        if (!memory.replaceMember(chatKey, change)) { failures.push({ userId: change.userId, name: change.name, error: '记忆写入失败，原档保留' }); continue; }
        for (const source of change.sources) memory.remove?.(chatKey, { name: source.name });
        updated++;
      }
      if (!updated && failures.length) throw new Error(failures.map((item) => `${item.name || item.userId}：${item.error}`).join('；'));
      checkProvider();
      if (updated && !policyChanged && (!createCandidates?.size || !failures.some((failure) => createCandidates.has(String(failure.userId))))) memory.markConsolidated?.(chatKey);
      return { chatKey, phase: 'consolidate-done', updated, failures };
    }).catch((err) => {
      return { chatKey, phase: 'consolidate-error', error: String(err?.message ?? err) };
    }).then((terminal) => {
      // Terminal observers must already see the authoritative task as stopped.
      running.delete(chatKey);
      signal?.removeEventListener('abort', cancel);
      for (const lease of [sourceLease, memoryLease]) lease.signal?.removeEventListener('abort', cancelLease);
      sourceLease.dispose?.(); memoryLease.dispose?.();
      emit('memory.update', terminal);
    });

    return { status: 202, body: { ok: true, started: true } };
  }

  const adapter = { start, availability, running };
  if (memory && typeof memory === 'object') consolidationAdapters.set(memory, adapter);
  return adapter;
}

function pathFromFile(value) {
  const raw = String(value ?? '');
  if (!raw) return null;
  try { return raw.startsWith('file:') ? fileURLToPath(raw) : raw; } catch { return null; }
}

function insideRoot(target, root) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function localDataUrl(file, mediaRoots, fsImpl) {
  const raw = pathFromFile(file);
  if (!raw) return null;
  let realFile;
  try { realFile = fsImpl.realpathSync(raw); } catch { return null; }
  const roots = mediaRoots.map((root) => {
    try { return fsImpl.realpathSync(root); } catch { return null; }
  }).filter(Boolean);
  if (!roots.some((root) => insideRoot(realFile, root))) return null;
  let stat;
  try { stat = fsImpl.statSync(realFile); } catch { return null; }
  if (!stat.isFile() || stat.size > MEDIA_MAX_BYTES) return null;
  let data;
  try { data = fsImpl.readFileSync(realFile); } catch { return null; }
  const mime = detectMime(data) ?? ({ '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }[path.extname(realFile).toLowerCase()] ?? 'image/jpeg');
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(mime)) return null;
  return `data:${mime};base64,${data.toString('base64')}`;
}

/** Resolve archive images independently: a bad item never discards successful peers. */
export function createMediaDataAdapter({ onebot, transport = onebot, dataDir, mediaRoots, cfg = () => ({}), fetchImpl, dnsLookup, fsImpl = fs } = {}) {
  // 本地读取仅限显式媒体根目录；默认 data/media，绝不把整个 dataDir（含配置/密钥）作为可读根。
  const roots = () => (mediaRoots ?? cfg()?.security?.mediaRoots ?? (dataDir ? [path.join(dataDir, 'media')] : [])).filter(Boolean);
  const imageOptions = () => ({
    maxBytes: MEDIA_MAX_BYTES,
    allowPrivate: cfg()?.security?.allowPrivateImageHosts === true,
    fetchImpl,
    dnsLookup,
    browseLocked: cfg()?.security?.browseLock?.enabled === true,
    allowedHosts: cfg()?.security?.browseLock?.hosts ?? [],
  });

  async function resolve(item) {
    if (!item || typeof item !== 'object') return null;
    if (['record', 'audio', 'video'].includes(item.kind)) return resolvePlayable(item);
    const direct = localDataUrl(item.file, roots(), fsImpl);
    if (direct) return direct;

    let remoteUrl = '';
    if (item.file) {
      try {
        const getImage = transport?.actions?.getImage;
        if (typeof getImage !== 'function') throw new Error('当前传输提供者不支持获取图片');
        const response = await getImage.call(transport.actions, String(item.file));
        const data = response?.data ?? response ?? {};
        const cached = localDataUrl(data.file, roots(), fsImpl);
        if (cached) return cached;
        remoteUrl = typeof data.url === 'string' ? data.url : '';
      } catch { /* continue to URL fallback */ }
    }
    for (const url of [remoteUrl, typeof item.url === 'string' ? item.url : '']) {
      if (!url) continue;
      try { return (await downloadImageAsDataUrl(url, imageOptions())).dataUrl; } catch { /* next fallback */ }
    }
    return null;
  }

  function playableData(buffer, kind) {
    if (!Buffer.isBuffer(buffer) || buffer.length > MEDIA_MAX_BYTES) return null;
    const header = buffer.toString('ascii', 0, 12);
    let mime = null;
    if (kind === 'video') {
      if (buffer.length > 12 && header.slice(4, 8) === 'ftyp') mime = 'video/mp4';
      else if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) mime = 'video/webm';
    } else {
      if (header.startsWith('ID3') || buffer.length > 2 && buffer[0] === 255 && (buffer[1] & 224) === 224) mime = 'audio/mpeg';
      else if (header.startsWith('OggS')) mime = 'audio/ogg';
      else if (header.startsWith('RIFF') && header.slice(8, 12) === 'WAVE') mime = 'audio/wav';
      else if (header.startsWith('fLaC')) mime = 'audio/flac';
      else if (header.startsWith('#!AMR')) mime = 'audio/amr';
      else if (header.slice(4, 8) === 'ftyp') mime = 'audio/mp4';
    }
    return mime ? `data:${mime};base64,${buffer.toString('base64')}` : null;
  }
  function playableLocal(file, kind) {
    try {
      const real = fsImpl.realpathSync(pathFromFile(file));
      if (!roots().some((root) => insideRoot(real, fsImpl.realpathSync(root)))) return null;
      const stat = fsImpl.statSync(real); if (!stat.isFile() || stat.size > MEDIA_MAX_BYTES) return null;
      return playableData(fsImpl.readFileSync(real), kind);
    } catch { return null; }
  }
  async function resolvePlayable(item) {
    const direct = playableLocal(item.file, item.kind); if (direct) return direct;
    const candidates = [item.url];
    if (item.file) {
      try {
        const action = transport?.actions?.[item.kind === 'video' ? 'getVideo' : 'getRecord'];
        const response = await action?.call(transport.actions, String(item.file)), data = response?.data ?? response;
        const cached = playableLocal(data?.file, item.kind); if (cached) return cached;
        if (data?.url) candidates.unshift(data.url);
      } catch { /* archived URL can still be valid */ }
    }
    for (const url of candidates) {
      if (!/^https?:\/\//i.test(String(url ?? ''))) continue;
      try {
        const response = await safeFetch(url, { ...imageOptions(), expectBinary: true, browseLocked: cfg()?.security?.browseLock?.enabled === true, allowedHosts: cfg()?.security?.browseLock?.hosts ?? [] });
        if (response.status >= 400 || response.truncated) continue;
        const value = playableData(response.body, item.kind); if (value) return value;
      } catch { /* return null for just this item */ }
    }
    return null;
  }

  async function resolveAll(items) {
    const list = Array.isArray(items) ? items.slice(0, 20) : [];
    return Promise.all(list.map((item) => resolve(item).catch(() => null)));
  }

  return { resolve, resolveAll };
}

export function respondJson(res, status, body) {
  json(res, status, body);
}

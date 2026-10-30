// The catalogue is presentation metadata, not the set of models an endpoint may run.
export const modelId = value => typeof value === 'string' ? value.trim() : String(value?.id ?? value?.model ?? '').trim();
export function providerEndpointIdentity(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'; url.hash = ''; return url.href;
  } catch { return ''; }
}
export function modelLabel(provider, value) {
  const id = modelId(value), names = provider?.modelNames;
  const named = names && !Array.isArray(names) && Object.hasOwn(names, id) ? names[id] : '';
  return String(named || (typeof value === 'object' && (value?.name || value?.displayName)) || id);
}
export function modelChoiceLabel(providers, {provider, model}) {
  if (!model) return '选择模型';
  const source = providers.find(item => item.id === provider);
  const entry = (Array.isArray(source?.models) ? source.models.find(item => modelId(item) === model) : null) ?? model;
  return `${source?.displayName || provider || '直接接入'}-${modelLabel(source, entry)}`;
}
export function retainModelMetadata(previous, ids) {
  const prior = new Map((previous || []).map(item => [modelId(item), item]));
  return [...new Set(ids.map(modelId).filter(Boolean))].map(id => structuredClone(prior.get(id) ?? id));
}
export function retainModelNames(names, ids) {
  const retained = new Set(ids.map(modelId));
  return Object.fromEntries(Object.entries(names && !Array.isArray(names) ? names : {}).filter(([id]) => retained.has(id)));
}

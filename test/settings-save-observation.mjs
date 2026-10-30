// Default settings save through the host lifecycle endpoint; appended editors
// may retain the ordinary config fallback. Opening a lease is never a save.
export const SETTINGS_SAVE_ROUTE = /^(?:https?:\/\/[^/?#]+)?\/api\/config(?:\/lifecycle)?(?:\?[^#]*)?$/;

function savePath(request) {
  try { return new URL(request.url(), 'http://settings-save.invalid').pathname; }
  catch { return ''; }
}

export function isSettingsSaveRequest(request) {
  return request?.method?.() === 'POST'
    && ['/api/config', '/api/config/lifecycle'].includes(savePath(request));
}

// A host lease open/retirement carries no configuration patch. Keep every
// other method, origin and path visible to generic business-write assertions.
export function isSettingsLeaseOpenRequest(request, origin) {
  if (request?.method?.() !== 'POST') return false;
  try {
    const url = new URL(request.url());
    return url.origin === new URL(origin).origin
      && url.pathname === '/api/config/lifecycle/open'
      && url.search === '' && url.hash === '';
  } catch { return false; }
}

export function settingsSavePatch(request) {
  if (!isSettingsSaveRequest(request)) return undefined;
  const body = request.postDataJSON();
  return savePath(request) === '/api/config/lifecycle' ? body?.patch : body;
}

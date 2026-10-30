// Operator-controlled boot contributions. This resolver is never populated from
// downloaded plugin manifests; their separate /panels/u/ host remains mandatory.
import fs from 'node:fs';
import path from 'node:path';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2', '.json', '.txt']);
function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 && value.length < 1024
    && !/[\\%:\x00-\x1f?#]/.test(value)
    && value.split('/').every((part) => part && part !== '.' && part !== '..' && !part.startsWith('.'));
}
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function samePath(a, b) { return path.relative(a, b) === ''; }

// Check every path component, including junctions on Windows. realpath alone
// would turn an escaping symlink into an apparently valid new asset root.
function checkedPath(absolute, directory) {
  if (typeof absolute !== 'string' || !path.isAbsolute(absolute)) throw new Error('UI composition paths must be absolute');
  const resolved = path.resolve(absolute), volume = path.parse(resolved).root;
  let current = volume;
  for (const segment of path.relative(volume, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('UI composition symlinks are forbidden');
  }
  const canonical = fs.realpathSync(resolved), stat = fs.statSync(canonical);
  if (!samePath(canonical, resolved) || !(directory ? stat.isDirectory() : stat.isFile())) throw new Error('Invalid UI composition asset');
  return canonical;
}

function fileIn(root, relative) {
  if (!safeRelative(relative) || !EXTENSIONS.has(path.extname(relative).toLowerCase())) return false;
  try {
    // Repeat canonical checks when serving, so swapping an asset directory for
    // a symlink after boot does not escape the originally selected boundary.
    if (!samePath(checkedPath(root, true), root)) return false;
    const file = path.resolve(root, ...relative.split('/'));
    if (!inside(root, file)) return false;
    const canonical = checkedPath(file, false);
    return inside(root, canonical) ? canonical : false;
  } catch { return false; }
}

/** null = no contribution; false = contribution owns URL but cannot serve it. */
export function createUiAssetResolver(ui = {}, { selection = {} } = {}) {
  const panels = new Map(), assets = new Map();
  const shell = ui.shell === undefined ? null : checkedPath(ui.shell, true);
  // Disk composition supplies ranks after sorting layers. A complete newer
  // page/shell owns its subtree, including files missing from that subtree.
  // Direct callers without metadata keep the explicit-asset-first contract.
  const owners = ui.owners;
  for (const panel of ui.panels ?? []) {
    if (!ID.test(panel?.id ?? '') || panel.id === 'u' || panels.has(panel.id)) throw new Error('Invalid or duplicate trusted UI panel id');
    const root = checkedPath(panel.assetRoot, true);
    if (!fileIn(root, panel.entry ?? 'index.html')) throw new Error(`Missing trusted UI panel entry: ${panel.id}`);
    panels.set(panel.id, { root, rank: owners?.panels?.[panel.id] ?? 0, ownerId: selection.panels?.[panel.id]?.ownerId });
  }
  for (const [key, absolute] of Object.entries(ui.assets ?? {})) {
    if (!safeRelative(key) || !EXTENSIONS.has(path.extname(key).toLowerCase())) throw new Error(`Invalid UI asset path: ${key}`);
    // Shell modules use /app.js URLs; shared panel assets use /panels/icons.js.
    const url = `/${key.startsWith('shell/') ? key.slice('shell/'.length) : key}`;
    if (/^\/(?:api|events)(?:\/|$)/.test(url) || /^\/panels\/u(?:\/|$)/.test(url) || assets.has(url)) throw new Error(`Reserved or duplicate UI asset URL: ${url}`);
    assets.set(url, { filename: checkedPath(absolute, false), rank: owners?.assets?.[key] ?? 0, ownerId: selection.assets?.[key]?.ownerId, key });
  }
  function describe(pathname) {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return false; }
    if (decoded === '/panels/u' || decoded.startsWith('/panels/u/') || /^\/(?:api|events)(?:\/|$)/.test(decoded)) return null;
    const relative = decoded === '/' ? 'index.html' : decoded.slice(1);
    if (!decoded.startsWith('/') || !safeRelative(relative)) return false;
    const explicit = assets.get(decoded === '/' ? '/index.html' : decoded);
    const panel = decoded.match(/^\/panels\/([A-Za-z0-9_-]{1,64})\/(.+)$/);
    const selectedPanel = panel && panels.get(panel[1]);
    const selectedShell = shell && !decoded.startsWith('/panels/');
    const rootRank = selectedPanel?.rank ?? (selectedShell ? owners?.shell ?? 0 : 0);
    if (explicit && (!owners || explicit.rank >= rootRank)) {
      try { return samePath(checkedPath(explicit.filename, false), explicit.filename) ? { filename: explicit.filename, source: { ownerId: explicit.ownerId, slot: `asset:${explicit.key}` } } : false; }
      catch { return false; }
    }
    if (selectedPanel) { const filename = fileIn(selectedPanel.root, panel[2]); return filename ? { filename, source: { ownerId: selectedPanel.ownerId, slot: `panel:${panel[1]}/${panel[2]}` } } : false; }
    if (selectedShell) { const filename = fileIn(shell, relative); return filename ? { filename, source: { ownerId: selection.shell?.ownerId, slot: `shell:${relative}` } } : false; }
    return null;
  }
  const resolve = pathname => { const result = describe(pathname); return result && typeof result === 'object' ? result.filename : result; };
  // Private host API: callers must never serialize filenames into public DTOs.
  resolve.describe = describe;
  return resolve;
}

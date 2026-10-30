import {text} from '../ui.js';
import {installDisposableDialog} from '../dialog-lifecycle.js';
import {modelId} from './model-catalog-data.js';

export function catalogueRows(values) {
  const rows = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const id = modelId(value); if (!id || rows.has(id)) continue;
    const name = typeof value === 'object' ? value?.name ?? value?.displayName : '';
    rows.set(id, {id, ...(typeof name === 'string' && name.trim() ? {name: name.trim()} : {})});
  }
  return [...rows.values()];
}
export function shell(title, kind) {
  const root = document.createElement('dialog'); root.className = `model-selector ${kind}`;
  const heading = text(document.createElement('h3'), title), search = document.createElement('input');
  search.type = 'search'; search.placeholder = '搜索模型 ID、显示名称或渠道'; search.setAttribute('aria-label', '搜索目录');
  const status = document.createElement('p'), error = document.createElement('p'), layout = document.createElement('div');
  status.className = 'muted'; status.setAttribute('role', 'status'); error.className = 'error'; error.setAttribute('role', 'alert');
  layout.className = 'model-selector-layout';
  const nav = document.createElement('nav'), list = document.createElement('div'), controls = document.createElement('div');
  nav.className = 'model-selector-nav'; list.className = 'model-selector-list'; controls.className = 'actions';
  layout.append(nav, list); root.append(heading, search, status, error, layout, controls);
  const leave = () => root.close();
  const life = installDisposableDialog(root, {onClosed: () => window.removeEventListener('pagehide', leave)});
  window.addEventListener('pagehide', leave, {once: true});
  document.body.append(root); root.showModal(); return {root, search, status, error, nav, list, controls, life};
}


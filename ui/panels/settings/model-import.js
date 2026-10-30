import {button, text} from '../ui.js';
import {modelId, modelLabel} from './model-catalog-data.js';
import {catalogueRows, shell} from './model-selector-view.js';

// Discovery is read-only until Apply. Selection lives outside the rendered rows
// so changing a vendor, query or page cannot silently discard earlier choices.
export function openModelImport({provider, load, onApply}) {
  const ui = shell(`勾选模型加入 · ${provider.displayName || provider.id}`, 'model-discovery');
  return importView(ui,{provider,load,onApply});
}

// The same bounded, read-only discovery workflow can live inside a channel.
export function mountModelImport({host,provider,load,onApply}) {
  const root=document.createElement('section');root.className='model-discovery model-discovery-inline';
  const search=document.createElement('input');search.type='search';search.placeholder='搜索模型';search.setAttribute('aria-label','搜索目录');
  const status=document.createElement('p'),error=document.createElement('p'),layout=document.createElement('div'),nav=document.createElement('nav'),list=document.createElement('div'),controls=document.createElement('div');
  status.className='muted';status.setAttribute('role','status');error.className='error';error.setAttribute('role','alert');layout.className='model-selector-layout';nav.className='model-selector-nav';list.className='model-selector-list';controls.className='actions';layout.append(nav,list);root.append(search,status,error,layout,controls);
  let closed=false;root.close=()=>{closed=true;root.remove();};host.append(root);
  return importView({root,search,status,error,nav,list,controls,life:{get closed(){return closed;}}},{provider,load,onApply});
}

function importView(ui,{provider,load,onApply}) {
  const existing = new Set((provider.models || []).map(modelId)), selected = new Set();
  let models = [], vendor = null, limit = 100, reading = false, busy = false, generation = 0;
  const apply = button('加入所选模型', async () => {
    if (reading || busy || ui.life.closed || !selected.size) return;
    busy = true; ui.error.textContent = ''; render();
    try { await onApply(models.filter(m => selected.has(m.id))); if (!ui.life.closed) ui.root.close(); }
    catch (error) { if (!ui.life.closed) ui.error.textContent = error.message || '加入失败'; }
    finally { busy = false; render(); }
  }, 'primary');
  const more = button('显示更多', () => { limit += 100; render(); });
  const retry = button('重新获取', () => refresh());
  const all = button('全选当前结果', () => { if (busy || reading) return; for (const m of filtered()) if (!existing.has(m.id)) selected.add(m.id); render(); });
  const clear = button('清除选择', () => { if (busy || reading) return; selected.clear(); render(); });
  ui.controls.append(all, clear, more, retry, apply, button('取消', () => ui.root.close()));
  const group = model => model.id.includes('/') ? model.id.slice(0, model.id.indexOf('/')) : '';
  const filtered = () => models.filter(m => (vendor === null || group(m) === vendor) && `${m.id} ${modelLabel(provider, m)}`.toLocaleLowerCase().includes(ui.search.value.trim().toLocaleLowerCase()));
  function render() {
    if (ui.life.closed) return;
    ui.nav.replaceChildren(); ui.list.replaceChildren();
    const groups = new Map();
    if (models.filter(m => m.id.includes('/')).length >= models.length / 2) for (const m of models) groups.set(group(m), (groups.get(group(m)) || 0) + 1);
    for (const [key, label] of [[null, '全部'], ...[...groups].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name,count]) => [name, `${name || '其他'} · ${count}`])]) {
      const item = button(label, () => { vendor = key; limit = 100; render(); }); item.setAttribute('aria-pressed', String(vendor === key)); item.disabled = busy || reading; ui.nav.append(item);
    }
    const pool = filtered();
    for (const model of pool.slice(0, limit)) {
      const label = document.createElement('label'), check = document.createElement('input');
      label.className = 'model-selector-choice'; label.dataset.modelId = model.id;
      check.type = 'checkbox'; check.disabled = existing.has(model.id) || busy || reading; check.checked = existing.has(model.id) || selected.has(model.id);
      label.append(check, document.createTextNode(`${modelLabel(provider, model)} · ${model.id}${existing.has(model.id) ? ' · 已加入' : ''}`));
      check.addEventListener('change', () => { check.checked ? selected.add(model.id) : selected.delete(model.id); sync(); }); ui.list.append(label);
    }
    if (!pool.length) ui.list.append(text(document.createElement('p'), reading ? '正在获取目录…' : '没有匹配的模型'));
    more.hidden = pool.length <= limit; more.disabled = busy || reading; retry.disabled = busy || reading; ui.search.disabled = busy || reading; sync();
  }
  function sync() { all.disabled = clear.disabled = busy || reading; apply.disabled = busy || reading || !selected.size; text(ui.status, `共 ${models.length} 项 · 匹配 ${filtered().length} · 已选 ${selected.size}`); }
  async function refresh() {
    if (busy || reading || ui.life.closed) return;
    reading = true; const ticket = ++generation; ui.error.textContent = ''; render();
    try { const values = await load(); if (ui.life.closed || ticket !== generation) return; models = catalogueRows(values); selected.clear(); vendor = null; limit = 100; }
    catch (error) { if (!ui.life.closed && ticket === generation) ui.error.textContent = error.message || '获取失败'; }
    finally { if (!ui.life.closed && ticket === generation) { reading = false; render(); } }
  }
  ui.search.addEventListener('input', () => { vendor = null; limit = 100; render(); }); void refresh(); return ui.root;
}

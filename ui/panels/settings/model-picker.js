import {button, text} from '../ui.js';
import {modelLabel, modelChoiceLabel} from './model-catalog-data.js';
import {catalogueRows, shell} from './model-selector-view.js';

export function openModelPicker({providers, current = {}, title = '选择模型', followMain, onPick}) {
  const ui = shell(title, 'model-picker');
  // This is a navigation group, never a synthetic provider or a saved model ID.
  const mainGroup = followMain && {label:'当前模型', provider:providers.find(p => p.id === followMain.provider), models:followMain.model ? catalogueRows([{id:followMain.model}]) : [], follow:true};
  const groups = [...(mainGroup ? [mainGroup] : []), ...providers.map(provider => ({label:provider.displayName || provider.id, provider, models:catalogueRows(provider.models)}))];
  let active = mainGroup && !current.model ? mainGroup : groups.find(group => !group.follow && group.provider.id === current.provider) || groups[0], limit = 100, busy = false;
  const nav = new Map();
  const matches = (group, model) => `${group.label} ${group.provider?.id || ''} ${model.id} ${group.follow ? modelChoiceLabel(providers, followMain) : modelLabel(group.provider, model)}`.toLocaleLowerCase().includes(ui.search.value.trim().toLocaleLowerCase());
  for (const group of groups) {
    const item = button(group.label, () => { active = group; limit = 100; render(); });
    if (group.follow) item.dataset.currentModel = '';
    else item.dataset.providerId = group.provider.id;
    ui.nav.append(item); nav.set(group, item);
  }
  const more = button('显示更多', () => { limit += 100; render(); });
  ui.controls.append(more, button('取消', () => ui.root.close()));
  const commit=async choice=>{
    if (busy || ui.life.closed) return;
    busy=true;ui.error.textContent='';render();
    try { await onPick(choice,{isCurrent:()=>!ui.life.closed});if(!ui.life.closed)ui.root.close(); }
    catch(error){if(!ui.life.closed)ui.error.textContent=error.message||'保存失败';}
    finally{busy=false;render();}
  };
  function render() {
    if (ui.life.closed) return;
    const matching = groups.filter(group => group.models.some(model => matches(group, model)));
    if (ui.search.value && !matching.includes(active)) active = matching[0];
    else if (!ui.search.value && !active) active = groups[0];
    for (const group of groups) {
      const item = nav.get(group); item.disabled = busy;
      item.hidden = !!ui.search.value && !matching.includes(group); item.setAttribute('aria-pressed', String(group === active));
    }
    const provider = active?.provider, pool = active ? active.models.filter(model => matches(active, model)) : [];
    ui.list.replaceChildren(); ui.search.disabled = busy;
    for (const model of pool.slice(0, limit)) {
      const choose = button(active.follow ? modelChoiceLabel(providers, followMain) : `${modelLabel(provider, model)} · ${model.id}`, () => commit(active.follow ? {followMain:true} : {provider: provider.id, model: model.id}));
      choose.className = 'model-selector-choice'; choose.dataset.modelId = model.id; choose.disabled = busy;
      if (active.follow) {
        choose.classList.add('model-picker-current');choose.dataset.followMain='';choose.title='使用当前主模型；主模型变更时自动跟随';
        const detail=document.createElement('small');detail.textContent=`模型ID：${model.id}`;choose.append(detail);
      }
      choose.setAttribute('aria-pressed', String(active.follow ? !current.model : current.provider === provider.id && current.model === model.id));
      ui.list.append(choose);
    }
    if (!pool.length) ui.list.append(text(document.createElement('p'), active?.follow && !followMain.model ? '尚未选择主模型，请先配置主模型。' : groups.length ? '没有匹配的模型，请在模型管理中添加或修改。' : '目录为空，请先添加渠道和模型。'));
    text(ui.status, `${active?.label || '模型目录'} · ${pool.length} 个匹配项`);
    more.hidden = pool.length <= limit; more.disabled = busy;
  }
  ui.search.addEventListener('input', () => { limit = 100; render(); }); render(); return ui.root;
}


// Pure resolution: selecting one contribution never disables its owner's other
// contributions. Replacement and wrapping are explicit per component key.
const row = ({ ownerId, mode, rank, order }) => ({ ownerId, mode, rank, order });
export function resolveCompositionSelection(plan, defaultKeys = [], suppliedKeys = []) {
  const histories = new Map(defaultKeys.map(key => [key, [{ ownerId: 'defaults', mode: 'replace', rank: 0, order: null }]]));
  const ui = { panels: [], assets: {}, owners: { panels: {}, assets: {} } };
  const uiHistories = new Map(), conflicts = [];
  const selection = { components: {}, ui: { panels: {}, assets: {} } };
  const rememberUi = (target, entry) => {
    const history = uiHistories.get(target) ?? []; history.push(entry); uiHistories.set(target, history);
  };
  const layers = plan.map((item, index) => {
    const { layer } = item, rank = index + 1;
    for (const definition of item.components) {
      const history = histories.get(definition.key) ?? [];
      history.push({ ownerId: layer.id, mode: definition.mode, rank, order: layer.order, definition });
      histories.set(definition.key, history);
    }
    if (item.ui.shell) {
      ui.shell = item.ui.shell; ui.owners.shell = rank;
      const entry = { ownerId: layer.id, rank, order: layer.order };
      selection.ui.shell = entry; rememberUi('ui.shell', entry);
    }
    for (const [key, file] of Object.entries(item.ui.assets)) {
      ui.assets[key] = file; ui.owners.assets[key] = rank;
      const entry = { ownerId: layer.id, rank, order: layer.order, status: 'active' };
      selection.ui.assets[key] = entry; rememberUi(`ui.asset:${key}`, entry);
    }
    for (const panel of item.ui.panels) {
      const old = ui.panels.findIndex(value => value.id === panel.id);
      if (old >= 0) ui.panels.splice(old, 1);
      ui.panels.push(panel); ui.owners.panels[panel.id] = rank;
      const entry = { ownerId: layer.id, rank, order: layer.order };
      selection.ui.panels[panel.id] = entry; rememberUi(`ui.panel:${panel.id}`, entry);
    }
    return { id: layer.id, version: layer.version, order: layer.order, components: item.components.map(value => value.key), routes: item.routes.map(value => value.id), panels: item.ui.panels.map(value => value.id), assets: Object.keys(item.ui.assets) };
  });
  for (const key of suppliedKeys) {
    const history = histories.get(key) ?? [];
    history.push({ ownerId: 'host', mode: 'replace', rank: plan.length + 1, order: null });
    histories.set(key, history);
  }
  const chains = new Map();
  for (const [key, history] of histories) {
    const lastReplace = history.findLastIndex(entry => entry.mode === 'replace');
    if (lastReplace < 0) throw new Error(`[composition] 包装组件 ${key} 没有可调用的下层实现`);
    const chain = history.slice(lastReplace), winner = chain.at(-1);
    chains.set(key, chain);
    selection.components[key] = { ownerId: winner.ownerId, chain: chain.map(row), history: history.map((entry, index) => ({ ...row(entry), active: index >= lastReplace })) };
    const contributors = history.filter(entry => entry.ownerId !== 'defaults');
    if (contributors.length > 1) conflicts.push({ target: `component:${key}`, winner: winner.ownerId, contributors: contributors.map(entry => entry.ownerId), resolution: winner.mode, chain: chain.map(entry => entry.ownerId), tiedOrder: contributors.some((entry, index) => contributors.slice(0, index).some(previous => entry.order !== null && entry.order === previous.order)) });
  }
  for (const [target, history] of uiHistories) if (history.length > 1) {
    const winner = history.at(-1);
    conflicts.push({ target, winner: winner.ownerId, contributors: history.map(entry => entry.ownerId), resolution: 'replace', tiedOrder: history.some((entry, index) => history.slice(0, index).some(previous => entry.order === previous.order)) });
  }
  for (const [key, asset] of Object.entries(selection.ui.assets)) {
    const panelId = key.match(/^panels\/([^/]+)\//)?.[1];
    const root = panelId ? selection.ui.panels[panelId] : key.startsWith('shell/') ? selection.ui.shell : null;
    if (root && root.rank > asset.rank) {
      asset.status = 'shadowed'; asset.blockedBy = { target: panelId ? `ui.panel:${panelId}` : 'ui.shell', ownerId: root.ownerId };
      conflicts.push({ target: `ui.asset:${key}`, winner: root.ownerId, contributors: [asset.ownerId, root.ownerId], resolution: 'shadowed-by-root', tiedOrder: root.order === asset.order });
    }
  }
  return { chains, ui, layers, selection, conflicts };
}

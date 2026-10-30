import { request, openCommunityPage } from './panel-client.js';
import { confirmAction } from './ui.js';

const labels = { skill: '技能', plugin: '插件' };

// The catalog is fetched only on first opening or an explicit refresh. Shell
// status events refresh installed extensions without issuing public requests.
export function bindMarketBrowser({ kind, onInstalled, requestImpl = request, confirmImpl = confirmAction, openPageImpl = openCommunityPage, doc = document }) {
  if (!labels[kind]) throw new Error('未知市场类型');
  const label = labels[kind], find = id => doc.getElementById(id);
  const installed = find('installed-view'), market = find('market-view'), actions = find('installed-actions');
  const tabs = [find('tab-installed'), find('tab-market')];
  const results = find('market-results'), status = find('market-status'), search = find('market-search'), category = find('market-category'), refresh = find('market-refresh');
  const feedback = find('market-install-status');
  let items = [], loaded = false, busy = false, installing = false, selected = 0;
  const installedIds = new Set();

  const element = (tag, text, className) => {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const announce = (node, message, failed = false) => {
    node.textContent = message;
    node.className = failed ? 'error market-feedback' : 'muted market-feedback';
  };
  const updateInstallButtons = () => {
    for (const button of results.querySelectorAll('[data-market-install-id]')) {
      const done = installedIds.has(button.dataset.marketInstallId);
      button.disabled = installing || done;
      button.textContent = done ? '本次已安装' : '安装';
    }
  };

  async function install(item) {
    if (installing || !item.installCode) return;
    const origin = doc.activeElement;
    let confirmed = false;
    installing = true;
    try {
      if (!await confirmImpl(`安装「${item.name || item.id}」？\n\n来源：QQ Agent 在线${label}市场\n版本：${item.version || '未声明'} · 作者：${item.author || '未声明'}\n\n安装后默认停用，不执行代码。请检查来源、设置与权限后显式启用。Node 插件不是沙箱。`)) return;
      confirmed = true; updateInstallButtons();
      announce(feedback, `正在校验、下载并安装「${item.name || item.id}」…`);
      const result = await requestImpl('POST', '/api/market/install', { id: item.id, kind });
      if (result?.ok !== true || !result.installed || result.kind !== kind) throw new Error('未收到明确的安装结果，请在已安装列表中重扫核对。');
      installedIds.add(item.id);
      announce(feedback, `已安装「${result.skill?.name || result.installed}」，默认停用，未执行代码。可切换到「已安装」检查设置与权限后启用。`);
      try { await onInstalled?.(); }
      catch { announce(feedback, `已安装「${result.installed}」，默认停用。已安装列表刷新失败，请切换后重扫磁盘。`); }
    } catch (error) {
      announce(feedback, `安装未完成：${error.message || '请稍后重试'}。如遇请求超时，请先在已安装列表重扫核对。`, true);
    } finally {
      installing = false; updateInstallButtons();
      if (origin?.isConnected && !market.hidden && (!confirmed || doc.activeElement === doc.body)) origin.focus();
    }
  }

  function render() {
    if (!loaded) return;
    const query = search.value.trim().toLocaleLowerCase();
    const visible = items.filter(item => (!category.value || item.category === category.value) && (!query || [item.name, item.id, item.description, item.author].some(value => String(value ?? '').toLocaleLowerCase().includes(query))));
    results.replaceChildren();
    if (!busy) announce(status, `找到 ${visible.length} 项${label} · 在线目录共 ${items.length} 项`);
    if (!visible.length) {
      results.append(element('p', items.length ? `没有匹配的${label}，试试其他关键词或分类。` : `在线${label}市场暂无条目。`, 'empty'));
      return;
    }
    for (const item of visible) {
      const card = element('article', undefined, 'market-card');
      card.dataset.marketId = item.id;
      const head = element('div', undefined, 'market-card-head');
      head.append(element('span', item.categoryName || item.category || '其他', 'market-category-label'), element('span', item.version ? `v${item.version}` : '版本未声明', 'muted'));
      card.append(head, element('h3', item.name || item.id), element('code', item.id, 'market-item-id'), element('p', item.description || '暂无描述', 'market-description'));
      const footer = element('div', undefined, 'market-card-footer');
      footer.append(element('span', item.author || '作者未声明', 'muted'));
      const canInstall = item.status === 'approved' && /^[A-Z0-9]{4,12}$/.test(item.installCode || '');
      if (canInstall) {
        const button = element('button', installedIds.has(item.id) ? '本次已安装' : '安装');
        button.dataset.marketInstallId = item.id;
        button.type = 'button'; button.disabled = installing || installedIds.has(item.id);
        button.setAttribute('aria-label', `安装${label} ${item.name || item.id}`);
        button.addEventListener('click', () => install(item)); footer.append(button);
      } else {
        footer.append(element('span', item.status === 'pending' ? '审核中 · 暂不可安装' : '暂未开放安装', 'muted market-availability'));
      }
      card.append(footer); results.append(card);
    }
  }

  async function load() {
    if (busy) return;
    busy = true; refresh.disabled = true; market.setAttribute('aria-busy', 'true');
    announce(status, `正在加载在线${label}市场…`);
    if (!loaded) results.replaceChildren(element('p', '正在获取社区目录…', 'empty'));
    try {
      const data = await requestImpl('GET', '/api/market/catalog', undefined, { kind });
      if (data?.ok !== true || data.kind !== kind || !Array.isArray(data.items)) throw new Error('市场目录响应异常');
      items = data.items.filter(item => item && item.type === kind); loaded = true;
      const previous = category.value;
      category.replaceChildren();
      const all = element('option', '全部分类'); all.value = ''; category.append(all);
      for (const [id, name] of Object.entries(data.categories || {})) {
        if (typeof name !== 'string') continue;
        const option = element('option', name); option.value = id; category.append(option);
      }
      category.value = [...category.options].some(option => option.value === previous) ? previous : '';
      busy = false; render();
    } catch (error) {
      if (!loaded) results.replaceChildren(element('p', `在线${label}市场暂不可用。可重试，或继续管理已安装扩展。`, 'empty'));
      const unavailable = error?.data?.httpStatus === 503 || error?.status === 503;
      announce(status, `${unavailable ? '扩展市场服务未就绪，请在已安装插件中检查「扩展市场」提供者。' : '无法加载在线目录。'} ${error.message || '请稍后重试'}${loaded ? ' 当前保留上次加载的目录。' : ''}`, true);
    } finally { busy = false; refresh.disabled = false; market.setAttribute('aria-busy', 'false'); }
  }

  function selectView(index, focus = false) {
    selected = index;
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    installed.hidden = index !== 0; market.hidden = index !== 1;
    if (actions) actions.hidden = index !== 0;
    if (focus) tabs[index].focus();
    if (index === 1 && !loaded) void load();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectView(index));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : ['ArrowLeft', 'ArrowRight'].includes(event.key) ? 1 - selected : null;
      if (next !== null) { event.preventDefault(); selectView(next, true); }
    });
  });
  search.addEventListener('input', render); category.addEventListener('change', render); refresh.addEventListener('click', load);
  const external = find(kind === 'skill' ? 'open-skill-market' : 'open-plugin-market'), externalStatus = find(`${kind}-market-status`);
  external.addEventListener('click', async () => {
    external.disabled = true;
    try { await openPageImpl(`${kind}-market-btn`); announce(externalStatus, `已请求在浏览器打开${label}市场`); }
    catch (error) { externalStatus.replaceChildren(element('span', error.message || '无法打开网页，请稍后重试', 'error')); }
    finally { external.disabled = false; }
  });
  selectView(0);
  return { selectView, refresh: load };
}

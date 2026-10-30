// 68 · 主题引擎契约：token 完整、shell 别名全覆盖、opaque-origin 面板不崩。
//
// 背景：面板 iframe 是 sandbox='allow-scripts'（无 allow-same-origin）→ opaque origin，
// 读不到 localStorage、shell 也拿不到它的 DOM。第一版用 localStorage 分发，
// 结果"外壳换了皮肤、面板没换"——面板静默回落默认主题，还不报错。
// 正确链路：config.json（真源）→ shell 应用 → RPC 推给 iframe。
// 本测试锁住三件事：token 完整性、shell 别名全覆盖、无 localStorage 环境不崩。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function cssTree(rel, seen = new Set()) {
  const file = path.resolve(root, rel);
  if (seen.has(file)) return '';
  seen.add(file);
  const css = fs.readFileSync(file, 'utf8');
  return [...css.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?\s*;/g)].map(([, target]) => {
    assert.ok(!/^(?:https?:|data:|\/\/)/.test(target), '共享主题入口仅导入项目内资源');
    return cssTree(path.relative(root, path.resolve(path.dirname(file), target)), seen);
  }).join('\n') + '\n' + css;
}

/** 模拟一份"面板 iframe"环境：无 localStorage（访问即抛）、window 事件可注册。 */
function mockPanelDom() {
  const vars = new Map();
  const listeners = new Map();
  const dataset = {};
  globalThis.document = {
    documentElement: { style: { setProperty: (k, v) => vars.set(k, v) } },
    body: { dataset },
  };
  globalThis.window = {
    addEventListener: (name, fn) => { listeners.set(name, fn); },
    dispatchEvent: () => true,
  };
  globalThis.localStorage = {
    getItem: () => { throw new DOMException('Access denied', 'SecurityError'); },
    setItem: () => { throw new DOMException('Access denied', 'SecurityError'); },
    removeItem: () => { throw new DOMException('Access denied', 'SecurityError'); },
  };
  return { vars, listeners, dataset };
}

/** 模拟 shell 环境：localStorage 可用（正常 origin）。 */
function mockShellDom() {
  const vars = new Map();
  const store = new Map();
  const dataset = {};
  globalThis.document = {
    documentElement: { style: { setProperty: (k, v) => vars.set(k, v) } },
    body: { dataset },
  };
  globalThis.window = { addEventListener: () => {}, dispatchEvent: () => true };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  return { vars, store, dataset };
}

console.log('=== A. 模块加载与预设完整性（面板 opaque origin 下不崩）===');
{
  const env = mockPanelDom();
  const mod = await import(pathToFileURL(path.join(root, 'ui/panels/theme.js')).href);
  assert.ok(mod.PRESETS, 'PRESETS 导出');
  const REQUIRED = ['bg', 'surface', 'surface2', 'surface3', 'text', 'muted', 'faint', 'accent', 'accent2', 'line', 'lineSoft', 'accentInk'];
  for (const [name, preset] of Object.entries(mod.PRESETS)) {
    for (const key of REQUIRED) {
      assert.ok(preset.tokens?.[key], `预设 ${name} 缺 token：${key}`);
      if (String(preset.tokens[key]).startsWith('#')) {
        // 6 位或 8 位（8 位 = 带透明度，终末地的发丝线 #ffffff26 就走这个）
        assert.match(preset.tokens[key], /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, `预设 ${name}.${key} 色值格式非法`);
      }
    }
  }
  // 关键架构约束：opaque origin 下 import 自执行 + readTheme 都不能抛
  const t = mod.getCurrentTheme();
  assert.ok(t && t.bg, 'opaque origin 下 getCurrentTheme 回落出厂默认');
  console.log(`✓ ${Object.keys(mod.PRESETS).length} 个预设 token 完整，面板环境加载不崩`);
  globalThis.__themeMod = mod;
}
import { pathToFileURL } from 'node:url';

console.log('=== B. shell 别名全覆盖（防止"外壳没换皮肤"复发）===');
{
  const env = mockShellDom();
  const mod = globalThis.__themeMod ?? await import(pathToFileURL(path.join(root, 'ui/panels/theme.js')).href);
  mod.writeTheme({ ...mod.PRESETS.cursor.tokens, preset: 'cursor', radius: 8, density: 1, sidebar: 'left', btnAlign: 'left' });
  const mustHave = [
    // panels 核心变量
    '--bg', '--surface', '--surface-2', '--surface-3', '--text', '--muted', '--faint',
    '--accent', '--accent-2', '--good', '--warn', '--bad', '--line', '--line-soft',
    '--r-sm', '--r-md', '--r-lg', '--r-pill', '--accent-grad',
    // 间距刻度
    ...['1', '2', '3', '4', '5', '6', '8'].map((n) => `--sp-${n}`),
    // shell 别名（第一版漏了这些，导致侧栏没吃到主题）
    '--canvas', '--rail', '--surface-raised', '--ink', '--accent-ink', '--danger', '--cyan',
  ];
  const missing = mustHave.filter((k) => !env.vars.has(k));
  assert.equal(missing.length, 0, `applyTheme 未写入的变量：${missing.join(', ')}`);
  const selected = mod.PRESETS.cursor.tokens;
  assert.equal(env.vars.get('--accent'), selected.accent, 'accent 已应用');
  assert.equal(env.vars.get('--rail'), selected.bg, '侧栏底色跟随主题 bg');
  assert.equal(env.vars.get('--ink'), selected.text, 'shell 文字色已映射');
  assert.equal(env.vars.get('--accent-grad'), `linear-gradient(90deg, ${selected.accent}, ${selected.accent2})`, '渐变开关生效');
  assert.equal(env.dataset.sidebar, 'left', '布局属性已写入');
  assert.equal(env.dataset.styleMode, 'endfield', '视觉语言默认终末地');
  assert.equal(mod.PRESETS.endfield.tokens.styleMode, 'endfield', '终末地预设携带对应视觉语言');
  mod.writeTheme({ ...mod.DEFAULT_THEME, styleMode: 'flux' });
  assert.equal(env.dataset.styleMode, 'flux', '实验视觉语言写入 body');
  mod.writeTheme({ ...mod.DEFAULT_THEME, styleMode: 'signal' });
  assert.equal(env.dataset.styleMode, 'signal', '信号仪表语言写入 body');
  assert.ok(mod.PRESETS.flux, '实验预设存在');
  assert.equal(mod.PRESETS.flux.tokens.styleMode, 'flux', '实验预设携带视觉语言');
  assert.equal(mod.resolveScheme({ mode: 'dark', dark: { styleMode: 'flux' } }).styleMode, 'flux', '视觉语言随方案持久化');
  mod.writeTheme({ ...mod.DEFAULT_THEME, styleMode: 'nonsense' });
  assert.equal(env.dataset.styleMode, 'endfield', '未知视觉语言回落出厂 endfield');
  // Preset resolution must remain coherent; exact art-direction colors may evolve.
  assert.equal(mod.resolveScheme({ mode: 'dark' }).accent, mod.DARK_BASE.accent, '暗色解析使用暗色基准');
  assert.equal(mod.resolveScheme({ mode: 'dark' }).bg, mod.DARK_BASE.bg, '暗色解析保留页面基准');
  assert.equal(mod.resolveScheme({ mode: 'light' }).accent, mod.LIGHT_BASE.accent, '亮色解析使用亮色基准');
  assert.equal(mod.DEFAULT_THEME.styleMode, 'endfield', '出厂默认视觉语言是终末地');
  assert.ok(Number.isFinite(mod.DEFAULT_THEME.radius) && mod.DEFAULT_THEME.radius >= 0 && mod.DEFAULT_THEME.radius <= 16, '出厂形状在支持的用户调节范围内');
  console.log(`✓ ${mustHave.length} 个 CSS 变量全部写入（含 7 个 shell 别名）`);
}

console.log('=== C. 值域与回退 ===');
{
  const env = mockShellDom();
  const mod = globalThis.__themeMod ?? await import(pathToFileURL(path.join(root, 'ui/panels/theme.js')).href);
  // 只给部分字段，缺的回落默认
  const t = mod.writeTheme({ bg: '#111111', preset: 'cursor' });
  assert.equal(t.bg, '#111111');
  assert.ok(t.surface, '缺省字段回落默认');
  // 圆角推导比例
  mod.writeTheme({ ...mod.DEFAULT_THEME, radius: 10 });
  assert.equal(env.vars.get('--r-md'), '10px');
  assert.ok(Number.parseFloat(env.vars.get('--r-sm')) < 10, '小控件形状小于用户基准');
  assert.ok(Number.parseFloat(env.vars.get('--r-lg')) > 10, '大控件形状大于用户基准');
  // 密度缩放间距
  mod.writeTheme({ ...mod.DEFAULT_THEME, density: 1.25 });
  assert.equal(env.vars.get('--sp-4'), `${Math.round(16 * 1.25)}px`);
  // 渐变关闭时 accent-grad 是纯色（不是 gradient）
  mod.writeTheme({ ...mod.DEFAULT_THEME, gradient: false });
  assert.ok(!String(env.vars.get('--accent-grad')).includes('gradient'));
  mod.writeTheme({ ...mod.DEFAULT_THEME, radius: 0 });
  assert.equal(env.vars.get('--r-sm'), '0px', '0 圆角不能被 || 默认值顶回去');
  assert.equal(env.vars.get('--r-md'), '0px');
  mod.writeTheme({ ...mod.DEFAULT_THEME, preset: 'light', ...mod.LIGHT_BASE });
  assert.equal(env.vars.get('--overlay'), mod.LIGHT_BASE.bg, '浅色输入底同步');
  assert.equal(env.vars.get('color-scheme'), 'light', '原生控件使用浅色');
  mod.writeTheme(mod.DEFAULT_THEME);
  assert.equal(env.vars.get('color-scheme'), 'dark', '切回暗色同步原生控件');
  console.log('✓ 部分字段回退 / 圆角推导 / 密度缩放 / 渐变开关 全部正确');
}

console.log('=== D. RPC 通道已接线（theme.apply + ready 推送）===');
{
  const bridge = fs.readFileSync(path.join(root, 'ui/shell/rpc-bridge.js'), 'utf8');
  assert.ok(bridge.includes("'theme.apply'"), 'RPC_METHODS 含 theme.apply');
  assert.ok(bridge.includes("this.manifest.kind!=='bundled'"), '宿主换肤仅允许 bundled 面板；用户面板保持三方法边界');
  assert.ok(bridge.includes('this.onReady?.()'), 'panel.ready 触发 onReady（宿主推主题）');
  const registry = fs.readFileSync(path.join(root, 'ui/shell/panel-registry.js'), 'utf8');
  assert.ok(registry.includes('onReady:'), 'registry 传 onReady');
  assert.ok(registry.includes('bridge.event(\'theme\'') || registry.includes("event('theme'"), 'ready 时推送主题');
  assert.ok(registry.includes('applyThemeEverywhere'), 'registry 有落地+广播方法');
  const client = fs.readFileSync(path.join(root, 'ui/panels/panel-client.js'), 'utf8');
  assert.ok(client.includes('applyHostTheme'), '面板侧有 applyHostTheme RPC 封装');
  assert.ok(client.includes("name==='theme'"), '面板监听 shell 推送的 theme 事件');
  console.log('✓ theme.apply RPC + ready 推送 + 面板监听 全部接线');
}

console.log('=== D2. 方案模型：亮/暗基准 + 独立自定义方案（用户定稿语义）===');
{
  const env = mockShellDom();
  const mod = globalThis.__themeMod ?? await import(pathToFileURL(path.join(root, 'ui/panels/theme.js')).href);

  // 亮色/暗色是出厂基准：无任何编辑时，取到的就是基准值
  assert.equal(mod.resolveScheme({ mode: 'dark' }).bg, mod.DARK_BASE.bg, '暗色基准');
  assert.equal(mod.resolveScheme({ mode: 'light' }).bg, mod.LIGHT_BASE.bg, '亮色基准');

  // 旧扁平结构（v1 配置）迁移后不丢外观
  const migrated = mod.migrateUikit({ bg: '#0c0c0c', accent: '#6366f1', radius: 8 });
  assert.equal(migrated.mode, 'dark');
  assert.equal(migrated.dark.bg, '#0c0c0c', '旧配色保留在暗色编辑态');

  // 另存为：得到一个独立于基准的自定义方案
  const base = mod.resolveScheme({ mode: 'dark' });
  const { store, id } = mod.saveCustom({ mode: 'dark' }, '我的蓝', { ...base, accent: '#123456' });
  assert.equal(store.mode, `custom:${id}`, '另存后切到该方案');
  assert.ok(store.custom[id], '自定义方案已入库');
  assert.equal(mod.resolveScheme(store).accent, '#123456', '自定义方案生效');
  // 关键：自定义方案不影响基准
  assert.equal(mod.resolveScheme({ mode: 'dark' }).accent, mod.DARK_BASE.accent, '暗色基准未被污染');
  assert.equal(mod.resolveScheme({ mode: 'light' }).accent, mod.LIGHT_BASE.accent, '亮色基准未被污染');

  // 多个自定义方案互不干扰
  const two = mod.saveCustom(store, '第二套', { ...base, accent: '#abcdef' });
  assert.equal(Object.keys(two.store.custom).length, 2, '可保存多个自定义方案');
  assert.equal(mod.resolveScheme({ ...two.store, mode: `custom:${id}` }).accent, '#123456', '第一套不受影响');

  // 删除正在使用的方案 → 回落到暗色基准
  const after = mod.deleteCustom(two.store, two.id);
  assert.equal(after.mode, 'dark', '删除当前方案后回落暗色');
  assert.equal(Object.keys(after.custom).length, 1, '只删了目标方案');

  // 重命名
  const renamed = mod.renameCustom(after, id, '改名后');
  assert.equal(renamed.custom[id].name, '改名后');

  // 混合结构（旧扁平键 + 新子字段并存）：旧配置首次编辑只 POST 子路径，
  // 服务端深合并后就是这个中间态。遗留外观必须折叠进暗色编辑态，不能被丢掉。
  const mixed = mod.migrateUikit({ bg: '#101010', accent: '#ff8800', radius: 5, dark: { surface: '#123456' } });
  assert.equal(mixed.dark.bg, '#101010', '遗留底色折叠进暗色编辑态');
  assert.equal(mixed.dark.accent, '#ff8800', '遗留强调色不丢');
  assert.equal(mixed.dark.radius, 5, '遗留布局不丢');
  assert.equal(mixed.dark.surface, '#123456', '新结构子字段优先于遗留键');
  assert.equal(mod.resolveScheme(mixed).accent, '#ff8800', '解析后仍是用户的强调色');
  assert.equal(mod.resolveScheme(mixed).bg, '#101010', '解析后仍是用户的底色');
  // 切到亮色基准时遗留外观归暗色槽，不污染亮色
  const mixedLight = mod.migrateUikit({ accent: '#ff8800', mode: 'light' });
  assert.equal(mod.resolveScheme(mixedLight).accent, mod.LIGHT_BASE.accent, '亮色基准不被遗留暗色污染');
  assert.equal(mod.resolveScheme({ ...mixedLight, mode: 'dark' }).accent, '#ff8800', '遗留值仍保留在暗色槽');
  // 只带布局键的旧配置也不能丢（圆角/密度属于一套完整方案）
  assert.equal(mod.migrateUikit({ radius: 5 }).dark.radius, 5, '仅布局键的旧配置保留');
  console.log('✓ 亮/暗基准不可污染、自定义方案独立且可多个、另存/删除/重命名/旧配置折叠 全部正确');
}

console.log('=== D3. 背景图：地址消毒 + 变量写入 ===');
{
  const env = mockShellDom();
  const mod = globalThis.__themeMod ?? await import(pathToFileURL(path.join(root, 'ui/panels/theme.js')).href);
  assert.equal(mod.safeBgUrl('https://example.com/a.png'), 'https://example.com/a.png');
  // 历史遗留的 /api/uikit/background/xxx 会被迁移到静态别名 /ui/backgrounds/xxx：
  // 图片要当 CSS background / <img src> 用，而 <img> 带不了 x-console-token 头，
  // 走 API 必然 401 裂图。详见 routes.js 上传路由与 kernel 的 extraStaticRoots。
  assert.equal(mod.safeBgUrl('/api/uikit/background/bg-abc123.png'), '/ui/backgrounds/bg-abc123.png');
  // 新路径原样保留；同名不同前缀不可混淆
  assert.equal(mod.safeBgUrl('/ui/backgrounds/bg-abc123.png'), '/ui/backgrounds/bg-abc123.png');
  // 其他 /api/ 路径不参与迁移，原样放行
  assert.equal(mod.safeBgUrl('/api/status'), '/api/status');
  // 能跳出 CSS 值的一律拒绝
  for (const bad of ['x"); background: red; --y:("', "a'b", 'a\\b', 'a;b', 'javascript:alert(1)', '/etc/passwd']) {
    assert.equal(mod.safeBgUrl(bad), '', `拒绝非法背景地址：${bad}`);
  }
  mod.writeTheme({ ...mod.DEFAULT_THEME, bgImage: 'https://example.com/a.png', bgOpacity: 0.5, bgBlur: 4, bgFit: 'contain' });
  assert.equal(env.vars.get('--bg-image'), 'url("https://example.com/a.png")');
  assert.equal(env.vars.get('--bg-opacity'), '0.5');
  assert.equal(env.vars.get('--bg-blur'), '4px');
  assert.equal(env.vars.get('--bg-fit'), 'contain');
  assert.equal(env.dataset.bgImage, 'on');
  // 越界值收敛
  mod.writeTheme({ ...mod.DEFAULT_THEME, bgOpacity: 9, bgBlur: -5 });
  assert.equal(env.vars.get('--bg-opacity'), '1', '不透明度上限 1');
  assert.equal(env.vars.get('--bg-blur'), '0px', '模糊下限 0');
  // 非法地址 → 关闭背景层
  mod.writeTheme({ ...mod.DEFAULT_THEME, bgImage: 'javascript:alert(1)' });
  assert.equal(env.vars.get('--bg-image'), 'none');
  assert.equal(env.dataset.bgImage, 'off');

  // 背景图编辑器的四个参数必须写成 CSS 变量（旋转 + 范围 + 位置）。
  // 少了这组断言，编辑器参数会被静默丢弃、背景不跟随裁切。
  mod.writeTheme({
    ...mod.DEFAULT_THEME, bgImage: 'https://example.com/a.png',
    bgRotate: 90, bgZoom: 0.5, bgOffsetX: 20, bgOffsetY: -12,
  });
  assert.equal(env.vars.get('--bg-rotate'), '90deg', '旋转角度写成 deg');
  assert.equal(env.vars.get('--bg-zoom'), '0.5');
  assert.equal(env.vars.get('--bg-offset-x'), '20%');
  assert.equal(env.vars.get('--bg-offset-y'), '-12%');
  // 越界收敛
  mod.writeTheme({ ...mod.DEFAULT_THEME, bgRotate: -90, bgZoom: 99, bgOffsetX: 999, bgOffsetY: -999 });
  assert.equal(env.vars.get('--bg-rotate'), '270deg', '负角度归一化到 0..360');
  assert.equal(env.vars.get('--bg-zoom'), '1', '选区宽度上限100%');
  assert.equal(env.vars.get('--bg-crop-scale'), '1', '全图选区无需放大');
  assert.equal(env.vars.get('--bg-offset-x'), '0%', '全图选区不能越过原图边界');
  assert.equal(env.vars.get('--bg-offset-y'), '0%', '全图选区居中');
  mod.writeTheme({ ...mod.DEFAULT_THEME, bgZoom: 0.01, bgOffsetX: 999, bgOffsetY: -999 });
  assert.equal(env.vars.get('--bg-zoom'), '0.2', '选框最小20%，与编辑器一致');
  assert.equal(env.vars.get('--bg-crop-scale'), '5', '20%选区放大5倍');
  assert.equal(env.vars.get('--bg-offset-x'), '40%', '选区右边止于原图边缘');
  assert.equal(env.vars.get('--bg-offset-y'), '-40%', '选区上边止于原图边缘');
  // 背景图只由 shell 画：面板 iframe 必须关掉自己的背景层，否则 shell + 9 个面板叠成两层
  assert.equal(env.dataset.bgOwner, 'shell', '标记背景图归shell 绘制');
  console.log('✓ 背景地址消毒 / 变量写入 / 越界收敛 / 编辑器四参数 / 单层归属 全部正确');
}

console.log('=== E0. 无 DOM 环境可安全加载（Node 侧 import 不崩）===');
{
  // panel-registry.js 会被 Node 测试 import，链式加载 theme.js。
  // theme.js 若假定浏览器环境（自执行 applyTheme 直接摸 document）会直接崩掉测试。
  globalThis.document = undefined;
  globalThis.window = undefined;
  globalThis.localStorage = undefined;
  const url = pathToFileURL(path.join(root, 'ui/shell/panel-registry.js')).href;
  const reg = await import(url);
  assert.equal(typeof reg.PanelRegistry, 'function', '无 DOM 时 panel-registry 仍可 import');
  // 且不能用绝对路径 /panels/theme.js（Node 会解析成 C:\panels\theme.js）
  const code = fs.readFileSync(path.join(root, 'ui/shell/panel-registry.js'), 'utf8');
  assert.ok(!code.includes("from '/panels/theme.js'"), 'panel-registry 用相对路径引用 theme.js（绝对路径在 Node 下解析失败）');
  console.log('✓ Node 无 DOM 环境加载 panel-registry 不崩，引用路径为相对路径');
}

console.log('=== E. 设置面板的组件库分区已注册（含 manifest 语义路径检查不涉及）===');
{
  const panel = fs.readFileSync(path.join(root, 'ui/panels/settings/panel.js'), 'utf8');
  assert.ok(panel.includes("section('uikit'"), '存在组件库分区');
  assert.ok(panel.includes('applyHostTheme'), '预览走宿主 RPC（而非 localStorage）');
  assert.ok(panel.includes('ui.uikit.'), '值存 ui.uikit.*（ui.theme 已被主题下拉占用）');
  const shellCss = cssTree('ui/shell/style.css');
  const commonCss = cssTree('ui/panels/common.css');
  assert.ok(shellCss.includes('data-sidebar="right"') && shellCss.includes('data-sidebar="hidden"'), 'shell 支持侧栏换位/隐藏');
  assert.ok(commonCss.includes('data-btn-align="center"'), '面板支持按钮排布');
  assert.ok(commonCss.includes('data-gradient="on"'), '面板支持渐变开关');
  assert.ok(commonCss.includes('--font-mono'), '字体已拆分：界面 sans / 代码 mono');
  assert.ok(!commonCss.includes('font: 14px/1.5 var(--font);') || commonCss.includes('--font-mono'), 'body 不再全站等宽');
  console.log('✓ 组件库分区 / 布局偏好 / 字体拆分 全部就位');
}

// 表单父子路径：另存前未落盘的子值必须能读出；删除方案必须整体替换。
{
  const { FormState } = await import('../ui/panels/settings/form-state.js');
  const { deepMerge } = await import('../src/kernel/config.js');
  const base = { ui: { uikit: { mode: 'dark', dark: { radius: 11 }, custom: { old: { name: 'old' } } } } };
  const form = new FormState(base);
  form.set('ui.uikit.dark.radius', 4);
  assert.equal(form.value('ui.uikit').dark.radius, 4, '父路径读取包含未保存的子字段');
  const next = form.value('ui.uikit');
  delete next.custom.old;
  form.set('ui.uikit', next, { replace: true });
  assert.equal(form.value('ui.uikit.dark.radius'), 4, '整体写入后子路径可读');
  form.set('ui.uikit.dark.radius', 6);
  const oldSnapshot = form.snapshot();
  assert.equal(oldSnapshot.patch.ui.uikit.__replace__.dark.radius, 6, '子字段合入整体替换');
  assert.equal(deepMerge(base, oldSnapshot.patch).ui.uikit.custom.old, undefined, '删除不被后端深合并复活');
  form.set('ui.uikit.dark.radius', 8);
  form.accept(oldSnapshot, deepMerge(base, oldSnapshot.patch));
  assert.equal(form.dirty, true, '旧保存响应不抹新输入');
  assert.equal(form.value('ui.uikit.dark.radius'), 8);
  const latest = form.snapshot();
  form.accept(latest, deepMerge(base, latest.patch));
  assert.equal(form.dirty, false);
  assert.equal(form.value('ui.uikit.dark.radius'), 8);
  console.log('✓ 表单父子路径/另存/整体删除/保存竞态');
}
console.log('\n✓ 68 主题引擎契约：全部通过');

// 64 · 社区精简后的声明、发布流程及设计系统契约。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPanelAdapters } from '../src/console/panel-adapters.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('ui/panels/manifest.json'));

console.log('=== A. 面板已注册且结构合规 ===');
{
  const panel = manifest.panels.find((p) => p.id === 'community');
  assert.ok(panel, 'community 面板已注册');
  assert.equal(panel.kind, 'bundled', '属捆绑面板（无需授权即可打开）');
  assert.ok(Array.isArray(panel.permissions) && panel.permissions.length === 0, '未申请额外权限');
  assert.ok(typeof panel.title === 'string' && panel.title.trim(), '有标题');
  // 复刻 panel-adapters.normalize 的校验，避免"注册了但被静默丢弃"
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const SAFE_PATH = /^\/api\/[A-Za-z0-9_/:-]+$/;
  const METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
  assert.ok(ID_RE.test(panel.id), 'id 合规（否则 normalize 返回 null，面板不出现）');
  const entry = panel.entry ?? 'index.html';
  assert.ok(entry.endsWith('.html'), 'entry 是 html');
  for (const rule of panel.api) {
    assert.ok(rule && typeof rule === 'object', 'api 规则必须是 {method,path} 对象（字符串数组会被 normalize 丢弃）');
    assert.ok(METHODS.has(rule.method), `api 方法合法：${rule.method} ${rule.path}`);
    assert.ok(SAFE_PATH.test(rule.path), `api 路径安全：${rule.path}`);
  }
  const actual = createPanelAdapters({ bundledManifest: { panels: [panel] } }).listPanels();
  assert.equal(actual.length, 1, '真实宿主规范化后仍保留社区面板');
  assert.deepEqual(actual[0].api, panel.api, '真实宿主保留全部精确方法/路径声明');
  console.log(`✓ 面板结构合规，${panel.api.length} 条 api 规则（对象格式，不会被 normalize 丢弃）`);
}

console.log('=== B. 后端存在对应端点（面板不是空壳）===');
{
  const routes = read('src/console/routes.js');
  for (const rule of manifest.panels.find((p) => p.id === 'community').api) {
    const pathLiteral = rule.path.replace(/:id/g, '');
    assert.ok(routes.includes(`'${pathLiteral}'`) || routes.includes(pathLiteral), `后端提供 ${rule.method} ${rule.path}`);
  }
  console.log('✓ 白名单里每条端点在 routes.js 中都有实现');
}

console.log('=== C. 只保留账号与发布，走面板 RPC ===');
{
  const js = read('ui/panels/community/panel.js');
  const html = read('ui/panels/community/index.html');
  // 发布
  assert.ok(js.includes('await authenticateMarket(payload)'), 'UI 登录/注册走宿主验证码流程');
  assert.ok(read('ui/panels/panel-client.js').includes("rpc('community.authenticateMarket'"), '登录使用限定的宿主 RPC');
  assert.ok(read('ui/shell/market-authentication.js').includes("api.request('POST','/api/market/login'"), '宿主验证后调用官方认证代理');
  assert.ok(js.includes('await publishMarket(body)'), 'UI 能请求宿主验证并发布扩展');
  assert.ok(read('ui/panels/panel-client.js').includes("rpc('community.publishMarket'"), '发布走专用面板 RPC');
  const publication = read('ui/shell/market-publication.js');
  assert.ok(publication.includes("api.request('POST','/api/market/publish'") && publication.includes('await verify({signal})'), '宿主验证后调用真实市场端点');
  assert.ok(js.includes("request('POST', '/api/market/logout'"), 'UI 能退出账号');
  assert.ok(js.includes("request('GET', '/api/market/accounts'"), 'UI 能列账号');
  assert.doesNotMatch(js+html,/口令安装|pane-install|pane-block|tab-block|codeInstaller|community\/blocklist/);
  const rules=manifest.panels.find(p=>p.id==='community').api;
  assert.ok(rules.every(rule=>!['/api/market/verify','/api/market/install','/api/community/blocklist'].includes(rule.path)));
  for(const name of ['code-install-state.js','code-install-view.js'])assert.equal(fs.existsSync(path.join(root,'ui/panels/community',name)),false);
  console.log('✓ 已移除口令安装、重复名单及其面板权限');
}

console.log('=== D. 安全：破坏性操作有确认，安装不自动启用 ===');
{
  const js = read('ui/panels/community/panel.js');
  // 发布/注册保留确认；退出/清空屏蔽改用明确影响说明与渐进确认。
  for (const [what, needle] of [
    ['注册社区账号', '注册社区账号'],
    ['发布扩展', '发布'],
    
  ]) {
    const idx = js.indexOf(needle);
    assert.ok(idx > 0, `存在「${what}」相关文案`);
  }
  assert.ok(js.includes('confirmAction'), '注册与公开发布仍使用确认对话框');
  assert.ok(js.includes('bindDestructiveAction'), '退出与清空使用统一渐进确认');
  assert.ok(js.includes('clicks: 2'), '退出所选账号保留渐进确认');
  assert.ok(js.includes('只发布你检查过的代码') || read('ui/panels/community/index.html').includes('不是代码沙箱'), '明确告知插件非沙箱');
  assert.ok(read('ui/panels/market-browser.js').includes('默认停用'), '目录安装仍提示默认停用');
  assert.ok(js.includes('请勿复用重要密码'), '注册时提示不要复用重要密码');
  console.log('✓ 破坏性操作有确认，且不静默启用/静默承诺');
}

console.log('=== E. UI 符合设计系统（不写死样式）===');
{
  const css = read('ui/panels/community/style.css');
  assert.ok(!/(^|[;{\s])body\s*\{/.test(css), '不覆盖 body');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), '无写死色值');
  assert.ok(!/^\s*--[a-z-]+\s*:/m.test(css), '不自造 CSS 变量');
  const html = read('ui/panels/community/index.html');
  assert.ok(html.includes('../common.css'), '引入设计系统');
  assert.ok(html.includes('href="style.css"'), '引入面板私有样式（与其它面板一致的相对路径）');
  assert.ok(html.includes('id="pane-account" aria-labelledby="account-heading"'), '唯一账号区默认显示并有可访问名称');
  console.log('✓ 社区面板完全走设计系统，无任何写死样式');
}

console.log('\n✓ 64 社区面板闭环契约：全部通过');

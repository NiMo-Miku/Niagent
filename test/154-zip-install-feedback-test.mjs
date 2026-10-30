// Executes the real shared manager and both real panel consumers in a small DOM
// harness. File selection/confirmation/HTTP are controlled peers; no GUI/account
// or extension entry executes here. Headed file-picker acceptance is separate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const at = process.argv.indexOf('--ui-root');
const sourceRoot = at < 0 ? path.resolve('ui/panels') : path.resolve(process.argv[at + 1]);
let passed = 0, failed = 0, moduleId = 0;
const check = (name, run) => { try { run(); passed++; console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); } };
const settle = async () => { for (let index = 0; index < 40; index++) await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,100)); };
const until = async condition => { for (let index = 0; index < 200 && !condition(); index++) await Promise.resolve(); assert.ok(condition(), 'controlled consumer phase must be observed'); };
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.events = new Map(); this.dataset = {}; this.value = ''; this.disabled = false; this.hidden = false; this.open = false; this.isConnected = true; this.attributes = {}; this.ownText = ''; }
  get textContent() { return this.ownText + this.children.map(item => typeof item === 'string' ? item : item.textContent).join(''); }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  append(...items) { for (const item of items) { if (typeof item !== 'string') {if(item.parent)item.parent.children=item.parent.children.filter(node=>node!==item);item.parent = this;item.isConnected=true;} this.children.push(item); } }
  get parentElement(){return this.parent;}
  before(node){this.parent?.insertBefore(node,this);}
  insertBefore(node,before){if(node.parent)node.parent.children=node.parent.children.filter(item=>item!==node);const index=this.children.indexOf(before);node.parent=this;node.isConnected=true;this.children.splice(index<0?this.children.length:index,0,node);}
  getBoundingClientRect(){return{top:0,bottom:0};}
  getClientRects(){return[];}
  replaceChildren(...items) { this.ownText = ''; this.children = []; this.append(...items); }
  addEventListener(name, fn) { const handlers = this.events.get(name) || []; handlers.push(fn); this.events.set(name, handlers); }
  removeEventListener(name, fn) { this.events.set(name, (this.events.get(name) || []).filter(item => item !== fn)); }
  async fire(name) { await Promise.all((this.events.get(name) || []).map(fn => fn({ target: this, preventDefault() {} }))); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  querySelectorAll(selector) { return descendants(this).filter(item => selector === 'details[data-extension-path]' ? item.tag === 'details' && item.dataset.extensionPath !== undefined : selector === '[data-capability]' ? item.dataset.capability !== undefined : selector.startsWith('.')?(item.className||'').split(/\s+/).includes(selector.slice(1)):item.tag===selector); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]||null; }
}
const descendants = node => node.children.flatMap(item => typeof item === 'string' ? [] : [item, ...descendants(item)]);
const oldDocument = globalThis.document, oldWindow = globalThis.window;
const loadSource = async (filename, fixture) => {
  globalThis.__zip154 = fixture;
  const source = fs.readFileSync(path.join(sourceRoot, filename), 'utf8').replace(/^import[^\n]+\n/gm, '');
  const symbols = filename === 'extension-manager.js'
    ? 'request,$,clear,row,button,destructiveButton,confirmAction,managePermissions,installDisposableDialog'
    : 'request,onShellEvent,onLeave,openCommunityPage,$,clear,text,error,capability,renderExtensions,installZip,bindZipInstaller,renderCleanup,renderCapabilityProviders,summarizeExtensions,bindAuthoringGuide';
  return import(`data:text/javascript;base64,${Buffer.from(`const {${symbols}}=globalThis.__zip154;\n${source}\n// qa154 module ${moduleId++}`).toString('base64')}`);
};
try {
  for (const kind of ['plugin', 'skill']) {
    const label = kind + ': ';
    const nodes = Object.fromEntries(['list', 'search', 'meta', 'capability-providers', 'reload', 'install', 'install-status', 'conflicts', 'open-skill-market', 'skill-market-status'].map(id => ['#' + id, new Element(id === 'search' ? 'input' : 'section')]));
    const body = new Element('body'); body.append(...Object.values(nodes));
    const control = { mode: 'failure', confirm: true, selected: null, holdPicker: false, pickers: [], holdPost: false, postsHeld: [], failNextList: false, lists: 0, posts: 0, confirmations: 0, items: [], shell: null };
    const file = { name: `qa154-${kind}.zip`, size: 4, async arrayBuffer() { if (control.mode === 'read-error') throw new Error('QA154_FILE_READ_FAILED'); return new Uint8Array([80, 75, 3, 4]).buffer; } };
    control.selected = file;
    const windowEvents = new Element('window');
    globalThis.window = windowEvents;
    globalThis.document = {
      body, querySelector: selector => nodes[selector], createTextNode: value => String(value),
      createElement(tag) {
        const node = new Element(tag);
        node.click = () => {
          control.pickers.push(node);
          if (!control.holdPicker) queueMicrotask(() => { node.files = control.selected ? [control.selected] : []; void node.fire('change'); });
        };
        return node;
      },
    };
    const fixture = {
      bindAuthoringGuide: ({kind: requested}) => { assert.equal(requested, kind, 'real consumer retains its authoring direction; 194 covers the dialog'); },
      $: selector => nodes[selector], clear: node => node.replaceChildren(), text: (node, value) => { node.textContent = value; },
      error: (node, value) => { node.replaceChildren(); const message = new Element('div'); message.className = 'error'; message.textContent = value; node.append(message); },
      row: (title, detail, actions) => { const node=new Element('article'),head=new Element('div'),name=new Element('strong'),sub=new Element('div'),controls=new Element('div');node.className='list-item';sub.className='muted';controls.className='actions';name.textContent=title;sub.textContent=detail;controls.append(...actions);head.append(name,sub,controls);node.append(head);return node; },
      button: (title, action) => { const node = new Element('button'); node.textContent = title; node.addEventListener('click', action); return node; },
      // Controlled activation peer for this feedback-only DOM harness. Real
      // decay, painting and browser activation are covered by 168/169.
      destructiveButton: (title, action, options) => { let count = 0; return fixture.button(title, async () => { if (++count < options.clicks) return; count = 0; await action(); }); },
      confirmAction: async () => { control.confirmations++; return control.confirm; }, managePermissions: async () => {}, installDisposableDialog() {}, openCommunityPage: async () => {},
      onShellEvent: listener => { control.shell = listener; },
      onLeave() {},
      capability: async (action, node) => { try { return await action(); } catch (error) { fixture.error(node, error.message); return null; } },
      request: async (method, endpoint, payload) => {
        if (method === 'GET' && endpoint === '/api/skills') { control.lists++; if (control.failNextList) { control.failNextList = false; throw new Error('QA154_LIST_REFRESH_FAILED'); } return { skills: control.items }; }
        if (endpoint === '/api/skills/capabilities') return { capabilities: [] };
        if (endpoint === '/api/tools/conflicts') return { conflicts: [] };
        if (endpoint === '/api/skills/reload') return { ok: true };
        if (endpoint.endsWith('/delete')) { control.items = []; return { ok: true }; }
        if (method === 'POST' && endpoint === '/api/skills/install') {
          control.posts++; assert.equal(payload.kind, kind); assert.deepEqual([...Buffer.from(payload.zipBase64, 'base64')], [80, 75, 3, 4]);
          if (control.holdPost) await new Promise(resolve => control.postsHeld.push(resolve));
          if (control.mode === 'failure') throw new Error(control.failureMessage ?? 'QA154_ALREADY_INSTALLED：该扩展已经存在');
          const skill = { id: `qa154-${kind}`, name: `QA154 ${kind}`, kind, loaded: false, enabled: false, available: false, code: 'disabled', root: kind + 's', dir: 'C:/QA154/own-extension', configSchema: {} };
          control.items = [skill];
          if (control.mode === 'refresh-failure') control.failNextList = true;
          return { ok: true, installed: skill.id, root: kind, enabled: false, skill };
        }
        throw new Error(`Unexpected QA154 peer request ${method} ${endpoint}`);
      },
    };
    const manager = await loadSource('extension-manager.js', fixture); Object.assign(fixture, manager);
    await loadSource(`${kind === 'plugin' ? 'plugins' : 'skills'}/panel.js`, fixture); await settle();
    const install = nodes['#install'], status = nodes['#install-status'], list = nodes['#list'];
    const html = fs.readFileSync(path.join(sourceRoot, `${kind === 'plugin' ? 'plugins' : 'skills'}/index.html`), 'utf8');
    check(label + 'separate accessible live feedback markup', () => assert.match(html, /id="install-status"[^>]*role="status"[^>]*aria-live="polite"/));
    check(label + 'installation feedback is outside list', () => assert.ok(html.indexOf('id="install-status"') >= 0 && html.indexOf('id="install-status"') < html.indexOf('id="list"')));
    await install.fire('click'); await settle();
    check(label + 'actual failed consumer exposes reason initially', () => assert.match(status.textContent + list.textContent, /QA154_ALREADY_INSTALLED/));
    for (const event of ['status', 'plugin-loaded', 'plugin-unloaded', 'plugin-error']) {
      const prior = control.lists; control.shell(event); await settle();
      check(label + event + ' refresh actually ran', () => assert.ok(control.lists > prior));
      check(label + event + ' refresh preserves failure', () => assert.match(status.textContent, /QA154_ALREADY_INSTALLED/));
    }
    nodes['#search'].value = 'QA154-NO-MATCH'; await nodes['#search'].fire('input');
    check(label + 'filter render preserves failure', () => assert.match(status.textContent, /QA154_ALREADY_INSTALLED/));
    await nodes['#reload'].fire('click'); await settle();
    check(label + 'rescan preserves failure', () => assert.match(status.textContent, /QA154_ALREADY_INSTALLED/));
    nodes['#search'].value = ''; await nodes['#search'].fire('input');

    // Backend ZIP rejection already carries this prefix. Exercise both real
    // consumers so presentation adds it once without losing the actual reason.
    for (const [name, message, expected] of [
      ['backend Chinese prefix', '安装失败：安装包含不安全路径', '安装失败：安装包含不安全路径'],
      ['repeated Chinese prefix', '安装失败：安装失败：安装包含不安全路径', '安装失败：安装包含不安全路径'],
      ['ASCII colon and prefix whitespace', '安装失败 : 安装失败： 安装包含不安全路径', '安装失败：安装包含不安全路径'],
      ['plain rejection detail', '安装包含不安全路径', '安装失败：安装包含不安全路径'],
      ['prefix words inside actual detail', '校验已终止：请检查“安装失败：”对应日志', '安装失败：校验已终止：请检查“安装失败：”对应日志'],
      ['prefix with no actual detail', '安装失败：', '安装失败：请检查安装包后重试。'],
      ['prefixed reason keeps credential redaction', '安装失败：安装包含不安全路径 token=QA154_SECRET_TOKEN', '安装失败：安装包含不安全路径 token=[已隐藏]'],
    ]) {
      control.failureMessage = message;
      await install.fire('click'); await settle();
      check(label + name + ' keeps one leading failure label and original safe detail', () => {
        assert.equal(status.textContent, expected);
        assert.equal(status.className, 'error');
        assert.equal(status.hidden, false);
        assert.equal(install.disabled, false);
      });
    }
    control.failureMessage = undefined;

    control.mode = 'success'; control.holdPicker = true;
    const pickerBefore = control.pickers.length, postsBefore = control.posts;
    const first = install.fire('click'); await settle();
    check(label + 'new attempt clears old feedback', () => assert.equal(status.textContent, ''));
    check(label + 'busy starts while file picker is pending', () => assert.equal(install.disabled, true));
    const duplicate = install.fire('click'); await settle();
    check(label + 'busy rejects duplicate picker entry', () => assert.equal(control.pickers.length - pickerBefore, 1));
    for (const input of control.pickers.slice(pickerBefore)) { input.files = []; await input.fire('cancel'); }
    await Promise.all([first, duplicate]); await settle(); control.holdPicker = false;
    check(label + 'picker cancel is no false success', () => { assert.equal(status.textContent, ''); assert.equal(control.posts, postsBefore); });
    check(label + 'picker cancel restores button', () => assert.equal(install.disabled, false));

    control.confirm = false; const beforeCancel = control.posts;
    await install.fire('click'); await settle();
    check(label + 'confirmation cancel is no false success', () => { assert.equal(status.textContent, ''); assert.equal(control.posts, beforeCancel); });
    check(label + 'confirmation cancel restores button', () => assert.equal(install.disabled, false));
    control.confirm = true; control.mode = 'read-error'; const beforeRead = control.posts;
    await install.fire('click'); await settle();
    check(label + 'read failure visible without POST', () => { assert.match(status.textContent, /QA154_FILE_READ_FAILED/); assert.equal(control.posts, beforeRead); });
    check(label + 'read failure restores button', () => assert.equal(install.disabled, false));

    control.mode = 'success'; control.holdPost = true; const beforeHeld = control.posts;
    const waiting = install.fire('click'); await until(() => control.postsHeld.length > 0);
    check(label + 'busy continues through held POST', () => assert.equal(install.disabled, true));
    const second = install.fire('click'); await settle();
    check(label + 'duplicate held submission cannot POST', () => assert.equal(control.posts - beforeHeld, 1));
    control.postsHeld.splice(0).forEach(resolve => resolve()); control.holdPost = false;
    await Promise.all([waiting, second]); await settle(); control.selected = file;
    check(label + 'successful result names actual installed extension', () => assert.match(status.textContent, new RegExp(`QA154 ${kind}`)));
    check(label + 'successful install explicitly remains disabled', () => assert.match(status.textContent, /默认停用，未执行代码/));
    check(label + 'success restores install button', () => assert.equal(install.disabled, false));
    const success = status.textContent;
    control.shell('status'); await settle(); nodes['#search'].value = 'QA154'; await nodes['#search'].fire('input'); await nodes['#reload'].fire('click'); await settle();
    check(label + 'status/filter/rescan preserve success', () => assert.equal(status.textContent, success));
    const uninstall = descendants(list).find(item => item.tag === 'button' && item.textContent === '卸载');
    assert.ok(uninstall, 'the actual shared renderer exposes own fixture uninstall');
    for (let click = 0; click < 4; click++) await uninstall.fire('click'); await settle();
    check(label + 'uninstall/list refresh preserves installation outcome', () => assert.equal(status.textContent, success));

    control.mode = 'refresh-failure'; await install.fire('click'); await settle();
    check(label + 'real consumer swallowed list error remains installed', () => { assert.match(status.textContent, /已安装.*默认停用/); assert.match(status.textContent, /列表刷新失败/); assert.ok(!status.textContent.includes('安装失败：')); });
    check(label + 'refresh failure restores button', () => assert.equal(install.disabled, false));
    const partial = status.textContent; control.shell('plugin-loaded'); await settle();
    check(label + 'later recovery does not erase previous install outcome', () => assert.equal(status.textContent, partial));
    control.selected = null;
    check(label + 'no accumulated file picker nodes', () => assert.equal(body.children.filter(item => item.tag === 'input' && item.type === 'file').length, 0));
    const directCancelled = await manager.installZip(kind);
    check(label + 'direct install contract returns null on picker cancel', () => assert.equal(directCancelled, null));
    control.selected = file; control.mode = 'success';
    const directResult = await manager.installZip(kind, async () => {});
    check(label + 'direct install returns actual successful DTO', () => { assert.equal(directResult?.installed, `qa154-${kind}`); assert.equal(directResult?.enabled, false); });
  }
} finally { globalThis.document = oldDocument; globalThis.window = oldWindow; delete globalThis.__zip154; }
console.log(JSON.stringify({ test: '154-zip-install-feedback', passed, failed, productionConsumers: ['plugins', 'skills'], nativeGuiOperated: false, realAccountUsed: false }));
if (failed) process.exitCode = 1;

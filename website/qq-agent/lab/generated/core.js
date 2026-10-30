/* ==========================================================================
   QQ AGENT / DOSSIER 2026 — core
   数据、导航、页脚、转场、光标、文本揭示、计数、磁吸
   ========================================================================== */
(function () {
  'use strict';

  var SELF = document.currentScript && document.currentScript.src || '';
  var BASE = location.origin + '/qq-agent/';
  var PAGE = document.body.dataset.page || 'home';
  var FILE = location.protocol === 'file:';
  var SNAP = window.__QA_SNAP__ || {};
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || Boolean(window.__LAB_MOTION_OFF__);
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  var API = {
    '/api/community/plugins': 'plugins',
    '/api/community/skills': 'skills',
    '/api/community/personas': 'personas',
    '/data/market-tags.json': 'tags',
    '/qq-agent/comment/comments.json': 'comments',
    '/qq-agent/comment/likes.json': 'commentLikes',
    '/qq-agent/holyshits/holyshits.json': 'holyshits',
    '/qq-agent/holyshits/likes.json': 'holyshitsLikes',
    '/qq-agent/api/telemetry/summary': 'telemetry'
  };
  var URLS = {};
  Object.keys(API).forEach(function (u) { URLS[API[u]] = u; });

  /* ── 小工具 ─────────────────────────────────────────────────────── */
  function qs(s, r) { return (r || document).querySelector(s); }
  function qsa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  function compact(n) {
    n = Number(n || 0);
    if (n >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, '') + ' 亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + ' 万';
    return fmt(n);
  }
  function dt(ts) {
    var d = new Date(ts);
    if (isNaN(d)) return '';
    var p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
  }
  function ago(ts) {
    var t = typeof ts === 'number' ? ts : Date.parse(ts);
    if (!t) return '';
    var s = (Date.now() - t) / 1000;
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    if (s < 86400 * 30) return Math.floor(s / 86400) + ' 天前';
    return dt(t);
  }
  function attr(s) { return esc(s).replace(/\n/g, ' '); }

  /* ── 数据 ───────────────────────────────────────────────────────── */
  function load(key) {
    if (key === 'thanks') {
      // data/thanks.js 只被 thanks.html 引入；SPA 从别的页面切过来时它并不存在，
      // 所以这里直接 fetch 同目录的 thanks.json，任何入口都能拿到。
      if (window.__QA_THANKS__) return Promise.resolve(window.__QA_THANKS__);
      return window.fetch(BASE + 'data/thanks.json', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(function () {
          if (window.__QA_THANKS__) return window.__QA_THANKS__;
          if (SNAP && SNAP.thanks) return SNAP.thanks;
          throw new Error('致谢名单加载失败');
        });
    }
    if (FILE) {
      return SNAP[key] !== undefined
        ? Promise.resolve(SNAP[key])
        : Promise.reject(new Error('离线快照缺少 ' + key));
    }
    var url = URLS[key];
    // 'no-cache'：每次都向服务器校验，但内容没变时走 ETag 拿 304 空响应。
    // 不能用 'no-store'——那会完全禁用缓存，ETag 永远协商不上，等于全量重传。
    return window.fetch(url, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function () {
        if (SNAP[key] !== undefined) return SNAP[key];
        throw new Error('加载失败：' + key);
      });
  }

  /* ── Toast ─────────────────────────────────────────────────────── */
  var toastEl = null, toastT = 0;
  function toast(msg) {
    if (!toastEl) toastEl = qs('#toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 3200);
  }

  /* ── 路由：路径 ↔ 页面 key ─────────────────────────────────────── */
  var PAGE_NAME = {
    home: '首页', comments: '意见墙', holyshits: '雷霆语录',
    skill: 'Skill 市场', plugin: '插件市场', personas: '人设广场',
    thanks: '致谢', admin: '内容管理', profile: '我的'
  };
  var PAGE_ORDER = ['home', 'comments', 'holyshits', 'skill', 'plugin', 'personas', 'profile', 'thanks', 'admin'];

  var ROUTES = {
    '': 'home', 'index.html': 'home',
    'thanks.html': 'thanks', 'lab': 'home',
    'comments': 'comments',
    'holyshits': 'holyshits',
    'persona-plaza': 'personas',
    'skill-market': 'skill',
    'plugin-market': 'plugin',
    'admin': 'admin',
    'u': 'profile'
  };

  function keyFromUrl(url) {
    var abs, base = BASE;
    try { abs = new URL(url, location.href).href; } catch (e) { return null; }
    if (abs.indexOf(base) !== 0) {
      // 中文目录下 BASE 与新 URL 的编码可能不一致，解码后再比一次
      try {
        var a2 = decodeURI(abs), b2 = decodeURI(base);
        if (a2.indexOf(b2) !== 0) return null;
        abs = a2; base = b2;
      } catch (e2) { return null; }
    }
    var rel = abs.slice(base.length).replace(/^\/+/, '');
    if (!rel) return 'home';
    if (/^(skill-market|plugin-market)\/admin(?:\/|$)/.test(rel)) return null;
    var seg = rel.split('/')[0];
    if (seg === 'index.html' || seg === '') return 'home';
    return ROUTES[seg] || null;
  }

  /* ── 同文档切页：清干净上一页，再挂新的 ───────────────────────── */
  var rendering = false;

  var pageDisposers = [], pageEpoch = 0;
  function onDispose(fn) { pageDisposers.push(fn); return fn; }
  function listen(target, name, fn, options) {
    target.addEventListener(name, fn, options);
    onDispose(function () { target.removeEventListener(name, fn, options); });
  }
  function clearPage() {
    if (Q3.__closeDrawer) Q3.__closeDrawer(true);
    pageDisposers.splice(0).forEach(function (fn) { try { fn(); } catch (e) { console.error('[dispose]', e); } });
  }


  function renderPage(key, opt) {
    opt = opt || {};
    key = key || 'home';
    var map = window.__Q3_PAGES__ || {};
    var fn = map[key] || map.home;
    if (!fn) return Promise.resolve();

    clearPage();
    var epoch = ++pageEpoch;
    PAGE = key;
    document.body.dataset.page = key;

    // 停掉 3D，清掉所有滚动触发器与旧的进度条
    if (window.__HERO3D__ && window.__HERO3D__.dispose) window.__HERO3D__.dispose();
    if (window.ScrollTrigger) ScrollTrigger.getAll().forEach(function (t) {
      if (!window.__LAB_BG_TRIGGERS__ || !window.__LAB_BG_TRIGGERS__.has(t)) t.kill();
    });
    var oldProg = qs('.nav-prog');
    if (oldProg) oldProg.remove();

    var view = qs('#view');
    view.innerHTML = '';
    if (!opt.keepScroll) window.scrollTo(0, 0);

    var out;
    try {
      if (key === 'home') {
        var mountOwner = gsap.context(function () {}, view);
        onDispose(function () { mountOwner.revert(); });
        mountOwner.add(function () { out = fn(); });
      } else out = fn();
    } catch (e) { console.error('[render]', e); out = null; }

    return Promise.resolve(out).then(function () {
      if (epoch !== pageEpoch) return;
      if (key !== 'home') revealAll();
      totop();
      if (key !== 'home') velocitySkew('.hero-title, .sec-head h2, .step-left .big, .cta h2, .phead h1, .h2', 2);
      if (window.__HERO3D__ && key === 'home' && !lowPerf()) window.__HERO3D__.init();
      if (window.ScrollTrigger) ScrollTrigger.refresh();
      if (localNavigation.layer) qsa('.phead h1').forEach(function (heading) { heading.__an = 1; });
      document.dispatchEvent(new Event('q3:page'));
    }).catch(function (e) { console.error('[render:after]', e); });
  }

  /* ── 本地切页：标题与正文的空间接力 ─────────────────────── */

  // LOCAL_SPATIAL_NAVIGATION_V3
  var localNavigationCSS = "/* Local SPA transition: transparent portals establish depth while real content\n   performs the handoff. GSAP owns transforms and opacity; no opaque cover. */\n.local-navigation-stage {\n  --navigation-ink: #3c3a53;\n  --navigation-muted: #77758e;\n  --navigation-outline: rgba(85,78,126,.38);\n  --navigation-rule: rgba(98,88,144,.13);\n  --navigation-edge: rgba(255,255,255,.72);\n  --navigation-violet: 108,92,231;\n  --navigation-blue: 74,158,255;\n  --navigation-mint: 0,194,168;\n  position: fixed;\n  inset: 0;\n  z-index: 9950;\n  overflow: hidden;\n  overflow: clip;\n  visibility: hidden;\n  perspective: 1400px;\n  perspective-origin: 50% 42%;\n  isolation: isolate;\n  contain: layout paint;\n  pointer-events: none;\n  user-select: none;\n  -webkit-user-select: none;\n}\nbody.local-navigating .local-navigation-stage { visibility: visible; }\n/* Crop projected content at the viewport without creating a scroll container\n   or a containing block around the fixed canvas. */\nbody.local-navigating #view,\nbody.local-navigating #foot { overflow-x: clip; }\n.local-navigation-stage *,\n.local-navigation-stage *::before,\n.local-navigation-stage *::after { pointer-events: none; }\n\n/* The centre of every plane stays clear. Colour lives at its narrow perimeter. */\n.local-navigation-stage > .navigation-pane--one,\n.local-navigation-stage > .navigation-pane--two,\n.local-navigation-stage > .navigation-pane--three {\n  --navigation-tone: var(--navigation-violet);\n  position: absolute;\n  z-index: 1;\n  inset-block: 0;\n  width: calc(100% / 3 + 1px);\n  overflow: hidden;\n  transform: translate3d(0,105%,0);\n  background: linear-gradient(90deg,rgba(var(--navigation-tone),.025),transparent 14%,transparent 86%,rgba(var(--navigation-tone),.045));\n  box-shadow: inset 1px 0 0 var(--navigation-edge);\n}\nbody.local-navigating .local-navigation-stage > .navigation-pane--one,\nbody.local-navigating .local-navigation-stage > .navigation-pane--two,\nbody.local-navigating .local-navigation-stage > .navigation-pane--three { will-change: transform,opacity; }\n.local-navigation-stage > .navigation-pane--one { left: 0; }\n.local-navigation-stage > .navigation-pane--two { --navigation-tone: var(--navigation-blue); left: calc(100% / 3); }\n.local-navigation-stage > .navigation-pane--three { --navigation-tone: var(--navigation-mint); left: calc(100% * 2 / 3); }\n\n.navigation-pane__edge {\n  position: absolute;\n  inset: 0 0 0 auto;\n  width: 1px;\n  background: linear-gradient(180deg,transparent 7%,rgba(var(--navigation-tone),.34) 27%,rgba(var(--navigation-tone),.18) 70%,transparent 93%);\n}\n.navigation-pane__edge::before {\n  content: '';\n  position: absolute;\n  inset: 12% 1px 12% auto;\n  width: 7px;\n  background: linear-gradient(90deg,transparent,rgba(var(--navigation-tone),.07));\n}\n.navigation-pane__edge::after {\n  content: '';\n  position: absolute;\n  top: 42%;\n  right: 0;\n  width: 18px;\n  height: 1px;\n  background: rgba(var(--navigation-tone),.29);\n}\n\n/* Two open beams form a portal rather than a filled slab. */\n.navigation-pane__grain {\n  position: absolute;\n  inset: 13% 0 14%;\n  opacity: .6;\n  border-block: 1px solid rgba(var(--navigation-tone),.16);\n}\n.navigation-pane__grain::before,\n.navigation-pane__grain::after {\n  content: '';\n  position: absolute;\n  top: -3px;\n  width: 1px;\n  height: 7px;\n  background: rgba(var(--navigation-tone),.24);\n}\n.navigation-pane__grain::before { left: 12%; }\n.navigation-pane__grain::after { right: 12%; }\n\n/* A horizon and two finite 1px rays locate the shared vanishing point.\n   No canvas, filter, mask or repeating screen-sized grid. */\n.navigation-stage__vanishing {\n  position: absolute;\n  z-index: 0;\n  top: 42%;\n  left: 6%;\n  right: 6%;\n  height: 1px;\n  opacity: .6;\n  transform-origin: 50% 50%;\n  background: linear-gradient(90deg,transparent,rgba(var(--navigation-violet),.17) 22%,rgba(var(--navigation-blue),.2) 50%,rgba(var(--navigation-mint),.17) 78%,transparent);\n}\n.navigation-stage__vanishing::before,\n.navigation-stage__vanishing::after {\n  content: '';\n  position: absolute;\n  top: 0;\n  left: 50%;\n  width: 68vmax;\n  height: 1px;\n  transform-origin: 0 50%;\n}\n.navigation-stage__vanishing::before {\n  transform: rotate(34deg);\n  background: linear-gradient(90deg,transparent 3%,rgba(var(--navigation-mint),.17) 32%,transparent 94%);\n}\n.navigation-stage__vanishing::after {\n  transform: rotate(146deg);\n  background: linear-gradient(90deg,transparent 3%,rgba(var(--navigation-violet),.17) 32%,transparent 94%);\n}\n\n/* Metadata stays below the moving page title. */\n.navigation-stage__caption {\n  position: absolute;\n  z-index: 2;\n  left: max(env(safe-area-inset-left),5.6vw);\n  right: max(env(safe-area-inset-right),5.6vw);\n  bottom: max(env(safe-area-inset-bottom),8.5%);\n  display: grid;\n  grid-template-columns: auto 1fr auto;\n  align-items: center;\n  gap: 12px 22px;\n  color: var(--navigation-ink);\n}\n.navigation-stage__caption > small {\n  grid-area: 1 / 1;\n  font: 9px/1.5 var(--ff-m,ui-monospace,monospace);\n  letter-spacing: .13em;\n  color: var(--navigation-muted);\n}\n.navigation-stage__caption > b {\n  grid-area: 1 / 3;\n  font: 500 12px/1.5 var(--font-d,sans-serif);\n  letter-spacing: .08em;\n}\n.navigation-stage__caption > span {\n  grid-area: 1 / 2;\n  min-width: 0;\n  color: transparent;\n  -webkit-text-stroke: .7px var(--navigation-outline);\n  font: 500 clamp(21px,2.7vw,42px)/1 var(--font-d,sans-serif);\n  letter-spacing: -.035em;\n  white-space: nowrap;\n  text-transform: uppercase;\n}\n.navigation-stage__line {\n  position: absolute;\n  left: max(env(safe-area-inset-left),5.6vw);\n  right: max(env(safe-area-inset-right),5.6vw);\n  bottom: max(env(safe-area-inset-bottom),6%);\n  height: 1px;\n  opacity: .65;\n  background: linear-gradient(90deg,rgba(var(--navigation-violet),.22),rgba(var(--navigation-blue),.16) 50%,rgba(var(--navigation-mint),.2));\n  transform-origin: 0 50%;\n}\n.navigation-stage__line::before,\n.navigation-stage__line::after {\n  content: '';\n  position: absolute;\n  top: -3px;\n  width: 1px;\n  height: 7px;\n  background: var(--navigation-rule);\n}\n.navigation-stage__line::before { left: 0; }\n.navigation-stage__line::after { right: 0; }\n.local-navigation-stage[data-direction=\"back\"] .navigation-stage__line { transform-origin: 100% 50%; }\n.local-navigation-stage[data-direction=\"back\"] .navigation-pane__edge::after { top: 58%; }\n\n/* Only small details respond to phase; the controller can interpolate opacity. */\n.local-navigation-stage[data-phase=\"hold\"] .navigation-pane__grain { opacity: .8; }\n.local-navigation-stage[data-phase=\"reveal\"] .navigation-pane__grain { opacity: .38; }\n\n/* Preserve the music panel's independent transform and visibility. */\nbody.local-navigating #nav,\nbody.local-navigating .qmusic { z-index: 10020; }\n\nhtml[data-theme=\"dark\"] .local-navigation-stage {\n  --navigation-ink: #e0e3f4;\n  --navigation-muted: #a0a3be;\n  --navigation-outline: rgba(199,203,240,.43);\n  --navigation-rule: rgba(189,192,232,.16);\n  --navigation-edge: rgba(219,224,255,.12);\n  --navigation-violet: 139,124,246;\n  --navigation-blue: 102,170,255;\n  --navigation-mint: 53,206,186;\n}\n@media (max-width: 760px) {\n  .local-navigation-stage { perspective: 1000px; }\n  .navigation-pane__edge::before { width: 4px; }\n  .navigation-pane__edge::after { width: 12px; }\n  .navigation-pane__grain { inset-block: 15% 17%; opacity: .46; }\n  .navigation-stage__vanishing { opacity: .42; }\n  .navigation-stage__vanishing::before { transform: rotate(58deg); }\n  .navigation-stage__vanishing::after { transform: rotate(122deg); }\n  .navigation-stage__caption {\n    left: max(env(safe-area-inset-left),6vw);\n    right: max(env(safe-area-inset-right),6vw);\n    bottom: max(env(safe-area-inset-bottom),9%);\n    grid-template-columns: 1fr auto;\n    gap: 10px 12px;\n  }\n  .navigation-stage__caption > small { grid-area: 1 / 1; font-size: 8px; letter-spacing: .09em; }\n  .navigation-stage__caption > b { grid-area: 1 / 2; font-size: 11px; }\n  .navigation-stage__caption > span { grid-area: 2 / 1 / auto / -1; font-size: 24px; }\n}\n@media (max-height: 500px) {\n  .navigation-stage__caption { bottom: max(env(safe-area-inset-bottom),8%); gap: 8px 16px; }\n  .navigation-stage__caption > span { font-size: 22px; }\n  .navigation-stage__line { bottom: max(env(safe-area-inset-bottom),5%); }\n}\n@media (prefers-reduced-motion: reduce) {\n  .local-navigation-stage { display: none; }\n}\n@media (forced-colors: active) {\n  .local-navigation-stage { display: none; }\n}\n";
  var localNavigation = {
    epoch: 0, revision: 0, running: false, pending: null, layer: null,
    motion: null, phase: 'idle', covered: false, method: null,
    renderBarrier: Promise.resolve(), rendering: 0, suspended: false,
    recoverOnShow: false, coverEntry: null, content: [], direction: 1, footerOpacity: null
  };
  var localRouteLabels = {
    home: 'QQ AGENT', comments: 'COMMENTS', holyshits: 'QUOTES', skill: 'SKILLS',
    plugin: 'PLUGINS', personas: 'PERSONAS', thanks: 'THANKS', admin: 'CONSOLE', profile: 'PROFILE'
  };
  function localNavigationStyle() {
    if (qs('#local-navigation-style')) return;
    var style = document.createElement('style');
    style.id = 'local-navigation-style';
    style.textContent = localNavigationCSS;
    document.head.appendChild(style);
  }
  function localNavigationHideLegacy() {
    qsa('.wipe, .wipe-label').forEach(function (element) {
      gsap.killTweensOf(element);
      element.style.display = 'none';
      element.__busy = false;
    });
  }
  function localNavigationShowContent() {
    var view = qs('#view');
    if (!view) return;
    gsap.killTweensOf(view);
    ['opacity', 'visibility', 'transform', 'filter'].forEach(function (property) { view.style.removeProperty(property); });
    view.removeAttribute('aria-busy');
  }
  function localNavigationRestoreFooter() {
    var saved = localNavigation.footerOpacity, footer = qs('#foot');
    if (!saved || !footer) return;
    if (saved.value) footer.style.setProperty('opacity', saved.value, saved.priority);
    else footer.style.removeProperty('opacity');
    if (!saved.hadStyle && !footer.style.cssText) footer.removeAttribute('style');
  }
  function localNavigationRestoreContent() {
    localNavigation.content.forEach(function (entry) {
      gsap.killTweensOf(entry.target);
      if (entry.wrapper) {
        if (entry.wrapper.parentNode) {
          entry.wrapper.before(entry.element);
          entry.wrapper.remove();
        }
        ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'].forEach(function (name, index) {
          var saved = entry.margins[index];
          if (saved.value) entry.element.style.setProperty(name, saved.value, saved.priority);
          else entry.element.style.removeProperty(name);
        });
        if (entry.shrink) {
          if (entry.shrink.value) entry.element.style.setProperty('flex-shrink', entry.shrink.value, entry.shrink.priority);
          else entry.element.style.removeProperty('flex-shrink');
        }
        if (entry.style === null && !entry.element.style.cssText) entry.element.removeAttribute('style');
      } else {
        if (entry.style === null) entry.element.removeAttribute('style');
        else entry.element.setAttribute('style', entry.style);
        if (entry.element._gsap) entry.element._gsap.uncache = 1;
        entry.element.removeAttribute('data-navigation-role');
      }
    });
    localNavigation.content = [];
  }
  function localNavigationFinishEntrances() {
    // The route choreography owns the first viewport during a handoff. Finish
    // the original finite intro before measuring, retaining its scroll scenes.
    var elements = qsa('.hero-title, .hero-title *, .hero-eyebrow, .hero-sub, .hero-scale, .spec-row', qs('#view'));
    gsap.getTweensOf(elements).forEach(function (tween) {
      if (!tween.scrollTrigger && tween.repeat() === 0 &&
        (tween.vars.opacity != null || tween.vars.clipPath != null || tween.vars.runBackwards)) {
        tween.progress(1).kill();
      }
    });
  }
  function localNavigationCollectContent(incoming) {
    if (localNavigation.content.length) return localNavigation.content;
    if (incoming) localNavigationFinishEntrances();
    var entries = [], selected = [], view = qs('#view');
    var navBottom = Math.max(72, qs('#nav').getBoundingClientRect().bottom);
    function add(element, role, wrap) {
      if (!element || selected.some(function (parent) { return parent === element || parent.contains(element) || element.contains(parent); })) return;
      var rect = element.getBoundingClientRect();
      if (rect.bottom < navBottom || rect.top > innerHeight || rect.width < 1 || rect.height < 1) return;
      var entry = { element: element, target: element, role: role, style: element.getAttribute('style') };
      if (wrap) {
        var computed = getComputedStyle(element), wrapper = document.createElement('div');
        wrapper.className = 'navigation-content-frame';
        wrapper.dataset.navigationRole = role;
        // Carry the item's layout role, moving only its margins to the wrapper.
        wrapper.style.cssText = 'display:flow-root;position:relative;box-sizing:border-box;max-width:100%;';
        if (computed.display.indexOf('inline') === 0) {
          wrapper.style.display = 'inline-flex';
          entry.shrink = { value: element.style.getPropertyValue('flex-shrink'), priority: element.style.getPropertyPriority('flex-shrink') };
        }
        wrapper.style.verticalAlign = computed.verticalAlign;
        var width = parseFloat(computed.width);
        if (computed.boxSizing !== 'border-box') ['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'].forEach(function (name) { width += parseFloat(computed[name]) || 0; });
        wrapper.style.width = (Number.isFinite(width) ? width : element.offsetWidth) + 'px';
        ['marginTop','marginRight','marginBottom','marginLeft','gridArea','alignSelf','justifySelf','order','flex'].forEach(function (name) {
          wrapper.style[name] = computed[name];
        });
        entry.margins = ['margin-top','margin-right','margin-bottom','margin-left'].map(function (name) {
          return { value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) };
        });
        element.before(wrapper); wrapper.appendChild(element);
        element.style.setProperty('margin', '0');
        if (entry.shrink) element.style.flexShrink = '0';
        entry.wrapper = wrapper; entry.target = wrapper;
      } else element.dataset.navigationRole = role;
      entry.target.style.willChange = 'transform,opacity';
      gsap.set(entry.target, { transformPerspective: innerWidth < 760 ? 1050 : 1500, transformOrigin: '50% 42%' });
      entries.push(entry); selected.push(element);
    }
    qsa('.hero-title > .lw', view).forEach(function (element) { add(element, 'title', false); });
    qsa('.phead h1, .sec-head h2, .step-left .big, .cta h2', view).slice(0, 12).forEach(function (element) { add(element, 'title', true); });
    qsa('.hero-eyebrow, .phead .kicker', view).forEach(function (element) { add(element, 'meta', true); });
    qsa('.hero-sub, .hero-spec, .phead .sub', view).forEach(function (element) { add(element, 'body', true); });
    qsa('#view > .shell > *').forEach(function (element) { if (entries.length < 10) add(element, 'body', false); });
    qsa('.stat-cell, .toolwrap, .ben, [data-step], .why-item, .cta-side', view).forEach(function (element) {
      if (entries.length < 10) add(element, 'body', true);
    });
    qsa('#foot .foot-word, #foot .foot-col, #foot .foot-base').forEach(function (element) { if (entries.length < 12) add(element, 'body', false); });
    localNavigation.content = entries;
    return entries;
  }
  function localNavigationCancelMotion() {
    var motion = localNavigation.motion;
    if (!motion) return;
    localNavigation.motion = null;
    motion.timeline.kill();
    motion.resolve(false);
  }
  function localNavigationReset() {
    localNavigation.epoch++;
    localNavigation.pending = null;
    localNavigationCancelMotion();
    localNavigationRestoreContent();
    localNavigationRestoreFooter();
    localNavigation.footerOpacity = null;
    if (localNavigation.layer) localNavigation.layer.remove();
    localNavigation.layer = null;
    localNavigation.running = false;
    localNavigation.phase = 'idle';
    localNavigation.covered = false;
    localNavigation.coverEntry = null;
    window.__Q3_BUSY__ = false;
    document.body.classList.remove('local-navigating');
    localNavigationHideLegacy();
    localNavigationShowContent();
    // Keep renderBarrier: pagehide cannot cancel a render that already started.
  }
  function localNavigationPhase(phase) {
    localNavigation.phase = phase;
    if (localNavigation.layer) localNavigation.layer.dataset.phase = phase;
  }
  function localNavigationAnimate(epoch, build) {
    if (epoch !== localNavigation.epoch) return Promise.resolve(false);
    localNavigationCancelMotion();
    return new Promise(function (resolve) {
      var motion = { timeline: null, resolve: resolve };
      var timeline = motion.timeline = gsap.timeline({
        paused: true,
        onComplete: function () {
          if (localNavigation.motion === motion) localNavigation.motion = null;
          resolve(epoch === localNavigation.epoch);
        }
      });
      localNavigation.motion = motion;
      build(timeline);
      timeline.play(0);
    });
  }
  function localNavigationStage(direction) {
    localNavigationStyle();
    var footer = qs('#foot');
    localNavigation.footerOpacity = footer ? { value: footer.style.getPropertyValue('opacity'), priority: footer.style.getPropertyPriority('opacity'), hadStyle: footer.hasAttribute('style') } : null;
    var layer = document.createElement('div');
    layer.className = 'local-navigation-stage';
    layer.setAttribute('aria-hidden', 'true');
    layer.dataset.direction = direction;
    layer.dataset.phase = 'cover';
    layer.innerHTML =
      '<div class="navigation-pane--one"><i class="navigation-pane__edge"></i><i class="navigation-pane__grain"></i></div>' +
      '<div class="navigation-pane--two"><i class="navigation-pane__edge"></i><i class="navigation-pane__grain"></i></div>' +
      '<div class="navigation-pane--three"><i class="navigation-pane__edge"></i><i class="navigation-pane__grain"></i></div>' +
      '<div class="navigation-stage__vanishing"></div>' +
      '<div class="navigation-stage__caption"><small></small><b></b><span></span></div>' +
      '<div class="navigation-stage__line"></div>';
    document.body.appendChild(layer);
    localNavigation.layer = layer;
    gsap.set(layer.querySelectorAll('[class^="navigation-pane--"]'), {
      x: 0, y: 0, z: -650, yPercent: 0, opacity: 0,
      xPercent: 0, scaleX: 1, scaleY: 1, scale: .82, transformOrigin: '50% 42%'
    });
    gsap.set(layer.querySelector('.navigation-stage__vanishing'), { opacity: 0, scale: .82 });
    gsap.set(layer.querySelector('.navigation-stage__caption'), { autoAlpha: 0, y: 24 });
    gsap.set(layer.querySelector('.navigation-stage__line'), { scaleX: 0 });
    document.body.classList.add('local-navigating');
  }
  function localNavigationCaption(request) {
    var layer = localNavigation.layer, caption = layer.querySelector('.navigation-stage__caption');
    layer.dataset.route = request.key;
    var index = Math.max(0, PAGE_ORDER.indexOf(request.key));
    caption.querySelector('small').textContent = ('0' + (index + 1)).slice(-2) + ' / SECTION';
    caption.querySelector('b').textContent = PAGE_NAME[request.key] || '';
    caption.querySelector('span').textContent = localRouteLabels[request.key] || 'QQ AGENT';
    gsap.set(caption, { autoAlpha: 0, y: 24 });
  }
  function localNavigationCover(epoch, factor) {
    var layer = localNavigation.layer;
    var entries = localNavigationCollectContent(false), sign = localNavigation.direction;
    localNavigationPhase('cover');
    gsap.set(layer.querySelector('.navigation-stage__caption'), { autoAlpha: 0 });
    return localNavigationAnimate(epoch, function (timeline) {
      entries.forEach(function (entry, index) {
        var title = entry.role === 'title', meta = entry.role === 'meta';
        timeline.to(entry.target, {
          y: title ? -innerHeight * .19 : meta ? -50 : innerHeight * .105,
          z: title ? -460 : -250, rotationX: (title ? 10 : -5) * sign,
          scale: title ? .88 : .94, duration: .46 * factor, ease: 'power3.inOut'
        }, Math.min(index * .014, .07) * factor)
          .to(entry.target, { opacity: 0, duration: .16 * factor, ease: 'power2.in' }, (.24 + Math.min(index * .014, .07)) * factor);
      });
      timeline.to(layer.querySelectorAll('[class^="navigation-pane--"]'), {
        z: 0, scale: 1, opacity: .8,
        duration: .48 * factor, stagger: .035 * factor, ease: 'power3.inOut'
      }, 0).to(layer.querySelector('.navigation-stage__vanishing'), { scale: 1.04, opacity: .7, duration: .5 * factor, ease: 'power2.inOut' }, 0);
    }).then(function (complete) {
      if (complete) {
        gsap.set(qs('#view'), { opacity: 0 });
        if (qs('#foot')) qs('#foot').style.opacity = '0';
        localNavigationRestoreContent();
        localNavigation.covered = true;
      }
      return complete;
    });
  }
  function localNavigationReveal(epoch, factor) {
    var entries = localNavigationCollectContent(true), sign = localNavigation.direction;
    entries.forEach(function (entry, index) {
      var title = entry.role === 'title';
      gsap.set(entry.target, { y: title ? innerHeight * .17 : innerHeight * .11,
        z: title ? 280 : -260, rotationX: (title ? -11 : 5) * sign,
        scale: title ? 1.14 : .96, opacity: 0 });
    });
    gsap.set(qs('#view'), { opacity: 1 });
    localNavigationRestoreFooter();
    return localNavigationAnimate(epoch, function (timeline) {
      var layer = localNavigation.layer;
      entries.forEach(function (entry, index) {
        var start = (entry.role === 'title' ? Math.min(index * .045, .09) : .08 + Math.min(index * .025, .16)) * factor;
        timeline.to(entry.target, { y: 0, z: 0, rotationX: 0, scale: 1, duration: .8 * factor, ease: 'power4.out' }, start)
          .to(entry.target, { opacity: 1, duration: .18 * factor, ease: 'power1.out' }, start);
      });
      timeline.to(layer.querySelector('.navigation-stage__caption'), { autoAlpha: 0, y: -12, duration: .22 * factor, ease: 'power2.in' }, .1 * factor)
        .to(layer.querySelector('.navigation-stage__line'), { scaleX: 0, duration: .38 * factor }, .04 * factor)
        .to(layer.querySelector('.navigation-stage__vanishing'), { scale: 1.2, opacity: 0, duration: .6 * factor, ease: 'power3.out' }, 0)
        .to(layer.querySelectorAll('[class^="navigation-pane--"]'), { z: 460, scale: 1.12, opacity: 0,
          duration: .58 * factor, stagger: .04 * factor, ease: 'power3.out' }, 0);
    });
  }
  function localNavigationCommit(request, epoch) {
    var promise = localNavigation.renderBarrier.catch(function () {}).then(function () {
      if (epoch !== localNavigation.epoch) return;
      // Coalesce entries that are rendered behind the same closed panes.
      if (request.history && request.url !== location.href) {
        try {
          if (localNavigation.coverEntry === location.href) history.replaceState({ key: request.key }, '', request.url);
          else history.pushState({ key: request.key }, '', request.url);
          localNavigation.coverEntry = request.url;
        } catch (error) {}
      } else if (!request.history) localNavigation.coverEntry = null;
      setNavActive(request.key);
      localNavigation.rendering++;
      var output;
      try { output = renderPage(request.key, { keepScroll: request.keepScroll }); }
      catch (error) { localNavigation.rendering--; throw error; }
      return Promise.resolve(output).finally(function () { localNavigation.rendering--; });
    });
    localNavigation.renderBarrier = promise.catch(function () {});
    return promise;
  }
  function transition(key, url, options) {
    options = options || {};
    var absolute;
    try { absolute = new URL(url, location.href).href; } catch (error) { return; }
    var direction = PAGE_ORDER.indexOf(key) < PAGE_ORDER.indexOf(PAGE) ? 'back' : 'forward';
    // A popstate changes the history pointer immediately, even if coalesced later.
    if (options.history === false) localNavigation.coverEntry = null;
    localNavigation.pending = { key: key, url: absolute, history: options.history !== false,
      keepScroll: Boolean(options.keepScroll), revision: ++localNavigation.revision };
    if (localNavigation.running) {
      // An opening can be interrupted; a cover finishes before taking latest.
      if (localNavigation.phase === 'reveal') localNavigationCancelMotion();
      return;
    }
    localNavigation.running = true;
    var epoch = ++localNavigation.epoch;
    localNavigation.direction = direction === 'back' ? -1 : 1;
    var reduced = reduce || matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(forced-colors: active)').matches;
    var factor = document.documentElement.dataset.perf === 'low' ? .65 : 1;
    localNavigation.method = reduced ? 'reduced-direct' : 'spatial-content';
    localNavigationHideLegacy();
    localNavigationShowContent();
    if (!reduced) localNavigationStage(direction);
    window.__Q3_BUSY__ = true;
    var view = qs('#view');
    if (view) view.setAttribute('aria-busy', 'true');
    (async function () {
      try {
        while (localNavigation.pending && epoch === localNavigation.epoch) {
          await Promise.resolve();
          if (epoch !== localNavigation.epoch) return;
          if (!reduced && !localNavigation.covered && !(await localNavigationCover(epoch, factor))) return;
          await localNavigation.renderBarrier;
          if (epoch !== localNavigation.epoch) return;
          var request = localNavigation.pending;
          localNavigation.pending = null;
          if (!request) break;
          var marker = Promise.resolve(true);
          if (!reduced) {
            localNavigationPhase('hold');
            localNavigationCaption(request);
            marker = localNavigationAnimate(epoch, function (timeline) {
              timeline.to(localNavigation.layer.querySelector('.navigation-stage__caption'),
                { autoAlpha: 1, y: 0, duration: .14 * factor, ease: 'power2.out' }, 0)
                .to(localNavigation.layer.querySelector('.navigation-stage__line'),
                  { scaleX: 1, duration: .14 * factor, ease: 'power2.out' }, 0);
            });
          }
          await Promise.all([localNavigationCommit(request, epoch), marker]);
          if (epoch !== localNavigation.epoch) return;
          if (localNavigation.pending) continue;
          if (!reduced) {
            localNavigationPhase('reveal');
            localNavigation.covered = false;
            localNavigation.coverEntry = null;
            await localNavigationReveal(epoch, factor);
          }
        }
      } catch (error) {
        if (epoch === localNavigation.epoch) console.error('[local-navigation]', error);
      } finally {
        if (epoch === localNavigation.epoch) localNavigationReset();
      }
    })();
  }
  window.addEventListener('pagehide', function () {
    localNavigation.recoverOnShow = localNavigation.rendering > 0;
    localNavigation.suspended = true;
    localNavigationReset();
  });
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted && !localNavigation.suspended) return;
    var recover = localNavigation.recoverOnShow;
    localNavigation.recoverOnShow = false;
    localNavigation.suspended = false;
    localNavigationReset();
    var key = keyFromUrl(location.href);
    // Idle BFCache restores keep their DOM, filters and scroll position intact.
    if (recover && key && window.__Q3_PAGES__) transition(key, location.href, { history: false, keepScroll: true });
  });
  window.__LOCAL_NAVIGATION__ = {
    version: 'spatial-content-3', reset: localNavigationReset,
    get method() { return localNavigation.method; },
    get busy() { return localNavigation.running; },
    get phase() { return localNavigation.phase; },
    get contentCount() { return localNavigation.content.length; }
  };


  /* ── 顶栏高亮：切页后同步 on 态与指示条 ───────────────────────── */
  function setNavActive(key) {
    var list = qsa('.nav-links a');
    var hit = null;
    list.forEach(function (a) {
      var k = keyFromUrl(a.getAttribute('href'));
      var on = k === key;
      a.classList.toggle('on', on);
      if (on) hit = a;
    });
    var menu = qsa('.menu a.mi');
    menu.forEach(function (a) {
      a.classList.toggle('on', keyFromUrl(a.getAttribute('href')) === key);
    });
    if (Q3.__moveInk) Q3.__moveInk(hit, .35);
  }

  /* ── 跳转入口 ─────────────────────────────────────────────────── */
  function go(url) {
    var key = keyFromUrl(url);
    if (key === null) { location.href = url; return; }
    var next = new URL(url, location.href);
    if (localNavigation.running) { transition(key, next.href); return; }
    if (key === PAGE && next.pathname === location.pathname && next.search === location.search && next.hash === location.hash) {
      if (window.gsap && !reduce) gsap.to(window, { scrollTo: { y: 0, autoKill: true }, duration: .85, ease: 'power3.inOut' });
      else window.scrollTo(0, 0);
      return;
    }
    if (!window.__Q3_PAGES__) { location.href = url; return; }
    transition(key, url);
  }

  function bindLinks() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/.test(href)) return;
      if (/^https?:/i.test(href)) {
        // 同站绝对 URL 也必须走 SPA —— 否则每次点导航都是整页刷新，
        // 正在播放的背景音乐会被当场掐断。只有真正的外站才交给浏览器。
        var same = false;
        try {
          var _u = new URL(href, location.href);
          same = (_u.hostname.replace(/^www\./i, '') === location.hostname.replace(/^www\./i, '')) &&
                 _u.pathname.indexOf('/qq-agent/') === 0;
        } catch (err) { same = false; }
        if (!same) return;
      }
      e.preventDefault();
      go(a.href);
    });
  }

  /* ── 点赞：雷霆语录 + 意见墙共用（事件委托，一次覆盖全站）───────
   * 后端接口：POST /qq-agent/api/like  {target:'holyshits'|'comment', id, like:true}
   * 返回 {ok:true, count:N}。localStorage 记已赞 id 防重复。
   */
  var LIKE_STORE = 'qqa-liked-';

  function likedList(target) {
    try { return JSON.parse(localStorage.getItem(LIKE_STORE + target) || '[]') || []; }
    catch (e) { return []; }
  }

  /* 把已赞过的按钮标成 liked（切页/重渲染后恢复视觉） */
  function paintLikes(root) {
    qsa('[data-like][data-id]', root || document).forEach(function (b) {
      var has = likedList(b.dataset.like).indexOf(b.dataset.id) >= 0;
      b.classList.toggle('liked', has);
      if (has) b.setAttribute('title', '已经赞过啦');
    });
  }

  function bindLikes() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-like][data-id]');
      if (!b || b.disabled || b.dataset.busy) return;
      e.preventDefault();
      var target = b.dataset.like, id = b.dataset.id;
      if (likedList(target).indexOf(id) >= 0) {
        b.classList.add('liked');
        toast('这条你已经赞过啦');
        return;
      }
      b.dataset.busy = '1';
      b.disabled = true;
      b.classList.add('popping');

      window.fetch('/qq-agent/api/like', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: target, id: id, like: true })
      })
        .then(function (r) {
          var ct = r.headers.get('content-type') || '';
          if (!r.ok) throw new Error('HTTP ' + r.status);
          if (ct.indexOf('json') === -1) throw new Error('服务端返回异常');
          return r.json();
        })
        .then(function (d) {
          if (!d || d.ok === false) throw new Error((d && d.error) || '点赞失败');
          var arr = likedList(target);
          arr.push(id);
          try { localStorage.setItem(LIKE_STORE + target, JSON.stringify(arr)); } catch (err) {}
          b.classList.add('liked');
          var num = b.querySelector('b, .n');
          if (num && d.count != null) num.textContent = d.count;
          toast('谢谢支持！');
          delete b.dataset.busy;
        })
        .catch(function (err) {
          toast('点赞失败：' + ((err && err.message) || err));
          b.disabled = false;
          delete b.dataset.busy;
        })
        .then(function () { b.classList.remove('popping'); });
    });

    // 每次切页后重新上色
    document.addEventListener('q3:page', function () { paintLikes(); });
    paintLikes();
  }

  /* ── 顶栏 ─────────────────────────────────────────────────────── */
  var NAV = [
    { k: 'home', href: 'lab/index.html', label: '首页' },
    { k: 'comments', href: 'comments/index.html', label: '意见墙' },
    { k: 'holyshits', href: 'holyshits/index.html', label: '雷霆语录' },
    { k: 'skill', href: 'skill-market/index.html', label: 'SKILL' },
    { k: 'plugin', href: 'plugin-market/index.html', label: '插件' },
    { k: 'persona', href: 'persona-plaza/index.html', label: '人设' },
    { k: 'thanks', href: 'thanks.html', label: '致谢' }
  ];
  var GROUP = '';

  function buildNav() {
    var nav = qs('#nav');
    if (!nav) return;
    var links = NAV.map(function (n) {
      return '<a href="' + BASE + n.href + '"' + (n.k === PAGE ? ' class="on"' : '') + '>' + n.label + '</a>';
    }).join('');
    nav.innerHTML =
      '<div class="nav-in">' +
        '<a class="brand" href="' + BASE + 'lab/index.html">QQ AGENT<em>/2026</em></a>' +
        '<button class="nav-sponsor nav-sponsor-afd" id="navSponsor" type="button" title="爱发电 · 赞赏支持" aria-label="赞赏支持">' +
          '<img src="' + BASE + 'afdian-icon.webp" alt="爱发电" class="afd-ico" />' +
          '<span class="lbl">支持一下</span>' +
          '<span class="sponsor-pop" role="tooltip">' +
            '<i>此离线副本未包含个人收款信息</i>' +
          '</span>' +
        '</button>' +
        '<nav class="nav-links">' + links + '</nav>' +
        '<div class="nav-user" id="navUser">' +
          '<button class="nav-ubtn" id="navLogin" type="button">登录</button>' +
        '</div>' +
        '<button class="nav-theme" id="navTheme" type="button" aria-label="切换明暗"></button>' +
        '<button class="nav-music" id="navMusic" type="button" aria-label="播放音乐">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M9 18V6.5l10-2V16"/><circle cx="6.6" cy="18" r="2.4"/><circle cx="16.6" cy="16" r="2.4"/>' +
          '</svg><span class="menu-tool-label">音乐</span>' +
        '</button>' +
        '<button class="nav-burger" id="navBurger" type="button" aria-label="打开菜单" aria-controls="menu" aria-expanded="false"><span>菜单</span><span class="bars"><i></i><i></i></span></button>' +
      '</div>';

    // 全屏菜单挂在 body 上（若塞进 nav 里，会被 nav 的定位子元素压在下面）
    document.body.insertAdjacentHTML('beforeend',
      '<nav class="menu" id="menu" aria-label="网站菜单" inert>' +
        NAV.map(function (n, i) {
          return '<a class="mi' + (n.k === PAGE ? ' on' : '') + '" href="' + BASE + n.href + '"><span class="i">' + String(i + 1).padStart(2, '0') + '</span>' + n.label + '</a>';
        }).join('') +
        '<div class="menu-tools" id="menuTools" aria-label="账号与工具"></div>' +
        '<div class="msub">' +
          '<button class="chip" id="menuSponsor" type="button">♥ 赞赏支持</button>' +
          '<span class="mono">管理员 · <a href="' + BASE + 'admin/index.html" style="text-decoration:underline">后台</a></span>' +
        '</div>' +
      '</nav>');

    // 导航指示条：跟着 hover 滑动，离开回到当前页
    var navLinks = qs('.nav-links', nav);
    if (navLinks) {
      var ink = document.createElement('span');
      ink.className = 'nav-pill';
      navLinks.appendChild(ink);
      var linksArr = qsa('a', navLinks);
      var cur = linksArr.filter(function (a) { return a.classList.contains('on'); })[0] || linksArr[0];
      var moveInkRaw = function (a, dur) {
        if (!a) return;
        var r = a.getBoundingClientRect();
        var p0 = navLinks.getBoundingClientRect();
        gsap.to(ink, { x: r.left - p0.left, width: Math.max(16, r.width), duration: dur || .45, ease: 'power3.out' });
      };
      // cur 必须在每次移动时同步更新：它原来是闭包里的初始值，
      // 切页后仍指向上一个页面的链接，导致指示胶囊永远停在那一个上。
      Q3.__moveInk = function (a, dur) { if (a) cur = a; moveInkRaw(a, dur); };
      if (cur) { moveInkRaw(cur, 0); gsap.set(ink, { opacity: 1 }); }
      linksArr.forEach(function (a) {
        a.addEventListener('mouseenter', function () { Q3.__moveInk(a, .4); });
      });
      navLinks.addEventListener('mouseleave', function () { Q3.__moveInk(cur, .5); });
      window.addEventListener('resize', function () { moveInkRaw(cur, 0); });
    }

    // 滚动后顶栏加底色
    var onScroll = function () {
      nav.classList.toggle('stuck', window.scrollY > 12);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // 移动端菜单
    var menu = qs('#menu'), burger = qs('#navBurger'), open = false;
    var mtl = null;
    var navEl = nav;
    var compactNav = matchMedia('(max-width: 1280px)');
    var tools = qs('#menuTools');
    var toolSlots = ['#navUser', '#navMusic'].map(function (selector) {
      var el = qs(selector), slot = document.createComment('navigation tool');
      el.parentNode.insertBefore(slot, el);
      return { el: el, slot: slot };
    });
    var background = [];
    function toggle(state, restoreFocus) {
      if (open === state) return;
      open = state;
      if (mtl) mtl.kill();
      gsap.killTweensOf(menu);
      navEl.classList.toggle('mo', open);
      burger.firstElementChild.textContent = open ? '关闭' : '菜单';
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
      if (open) {
        menu.inert = false;
        menu.scrollTop = 0;
        background = qsa('main, footer').map(function (el) {
          var item = { el: el, inert: el.inert };
          el.inert = true;
          return item;
        });
        menu.classList.add('open');
        document.documentElement.classList.add('k-hold');
        gsap.set(qsa('.mi, .menu-tools, .msub', menu), { clearProps: 'opacity,transform' });
        if (reduce) {
          gsap.set(menu, { opacity: 1, clearProps: 'transform' });
        } else {
          mtl = gsap.timeline()
            .fromTo(menu, { opacity: 0, yPercent: -3 }, { opacity: 1, yPercent: 0, duration: .3, ease: 'expo.out' })
            .from(qsa('.menu .mi'), { opacity: 0, y: 16, duration: .3, ease: 'power3.out', stagger: .025 }, '-=.15')
            .from(qsa('.menu-tools, .msub', menu), { opacity: 0, duration: .2 }, '-=.15');
        }
        var current = qs('.mi.on', menu) || qs('.mi', menu);
        if (current) current.focus({ preventScroll: true });
      } else {
        menu.inert = true;
        menu.classList.remove('open');
        gsap.set(menu, { clearProps: 'opacity,transform' });
        gsap.set(qsa('.mi, .menu-tools, .msub', menu), { clearProps: 'opacity,transform' });
        background.forEach(function (item) { item.el.inert = item.inert; });
        background = [];
        document.documentElement.classList.remove('k-hold');
        if (restoreFocus !== false) burger.focus({ preventScroll: true });
      }
    }
    burger.addEventListener('click', function () { toggle(!open); });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a, button')) toggle(false, false);
    }, true);
    document.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); toggle(false); return; }
      if (e.key !== 'Tab') return;
      var focusable = qsa('a[href], button:not(:disabled)', nav).concat(qsa('a[href], button:not(:disabled)', menu)).filter(function (el) {
        return el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      });
      var index = focusable.indexOf(document.activeElement);
      var next = index + (e.shiftKey ? -1 : 1);
      if (next < 0 || next >= focusable.length || index < 0) {
        e.preventDefault();
        focusable[next < 0 ? focusable.length - 1 : 0].focus();
      }
    });
    window.addEventListener('popstate', function () { toggle(false, false); });
    function arrangeTools() {
      if (!compactNav.matches) toggle(false, false);
      toolSlots.forEach(function (item) {
        if (compactNav.matches) tools.appendChild(item.el);
        else item.slot.parentNode.insertBefore(item.el, item.slot.nextSibling);
      });
    }
    compactNav.addEventListener('change', arrangeTools);
    arrangeTools();

    // 群二维码 / 赞助 / 明暗
    var sp = qs('#navSponsor');
    if (sp && !matchMedia('(hover: hover)').matches) {
      sp.addEventListener('click', function () { openSponsor(); });
    }
    var sp2 = qs('#menuSponsor');
    if (sp2) sp2.addEventListener('click', function () { toggle(false); openSponsor(); });
    var th = qs('#navTheme');
    if (th) th.addEventListener('click', function () { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); });
    var mu = qs('#navMusic');
    if (mu) mu.addEventListener('click', function () { openMusic(); });
  }

  /* ── 明暗主题 ─────────────────────────────────────────────────── */
  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.7 6.7 0 0 0 11.1 11.1z"/></svg>';

  function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function paintThemeBtn() {
    var b = qs('#navTheme');
    if (!b) return;
    var dark = currentTheme() === 'dark';
    b.innerHTML = dark ? SUN : MOON;
    b.setAttribute('aria-label', dark ? '切换到亮色' : '切换到暗色');
  }

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('qqa-theme', t); } catch (e) {}
    paintThemeBtn();
    document.dispatchEvent(new CustomEvent('q3:theme', { detail: { theme: t } }));
  }

  /* ── 感谢信浮窗 ───────────────────────────────────────────────── */
  var NOTE_HTML =
    '<button class="qnote-x" type="button" aria-label="关闭">×</button>' +
    '<div class="qnote-scroll">' +
      '<div class="qnote-kicker">THANK YOU / 2026</div>' +
      '<h2>感谢您对 QQ-Agent 的兴趣。</h2>' +
      '<p>我希望能够以最低的入门门槛，让用户能够借助 AI 撬动最大的上限，让所有人都能体会到技术的进步以及创造的快乐。</p>' +
      '<p>一个普通的聊天机器人绝非我的目标，我希望未来它会成为更全面、更实用，同时陪伴感更强、记忆更有活人感的…朋友。</p>' +
      '<p>请不要草鱼。</p>' +
      '<p>不过，由于用户量的急剧提升，在起初我们升级了服务器，并搭载了 ESA 来保证用户的下载体验，但现在新用户的加入速度逐渐加快，因此服务器的流量费用也一路飞升，对于我这个尚未求职成功的人来说有些难以负担。</p>' +
      '<p>因此，如果您使用了一段时间此肥鱼，认为它给你带来了不错的体验，那么可以考虑回到这里，通过赞赏码给这个项目一些支持，那么你将收获一位<strong>义子</strong>。</p>' +
      '<p>无论如何，感谢您看到了这个项目，看到了一个人尝试找回生活的意义的故事。</p>' +
      '<p>我爱你们。</p>' +
      '<p class="sign">——QQ Agent 开发者</p>' +
    '</div>';

  var noteEl = null, noteShown = false, noteMode = null;
  var hoverCloseTimer = null;

  function buildNote() {
    if (noteEl) return noteEl;
    noteEl = document.createElement('aside');
    noteEl.className = 'qnote';
    noteEl.setAttribute('aria-hidden', 'true');
    noteEl.innerHTML = NOTE_HTML;
    document.body.appendChild(noteEl);
    noteEl.querySelector('.qnote-x').addEventListener('click', function () { closeNote('x'); });
    // 鼠标停在浮窗上时，不要因为它离开图案就被收回去
    noteEl.addEventListener('mouseenter', cancelNoteClose);
    noteEl.addEventListener('mouseleave', function () {
      if (noteMode === 'hover') scheduleNoteClose();
    });
    return noteEl;
  }

  // mode: 'sticky'（点下载，只能按 X 关）| 'hover'（图案悬停，移开就收）
  function openNote(mode) {
    mode = mode || 'sticky';
    if (noteShown) {
      // 已经是 sticky 就别被 hover 顶掉
      return;
    }
    noteShown = true;
    noteMode = mode;
    var el = buildNote();
    document.body.classList.add('qnote-open');
    gsap.killTweensOf(el);
    gsap.fromTo(el, { x: '-104%' }, { x: '0%', duration: .58, ease: 'expo.out' });
  }

  function closeNote(from) {
    if (!noteEl || !noteShown) return;
    // 点下载弹出的这版，只认 X（或程序主动关）
    if (noteMode === 'sticky' && from !== 'x') return;
    clearTimeout(hoverCloseTimer);
    noteShown = false;
    noteMode = null;
    // 先播滑出，播完再撤 visible，否则会「瞬间消失」
    gsap.to(noteEl, {
      x: '-104%', duration: .44, ease: 'power2.in',
      onComplete: function () {
        if (!noteShown) document.body.classList.remove('qnote-open');
      }
    });
  }

  function scheduleNoteClose() {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = setTimeout(function () {
      if (noteMode === 'hover') closeNote('hover');
    }, 200);
  }

  function cancelNoteClose() {
    clearTimeout(hoverCloseTimer);
  }

  /* ── 音乐浮窗 ─────────────────────────────────────────────────── */
  var QM_HTML =
    '<button class="qm-x" type="button" aria-label="关闭">×</button>' +
    '<div class="qm-scroll">' +
    '<img class="qm-cover" src="' + BASE + 'assets/audio/cover.jpg" alt="Alternative VII 专辑封面" />' +
    '<div class="qm-meta"><b>Abiogenesis</b><span>JUGGERNAUTS · ALTERNATIVE VII</span></div>' +
    '<div class="qm-track">' +
      '<div class="qm-bar"><i class="qm-fill"></i><b class="qm-dot"></b></div>' +
      '<div class="qm-time"><span class="qm-cur">0:00</span><span class="qm-dur">0:00</span></div>' +
    '</div>' +
    '<div class="qm-ctrl">' +
      '<button class="qm-skip" type="button" disabled aria-label="上一首"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14l-10-7z"/></svg></button>' +
      '<button class="qm-play" type="button" aria-label="播放"></button>' +
      '<button class="qm-skip" type="button" disabled aria-label="下一首"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l10 7-10 7z"/></svg></button>' +
    '</div>' +
    '<p class="qm-note"><b>Abiogenesis / 无生源论。</b><br/>它指无机物在特定的条件下，奇迹般地跨越了界限，诞生了生命。<br/><br/>当我向她倾诉、寻求帮助、或跟她开玩笑、让她能够在千万次交互中产生不可预测的“涌现”时，在赛博空间的维度里，她也就是有生命的。<br/>她的每一次回复，都是我思维和情感的延伸。<br/><br/>如果机器人也有生命，那么这何尝不是一种 Abiogenesis。</p>' + '</div>';

  var PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg>';
  var PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.6" height="14" rx="1"/><rect x="13.4" y="5" width="3.6" height="14" rx="1"/></svg>';

  var qmEl = null, qmAudio = null, qmOpen = false, qmSeeking = false;

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function buildMusic() {
    if (qmEl) return qmEl;
    qmEl = document.createElement('aside');
    qmEl.className = 'qmusic';
    qmEl.setAttribute('aria-hidden', 'true');
    qmEl.innerHTML = QM_HTML;
    document.body.appendChild(qmEl);

    qmAudio = new Audio(BASE + 'assets/audio/track.mp3');
    qmAudio.preload = 'metadata';
    qmAudio.loop = true;

    var playBtn = qmEl.querySelector('.qm-play');
    var fill = qmEl.querySelector('.qm-fill');
    var dot = qmEl.querySelector('.qm-dot');
    var bar = qmEl.querySelector('.qm-bar');
    var curEl = qmEl.querySelector('.qm-cur');
    var durEl = qmEl.querySelector('.qm-dur');

    function paint(isPlaying) {
      playBtn.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
      playBtn.setAttribute('aria-label', isPlaying ? '暂停' : '播放');
      qmEl.classList.toggle('playing', isPlaying);
      var navBtn = qs('#navMusic');
      if (navBtn) navBtn.classList.toggle('on', isPlaying);
    }

    function paintProgress() {
      var d = qmAudio.duration || 0;
      var p = d ? qmAudio.currentTime / d : 0;
      fill.style.width = (p * 100).toFixed(2) + '%';
      dot.style.left = (p * 100).toFixed(2) + '%';
      curEl.textContent = fmtTime(qmAudio.currentTime);
      durEl.textContent = fmtTime(d);
    }

    playBtn.addEventListener('click', function () {
      if (qmAudio.paused) {
        qmAudio.play().then(function () { paint(true); }).catch(function (err) {
          console.warn('[audio]', err);
          toast('音频加载失败');
        });
      } else {
        qmAudio.pause();
        paint(false);
      }
    });

    qmAudio.addEventListener('play', function () { paint(true); });
    qmAudio.addEventListener('pause', function () { paint(false); });
    qmAudio.addEventListener('timeupdate', function () { if (!qmSeeking) paintProgress(); });
    qmAudio.addEventListener('loadedmetadata', paintProgress);
    qmAudio.addEventListener('ended', function () { paint(false); paintProgress(); });

    function seekTo(clientX) {
      var r = bar.getBoundingClientRect();
      var p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      if (qmAudio.duration) qmAudio.currentTime = p * qmAudio.duration;
      paintProgress();
    }
    bar.addEventListener('pointerdown', function (e) {
      qmSeeking = true;
      bar.setPointerCapture(e.pointerId);
      seekTo(e.clientX);
    });
    bar.addEventListener('pointermove', function (e) {
      if (qmSeeking) seekTo(e.clientX);
    });
    bar.addEventListener('pointerup', function () { qmSeeking = false; });
    bar.addEventListener('pointercancel', function () { qmSeeking = false; });

    qmEl.querySelector('.qm-x').addEventListener('click', closeMusic);
    paint(false);
    return qmEl;
  }

  function openMusic() {
    if (qmOpen) { closeMusic(); return; }
    closeNote('x');
    qmOpen = true;
    var el = buildMusic();
    document.body.classList.add('qmusic-open');
    gsap.killTweensOf(el);
    gsap.fromTo(el, { x: '104%' }, { x: '0%', duration: .62, ease: 'expo.out' });
    setTimeout(function () { if (qmAudio) paintProgressSafe(); }, 60);
  }

  function paintProgressSafe() {
    if (!qmEl || !qmAudio) return;
    var fill = qmEl.querySelector('.qm-fill');
    var dot = qmEl.querySelector('.qm-dot');
    var d = qmAudio.duration || 0;
    var p = d ? qmAudio.currentTime / d : 0;
    if (fill) fill.style.width = (p * 100).toFixed(2) + '%';
    if (dot) dot.style.left = (p * 100).toFixed(2) + '%';
  }

  function closeMusic() {
    if (!qmEl || !qmOpen) return;
    qmOpen = false;
    // 收起只是收起，音乐会继续在后台放；只有点暂停键才停
    gsap.to(qmEl, {
      x: '104%', duration: .44, ease: 'power2.in',
      onComplete: function () {
        if (!qmOpen) document.body.classList.remove('qmusic-open');
      }
    });
  }

  /* ── 赞赏弹窗 ─────────────────────────────────────────────────── */
  function openSponsor() {
    var ov = document.createElement('div');
    ov.className = 'modal';
    ov.innerHTML = '<div class="modal-box qr">' +
      '<div class="qr-head"><span class="mono">微信赞赏 · 请这条鱼吃口饭</span><button class="modal-x" type="button">关闭</button></div>' +
      '<p class="mono" style="text-align:center;margin-top:14px">此离线副本未包含个人收款信息。</p></div>';
    document.body.appendChild(ov);
    gsap.fromTo(ov.querySelector('.modal-box'),
      { y: 22, scale: .96, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: .45, ease: 'expo.out' });
    function close() {
      gsap.to(ov, { opacity: 0, duration: .22, onComplete: function () { ov.remove(); } });
    }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.modal-x').addEventListener('click', close);
    document.addEventListener('keydown', function k(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); }
    });
  }

  function openQR() {
    var ov = document.createElement('div');
    ov.className = 'modal';
    ov.innerHTML = '<div class="modal-box qr"><div class="qr-head"><span class="mono">项目社群</span><button class="modal-x" type="button">关闭</button></div>' +
      '<p class="mono" style="text-align:center;margin-top:14px">此源码副本未配置社群联系方式。</p></div>';
    document.body.appendChild(ov);
    gsap.fromTo(ov.querySelector('.modal-box'),
      { y: 22, scale: .96, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: .45, ease: 'expo.out' });
    function close() {
      gsap.to(ov, { opacity: 0, duration: .25, onComplete: function () { ov.remove(); } });
    }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.modal-x').addEventListener('click', close);
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
  }

  /* ── 页脚 ─────────────────────────────────────────────────────── */
  function buildFoot() {
    var f = qs('#foot');
    if (!f) return;
    f.innerHTML =
      '<div class="shell">' +
        '<div class="foot-word">QQ AGENT</div>' +
        '<div class="foot-grid">' +
          '<div class="foot-col"><h4>子页面</h4>' +
            '<a href="' + BASE + 'comments/index.html">意见墙</a>' +
            '<a href="' + BASE + 'holyshits/index.html">雷霆语录</a>' +
            '<a href="' + BASE + 'persona-plaza/index.html">人设广场</a>' +
          '</div>' +
          '<div class="foot-col"><h4>市场</h4>' +
            '<a href="' + BASE + 'skill-market/index.html">Skill 市场</a>' +
            '<a href="' + BASE + 'plugin-market/index.html">插件市场</a>' +
            '<a href="' + BASE + 'admin/index.html">内容管理</a>' +
          '</div>' +
          '<div class="foot-col"><h4>下载</h4>' +
            '<a href="https://kondius.cn/qq-agent/QQ-Agent-V0.4-Preview-Setup.exe" download>Windows 安装包</a>' +
            '<a href="https://github.com/K0nd1us/QQ-agent" target="_blank" rel="noopener">GitHub 仓库</a>' +
            '<a href="' + BASE + 'thanks.html">致谢名单</a>' +
          '</div>' +
          '<div class="foot-col"><h4>本页</h4>' +
            '<p>QQ Agent 社区 · 2026</p>' +
            '<p>数据快照 · ' + esc((SNAP.meta && SNAP.meta.capturedAt) || '—') + '</p>' +
            '<p>QQ Agent · 社区维护</p>' +
          '</div>' +
        '</div>' +
        '<div class="foot-base"><span>© 2026 QQ AGENT / DOSSIER</span><span>LOCAL-FIRST · NO CLOUD</span><span>MADE WITH ❤ IN SHANGHAI</span></div>' +
      '</div>';
  }

  /* ── 光标 ─────────────────────────────────────────────────────── */
  function buildCursor() {
    if (!fine || reduce) return;
    var c = qs('#cursor');
    if (!c) return;
    c.innerHTML = '<span class="cr"></span><span class="cd"></span><span class="cl"></span>';
    var label = c.querySelector('.cl');
    var dot = c.querySelector('.cd'), ring = c.querySelector('.cr');
    // GSAP 写 x/y 时会整条重写 transform，把 CSS 里的 translate(-50%,-50%) 冲掉，
    // 结果 8px 的点与 32px 的环都从左上角起算，视觉上就错开了。
    // 用 xPercent/yPercent 让 GSAP 自己把 -50% 带上，两者才同心。
    gsap.set([dot, ring], { xPercent: -50, yPercent: -50 });
    var dx = gsap.quickTo(dot, 'x', { duration: .12, ease: 'power2.out' });
    var dy = gsap.quickTo(dot, 'y', { duration: .12, ease: 'power2.out' });
    var rx = gsap.quickTo(ring, 'x', { duration: .55, ease: 'power3.out' });
    var ry = gsap.quickTo(ring, 'y', { duration: .55, ease: 'power3.out' });
    window.addEventListener('mousemove', function (e) {
      if (reduce) { c.style.opacity = 0; return; }
      c.style.opacity = 1;
      dx(e.clientX); dy(e.clientY);
      rx(e.clientX); ry(e.clientY);
    });
    window.addEventListener('mouseout', function () { c.style.opacity = 0; });
    document.addEventListener('mouseover', function (e) {
      var t = e.target;
      if (!t.closest) return;
      var tag = t.closest('[data-cursor]');
      var hot = tag || t.closest('a,button,.hit,.ben,.pg,.mrow,.cm,.sc');
      c.classList.toggle('grow', !!hot);
      label.textContent = tag ? tag.getAttribute('data-cursor') : '';
    });
  }

  function lowPerf() { return document.documentElement.dataset.perf === 'low'; }

  /* ── 磁吸按钮 ─────────────────────────────────────────────────── */
  function magnetics(scope) {
    if (!fine || reduce || lowPerf()) return;
    qsa('.btn, .nav-grp, .mg', scope || document).forEach(function (el) {
      if (el.__mg) return;
      el.__mg = 1;
      var xTo = gsap.quickTo(el, 'x', { duration: .5, ease: 'power3.out' });
      var yTo = gsap.quickTo(el, 'y', { duration: .5, ease: 'power3.out' });
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * .28);
        yTo((e.clientY - r.top - r.height / 2) * .34);
      });
      el.addEventListener('mouseleave', function () { xTo(0); yTo(0); });
    });
  }

  /* ── 文本揭示 ─────────────────────────────────────────────────── */
  function splitLines(el) {
    if (!window.SplitText) return [el];
    var st = new SplitText(el, { type: 'lines', linesClass: 'ln', reduceWhiteSpace: false });
    return st.lines;
  }

  function reveal(el, opt) {
    opt = opt || {};
    if (reduce) { gsap.set(el, { clearProps: 'all' }); return; }
    gsap.fromTo(el,
      { y: opt.y || 26, opacity: 0 },
      {
        y: 0, opacity: 1,
        duration: opt.duration || .95, ease: 'power3.out',
        delay: opt.delay || 0,
        scrollTrigger: opt.scroll === false ? null : { trigger: el, start: opt.start || 'top 88%', once: true },
        onComplete: function () { gsap.set(el, { clearProps: 'transform,opacity' }); }
      });
  }

  function revealAll(scope) {
    var entranceOwner = gsap.context(function () {
    var vh = window.innerHeight;
    qsa('[data-r]', scope || document).forEach(function (el) {
      if (el.__r) return;
      el.__r = 1;
      var near = el.getBoundingClientRect().top < vh * 1.05;
      if (localNavigation.layer && near) return;
      reveal(el, near ? { scroll: false, delay: .5 } : { start: el.dataset.start || 'top 88%' });
    });
    qsa('[data-rc]', scope || document).forEach(function (el) {
      if (el.__rc) return;
      el.__rc = 1;
      if (reduce) return;
      if (localNavigation.layer && el.getBoundingClientRect().top < vh * 1.05) return;
      var st = new SplitText(el, { type: 'chars', charsClass: 'chx' });
      gsap.from(st.chars, {
        yPercent: 56, opacity: 0, duration: .85, ease: 'power3.out', stagger: .016,
        scrollTrigger: { trigger: el, start: 'top 86%', once: true }
      });
    });
    qsa('[data-up]', scope || document).forEach(function (el) {
      if (el.__u) return;
      // 横向 pin 里的卡片由 pin 场景统一处理，避免 ScrollTrigger 位置错乱
      if (el.closest && el.closest('.caps-pin')) { el.__u = 1; return; }
      el.__u = 1;
      if (reduce) return;
      var near = el.getBoundingClientRect().top < vh * .96;
      if (localNavigation.layer && near) return;
      gsap.fromTo(el,
        { y: 22, opacity: 0 },
        {
          y: 0, opacity: 1, duration: .85, ease: 'power3.out',
          delay: near ? .15 : 0,
          scrollTrigger: near ? null : { trigger: el, start: 'top 94%', once: true },
          onComplete: function () { gsap.set(el, { clearProps: 'transform,opacity' }); }
              });
    });
    }, scope || qs('#view'));
    onDispose(function () { entranceOwner.revert(); });
  }

  /* ── 数字滚动 ─────────────────────────────────────────────────── */
  function count(el, to, opt) {
    opt = opt || {};
    var f = opt.fmt || fmt;
    if (reduce) { el.textContent = f(to); return; }
    // 目标是整数就全程显示整数，别在增长过程中冒出 7,125.595 这种
    var isInt = Number(to) % 1 === 0;
    var o = { v: 0 };
    gsap.to(o, {
      v: to, duration: opt.duration || 1.6, ease: 'power2.out',
      scrollTrigger: opt.trigger ? { trigger: opt.trigger, start: 'top 82%', once: true } : null,
      onUpdate: function () { el.textContent = f(isInt ? Math.round(o.v) : o.v); },
      onComplete: function () {
        el.textContent = f(to);
        gsap.fromTo(el, { scale: 1 }, { scale: 1.045, duration: .16, yoyo: true, repeat: 1, ease: 'power2.out' });
      }
    });
  }


  /* ── 顶栏反色：落在浅色区块上时切换 onlight ─────────────────── */
  function watchLight() {
    var nav = qs('#nav');
    if (!nav || !window.ScrollTrigger) return;
    var active = [];
    qsa('.light-sec').forEach(function (sec) {
      ScrollTrigger.create({
        trigger: sec, start: 'top 58px', end: 'bottom 58px',
        onToggle: function (self) {
          var i = active.indexOf(sec);
          if (self.isActive && i < 0) active.push(sec);
          else if (!self.isActive && i >= 0) active.splice(i, 1);
          nav.classList.toggle('onlight', active.length > 0);
          nav.classList.toggle('onacid', active.some(function (el) { return el.classList.contains('cta'); }));
        }
      });
    });
  }


  /* ── 装饰气泡：随机大小缓慢上浮 ────────────────────────────────── */
  function bubbles(host, n) {
    if (!host || reduce) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var size = 10 + Math.random() * 54;
      var el = document.createElement('span');
      el.className = 'bub';
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.left = (Math.random() * 92 + 2) + '%';
      el.style.top = (Math.random() * 78 + 6) + '%';
      el.style.opacity = (0.25 + Math.random() * 0.45).toFixed(2);
      frag.appendChild(el);
      gsap.to(el, {
        y: -(20 + Math.random() * 60),
        x: (Math.random() - 0.5) * 30,
        duration: 3.4 + Math.random() * 3.6,
        repeat: -1, yoyo: true, ease: 'sine.inOut',
        delay: Math.random() * 2
      });
    }
    host.appendChild(frag);
  }

  /* ── 跑马灯：内容复制一倍无缝循环，滚动越快跑越快 ──────────────── */
  function tape(sel) {
    var box = qs(sel);
    if (!box) return;
    var wrap = box.parentElement || document;
    var bands = qsa('.tape', wrap);
    if (!bands.length) bands = [box];
    var speeds = [34, 62];  // ghost 慢、主带快
    var mainTween = null, mainBand = null, tapeAlive = true;
    var tapeLoops = [], tapeSpeed = { value: 1 }, speedTo = null;
    onDispose(function () {
      tapeAlive = false;
      if (speedTo) speedTo.tween.kill();
      tapeLoops.forEach(function (loop) { loop.kill(); });
      tapeLoops.length = 0;
    });

    bands.forEach(function (band, i) {
      var inner = band.querySelector('.tape-in');
      if (!inner) return;
      inner.innerHTML = inner.innerHTML + inner.innerHTML;
      if (reduce) return;
      var w = inner.scrollWidth / 2;
      if (!w) return;
      var t = gsap.to(inner, {
        x: -w, duration: w / (speeds[i] || 62), ease: 'none', repeat: -1
      });
      tapeLoops.push(t);
      if (i === bands.length - 1) { mainTween = t; mainBand = band; }
    });

    if (reduce || !mainTween) return;
    speedTo = gsap.quickTo(tapeSpeed, 'value', {
      duration: .5, ease: 'power1.out',
      onUpdate: function () { if (tapeAlive) mainTween.timeScale(tapeSpeed.value); }
    });
    ScrollTrigger.create({
      trigger: wrap, start: 'top bottom', end: 'bottom top',
      onUpdate: function (self) {
        if (!tapeAlive) return;
        var v = Math.abs(self.getVelocity());
        speedTo(1 + Math.min(v / 1400, 2.4));
      }
    });
  }

  /* ── 鼠标 3D 倾斜 ──────────────────────────────────────────────── */
  function tilt(sel) {
    if (!fine || reduce || lowPerf() || !window.gsap) return;
    qsa(sel).forEach(function (el) {
      if (el.__tilt) return;
      el.__tilt = 1;
      el.style.transformPerspective = '700px';
      var rx = gsap.quickTo(el, 'rotateX', { duration: .5, ease: 'power3.out' });
      var ry = gsap.quickTo(el, 'rotateY', { duration: .5, ease: 'power3.out' });
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - .5;
        var py = (e.clientY - r.top) / r.height - .5;
        ry(px * 8);
        rx(-py * 8);
      });
      el.addEventListener('mouseleave', function () { rx(0); ry(0); });
    });
  }

  /* ── 鼠标视差：按深度位移 ──────────────────────────────────────── */
  function parallax(sel, depth) {
    if (!fine || reduce || lowPerf()) return;
    var els = qsa(sel);
    if (!els.length) return;
    var conf = els.map(function (el, i) {
      return { el: el, d: (depth || 18) * (i % 3 === 0 ? 1 : i % 3 === 1 ? -.7 : .45) };
    });
    els.forEach(function (el) {
      el.__px = gsap.quickTo(el, 'x', { duration: 1.1, ease: 'power3.out' });
      el.__py = gsap.quickTo(el, 'y', { duration: 1.1, ease: 'power3.out' });
    });
    window.addEventListener('mousemove', function (e) {
      var cx = (e.clientX / window.innerWidth - .5) * 2;
      var cy = (e.clientY / window.innerHeight - .5) * 2;
      conf.forEach(function (o) {
        o.el.__px(cx * o.d);
        o.el.__py(cy * o.d * .6);
      });
    });
  }

  /* ── 回到顶部 ──────────────────────────────────────────────────── */
  function totop() {
    var existed = qs('.totop');
    if (existed) {
      // 切页后 ScrollTrigger 被清空，这里只重建触发器
      ScrollTrigger.create({
        start: 'top -600',
        onToggle: function (self) { existed.classList.toggle('on', self.isActive); }
      });
      var fg0 = existed.querySelector('.tr-fg');
      if (fg0) {
        ScrollTrigger.create({
          start: 0, end: 'max',
          onUpdate: function (self) { fg0.style.strokeDashoffset = (125.6 * (1 - self.progress)).toFixed(1); }
        });
      }
      return;
    }
    var b = document.createElement('button');
    b.className = 'totop';
    b.type = 'button';
    b.setAttribute('aria-label', '回到顶部');
    b.innerHTML = '<svg viewBox="0 0 44 44" aria-hidden="true">' +
      '<circle class="tr-bg" cx="22" cy="22" r="20"></circle>' +
      '<circle class="tr-fg" cx="22" cy="22" r="20"></circle></svg><span>↑</span>';
    document.body.appendChild(b);
    b.addEventListener('click', function () {
      if (reduce) { window.scrollTo(0, 0); return; }
      gsap.to(window, { scrollTo: { y: 0, autoKill: true }, duration: .9, ease: 'power3.inOut' });
    });
    ScrollTrigger.create({
      start: 'top -600',
      onToggle: function (self) { b.classList.toggle('on', self.isActive); }
    });
    var fg = b.querySelector('.tr-fg');
    var CIRC = 125.6;
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        fg.style.strokeDashoffset = (CIRC * (1 - self.progress)).toFixed(1);
      }
    });
  }

  /* ── 滚动速度倾斜：快滑时标题轻微推倒 ─────────────────────────── */
  function velocitySkew(sel, max) {
    if (reduce || !window.ScrollTrigger) return;
    max = max || 2.2;
    qsa(sel).forEach(function (el) {
      if (el.__sk) return;
      el.__sk = 1;
      var to = gsap.quickTo(el, 'skewY', { duration: .45, ease: 'power2.out' });
      onDispose(function () { to.tween.kill(); });
      ScrollTrigger.create({
        trigger: el, start: 'top bottom', end: 'bottom top',
        onUpdate: function (self) {
          to(gsap.utils.clamp(-max, max, self.getVelocity() / -520));
        }
      });
    });
  }

  /* ── 右侧章节索引 ─────────────────────────────────────────────── */
  function rail(items) {
    if (!items || !items.length || !window.ScrollTrigger) return;
    var el = document.createElement('nav');
    el.className = 'rail';
    el.setAttribute('aria-label', '章节索引');
    el.innerHTML = items.map(function (it, i) {
      return '<a href="#' + it.id + '"><span>' + esc(it.t) + '</span><i>' + String(i).padStart(2, '0') + '</i><em></em></a>';
    }).join('');
    document.body.appendChild(el);
    var links = qsa('a', el);

    var navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10) || 64;
    el.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      var t = qs(a.getAttribute('href'));
      if (!t) return;
      var y = t.getBoundingClientRect().top + window.scrollY - navH - 8;
      if (reduce) { window.scrollTo(0, y); return; }
      gsap.to(window, { scrollTo: { y: y, autoKill: true }, duration: .95, ease: 'power3.inOut' });
    });

    ScrollTrigger.create({
      start: 'top -160', end: 'max',
      onToggle: function (self) { el.classList.toggle('on', self.isActive); }
    });

    items.forEach(function (it, i) {
      var sec = qs('#' + it.id);
      if (!sec) return;
      ScrollTrigger.create({
        trigger: sec, start: 'top 42%', end: 'bottom 42%',
        onToggle: function (self) {
          if (!self.isActive) return;
          links.forEach(function (x) { x.classList.remove('on'); });
          links[i].classList.add('on');
        }
      });
    });
  }



  /* ── 字符乱码揭示：先随机跳动再定格 ─────────────────────────────── */
  function scramble(sel, delay) {
    if (reduce) return;
    var els = typeof sel === 'string' ? qsa(sel) : (sel.tagName ? [sel] : qsa(sel));
    els.forEach(function (el, idx) { scrambleOne(el, (delay || 0) + idx * 0.06); });
  }

  function scrambleOne(el, delay) {
    var final = el.textContent;
    var glyphs = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/#*—+';
    var o = { p: 0 };
    var run = function () {
      gsap.to(o, {
        p: 1, duration: 1.1, ease: 'none',
        onUpdate: function () {
          var cut = Math.floor(final.length * o.p);
          var tail = '';
          for (var i = cut; i < final.length; i++) {
            var c = final.charAt(i);
            tail += /\s/.test(c) ? c : glyphs.charAt(Math.floor(Math.random() * glyphs.length));
          }
          el.textContent = final.slice(0, cut) + tail;
        },
        onComplete: function () { el.textContent = final; }
      });
    };
    ScrollTrigger.create({
      trigger: el, start: 'top 90%', once: true,
      onEnter: function () { gsap.delayedCall(delay || 0, run); }
    });
  }

  /* ── 卡片内部视差：鼠标移动时图标/标题/正文以不同幅度偏移 ──────── */
  function cardParallax(sel) {
    if (!fine || reduce || lowPerf()) return;
    qsa(sel).forEach(function (card) {
      if (card.__cp) return;
      card.__cp = 1;
      var layers = qsa('.bi, h3, p', card);
      if (!layers.length) return;
      var tos = layers.map(function (el, i) {
        return {
          x: gsap.quickTo(el, 'x', { duration: .6, ease: 'power3.out' }),
          y: gsap.quickTo(el, 'y', { duration: .6, ease: 'power3.out' }),
          d: 8 - i * 3
        };
      });
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var cx = (e.clientX - r.left) / r.width - .5;
        var cy = (e.clientY - r.top) / r.height - .5;
        tos.forEach(function (o) { o.x(cx * o.d * 2); o.y(cy * o.d * 1.2); });
      });
      card.addEventListener('mouseleave', function () {
        tos.forEach(function (o) { o.x(0); o.y(0); });
      });
    });
  }

  /* ── 大标题磁吸：整块随鼠标轻移 ─────────────────────────────────── */
  function magneticText(sel, amp) {
    if (!fine || reduce || lowPerf()) return;
    qsa(sel).forEach(function (el) {
      if (el.__mt) return;
      el.__mt = 1;
      var x = gsap.quickTo(el, 'x', { duration: 1, ease: 'power3.out' });
      var y = gsap.quickTo(el, 'y', { duration: 1, ease: 'power3.out' });
      var a = amp || 10;
      listen(window, 'pointermove', function (e) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) return;
        x((e.clientX / innerWidth - .5) * a);
        y((e.clientY / innerHeight - .5) * a * .6);
      }, { passive: true });
    });
  }


  /* ── 图标微浮动：让静态卡片也有呼吸 ─────────────────────────────── */
  function floatIcons(sel) {
    if (reduce) return;
    qsa(sel).forEach(function (el, i) {
      if (el.__fl) return;
      el.__fl = 1;
      gsap.to(el, {
        y: -5, duration: 2.4 + (i % 5) * .3,
        repeat: -1, yoyo: true, ease: 'sine.inOut',
        delay: (i % 7) * .18
      });
    });
  }

  /* ── 启动 ─────────────────────────────────────────────────────── */
  function boot() {
    buildNav();
    paintThemeBtn();
    buildFoot();
    buildCursor();
    bindLinks();
    bindLikes();
    bindComments();
    var authReady = bindAuth();

    // 点「下载安装包」后，过一会儿把感谢信划出来
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[download]');
      if (!a) return;
      setTimeout(function () { openNote('sticky'); }, 700);
    });

    var run = Promise.resolve(authReady).then(function () { return renderPage(PAGE); });
    run.then(function () {
      window.__Q3_READY__ = true;
      document.dispatchEvent(new Event('q3:ready'));
      // 遮幕升起
      var veil = qs('.veil');
      document.documentElement.classList.remove('k-hold');
      if (veil && !reduce) {
        gsap.set(veil, { display: 'block', opacity: 1 });
        gsap.to(veil, {
          opacity: 0, duration: .5, ease: 'power2.inOut',
          onComplete: function () {
            veil.style.display = 'none';
            ScrollTrigger.refresh();
          }
        });
        gsap.from('#view', { opacity: 0, duration: reduce ? 0 : .24, ease: 'power1.out', clearProps: 'opacity' });
      } else {
        if (veil) veil.style.display = 'none';
      }
    }).catch(function (err) {
      console.error(err);
      var v = qs('#view');
      if (v) v.innerHTML = '<div class="shell" style="padding:120px 0"><p class="mono" style="color:var(--coral)">BOOT ERROR</p><p style="margin-top:12px">' + esc(err && err.message) + '</p></div>';
      var bars = qsa('.veil i');
      gsap.to(bars, { scaleY: 0, duration: .5, onComplete: function () { qs('.veil').style.display = 'none'; } });
      document.documentElement.classList.remove('k-hold');
    });
  }

  var Q3 = {
    BASE: BASE, PAGE: PAGE, FILE: FILE, SNAP: SNAP, GROUP: GROUP,
    listen: listen, onDispose: onDispose, epoch: function () { return pageEpoch; }, isCurrent: function (epoch) { return epoch === pageEpoch; },
    qs: qs, qsa: qsa, esc: esc, fmt: fmt, compact: compact, dt: dt, ago: ago, attr: attr,
    load: load, toast: toast, go: go, renderPage: renderPage, keyFromUrl: keyFromUrl,
    reveal: reveal, revealAll: revealAll,
    count: count, magnetics: magnetics, splitLines: splitLines, openQR: openQR, reduce: reduce,
    bubbles: bubbles, tape: tape, tilt: tilt, parallax: parallax, totop: totop,
    velocitySkew: velocitySkew, rail: rail, scramble: scramble,
    cardParallax: cardParallax, magneticText: magneticText, floatIcons: floatIcons,
    labSetReduced: function (value) { reduce = Boolean(value); Q3.reduce = reduce; },
    setTheme: setTheme, openSponsor: openSponsor, openNote: openNote, closeNote: closeNote,
    scheduleNoteClose: scheduleNoteClose, cancelNoteClose: cancelNoteClose,
    openMusic: openMusic, closeMusic: closeMusic,
    me: function () { return AUTH_ME; },
    token: authToken, authHeader: authHeader, openAuth: openAuth, refreshMe: refreshMe,
    rememberReplies: rememberReplies,
  };
  /* ── 雷霆语录评论区（2026-10-19，无人机验证）────────────────────
     接口：POST /qq-agent/api/reply  {target:'holyshits', id, nickname, text}
     后端已去掉验证码校验，改由「同 IP 对同一条 20 秒冷却」防刷。 */
  var _CMT = { data: {} };

  function cmtKey(id) { return 'qqa-cmts-' + id; }
  function cmtList(id) {
    try { return JSON.parse(localStorage.getItem(cmtKey(id)) || '[]') || []; } catch (e) { return []; }
  }
  function cmtSave(id, arr) {
    try { localStorage.setItem(cmtKey(id), JSON.stringify(arr.slice(-100))); } catch (e) {}
  }
  function cmtNick() {
    try { return localStorage.getItem('qqa-nick') || ''; } catch (e) { return ''; }
  }

  // 服务端已有评论（replies）要和本地新发的合并显示，否则旧评论「消失」。
  // 列表接口已经带 replies，pages.js 渲染卡片时通过 rememberReplies() 灌进来。
  function rememberReplies(id, replies) {
    if (id && replies && replies.length) _CMT.data[id] = replies;
  }

  function renderCmtBox(host, id) {
    var seen = {}, merged = [];
    // 先服务端（灌进来的），再本地新发的，按时间去重
    ((_CMT.data[id] || []).concat(cmtList(id))).forEach(function (r) {
      if (!r || !r.at) return;
      var duplicate = merged.some(function (prior) {
        if (r.id && prior.id) return r.id === prior.id;
        return r.nickname === prior.nickname && r.text === prior.text && Math.abs(r.at-prior.at) < 5000;
      });
      if (!duplicate) merged.push(r);
    });
    merged.sort(function (a, b) { return a.at - b.at; });
    _CMT.data[id] = merged;
    host.innerHTML =
      (merged.length ? merged.map(function (r) {
        return '<div class="cmt-row"><b>' + esc(r.nickname || '匿名') + '</b><span>' + esc(r.text || '') + '</span></div>';
      }).join('') : '<div class="cmt-empty">还没有评论，来说第一句</div>') +
      '<div class="cmt-form">' +
        '<input class="cmt-nick" maxlength="32" placeholder="你的昵称" value="' + esc(cmtNick()) + '" />' +
        '<input class="cmt-text" maxlength="500" placeholder="说点什么…" />' +
        '<button class="cmt-send" type="button" data-send="' + esc(id) + '">发送</button>' +
      '</div>';
  }

  function bindComments() {
    document.addEventListener('click', function (e) {
      var tg = e.target.closest && e.target.closest('.cmt-toggle');
      if (tg) {
        var id = tg.dataset.cmt;
        var box = document.getElementById('cmt-' + id);
        if (!box) return;
        if (!box.hidden) { box.hidden = true; tg.classList.remove('on'); return; }
        box.hidden = false; tg.classList.add('on');
        renderCmtBox(box, id);
        return;
      }
      var sb = e.target.closest && e.target.closest('[data-send]');
      if (!sb) return;
      var sid = sb.dataset.send;
      var bx = document.getElementById('cmt-' + sid);
      if (!bx) return;
      var nick = (bx.querySelector('.cmt-nick').value || '').trim();
      var txt = (bx.querySelector('.cmt-text').value || '').trim();
      if (!nick) { toast('先填个昵称'); return; }
      if (!txt) { toast('评论不能为空'); return; }
      sb.disabled = true; sb.textContent = '发送中…';
      fetch('/qq-agent/api/reply', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: 'holyshits', id: sid, nickname: nick, text: txt })
      }).then(function (r) {
        var ct = r.headers.get('content-type') || '';
        if (!r.ok || ct.indexOf('json') === -1) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (d) {
        if (!d || d.ok === false) throw new Error((d && d.error) || '发送失败');
        try { localStorage.setItem('qqa-nick', nick); } catch (err) {}
        var arr = cmtList(sid);
        if (d.reply) arr.push(d.reply);
        cmtSave(sid, arr);
        bx.querySelector('.cmt-text').value = '';
        renderCmtBox(bx, sid);
        toast('评论已发布');
      }).catch(function (err) {
        toast('发送失败：' + ((err && err.message) || err));
      }).then(function () { sb.disabled = false; sb.textContent = '发送'; });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !e.target.classList || !e.target.classList.contains('cmt-text')) return;
      var bx = e.target.closest('.cmt-box');
      var send = bx && bx.querySelector('[data-send]');
      if (send) send.click();
    });
  }

  /* ══ 账号系统（2026-10-19 恢复并全站贯彻）═════════════════════
     接口沿用旧版（后端未变，账号数据一直在）：
       POST /api/community/auth/register  {loginId, displayName, password} -> {token, account}
       POST /api/community/auth/login     {loginId, password}                 -> {token, account}
       GET  /api/community/auth/whoami     (X-Account-Token 头)              -> {account}
     token 存 localStorage['qqa-market-token']，与旧版 u/ 页共用同一个 key。
     ══════════════════════════════════════════════════════════════ */
  var AUTH_API = '/api/community';
  var AUTH_KEY = 'qqa-market-token';
  var AUTH_MODE = 'login';
  var AUTH_ME = null;

  function authToken() {
    try { return localStorage.getItem(AUTH_KEY) || ''; } catch (e) { return ''; }
  }

  function setAuthBar() {
    var box = qs('#navUser');
    if (!box) return;
    if (AUTH_ME) {
      var nm = AUTH_ME.displayName || AUTH_ME.username || AUTH_ME.loginId || '我';
      var uid = AUTH_ME.id || '';
      box.innerHTML =
        '<a class="nav-ubtn nav-ubtn-me" href="' + BASE + 'u/' + encodeURIComponent(uid) + '" title="我的主页">' +
          '<span class="nav-ava">' + esc(String(nm).slice(0, 1).toUpperCase()) + '</span>' +
          '<span class="nav-uname">' + esc(nm) + '</span>' +
        '</a>' +
        '<button class="nav-ubtn nav-uout" id="navLogout" type="button" title="退出登录">登出</button>';
      var lo = qs('#navLogout');
      if (lo) lo.addEventListener('click', function () {
        var token = authToken();
        lo.disabled = true;
        fetch(AUTH_API + '/auth/logout', { method: 'POST', headers: { 'X-Account-Token': token } })
          .then(function (r) { if (!r.ok) throw new Error('撤销未确认'); return r.json(); })
          .then(function (d) { if (!d.ok) throw new Error('撤销未确认'); toast('已退出登录'); })
          .catch(function () { toast('本机已退出；服务器凭据撤销未确认，请检查网络'); })
          .then(function () {
            try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
            AUTH_ME = null;
            setAuthBar();
            document.dispatchEvent(new Event('q3:auth'));
          });
      });
    } else {
      box.innerHTML = '<button class="nav-ubtn nav-ulog" id="navLogin" type="button">登录 / 注册</button>';
      var li = qs('#navLogin');
      if (li) li.addEventListener('click', function () { openAuth('login'); });
    }
  }

  function openAuth(mode) {
    AUTH_MODE = mode || 'login';
    var old = qs('#authModal');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.className = 'modal auth-modal';
    ov.id = 'authModal';
    ov.innerHTML =
      '<div class="modal-box auth-box">' +
        '<button class="modal-x" type="button" aria-label="关闭">×</button>' +
        '<div class="auth-tabs">' +
          '<button class="auth-tab' + (AUTH_MODE === 'login' ? ' on' : '') + '" data-mode="login" type="button">登录</button>' +
          '<button class="auth-tab' + (AUTH_MODE === 'register' ? ' on' : '') + '" data-mode="register" type="button">注册</button>' +
        '</div>' +
        '<label class="auth-f"><span>登录 ID</span>' +
          '<input id="amLoginId" maxlength="32" placeholder="邮箱或用户名" autocomplete="username" /></label>' +
        '<label class="auth-f" id="amDnWrap"><span>展示用户名</span>' +
          '<input id="amDisplayName" maxlength="32" placeholder="别人看到的名字" /></label>' +
        '<label class="auth-f"><span>密码</span>' +
          '<input id="amPassword" type="password" maxlength="64" autocomplete="current-password" /></label>' +
        '<label class="auth-f" id="amPw2Wrap"><span>确认密码</span>' +
          '<input id="amPassword2" type="password" maxlength="64" autocomplete="new-password" /></label>' +
        '<div class="auth-err" id="amErr"></div>' +
        '<button class="auth-go" id="amGo" type="button">确认登录</button>' +
        '<p class="auth-tip">登录后可以发布插件 / Skill / 人设，并在全站看到「我发布的」。</p>' +
      '</div>';
    document.body.appendChild(ov);

    var dn = qs('#amDnWrap'), pw2 = qs('#amPw2Wrap'), go = qs('#amGo');
    var setMode = function (m) {
      AUTH_MODE = m;
      dn.style.display = (m === 'register') ? '' : 'none';
      pw2.style.display = (m === 'register') ? '' : 'none';
      go.textContent = (m === 'login') ? '确认登录' : '确认注册';
      qsa('.auth-tab', ov).forEach(function (t) { t.classList.toggle('on', t.dataset.mode === m); });
    };
    setMode(AUTH_MODE);

    qsa('.auth-tab', ov).forEach(function (t) {
      t.addEventListener('click', function () { setMode(t.dataset.mode); });
    });
    ov.querySelector('.modal-x').addEventListener('click', function () { ov.remove(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });

    var submit = function () {
      var loginId = qs('#amLoginId').value.trim();
      var pw = qs('#amPassword').value;
      var dn2 = qs('#amDisplayName').value.trim();
      var pw2v = qs('#amPassword2').value;
      var err = qs('#amErr');
      err.textContent = '';
      if (!loginId || !pw) { err.textContent = '登录 ID 和密码都要填'; return; }
      if (AUTH_MODE === 'register') {
        if (!dn2) { err.textContent = '展示用户名不能为空'; return; }
        if (pw !== pw2v) { err.textContent = '两次输入的密码不一致'; return; }
      }
      go.disabled = true; go.textContent = '处理中…';
      var body = (AUTH_MODE === 'login') ? { loginId: loginId, password: pw }
                                       : { loginId: loginId, displayName: dn2, password: pw };
      fetch(AUTH_API + (AUTH_MODE === 'login' ? '/auth/login' : '/auth/register'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || d.ok === false) throw new Error((d && d.error) || '操作失败');
          try { localStorage.setItem(AUTH_KEY, d.token); } catch (e) {}
          AUTH_ME = d.account;
          ov.remove();
          setAuthBar();
          document.dispatchEvent(new Event('q3:auth'));
          toast((AUTH_MODE === 'login' ? '欢迎回来，' : '注册成功，') +
                (d.account.displayName || d.account.username || ''));
        })
        .catch(function (e) { err.textContent = (e && e.message) || '失败'; })
        .then(function () { go.disabled = false; go.textContent = (AUTH_MODE === 'login' ? '确认登录' : '确认注册'); });
    };
    go.addEventListener('click', submit);
    qs('#amPassword').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    qs('#amPassword2').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    qs('#amLoginId').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });

    gsap.fromTo(ov.querySelector('.auth-box'), { y: 18, opacity: 0, scale: .97 },
      { y: 0, opacity: 1, scale: 1, duration: .34, ease: 'power3.out' });
    setTimeout(function () { var input = qs('#amLoginId'); if (input) input.focus(); }, 120);
  }

  function refreshMe() {
    var t = authToken();
    if (!t) { AUTH_ME = null; setAuthBar(); return Promise.resolve(null); }
    return fetch(AUTH_API + '/auth/whoami', { headers: { 'X-Account-Token': t }, cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) AUTH_ME = d.account;
        else { AUTH_ME = null; try { localStorage.removeItem(AUTH_KEY); } catch (e) {} }
      })
      .catch(function () { AUTH_ME = null; })
      .then(function () { setAuthBar(); return AUTH_ME; });
  }

  /* 给各页面用：Q3.me() 取当前账号，Q3.authHeader() 生成带 token 的请求头 */
  function authHeader(extra) {
    var h = extra || {};
    var t = authToken();
    if (t) h['X-Account-Token'] = t;
    return h;
  }

  function bindAuth() {
    setAuthBar();
    var ready = refreshMe();
    document.addEventListener('q3:auth', function () {
      if (PAGE === 'profile') renderPage('profile');
    });
    // 切页后如果顶栏被重建，重新挂一次
    document.addEventListener('q3:page', function () { setAuthBar(); });
    return ready;
  }

  window.Q3 = Q3;

  // 页面模块通过 Q3.page(fn) 注册渲染函数
  Q3._pending = null;
  Q3.page = function (fn) { Q3._pending = fn; window.__Q3_PAGE__ = fn; };

  // 浏览器前进/后退：同文档重渲染
  window.addEventListener('popstate', function () {
    if (!window.__Q3_PAGES__) return;
    var k = keyFromUrl(location.href);
    if (k) transition(k, location.href, { history: false });
  });

  // 字体就绪后再跑，避免 SplitText 量错行
  function start() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(boot);
    } else {
      boot();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // 保险：3 秒后仍未 boot 完就撤掉遮幕
  setTimeout(function () {
    var v = qs('.veil');
    if (v && v.style.display !== 'none' && document.documentElement.classList.contains('k-hold')) {
      v.style.display = 'none';
      document.documentElement.classList.remove('k-hold');
    }
  }, 3000);
})();

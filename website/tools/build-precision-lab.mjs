import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { transformLocalNavigation } from './local-navigation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'qq-agent');
const output = path.join(site, 'lab/generated');
const originalCore = await readFile(path.join(site, 'assets/qa3/core.a9da0a874cb0.js'), 'utf8');
const originalPages = await readFile(path.join(site, 'assets/qa3/pages.8c6bfc7966d4.js'), 'utf8');
let core = originalCore.replace(/\r\n/g, '\n');
let pages = originalPages.replace(/\r\n/g, '\n');

function once(text, before, after) {
  if (text.split(before).length !== 2) throw new Error('Upstream source changed: ' + before.slice(0, 90));
  return text.replace(before, after);
}

// Keep original content, data and community behavior. Homepage motion belongs
// exclusively to lab/choreography.js through the disposable owner below.
core = once(core, "var BASE = SELF.replace(/assets\\/qa3\\/core(?:\\.[a-f0-9]+)?\\.js.*$/, '');", "var BASE = location.origin + '/qq-agent/';");
core = once(core, "var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;", "var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || Boolean(window.__LAB_MOTION_OFF__);");
core = once(core, "'thanks.html': 'thanks',", "'thanks.html': 'thanks', 'lab': 'home',");
core = once(core, "{ k: 'home', href: 'index.html', label: '首页' }", "{ k: 'home', href: 'lab/index.html', label: '首页' }");
core = core.replaceAll("BASE + 'index.html", "BASE + 'lab/index.html");
core = once(core,
  "    if (window.ScrollTrigger) ScrollTrigger.getAll().forEach(function (t) { t.kill(); });",
  "    if (window.ScrollTrigger) ScrollTrigger.getAll().forEach(function (t) {\n      if (!window.__LAB_BG_TRIGGERS__ || !window.__LAB_BG_TRIGGERS__.has(t)) t.kill();\n    });");

// Community pages retain the original reveals. Homepage choreography supplies
// its own section transitions; the persistent totop and environment stay global.
core = once(core, '      revealAll();', "      if (key !== 'home') revealAll();");
core = once(core,
  "      velocitySkew('.hero-title, .sec-head h2, .step-left .big, .cta h2, .phead h1, .h2', 2);",
  "      if (key !== 'home') velocitySkew('.hero-title, .sec-head h2, .step-left .big, .cta h2, .phead h1, .h2', 2);");

// Its completed transform would otherwise contain the fixed hero canvas.
core = once(core,
  "gsap.from('#view', { opacity: 0, y: 10, duration: .7, ease: 'power2.out', delay: .05 });",
  "gsap.from('#view', { opacity: 0, y: 10, duration: .7, ease: 'power2.out', delay: .05, clearProps: 'transform,opacity' });");
core = once(core, '    setTheme: setTheme, openSponsor:', '    labSetReduced: function (value) { reduce = Boolean(value); Q3.reduce = reduce; },\n    setTheme: setTheme, openSponsor:');
core = once(core,
  "    window.addEventListener('mousemove', function (e) {\n      c.style.opacity = 1;",
  "    window.addEventListener('mousemove', function (e) {\n      if (reduce) { c.style.opacity = 0; return; }\n      c.style.opacity = 1;");

// Retain a public owner for choreography initialization and future asynchronous
// callbacks. Data loading and user events also retain their navigation guard.
const homeOwner = `  function home() {
    var epoch = Q.epoch();
    var context = gsap.context(function () {}, qs('#view'));
    var disposed = false;
    var owner = {
      epoch: epoch,
      run: function (callback) {
        if (disposed || !Q.isCurrent(epoch)) return;
        var result;
        context.add(function () { result = callback(); });
        return result;
      },
      safe: function (callback) {
        return function () {
          var scope = this, args = arguments;
          return owner.run(function () { return callback.apply(scope, args); });
        };
      },
      dispose: function () {
        if (disposed) return;
        disposed = true;
        try { context.revert(); }
        finally { if (Q.__homeMotion === owner) Q.__homeMotion = null; }
      }
    };
    Q.__homeMotion = owner;
    Q.onDispose(owner.dispose);
    return owner.run(function () { return homeContent(owner); });
  }

  function homeContent(motion) {`;
pages = once(pages, '  function home() {', homeOwner);

const motionStart = pages.indexOf('    // 首屏：整块平滑上浮，跟手、不炸帧');
const motionEnd = pages.indexOf("    return Q.load('telemetry')", motionStart);
if (motionStart < 0 || motionEnd < motionStart || motionEnd - motionStart < 4000) throw new Error('Home motion boundaries changed');
const originalMotion = pages.slice(motionStart, motionEnd);
if (!originalMotion.includes('    watchProgress();\n    stepsScroll();')) throw new Error('Homepage progress and steps boundaries changed');
pages = pages.slice(0, motionStart) + '    // lab/choreography.js owns homepage animation and section progression.\n\n' + pages.slice(motionEnd);

const originalTelemetry = `    return Q.load('telemetry').then(function (t) {
      if (!Q.isCurrent(epoch)) return;
      fillStats(t);
      fillTools(t);
    }).catch(function () {
      var g = qs('#statGrid');
      if (g) g.innerHTML = '<div class="empty-note" style="grid-column:1/-1">遥测数据暂时取不到</div>';
      var tl = qs('#tools');
      if (tl) tl.innerHTML = '<div class="empty-note">工具明细暂时取不到</div>';
    });`;
const ownedTelemetry = `    return Q.load('telemetry').then(motion.safe(function (t) {
      if (!Q.isCurrent(epoch)) return;
      fillStats(t);
      fillTools(t, motion);
    })).catch(motion.safe(function () {
      var g = qs('#statGrid');
      if (g) g.innerHTML = '<div class="empty-note" style="grid-column:1/-1">遥测数据暂时取不到</div>';
      var tl = qs('#tools');
      if (tl) tl.innerHTML = '<div class="empty-note">工具明细暂时取不到</div>';
    }));`;
pages = once(pages, originalTelemetry, ownedTelemetry);

const statsStart = pages.indexOf('  function fillStats(t) {');
const statsEnd = pages.indexOf('  function fillTools(t) {', statsStart);
if (statsStart < 0 || statsEnd < statsStart) throw new Error('Stats helper boundaries changed');
pages = pages.slice(0, statsStart) + `  function fillStats(t) {
    if (!t || !t.ok) throw new Error('no telemetry');
    var data = [[t.users, fmt, 1], [t.calls, fmt, 1], [t.inputTokens, Q.compact, .82], [t.outputTokens, Q.compact, .62]];
    qsa('#statGrid .stat-cell').forEach(function (cell, index) {
      cell.querySelector('b').textContent = data[index][1](data[index][0]);
      cell.querySelector('.bar i').style.transform = 'scaleX(' + data[index][2] + ')';
    });
  }

` + pages.slice(statsEnd);
pages = once(pages, '  function fillTools(t) {', '  function fillTools(t, motion) {');
const originalMoreClick = `      qs('#moreBtn').addEventListener('click', function () {
        var g = qs('#commGrid'), open = g.classList.toggle('open');
        this.innerHTML = (open ? '收起' : '展开全部') + ' <span class="n">' + Math.round(csum / total * 100) + '%</span>';
        if (open && !Q.reduce) gsap.from(g.children, { opacity: 0, y: 6, duration: .32, stagger: .008, ease: 'power2.out' });
      });`;
pages = once(pages, originalMoreClick,
  originalMoreClick
    .replace("addEventListener('click', function () {", "addEventListener('click', motion.safe(function () {")
    .replace("        if (open && !Q.reduce) gsap.from(g.children, { opacity: 0, y: 6, duration: .32, stagger: .008, ease: 'power2.out' });", '        if (window.ScrollTrigger) ScrollTrigger.refresh();')
    .replace('      });', '      }));'));

const barsStart = pages.indexOf('    // 条形：平滑长出');
const barsEnd = pages.indexOf('  function watchProgress() {', barsStart);
if (barsStart < 0 || barsEnd < barsStart) throw new Error('Tool bar helper boundaries changed');
pages = pages.slice(0, barsStart) + `    qsa('.trow .tbar', box).forEach(function (bar) {
      bar.style.transform = 'scaleX(' + parseFloat(bar.dataset.w) + ')';
    });
  }

` + pages.slice(barsEnd);

pages = pages.replaceAll('https://kondius.cn/qq-agent/comment/', '/qq-agent/comment/');
core = transformLocalNavigation(core);
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'core.js'), core);
await writeFile(path.join(output, 'pages.js'), pages);
await writeFile(path.join(output, 'provenance.json'), JSON.stringify({
  originalCore: 'assets/qa3/core.a9da0a874cb0.js', originalPages: 'assets/qa3/pages.8c6bfc7966d4.js',
  coreSha256: createHash('sha256').update(originalCore).digest('hex'), pagesSha256: createHash('sha256').update(originalPages).digest('hex'),
  changes: [
    'Experimental home route and original resource base',
    'Original homepage animation and progress calls removed; lab/choreography.js owns homepage motion',
    'Original homepage data and interaction behavior retained with static telemetry and tool bar values',
    'Community reveals and velocity skew retained; homepage post-render effects delegated to choreography',
    'Homepage owner supports synchronous and asynchronous choreography with disposable GSAP context',
    'Original magnetic text window listener uses page disposal',
    'Page transitions preserve the explicitly captured ambient background ScrollTriggers',
    'Local opacity-only view entrance leaves no transformed container around the fixed hero canvas',
    'Runtime reduced-motion setter retained for the local control',
    'Local navigation choreographs real titles and content in depth, with transparent portal lines, serial rendering, latest-target coalescing, reduced-motion and interruption cleanup',
    'Legacy community reveal contexts and velocity quickTo tweens are explicitly disposed on route changes',
  ],
  ownership: { interface: 'Q3.__homeMotion', methods: ['run(callback)', 'safe(callback)', 'dispose()'], epochGuard: true, cleanup: 'Q3.onDispose -> GSAP context.revert()', homepage: 'lab/choreography.js owns matchMedia timelines and registers Q3.onDispose cleanup independently of the original data context', threeScene: 'External __HERO3D__ init/dispose owns its renderer and listeners' },
}, null, 2));
console.log('Precision lab bases generated for unified homepage choreography; original content, community behavior and source assets retained.');

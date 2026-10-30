// Local response/build transform. Downloaded source assets remain unchanged.
import { readFileSync } from 'node:fs';
export const localNavigationMarker = 'LOCAL_SPATIAL_NAVIGATION_V3';
const material = readFileSync(new URL('../qq-agent/lab/navigation-stage.css', import.meta.url), 'utf8');

function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error('Local navigation: upstream boundary changed: ' + before.slice(0, 70));
  return text.replace(before, after);
}
export function transformLocalNavigation(source) {
  if (source.includes(localNavigationMarker)) return source;
  let text = source.replace(/\r\n/g, '\n');
  const start = text.indexOf('  function transition(key, url) {');
  const end = text.indexOf('  /* ── 顶栏高亮：', start);
  if (start < 0 || end < start || end - start < 1500) throw new Error('Local navigation: upstream transition changed');
  text = text.slice(0, start) + navigationSource + '\n\n' + text.slice(end);
  text = text.replace('切页转场：斜切色带扫过，扫满时换内容', '本地切页：标题与正文的空间接力');
  text = replaceOnce(text, '    if (k) { setNavActive(k); renderPage(k); }',
    "    if (k) transition(k, location.href, { history: false });");
  text = replaceOnce(text, '    var next = new URL(url, location.href);',
    '    var next = new URL(url, location.href);\n    if (localNavigation.running) { transition(key, next.href); return; }');
  text = replaceOnce(text, "      document.dispatchEvent(new Event('q3:page'));",
    "      if (localNavigation.layer) qsa('.phead h1').forEach(function (heading) { heading.__an = 1; });\n      document.dispatchEvent(new Event('q3:page'));");

  // Own the legacy community entrances: plain/paused tweens are not killed by ST.
  const revealStart = text.indexOf('  function revealAll(scope) {');
  const revealEnd = text.indexOf('  /* ── 数字滚动', revealStart);
  if (revealStart < 0 || revealEnd < revealStart) throw new Error('Local navigation: reveal boundaries changed');
  let reveal = text.slice(revealStart, revealEnd);
  reveal = replaceOnce(reveal, '  function revealAll(scope) {',
    '  function revealAll(scope) {\n    var entranceOwner = gsap.context(function () {');
  reveal = replaceOnce(reveal, '\n  }\n\n',
    "\n    }, scope || qs('#view'));\n    onDispose(function () { entranceOwner.revert(); });\n  }\n\n");
  reveal = replaceOnce(reveal,
    "      var near = el.getBoundingClientRect().top < vh * 1.05;",
    "      var near = el.getBoundingClientRect().top < vh * 1.05;\n      if (localNavigation.layer && near) return;");
  reveal = replaceOnce(reveal, "      var st = new SplitText(el, { type: 'chars', charsClass: 'chx' });",
    "      if (localNavigation.layer && el.getBoundingClientRect().top < vh * 1.05) return;\n      var st = new SplitText(el, { type: 'chars', charsClass: 'chx' });");
  reveal = replaceOnce(reveal,
    "      var near = el.getBoundingClientRect().top < vh * .96;",
    "      var near = el.getBoundingClientRect().top < vh * .96;\n      if (localNavigation.layer && near) return;");
  text = text.slice(0, revealStart) + reveal + text.slice(revealEnd);
  text = replaceOnce(text,
    "      var to = gsap.quickTo(el, 'skewY', { duration: .45, ease: 'power2.out' });",
    "      var to = gsap.quickTo(el, 'skewY', { duration: .45, ease: 'power2.out' });\n      onDispose(function () { to.tween.kill(); });");

  // The comparison homepage also mounts loops and paused quickTo tweens.
  // Keep their lifetime attached to that page, including on a short visit.
  text = replaceOnce(text,
    "    try { out = fn(); } catch (e) { console.error('[render]', e); out = null; }",
    `    try {
      if (key === 'home') {
        var mountOwner = gsap.context(function () {}, view);
        onDispose(function () { mountOwner.revert(); });
        mountOwner.add(function () { out = fn(); });
      } else out = fn();
    } catch (e) { console.error('[render]', e); out = null; }`);
  const magneticStart = text.indexOf('  function magneticText(sel, amp) {');
  const magneticEnd = text.indexOf('  function floatIcons(sel) {', magneticStart);
  if (magneticStart < 0 || magneticEnd < magneticStart) throw new Error('Local navigation: magnetic text boundaries changed');
  const magnetic = text.slice(magneticStart, magneticEnd);
  text = text.slice(0, magneticStart) + replaceOnce(magnetic,
    "      window.addEventListener('pointermove', function (e) {",
    "      listen(window, 'pointermove', function (e) {") + text.slice(magneticEnd);
  // Drive speed through a plain value: tweening a Tween can revive a killed loop.
  const tapeStart = text.indexOf('  function tape(sel) {');
  const tapeEnd = text.indexOf('  function tilt(sel) {', tapeStart);
  if (tapeStart < 0 || tapeEnd < tapeStart) throw new Error('Local navigation: tape boundaries changed');
  let tape = text.slice(tapeStart, tapeEnd);
  tape = replaceOnce(tape, '    var mainTween = null, mainBand = null;',
    `    var mainTween = null, mainBand = null, tapeAlive = true;
    var tapeLoops = [], tapeSpeed = { value: 1 }, speedTo = null;
    onDispose(function () {
      tapeAlive = false;
      if (speedTo) speedTo.tween.kill();
      tapeLoops.forEach(function (loop) { loop.kill(); });
      tapeLoops.length = 0;
    });`);
  tape = replaceOnce(tape, '      if (i === bands.length - 1) { mainTween = t; mainBand = band; }',
    '      tapeLoops.push(t);\n      if (i === bands.length - 1) { mainTween = t; mainBand = band; }');
  tape = replaceOnce(tape, '    if (reduce || !mainTween) return;',
    `    if (reduce || !mainTween) return;
    speedTo = gsap.quickTo(tapeSpeed, 'value', {
      duration: .5, ease: 'power1.out',
      onUpdate: function () { if (tapeAlive) mainTween.timeScale(tapeSpeed.value); }
    });`);
  tape = replaceOnce(tape, '        var v = Math.abs(self.getVelocity());',
    '        if (!tapeAlive) return;\n        var v = Math.abs(self.getVelocity());');
  tape = replaceOnce(tape, '        gsap.to(mainTween, { timeScale: 1 + Math.min(v / 1400, 2.4), duration: .5, overwrite: true });',
    '        speedTo(1 + Math.min(v / 1400, 2.4));');
  text = text.slice(0, tapeStart) + tape + text.slice(tapeEnd);
  const entrance = /gsap\.from\('#view', \{[^\n]+\}\);/g;
  if ([...text.matchAll(entrance)].length !== 1) throw new Error('Local navigation: view entrance changed');
  text = text.replace(entrance, "gsap.from('#view', { opacity: 0, duration: reduce ? 0 : .24, ease: 'power1.out', clearProps: 'opacity' });");
  return text;
}

// Source template inserted inside the Q3 closure. #view never gets a transform.
function navigationTemplate() {
  // LOCAL_SPATIAL_NAVIGATION_V3
  var localNavigationCSS = '__LOCAL_NAVIGATION_MATERIAL__';
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
}
const body = navigationTemplate.toString();
const navigationSource = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}'))
  .replace("'__LOCAL_NAVIGATION_MATERIAL__'", JSON.stringify(material));


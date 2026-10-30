(function () {
  'use strict';
  function boot() {
    if (!window.Q3 || document.body.dataset.page !== 'home') return;
    if (window.__LAB_STORY__ && window.__LAB_STORY__.epoch === Q3.epoch()) return;
    var Q = window.Q3, view = document.querySelector('#view'), epoch = Q.epoch();
    var $ = function (selector, root) { return (root || view).querySelector(selector); };
    var $$ = function (selector, root) { return Array.from((root || view).querySelectorAll(selector)); };
    var mm = gsap.matchMedia(), disposed = false, introduced = false, refreshTimer, rebuildTimer, ribbonOwner = null;
    var story = window.__LAB_STORY__ = { epoch: epoch, chapters: {}, mode: 'full', transition: 'architectural', refreshCount: 0 };
    function refresh() {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () {
        if (!disposed && Q.isCurrent(epoch)) { ScrollTrigger.refresh(); story.refreshCount++; }
      }, 140);
    }
    function splitLines(heading) {
      if (!heading || heading.querySelector('.story-line')) return;
      heading.setAttribute('aria-label', heading.innerText.replace(/\s+/g, ' '));
      heading.innerHTML = heading.innerHTML.split(/<br\s*\/?>/i).map(function (line) {
        return '<span class="story-line"><span>' + line + '</span></span>';
      }).join('');
    }
    $$('.sec-head h2').forEach(splitLines);
    var dataGrid = $('.stats-grid'), dataShell = document.createElement('div'), dataFrame = document.createElement('div');
    dataShell.className = 'story-data-shell';
    dataFrame.className = 'story-data-frame';
    dataFrame.dataset.spectacle = 'data-aperture'; dataFrame.setAttribute('aria-hidden', 'true');
    dataFrame.innerHTML = '<i></i><i></i><span>LIVE / TELEMETRY</span>';
    dataGrid.before(dataShell); dataShell.appendChild(dataFrame); dataShell.appendChild(dataGrid);
    var cap = $('#caps'), stage = document.createElement('div');
    stage.className = 'story-caps-stage';
    while (cap.firstChild) stage.appendChild(cap.firstChild);
    cap.appendChild(stage);
    var deck = $('.bento'), cards = $$('.ben'), windowEl = document.createElement('div');
    windowEl.className = 'story-cap-window'; deck.before(windowEl); windowEl.appendChild(deck);
    for (var panelIndex = 0; panelIndex < 2; panelIndex++) {
      var panel = document.createElement('div'); panel.className = 'story-cap-panel';
      cards.slice(panelIndex * 4, panelIndex * 4 + 4).forEach(function (card) { panel.appendChild(card); });
      deck.appendChild(panel);
    }
    var meter = document.createElement('div'); meter.className = 'story-cap-meter'; meter.setAttribute('aria-hidden', 'true');
    meter.innerHTML = '<i></i>'.repeat(8); stage.appendChild(meter);
    var bridge = document.createElement('div'); bridge.className = 'story-bridge'; bridge.setAttribute('aria-hidden', 'true');
    bridge.dataset.spectacle = 'gateway';
    bridge.innerHTML = '<span>CAPABILITIES</span>'; cap.before(bridge);
    var spine = document.createElement('span'); spine.className = 'story-step-spine'; spine.setAttribute('aria-hidden', 'true');
    spine.innerHTML = '<i></i>'; $('.steps').prepend(spine);
    $$('.why-item').forEach(function (item) { var line = document.createElement('i'); line.className = 'story-why-line'; line.setAttribute('aria-hidden', 'true'); item.appendChild(line); });
    var act = $('#sec-act'), actStage = document.createElement('div'); actStage.className = 'story-act-stage';
    actStage.dataset.spectacle = 'cta-aperture';
    while (act.firstChild) actStage.appendChild(act.firstChild);
    actStage.insertAdjacentHTML('afterbegin', '<i class="story-cta-orbit" aria-hidden="true"></i>'); act.appendChild(actStage);
    var navProgress = document.createElement('span'); navProgress.className = 'nav-prog'; navProgress.setAttribute('aria-hidden', 'true');
    document.querySelector('.nav-in').appendChild(navProgress);
    var ribbonSources = $$('.tape-in').map(function (inner) { return { inner: inner, html: inner.innerHTML }; });

    function mountRibbon() {
      var loops = [], alive = true, trigger, speedTo;
      ribbonSources.forEach(function (source, index) {
        // Always derive from the original text; resizing must not double it again.
        source.inner.innerHTML = source.html + source.html;
        var width = source.inner.scrollWidth / 2;
        if (width) loops.push(gsap.to(source.inner, { x: -width, duration: width / (index ? 62 : 34), ease: 'none', repeat: -1, paused: true }));
      });
      if (loops.length) {
        // Create the speed tween inside the owning media context. Creating a new
        // tween from onUpdate can revive a detached loop after context rollback.
        var speed = { value: 1 }, mainLoop = loops[loops.length - 1];
        speedTo = gsap.quickTo(speed, 'value', { duration: .5, ease: 'power2.out',
          onUpdate: function () { if (alive) mainLoop.timeScale(speed.value); }
        });
        trigger = ScrollTrigger.create({
          id: 'lab-story-ribbon-loop', trigger: $('.tape-wrap'), start: 'top bottom', end: 'bottom top',
          onToggle: function (self) { if (alive) loops.forEach(function (loop) { loop.paused(!self.isActive); }); },
          onUpdate: function (self) { if (alive && self.isActive) speedTo(1 + Math.min(Math.abs(self.getVelocity()) / 1400, 2.4)); }
        });
        loops.forEach(function (loop) { loop.paused(!trigger.isActive); });
      }
      var owner = { dispose: function () {
        if (!alive) return;
        alive = false;
        if (trigger) trigger.kill();
        if (speedTo) speedTo.tween.kill();
        loops.forEach(function (loop) { loop.kill(); });
        ribbonSources.forEach(function (source) { source.inner.innerHTML = source.html; });
        if (ribbonOwner === owner) ribbonOwner = null;
      } };
      ribbonOwner = owner;
      return owner;
    }

    function disposeRibbon() { if (ribbonOwner) ribbonOwner.dispose(); }

    function chapter(id, options) {
      options.id = 'lab-story-' + id;
      var timeline = gsap.timeline({ scrollTrigger: options });
      story.chapters[id] = timeline.scrollTrigger;
      return timeline;
    }
    function headReveal(section, id) {
      return chapter(id, { trigger: section, start: 'top 94%', end: 'top 47%', scrub: .45 })
        .fromTo($$('.story-line>span', section), { yPercent: 105 }, { yPercent: 0, duration: 1, stagger: .065, ease: 'power2.out' })
        .fromTo($$('.sec-num,.sec-head .note', section), { y: 18, opacity: .35 }, { y: 0, opacity: 1, duration: .7, stagger: .07 }, .12);
    }
    function configure(context) {
      var reduced = context.conditions.reduce, compact = context.conditions.compact;
      var low = document.documentElement.dataset.perf === 'low';
      story.mode = reduced ? 'reduced' : low ? 'low' : 'full';
      document.body.dataset.storyMode = story.mode;
      document.body.dataset.storyCaps = 'candidate';
      story.chapters = {};
      story.capsPinned = false;
      if (reduced || low) {
        document.body.dataset.storyCaps = 'flow';
        gsap.set($$('.tbar'), { scaleX: function (_, el) { return Number(el.dataset.w); } });
        return;
      }
      var hero = $('.hero'), titleLines = $$('.hero-title .li');
      if (!introduced) {
        introduced = true;
        var intro = gsap.timeline({ delay: .18, defaults: { ease: 'power3.out' } });
        intro.fromTo(titleLines, { yPercent: 78, scale: .96, opacity: 0 }, { yPercent: 0, scale: 1, opacity: 1, duration: 1.2, stagger: .12 })
        .fromTo($('.hero-eyebrow'), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: .9 }, .08)
        .fromTo($('.hero-sub'), { y: 44, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1 }, .5)
        .fromTo($$('.spec-row'), { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: .9, stagger: .07 }, .65)
        .fromTo($('.hero-scale'), { scaleX: 0 }, { scaleX: 1, duration: 1.4 }, .5);
      }
      // The camera passes the headline at a larger scale, then the following
      // chapter opens its own frame. Nothing fades away to create the hand-off.
      chapter('hero', { trigger: hero, start: 'top top', end: 'bottom top', scrub: .65 })
        .to($('.hero-main'), { y: compact ? -45 : -80, scale: compact ? 1.1 : 1.18, transformOrigin: '50% 20%', ease: 'power1.in', duration: 1 }, 0)
        .to($('.hero-spec'), { y: -48, scale: .96, duration: 1, ease: 'none' }, 0);
      var ribbon = mountRibbon();
      chapter('ribbon', { trigger: $('.tape-wrap'), start: 'top bottom', end: 'bottom top', scrub: .7 })
        .fromTo($('#tape'), { scale: .96, y: 36 }, { scale: 1.025, y: -18, ease: 'none' })
        .fromTo($('.tape.ghost'), { y: 18 }, { y: -18, ease: 'none' }, 0);

      var stats = $('#stats'), cells = $$('.stat-cell');
      headReveal(stats, 'stats');
      chapter('stats-cards', { trigger: dataShell, start: 'top 99%', end: 'top 38%', scrub: .55 })
        .fromTo(dataFrame, { scaleX: .025, scaleY: .045 }, { scaleX: 1, scaleY: .045, duration: .28, ease: 'power3.out' }, 0)
        .to(dataFrame, { scaleY: 1, duration: .48, ease: 'power2.inOut' }, .18)
        .fromTo(cells, { y: compact ? 58 : 110, scale: .94, clipPath: 'inset(0% 0% 100% 0% round 24px)' },
          { y: 0, scale: 1, clipPath: 'inset(0% 0% 0% 0% round 24px)', duration: .55, stagger: .075, ease: 'power3.out' }, .18);
      story.chapters['data-aperture'] = story.chapters['stats-cards'];
      cells.forEach(function (cell, i) {
        gsap.fromTo($('b', cell), { yPercent: 36, scale: 1.08 }, { yPercent: 0, scale: 1, duration: 1.1, ease: 'power3.out', scrollTrigger: { id: 'lab-story-number-' + i, trigger: cell, start: 'top 88%', toggleActions: 'play none none reverse' } });
        gsap.from($(' .bar i', cell), { scaleX: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: cell, start: 'top 80%', toggleActions: 'play none none reverse' } });
      });

      var tools = $('#sec-tools');
      headReveal(tools, 'tools');
      chapter('tools-console', { trigger: $('.toolwrap'), start: 'top 98%', end: 'top 42%', scrub: .55 })
        .fromTo($('.toolwrap'), { y: compact ? 65 : 100, scale: .94, clipPath: 'inset(0% 0% 94% 0% round 30px)' }, { y: 0, scale: 1, clipPath: 'inset(0% 0% 0% 0% round 30px)', ease: 'power3.out' });
      $$('.tool-cat').forEach(function (category, i) {
        gsap.timeline({ scrollTrigger: { id: 'lab-story-tool-cat-' + i, trigger: category, start: 'top 92%', end: 'top 57%', scrub: .5 } })
          .fromTo(category, { y: 32 }, { y: 0, ease: 'power2.out' })
          .fromTo($$('.tbar', category), { scaleX: 0 }, { scaleX: function (_, el) { return Number(el.dataset.w); }, duration: .8, stagger: .06, ease: 'power2.out' }, 0);
      });
      if (window.__LAB_GATEWAY__) {
        var gateway = window.__LAB_GATEWAY__.build({ element: bridge, compact: compact, reduced: reduced,
          scrollTrigger: { id: 'lab-story-gateway', trigger: bridge, start: 'top 92%', end: 'bottom 18%', scrub: .65, invalidateOnRefresh: true } });
        if (gateway) story.chapters.gateway = gateway.scrollTrigger;
      }

      var pinEnabled = innerHeight >= 600 && stage.offsetHeight <= innerHeight - 106;
      story.capsPinned = pinEnabled;
      document.body.dataset.storyCaps = pinEnabled ? 'pinned' : 'flow';
      headReveal(cap, 'caps-heading');
      var capTl = chapter('caps', { trigger: stage, start: pinEnabled ? 'top 88px' : 'top 94%', end: pinEnabled ? function () { return '+=' + Math.round(innerHeight * (compact ? 1.4 : .85)); } : 'top 30%', pin: pinEnabled ? stage : false, scrub: .5, anticipatePin: 1, invalidateOnRefresh: true });
      var capOwner = window.__LAB_CAPABILITY_STAGE__ && window.__LAB_CAPABILITY_STAGE__.build({
        timeline: capTl, window: windowEl, deck: deck, panels: $$('.story-cap-panel'), cards: cards,
        compact: compact, pinned: pinEnabled, reduced: reduced, low: low, context: context
      });
      story.capability = capOwner || null;
      capTl.to($$('i', meter), { opacity: 1, duration: .1, stagger: .08, ease: 'none' }, 0)
        .to({}, { duration: .12 }, .9);

      var steps = $('#sec-steps');
      chapter('steps', { trigger: steps, start: 'top 85%', end: 'top 32%', scrub: .7 })
        .fromTo($('.step-left .big'), { y: 100, scale: .87 }, { y: 0, scale: 1, ease: 'power3.out' });
      gsap.fromTo($('i', spine), { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: $('.steps'), start: 'top 65%', end: 'bottom 55%', scrub: .5 } });
      $$('[data-step]').forEach(function (step, i) {
        var tl = gsap.timeline({ scrollTrigger: { id: 'lab-story-step-' + i, trigger: step, start: 'top 94%', end: 'bottom 14%', scrub: .6, onToggle: function (self) { step.classList.toggle('on', self.isActive); } } });
        tl.fromTo(step, { y: 80, scale: .88, clipPath: 'inset(0% 0% 70% 0% round 28px)' }, { y: 0, scale: 1, clipPath: 'inset(0% 0% 0% 0% round 28px)', duration: .4, ease: 'power3.out' })
          .to(step, { y: -15, scale: .98, duration: .2, ease: 'power1.in' }, .8);
      });

      var why = $('#sec-why');
      headReveal(why, 'why');
      $$('.why-item').forEach(function (item, i) {
        gsap.timeline({ scrollTrigger: { id: 'lab-story-why-' + i, trigger: item, start: 'top 93%', end: 'top 50%', scrub: .65 } })
          .fromTo($('.wn', item), { scale: 1.65, y: 12 }, { scale: 1, y: 0, duration: .8, ease: 'power3.out' })
          .fromTo($$('h3,p', item), { y: 42 }, { y: 0, duration: 1, stagger: .08, ease: 'power3.out' }, .08)
          .fromTo($('.story-why-line', item), { scaleX: 0 }, { scaleX: 1, ease: 'power2.inOut', duration: .85 }, .1);
      });

      chapter('cta', { trigger: act, start: 'top 98%', end: 'top 16%', scrub: .65 })
        .fromTo(actStage, { clipPath: 'inset(0% 47.5% 0% 47.5% round 100px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', duration: .85, ease: 'power2.inOut' }, 0)
        .fromTo($('#sec-act h2'), { y: compact ? 100 : 150, scale: 1.24 }, { y: 0, scale: 1, duration: .8, ease: 'power3.out' }, .1)
        .fromTo($('#sec-act h2>span:first-child'), { xPercent: -12 }, { xPercent: 0, duration: .8, ease: 'power3.out' }, .1)
        .fromTo($('#sec-act h2 .out'), { xPercent: 12 }, { xPercent: 0, duration: .8, ease: 'power3.out' }, .1)
        .fromTo($$('#sec-act p,#sec-act .cta-cta,#sec-act .cta-side'), { y: 60 }, { y: 0, duration: .5, stagger: .06 }, .25);
      gsap.fromTo($('.story-cta-orbit'), { scale: .9, y: 24 }, { scale: 1.05, y: -24, ease: 'none', scrollTrigger: { trigger: act, start: 'top bottom', end: 'bottom top', scrub: .7 } });
      gsap.fromTo(navProgress, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .3 } });
      refresh();
      return function () {
        ribbon.dispose();
        if (capOwner && capOwner.dispose) capOwner.dispose();
        story.capability = null;
      };
    }
    function addMedia() { mm.add({ compact: '(max-width: 760px)', wide: '(min-width: 761px)', reduce: '(prefers-reduced-motion: reduce)' }, configure); }
    function rebuild() { if (disposed) return; disposeRibbon(); mm.revert(); mm = gsap.matchMedia(); addMedia(); refresh(); }
    addMedia();
    var more = $('#moreBtn');
    if (more) Q.listen(more, 'click', refresh);
    Q.listen(document, 'q3:perf', rebuild);
    Q.listen(window, 'resize', function () { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 220); });
    story.dispose = function () {
      if (disposed) return;
      disposed = true; clearTimeout(refreshTimer); clearTimeout(rebuildTimer); disposeRibbon(); mm.revert(); navProgress.remove();
      delete document.body.dataset.storyMode;
      delete document.body.dataset.storyCaps;
      if (window.__LAB_STORY__ === story) window.__LAB_STORY__ = null;
    };
    Q.onDispose(story.dispose);
    document.fonts.ready.then(refresh);
  }
  document.addEventListener('q3:page', boot);
  if (window.__Q3_READY__) boot();
})();

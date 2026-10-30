/* Three stationary light fields, one scroll owner, continuous colour hand-offs. */
(function () {
  'use strict';
  if (window.__LAB_ATMOSPHERE__) return;

  var current = null;
  var sequence = 0;
  var CHAPTERS = [
    { selector: '#stats', weights: [.64, .52, .12], depth: [-.4, .2, .1] },
    { selector: '#sec-tools', weights: [.25, .58, .47], depth: [.1, -.3, 0] },
    { selector: '#caps', weights: [.61, .30, .42], depth: [-.2, .3, -.4] },
    { selector: '#sec-steps', weights: [.52, .55, .16], depth: [.2, 0, .2] },
    { selector: '#sec-why', weights: [.27, .40, .54], depth: [-.1, -.2, -.2] },
    { selector: '#sec-act', weights: [.42, .30, .35], depth: [0, 0, .1] }
  ];

  function disposeCurrent() {
    if (current) current.dispose();
  }

  function mount() {
    var Q = window.Q3;
    if (!Q || document.body.dataset.page !== 'home') {
      disposeCurrent();
      return;
    }
    var epoch = Q.epoch();
    if (current && current.epoch === epoch && !current.disposed) return;
    disposeCurrent();

    var chapters = CHAPTERS.map(function (definition) {
      return { definition: definition, section: document.querySelector(definition.selector) };
    }).filter(function (chapter) { return chapter.section; });
    if (!chapters.length) return;

    var root = document.createElement('div');
    root.className = 'lab-atmosphere';
    root.setAttribute('aria-hidden', 'true');
    root.dataset.mode = 'static';
    root.innerHTML = '<div class="lab-atmosphere__light lab-atmosphere__light--violet"></div>' +
      '<div class="lab-atmosphere__light lab-atmosphere__light--blue"></div>' +
      '<div class="lab-atmosphere__light lab-atmosphere__light--mint"></div>';
    // qbg remains below this z=0 layer; the original product surfaces retain z=1.
    var view = document.querySelector('#view');
    document.body.insertBefore(root, view || document.body.firstChild);
    var lights = Array.prototype.slice.call(root.children);
    var state = {
      epoch: epoch, root: root, media: null, triggers: [], disposed: false,
      mode: 'low', token: ++sequence, fallback: '', anchors: [],
      weights: [0, 0, 0], chapter: 'home'
    };
    current = state;

    function rebuild() {
      if (state.disposed || !Q.isCurrent(epoch)) return;
      if (state.media) { state.media.revert(); state.media = null; }
      state.triggers = [];
      state.anchors = [];
      root.dataset.mode = 'static';
      state.mode = 'low';
      var quality = document.documentElement.dataset.perf || 'high';
      root.dataset.quality = quality;
      // The original environment is the unmodified static fallback.
      if (!window.gsap || !window.ScrollTrigger) { state.fallback = 'motion-library-unavailable'; return; }
      if (quality === 'low') { state.fallback = 'low-performance'; return; }

      var media = state.media = gsap.matchMedia();
      media.add({
        wide: '(min-width: 1000px)', compact: '(max-width: 999px)',
        reduce: '(prefers-reduced-motion: reduce)'
      }, function (context) {
        if (state.disposed || context.conditions.reduce || window.__LAB_MOTION_OFF__ ||
            document.documentElement.classList.contains('lab-motion-off')) {
          root.dataset.mode = 'static';
          state.mode = 'reduced';
          state.fallback = 'reduced-motion';
          return;
        }
        root.dataset.mode = 'animated';
        state.mode = 'full';
        state.fallback = '';
        var depthRange = quality === 'mid' ? 0 : context.conditions.wide ? 12 : 6;
        var intensity = quality === 'mid' ? .76 : context.conditions.wide ? 1 : .84;
        var stops = [], setters = [], opacityTo = [], depthTo = [];
        var last = [], painted = false;
        gsap.set(lights, { opacity: 0, y: 0 });
        lights.forEach(function (light) {
          setters.push({ opacity: gsap.quickSetter(light, 'opacity'), y: gsap.quickSetter(light, 'y', 'px') });
          opacityTo.push(gsap.quickTo(light, 'opacity', { duration: .9, ease: 'power2.out' }));
          depthTo.push(depthRange ? gsap.quickTo(light, 'y', { duration: 1.1, ease: 'power2.out' }) : null);
          last.push({ opacity: -1, y: -100 });
        });

        function measure() {
          if (state.disposed) return;
          // Geometry is read only during construction/ScrollTrigger refresh.
          var scroll = window.scrollY || 0, height = window.innerHeight;
          var previous = { id: 'home', at: 0, weights: [0, 0, 0], depth: [0, 0, 0] };
          stops = [previous];
          state.anchors = [];
          chapters.forEach(function (chapter) {
            var top = chapter.section.getBoundingClientRect().top + scroll;
            var start = Math.max(previous.at, top - height * .98, 0);
            var end = Math.max(start + 1, top - height * .32);
            var definition = chapter.definition;
            var hold = { id: previous.id, at: start, weights: previous.weights, depth: previous.depth };
            var target = { id: definition.selector.slice(1), at: end, weights: definition.weights, depth: definition.depth };
            stops.push(hold, target);
            state.anchors.push({ chapter: target.id, start: start, end: end });
            previous = target;
          });
        }

        function paint(scroll, immediate) {
          if (state.disposed || !stops.length) return;
          var from = stops[0], to = stops[0];
          for (var index = 1; index < stops.length; index++) {
            to = stops[index];
            if (scroll < to.at) break;
            from = to;
          }
          var progress = Math.max(0, Math.min(1, (scroll - from.at) / Math.max(1, to.at - from.at)));
          // Smoothstep brings both sides of a hand-off to rest on the same axis.
          progress = progress * progress * (3 - 2 * progress);
          state.chapter = from.id === to.id ? to.id : from.id + ' → ' + to.id;
          lights.forEach(function (_, index) {
            var opacity = (from.weights[index] + (to.weights[index] - from.weights[index]) * progress) * intensity;
            var y = (from.depth[index] + (to.depth[index] - from.depth[index]) * progress) * depthRange;
            state.weights[index] = Math.round(opacity * 1000) / 1000;
            if (immediate || !painted) {
              opacityTo[index].tween.pause();
              if (depthTo[index]) depthTo[index].tween.pause();
              setters[index].opacity(opacity); setters[index].y(y);
              last[index].opacity = opacity; last[index].y = y;
            } else {
              // Repeated scroll callbacks in a reading plateau do not restart a tween.
              if (Math.abs(opacity - last[index].opacity) > .0005) {
                opacityTo[index](opacity); last[index].opacity = opacity;
              }
              if (depthTo[index] && Math.abs(y - last[index].y) > .015) {
                depthTo[index](y); last[index].y = y;
              }
            }
          });
          painted = true;
        }

        measure();
        var trigger = ScrollTrigger.create({
          id: 'lab-atmosphere-' + state.token,
          start: 0, end: 'max',
          onUpdate: function (self) { paint(self.scroll(), false); },
          onRefresh: function (self) { measure(); paint(self.scroll(), !painted); }
        });
        state.triggers = [trigger];
        // Pin spacers and font changes in the primary choreography have settled
        // when this global refresh event runs. No refresh is scheduled by us.
        function afterRefresh() { measure(); paint(trigger.scroll(), !painted); }
        ScrollTrigger.addEventListener('refresh', afterRefresh);
        paint(trigger.scroll(), true);

        return function () {
          ScrollTrigger.removeEventListener('refresh', afterRefresh);
          trigger.kill();
          opacityTo.forEach(function (to) { to.tween.kill(); });
          depthTo.forEach(function (to) { if (to) to.tween.kill(); });
          state.triggers = [];
          state.anchors = [];
          state.weights = [0, 0, 0];
          state.chapter = 'home';
          root.dataset.mode = 'static';
          state.mode = 'low';
        };
      }, root);
    }

    function onPerformance() { rebuild(); }
    state.dispose = function () {
      if (state.disposed) return;
      state.disposed = true;
      document.removeEventListener('q3:perf', onPerformance);
      if (state.media) { state.media.revert(); state.media = null; }
      state.triggers = [];
      root.remove();
      if (current === state) current = null;
    };
    document.addEventListener('q3:perf', onPerformance);
    Q.onDispose(state.dispose);
    rebuild();
  }

  window.__LAB_ATMOSPHERE__ = {
    version: 2,
    mount: mount,
    dispose: disposeCurrent,
    get mode() { return current ? current.mode : 'unmounted'; },
    get fallback() { return current ? current.fallback : ''; },
    get layerCount() { return current ? current.root.children.length : 0; },
    get triggerCount() { return current ? current.triggers.length : 0; },
    get chapter() { return current ? current.chapter : ''; },
    get weights() { return current ? current.weights.slice() : []; },
    get anchors() { return current ? current.anchors.map(function (anchor) { return Object.assign({}, anchor); }) : []; },
    get triggers() {
      return current ? current.triggers.map(function (trigger) {
        return { id: trigger.vars.id, start: trigger.start, end: trigger.end, progress: trigger.progress, active: trigger.isActive };
      }) : [];
    }
  };
  document.addEventListener('q3:page', mount);
  window.addEventListener('pagehide', disposeCurrent);
  window.addEventListener('pageshow', function (event) { if (event.persisted) mount(); });
  if (window.__Q3_READY__) mount();
})();


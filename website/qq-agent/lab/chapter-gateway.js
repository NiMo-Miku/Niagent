/* Tools -> capabilities. Decorative geometry stays inside its own flow box. */
(function () {
  'use strict';
  if (window.__LAB_GATEWAY__) return;

  function build(options) {
    options = options || {};
    var gsap = window.gsap;
    var element = options.element || document.querySelector('.story-bridge');
    if (!gsap || !element) throw new Error('Chapter gateway requires GSAP and a bridge element.');
    if (element.__labGateway) element.__labGateway.dispose();

    var owner = gsap.context();
    var oldNodes = Array.from(element.childNodes);
    var oldClass = element.getAttribute('class');
    var oldHidden = element.getAttribute('aria-hidden');
    var oldSpectacle = element.getAttribute('data-spectacle');
    var compact = options.compact === undefined ? matchMedia('(max-width: 760px)').matches : Boolean(options.compact);
    var reduced = options.reduced === undefined
      ? matchMedia('(prefers-reduced-motion: reduce)').matches || Boolean(window.Q3 && Q3.reduce)
      : Boolean(options.reduced);
    var disposed = false;
    var timeline;
    element.classList.add('lab-gateway');
    element.classList.toggle('lab-gateway--compact', compact);
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('data-spectacle', 'gateway');
    element.innerHTML =
      '<div class="gateway-stage">' +
        '<div class="gateway-coordinate"><span>02 / TOOL CALLS</span><i></i><span>03 / CAPABILITIES</span></div>' +
        '<div class="gateway-architecture">' +
          '<div class="gateway-title"><span class="gateway-word gateway-word--first">CAPA</span><span class="gateway-word gateway-word--second">BILITIES</span></div>' +
        '</div>' +
        '<div class="gateway-doors">' +
          '<div class="gateway-door gateway-door--left"><i class="gateway-door-edge"></i><span class="gateway-door-index">01 — 08</span><i class="gateway-door-tick"></i></div>' +
          '<div class="gateway-door gateway-door--right"><i class="gateway-door-edge"></i><span class="gateway-door-index">OPEN CAPABILITIES</span><i class="gateway-door-tick"></i></div>' +
        '</div>' +
        '<div class="gateway-jamb gateway-jamb--left"></div><div class="gateway-jamb gateway-jamb--right"></div>' +
        '<div class="gateway-beam gateway-beam--top"></div><div class="gateway-beam gateway-beam--bottom"></div>' +
        '<div class="gateway-seam"></div>' +
        '<div class="gateway-baseline"><span>CHAPTER / 03</span><span>01 — 08</span><span>↓</span></div>' +
      '</div>';

    var query = function (selector) { return element.querySelector(selector); };
    var left = query('.gateway-door--left'), right = query('.gateway-door--right');
    var architecture = query('.gateway-architecture');
    var firstWord = query('.gateway-word--first'), secondWord = query('.gateway-word--second');
    var beams = element.querySelectorAll('.gateway-beam');
    var seam = query('.gateway-seam');
    var triggerOptions = null;
    if (!reduced && options.scrollTrigger !== false) {
      triggerOptions = Object.assign({
        id: 'lab-story-gateway', trigger: element, start: 'top 92%', end: 'bottom 18%',
        scrub: .8, invalidateOnRefresh: true,
      }, options.scrollTrigger || {});
      // Pinning belongs to the following content chapter, never this bridge.
      triggerOptions.pin = false;
    }
    var vars = { defaults: { ease: 'none' } };
    if (triggerOptions) vars.scrollTrigger = triggerOptions;
    if (options.paused || reduced) vars.paused = true;
    timeline = gsap.timeline(vars);
    timeline.addLabel('closed', 0)
      .fromTo(beams, { scaleX: .08 }, { scaleX: 1, duration: .3, ease: 'power2.out' }, 0)
      .fromTo(seam, { scaleY: .16 }, { scaleY: 1, duration: .28, ease: 'power2.out' }, 0)
      .addLabel('opening', .14)
      .fromTo(left, { xPercent: 0 }, { xPercent: -105, duration: .66, ease: 'power3.inOut' }, .14)
      .fromTo(right, { xPercent: 0 }, { xPercent: 105, duration: .66, ease: 'power3.inOut' }, .14)
      .fromTo(architecture, { clipPath: 'inset(0% 42% 0% 42%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: .64, ease: 'power2.inOut' }, .16)
      .fromTo(firstWord, { yPercent: 20, scale: 1.06 }, { yPercent: 0, scale: 1, duration: .62, ease: 'power2.out' }, .18)
      .fromTo(secondWord, { yPercent: 35, scale: 1.04 }, { yPercent: 0, scale: 1, duration: .62, ease: 'power2.out' }, .24)
      .to(seam, { scaleY: 0, duration: .18, ease: 'power2.in' }, .62)
      .addLabel('open', .86)
      .to({}, { duration: .14 }, .86);

    function restore() {
      if (disposed) return;
      disposed = true;
      if (element.__labGateway !== instance) return;
      element.replaceChildren.apply(element, oldNodes);
      if (oldClass === null) element.removeAttribute('class');
      else element.setAttribute('class', oldClass);
      if (oldHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', oldHidden);
      if (oldSpectacle === null) element.removeAttribute('data-spectacle');
      else element.setAttribute('data-spectacle', oldSpectacle);
      delete element.__labGateway;
    }
    var instance = element.__labGateway = {
      timeline: timeline,
      dispose: function () { if (disposed) return; timeline.revert(); restore(); },
    };
    // Current matchMedia/context owns the timeline automatically. Register the
    // manual DOM replacement alongside it, so resize/rebuild restores node identity.
    if (owner) owner.add(function () { return restore; });
    if (reduced) timeline.progress(1).pause();
    return timeline;
  }

  window.__LAB_GATEWAY__ = { build: build };
})();

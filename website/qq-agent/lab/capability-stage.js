/* Opaque capability cards: an ordered spatial deck and paired vertical apertures. */
(function () {
  'use strict';
  if (window.__LAB_CAPABILITY_STAGE__) return;

  function saveAttribute(element, name) {
    var value = element.getAttribute(name);
    return function () {
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    };
  }

  function build(options) {
    options = options || {};
    if (!window.gsap) throw new Error('Capability stage requires the existing GSAP runtime.');
    var deck = options.deck;
    if (!deck) throw new Error('Capability stage requires its existing card deck.');
    var frame = options.window || deck.parentElement;
    var cards = Array.prototype.slice.call(options.cards || deck.querySelectorAll('.ben'));
    var panels = Array.prototype.slice.call(options.panels || deck.querySelectorAll('.story-cap-panel'));
    if (cards.length !== 8 || panels.length !== 2) throw new Error('Capability stage expects eight original cards in two panels.');

    var compact = options.compact === undefined ? window.innerWidth <= 760 : Boolean(options.compact);
    var reduced = options.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches;
    var low = options.low || document.documentElement.dataset.perf === 'low';
    var flow = reduced || low || !options.pinned || window.innerHeight < 600;
    var timeline = options.timeline || gsap.timeline({ paused: true });
    var ownsTimeline = !options.timeline;
    var restores = [saveAttribute(deck, 'style'), saveAttribute(deck, 'class'), saveAttribute(deck, 'data-spectacle')];
    if (frame) restores.push(saveAttribute(frame, 'data-spectacle'));
    panels.forEach(function (panel) { restores.push(saveAttribute(panel, 'style')); });
    cards.forEach(function (card) { restores.push(saveAttribute(card, 'style')); });
    var homes = cards.map(function (card) { return { card: card, parent: card.parentNode, next: card.nextSibling }; });
    var slots = [];
    var context;
    var deckRect = deck.getBoundingClientRect();
    var owner = {
      timeline: timeline, mode: flow ? 'flow' : compact ? 'compact-slots' : 'desktop-deck',
      layoutHeight: deckRect.height, slotCount: 0, contentOverflow: [],
      disposed: false, restoreCount: 0, dispose: dispose
    };

    function restore() {
      if (owner.disposed) return;
      owner.disposed = true;
      owner.restoreCount++;
      // Reverse insertion restores the exact original siblings and eight-card order.
      for (var index = homes.length - 1; index >= 0; index--) {
        var home = homes[index];
        if (home.card.parentNode === home.parent) continue;
        if (home.next && home.next.parentNode === home.parent) home.parent.insertBefore(home.card, home.next);
        else home.parent.appendChild(home.card);
      }
      slots.forEach(function (slot) { slot.remove(); });
      restores.forEach(function (restoreAttribute) { restoreAttribute(); });
      if (ownsTimeline) timeline.kill();
    }

    function dispose() {
      if (owner.disposed) return;
      if (context) context.revert();
      else restore();
    }

    function setMode(mode) {
      deck.classList.add('capability-stage', 'capability-stage--' + mode);
      var name = mode === 'compact' ? 'capability-slots' : mode === 'desktop' ? 'capability-deck' : 'capability-flow';
      deck.dataset.spectacle = name;
      if (frame) frame.dataset.spectacle = name;
    }

    try {
      context = gsap.context(function () {
        // Context cleanup also covers a parent's matchMedia rollback. Explicit
        // owner.dispose() is safe afterwards because restoration is idempotent.
        gsap.set(cards, { opacity: 1, visibility: 'visible', x: 0, y: 0, z: 0, yPercent: 0, scale: 1, rotation: 0, rotationX: 0, rotationY: 0 });
        if (flow || deckRect.height <= 0 || deckRect.width <= 0) {
          owner.mode = 'flow';
          setMode('flow');
          owner.layoutHeight = deck.getBoundingClientRect().height;
          return restore;
        }

        if (compact) {
          var panelStyle = getComputedStyle(panels[0]);
          var gap = parseFloat(panelStyle.rowGap) || 12;
          var slotHeight = Math.max(1, (deckRect.height - gap) / 2);
          var measurements = cards.map(function (card) {
            var bounds = card.getBoundingClientRect(), style = getComputedStyle(card);
            return { height: bounds.height, top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
          });
          setMode('compact');
          deck.style.setProperty('--capability-height', deckRect.height + 'px');
          panels.forEach(function (panel) {
            panel.style.height = deckRect.height + 'px';
            panel.style.gridTemplateRows = 'repeat(2,minmax(0,1fr))';
            panel.style.rowGap = gap + 'px';
          });
          cards.forEach(function (card, index) {
            var slot = document.createElement('div');
            slot.className = 'capability-stage__slot';
            slot.dataset.slot = String(index % 4 + 1);
            slot.dataset.group = index < 4 ? 'first' : 'second';
            card.parentNode.insertBefore(slot, card);
            slot.appendChild(card);
            slots.push(slot);
            // Preserve the pre-measured pin height. If the two source panels had
            // different row proportions, recover only padding rather than crop text.
            var compression = Math.max(0, measurements[index].height - slotHeight);
            if (compression > 0) {
              card.style.paddingTop = Math.max(6, measurements[index].top - compression / 2 - 1) + 'px';
              card.style.paddingBottom = Math.max(6, measurements[index].bottom - compression / 2 - 1) + 'px';
            }
          });
          owner.slotCount = slots.length;
          gsap.set(cards.slice(4), { yPercent: 100 });
          // Each pair shares the same displacement and easing. The old lower
          // edge and new upper edge meet exactly; their text never occupies the
          // same pixel. All cards remain opaque and all eight stay in DOM order.
          for (var slotIndex = 0; slotIndex < 4; slotIndex++) {
            var at = .37 + slotIndex * .045;
            timeline.to(cards[slotIndex], { yPercent: -100, duration: .17, ease: 'power2.inOut', force3D: false }, at)
              .fromTo(cards[slotIndex + 4], { yPercent: 100 }, { yPercent: 0, duration: .17, ease: 'power2.inOut', force3D: false }, at);
          }
          cards.forEach(function (card, index) {
            if (card.scrollHeight > card.clientHeight + 1) owner.contentOverflow.push(index + 1);
          });
        } else {
          setMode('desktop');
          var poses = cards.map(function (card, index) {
            var bounds = card.getBoundingClientRect();
            var layer = Math.floor(index / 2);
            return {
              x: deckRect.width * (index % 2 ? .66 : .34) - (bounds.left - deckRect.left + bounds.width / 2),
              y: deckRect.height * .52 - layer * 8 - (bounds.top - deckRect.top + bounds.height / 2),
              z: -110 - layer * 48
            };
          });
          gsap.set(cards, { zIndex: function (index) { return cards.length - index; } });
          timeline.fromTo(cards,
            { x: function (index) { return poses[index].x; }, y: function (index) { return poses[index].y; }, z: function (index) { return poses[index].z; }, scale: .86, transformOrigin: '50% 50%' },
            { x: function (index) { return (index % 4 - 1.5) * 24; }, y: function (index) { return index < 4 ? -12 : 12; }, z: 0, scale: 1, duration: .27, stagger: .011, ease: 'power3.out' }, 0)
            .to(cards, { x: 0, y: 0, z: 0, scale: 1, duration: .10, stagger: .005, ease: 'power2.inOut' }, .35)
            .set(cards, { zIndex: 1 }, .50);
        }
        // Hold the final, readable composition through the parent's 1.02 timeline.
        // No endless animation, extra ScrollTrigger, opacity tween or heading motion.
        return restore;
      }, deck);
    } catch (error) {
      if (context) context.revert();
      restore();
      throw error;
    }
    return owner;
  }

  window.__LAB_CAPABILITY_STAGE__ = { version: 1, build: build };
})();

(function () {
  'use strict';
  // Captured before core's DOMContentLoaded boot: these belong to the persistent environment.
  window.__LAB_BG_TRIGGERS__ = new Set(ScrollTrigger.getAll());
  document.querySelector('#lab-replay').addEventListener('click', function () {
    if (document.body.dataset.page !== 'home') {
      Q3.go(Q3.BASE + 'lab/index.html');
      return;
    }
    window.scrollTo({ top: 0, behavior: Q3.reduce ? 'instant' : 'smooth' });
  });
  // Original environment modules read this preference at startup.
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function () { location.reload(); });
})();

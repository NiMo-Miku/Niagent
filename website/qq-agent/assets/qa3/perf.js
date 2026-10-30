/* ==========================================================================
   FPS 守卫
   采样每帧间隔 → 判定档位 high / mid / low → 通知各模块降级
   只在变差时降级，不会来回跳；支持 ?fx=high / ?fx=off 手动覆盖
   ========================================================================== */
(function () {
  'use strict';
  var root = document.documentElement;
  if (root.dataset.perf) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.dataset.perf = 'low';
    return;
  }

  var LEVEL = 0;                 // 0 high / 1 mid / 2 low
  var frames = [], last = 0, cooldown = 0, on = false;

  function median(a) {
    a = a.slice().sort(function (x, y) { return x - y; });
    return a[Math.floor(a.length / 2)];
  }

  function apply(level) {
    if (level <= LEVEL && root.dataset.perf) return;
    LEVEL = level;
    root.dataset.perf = ['high', 'mid', 'low'][level];
    document.dispatchEvent(new CustomEvent('q3:perf', {
      detail: { level: root.dataset.perf, levelNum: level }
    }));
    frames = [];
    cooldown = performance.now() + 5000;
  }

  function decide() {
    if (!frames.length) return;
    var m = median(frames);       // 中位数：单帧抖动不误判
    frames = [];
    // 16.7ms=60fps · 20ms≈50fps · 28ms≈36fps
    if (m > 28 && LEVEL < 2) apply(2);
    else if (m > 20 && LEVEL < 1) apply(1);
    cooldown = performance.now() + 5000;
  }

  function tick(t) {
    if (!last) { last = t; return requestAnimationFrame(tick); }
    var d = t - last;
    last = t;
    if (d > 0 && d < 500) frames.push(d);
    if (frames.length >= 100 && t > cooldown) decide();
    requestAnimationFrame(tick);
  }

  // 手动覆盖：?fx=high 强制全开，?fx=off 关特效
  var ov = location.search.match(/[?&]fx=(high|mid|off|low)/);
  if (ov) {
    var v = ov[1];
    apply(v === 'high' ? 0 : v === 'mid' ? 1 : 2);
    if (v === 'high') return;     // 强制全开就不再自动降级
  } else if ((navigator.hardwareConcurrency || 4) <= 4) {
    // 低核机器先降一档，跑得动也不会再升回来（避免来回抖）
    apply(1);
  }

  setTimeout(function () { requestAnimationFrame(tick); }, 2200);
})();

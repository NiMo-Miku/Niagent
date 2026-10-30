/* ==========================================================================
   anime.js 负责的「交错」层（v3.2.2 UMD）
   1) 子页面大标题：字符从中心向两侧扩散入场
   2) 区块标题：鼠标进入时字符做一次弹性波浪
   3) 致谢姓名格：按网格从中心扩散
   与 gsap 分工：gsap 管滚动 / scrub / 3D，anime 只管一次性的交错与弹性
   ========================================================================== */
(function () {
  'use strict';
  if (!window.anime) return;

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function boot() {
    if (reduce) return;

    /* 1) 大标题逐字，从中心扩散 */
    document.querySelectorAll('.phead h1').forEach(function (h1) {
      if (h1.__an) return;
      h1.__an = 1;
      var lines = h1.innerHTML.split(/<br\s*\/?>/i);
      h1.innerHTML = lines.map(function (line) {
        return line.replace(/<[^>]+>/g, '').split('').map(function (c) {
          return '<span class="an-ch">' + (c === ' ' ? '&nbsp;' : c) + '</span>';
        }).join('');
      }).join('<br>');
      var chars = h1.querySelectorAll('.an-ch');
      anime.set(chars, { opacity: 0, translateY: 16, scale: .94 });

      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.disconnect();
          anime({
            targets: chars,
            opacity: [0, 1],
            translateY: [16, 0],
            scale: [.94, 1],
            delay: anime.stagger(16, { from: 'center' }),
            duration: 900,
            easing: 'easeOutExpo'
          });
        });
      }, { threshold: .2 });
      io.observe(h1);
    });

    /* 2) 区块标题：鼠标进入时的弹性波浪 */
    document.querySelectorAll('.sec-head h2').forEach(function (h2) {
      if (h2.__an) return;
      h2.__an = 1;
      var busy = false;
      h2.addEventListener('mouseenter', function () {
        var chs = h2.querySelectorAll('.chx');
        if (!chs.length || busy) return;
        busy = true;
        anime({
          targets: chs,
          translateY: [
            { value: -7, duration: 220, easing: 'easeOutQuad' },
            { value: 0, duration: 620, easing: 'easeOutElastic(1, .45)' }
          ],
          delay: anime.stagger(26),
          complete: function () { busy = false; }
        });
      });
    });

    /* 3) 致谢姓名格：按网格从中心扩散 */
    document.querySelectorAll('.name-grid').forEach(function (grid) {
      if (grid.__an) return;
      grid.__an = 1;
      var cells = grid.querySelectorAll('.name-cell');
      if (!cells.length) return;
      var cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length || 6;
      var rows = Math.ceil(cells.length / cols);
      anime.set(cells, { opacity: 0, scale: .86, translateY: 10 });
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.disconnect();
          anime({
            targets: cells,
            opacity: [0, 1],
            scale: [.86, 1],
            translateY: [10, 0],
            delay: anime.stagger(9, { grid: [rows, cols], from: 'center' }),
            duration: 700,
            easing: 'easeOutQuad'
          });
        });
      }, { threshold: .05 });
      io.observe(grid);
    });

    /* 4) 市场 / 意见墙 / 人设：行 hover 时内部元素轻微错峰 */
    document.querySelectorAll('.cm, .mrow').forEach(function (row) {
      if (row.__an) return;
      row.__an = 1;
      row.addEventListener('mouseenter', function () {
        var bits = row.querySelectorAll('.nm, .ds, .idx b, .body .who, .mt');
        if (!bits.length) return;
        anime({
          targets: bits,
          translateX: [0, 3],
          delay: anime.stagger(22),
          duration: 380,
          direction: 'alternate',
          easing: 'easeOutQuad'
        });
      });
    });
  }

  function run() { boot(); }
  if (window.__Q3_READY__) run();
  else document.addEventListener('q3:ready', run, { once: true });
  document.addEventListener('q3:page', run);
})();

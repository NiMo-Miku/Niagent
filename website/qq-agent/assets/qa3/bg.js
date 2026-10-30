/* ==========================================================================
   QQ AGENT — 环境背景层（全站常驻）
   柔光 / 巨字水印 / 网格 / 波动点阵 / 漂浮几何 / 噪点
   所有运动只改 transform 与 canvas 像素，不做全屏 filter
   ========================================================================== */
(function () {
  'use strict';
  if (window.__QBG__) return;
  window.__QBG__ = 1;

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  var root = document.createElement('div');
  root.className = 'qbg';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML =
    '<div class="qbg-wash"><i class="w1"></i><i class="w2"></i><i class="w3"></i></div>' +
    '<div class="qbg-words">' +
      '<span class="w-a">QQ AGENT</span>' +
      '<span class="w-b">LOCAL FIRST</span>' +
      '<span class="w-c">按次计费</span>' +
    '</div>' +
    '<div class="qbg-rings"><i></i><i></i><i></i></div>' +
    '<div class="qbg-shapes"><i class="stripe"></i><i class="cross"></i><i class="dotgrid"></i></div>' +
    '<div class="qbg-beam"></div>' +
    '<div class="qbg-grid"></div>' +
    '<canvas class="qbg-dots"></canvas>' +
    '<div class="qbg-orbs"></div>' +
    '<div class="qbg-grain"></div>' +
    '<div class="qbg-vig"></div>';
  document.body.insertBefore(root, document.body.firstChild);

  /* ── 网格：滚动位移 ─────────────────────────────────────────────── */
  var grid = root.querySelector('.qbg-grid');
  var lastY = -1;
  function onScroll() {
    var y = window.scrollY || 0;
    if (Math.abs(y - lastY) < 1) return;
    lastY = y;
    grid.style.transform = 'translate3d(0,' + (-(y * 0.08) % 88).toFixed(2) + 'px,0)';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── 点阵波场 ───────────────────────────────────────────────────── */
  var cv = root.querySelector('.qbg-dots');
  var ctx = cv.getContext('2d', { alpha: true });
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var GAP = window.innerWidth < 860 ? 42 : 32;
  var W = 0, H = 0, dots = [], raf = 0;
  var mx = -9999, my = -9999;
  var R = 170, R2 = R * R;
  var darkTheme = document.documentElement.dataset.theme === 'dark';
  document.addEventListener('q3:theme', function (e) { darkTheme = e.detail.theme === 'dark'; });

  function build() {
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dots.length = 0;
    for (var y = GAP / 2; y < H + GAP; y += GAP) {
      for (var x = GAP / 2; x < W + GAP; x += GAP) {
        dots.push({ x: x, y: y, ph: Math.random() * 6.2832 });
      }
    }
  }

  var frameTick = 0;
  function draw(t) {
    raf = 0;
    // 背景纹理不需要 60fps，隔帧画一次省一半 CPU
    if (++frameTick % 2) { if (!document.hidden) raf = requestAnimationFrame(draw); return; }
    var time = (t || 0) * 0.001;
    var off = (window.scrollY * 0.06) % GAP;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = darkTheme ? 'rgba(232,234,244,0.15)' : 'rgba(20,20,28,0.13)';
    var near = [];

    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      // 两重正弦叠出一片缓慢起伏的水面
      var wave = Math.sin(d.x * 0.011 + time * 0.85 + d.ph * 0.3) *
                 Math.cos(d.y * 0.0085 + time * 0.62);
      var xx = d.x + Math.cos(d.y * 0.012 + time * 0.45) * 3.6;
      var yy = d.y - off + wave * 7;
      if (yy < -GAP * 2 || yy > H + GAP * 2) continue;

      if (fine && mx > -9000) {
        var dx = xx - mx, dy = yy - my;
        var d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          var dist = Math.sqrt(d2) || 1;
          var k = 1 - dist / R;
          xx += dx / dist * k * 30;
          yy += dy / dist * k * 30;
          near.push([xx, yy, k]);
          continue;
        }
      }
      ctx.fillRect(xx - 1, yy - 1, 2, 2);
    }

    if (near.length) {
      for (var j = 0; j < near.length; j++) {
        var p = near[j];
        var s = 1.6 + p[2] * 2.6;
        ctx.fillStyle = 'rgba(108,92,231,' + (0.18 + p[2] * 0.6).toFixed(3) + ')';
        ctx.fillRect(p[0] - s / 2, p[1] - s / 2, s, s);
      }
    }
    if (!document.hidden) raf = requestAnimationFrame(draw);
  }

  function start() { if (!raf) raf = requestAnimationFrame(draw); }

  build();
  if (reduce) {
    ctx.fillStyle = darkTheme ? 'rgba(232,234,244,0.15)' : 'rgba(20,20,28,0.13)';
    dots.forEach(function (d) { ctx.fillRect(d.x - 1, d.y - 1, 2, 2); });
  } else {
    start();
  }

  var rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(build, 180);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!reduce) start();
  });

  if (fine) {
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
    }, { passive: true });
    window.addEventListener('pointerleave', function () { mx = my = -9999; });
    window.addEventListener('blur', function () { mx = my = -9999; });
  }

  /* ── 漂浮几何：沿曲线游走（MotionPath） ─────────────────────────── */
  var orbs = root.querySelector('.qbg-orbs');
  var ORB_COUNT = window.innerWidth < 860 ? 8 : 14;
  var kinds = ['', 'ring', 'plus', 'dot'];
  for (var i = 0; i < ORB_COUNT; i++) {
    var el = document.createElement('i');
    var kind = kinds[i % kinds.length];
    if (kind) el.className = kind;
    var size = 7 + Math.random() * 15;
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.left = (5 + Math.random() * 90) + '%';
    el.style.top = (8 + Math.random() * 84) + '%';
    el.style.opacity = (0.45 + Math.random() * 0.5).toFixed(2);
    orbs.appendChild(el);
  }

  if (!reduce && window.gsap) {
    Array.prototype.slice.call(orbs.children).forEach(function (el, idx) {
      var r1 = 26 + Math.random() * 58;
      var r2 = 18 + Math.random() * 46;
      var dur = 22 + Math.random() * 20;
      var conf = { duration: dur, repeat: -1, ease: 'sine.inOut', delay: -Math.random() * 14 };
      if (window.MotionPathPlugin) {
        conf.motionPath = {
          path: [
            { x: 0, y: 0 },
            { x: r1, y: -r2 },
            { x: r1 * .35, y: -r2 * 1.9 },
            { x: -r1 * .55, y: -r2 * 1.05 },
            { x: 0, y: 0 }
          ],
          curviness: 1.4
        };
        gsap.to(el, conf);
      } else {
        gsap.to(el, { x: r1, y: -r2, duration: dur, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      }
      if (el.classList.contains('plus') || el.classList.contains('ring')) {
        gsap.to(el, { rotation: idx % 2 ? 360 : -360, duration: 40 + Math.random() * 30, repeat: -1, ease: 'none' });
      }
    });
  }

  /* ── 降级响应（初始化时先按当前档位走一遍） ─────────────────────── */
  function applyPerf(lv) {
    if (lv === 1) { GAP = GAP * 1.5; build(); }
    else if (lv === 2) {
      cancelAnimationFrame(raf); raf = 0;
      if (cv) cv.style.display = 'none';
      if (orbs) orbs.style.display = 'none';
      var sh = root.querySelector('.qbg-shapes');
      if (sh) sh.style.display = 'none';
      if (window.gsap) {
        gsap.killTweensOf('.qbg-words span');
        gsap.killTweensOf('.qbg-wash i');
        gsap.killTweensOf('.qbg-rings');
        gsap.killTweensOf('.qbg-beam');
      }
    }
  }
  var bootLevel = document.documentElement.dataset.perf;
  if (bootLevel === 'low') applyPerf(2);
  else if (bootLevel === 'mid') applyPerf(1);


  document.addEventListener('q3:perf', function (e) {
    var lv = e.detail.levelNum;
    if (lv === 1) {
      // 中档：点阵稀疏一半
      GAP = GAP * 1.5;
      build();
    } else if (lv === 2) {
      cancelAnimationFrame(raf); raf = 0;
      if (cv) cv.style.display = 'none';
      if (orbs) orbs.style.display = 'none';
      var sh = root.querySelector('.qbg-shapes');
      if (sh) sh.style.display = 'none';
      if (window.gsap) {
        gsap.killTweensOf('.qbg-words span');
        gsap.killTweensOf('.qbg-wash i');
        gsap.killTweensOf('.qbg-rings');
        gsap.killTweensOf('.qbg-beam');
      }
    }
  });

  /* ── 柔光 / 水印 / 视差 ─────────────────────────────────────────── */
  if (!reduce && window.gsap) {
    gsap.to('.qbg-wash .w1', { xPercent: 6, yPercent: 5, scale: 1.12, duration: 26, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('.qbg-wash .w2', { xPercent: -7, yPercent: 6, scale: 0.92, duration: 32, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('.qbg-wash .w3', { xPercent: 5, yPercent: -6, scale: 1.08, duration: 21, repeat: -1, yoyo: true, ease: 'sine.inOut' });

    gsap.to('.qbg-rings', { rotate: 360, duration: 240, repeat: -1, ease: 'none' });
    gsap.set('.qbg-beam', { rotation: -16 });
    gsap.to('.qbg-beam', { xPercent: 12, yPercent: 4, duration: 38, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('.qbg-shapes .stripe', { opacity: .55, duration: 9, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('.qbg-shapes .dotgrid', { y: -18, duration: 12, repeat: -1, yoyo: true, ease: 'sine.inOut' });

    // 巨字水印：缓慢横移，给背景一点「结构」
    gsap.to('.qbg-words .w-a', { xPercent: -7, duration: 44, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.fromTo('.qbg-words .w-b', { xPercent: 4 }, { xPercent: -5, duration: 52, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('.qbg-words .w-c', { xPercent: 6, duration: 38, repeat: -1, yoyo: true, ease: 'sine.inOut' });

    if (window.ScrollTrigger) {
      // 分层视差：越靠前的装饰动得越快
      gsap.to('.qbg-wash', { y: 150, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });
      gsap.to('.qbg-rings', { y: -120, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });
      gsap.to('.qbg-words', { y: -230, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });
      gsap.to('.qbg-orbs', { y: -90, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });

      var tone = { start: 0, end: 'max', scrub: 1.4 };
      gsap.to('.qbg-wash .w1', { opacity: .45, ease: 'none', scrollTrigger: tone });
      gsap.fromTo('.qbg-wash .w2', { opacity: .8 }, { opacity: 1, ease: 'none', scrollTrigger: tone });
      gsap.fromTo('.qbg-wash .w3', { opacity: .55 }, { opacity: 1, ease: 'none', scrollTrigger: tone });
    }

    if (fine) {
      var blobs = Array.prototype.slice.call(root.querySelectorAll('.qbg-wash i'));
      var words = root.querySelector('.qbg-words');
      blobs.forEach(function (el2, i2) {
        var d = (i2 === 0 ? 34 : i2 === 1 ? -26 : 18);
        el2.__px = gsap.quickTo(el2, 'x', { duration: 1.8, ease: 'power3.out' });
        el2.__py = gsap.quickTo(el2, 'y', { duration: 1.8, ease: 'power3.out' });
        el2.__d = d;
      });
      var wx = words ? gsap.quickTo(words, 'x', { duration: 2.2, ease: 'power3.out' }) : null;
      window.addEventListener('pointermove', function (e) {
        var cx = (e.clientX / window.innerWidth - .5) * 2;
        var cy = (e.clientY / window.innerHeight - .5) * 2;
        blobs.forEach(function (el3) {
          el3.__px(cx * el3.__d);
          el3.__py(cy * el3.__d * .7);
        });
        if (wx) wx(cx * -24);
      }, { passive: true });
    }
  }
})();

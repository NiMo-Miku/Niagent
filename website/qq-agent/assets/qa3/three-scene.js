/* ==========================================================================
   首屏 3D 舞台（three.js r149 UMD）
   粒子球 + 星尘 + 线框二十面体，鼠标视差 / 滚出首屏时穿过去
   移动端与「减少动态效果」下完全不加载
   ========================================================================== */
(function () {
  'use strict';

  function boot() {
  if (!window.THREE) return;
  if (window.__HERO3D_STATE__) return;
  if (document.documentElement.dataset.perf === 'low') return;

  var host = document.querySelector('.hero');
  if (!host) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.innerWidth < 860) return;

  var W = 0, H = 0, renderer, scene, camera;
  var state = window.__HERO3D_STATE__ = { raf: 0, alive: true };
  var group, points, dust, wire;
  var mx = 0, my = 0, tmx = 0, tmy = 0, scrollP = 0;

  var canvas = document.createElement('canvas');
  canvas.className = 'hero3d';
  canvas.setAttribute('aria-hidden', 'true');
  host.insertBefore(canvas, host.firstChild);

  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, alpha: true, antialias: false,
      powerPreference: 'high-performance', stencil: false, depth: true
    });
  } catch (e) {
    canvas.remove();
    return;
  }
  if (!renderer || !renderer.getContext()) { canvas.remove(); return; }

  state.renderer = renderer; state.canvas = canvas;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(46, 1, .1, 100);
  camera.position.set(0, 0, 7.7);

  group = new THREE.Group();
  scene.add(group);

  /* ── 球面点云（斐波那契分布） ─────────────────────────────────── */
  var COUNT = window.innerWidth > 1500 ? 9000 : 6000;
  var RAD = 2.35;
  var geo = new THREE.BufferGeometry();
  var pos = new Float32Array(COUNT * 3);
  var col = new Float32Array(COUNT * 3);
  var cA = new THREE.Color(0x6c5ce7);   // 紫
  var cB = new THREE.Color(0x4a9eff);   // 蓝
  var cC = new THREE.Color(0x00c2a8);   // 薄荷
  var ga = Math.PI * (3 - Math.sqrt(5));

  for (var i = 0; i < COUNT; i++) {
    var y = 1 - (i / (COUNT - 1)) * 2;
    var r = Math.sqrt(1 - y * y);
    var th = ga * i;
    var jitter = 0.92 + Math.random() * 0.16;
    var rr = RAD * jitter;
    pos[i * 3] = Math.cos(th) * r * rr;
    pos[i * 3 + 1] = y * rr;
    pos[i * 3 + 2] = Math.sin(th) * r * rr;

    var t = (y + 1) / 2;
    var c = t < .5 ? cA.clone().lerp(cB, t * 2) : cB.clone().lerp(cC, (t - .5) * 2);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: .032, vertexColors: true, transparent: true, opacity: .58,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
  }));
  group.add(points);

  /* ── 外层星尘 ─────────────────────────────────────────────────── */
  var DUST = 1400;
  var dg = new THREE.BufferGeometry();
  var dp = new Float32Array(DUST * 3);
  for (var j = 0; j < DUST; j++) {
    var v = new THREE.Vector3(
      (Math.random() - .5) * 2, (Math.random() - .5) * 2, (Math.random() - .5) * 2
    ).normalize().multiplyScalar(3.1 + Math.random() * 1.9);
    dp[j * 3] = v.x; dp[j * 3 + 1] = v.y; dp[j * 3 + 2] = v.z;
  }
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  dust = new THREE.Points(dg, new THREE.PointsMaterial({
    size: .016, color: 0x9a8cff, transparent: true, opacity: .5,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  group.add(dust);

  /* ── 线框二十面体 ─────────────────────────────────────────────── */
  var ico = new THREE.IcosahedronGeometry(RAD * 1.06, 1);
  wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(ico),
    new THREE.LineBasicMaterial({ color: 0x6c5ce7, transparent: true, opacity: .14 })
  );
  group.add(wire);

  group.position.set(window.innerWidth > 1100 ? 1.95 : 0, .18, 0);

  function size() {
    W = host.clientWidth;
    H = host.clientHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
  }
  size();

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(size, 160);
  });

  window.addEventListener('pointermove', function (e) {
    tmx = (e.clientX / window.innerWidth - .5) * 2;
    tmy = (e.clientY / window.innerHeight - .5) * 2;
  }, { passive: true });

  function tick(t) {
    state.raf = 0;
    if (!state.alive) return;
    var time = t * 0.001;

    mx += (tmx - mx) * .05;
    my += (tmy - my) * .05;

    // 滚动进度：滚出首屏时整团放大并淡出，像镜头穿过去
    var y = window.scrollY || 0;
    var p = Math.min(1, y / Math.max(1, H));
    scrollP += (p - scrollP) * .08;
    var sc = 1 + scrollP * .85;
    group.scale.setScalar(sc);
    group.rotation.z = scrollP * .5;
    var dark = document.documentElement.dataset.theme === 'dark';
    points.material.opacity = (dark ? .44 : .58) * (1 - scrollP * .95);
    dust.material.opacity = .5 * (1 - scrollP);
    wire.material.opacity = .2 * (1 - scrollP);

    group.rotation.y = time * .09 + mx * .18;
    group.rotation.x = my * .14;
    dust.rotation.y = -time * .04;
    wire.rotation.y = -time * .06;
    wire.rotation.x = time * .03;

    camera.position.x = mx * .55;
    camera.position.y = -my * .4;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    if (!document.hidden) state.raf = requestAnimationFrame(tick);
  }

  function start() { if (!state.raf && state.alive) state.raf = requestAnimationFrame(tick); }

  start();

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(state.raf); state.raf = 0; }
    else start();
  });

  // 首屏完全滚出视口就停掉 WebGL 循环
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        state.alive = en.isIntersecting;
        if (state.alive) start();
        else { cancelAnimationFrame(state.raf); state.raf = 0; }
      });
    }, { threshold: 0 }).observe(host);
  }
  }

  function dispose() {
    var st = window.__HERO3D_STATE__;
    if (st) {
      st.alive = false;
      cancelAnimationFrame(st.raf);
      try { st.renderer.dispose(); } catch (e) {}
      if (st.canvas && st.canvas.parentNode) st.canvas.parentNode.removeChild(st.canvas);
      window.__HERO3D_STATE__ = null;
    }
  }

  window.__HERO3D__ = { init: boot, dispose: dispose };

  if (window.__Q3_READY__) boot();
  else document.addEventListener('q3:ready', boot, { once: true });
})();

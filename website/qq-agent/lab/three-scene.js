/* Local derivative of assets/qa3/three-scene.js.
   Same point cloud, dust, wireframe, palette and resting camera.
   The experiment changes the scroll camera path, not the visual language. */
(function () {
  'use strict';
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var desktop = matchMedia('(min-width: 860px)');

  function boot() {
    if (!window.THREE || window.__HERO3D_STATE__ || reduced.matches) return;
    if (document.documentElement.dataset.perf === 'low') return;
    var host = document.querySelector('.hero');
    if (!host || document.body.dataset.page !== 'home') return;

    var W = 0, H = 0, hostTop = 0, renderer, scene, camera;
    var compact = !desktop.matches, initialZ = compact ? 11.5 : 7.7;
    var state = { raf: 0, alive: true, disposed: false, progress: 0, renderedFrames: 0, compact: compact };
    var group, points, dust, wire;
    var mx = 0, my = 0, tmx = 0, tmy = 0, scrollP = 0, lastTime = 0;
    var restX = compact ? 1.2 : window.innerWidth > 1100 ? 1.95 : 0, targetRestX = restX;
    var resources = [], observer, resizeTimer;
    var canvas = document.createElement('canvas');
    canvas.className = 'hero3d';
    canvas.setAttribute('aria-hidden', 'true');
    host.insertBefore(canvas, host.firstChild);
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false,
        powerPreference: 'high-performance', stencil: false, depth: true });
    } catch (error) { canvas.remove(); return; }
    if (!renderer.getContext()) { renderer.dispose(); canvas.remove(); return; }
    window.__HERO3D_STATE__ = state;
    state.renderer = renderer; state.canvas = canvas;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.6));
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(46, 1, .1, 100);
    camera.position.set(0, 0, initialZ);
    group = new THREE.Group(); scene.add(group);
    state.camera = camera; state.group = group;

    var COUNT = compact ? 1800 : window.innerWidth > 1500 ? 9000 : 6000, RAD = 2.35;
    state.pointCount = COUNT;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3);
    var cA = new THREE.Color(0x6c5ce7), cB = new THREE.Color(0x4a9eff), cC = new THREE.Color(0x00c2a8);
    var ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < COUNT; i++) {
      var y = 1 - (i / (COUNT - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i;
      var rr = RAD * (.92 + Math.random() * .16);
      pos[i * 3] = Math.cos(th) * r * rr;
      pos[i * 3 + 1] = y * rr;
      pos[i * 3 + 2] = Math.sin(th) * r * rr;
      var t = (y + 1) / 2;
      var c = t < .5 ? cA.clone().lerp(cB, t * 2) : cB.clone().lerp(cC, (t - .5) * 2);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var pm = new THREE.PointsMaterial({ size: .032, vertexColors: true, transparent: true, opacity: .58,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    // Preserve the distant square grains; soften and cap only the near-camera projection.
    var closeup = { value: 0 };
    function refineCloseup(material, maxSize) {
      material.onBeforeCompile = function (shader) {
        shader.uniforms.uCloseup = closeup;
        shader.vertexShader = 'uniform float uCloseup;\n' + shader.vertexShader.replace('#include <logdepthbuf_vertex>',
          'gl_PointSize = mix(gl_PointSize, min(gl_PointSize, ' + maxSize + '), uCloseup);\n#include <logdepthbuf_vertex>');
        shader.fragmentShader = 'uniform float uCloseup;\n' + shader.fragmentShader.replace('#include <premultiplied_alpha_fragment>',
          'vec2 grain = gl_PointCoord * 2.0 - 1.0;\ngl_FragColor.a *= mix(1.0, 1.0 - smoothstep(0.1, 1.0, dot(grain, grain)), uCloseup);\n#include <premultiplied_alpha_fragment>');
      };
    }
    refineCloseup(pm, '6.0');
    points = new THREE.Points(geo, pm); group.add(points);
    resources.push(geo, pm);

    var DUST = compact ? 320 : 1400, dg = new THREE.BufferGeometry(), dp = new Float32Array(DUST * 3);
    state.dustCount = DUST;
    for (var j = 0; j < DUST; j++) {
      var v = new THREE.Vector3((Math.random() - .5) * 2, (Math.random() - .5) * 2, (Math.random() - .5) * 2)
        .normalize().multiplyScalar(3.1 + Math.random() * 1.9);
      dp[j * 3] = v.x; dp[j * 3 + 1] = v.y; dp[j * 3 + 2] = v.z;
    }
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    var dm = new THREE.PointsMaterial({ size: .016, color: 0x9a8cff, transparent: true, opacity: .5,
      depthWrite: false, blending: THREE.AdditiveBlending });
    refineCloseup(dm, '4.0');
    dust = new THREE.Points(dg, dm); group.add(dust); resources.push(dg, dm);

    var ico = new THREE.IcosahedronGeometry(RAD * 1.06, 1);
    var wg = new THREE.WireframeGeometry(ico);
    var wm = new THREE.LineBasicMaterial({ color: 0x6c5ce7, transparent: true, opacity: .14 });
    wire = new THREE.LineSegments(wg, wm); group.add(wire); resources.push(ico, wg, wm);
    group.position.set(restX, .18, 0);

    function size() {
      if (state.disposed) return;
      W = host.clientWidth; H = host.clientHeight;
      hostTop = host.getBoundingClientRect().top + window.scrollY;
      camera.aspect = W / Math.max(H, 1); camera.updateProjectionMatrix();
      renderer.setSize(W, H, false);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      canvas.style.top = Math.max(0, hostTop) + 'px';
    }
    size();
    function onResize() {
      targetRestX = compact ? 1.2 : window.innerWidth > 1100 ? 1.95 : 0;
      clearTimeout(resizeTimer); resizeTimer = setTimeout(size, 160);
    }
    function onPointer(e) {
      tmx = (e.clientX / window.innerWidth - .5) * 2;
      tmy = (e.clientY / window.innerHeight - .5) * 2;
    }
    function smooth(a, b, p) { var k = Math.max(0, Math.min(1, (p - a) / (b - a))); return k * k * (3 - 2 * k); }

    function tick(t) {
      state.raf = 0;
      if (state.disposed || !state.alive || document.hidden) return;
      // Time-based damping behaves consistently on 60/120/144 Hz displays.
      var dt = lastTime ? Math.min(64, t - lastTime) : 16.67;
      lastTime = t;
      var pointerEase = 1 - Math.exp(-dt / 325), scrollEase = 1 - Math.exp(-dt / 160);
      mx += (tmx - mx) * pointerEase; my += (tmy - my) * pointerEase;
      var p = Math.max(0, Math.min(1, (window.scrollY - hostTop) / Math.max(1, H)));
      scrollP += (p - scrollP) * scrollEase;
      var time = t * .001;
      // Hold the original composition, bank into its centre, then cross its near/far planes.
      var gather = smooth(.02, .46, scrollP);
      var travel = smooth(.07, .97, scrollP);
      var exit = 1 - smooth(.64, 1, scrollP);
      closeup.value = smooth(.12, .34, scrollP);
      restX += (targetRestX - restX) * scrollEase;
      group.position.x = restX * (1 - gather);
      group.position.y = .18 * (1 - gather);
      group.rotation.z = travel * .68;
      group.rotation.y = time * .09 + mx * .18 + travel * .8;
      group.rotation.x = my * .14 + Math.sin(travel * Math.PI) * .22;
      dust.rotation.y = -time * .04;
      wire.rotation.y = -time * .06; wire.rotation.x = time * .03;
      camera.position.x = mx * .55 * (1 - travel);
      camera.position.y = -my * .4 * (1 - travel);
      camera.position.z = initialZ - travel * (initialZ + 4.3);
      // Keep looking forwards while crossing z=0; lookAt(0,0,0) would flip the camera.
      camera.lookAt(0, 0, camera.position.z - initialZ);
      var dark = document.documentElement.dataset.theme === 'dark';
      points.material.opacity = (compact ? dark ? .34 : .44 : dark ? .44 : .58) * exit;
      dust.material.opacity = (compact ? .32 : .5) * exit;
      wire.material.opacity = (compact ? .12 : .2) * (1 - smooth(.32, .78, scrollP));
      renderer.render(scene, camera);
      canvas.style.visibility = 'visible';
      state.progress = scrollP; state.renderedFrames++;
      state.raf = requestAnimationFrame(tick);
    }
    function start() {
      if (!state.raf && state.alive && !state.disposed && !document.hidden) {
        lastTime = 0; state.raf = requestAnimationFrame(tick);
      }
    }
    function pause() { cancelAnimationFrame(state.raf); state.raf = 0; lastTime = 0; }
    function onVisibility() { if (document.hidden) pause(); else start(); }
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    if (window.IntersectionObserver) {
      observer = new IntersectionObserver(function (entries) {
        if (state.disposed) return;
        state.alive = entries[0].isIntersecting;
        if (state.alive) {
          scrollP = Math.max(0, Math.min(1, (window.scrollY - hostTop) / Math.max(1, H)));
          start();
        } else {
          canvas.style.visibility = 'hidden';
          pause();
        }
      }, { threshold: 0 });
      observer.observe(host);
    }
    state.dispose = function () {
      if (state.disposed) return;
      state.disposed = true; state.alive = false; pause();
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      if (observer) observer.disconnect();
      resources.forEach(function (resource) { resource.dispose(); });
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
      if (window.__HERO3D_STATE__ === state) window.__HERO3D_STATE__ = null;
    };
    start();
  }
  function dispose() { var state = window.__HERO3D_STATE__; if (state) state.dispose(); }
  function sync() {
    if (reduced.matches || document.documentElement.dataset.perf === 'low') dispose();
    else boot();
  }
  window.__HERO3D__ = { init: boot, dispose: dispose };
  desktop.addEventListener('change', function () { dispose(); sync(); });
  reduced.addEventListener('change', sync);
  document.addEventListener('q3:perf', sync);
  if (window.__Q3_READY__) boot();
  else document.addEventListener('q3:ready', boot, { once: true });
})();

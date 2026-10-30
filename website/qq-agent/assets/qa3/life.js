/* ==========================================================================
   左上角的生命游戏（Kok's galaxy 种子 · HighLife B36/S23）
   14×15 网格实时演算，每 180ms 一代，90 代回到种子重来
   小画布 + shadowBlur，开销可以忽略
   ========================================================================== */
(function () {
  'use strict';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Kok's galaxy：9×9 种子，网格最少 13×13（再小边界会吃掉它）
  var COLS = 13, ROWS = 13, CELL = 5, PAD = 2;
  var W = COLS * CELL, H = ROWS * CELL;

  var SEED = [
    '111111011',
    '111111011',
    '000000011',
    '110000011',
    '110000011',
    '110000011',
    '110000000',
    '110111111',
    '110111111'
  ].map(function (r) { return r.split('').map(Number); });

  var host = document.createElement('a');
  host.className = 'life-badge';
  host.href = 'javascript:void(0)';
  host.setAttribute('aria-label', '关于这个项目');
  host.setAttribute('role', 'button');
  var cv = document.createElement('canvas');
  cv.width = W * 2;
  cv.height = H * 2;
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  host.appendChild(cv);
  document.body.appendChild(host);

  var ctx = cv.getContext('2d');
  ctx.scale(2, 2);

  function blank() {
    var g = [];
    for (var y = 0; y < ROWS; y++) {
      g.push(new Array(COLS).fill(0));
    }
    return g;
  }

  function seedGrid() {
    var g = blank();
    var ox = Math.floor((COLS - SEED[0].length) / 2);
    var oy = Math.floor((ROWS - SEED.length) / 2);
    for (var y = 0; y < SEED.length; y++) {
      for (var x = 0; x < SEED[0].length; x++) {
        g[y + oy][x + ox] = SEED[y][x];
      }
    }
    return g;
  }

  // Conway's Life: B3/S23（Kok's galaxy 是它的周期 8 振荡器）
  function next(g) {
    var out = [], y, x, dy, dx, n, yy, xx;
    for (y = 0; y < ROWS; y++) {
      var row = [];
      for (x = 0; x < COLS; x++) {
        n = 0;
        for (dy = -1; dy <= 1; dy++) {
          for (dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            yy = y + dy; xx = x + dx;
            if (yy < 0 || yy >= ROWS || xx < 0 || xx >= COLS) continue;
            n += g[yy][xx];
          }
        }
        row.push(g[y][x] ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0));
      }
      out.push(row);
    }
    return out;
  }

  var grid = seedGrid();

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.shadowColor = 'rgba(61, 155, 255, 1)';
    ctx.shadowBlur = 7;
    ctx.fillStyle = '#3d9bff';
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        if (!grid[y][x]) continue;
        ctx.fillRect(x * CELL + PAD, y * CELL + PAD, CELL - 1, CELL - 1);
      }
    }
  }

  function step() {
    if (document.hidden) return;
    grid = next(grid);
    draw();
  }

  draw();
  var timer = setInterval(step, 180);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) clearInterval(timer);
    else { clearInterval(timer); timer = setInterval(step, 180); }
  });

  host.addEventListener('click', function (e) {
    e.preventDefault();
    if (window.Q3 && window.Q3.openNote) window.Q3.openNote('hover');
  });
  var hoverTimer = null;
  host.addEventListener('mouseenter', function () {
    clearTimeout(hoverTimer);
    if (window.Q3 && window.Q3.cancelNoteClose) window.Q3.cancelNoteClose();
    hoverTimer = setTimeout(function () {
      if (window.Q3 && window.Q3.openNote) window.Q3.openNote('hover');
    }, 280);
  });
  host.addEventListener('mouseleave', function () {
    clearTimeout(hoverTimer);
    if (window.Q3 && window.Q3.scheduleNoteClose) window.Q3.scheduleNoteClose();
  });
})();

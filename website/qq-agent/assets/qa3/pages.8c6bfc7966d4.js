/* ==========================================================================
   QQ AGENT / DOSSIER 2026 — 页面渲染
   ========================================================================== */
(function () {
  'use strict';
  var Q = window.Q3;
  var qs = Q.qs, qsa = Q.qsa, esc = Q.esc, fmt = Q.fmt, BASE = Q.BASE;
  var PAGE = Q.PAGE;

  /* 雷霆图片：相对路径补全；外链（QQ 图床，带时效签名）直接用 */
  var HS_IMG_BASE = '/qq-agent/holyshits/';
  function hsImg(u) { return /^https?:\/\//.test(u) ? u : HS_IMG_BASE + u; }

  /* ── 公共片段 ─────────────────────────────────────────────────── */
  function phead(o) {
    return '<header class="phead"><div class="shell">' +
      '<div class="kicker"><span class="bar"></span><span class="mono">' + esc(o.kicker) + '</span></div>' +
      '<h1 class="an-title">' + o.title + '</h1>' +
      '<div class="sub"><p data-r>' + o.desc + '</p>' +
      (o.stats || '') +
      '</div></div></header>';
  }

  function hstats(items) {
    return '<div class="hstats">' + items.map(function (s) {
      return '<div><b>' + s[0] + '</b><span>' + esc(s[1]) + '</span></div>';
    }).join('') + '</div>';
  }

  /* ══ 首页 ══════════════════════════════════════════════════════ */
  var TOOL_META = {
    send_message: { name: '发消息', cat: '发言', icon: '💬' },
    send_sticker: { name: '发表情包', cat: '发言', icon: '🎴' },
    send_poke: { name: '戳一戳', cat: '发言', icon: '👆' },
    get_recent_messages: { name: '翻聊天记录', cat: '查看', icon: '📜' },
    get_message_detail: { name: '看消息详情', cat: '查看', icon: '🔍' },
    get_message_images: { name: '看图片', cat: '查看', icon: '🖼️' },
    get_active_members: { name: '看活跃群友', cat: '查看', icon: '👥' },
    list_stickers: { name: '列表情库', cat: '表情', icon: '📚' },
    get_sticker_image: { name: '看表情图', cat: '表情', icon: '🖼️' },
    collect_sticker: { name: '收藏表情', cat: '表情', icon: '⭐' },
    sticker_note: { name: '备注表情', cat: '表情', icon: '📝' },
    memory_append: { name: '记一条', cat: '记忆', icon: '🧠' },
    memory_query: { name: '查记忆', cat: '记忆', icon: '🧠' },
    memory_remove: { name: '删记忆', cat: '记忆', icon: '🧹' },
    web_search: { name: '联网搜索', cat: '联网', icon: '🌐' },
    web_fetch: { name: '抓网页', cat: '联网', icon: '🔗' },
    report_feedback: { name: '汇报反馈', cat: '其他', icon: '📣' },
    finish: { name: '结束本次', cat: '其他', icon: '🏁' }
  };
  var CAT_ORDER = ['发言', '查看', '表情', '记忆', '联网', '其他'];

  var CAPS = [
    { icon: '01', t: '每次触发都是新会话', d: '不攒上下文，token 按次记账，账单能精确到是哪一句花的。', k: 'CORE · 默认开启' },
    { icon: '02', t: '记得住人和事', d: '群友的偏好、群里发生过的梗，存在本地，随时能查能改。', k: 'MEMORY' },
    { icon: '03', t: '响应档位四档', d: '只回艾特 / 关键词 / 随机插话 / 全响应，每个群单独设。', k: 'STRATEGY' },
    { icon: '04', t: '人设可换', d: '自带「小鲸鱼」，也能写自己的；换一套就是另一个性格。', k: 'PERSONA' },
    { icon: '05', t: '能上网，也能看图', d: '接搜索、读网页、看图片；表情包、戳一戳、撤回这些群玩法都在。', k: 'TOOLS' },
    { icon: '06', t: '账单看得懂', d: '按天 / 会话 / 模型三个维度看用量，缓存命中率也标出来。', k: 'COST' },
    { icon: '07', t: '不想理的人可以不存', d: '屏蔽名单里的消息不存档、不触发、不进提示词。', k: 'PRIVACY' },
    { icon: '08', t: '装在自己电脑上', d: '不需要另外租服务器，托盘常驻，开机自启。', k: 'LOCAL' }
  ];

  var WHY = [
    ['十分钟跑起来', '下载、安装、扫码，全程图形界面，命令行一次都不用开。'],
    ['不用写代码', '所有配置都在控制台里点选，改错了随时改回来。'],
    ['花多少看多少', '每次调用的 token 与成本实时可见。'],
    ['数据在你自己手里', '消息、记忆都存在本地，导出随时可行。'],
    ['主题能换', '亮色、暗色、跟随系统，还有一个动效拉满的整活主题。'],
    ['跟着群里的用法长', '功能按真实使用反馈迭代，应用内自带更新检查。']
  ];

  var STEPS = [
    ['下载安装', '运行安装包，装完自动打开控制台。'],
    ['扫码登录', '用机器人 QQ 号扫码，协议端自动连接。'],
    ['填 API Key', '在设置里填入模型服务商的 Key，挑一个模型。'],
    ['拉群开聊', '把机器人拉进群，艾特它就开始工作了。']
  ];

  var TAPE = [
    'LOCAL-FIRST', 'MEMORY', 'PER-CALL BILLING', 'PERSONA', 'PLUGINS', 'WEB SEARCH', 'BLOCKLIST', 'OPEN SOURCE'
  ];

  function secHead(num, title, note, scale) {
    return '<div class="shell"><div class="sec-head">' +
      '<span class="sec-num">' + num + '</span>' +
      '<h2 data-rc>' + title + '</h2>' +
      '<span class="scale">' + (scale || 'SCALE 1:1') + '</span>' +
      (note ? '<p class="note" data-r>' + note + '</p>' : '') +
    '</div></div>';
  }

  // 逐字拆开（手工拆，避免 SplitText 把嵌套的 .ac 拆坏）
  function ch(str) {
    return str.split('').map(function (c) {
      return c === ' ' ? '<span class="ch sp"> </span>' : '<span class="ch">' + esc(c) + '</span>';
    }).join('');
  }

  var WAVE = '<div class="dim" aria-hidden="true"><i></i><span>FIG.02 &nbsp;·&nbsp; <b>1480</b> × <b>900</b> REFERENCE GRID</span><i></i></div>';

  function home() {
    var epoch = Q.epoch();
    var v = qs('#view');
    v.innerHTML =
      /* 00 首屏 */
      '<header class="hero">' +
        '<div class="hero-scene">' +
          '<span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>' +
          '<div class="bubbles" id="bubbles"></div>' +
        '</div>' +
        '<div class="hero-meta" aria-hidden="true">' +
          '<span>SHEET 00</span><span>SCALE 1:1</span><span>2026.10</span>' +
        '</div>' +
        '<div class="shell hero-grid">' +
          '<div class="hero-main">' +
            '<p class="hero-eyebrow"><span class="pulse"></span>LOCAL-FIRST · WINDOWS · v0.4 PREVIEW</p>' +
            '<h1 class="hero-title">' +
              '<span class="lw"><span class="li">' + ch('把肥鱼装进') + '</span></span>' +
              '<span class="lw"><span class="li">' + ch('你的 ') + '<span class="ac mark">QQ 群</span></span></span>' +
            '</h1>' +
            '<div class="hero-sub">' +
              '<p class="lead" data-up>本地跑、有控制台、记得住人，按次计费。一只住在你群里的 AI 鱼。</p>' +
              '<div class="hero-cta" data-up>' +
                '<a class="btn solid" href="https://kondius.cn/qq-agent/QQ-Agent-V0.4-Preview-Setup.exe" download>下载安装包 <span class="ico">↓</span></a>' +
                '<a class="btn" href="https://github.com/K0nd1us/QQ-agent" target="_blank" rel="noopener">GitHub <span class="ico">↗</span></a>' +
                '<a class="btn" href="https://space.bilibili.com/14464411" target="_blank" rel="noopener">' +
                  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px">' +
                    '<rect x="3.5" y="7.5" width="17" height="11" rx="2.6"/><path d="M7.4 4l2.8 3M16.6 4l-2.8 3"/><path d="M9.3 11.4v3M14.7 11.4v3"/>' +
                  '</svg>B站 <span class="ico">↗</span></a>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<aside class="hero-spec">' +
            '<div class="spec-row"><span>PLATFORM</span><b>Windows · Electron</b></div>' +
            '<div class="spec-row"><span>SIZE</span><b>约 80 MB</b></div>' +
            '<div class="spec-row"><span>DEPLOY</span><b>本地直连</b></div>' +
            '<div class="spec-row"><span>BILLING</span><b>按次计费</b></div>' +
            '<div class="spec-foot"><span class="mono">SCROLL</span><span class="ar">↓</span></div>' +
          '</aside>' +
        '</div>' +
        '<div class="shell"><div class="hero-scale">' +
          '<div class="ticks"></div>' +
          '<div class="lbls"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>' +
        '</div></div>' +
      '</header>' +

      /* 跑马灯：倾斜出血，主带 + 描边幽灵带 */
      '<div class="tape-wrap">' +
        '<div class="tape ghost" aria-hidden="true"><div class="tape-in">' +
          TAPE.map(function (t) { return '<span>' + t + ' <i>✦</i></span>'; }).join('') +
        '</div></div>' +
        '<div class="tape" id="tape"><div class="tape-in">' +
          TAPE.map(function (t) { return '<span>' + t + ' <i>✦</i></span>'; }).join('') +
          '<span>🐟 <i>✦</i></span>' +
        '</div></div>' +
      '</div>' +

      /* 01 遥测 */
      '<section class="blk t-blue" id="stats">' +
        secHead('01', '我靠怎么火了', '匿名用量遥测聚合：只有计数，不含身份信息。', 'TELEMETRY / 01') +
        '<div class="shell">' +
          '<div class="stats-grid" id="statGrid">' +
            cell('USERS', '位用户正在使用', '上传过调用记录') +
            cell('CALLS', '累计调用次数', '每次工具调用算一次') +
            cell('INPUT', '累计输入 token', '含提示词与记忆') +
            cell('OUTPUT', '累计输出 token', '模型生成的内容') +
          '</div>' +
        '</div>' +
      '</section>' +

      /* 02 工具 */
      '<section class="blk" id="sec-tools">' +
        secHead('02', '它到底在<br>干什么活。', '与程序内「调用明细」同口径。条形按调用量归一，短的只是用得少。', 'TOOL CALLS / 02') +
        '<div class="shell"><div class="toolwrap">' +
          '<div class="bar-dots"><i></i><i></i><i></i><span>qq-agent / tool-calls.log</span></div>' +
          '<div class="tools" id="tools"><div class="loading"><i></i>LOADING TELEMETRY</div></div>' +
        '</div></div>' +
      '</section>' +

      WAVE +

      /* 03 能力 */
      '<section class="blk" id="caps">' +
        secHead('03', '八件小事，<br>装好就都会。', '', 'CAPABILITIES / 03') +
        '<div class="shell"><div class="bento">' +
          CAPS.map(function (c) {
            return '<article class="ben' + (c.wide ? ' wide' : '') + '">' +
              '<span class="bi">' + c.icon + '</span>' +
              '<h3>' + esc(c.t) + '</h3>' +
              '<p>' + esc(c.d) + '</p>' +
              '<div class="bk"><span class="dot"></span>' + esc(c.k) + '</div>' +
            '</article>';
          }).join('') +
        '</div></div>' +
      '</section>' +

      /* 04 部署 */
      '<section class="blk t-lemon" id="sec-steps">' +
        '<div class="shell"><div class="stepwrap">' +
          '<div class="step-left">' +
            '<span class="sec-num" style="display:block;margin-bottom:10px">04 &nbsp;·&nbsp; DEPLOYMENT</span>' +
            '<div class="big" data-r>十分钟<br><em>跑起来。</em></div>' +
            '<p data-r>真的只要四步，全程图形界面。</p>' +
            '<div style="margin-top:20px" data-up><a class="btn sm" href="https://kondius.cn/qq-agent/QQ-Agent-V0.4-Preview-Setup.exe" download>下载安装包 <span class="ico">↓</span></a></div>' +
          '</div>' +
          '<div class="steps" id="steps">' +
            STEPS.map(function (st, i) {
              return '<div class="step" data-step><span class="sn">' + String(i + 1).padStart(2, '0') + '</span>' +
                '<div><h3>' + esc(st[0]) + '</h3><p>' + esc(st[1]) + '</p></div></div>';
            }).join('') +
          '</div>' +
        '</div></div>' +
      '</section>' +

      /* 05 理由 */
      '<section class="blk" id="sec-why">' +
        secHead('05', '用起来是<br>什么感觉。', '不说参数，只说你在群里会遇到的情况。', 'NOTES / 05') +
        '<div class="shell"><div class="why">' +
          WHY.map(function (w, i) {
            return '<article class="why-item" data-up><span class="wn">' + String(i + 1).padStart(2, '0') + '</span>' +
              '<h3>' + esc(w[0]) + '</h3><p>' + esc(w[1]) + '</p></article>';
          }).join('') +
        '</div></div>' +
      '</section>' +

      /* 06 行动 */
      '<section class="blk cta" id="sec-act">' +
        '<div class="shell">' +
          '<div>' +
            '<h2><span>把它</span><span class="out">拉进群</span></h2>' +
            '<p>下载、安装、扫码，三步之后群里就多了一条会接话的鱼。装好了来群里说一声。</p>' +
            '<div class="cta-cta">' +
              '<a class="btn solid" href="https://kondius.cn/qq-agent/QQ-Agent-V0.4-Preview-Setup.exe" download>下载安装包 <span class="ico">↓</span></a>' +
            '</div>' +
          '</div>' +
          '<aside class="cta-side">' +
            '<div class="r"><span>VERSION</span><b>v0.4 Preview</b></div>' +
            '<div class="r"><span>PLATFORM</span><b>Windows 10 / 11</b></div>' +
            '<div class="r"><span>SIZE</span><b>约 80 MB</b></div>' +
            '<div class="r"><span>LICENSE</span><b>免费 · 按量自付</b></div>' +
          '</aside>' +
        '</div>' +
      '</section>';


    // 首屏：整块平滑上浮，跟手、不炸帧
    if (!Q.reduce) {
      // 标题逐字入场（markup 里已经拆好，结构完全可控）
      gsap.from('.hero-title .ch', {
        yPercent: 58, opacity: 0, rotate: 4, scale: .9,
        duration: .95, ease: 'power3.out', stagger: .03, delay: .12
      });
      // 渐变文字整体「刷」出来（拆字会继承 transparent，所以不拆）
      gsap.fromTo('.hero-title .ac',
        { clipPath: 'inset(0% 100% 0% 0%)', yPercent: 12 },
        { clipPath: 'inset(0% -6% 0% 0%)', yPercent: 0, duration: 1.1, ease: 'power3.out', delay: .46 });
      gsap.from('.hero-eyebrow', { y: 14, opacity: 0, duration: .8, ease: 'power3.out', delay: .04 });
      gsap.from('.hero-sub', { y: 22, opacity: 0, duration: .95, ease: 'power3.out', delay: .28 });
      gsap.from('.hero-spec .spec-row', { y: 12, opacity: 0, duration: .7, stagger: .05, ease: 'power3.out', delay: .42 });
      gsap.from('.hero-scale', { scaleX: 0, transformOrigin: 'center', duration: 1.2, ease: 'power2.out', delay: .3 });
    }

    // 背景：三团柔光各自缓慢漂移
    if (!Q.reduce) {
      gsap.to('.blob.b1', { x: 46, y: -34, duration: 19, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.blob.b2', { x: -56, y: 42, duration: 24, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.blob.b3', { x: 38, y: 28, duration: 16, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }
    Q.tape('#tape');
    Q.cardParallax('.ben');
    Q.magneticText('.cta h2', 14);
    Q.scramble('.scale', .1);
    Q.floatIcons('.ben .bi');

    if (!Q.reduce) {
      // 能力卡：平面入场，不倾斜
      ScrollTrigger.batch('.ben', {
        start: 'top 90%',
        onEnter: function (els) {
          gsap.from(els, {
            y: 26, opacity: 0, duration: .75, ease: 'power2.out',
            stagger: .05, overwrite: true, clearProps: 'transform'
          });
        },
        once: true
      });

      // 编号从左侧滑入
      qsa('.sec-num').forEach(function (el) {
        gsap.from(el, {
          x: -26, opacity: 0, duration: .8, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 92%', once: true }
        });
      });

      // CTA 大标题整体翻起
      var ctaH = qs('#sec-act h2');
      if (ctaH) {
        ctaH.style.transformPerspective = '900px';
        gsap.from(ctaH, {
          rotateX: -38, y: 70, opacity: 0, transformOrigin: '50% 100%',
          duration: 1.1, ease: 'power3.out',
          scrollTrigger: { trigger: ctaH, start: 'top 86%', once: true }
        });
      }

      // 滚出首屏时整块「推远」，像镜头往前推
      gsap.to('.hero-grid', {
        scale: .9, y: -50, opacity: .12, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: .6 }
      });

      // 跑马灯：滚动越快，带子甩得越斜
      var tapeEl = qs('#tape');
      if (tapeEl) {
        gsap.set(tapeEl, { rotation: -2.4 });
        var rTo = gsap.quickTo(tapeEl, 'rotation', { duration: .55, ease: 'power2.out' });
        ScrollTrigger.create({
          trigger: '.tape-wrap', start: 'top bottom', end: 'bottom top',
          onUpdate: function (self) {
            rTo(-2.4 + gsap.utils.clamp(-2.4, 2.4, self.getVelocity() / -2400));
          }
        });
      }

      // 首屏：整块内容随鼠标轻微 3D 倾斜（纸张感）
      var hg = qs('.hero-grid');
      if (hg && matchMedia('(hover: hover) and (pointer: fine)').matches) {
        hg.style.transformPerspective = '1400px';
        var hrx = gsap.quickTo(hg, 'rotateX', { duration: .9, ease: 'power3.out' });
        var hry = gsap.quickTo(hg, 'rotateY', { duration: .9, ease: 'power3.out' });
        Q.listen(window, 'pointermove', function (e) {
          var cx = e.clientX / innerWidth - .5;
          var cy = e.clientY / innerHeight - .5;
          hry(cx * 4);
          hrx(-cy * 3);
        }, { passive: true });
      }
    }

    if (!Q.reduce) {
      [['.bento', 34], ['.stats-grid', 26], ['.tools', 30], ['.why', 22]].forEach(function (pair) {
        var el = qs(pair[0]);
        if (!el) return;
        gsap.fromTo(el, { y: pair[1] }, {
          y: -pair[1], ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 1 }
        });
      });
    }

    watchProgress();
    stepsScroll();

    return Q.load('telemetry').then(function (t) {
      if (!Q.isCurrent(epoch)) return;
      fillStats(t);
      fillTools(t);
    }).catch(function () {
      var g = qs('#statGrid');
      if (g) g.innerHTML = '<div class="empty-note" style="grid-column:1/-1">遥测数据暂时取不到</div>';
      var tl = qs('#tools');
      if (tl) tl.innerHTML = '<div class="empty-note">工具明细暂时取不到</div>';
    });
  }

  function cell(k, label, note) {
    return '<div class="stat-cell"><span class="sl">' + k + '</span><b>—</b><span class="note">' + label + '</span>' +
      '<span class="bar"><i></i></span></div>';
  }

  function fillStats(t) {
    if (!t || !t.ok) throw new Error('no telemetry');
    var cells = qsa('#statGrid .stat-cell');
    var data = [
      [t.users, fmt, 1],
      [t.calls, fmt, 1],
      [t.inputTokens, Q.compact, .82],
      [t.outputTokens, Q.compact, .62]
    ];
    cells.forEach(function (c, i) {
      var b = c.querySelector('b');
      var d = data[i];
      Q.count(b, d[0], { fmt: d[1] });
      if (!Q.reduce) {
        gsap.to(c.querySelector('.bar i'), {
          scaleX: d[2], duration: 1.4, ease: 'expo.out', delay: .1 * i,
          scrollTrigger: { trigger: c, start: 'top 88%', once: true }
        });
      } else {
        c.querySelector('.bar i').style.transform = 'scaleX(' + d[2] + ')';
      }
    });
  }

  function fillTools(t) {
    var box = qs('#tools');
    var tools = (t && t.tools) || {};
    var entries = Object.keys(tools).filter(function (k) { return tools[k] > 0; }).map(function (k) {
      return { k: k, n: tools[k], meta: TOOL_META[k] };
    });
    if (!entries.length) { box.innerHTML = '<div class="empty-note">没有工具调用记录</div>'; return; }
    var max = Math.max.apply(null, entries.map(function (e) { return e.n; }));
    var total = entries.reduce(function (a, e) { return a + e.n; }, 0);

    var byCat = {}, comm = [];
    entries.forEach(function (e) {
      if (e.meta) (byCat[e.meta.cat] = byCat[e.meta.cat] || []).push(e);
      else comm.push(e);
    });
    var cats = CAT_ORDER.filter(function (c) { return byCat[c]; });
    Object.keys(byCat).forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); });

    box.innerHTML = cats.map(function (cat) {
      var list = byCat[cat].sort(function (a, b) { return b.n - a.n; });
      var sum = list.reduce(function (a, e) { return a + e.n; }, 0);
      return '<div class="tool-cat">' +
        '<div class="tool-cat-h"><span class="cn">' + esc(cat) + '</span>' +
        '<span class="cs">' + fmt(sum) + ' 次 · ' + Math.round(sum / total * 100) + '%</span></div>' +
        list.map(function (e) {
          return '<div class="trow">' +
            '<span class="ti">▸</span>' +
            '<span class="tn">' + esc(e.meta.name) + '</span>' +
            '<span class="tk">' + esc(e.k) + '</span>' +
            '<span class="tv">' + fmt(e.n) + '</span>' +
            '<span class="tbar" data-w="' + (e.n / max).toFixed(3) + '"></span>' +
          '</div>';
        }).join('') +
      '</div>';
    }).join('');

    if (comm.length) {
      comm.sort(function (a, b) { return b.n - a.n; });
      var csum = comm.reduce(function (a, e) { return a + e.n; }, 0);
      box.insertAdjacentHTML('beforeend',
        '<div class="tools-more"><div class="more-head">' +
          '<span class="mono">社区自定义方法 · ' + comm.length + ' 个 · ' + fmt(csum) + ' 次</span>' +
          '<button class="chip" id="moreBtn" type="button">展开全部 <span class="n">' + Math.round(csum / total * 100) + '%</span></button>' +
        '</div><div class="comm-grid" id="commGrid">' +
          comm.map(function (e) {
            return '<div class="comm-item"><code>' + esc(e.k) + '</code><b>' + fmt(e.n) + '</b></div>';
          }).join('') +
        '</div></div>');
      qs('#moreBtn').addEventListener('click', function () {
        var g = qs('#commGrid'), open = g.classList.toggle('open');
        this.innerHTML = (open ? '收起' : '展开全部') + ' <span class="n">' + Math.round(csum / total * 100) + '%</span>';
        if (open && !Q.reduce) gsap.from(g.children, { opacity: 0, y: 6, duration: .32, stagger: .008, ease: 'power2.out' });
      });
    }

    // 条形：平滑长出
    qsa('.trow .tbar', box).forEach(function (bar, i) {
      var w = parseFloat(bar.dataset.w);
      if (Q.reduce) { bar.style.transform = 'scaleX(' + w + ')'; return; }
      gsap.fromTo(bar, { scaleX: 0 }, {
        scaleX: w, duration: 1.05, ease: 'power2.out', delay: (i % 12) * .025,
        scrollTrigger: { trigger: bar, start: 'top 96%', once: true }
      });
    });
  }

  function watchProgress() {
    var host = qs('.nav-in');
    if (!host) return;
    var p = document.createElement('span');
    p.className = 'nav-prog';
    p.setAttribute('aria-hidden', 'true');
    host.appendChild(p);
    gsap.to(p, {
      scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: .35 }
    });
  }

  function stepsScroll() {
    var steps = qsa('[data-step]');
    // 同一时刻只点亮最近的一条
    function light(idx) {
      steps.forEach(function (s, i) { s.classList.toggle('on', i === idx); });
    }
    steps.forEach(function (s, i) {
      ScrollTrigger.create({
        trigger: s, start: 'top 72%', end: 'bottom 30%',
        onEnter: function () { light(i); },
        onEnterBack: function () { light(i); }
      });
    });
    if (steps.length) light(0);
  }

  /* ══ 意见墙 ════════════════════════════════════════════════════ */
  function comments() {
    var epoch = Q.epoch();
    var v = qs('#view');
    var data = [], likes = {}, sort = 'new', filter = 'all';
    var page = 1;
    var PAGE_SIZE = 20;

    v.innerHTML = phead({
      kicker: 'COMMENTS / 意见墙',
      title: '他们<br>留下的话',
      desc: '来自群友与陌生人的留言，原样保留。也欢迎留下你的建议。提交前需完成人机验证。'
    }) +
    '<div class="shell">' +
      '<div class="toolbar">' +
        '<div class="chips" id="sortChips">' +
          '<button class="chip on" data-s="new">最新</button>' +
          '<button class="chip" data-s="hot">最多赞</button>' +
          '<button class="chip" data-s="rand">随便看一条</button>' +
        '</div>' +
        '<button class="btn sm" id="writeComment" type="button">写留言</button>' +
        '<span class="count" id="count"></span>' +
      '</div>' +
      '<div class="cm-list" id="list"><div class="loading"><i></i>LOADING</div></div>' +
    '</div>';

    return Promise.all([Q.load('comments'), Q.load('commentLikes').catch(function () { return {}; })])
      .then(function (res) {
        if (!Q.isCurrent(epoch)) return;
        data = res[0] || [];
        likes = res[1] || {};
        qs('#count').innerHTML = '共 <b>' + data.length + '</b> 条留言 · 合计 ' +
          '<b>' + fmt(Object.keys(likes).reduce(function (a, k) { return a + (likes[k] || 0); }, 0)) + '</b> 个赞';
        render();
        bind();
      })
      .catch(function (e) {
        qs('#list').innerHTML = '<div class="empty-note">' + esc(e.message) + '</div>';
      });

    function sorted() {
      var list = data.slice();
      if (sort === 'hot') list.sort(function (a, b) { return (likes[b.id] || 0) - (likes[a.id] || 0); });
      else list.sort(function (a, b) { return Number(!!b.pinned)-Number(!!a.pinned) || b.at-a.at; });
      return list;
    }

    function pageCount() { return Math.max(1, Math.ceil(data.length / PAGE_SIZE)); }

    function pagerHtml(cur, total) {
      var out = [];
      var push = function (t, p, dis, on) {
        out.push('<button class="pg-btn' + (on ? ' on' : '') + (dis ? ' dis' : '') +
                 '" type="button" data-pg="' + p + '"' + (dis ? ' disabled' : '') + '>' + t + '</button>');
      };
      push('\u2039', cur - 1, cur <= 1, false);
      // 页码序列：首页/末页恒显，当前页左右各 2 页，其余折叠成省略号。
      // 原来左右各只显 1 页，10 页时只能看到 1 2 10，中间的页没法点。
      var seq = [];
      var span = 2;
      for (var i = 1; i <= total; i++) {
        var near = (i <= 1 + span) || (i >= total - span) || Math.abs(i - cur) <= span;
        if (near) seq.push(i);
        else if (seq[seq.length - 1] !== 0) seq.push(0);
      }
      seq.forEach(function (i) {
        if (!i) out.push('<span class="pg-gap">\u2026</span>');
        else push(String(i), i, false, i === cur);
      });
      push('\u203a', cur + 1, cur >= total, false);
      return '<div class="pager" id="pager">' + out.join('') + '</div>';
    }

    function render() {
      var all = sorted();
      var total = pageCount();
      if (page > total) page = total;
      if (page < 1) page = 1;
      var start = (page - 1) * PAGE_SIZE;
      var list = all.slice(start, start + PAGE_SIZE);
      qs('#count').innerHTML = '共 <b>' + all.length + '</b> 条留言 · 合计 ' +
        '<b>' + fmt(Object.keys(likes).reduce(function (a, k) { return a + (likes[k] || 0); }, 0)) + '</b> 个赞';
      qs('#list').innerHTML = list.map(function (c, i) {
        var n = likes[c.id] || 0;
        return '<article class="cm" data-id="' + esc(c.id) + '">' +
          '<div class="idx"><b>' + String(start + i + 1).padStart(3, '0') + '</b>' + Q.dt(c.at) + '</div>' +
          '<div class="body">' +
            '<div class="who"><b>' + esc(c.nickname || '匿名') + '</b><span class="t">' + Q.ago(c.at) + '</span></div>' +
            '<div class="txt">' + esc(c.text || '') + '</div>' +
            ((c.images || []).length ? '<div class="imgs">' + c.images.map(function (u) {
              return '<img src="https://kondius.cn/qq-agent/comment/' + esc(u) + '" alt="附图" loading="lazy" />';
            }).join('') + '</div>' : '') +
          '</div>' +
          '<div class="side"><button class="like" type="button" data-like="comment" data-id="' + esc(c.id) + '" title="点赞这条"><span class="n">' + n + '</span> △</button></div>' +
        '</article>';
      }).join('');
      var holder = qs('#pgWrap');
      if (!holder) {
        qs('#list').insertAdjacentHTML('afterend', '<div id="pgWrap" style="padding:26px 0 8px"></div>');
        holder = qs('#pgWrap');
      }
      holder.innerHTML = all.length > PAGE_SIZE
        ? pagerHtml(page, total)
        : '<div class="mono" style="text-align:center;font-size:11px;color:var(--ink-faint)">共 ' + all.length + ' 条</div>';
      if (Q.reduce) return;
      gsap.from('#list .cm', {
        y: 16, opacity: 0, duration: .6, ease: 'power3.out', stagger: .02,
        scrollTrigger: { trigger: '#list', start: 'top 96%', once: true }
      });
    }

    function bind() {
      qs('#writeComment').addEventListener('click', function () { openPublish('comment'); });
      qsa('#sortChips .chip').forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.dataset.s === 'rand') {
            // 从全量里随机抽，再算出它在哪一页，跳过去并高亮
            var pool2 = sorted();
            if (!pool2.length) { Q.toast('还没有内容'); return; }
            var pick = pool2[Math.floor(Math.random() * pool2.length)];
            var target = Math.floor(pool2.indexOf(pick) / PAGE_SIZE) + 1;
            if (target !== page) { page = target; render(); }
            var el = qs('.cm[data-id="' + pick.id + '"]');
            if (el) {
              var y = el.getBoundingClientRect().top + window.scrollY - innerHeight * .34;
              if (window.gsap && !Q.reduce) gsap.to(window, { scrollTo: { y: y, autoKill: true }, duration: .9, ease: 'power3.inOut' });
              else window.scrollTo({ top: y, behavior: 'smooth' });
              el.classList.add('flash');
              setTimeout(function () { el.classList.remove('flash'); }, 2400);
              Q.toast('第 ' + page + ' 页 · ' + (pick.nickname || '匿名'));
            }
            return;
          }
          sort = b.dataset.s;
          page = 1;
          qsa('#sortChips .chip').forEach(function (x) { x.classList.toggle('on', x === b); });
          render();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });

      Q.listen(qs('#view'), 'click', function (e) {
        var pb = e.target.closest('[data-pg]');
        if (!pb || pb.disabled) return;
        var p = parseInt(pb.dataset.pg, 10);
        if (!p || p === page) return;
        page = p;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  /* ══ 雷霆语录 ══════════════════════════════════════════════════ */
  function holyshits() {
    var epoch = Q.epoch();
    var v = qs('#view');
    var data = [], likes = {}, sort = 'new';
    var page = 1;
    var PAGE_SIZE = 10;

    v.innerHTML = phead({
      kicker: 'TRANSCRIPTS / 雷霆语录',
      title: '群里出现过的<br>那些话',
      desc: '一条鱼在群里说过的话，以及群友们的回应。按聊天片段归档，原样搬运。'
    }) +
    '<div class="shell">' +
      '<div class="toolbar">' +
        '<div class="chips" id="sortChips">' +
          '<button class="chip on" data-s="new">最新</button>' +
          '<button class="chip" data-s="hot">最热</button>' +
          '<button class="chip" data-s="rand">随机穿越</button>' +
        '</div>' +
        '<span class="count" id="count"></span>' +
      '</div>' +
      '<div class="sc-list" id="list"><div class="loading"><i></i>LOADING</div></div>' +
      '<div style="padding:34px 0 10px;text-align:center"><button class="btn sm" id="more" type="button">加载更多 <span class="ico">↓</span></button></div>' +
    '</div>';

    qsa('#sortChips .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.s === 'rand') {
          // 从全量里随机抽，算出它在哪一页，跳过去并高亮
          var pool = sorted();
          if (!pool.length) { Q.toast('还没有内容'); return; }
          var pick = pool[Math.floor(Math.random() * pool.length)];
          var target = Math.floor(pool.indexOf(pick) / PAGE_SIZE) + 1;
          if (target !== page) { page = target; render(); }
          var el = qs('.sc[data-id="' + pick.id + '"]');
          if (el) {
            var y = el.getBoundingClientRect().top + window.scrollY - innerHeight * .18;
            if (window.gsap && !Q.reduce) gsap.to(window, { scrollTo: { y: y, autoKill: true }, duration: .9, ease: 'power3.inOut' });
            else window.scrollTo({ top: y, behavior: 'smooth' });
            el.classList.add('flash');
            setTimeout(function () { el.classList.remove('flash'); }, 2400);
            Q.toast('第 ' + page + ' 页 · ' + (pick.messages && pick.messages[0] && pick.messages[0].text || '').slice(0, 32));
          }
          return;
        }
        sort = b.dataset.s;
        page = 1;
        qsa('#sortChips .chip').forEach(function (x) { x.classList.toggle('on', x === b); });
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    Q.listen(qs('#view'), 'click', function (e) {
      var pb = e.target.closest('[data-pg]');
      if (!pb || pb.disabled) return;
      var p = parseInt(pb.dataset.pg, 10);
      if (!p || p === page) return;
      page = p;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    return Promise.all([Q.load('holyshits'), Q.load('holyshitsLikes').catch(function () { return {}; })])
      .then(function (res) {
        if (!Q.isCurrent(epoch)) return;
        data = res[0] || [];
        likes = res[1] || {};
        var totalLikes = Object.keys(likes).reduce(function (a, k) { return a + (likes[k] || 0); }, 0);
        qs('#count').innerHTML = '共 <b>' + data.length + '</b> 段对话 · 合计 <b>' + fmt(totalLikes) + '</b> 个赞';
        render();
      })
      .catch(function (e) { qs('#list').innerHTML = '<div class="empty-note">' + esc(e.message) + '</div>'; });

    function sorted() {
      var list = data.slice();
      if (sort === 'hot') list.sort(function (a, b) { return (likes[b.id] || 0) - (likes[a.id] || 0); });
      else list.sort(function (a, b) { return Number(!!b.pinned)-Number(!!a.pinned) || b.at-a.at; });
      return list;
    }

    function pageCount() { return Math.max(1, Math.ceil(data.length / PAGE_SIZE)); }

    function pagerHtml(cur, total) {
      var out = [];
      var push = function (t, p, dis, on) {
        out.push('<button class="pg-btn' + (on ? ' on' : '') + (dis ? ' dis' : '') +
                 '" type="button" data-pg="' + p + '"' + (dis ? ' disabled' : '') + '>' + t + '</button>');
      };
      push('\u2039', cur - 1, cur <= 1, false);
      // 页码序列：首页/末页恒显，当前页左右各 2 页，其余折叠成省略号。
      // 原来左右各只显 1 页，10 页时只能看到 1 2 10，中间的页没法点。
      var seq = [];
      var span = 2;
      for (var i = 1; i <= total; i++) {
        var near = (i <= 1 + span) || (i >= total - span) || Math.abs(i - cur) <= span;
        if (near) seq.push(i);
        else if (seq[seq.length - 1] !== 0) seq.push(0);
      }
      seq.forEach(function (i) {
        if (!i) out.push('<span class="pg-gap">\u2026</span>');
        else push(String(i), i, false, i === cur);
      });
      push('\u203a', cur + 1, cur >= total, false);
      return '<div class="pager" id="pager">' + out.join('') + '</div>';
    }

    function render() {
      var all = sorted();
      var total = pageCount();
      if (page > total) page = total;
      if (page < 1) page = 1;
      var start = (page - 1) * PAGE_SIZE;
      var list = all.slice(start, start + PAGE_SIZE);
      qs('#count').innerHTML = '共 <b>' + all.length + '</b> 段对话 · 第 <b>' + page + '</b>/' + total + ' 页 · 合计 <b>' +
        fmt(Object.keys(likes).reduce(function (a, k) { return a + (likes[k] || 0); }, 0)) + '</b> 个赞';
      // 服务端 replies 灌进评论缓存，展开时才不会「旧评论消失」
      list.forEach(function (s) {
        if (s.replies && s.replies.length && Q3.rememberReplies) Q3.rememberReplies(s.id, s.replies);
      });
      qs('#list').innerHTML = list.map(function (s) {
        var n = likes[s.id] || 0;
        return '<article class="sc" data-id="' + esc(s.id) + '">' +
          '<div class="meta">' +
            '<div class="d">' + Q.dt(s.at) + '</div>' +
            '<button class="lk" type="button" data-like="holyshits" data-id="' + esc(s.id) + '" title="点赞这条">🐟 <b>' + n + '</b></button>' +
            '<div class="chat" title="' + esc(s.chatName || '') + '">' + esc(s.chatName || '未知群聊') + '</div>' +
          '</div>' +
          '<div class="msgs">' + (s.messages || []).slice(0, 12).map(function (m) {
            var media = (m.media || []).filter(function (x) {
              return x && x.url && (x.kind === 'image' || /image/.test(x.kind || ''));
            });
            var imgs = media.map(function (x) {
              var u = hsImg(x.url);
              return '<a class="hs-img" href="' + esc(u) + '" target="_blank" rel="noopener">' +
                '<img src="' + esc(u) + '" loading="lazy" alt="聊天图片" /></a>';
            }).join('');
            return '<div class="msg' + (m.self ? ' self' : '') + '">' +
              '<span class="who">' + esc(m.senderName || '?') + '</span>' +
              '<span class="bub">' + esc(m.text || '').replace(/\[图片\]/g, '').trim() + imgs + '</span>' +
            '</div>';
          }).join('') + '</div>' +
        '<div class="sc-cmt">' +
          '<button class="cmt-toggle" type="button" data-cmt="' + esc(s.id) + '">💬 评论 <b>' + ((s.replies || []).length) + '</b></button>' +
        '</div>' +
        '<div class="cmt-box" id="cmt-' + esc(s.id) + '" hidden></div>' +
        '</article>';
      }).join('');
      var more = qs('#more');
      if (more) more.style.display = 'none';
      var holder = qs('#pgWrap');
      if (!holder) {
        qs('#list').insertAdjacentHTML('afterend', '<div id="pgWrap" style="padding:26px 0 8px"></div>');
        holder = qs('#pgWrap');
      }
      holder.innerHTML = all.length > PAGE_SIZE
        ? pagerHtml(page, total)
        : '<div class="mono" style="text-align:center;font-size:11px;color:var(--ink-faint)">共 ' + all.length + ' 段</div>';
      if (!Q.reduce) {
        gsap.from('#list .sc', {
          y: 16, opacity: 0, duration: .6, ease: 'power3.out', stagger: .025,
          scrollTrigger: { trigger: '#list', start: 'top 96%', once: true }
        });
      }
    }

  }

  /* ══ 人设广场 ══════════════════════════════════════════════════ */
  function personas() {
    var epoch = Q.epoch();
    var v = qs('#view');
    var items = [], q = '', cat = 'all', onlyPrompt = false, sort = 'new', mine = false;
    var CATS = [['all', '全部'], ['companion', '陪伴型'], ['roleplay', '角色扮演'], ['utility', '实用助手'], ['custom', '自定义']];

    v.innerHTML = phead({
      kicker: 'PERSONA / 人设广场',
      title: '它先成为<br>「谁」',
      desc: '社区分享的人设与系统提示词。复制走就能用，也可以把自己的角色卡传上来。'
    }) +
    '<div class="shell">' +
      '<div class="toolbar">' +
        '<div class="field"><span class="k">FIND</span><input id="q" placeholder="搜名称、描述或作者…" /></div>' +
        '<div class="chips" id="cats">' + CATS.map(function (c, i) {
          return '<button class="chip' + (i === 0 ? ' on' : '') + '" data-c="' + c[0] + '">' + c[1] + '</button>';
        }).join('') + '</div>' +
        '<button class="chip chip-mine" id="mineChip" type="button" hidden>👤 我发布的</button>' +
        '<button class="btn sm" id="publishEntry" type="button">发布作品</button>' +
        '<select class="sel" id="sort"><option value="new">最新更新</option><option value="name">按名称</option></select>' +
        '<span class="count" id="count"></span>' +
      '</div>' +
      '<div class="pg-grid" id="grid"><div class="loading"><i></i>LOADING</div></div>' +
    '</div>';

    return Q.load('personas').then(function (d) {
      if (!Q.isCurrent(epoch)) return;
      items = (d && d.items) || [];
      qs('#count').innerHTML = '共 <b>' + items.length + '</b> 张人设卡';
      render();
      bind();
    }).catch(function (e) {
      qs('#grid').innerHTML = '<div class="empty-note" style="grid-column:1/-1">' + esc(e.message) + '</div>';
    });

    function filtered() {
      var kw = q.trim().toLowerCase();
      var myId = mine && Q3.me ? (Q3.me().id || '') : '';
      return items.filter(function (x) {
        if (mine && myId && x.authorId !== myId) return false;
        if (cat !== 'all' && x.category !== cat) return false;
        if (onlyPrompt && !x.hasPrompt) return false;
        if (!kw) return true;
        return ((x.title || '') + ' ' + (x.description || '') + ' ' + (x.author || '') + ' ' + x.id).toLowerCase().indexOf(kw) >= 0;
      }).sort(function (a, b) {
        if (sort === 'name') return String(a.title || a.id).localeCompare(String(b.title || b.id), 'zh');
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      });
    }

    function render() {
      var list = filtered();
      var grid = qs('#grid');
      grid.innerHTML = list.length ? list.map(function (x, i) {
        return '<article class="pg" data-id="' + esc(x.id) + '" data-cursor="展开">' +
          '<div class="top"><span class="no">' + String(i + 1).padStart(3, '0') + '</span>' +
          '<span class="cat">' + esc(x.category || 'custom') + '</span></div>' +
          '<h3>' + esc(x.title || '未命名人设') + '</h3>' +
          '<p>' + esc(x.description || '一张来自社区的人设卡。') + '</p>' +
          '<div class="pfoot"><span class="au">' + esc(x.author || '社区用户') + ' · ' + (x.hasPrompt ? '含提示词' : '无提示词') + '</span>' +
          '<button class="cp" data-copy="' + esc(x.id) + '" type="button">复制</button></div>' +
        '</article>';
      }).join('') : '<div class="empty-note" style="grid-column:1/-1">没有匹配的人设</div>';
      qs('#count').innerHTML = '筛出 <b>' + list.length + '</b> / ' + items.length;
      if (!Q.reduce) {
        gsap.from('#grid .pg', { y: 14, opacity: 0, duration: .6, ease: 'power3.out', stagger: .018 });
      }
    }

    function bind() {
      qs('#publishEntry').addEventListener('click', function () { openPublish('personas'); });
      qs('#q').addEventListener('input', function (e) { q = e.target.value; render(); });
      qs('#sort').addEventListener('change', function (e) { sort = e.target.value; render(); });
      var mc = qs('#mineChip');
      if (mc) {
        var syncMine = function () {
          var ok = !!(Q3.me && Q3.me());
          mc.hidden = !ok;
          if (!ok && mine) { mine = false; mc.classList.remove('on'); }
        };
        syncMine();
        Q.listen(document, 'q3:auth', function () { syncMine(); render(); });
        mc.addEventListener('click', function () {
          if (!(Q3.me && Q3.me())) { Q.openAuth('login'); return; }
          mine = !mine;
          mc.classList.toggle('on', mine);
          render();
        });
      }
      qsa('#cats .chip').forEach(function (b) {
        b.addEventListener('click', function () {
          cat = b.dataset.c;
          qsa('#cats .chip').forEach(function (x) { x.classList.toggle('on', x === b); });
          render();
        });
      });
      qs('#grid').addEventListener('click', function (e) {
        // 复制按钮优先，且 stopPropagation：只复制，不开抽屉
        var cp = e.target.closest('[data-copy]');
        if (cp) { e.stopPropagation(); copyPrompt(cp.dataset.copy); return; }
        var card = e.target.closest('.pg');
        if (!card) return;
        openPersona(card.dataset.id);
      });
    }

    /* 拉完整提示词正文（列表接口不含 prompt，需单独取） */
    function fetchPrompt(ident) {
      return fetch('/api/community/personas/' + encodeURIComponent(ident) + '/prompt',
                   { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) { return (d && d.prompt) || ''; });
    }

    function copyPrompt(ident) {
      fetchPrompt(ident).then(function (txt) {
        if (!txt) { Q.toast('这张人设没有提示词正文'); return; }
        if (navigator.clipboard) navigator.clipboard.writeText(txt)
          .then(function () { Q.toast('提示词已复制（' + txt.length + ' 字）'); })
          .catch(function () { Q.toast('复制失败，请手动选择'); });
        else Q.toast('提示词 ' + txt.length + ' 字，浏览器不支持自动复制');
      }).catch(function (err) {
        Q.toast('获取提示词失败：' + ((err && err.message) || err));
      });
    }

    /* 点卡片 -> 右侧抽屉展示完整提示词（不再原地撑宽卡片） */
    function openPersona(ident) {
      var it = null;
      for (var i = 0; i < items.length; i++) if (items[i].id === ident) { it = items[i]; break; }
      if (!it) return;

      openDrawer({
        id: it.id,
        name: it.title || it.id,
        title: it.title || it.id,
        description: it.description || '暂无描述',
        version: '', category: it.category, categoryName: it.category,
        author: it.author, updatedAt: it.updatedAt, downloads: 0,
        __persona: true
      }, {
        kicker: 'PERSONA / 人设',
        kind: 'persona',
        body: '<div class="persona-loading"><i></i>LOADING PROMPT</div>',
        foot: '<button class="btn sm" id="cpPrompt" type="button">复制提示词 <span class="ico">⧉</span></button>'
      }, function (body) {
        body.innerHTML =
          '<p>' + esc(it.description || '暂无描述') + '</p>' +
          '<dl>' +
            '<div><dt>分类</dt><dd>' + esc(it.category || '自定义') + '</dd></div>' +
            '<div><dt>作者</dt><dd>' + esc(it.author || '社区用户') + '</dd></div>' +
            '<div><dt>更新</dt><dd>' + Q.dt(it.updatedAt) + '</dd></div>' +
            '<div><dt>字数</dt><dd id="pwLen">—</dd></div>' +
          '</dl>' +
          '<div class="prompt-box"><pre id="promptText" class="mono">加载中…</pre></div>';
        var pre = body.querySelector('#promptText');
        fetchPrompt(it.id).then(function (txt) {
          pre.textContent = txt || '（这张人设没有提示词正文）';
          var len = body.querySelector('#pwLen');
          if (len) len.textContent = (txt || '').length + ' 字';
          pre.classList.remove('loading');
        }).catch(function (err) {
          pre.textContent = '加载失败：' + ((err && err.message) || err);
        });
        var cp = body.querySelector('#cpPrompt');
        if (cp) cp.addEventListener('click', function () { copyPrompt(it.id); });
      });
    }
  }

  /* ══ 市场（Skill / 插件共用） ══════════════════════════════════ */
  function market(cfg) {
    var epoch = Q.epoch();
    var v = qs('#view');
    var items = [], cats = {}, tags = null, q = '', cat = 'all', sort = 'dl', funcs = [], traits = [], mine = false;

    v.innerHTML = phead({
      kicker: cfg.kicker,
      title: cfg.title,
      desc: cfg.desc
    }) +
    '<div class="shell">' +
      '<div class="toolbar">' +
        '<div class="field"><span class="k">FIND</span><input id="q" placeholder="搜名称、描述、作者或 ID…" /></div>' +
        '<div class="chips" id="cats"></div>' +
        '<button class="chip chip-mine" id="mineChip" type="button" hidden>👤 我发布的</button>' +
        '<button class="btn sm" id="publishEntry" type="button">发布作品</button>' +
        '<select class="sel" id="sort"><option value="dl">按下载量</option><option value="new">最近更新</option><option value="name">按名称</option></select>' +
        '<span class="count" id="count"></span>' +
      '</div>' +
      '<div class="chips" id="tags" style="padding:14px 0 6px"></div>' +
      '<div class="mk" id="list"><div class="loading"><i></i>LOADING</div></div>' +
      '<div style="padding:34px 0;text-align:center" id="moreWrap"></div>' +
    '</div>';

    return Promise.all([Q.load(cfg.key), Q.load('tags').catch(function () { return null; })])
      .then(function (res) {
        if (!Q.isCurrent(epoch)) return;
        var d = res[0] || {};
        items = d.items || [];
        cats = d.categories || {};
        tags = res[1];
        buildCats();
        buildTags();
        render();
        bind();
      })
      .catch(function (e) {
        qs('#list').innerHTML = '<div class="empty-note">' + esc(e.message) + '</div>';
      });

    function buildCats() {
      var keys = Object.keys(cats);
      qs('#cats').innerHTML = '<button class="chip on" data-c="all">全部</button>' + keys.map(function (k) {
        return '<button class="chip" data-c="' + esc(k) + '">' + esc(cats[k]) + '</button>';
      }).join('');
      qsa('#cats .chip').forEach(function (b) {
        b.addEventListener('click', function () {
          cat = b.dataset.c;
          qsa('#cats .chip').forEach(function (x) { x.classList.toggle('on', x === b); });
          render();
        });
      });
    }

    function tagMap() {
      if (!tags) return null;
      var m = tags[cfg.tagKey];
      return m || null;
    }

    function buildTags() {
      var m = tagMap();
      if (!m || !tags.funcDefs) return;
      var count = {};
      Object.keys(m).forEach(function (id) {
        (m[id].f || []).forEach(function (k) { count[k] = (count[k] || 0) + 1; });
      });
      var keys = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; }).slice(0, 8);
      if (!keys.length) return;
      qs('#tags').innerHTML = keys.map(function (k) {
        var d = tags.funcDefs[k] || {};
        return '<button class="chip" data-f="' + esc(k) + '">' + esc(d.name || k) + ' <span class="n">' + count[k] + '</span></button>';
      }).join('') + (funcs.length ? '' : '');
      qsa('#tags .chip').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.dataset.f;
          var i = funcs.indexOf(k);
          if (i >= 0) funcs.splice(i, 1); else funcs.push(k);
          b.classList.toggle('on');
          render();
        });
      });
    }

    function filtered() {
      var kw = q.trim().toLowerCase();
      var m = tagMap();
      var myId = mine && Q3.me ? (Q3.me().id || '') : '';
      return items.filter(function (x) {
        if (mine && myId && x.authorId !== myId) return false;
        if (cat !== 'all' && x.category !== cat) return false;
        if (kw && ((x.name || '') + ' ' + (x.description || '') + ' ' + (x.author || '') + ' ' + x.id).toLowerCase().indexOf(kw) < 0) return false;
        if (funcs.length && m) {
          var fs = (m[x.id] && m[x.id].f) || [];
          for (var i = 0; i < funcs.length; i++) if (fs.indexOf(funcs[i]) < 0) return false;
        }
        return true;
      }).sort(function (a, b) {
        if (sort === 'name') return String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh');
        if (sort === 'new') return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        return (b.downloads || 0) - (a.downloads || 0);
      });
    }

    function render() {
      var list = filtered();
      qs('#list').innerHTML = list.length ? list.slice(0, 60).map(function (x, i) {
        return '<article class="mrow" data-id="' + esc(x.id) + '" data-cursor="打开">' +
          '<span class="n">' + String(i + 1).padStart(3, '0') + '</span>' +
          '<div class="mname"><span class="nm">' + esc(x.name || x.id) + '</span>' +
            '<span class="mcat">' + esc(x.categoryName || cats[x.category] || x.category || '其他') + '</span></div>' +
          '<div class="ds mdesc">' + esc(x.description || '暂无描述') + '</div>' +
          '<div class="mt">v' + esc(x.version || '0.0.0') + '<br><i>' + Q.dt(x.updatedAt) + '</i></div>' +
        '</article>';
      }).join('') : '<div class="empty-note">没有匹配的条目，试试放宽筛选</div>';
      qs('#count').innerHTML = '筛出 <b>' + list.length + '</b> / ' + items.length;
      qs('#moreWrap').innerHTML = list.length > 60
        ? '<button class="btn sm" id="moreBtn" type="button">显示全部（还有 ' + (list.length - 60) + ' 个）</button>'
        : '';
      var mb = qs('#moreBtn');
      if (mb) mb.addEventListener('click', function () { qs('#moreWrap').innerHTML = ''; renderAll(list); });
      if (!Q.reduce) {
        gsap.from('#list .mrow', { y: 12, opacity: 0, duration: .55, ease: 'power3.out', stagger: .012 });
      }
    }

    function renderAll(list) {
      qs('#list').innerHTML = list.map(function (x, i) {
        return '<article class="mrow" data-id="' + esc(x.id) + '" data-cursor="打开">' +
          '<span class="n">' + String(i + 1).padStart(3, '0') + '</span>' +
          '<div class="mname"><span class="nm">' + esc(x.name || x.id) + '</span>' +
            '<span class="mcat">' + esc(x.categoryName || cats[x.category] || x.category || '其他') + '</span></div>' +
          '<div class="ds mdesc">' + esc(x.description || '暂无描述') + '</div>' +
          '<div class="mt">v' + esc(x.version || '0.0.0') + '<br><i>' + Q.dt(x.updatedAt) + '</i></div>' +
        '</article>';
      }).join('');
    }

    function bind() {
      qs('#publishEntry').addEventListener('click', function () { openPublish(cfg.key); });
      qs('#q').addEventListener('input', function (e) { q = e.target.value; render(); });
      qs('#sort').addEventListener('change', function (e) { sort = e.target.value; render(); });
      var mc = qs('#mineChip');
      if (mc) {
        // 未登录时按钮隐藏；登录/登出后自动刷新显隐
        var syncMine = function () {
          var ok = !!(Q3.me && Q3.me());
          mc.hidden = !ok;
          if (!ok && mine) { mine = false; mc.classList.remove('on'); }
        };
        syncMine();
        Q.listen(document, 'q3:auth', function () { syncMine(); render(); });
        mc.addEventListener('click', function () {
          if (!(Q3.me && Q3.me())) { Q.openAuth('login'); return; }
          mine = !mine;
          mc.classList.toggle('on', mine);
          render();
        });
      }
      qs('#list').addEventListener('click', function (e) {
        var row = e.target.closest('.mrow');
        if (!row) return;
        var item = items.filter(function (x) { return x.id === row.dataset.id; })[0];
        if (item) openDrawer(item, cfg);
      });
    }
  }

  function openDrawer(x, cfg, onReady) {
    var old = qs('.drawer'); if (old) old.remove();
    var oldScrim = qs('.scrim'); if (oldScrim) oldScrim.remove();
    var scrim = document.createElement('div');
    scrim.className = 'scrim';
    var d = document.createElement('aside');
    d.className = 'drawer';
    d.innerHTML =
      '<div class="drawer-head">' +
        '<div><span class="mono">' + esc(cfg.kicker.split(' / ')[0]) + ' · ' + esc(x.id) + '</span>' +
        '<h3 class="h2" style="margin-top:10px">' + esc(x.name || x.id) + '</h3></div>' +
        '<button class="modal-x" type="button">关闭</button>' +
      '</div>' +
      '<div class="drawer-body">' +
        (cfg.body !== undefined ? cfg.body :
        ('<p>' + esc(x.description || '暂无描述') + '</p>' +
        '<dl>' +
          '<div><dt>版本</dt><dd>v' + esc(x.version || '0.0.0') + '</dd></div>' +
          '<div><dt>分类</dt><dd>' + esc(x.categoryName || x.category || '其他') + '</dd></div>' +
          '<div><dt>作者</dt><dd>' + esc(x.author || '未署名') + '</dd></div>' +
          '<div><dt>更新</dt><dd>' + Q.dt(x.updatedAt) + '</dd></div>' +
          '<div><dt>下载</dt><dd>' + fmt(x.downloads || 0) + '</dd></div>' +
          (x.installCode ? '<div><dt>安装口令</dt><dd style="font-family:var(--ff-m);font-size:10.5px;word-break:break-all">' + esc(x.installCode) + '</dd></div>' : '') +
        '</dl>' +
        (x.installCode ? '<p class="mono" style="margin-top:20px;font-size:10px;line-height:1.9">在 QQ Agent 的「添加' + (cfg.kind === 'plugin' ? '插件' : 'Skill') + '」里粘贴这串口令即可安装。</p>' : ''))) +
      '</div>' +
      '<div class="drawer-foot">' +
        (cfg.foot !== undefined ? cfg.foot :
        ((x.downloadUrl
          ? '<a class="btn sm solid" href="' + esc(x.downloadUrl) + '" target="_blank" rel="noopener">下载 ZIP <span class="ico">↓</span></a>'
          : '<span class="mono">待审核通过后开放下载</span>') +
        (x.installCode ? '<button class="btn sm" id="cpCode" type="button">复制口令 <span class="ico">⧉</span></button>' : ''))) +
      '</div>';
    if (x.authorId && Q.me() && x.authorId === Q.me().id && (cfg.kind === 'plugin' || cfg.kind === 'skill')) {
      var foot = d.querySelector('.drawer-foot') || d.querySelector('.drawer-body').nextElementSibling;
      if (foot) {
        foot.insertAdjacentHTML('beforeend', '<button class="btn sm" id="editWork" type="button">更新作品</button><button class="btn sm" id="deleteWork" type="button">删除作品</button>');
        d.querySelector('#editWork').addEventListener('click', function () { openPublish(cfg.kind === 'plugin' ? 'plugins' : 'skills', x); });
        d.querySelector('#deleteWork').addEventListener('click', function () { deleteWork(cfg.kind === 'plugin' ? 'plugins' : 'skills', x); });
      }
    }

    // CSS 里 .scrim 默认 pointer-events:none（原本只用于 opacity 动画），
    // 必须加 .on 打开，否则点击穿透到底下的卡片/按钮：浮窗关不掉，还会误触下层。
    scrim.classList.add('on');
    document.body.classList.add('drawer-lock');
    document.body.appendChild(scrim);
    document.body.appendChild(d);
    gsap.set(d, { x: '101%' });
    gsap.to(scrim, { opacity: 1, duration: .28 });
    gsap.to(d, { x: '0%', duration: .68, ease: 'power3.out' });
    gsap.from(d.querySelectorAll('.drawer-body > *'), { y: 14, opacity: 0, duration: .6, stagger: .05, delay: .2, ease: 'power3.out' });
    if (typeof onReady === 'function') onReady(d.querySelector('.drawer-body'));

    var cp = d.querySelector('#cpCode');
    if (cp) cp.addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(x.installCode).then(function () { Q.toast('口令已复制'); });
      else Q.toast('口令：' + x.installCode);
    });

    function close(immediate) {
      if (d.__closed) return;
      d.__closed = 1;
      if (immediate === true) {
        gsap.killTweensOf([d, scrim]);
        d.remove(); scrim.remove(); document.body.classList.remove('drawer-lock');
      } else {
        gsap.to(d, { x: '101%', duration: .48, ease: 'power3.inOut' });
        gsap.to(scrim, { opacity: 0, duration: .3, onComplete: function () {
          d.remove(); scrim.remove(); document.body.classList.remove('drawer-lock');
        } });
      }
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('q3:dcloser', onPageAway);
      if (Q3.__closeDrawer === close) Q3.__closeDrawer = null;
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    // 切页时若浮窗仍开着，一并收起，否则新页面会被一层遮罩罩住
    function onPageAway() { close(); }
    d.querySelector('.modal-x').addEventListener('click', close);
    scrim.addEventListener('click', function (e) { e.preventDefault(); close(); });
    // 遮罩吃掉按下，避免冒泡到下层卡片触发第二次点击
    scrim.addEventListener('mousedown', function (e) { e.preventDefault(); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('q3:dcloser', onPageAway);
    Q3.__closeDrawer = close;
  }

  /* ══ 致谢 ══════════════════════════════════════════════════════ */
  function thanks() {
    var epoch = Q.epoch();
    var v = qs('#view');
    return Q.load('thanks').then(function (T) {
      if (!Q.isCurrent(epoch)) return;
      var tiers = T.tiers || [];
      var all = tiers.reduce(function (a, t) { return a.concat(t.members || []); }, []);
      var msgs = all.filter(function (m) { return m.note; });

      v.innerHTML = phead({
        kicker: 'THANKS / 致谢',
        title: '这条鱼<br>是被喂大的',
        desc: '赞赏来自微信赞赏码与 QQ 红包，一分一毫都记在这里。名单不排序，只按时间与额度归档。'
      }) +
      '<div class="shell">' +
        '<div class="th-total">' +
          '<div><b>' + all.length + '</b><span>位支持者</span></div>' +
          '<div><b>' + (tiers[0] ? (tiers[0].members || []).length : 0) + '</b><span>核心支持者</span></div>' +
          '<div><b>' + msgs.length + '</b><span>条留言</span></div>' +
          '<div><b>4C8G</b><span>服务器 · 众筹升级</span></div>' +
        '</div>' +
        '<div id="tiers"></div>' +
        '<div class="tier"><div class="tier-h"><h2>赞助支持</h2><p>此离线副本未包含个人收款信息。</p></div></div>' +
        (msgs.length ? '<div class="tier"><div class="tier-h"><h2>留言</h2><span class="cnt">' + msgs.length + '</span>' +
          '<p>开发者留言回复</p></div>' +
          '<div class="msg-grid">' + msgs.map(function (m) {
            return '<div class="msg-card" data-up><div class="q">' + esc(m.note) + '</div>' +
              (m.reply ? '<div class="rp">↳ ' + esc(m.reply) + '</div>' : '') +
              '<div class="who"><b>' + esc(m.name) + '</b></div></div>';
          }).join('') + '</div></div>' : '') +
      '</div>';

      qs('#tiers').innerHTML = tiers.map(function (t, ti) {
        var mem = t.members || [];
        var head = '<div class="tier-h"><h2>' + esc(t.name) + '</h2><span class="cnt">' + mem.length + '</span>' +
          (t.desc ? '<p>' + esc(t.desc) + '</p>' : '') + '</div>';
        if (t.onePerRow) {
          return '<div class="tier" data-r>' + head + mem.map(function (m) {
            return '<div class="vip-row"><div class="badge">' + esc((m.name || '?').slice(0, 1)) + '</div>' +
              '<div><div><span class="nm">' + esc(m.name) + '</span>' + (m.badge ? '<span class="bd">' + esc(m.badge) + '</span>' : '') + '</div>' +
              (m.note ? '<div class="nt">' + esc(m.note) + '</div>' : '') +
              (m.reply ? '<div class="rp">↳ ' + esc(m.reply) + '</div>' : '') + '</div></div>';
          }).join('') + '</div>';
        }
        // 名单格
        return '<div class="tier" data-r>' + head + '<div class="name-grid">' + mem.map(function (m) {
          return '<div class="name-cell"><span class="nn" title="' + esc(m.name) + '">' + esc(m.name) + '</span>' +
            (m.vip ? '<span class="nb">VIP</span>' : '') + '</div>';
        }).join('') + '</div></div>';
      }).join('');
    }).catch(function (e) {
      v.innerHTML = phead({
        kicker: 'THANKS / 致谢', title: '这条鱼<br>是被喂大的',
        desc: '名单数据没加载出来。'
      }) + '<div class="shell"><div class="empty-note">' + esc(e.message) + '</div></div>';
    });
  }

  /* ══ admin ═════════════════════════════════════════════════════ */


  /* ══ 个人主页 / 我的 ══════════════════════════════════════════
     2026-10-19 重写为 qa3 模块，纳入 SPA 路由，页签切换有转场动画。
     后端一次给全：GET /api/community/u/<id>
       -> { ok, account, isSelf, stats:{plugins,skills,personas,downloads},
            works:{plugins:[], skills:[], personas:[]} }
     带 X-Account-Token 时 isSelf=true，本人可见待审核条目与审核意见。
     ══════════════════════════════════════════════════════════════ */
  var PROF_API = '/api/community';

  function acctId() {
    var q = (location.search.match(/[?&]id=([0-9a-fA-F]{6,32})/) || [])[1];
    if (q) return q.toLowerCase();
    var m = /\/qq-agent\/u\/([0-9a-fA-F]{6,32})/i.exec(location.pathname);
    return m ? m[1].toLowerCase() : '';
  }

  // 名字哈希落在蓝紫区间，同一个人永远同一个色
  function hueOf(s) {
    var h = 0;
    for (var i = 0; i < String(s || '').length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
    return 205 + (h % 56);
  }

  var PROF_ROUTE = { plugins: 'plugin-market/', skills: 'skill-market/', personas: 'persona-plaza/' };
  var PROF_META = {
    plugins: { icon: '🔌', label: '插件' },
    skills:  { icon: '🧩', label: 'Skill' },
    personas:{ icon: '🎭', label: '人设' }
  };

  function profile() {
    var v = qs('#view');
    var epoch = Q.epoch();
    var me = Q.me ? Q.me() : null;
    var ident = acctId() || (me && me.id) || '';

    v.innerHTML = phead({
      kicker: 'PROFILE / 我的',
      title: me ? ('你好，<br>' + esc(me.displayName || me.username || '朋友')) : '一个<br>安静的角落',
      desc: me ? '你发布过的插件、Skill 与人设都在这里。' : '登录后可以发布插件 / Skill / 人设，并在这里统一管理。'
    }) +
    '<div class="shell">' +
      (me ? '' : '<div class="pf-tip">' +
        '<b>你还没有登录</b>' +
        '<span>登录后可以发布插件 / Skill / 人设，发布的作品会出现在下面的列表里。</span>' +
        '<button class="btn sm solid" id="pfLogin" type="button">登录 / 注册</button>' +
      '</div>') +
      '<div id="pfBody"><div class="loading"><i></i>LOADING</div></div>' +
    '</div>';

    var lb = qs('#pfLogin');
    if (lb) lb.addEventListener('click', function () { Q.openAuth('login'); });

    if (!ident) {
      qs('#pfBody').innerHTML = '<div class="pf-empty">无法确定账号 ID，请从顶栏登录，或访问 <code>/qq-agent/u/&lt;你的ID&gt;</code></div>';
      return Promise.resolve();
    }

    var hdr = Q.token ? { 'X-Account-Token': Q.token() } : {};
    return fetch(PROF_API + '/u/' + encodeURIComponent(ident), { headers: hdr, cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.ok === false) throw new Error((d && d.error) || '加载失败');
        if (Q.isCurrent(epoch)) paintProfile(d);
      })
      .catch(function (e) {
        if (Q.isCurrent(epoch) && qs('#pfBody')) qs('#pfBody').innerHTML = '<div class="pf-empty">' + esc(e.message || '加载失败') + '</div>';
      });
  }

  function paintProfile(d) {
    var a = d.account || {};
    var st = d.stats || {};
    var works = d.works || {};
    var isSelf = !!d.isSelf;
    var nm = a.displayName || a.username || a.loginId || '匿名';
    var hue = hueOf(a.id || a.loginId);
    var total = (st.plugins || 0) + (st.skills || 0) + (st.personas || 0);
    var kindN = ['plugins', 'skills', 'personas'].filter(function (k) { return (st[k] || 0) > 0; }).length;

    // 作品拍平，按更新时间倒序
    var rows = [];
    ['plugins', 'skills', 'personas'].forEach(function (k) {
      (works[k] || []).forEach(function (x) {
        rows.push({
          icon: PROF_META[k].icon, label: PROF_META[k].label, kind: k,
          title: x.name || x.title || x.id,
          desc: (x.description || '').replace(/\s+/g, ' ').trim(),
          at: x.updatedAt || '', dl: x.downloads || 0,
          id: x.id, note: x.reviewNote || ''
        });
      });
    });
    rows.sort(function (p, q2) { return String(q2.at).localeCompare(String(p.at)); });

    qs('#pfBody').innerHTML =
      '<div class="pf-card">' +
        '<div class="pf-top">' +
          '<div class="pf-ava" style="background:hsl(' + hue + ' 62% 52%)">' +
            esc(String(nm).slice(0, 1).toUpperCase()) + '</div>' +
          '<div class="pf-main">' +
            '<h1 class="pf-name">' + esc(nm) + (isSelf ? '<span class="tag-me">我</span>' : '') + '</h1>' +
            '<div class="pf-sub"><code>@' + esc(a.loginId || '') + '</code>' +
              '<span>加入于 ' + esc((a.createdAt || '').slice(0, 10) || '未知') + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="pf-stats">' +
          '<div><b>' + total + '</b><span>作品总数</span></div>' +
          '<div><b>' + Q.compact(st.downloads || 0) + '</b><span>累计下载</span></div>' +
          '<div><b>' + kindN + '</b><span>发布类型</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="pf-sech"><h2>我发布的</h2><span class="mono">' + rows.length + ' 件</span></div>' +
      '<div class="pf-list">' + (rows.length ? rows.map(function (r) {
        return '<article class="pf-item" data-kind="' + r.kind + '" data-id="' + esc(r.id) + '">' +
          '<span class="pf-ic">' + r.icon + '</span>' +
          '<div class="pf-ib"><b>' + esc(r.title) + '</b>' +
            '<span>' + esc(r.desc.slice(0, 76)) + '</span>' +
            (r.note ? '<em class="pf-note">审核：' + esc(r.note) + '</em>' : '') +
          '</div>' +
          '<div class="pf-ir"><span class="mono">' + r.label + '</span>' +
            '<b>' + fmt(r.dl) + ' ↓</b></div>' +
        '</article>';
      }).join('') : '<div class="pf-empty">' +
        (isSelf ? '你还没有发布任何作品 · 去「插件 / Skill / 人设」页上传' : 'TA 还没有发布作品') + '</div>') +
      '</div>';

    // 点条目 → 切到对应市场（SPA，不整页刷新）
    var listEl = qs('.pf-list');
    listEl.addEventListener('click', function (e) {
      var it = e.target.closest('[data-kind]');
      if (!it) return;
      Q.go(BASE + PROF_ROUTE[it.dataset.kind] + 'index.html');
    });
  }



  /* Live publishing and moderation share the existing account and CAPTCHA paths. */
  var captchaReady = null, captchaInstance = null, captchaResolve = null, captchaReject = null;

  function captchaProxy() {
    if (window.__qqaAliHooked) return;
    window.__qqaAliHooked = true;
    function rewrite(url) {
      var match = /^https:\/\/([a-zA-Z0-9.-]+\.(?:aliyuncs|alicdn)\.com)(\/.*)?$/.exec(String(url || ''));
      return match ? location.origin + '/qq-agent/captcha-api/' + match[1] + (match[2] || '/') : url;
    }
    var nativeFetch = window.fetch;
    window.fetch = function (input, options) {
      if (typeof input === 'string') input = rewrite(input);
      else if (window.Request && input instanceof Request) {
        var url = rewrite(input.url); if (url !== input.url) input = new Request(url, input);
      }
      return nativeFetch.call(this, input, options);
    };
    var nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments); args[1] = rewrite(url); return nativeOpen.apply(this, args);
    };
  }

  function captchaPass() {
    captchaProxy();
    if (!captchaReady) {
      captchaReady = fetch('/api/community/captcha-config', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (cfg) {
        if (!cfg.enabled) throw new Error('人机验证暂未就绪，请稍后再试');
        window.AliyunCaptchaConfig = { region: cfg.region, prefix: cfg.prefix };
        if (!qs('#qqa-captcha-element')) {
          var el = document.createElement('div'); el.id = 'qqa-captcha-element'; document.body.appendChild(el);
          var trigger = document.createElement('button'); trigger.id = 'qqa-captcha-trigger'; trigger.hidden = true; document.body.appendChild(trigger);
        }
        return new Promise(function (resolve, reject) {
          var timer = setTimeout(function () { reject(new Error('验证码加载超时，请刷新重试')); }, 20000);
          var script = document.createElement('script'); script.src = Q.BASE + 'captcha-sdk/AliyunCaptcha.js';
          script.onerror = function () { clearTimeout(timer); reject(new Error('验证码加载失败，请检查网络')); };
          script.onload = function () {
            try {
              window.initAliyunCaptcha({ SceneId: cfg.sceneId, mode: 'popup', element: '#qqa-captcha-element', button: '#qqa-captcha-trigger',
                zIndex: 2147483000, language: 'cn', slideStyle: { width: 320, height: 40 },
                getInstance: function (instance) { clearTimeout(timer); captchaInstance = instance; resolve(); },
                success: function (value) { var done = captchaResolve; captchaResolve = null; captchaReject = null; if (done) done(value); },
                onError: function () { clearTimeout(timer); reject(new Error('人机验证初始化失败，请刷新重试')); }
              });
            } catch (e) { clearTimeout(timer); reject(e); }
          };
          document.head.appendChild(script);
        });
      }).catch(function (e) { captchaReady = null; throw e; });
    }
    return captchaReady.then(function () {
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { captchaResolve = null; captchaReject = null; reject(new Error('人机验证已超时，请重新提交')); }, 120000);
        captchaResolve = function (value) { clearTimeout(timer); resolve(value); };
        captchaReject = function (error) { clearTimeout(timer); reject(error); };
        captchaInstance.show();
      });
    });
  }

  function requestJSON(url, options) {
    return fetch(url, options).then(function (r) {
      return r.json().catch(function () { throw new Error('服务暂时不可用（HTTP ' + r.status + '）'); }).then(function (d) {
        if (!r.ok || !d || d.ok === false) throw new Error((d && d.error) || ('HTTP ' + r.status));
        return d;
      });
    });
  }
  function formModal(title, fields, onSubmit) {
    if (Q.__closeDrawer) Q.__closeDrawer(true);
    var ov = document.createElement('div'); ov.className = 'modal publish-modal'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', title);
    ov.innerHTML = '<div class="modal-box publish-box"><button class="modal-x" type="button" aria-label="关闭">×</button><h2>' + esc(title) + '</h2>' +
      '<form class="publish-form">' + fields + '<p class="auth-err" role="alert"></p><button class="btn solid" type="submit">提交</button></form></div>';
    document.body.appendChild(ov);
    var closed = false;
    function close() {
      if (closed) return; closed = true; ov.remove(); document.removeEventListener('keydown', key);
      if (captchaReject) { var reject = captchaReject; captchaReject = null; captchaResolve = null; reject(new Error('提交已取消')); }
    }
    function key(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', key); Q.onDispose(close);
    ov.querySelector('.modal-x').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var form = ov.querySelector('form');
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var button = form.querySelector('[type=submit]'), error = form.querySelector('.auth-err');
      if (button.disabled) return;
      button.disabled = true; error.textContent = '';
      Promise.resolve().then(function () { return onSubmit(form, close); }).catch(function (e) { if (!closed) error.textContent = e.message || '提交失败'; })
        .then(function () { if (!closed) button.disabled = false; });
    });
    var first = form.querySelector('input, textarea'); if (first) first.focus();
    return ov;
  }
  function field(label, name, value, textarea) {
    return '<label class="auth-f"><span>' + esc(label) + '</span>' + (textarea
      ? '<textarea name="' + name + '" rows="6" required>' + esc(value || '') + '</textarea>'
      : '<input name="' + name + '" value="' + esc(value || '') + '" required maxlength="120" />') + '</label>';
  }
  function openPublish(kind, existing) {
    var me = Q.me();
    if (kind !== 'comment' && !me) { Q.openAuth('login'); return; }
    var persona = kind === 'personas', comment = kind === 'comment';
    var title = comment ? '写留言' : (existing ? '更新作品' : '发布' + (persona ? '人设' : kind === 'plugins' ? '插件' : 'Skill'));
    var fields = comment
      ? field('昵称', 'nickname', me && me.displayName) + field('留言内容', 'text', '', true) + '<label class="auth-f"><span>附图（可选，最多 9 张，每张不超过 3MB）</span><input name="images" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple /></label>'
      : field('名称', 'name', existing && existing.name) + field('简介', 'description', existing && existing.description, true) +
        (persona ? field('提示词正文', 'prompt', '', true) + '<label class="auth-f"><span>分类</span><select name="category"><option value="companion">陪伴型</option><option value="roleplay">角色扮演</option><option value="utility">实用助手</option><option value="custom">自定义</option></select></label>'
         : '<label class="auth-f"><span>ZIP 安装包（最多 8MB）</span><input name="file" type="file" accept=".zip,application/zip" required /></label><p class="mono">提交后需要审核；更新期间原安装口令会暂时停用。</p>');
    formModal(title, fields, function (form, close) {
      var file = !persona && !comment && form.elements.file.files[0];
      if (!persona && !comment && (!file || file.size > 8*1024*1024)) throw new Error('请选择不超过 8MB 的 ZIP 安装包');
      var selected = comment ? Array.prototype.slice.call(form.elements.images.files) : [];
      if (selected.length > 9 || selected.some(function (f) { return f.size > 3*1024*1024; })) throw new Error('最多 9 张附图，每张不超过 3MB');
      var images = [];
      return Promise.all(selected.map(function (file) { return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = function () { reject(new Error('图片读取失败')); }; reader.readAsDataURL(file); }); }))
        .then(function (values) { if (!document.body.contains(form)) throw new Error('提交已取消'); images = values; return captchaPass(); }).then(function (captcha) {
        if (!document.body.contains(form)) throw new Error('提交已取消');
        var headers = Q.authHeader(), body, url;
        if (comment) {
          headers['content-type'] = 'application/json'; url = '/qq-agent/api/comment';
          body = JSON.stringify({ nickname: form.elements.nickname.value.trim(), text: form.elements.text.value.trim(), images: images, captchaVerifyParam: captcha });
        } else if (persona) {
          headers['content-type'] = 'application/json'; url = '/api/community/personas';
          body = JSON.stringify({ title: form.elements.name.value.trim(), description: form.elements.description.value.trim(), prompt: form.elements.prompt.value,
            category: form.elements.category.value, captchaVerifyParam: captcha });
        } else {
          body = new FormData(form); body.append('kind', kind); body.append('captchaVerifyParam', captcha);
          url = existing ? '/api/community/market/' + kind + '/' + encodeURIComponent(existing.id) + '/update' : '/api/community/market/publish';
        }
        return requestJSON(url, { method: 'POST', headers: headers, body: body });
      }).then(function () {
        close(); Q.toast(comment ? '留言已提交' : persona ? '人设已发布' : '已提交，等待审核');
        return Q.renderPage(comment ? 'comments' : persona ? 'personas' : kind === 'plugins' ? 'plugin' : 'skill');
      });
    });
  }
  function deleteWork(kind, item) {
    if (!confirm('确定删除“' + (item.name || item.id) + '”？')) return;
    requestJSON('/api/community/market/' + kind + '/' + encodeURIComponent(item.id) + '/delete', { method: 'POST', headers: Q.authHeader() })
      .then(function () { Q.toast('作品已删除'); return Q.renderPage(kind === 'plugins' ? 'plugin' : 'skill'); })
      .catch(function (e) { Q.toast(e.message); });
  }

  function admin() {
    var view = qs('#view'), epoch = Q.epoch(), rows = null;
    view.innerHTML = phead({ kicker: 'ADMIN / 内容管理', title: '社区<br>管理', desc: '验证内容管理密钥后，可置顶或删除留言与语录。共享屏蔽上报使用独立的社区管理密钥审核。' }) +
      '<div class="shell"><div class="adm-key"><input id="pin" type="password" placeholder="内容管理密钥" autocomplete="off" /><button class="btn sm solid" id="verify" type="button">验证并加载</button><button class="btn sm" id="clear" type="button">清除</button><span id="state" role="status">未验证</span></div><div class="adm-cols" id="cols"></div>' +
      '<section class="adm-reports"><h2>共享屏蔽上报</h2><div class="adm-key"><input id="communityPin" type="password" placeholder="社区管理密钥" autocomplete="off" /><button class="btn sm" id="loadReports" type="button">加载待审核上报</button></div><div id="reports" role="status"></div></section>' +
      '<p><a href="' + BASE + 'skill-market/admin/" target="_blank" rel="noopener">Skill 审核后台 ↗</a> · <a href="' + BASE + 'plugin-market/admin/" target="_blank" rel="noopener">插件审核后台 ↗</a></p></div>';
    var pin = qs('#pin'), state = qs('#state'), cols = qs('#cols');
    function renderRows() {
      if (!Q.isCurrent(epoch)) return;
      cols.innerHTML = ['comment', 'holyshits'].map(function (target) {
        var list = (rows[target] || []).slice().sort(function (a, b) { return Number(!!b.pinned)-Number(!!a.pinned) || b.at-a.at; });
        return '<section class="adm-col"><h2>' + (target === 'comment' ? '意见墙' : '雷霆语录') + ' <small>' + list.length + ' 条</small></h2>' + list.map(function (entry) {
          var first = (entry.messages || [])[0] || {};
          return '<article class="adm-item"><div class="t"><b>' + esc(entry.nickname || '匿名') + '</b> · ' + esc((entry.text || first.text || '').slice(0,160)) + '</div><div class="ops">' +
            '<button type="button" data-target="' + target + '" data-id="' + esc(entry.id) + '" data-action="pin">' + (entry.pinned ? '取消置顶' : '置顶') + '</button>' +
            '<button type="button" data-target="' + target + '" data-id="' + esc(entry.id) + '" data-action="delete">删除</button></div></article>';
        }).join('') + '</section>';
      }).join('');
    }
    function loadRows() {
      if (!pin.value.trim()) { state.textContent = '请输入内容管理密钥'; return Promise.resolve(); }
      state.textContent = '加载中…';
      return requestJSON('/qq-agent/api/admin/list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: pin.value.trim() }) })
        .then(function (data) { if (!Q.isCurrent(epoch)) return; rows = data; state.textContent = '已验证'; renderRows(); })
        .catch(function (e) { if (Q.isCurrent(epoch)) state.textContent = e.message; });
    }
    qs('#verify').addEventListener('click', loadRows);
    qs('#clear').addEventListener('click', function () { pin.value = ''; qs('#communityPin').value = ''; rows = null; cols.innerHTML = ''; qs('#reports').innerHTML = ''; state.textContent = '未验证'; });
    cols.addEventListener('click', function (e) {
      var button = e.target.closest('[data-action]'); if (!button || button.disabled) return;
      var target = button.dataset.target, ident = button.dataset.id, action = button.dataset.action;
      if (action === 'delete' && !confirm('确定删除这条内容？')) return;
      var entry = (rows[target] || []).filter(function (x) { return x.id === ident; })[0];
      button.disabled = true;
      requestJSON('/qq-agent/api/admin/' + action, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: pin.value.trim(), target: target, id: ident, pinned: !(entry && entry.pinned) }) })
        .then(loadRows).catch(function (error) { Q.toast(error.message); button.disabled = false; });
    });
    var reports = qs('#reports'), communityPin = qs('#communityPin');
    function loadReports() {
      if (!communityPin.value.trim()) { reports.textContent = '请输入社区管理密钥'; return; }
      return requestJSON('/api/community/admin/blocklist-reports', { headers: { 'X-Community-Key': communityPin.value.trim() }, cache: 'no-store' }).then(function (data) {
        if (!Q.isCurrent(epoch)) return;
        var list = (data.items || []).filter(function (x) { return x.status === 'pending'; });
        reports.innerHTML = list.length ? list.map(function (x) { return '<article class="adm-item"><p>' + esc((x.ids || []).join('、')) + '</p><div class="ops"><button data-review="approve" data-report="' + esc(x.id) + '">通过</button><button data-review="reject" data-report="' + esc(x.id) + '">拒绝</button></div></article>'; }).join('') : '暂无待审核上报';
      }).catch(function (error) { if (Q.isCurrent(epoch)) reports.textContent = error.message; });
    }
    qs('#loadReports').addEventListener('click', loadReports);
    reports.addEventListener('click', function (e) {
      var button = e.target.closest('[data-review]'); if (!button || button.disabled) return; button.disabled = true;
      requestJSON('/api/community/admin/blocklist-reports/' + encodeURIComponent(button.dataset.report) + '/review', {
        method: 'POST', headers: { 'content-type': 'application/json', 'X-Community-Key': communityPin.value.trim() }, body: JSON.stringify({ action: button.dataset.review })
      }).then(loadReports).catch(function (error) { Q.toast(error.message); button.disabled = false; });
    });
    return Promise.resolve();
  }

  /* ── 路由 ─────────────────────────────────────────────────────── */
  var MAP = {
    home: home,
    comments: comments,
    holyshits: holyshits,
    personas: personas,
    skill: function () { return market({ key: 'skills', kind: 'skill', tagKey: 'skills', kicker: 'SKILL MARKET / 能力包', title: '装上新<br>一种能力', desc: '按类别浏览经过规范整理的能力包。下载后放进本地 skills/ 目录，也可以把自己的传上来。' }); },
    plugin: function () { return market({ key: 'plugins', kind: 'plugin', tagKey: 'plugins', kicker: 'PLUGIN MARKET / 扩展件', title: '接上新的<br>零件', desc: '插件与 Skill 相互独立：围绕进程与运行时做更底层的增强。上传前请自查入口代码与网络权限。' }); },
    profile: profile,
    thanks: thanks,
    admin: admin
  };

  window.__Q3_PAGES__ = MAP;
  Q.page(MAP[PAGE] || home);
})();

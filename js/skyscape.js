// 背景的太陽與月亮（跟打卡系統同一個路數，只留天體、不做天氣）。
// 白天＝暖金日輪＋緩慢旋轉的光束；夜晚＝月亮（含月海與大氣光暈）＋星星。
// 天體與光暈都預先畫在離屏畫布上，每幀只做旋轉與淡入淡出，手機才不會吃電。
(function (root) {
  var PI2 = Math.PI * 2;
  var canvas, ctx, W = 0, H = 0, DPR = 1;
  var sunLayer = null, rayLayer = null, moonLayer = null, stars = [];
  var mode = null, raf = 0, clock = 0, lastTs = 0, lastDraw = 0, builtKey = '';
  var reduceMotion = false;

  function offscreen() {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(W * DPR));
    c.height = Math.max(1, Math.ceil(H * DPR));
    var g = c.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { c: c, g: g };
  }

  // 天體位置：寬螢幕時內容區（780px）兩側有留白，天體整顆看得到；
  // 手機上內容幾乎滿版，天體會被紅色招牌整個蓋住——所以窄螢幕改成貼著右上角、
  // 放大一點，讓它從招牌上緣「探出來」，像日出／月升。
  function narrow() { return W < 900; }
  function bodyPos() {
    return narrow()
      ? { x: W * 0.88, y: H * 0.020, r: Math.min(W, H) * 0.088 }
      : { x: W * 0.84, y: H * 0.060, r: Math.min(W, H) * 0.055 };
  }
  function sunPos() { return bodyPos(); }

  // 白天：米白紙上的太陽。底色本來就亮，所以不能用 lighter 疊——改用實心的暖金日輪
  // 加一圈往外淡出的暖光，像陽光斜斜灑在紙上。
  function buildSun() {
    var lay = offscreen(), g = lay.g, p = sunPos();
    var R = Math.max(W, H);
    var halo = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 0.55);
    halo.addColorStop(0, 'rgba(255, 196, 74, .30)');
    halo.addColorStop(0.18, 'rgba(255, 184, 66, .14)');
    halo.addColorStop(0.45, 'rgba(247, 165, 10, .05)');
    halo.addColorStop(1, 'rgba(247, 165, 10, 0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);
    var r = p.r;
    var disc = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    disc.addColorStop(0, 'rgba(255, 218, 104, .95)');
    disc.addColorStop(0.62, 'rgba(255, 190, 48, .88)');
    disc.addColorStop(0.95, 'rgba(243, 148, 8, .55)');
    disc.addColorStop(1, 'rgba(243, 148, 8, 0)');
    g.fillStyle = disc;
    g.beginPath(); g.arc(p.x, p.y, r, 0, PI2); g.fill();
    return lay.c;
  }

  // 光束：從太陽放射出去的窄三角形，粗細長短不一，整層之後會很慢地繞著太陽轉。
  function buildRays() {
    var lay = offscreen(), g = lay.g, p = sunPos();
    var R = Math.max(W, H) * 1.15;
    var seeds = [0.10, 0.62, 1.18, 1.77, 2.31, 2.95, 3.52, 4.10, 4.71, 5.24, 5.83];
    for (var i = 0; i < seeds.length; i++) {
      var a0 = seeds[i];
      var wdt = 0.012 + (i % 3) * 0.009;
      var lg = g.createLinearGradient(p.x, p.y, p.x + Math.cos(a0) * R, p.y + Math.sin(a0) * R);
      lg.addColorStop(0, 'rgba(255, 205, 96, .20)');
      lg.addColorStop(0.35, 'rgba(255, 190, 70, .07)');
      lg.addColorStop(1, 'rgba(255, 180, 50, 0)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + Math.cos(a0 - wdt) * R, p.y + Math.sin(a0 - wdt) * R);
      g.lineTo(p.x + Math.cos(a0 + wdt) * R, p.y + Math.sin(a0 + wdt) * R);
      g.closePath();
      g.fill();
    }
    return lay.c;
  }

  // 夜晚：深底上用 lighter 疊，作法與打卡系統一致（月面漸層＋三塊月海＋大氣散射光暈）。
  function buildMoon() {
    var lay = offscreen(), g = lay.g;
    var p = bodyPos();
    var mx = p.x, my = p.y, r = p.r * (narrow() ? 0.82 : 1.13); // 月亮比太陽小一點
    var halo = g.createRadialGradient(mx, my, r * 0.6, mx, my, r * 7);
    halo.addColorStop(0, 'rgba(196, 216, 255, .30)');
    halo.addColorStop(0.35, 'rgba(150, 180, 255, .08)');
    halo.addColorStop(1, 'rgba(120, 160, 255, 0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);
    var disc = g.createRadialGradient(mx - r * 0.28, my - r * 0.3, r * 0.1, mx, my, r);
    disc.addColorStop(0, 'rgba(255, 255, 252, 1)');
    disc.addColorStop(0.62, 'rgba(238, 242, 252, .96)');
    disc.addColorStop(0.94, 'rgba(206, 218, 240, .90)');
    disc.addColorStop(1, 'rgba(190, 206, 235, 0)');
    g.fillStyle = disc;
    g.beginPath(); g.arc(mx, my, r, 0, PI2); g.fill();
    g.globalCompositeOperation = 'source-atop';
    var maria = [[-0.26, -0.20, 0.62], [0.22, 0.26, 0.52], [0.10, -0.36, 0.38]];
    for (var i = 0; i < maria.length; i++) {
      var ox = mx + r * maria[i][0], oy = my + r * maria[i][1], orr = r * maria[i][2];
      var mg = g.createRadialGradient(ox, oy, 0, ox, oy, orr);
      mg.addColorStop(0, 'rgba(126, 138, 164, .15)');
      mg.addColorStop(0.55, 'rgba(126, 138, 164, .09)');
      mg.addColorStop(1, 'rgba(126, 138, 164, 0)');
      g.fillStyle = mg;
      g.beginPath(); g.arc(ox, oy, orr, 0, PI2); g.fill();
    }
    return lay.c;
  }

  function buildStars() {
    var n = Math.round(Math.min(70, Math.max(22, Math.sqrt(W * H) / 13)));
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({
        x: Math.random() * W,
        y: Math.random() * H * (narrow() ? 0.95 : 0.72), // 手機內容滿版，星星散開一點才看得到
        r: 0.5 + Math.random() * 1.1,
        a: 0.25 + Math.random() * 0.5,
        sp: 0.25 + Math.random() * 0.5,       // 各自的閃爍速度
        ph: Math.random() * PI2,
      });
    }
    return out;
  }

  function sizeCanvas() {
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    W = window.innerWidth || document.documentElement.clientWidth;
    H = window.innerHeight || document.documentElement.clientHeight;
    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function build() {
    var key = W + 'x' + H + '@' + DPR + ':' + mode;
    if (key === builtKey) return;
    builtKey = key;
    if (mode === 'day') {
      sunLayer = buildSun();
      rayLayer = buildRays();
      moonLayer = null; stars = [];
    } else {
      moonLayer = buildMoon();
      stars = buildStars();
      sunLayer = null; rayLayer = null;
    }
  }

  function drawFrame() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (mode === 'day') {
      if (!sunLayer) return;
      var p = sunPos();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(clock * 0.012);                       // 光束整層繞太陽極慢地轉
      ctx.translate(-p.x, -p.y);
      ctx.globalAlpha = 0.62 + 0.14 * Math.sin(clock * 0.35);
      ctx.drawImage(rayLayer, 0, 0, W, H);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.drawImage(sunLayer, 0, 0, W, H);
    } else {
      if (!moonLayer) return;
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var a = s.a * (0.45 + 0.55 * Math.sin(s.ph + clock * s.sp));
        if (a <= 0) continue;
        ctx.fillStyle = 'rgba(255, 252, 238, ' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, PI2); ctx.fill();
      }
      ctx.drawImage(moonLayer, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function loop(ts) {
    raf = window.requestAnimationFrame(loop);
    var dt = lastTs ? (ts - lastTs) / 1000 : 0.016;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    clock += dt;
    if (ts - lastDraw < 40) return;   // 背景畫面壓在約 24 fps 就夠，省電
    lastDraw = ts;
    drawFrame();
  }

  function start() {
    if (raf || reduceMotion || !mode) return;
    lastTs = 0; lastDraw = 0;
    raf = window.requestAnimationFrame(loop);
  }
  function stop() {
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
  }

  function setMode(m) {
    if (m !== 'day' && m !== 'night') return;
    if (m === mode) return;
    mode = m;
    if (!ctx) return;
    build();
    drawFrame();
    if (!reduceMotion && !document.hidden) start();
  }

  function init() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'skyCanvas';
    canvas.setAttribute('aria-hidden', 'true');
    ctx = canvas.getContext('2d');
    (document.body || document.documentElement).insertBefore(canvas, (document.body || document.documentElement).firstChild);
    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    sizeCanvas();
    if (!mode) mode = document.body && document.body.classList.contains('tod-night') ? 'night' : 'day';
    build();
    drawFrame();
    if (!reduceMotion) start();

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { sizeCanvas(); builtKey = ''; build(); drawFrame(); }, 200);
    });
    // 切到別的分頁就停下來，回來再繼續（省電）
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
  }

  root.Skyscape = { setMode: setMode, init: init };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

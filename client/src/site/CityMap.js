/* CityMap.js — стилизованная «голографическая карта Казахстана» как backdrop
   для 3D-башен DDC. Под референс: цельный светящийся силуэт страны (заливка +
   контур-glow), едва заметная сетка внутри, города-пины с вертикальными лучами,
   изогнутые cyan-связи, сходящиеся к яркому центральному «ядру» (платформа, где
   стоят башни), и бегущие по связям пакеты данных. Палитра: deep navy / cyan.

   Интерфейс совместим со Scene3D: initCityMap(canvas, opts) -> { setTarget, dispose }
   opts.backdrop=true — центральное ядро рисуется как свечение платформы, но без
   собственного «здания» (его роль играют 3D-башни). */

import { KZ_PTS } from './particlePoints.js';

// Географические крайние точки Казахстана (для привязки городов к силуэту)
const GEO = { lonMin: 46.5, lonMax: 87.3, latMin: 40.6, latMax: 55.4 };

// Крупные города: [подпись, долгота, широта]
const CITIES = [
  ['Астана', 71.43, 51.13],
  ['Алматы', 76.95, 43.25],
  ['Шымкент', 69.60, 42.32],
  ['Караганда', 73.10, 49.80],
  ['Актобе', 57.17, 50.28],
  ['Атырау', 51.90, 47.10],
  ['Актау', 51.16, 43.65],
  ['Павлодар', 76.97, 52.28],
  ['Уральск', 51.37, 51.23],
  ['Костанай', 63.62, 53.21],
  ['Кызылорда', 65.50, 44.85],
  ['Тараз', 71.36, 42.90],
  ['Усть-Каменогорск', 82.61, 49.95],
  ['Семей', 80.27, 50.41],
  ['Петропавловск', 69.15, 54.87],
];

export function initCityMap(canvas, opts = {}) {
  const backdrop = !!opts.backdrop;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d', { alpha: true });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let w = 0, h = 0, base = 0, raf = 0, running = false;
  let progress = 0, disp = 0;
  let tx = 0, ty = 0, px = 0, py = 0;
  let t0 = 0;
  const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // bbox силуэта KZ + проекция в экранные координаты
  let bb = { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  (function bbox() {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (let i = 0; i < KZ_PTS.length; i += 2) {
      const x = KZ_PTS[i], y = KZ_PTS[i + 1];
      if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y;
    }
    bb = { minX: a, maxX: b, minY: c, maxY: d };
  })();
  const bbW = bb.maxX - bb.minX || 1, bbH = bb.maxY - bb.minY || 1;
  const bcx = (bb.minX + bb.maxX) / 2, bcy = (bb.minY + bb.maxY) / 2;

  let scale = 1, cx = 0, cy = 0;          // проекция (обновляется на resize)
  const projX = (kx) => cx + (kx - bcx) * scale;
  const projY = (ky) => cy - (ky - bcy) * scale;   // флип Y: север сверху
  const geoToKZ = (lon, lat) => ({
    kx: bb.minX + ((lon - GEO.lonMin) / (GEO.lonMax - GEO.lonMin)) * bbW,
    ky: bb.minY + ((lat - GEO.latMin) / (GEO.latMax - GEO.latMin)) * bbH,
  });

  // Узлы городов с экранными координатами (пересчёт на resize)
  const nodes = CITIES.map(([label, lon, lat], i) => ({
    label, lon, lat, sx: 0, sy: 0, phase: i * 0.7, hub: label === 'Астана',
  }));
  let HUB = { sx: 0, sy: 0 };             // центр карты — там стоят башни

  // Пакеты данных вдоль связей город↔центр
  const packets = [];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].hub) continue;
    for (let k = 0; k < 2; k++) {
      packets.push({ ni: i, t: k / 2 + Math.random() * 0.3, sp: 0.05 + Math.random() * 0.05, dir: Math.random() < 0.5 ? 1 : -1 });
    }
  }

  function project() {
    scale = Math.min((w * 0.80) / bbW, (h * 0.74) / bbH);
    cx = w / 2; cy = h * 0.50;
    // HUB чуть выше геометрического центра — под основание башен
    HUB = { sx: w / 2, sy: h * 0.50 };
    for (const n of nodes) {
      const p = geoToKZ(n.lon, n.lat); n.sx = projX(p.kx); n.sy = projY(p.ky);
      if (n.hub) { HUB = { sx: n.sx, sy: n.sy }; }
    }
  }

  // ── Статический слой: заливка силуэта + контур-glow + внутренняя сетка ────────
  const map = document.createElement('canvas');
  const mctx = map.getContext('2d');

  // строим путь силуэта как «облако» близких точек -> заполненная клякса.
  // KZ_PTS — несортированное облако, поэтому собираем форму через объединение
  // мягких кругов (каждая точка = диск), что даёт цельную органичную заливку.
  function silhouettePath(c, rr) {
    c.beginPath();
    for (let i = 0; i < KZ_PTS.length; i += 2) {
      const sx = projX(KZ_PTS[i]), sy = projY(KZ_PTS[i + 1]);
      c.moveTo(sx + rr, sy);
      c.arc(sx, sy, rr, 0, Math.PI * 2);
    }
  }

  function buildMap() {
    map.width = Math.max(1, Math.round(w * dpr));
    map.height = Math.max(1, Math.round(h * dpr));
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.clearRect(0, 0, w, h);
    if (w < 2 || h < 2) return;

    const rr = Math.max(7, scale * 0.052); // радиус «диска» точки — чтобы слиплось в массив

    // 1) внешнее свечение страны (мягкий ореол вокруг массива)
    mctx.save();
    mctx.filter = `blur(${Math.round(rr * 1.6)}px)`;
    mctx.fillStyle = 'rgba(46,120,205,0.30)';
    silhouettePath(mctx, rr * 1.25); mctx.fill();
    mctx.restore();

    // 2) тело страны — градиентная заливка (темнее к краям, светлее к центру)
    const g = mctx.createRadialGradient(cx, cy, scale * 0.05, cx, cy, scale * 0.95);
    g.addColorStop(0, 'rgba(36,94,172,0.70)');
    g.addColorStop(0.55, 'rgba(22,60,124,0.58)');
    g.addColorStop(1, 'rgba(14,40,86,0.44)');
    mctx.save();
    mctx.filter = `blur(${Math.round(rr * 0.5)}px)`;
    mctx.fillStyle = g;
    silhouettePath(mctx, rr); mctx.fill();
    mctx.restore();

    // 3) внутренняя сетка GIS — только внутри силуэта (клип по форме)
    mctx.save();
    silhouettePath(mctx, rr); mctx.clip();
    const step = Math.max(26, Math.round(Math.min(w, h) / 26));
    mctx.lineWidth = 1; mctx.strokeStyle = 'rgba(120,185,235,0.10)';
    for (let x = (w / 2) % step; x <= w; x += step) { mctx.beginPath(); mctx.moveTo(x + 0.5, 0); mctx.lineTo(x + 0.5, h); mctx.stroke(); }
    for (let y = (h / 2) % step; y <= h; y += step) { mctx.beginPath(); mctx.moveTo(0, y + 0.5); mctx.lineTo(w, y + 0.5); mctx.stroke(); }
    // тонкая точечная текстура поверх сетки
    mctx.fillStyle = 'rgba(150,205,240,0.16)';
    for (let i = 0; i < KZ_PTS.length; i += 2) {
      mctx.beginPath(); mctx.arc(projX(KZ_PTS[i]), projY(KZ_PTS[i + 1]), 1.0, 0, Math.PI * 2); mctx.fill();
    }
    mctx.restore();

    // 4) контур-glow по краю (рисуем штрихом по дискам внешнего слоя)
    mctx.save();
    mctx.globalCompositeOperation = 'lighter';
    mctx.fillStyle = 'rgba(90,180,235,0.05)';
    silhouettePath(mctx, rr * 1.05); mctx.fill('evenodd');
    mctx.restore();
  }

  // ── Города: вертикальный луч + пин ───────────────────────────────────────────
  function drawCityBeam(n, pulse) {
    const beamH = base * 0.075 + 26;
    const x = n.sx;
    const grad = ctx.createLinearGradient(x, n.sy - beamH, x, n.sy);
    grad.addColorStop(0, 'rgba(150,230,255,0)');
    grad.addColorStop(1, `rgba(150,230,255,${0.34 + pulse * 0.22})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(x, n.sy - beamH); ctx.lineTo(x, n.sy - 2); ctx.stroke();
    // тонкое ядро луча
    ctx.strokeStyle = `rgba(220,248,255,${0.18 + pulse * 0.18})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x, n.sy - beamH * 0.82); ctx.lineTo(x, n.sy - 2); ctx.stroke();
  }

  function drawCityNode(n, pulse) {
    const r = base * 0.0035 + 2.2;
    // гало
    const halo = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, r + 9);
    halo.addColorStop(0, `rgba(150,230,255,${0.5 + pulse * 0.3})`);
    halo.addColorStop(1, 'rgba(150,230,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(n.sx, n.sy, r + 9, 0, Math.PI * 2); ctx.fill();
    // тёмная подложка
    ctx.fillStyle = 'rgba(6,16,36,0.9)';
    ctx.beginPath(); ctx.arc(n.sx, n.sy, r + 2.4, 0, Math.PI * 2); ctx.fill();
    // белое ядро
    ctx.fillStyle = 'rgba(224,244,255,0.98)';
    ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2); ctx.fill();
    // cyan-кольцо
    ctx.strokeStyle = `rgba(120,210,240,${0.55 + pulse * 0.25})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(n.sx, n.sy, r + 3.4, 0, Math.PI * 2); ctx.stroke();
  }

  function drawCityLabel(n) {
    const fs = Math.round(base * 0.0105) + 9;
    ctx.font = `600 ${fs}px ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textBaseline = 'middle';
    const outward = n.sx < w / 2 ? -1 : 1;
    const align = outward < 0 ? 'right' : 'left';
    const lx = n.sx + outward * (base * 0.004 + 12);
    label(lx, n.sy, n.label, 'rgba(212,234,250,0.92)', align);
  }

  function label(x, y, text, color, align) {
    ctx.textAlign = align;
    const m = ctx.measureText(text);
    const padX = 6, padY = 4, fh = parseInt(ctx.font, 10) || 12;
    let bx = x;
    if (align === 'center') bx = x - m.width / 2; else if (align === 'right') bx = x - m.width;
    ctx.fillStyle = 'rgba(6,15,32,0.42)';
    roundRect(bx - padX, y - fh / 2 - padY, m.width + padX * 2, fh + padY * 2, 4); ctx.fill();
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function roundRect(x, y, ww, hh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  }

  // изгиб связи город→центр (квадратичная кривая)
  function linkGeom(n) {
    const x0 = n.sx, y0 = n.sy, x2 = HUB.sx, y2 = HUB.sy;
    const dx = x2 - x0, dy = y2 - y0, len = Math.hypot(dx, dy) || 1, bow = len * 0.10;
    return { x0, y0, x1: (x0 + x2) / 2 + (-dy / len) * bow, y1: (y0 + y2) / 2 + (dx / len) * bow, x2, y2 };
  }
  function bezier(g, t) {
    const u = 1 - t;
    return { x: u * u * g.x0 + 2 * u * t * g.x1 + t * t * g.x2, y: u * u * g.y0 + 2 * u * t * g.y1 + t * t * g.y2 };
  }

  // ── Центральная платформа (свечение под башнями) ────────────────────────────
  function drawHub(time) {
    const R = base * 0.085 + 30;
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.4);
    // мягкое свечение
    const g = ctx.createRadialGradient(HUB.sx, HUB.sy, 0, HUB.sx, HUB.sy, R);
    g.addColorStop(0, `rgba(120,210,250,${0.34 + pulse * 0.10})`);
    g.addColorStop(0.45, 'rgba(70,150,230,0.16)');
    g.addColorStop(1, 'rgba(40,100,190,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(HUB.sx, HUB.sy, R, 0, Math.PI * 2); ctx.fill();
    // концентрические кольца платформы
    ctx.lineWidth = 1.4;
    for (let k = 0; k < 3; k++) {
      const rr = R * (0.34 + k * 0.20);
      ctx.strokeStyle = `rgba(140,215,245,${(0.30 - k * 0.07) + pulse * 0.06})`;
      ctx.beginPath(); ctx.ellipse(HUB.sx, HUB.sy + 3, rr, rr * 0.34, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  let last = (typeof performance !== 'undefined' ? performance.now() : 0);
  function frame(now) {
    raf = 0;
    if (!t0) t0 = now;
    const time = (now - t0) / 1000;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;

    disp += (progress - disp) * 0.05;
    if (!reduce) { px += (tx - px) * 0.05; py += (ty - py) * 0.05; }

    const s = 1.0 + disp * 0.14;
    const ox = -px * 16, oy = -py * 16 - disp * 30;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // карта яркая на hero (вверху) и угасает при скролле — глубже работает 3D-история
    const mapFade = 1 - smooth(disp, 0.12, 0.36) * 0.92;

    ctx.save();
    ctx.globalAlpha = mapFade;
    ctx.translate(w / 2 + ox, h / 2 + oy);
    ctx.scale(s, s);
    ctx.translate(-w / 2, -h / 2);

    // 1) карта (заливка силуэта + сетка + ореол)
    ctx.drawImage(map, 0, 0, w, h);

    // 2) центральная платформа-свечение (под башнями)
    drawHub(time);

    // 3) связи центр ↔ города
    const geoms = nodes.map((n) => (n.hub ? null : linkGeom(n)));
    ctx.lineCap = 'round';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of geoms) {
      if (!g) continue;
      ctx.strokeStyle = 'rgba(95,185,225,0.06)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(g.x0, g.y0); ctx.quadraticCurveTo(g.x1, g.y1, g.x2, g.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(130,210,235,0.26)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(g.x0, g.y0); ctx.quadraticCurveTo(g.x1, g.y1, g.x2, g.y2); ctx.stroke();
    }
    ctx.restore();

    // 4) пакеты данных
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of packets) {
      const g = geoms[p.ni]; if (!g) continue;
      if (!reduce) { p.t += p.sp * dt * p.dir; if (p.t > 1) p.t -= 1; else if (p.t < 0) p.t += 1; }
      const pt = bezier(g, p.t);
      const gr = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 6);
      gr.addColorStop(0, 'rgba(205,245,255,0.95)'); gr.addColorStop(1, 'rgba(150,225,245,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // 5) лучи + узлы городов
    for (const n of nodes) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.6 + n.phase);
      if (!n.hub) drawCityBeam(n, pulse);
    }
    for (const n of nodes) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.6 + n.phase);
      if (!n.hub) drawCityNode(n, pulse);
    }
    for (const n of nodes) { if (!n.hub) drawCityLabel(n); }

    ctx.restore();

    // 6) виньетка — фокус на центре (башнях), мягкое затемнение краёв
    const vg = ctx.createRadialGradient(w / 2, h * 0.47, Math.min(w, h) * 0.18, w / 2, h * 0.5, Math.max(w, h) * 0.74);
    vg.addColorStop(0, 'rgba(5,13,28,0)');
    vg.addColorStop(1, backdrop ? 'rgba(4,10,23,0.46)' : 'rgba(4,10,23,0.58)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);

    if (running && !reduce) raf = requestAnimationFrame(frame);
  }

  function start() { if (!running && !reduce) { running = true; last = performance.now(); if (!raf) raf = requestAnimationFrame(frame); } }
  function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  function resize() {
    w = window.innerWidth; h = window.innerHeight; base = Math.min(w, h);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    project(); buildMap();
    if (reduce) frame(performance.now());
  }

  const onPointer = (e) => { tx = (e.clientX / window.innerWidth - 0.5) * 2; ty = (e.clientY / window.innerHeight - 0.5) * 2; };
  const onVisibility = () => { document.hidden ? stop() : start(); };

  resize();
  window.addEventListener('resize', resize);
  if (!reduce) window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  start();

  return {
    setTarget(p) { progress = Math.min(1, Math.max(0, p)); if (!running && !reduce && !document.hidden) start(); },
    dispose() {
      stop();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

import { useEffect, useRef } from 'react';
import { perf } from './perfProfile.js';

/* Фоновый слой #particles: мягкие искорки + «потоки данных» (вертикальные каналы,
   по которым вниз бегут яркие сияющие точки с кометным хвостом).
   ПРОИЗВОДИТЕЛЬНОСТЬ:
   • всё рисуется в ОДНОМ canvas и ОДНОМ rAF (никакого второго полноэкранного слоя →
     не удваиваем композитинг на скролле — это и фризило раньше);
   • свечение точки и хвост — заранее отрисованные офскрин-спрайты (drawImage), без
     createRadialGradient/createLinearGradient в кадре;
   • градиент канала кэшируется один раз на ресайз;
   • замирает в фоновой вкладке и при reduce-motion (один статичный кадр).
   Плотность зависит от профиля (perfProfile): на слабых/Firefox — меньше. */
export default function Particles() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d', { alpha: true });
    let w = 0, h = 0, raf = 0, running = false;
    const mobile = window.innerWidth < 760;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 2);
    let pts = [];          // искорки
    let lanes = [];        // каналы потоков данных { x }
    let packets = [];      // бегущие пакеты { lane, y, sp, len, size, a }
    let laneGrad = null;   // кэш градиента канала (одинаков для всех)

    // ── Спрайт свечения (ядро+ореол) — для искорок и ярких голов пакетов ──
    const sprite = document.createElement('canvas');
    const sctx = sprite.getContext('2d');
    const SPRITE = 64;
    (() => {
      const core = '230, 244, 255', glow = '90, 160, 255', c = SPRITE / 2;
      sprite.width = SPRITE; sprite.height = SPRITE;
      const g = sctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, `rgba(${core}, 1)`);
      g.addColorStop(0.12, `rgba(${core}, 0.85)`);
      g.addColorStop(0.35, `rgba(${glow}, 0.35)`);
      g.addColorStop(0.7, `rgba(${glow}, 0.08)`);
      g.addColorStop(1, `rgba(${glow}, 0)`);
      sctx.fillStyle = g; sctx.beginPath(); sctx.arc(c, c, c, 0, Math.PI * 2); sctx.fill();
    })();

    // ── Спрайт хвоста пакета: вертикальный градиент (низ ярко → верх прозрачно) ──
    const tail = document.createElement('canvas');
    const tctx = tail.getContext('2d');
    tail.width = 4; tail.height = 64;
    (() => {
      const g = tctx.createLinearGradient(0, 64, 0, 0);
      g.addColorStop(0, 'rgba(150, 215, 255, 0.55)');
      g.addColorStop(1, 'rgba(150, 215, 255, 0)');
      tctx.fillStyle = g; tctx.fillRect(0, 0, 4, 64);
    })();

    const makeSpark = () => {
      const r = 0.5 + Math.random() * 1.1;
      return {
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18 - 0.04,
        size: r * 6, ph: Math.random() * Math.PI * 2,
        sp: 0.6 + Math.random() * 1.4, tw: 0.45 + Math.random() * 0.55,
      };
    };
    const makePacket = (lane, top) => ({
      lane,
      y: top ? -Math.random() * h * 0.5 : Math.random() * h,
      sp: 0.8 + Math.random() * 1.9,      // px/кадр
      len: 36 + Math.random() * 70,       // длина хвоста
      size: 4.5 + Math.random() * 5,
      a: 0.5 + Math.random() * 0.5,
    });

    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Искорки: мало (десктоп ≤24, мобайл ≤16)
      const sparkN = Math.min(mobile ? 16 : 24, Math.round((w * h) / 90000));
      pts = Array.from({ length: sparkN }, makeSpark);

      // Каналы потоков: умеренно; на слабых/Firefox/мобиле — меньше
      const tight = perf.lowPower || mobile || perf.engine === 'gecko';
      const laneN = Math.max(tight ? 3 : 4, Math.min(tight ? 5 : 8, Math.round(w / 320)));
      lanes = Array.from({ length: laneN }, (_, i) => ({
        x: Math.round((i + 0.5) * (w / laneN) + (Math.random() - 0.5) * 60),
      }));
      packets = [];
      for (let i = 0; i < lanes.length; i++) {
        const n = 1 + (Math.random() < 0.5 ? 1 : 0);
        for (let k = 0; k < n; k++) packets.push(makePacket(i, false));
      }
      laneGrad = ctx.createLinearGradient(0, 0, 0, h);
      laneGrad.addColorStop(0, 'rgba(120, 180, 255, 0)');
      laneGrad.addColorStop(0.5, 'rgba(120, 180, 255, 0.05)');
      laneGrad.addColorStop(1, 'rgba(120, 180, 255, 0)');
    };

    const render = () => {
      raf = 0;
      ctx.clearRect(0, 0, w, h);

      // Тусклые каналы (кэшированный градиент, один путь на все линии)
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = laneGrad; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const ln of lanes) { ctx.moveTo(ln.x, 0); ctx.lineTo(ln.x, h); }
      ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';

      // Пакеты: хвост-спрайт + яркая голова-спрайт
      for (const p of packets) {
        if (!reduce) { p.y += p.sp; if (p.y - p.len > h) { Object.assign(p, makePacket(p.lane, true)); continue; } }
        const x = lanes[p.lane].x;
        ctx.globalAlpha = p.a;
        ctx.drawImage(tail, x - 2, p.y - p.len, 4, p.len);
        const s = p.size * 2.4;
        ctx.drawImage(sprite, x - s / 2, p.y - s / 2, s, s);
      }

      // Искорки
      for (const a of pts) {
        if (!reduce) {
          a.x += a.vx; a.y += a.vy; a.ph += 0.016 * a.sp;
          if (a.x < -40) a.x = w + 40; else if (a.x > w + 40) a.x = -40;
          if (a.y < -40) a.y = h + 40; else if (a.y > h + 40) a.y = -40;
        }
        ctx.globalAlpha = reduce ? 0.85 : 1 - a.tw + a.tw * (0.5 + 0.5 * Math.sin(a.ph));
        const s = a.size;
        ctx.drawImage(sprite, a.x - s / 2, a.y - s / 2, s, s);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (running && !reduce) raf = requestAnimationFrame(render);
    };

    const start = () => { if (!running) { running = true; if (!raf) raf = requestAnimationFrame(render); } };
    const stop = () => { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    resize();

    let rzT = 0;
    const onResize = () => { clearTimeout(rzT); rzT = setTimeout(resize, 150); };
    window.addEventListener('resize', onResize, { passive: true });

    const onVis = () => { document.hidden ? stop() : start(); };
    document.addEventListener('visibilitychange', onVis);

    if (reduce) render();
    else if (!document.hidden) start();

    return () => {
      stop();
      clearTimeout(rzT);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas id="particles" ref={ref} aria-hidden="true" />;
}

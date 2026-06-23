import { useEffect, useRef } from 'react';

/* Потоки данных: вертикальные «каналы», по которым вниз бегут светящиеся пакеты
   с кометным хвостом. Оптимизировано под слабые устройства:
   • градиент канала кэшируется (1 раз на ресайз, а не каждый кадр),
   • хвост пакета — заранее отрисованный спрайт (drawImage вместо createLinearGradient в кадре),
   • DPR ограничен 1.5, число каналов умеренное.
   Замирает в фоновой вкладке и при reduce-motion (рисуем один статичный кадр). */
export default function DataFlow() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d', { alpha: true });
    let w = 0, h = 0, raf = 0, running = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let lanes = [];        // вертикальные каналы { x }
    let packets = [];      // бегущие пакеты
    let laneGrad = null;   // кэш градиента канала (одинаков для всех — вертикаль 0..h)

    // Спрайт головы пакета (свечение) — рисуется один раз
    const head = document.createElement('canvas');
    const hctx = head.getContext('2d');
    const HS = 40; head.width = head.height = HS;
    (() => {
      const c = HS / 2;
      const g = hctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, 'rgba(228, 248, 255, 1)');
      g.addColorStop(0.25, 'rgba(120, 205, 255, 0.85)');
      g.addColorStop(0.6, 'rgba(70, 150, 255, 0.22)');
      g.addColorStop(1, 'rgba(70, 150, 255, 0)');
      hctx.fillStyle = g;
      hctx.beginPath(); hctx.arc(c, c, c, 0, Math.PI * 2); hctx.fill();
    })();

    // Спрайт хвоста: вертикальный градиент (низ — ярко, верх — прозрачно), тянем по высоте
    const tail = document.createElement('canvas');
    const tctx = tail.getContext('2d');
    tail.width = 6; tail.height = 64;
    (() => {
      const g = tctx.createLinearGradient(0, 64, 0, 0);
      g.addColorStop(0, 'rgba(150, 215, 255, 0.55)');
      g.addColorStop(1, 'rgba(150, 215, 255, 0)');
      tctx.fillStyle = g; tctx.fillRect(0, 0, 6, 64);
    })();

    const makePacket = (lane, top) => ({
      lane,
      y: top ? -Math.random() * h : Math.random() * h,
      sp: 55 + Math.random() * 120,          // px/сек
      len: 38 + Math.random() * 80,          // длина хвоста
      size: 5 + Math.random() * 5,
      a: 0.45 + Math.random() * 0.5,
    });

    const build = () => {
      const count = Math.max(4, Math.round(w / 300));   // умеренная плотность
      lanes = Array.from({ length: count }, (_, i) => ({
        x: Math.round((i + 0.5) * (w / count) + (Math.random() - 0.5) * 50),
      }));
      packets = [];
      for (const lane of lanes) {
        const n = 1 + Math.floor(Math.random() * 2);
        for (let k = 0; k < n; k++) packets.push(makePacket(lane, false));
      }
      // Кэш градиента канала (вертикаль во всю высоту — общий для всех каналов)
      laneGrad = ctx.createLinearGradient(0, 0, 0, h);
      laneGrad.addColorStop(0, 'rgba(120, 180, 255, 0)');
      laneGrad.addColorStop(0.5, 'rgba(120, 180, 255, 0.05)');
      laneGrad.addColorStop(1, 'rgba(120, 180, 255, 0)');
    };

    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };

    let prev = 0;
    const render = (now) => {
      raf = 0;
      const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0.016;
      prev = now;

      ctx.clearRect(0, 0, w, h);

      // Тусклые каналы (кэшированный градиент, без пересоздания в кадре)
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = laneGrad; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const lane of lanes) { ctx.moveTo(lane.x, 0); ctx.lineTo(lane.x, h); }
      ctx.stroke();

      // Пакеты с хвостом (additive)
      ctx.globalCompositeOperation = 'lighter';
      for (const p of packets) {
        if (!reduce) p.y += p.sp * dt;
        if (p.y - p.len > h) { Object.assign(p, makePacket(p.lane, true)); continue; }
        const x = p.lane.x;
        ctx.globalAlpha = p.a;
        // хвост: спрайт растянут от головы вверх на длину len
        ctx.drawImage(tail, x - 3, p.y - p.len, 6, p.len);
        // голова
        const s = p.size * 2.6;
        ctx.drawImage(head, x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      if (running && !reduce) raf = requestAnimationFrame(render);
    };

    const start = () => { if (!running) { running = true; prev = 0; if (!raf) raf = requestAnimationFrame(render); } };
    const stop = () => { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    resize();

    let rzT = 0;
    const onResize = () => { clearTimeout(rzT); rzT = setTimeout(resize, 150); };
    window.addEventListener('resize', onResize, { passive: true });

    const onVis = () => { document.hidden ? stop() : start(); };
    document.addEventListener('visibilitychange', onVis);

    if (reduce) requestAnimationFrame(render);    // один статичный кадр
    else if (!document.hidden) start();

    return () => {
      stop();
      clearTimeout(rzT);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas id="dataflow" ref={ref} aria-hidden="true" />;
}

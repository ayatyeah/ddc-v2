import { useEffect, useRef } from 'react';

/* Потоки данных: вертикальные «каналы» (faint lines), по которым вниз бегут светящиеся
   пакеты с кометным хвостом — ощущение живой передачи данных через всю страницу.
   Лёгкий слой: один canvas, additive-блендинг, спрайт-свечение рисуется один раз.
   Только десктоп; замирает в фоновой вкладке и при reduce-motion (статичный кадр). */
export default function DataFlow() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d', { alpha: true });
    let w = 0, h = 0, raf = 0, running = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let lanes = [];     // вертикальные каналы
    let packets = [];   // бегущие пакеты

    // Спрайт-свечение пакета (рисуется один раз)
    const sprite = document.createElement('canvas');
    const sctx = sprite.getContext('2d');
    const SP = 48;
    sprite.width = sprite.height = SP;
    (() => {
      const c = SP / 2;
      const g = sctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, 'rgba(228, 248, 255, 1)');
      g.addColorStop(0.25, 'rgba(120, 205, 255, 0.85)');
      g.addColorStop(0.6, 'rgba(70, 150, 255, 0.25)');
      g.addColorStop(1, 'rgba(70, 150, 255, 0)');
      sctx.fillStyle = g;
      sctx.beginPath(); sctx.arc(c, c, c, 0, Math.PI * 2); sctx.fill();
    })();

    const makePacket = (lane, startTop) => ({
      lane,
      y: startTop ? -Math.random() * h : Math.random() * h,
      sp: 60 + Math.random() * 140,          // px/сек
      len: 40 + Math.random() * 90,          // длина хвоста
      size: 5 + Math.random() * 6,
      a: 0.5 + Math.random() * 0.5,
    });

    const build = () => {
      // Каналы редкие, неравномерные — не «сетка», а отдельные русла данных.
      const count = Math.max(5, Math.round(w / 240));
      lanes = Array.from({ length: count }, (_, i) => ({
        x: (i + 0.5) * (w / count) + (Math.random() - 0.5) * 60,
      }));
      packets = [];
      for (const lane of lanes) {
        const n = 1 + Math.floor(Math.random() * 2);
        for (let k = 0; k < n; k++) packets.push(makePacket(lane, false));
      }
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

      // Тусклые каналы
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 1;
      for (const lane of lanes) {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(120, 180, 255, 0)');
        grad.addColorStop(0.5, 'rgba(120, 180, 255, 0.06)');
        grad.addColorStop(1, 'rgba(120, 180, 255, 0)');
        ctx.strokeStyle = grad;
        ctx.beginPath(); ctx.moveTo(lane.x, 0); ctx.lineTo(lane.x, h); ctx.stroke();
      }

      // Пакеты с хвостом (additive)
      ctx.globalCompositeOperation = 'lighter';
      for (const p of packets) {
        if (!reduce) p.y += p.sp * dt;
        if (p.y - p.len > h) { Object.assign(p, makePacket(p.lane, true)); continue; }
        const x = p.lane.x;

        // Хвост — вытянутый градиент вверх от головы пакета
        const tg = ctx.createLinearGradient(0, p.y, 0, p.y - p.len);
        tg.addColorStop(0, `rgba(150, 215, 255, ${0.5 * p.a})`);
        tg.addColorStop(1, 'rgba(150, 215, 255, 0)');
        ctx.strokeStyle = tg;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y - p.len); ctx.stroke();

        // Голова — свечение
        ctx.globalAlpha = p.a;
        const s = p.size * 2.6;
        ctx.drawImage(sprite, x - s / 2, p.y - s / 2, s, s);
        ctx.globalAlpha = 1;
      }
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

    if (reduce) requestAnimationFrame(render);
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

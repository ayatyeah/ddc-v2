import { useEffect, useRef } from 'react';
import { KZ_OUTLINE, KZ_NODES } from './kzGeo.js';

/* Лёгкий 2D-фон для мобильных — вместо тяжёлой WebGL-сцены Scene3D.
   Неоновый контур Казахстана + дрейфующие светящиеся искорки на одном canvas,
   без Three.js, ~30 fps, со стабильным размером (адресная строка не пересайзит).
   Десктоп по-прежнему использует полную 3D-сцену (Background3D/Scene3D). */
export default function MobileBackground() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d', { alpha: true });
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // лёгкое разрешение на телефоне
    let W = 0, H = 0, raf = 0, running = false, last = 0, t = 0;
    let pts = [];

    // Спрайт искорки (ядро + ореол) — рисуется ОДИН раз, в кадре только drawImage.
    const sprite = document.createElement('canvas'); const sctx = sprite.getContext('2d');
    const SP = 64; const c = SP / 2;
    sprite.width = SP; sprite.height = SP;
    const g = sctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(230,244,255,1)'); g.addColorStop(0.14, 'rgba(230,244,255,0.8)');
    g.addColorStop(0.4, 'rgba(90,160,255,0.3)'); g.addColorStop(1, 'rgba(90,160,255,0)');
    sctx.fillStyle = g; sctx.beginPath(); sctx.arc(c, c, c, 0, 6.283); sctx.fill();

    const make = () => { const r = 0.8 + Math.random() * 2.0; return {
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16 - 0.03,
      size: r * 8, ph: Math.random() * 6.283, sp: 0.6 + Math.random() * 1.3, tw: 0.45 + Math.random() * 0.55,
    }; };

    function resize() {
      // Стабильная высота (максимум экрана): адресная строка при скролле НЕ пересайзит канвас.
      const nw = window.innerWidth;
      const nh = Math.max(window.innerHeight, (window.screen && window.screen.height) || 0);
      if (nw === W && nh === H) return;
      W = nw; H = nh;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(50, Math.round((W * H) / 16000));
      pts = Array.from({ length: count }, make);
    }

    function drawMap(pulse) {
      const scale = Math.min(W * 0.40, H * 0.30);
      const cx = W / 2, cy = H * 0.46 + (reduce ? 0 : Math.sin(t * 0.5) * 3);
      ctx.beginPath();
      for (let i = 0; i < KZ_OUTLINE.length; i++) {
        const x = cx + KZ_OUTLINE[i][0] * scale, y = cy - KZ_OUTLINE[i][1] * scale;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.lineJoin = 'round';
      ctx.lineWidth = 4.5; ctx.strokeStyle = `rgba(58,160,255,${0.12 + pulse * 0.10})`; ctx.stroke();
      ctx.lineWidth = 1.3; ctx.strokeStyle = `rgba(205,238,255,${0.65 + pulse * 0.25})`; ctx.stroke();
      for (let i = 0; i < KZ_NODES.length; i++) {
        const x = cx + KZ_NODES[i][0] * scale, y = cy - KZ_NODES[i][1] * scale;
        ctx.beginPath(); ctx.arc(x, y, 1.7, 0, 6.283);
        ctx.fillStyle = `rgba(170,225,255,${0.55 + pulse * 0.3})`; ctx.fill();
      }
    }

    function render(now) {
      raf = running ? requestAnimationFrame(render) : 0;
      if (!reduce && now - last < 33) return;     // ~30 fps — экономно и плавно
      last = now; t += 0.033;
      ctx.clearRect(0, 0, W, H);
      const pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.9);
      drawMap(pulse);
      ctx.globalCompositeOperation = 'lighter';
      for (const a of pts) {
        if (!reduce) {
          a.x += a.vx; a.y += a.vy; a.ph += 0.016 * a.sp;
          if (a.x < -40) a.x = W + 40; else if (a.x > W + 40) a.x = -40;
          if (a.y < -40) a.y = H + 40; else if (a.y > H + 40) a.y = -40;
        }
        const tw = reduce ? 0.85 : 1 - a.tw + a.tw * (0.5 + 0.5 * Math.sin(a.ph));
        ctx.globalAlpha = tw; const s = a.size;
        ctx.drawImage(sprite, a.x - s / 2, a.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    const start = () => { if (!running) { running = true; last = 0; raf = requestAnimationFrame(render); } };
    const stop = () => { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    resize();
    let rzT = 0;
    const onResize = () => { clearTimeout(rzT); rzT = setTimeout(resize, 150); };
    window.addEventListener('resize', onResize, { passive: true });
    const onVis = () => { document.hidden ? stop() : start(); };
    document.addEventListener('visibilitychange', onVis);

    if (reduce) requestAnimationFrame(render);     // один статичный кадр
    else if (!document.hidden) start();

    return () => {
      stop(); clearTimeout(rzT);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas id="bg3d" ref={ref} aria-hidden="true" />;
}

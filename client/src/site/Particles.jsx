import { useEffect, useRef } from 'react';
import { useTheme } from '../store.js';

/* Летающие светящиеся частицы на заднем фоне (#particles в styles.css).
   Голубые искорки мягко дрейфуют, пульсируют яркостью и светятся.
   Оптимизация: свечение каждой искорки нарисовано ОДИН раз в офскрин-спрайт,
   в кадре только drawImage + альфа — это в разы дешевле, чем createRadialGradient
   на каждую частицу каждый кадр. Анимация замирает в фоновой вкладке и при
   reduce-motion. */
export default function Particles() {
  const ref = useRef(null);
  const theme = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d', { alpha: true });
    let w = 0, h = 0, raf = 0, running = false;
    const mobile = window.innerWidth < 760;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 2);  // дешевле на телефоне
    let pts = [];

    // Офскрин-спрайт искорки (ядро + ореол) — рисуется один раз на тему
    const sprite = document.createElement('canvas');
    const sctx = sprite.getContext('2d');
    const SPRITE = 64; // px
    let spriteTheme = null;

    const buildSprite = () => {
      const dark = themeRef.current === 'dark';
      const core = dark ? '230, 244, 255' : '120, 175, 255';
      const glow = dark ? '90, 160, 255' : '40, 110, 230';
      sprite.width = SPRITE; sprite.height = SPRITE;
      sctx.clearRect(0, 0, SPRITE, SPRITE);
      const c = SPRITE / 2;
      const g = sctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, `rgba(${core}, 1)`);
      g.addColorStop(0.12, `rgba(${core}, 0.85)`);
      g.addColorStop(0.35, `rgba(${glow}, 0.35)`);
      g.addColorStop(0.7, `rgba(${glow}, 0.08)`);
      g.addColorStop(1, `rgba(${glow}, 0)`);
      sctx.fillStyle = g;
      sctx.beginPath(); sctx.arc(c, c, c, 0, Math.PI * 2); sctx.fill();
      spriteTheme = themeRef.current;
    };

    const make = () => {
      const r = 0.8 + Math.random() * 2.2;
      return {
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18 - 0.04,
        size: r * 8,                    // экранный размер спрайта (ореол ~ в 8× ядра)
        ph: Math.random() * Math.PI * 2,
        sp: 0.6 + Math.random() * 1.4,
        tw: 0.45 + Math.random() * 0.55,
      };
    };

    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(mobile ? 40 : 110, Math.round((w * h) / (mobile ? 26000 : 15000)));
      pts = Array.from({ length: count }, make);
    };

    const render = () => {
      raf = 0;
      if (spriteTheme !== themeRef.current) buildSprite();
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const a of pts) {
        if (!reduce) {
          a.x += a.vx; a.y += a.vy;
          a.ph += 0.016 * a.sp;
          if (a.x < -40) a.x = w + 40; else if (a.x > w + 40) a.x = -40;
          if (a.y < -40) a.y = h + 40; else if (a.y > h + 40) a.y = -40;
        }
        const tw = reduce ? 0.85 : 1 - a.tw + a.tw * (0.5 + 0.5 * Math.sin(a.ph));
        ctx.globalAlpha = tw;
        const s = a.size;
        ctx.drawImage(sprite, a.x - s / 2, a.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (running && !reduce) raf = requestAnimationFrame(render);
    };

    const start = () => { if (!running) { running = true; if (!raf) raf = requestAnimationFrame(render); } };
    const stop = () => { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    buildSprite();
    resize();

    // Перерисовка размеров — троттлим, чтобы ресайз не сыпал кадрами
    let rzT = 0;
    const onResize = () => { clearTimeout(rzT); rzT = setTimeout(resize, 150); };
    window.addEventListener('resize', onResize, { passive: true });

    // Идёт только когда вкладка видима. reduce → один статичный кадр.
    const onVis = () => { document.hidden ? stop() : start(); };
    document.addEventListener('visibilitychange', onVis);

    if (reduce) { render(); }
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

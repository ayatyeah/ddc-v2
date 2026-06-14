import { useEffect, useRef } from 'react';
import { useTheme } from '../store.js';

/* Лёгкие летающие частицы на фоне (#particles в styles.css).
   Тонкие точки дрейфуют и соединяются линиями вблизи. Уважает prefers-reduced-motion. */
export default function Particles() {
  const ref = useRef(null);
  const theme = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, raf = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let pts = [];

    const palette = () => (themeRef.current === 'dark'
      ? { dot: 'rgba(140,170,255,', line: 'rgba(120,150,235,' }
      : { dot: 'rgba(40,90,210,', line: 'rgba(40,90,210,' });

    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // плотность точек зависит от площади (но с потолком ради производительности)
      const count = Math.min(130, Math.round((w * h) / 14000));
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        r: 1 + Math.random() * 1.8,
      }));
    };

    const draw = () => {
      const p = palette();
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        a.x += a.vx; a.y += a.vy;
        if (a.x < -20) a.x = w + 20; if (a.x > w + 20) a.x = -20;
        if (a.y < -20) a.y = h + 20; if (a.y > h + 20) a.y = -20;
        // линии к соседям
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < 16000) {
            const o = (1 - dist2 / 16000) * 0.16;
            ctx.strokeStyle = p.line + o + ')';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        ctx.fillStyle = p.dot + '0.5)';
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    if (reduce) draw(); // один кадр без анимации
    else raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas id="particles" ref={ref} aria-hidden="true" />;
}

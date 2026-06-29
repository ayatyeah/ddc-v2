import { useEffect, useRef, useState } from 'react';
import { useRoute } from './router.js';

/* Живой FPS-анализатор внизу экрана. Живёт в обёртке сайта (Site.jsx), поэтому
   присутствует на ВСЕХ страницах и не пропадает при переходах — меряет и переходы
   тоже. Считает кадры собственным rAF, фризы/худший кадр берёт из perfMonitor. */

const PATHNAME = {
  '/': 'Главная', '/uslugi': 'Услуги', '/proekty': 'Проекты',
  '/o-nas': 'О нас', '/kontakty': 'Контакты', '/politika-konfidencialnosti': 'Политика',
};

export default function FpsHud() {
  const path = useRoute();
  const cvRef = useRef(null);
  const liveRef = useRef({ ema: 60, min: 999 });
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem('ddc_fps_hud') === 'off'; } catch { return false; } });
  const [info, setInfo] = useState({ fps: 0, min: 0, worst: 0, freezes: 0 });

  useEffect(() => {
    if (hidden) return;
    const cv = cvRef.current;
    const ctx = cv && cv.getContext ? cv.getContext('2d') : null;
    const W = 92, H = 24, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv) { cv.width = W * dpr; cv.height = H * dpr; if (ctx) ctx.scale(dpr, dpr); }
    const hist = new Array(W).fill(60);
    const col = (f) => (f >= 55 ? '#3fe7a0' : f >= 30 ? '#f3c44a' : '#ff5c5c');
    // На мобиле канвас перерисовываем реже (раз в 4 кадра) — чтобы сам HUD не подъедал rAF.
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    const drawEvery = mobile ? 4 : 1;
    let last = performance.now(), raf = 0, fc = 0;
    const live = liveRef.current;

    const draw = (now) => {
      const dt = now - last; last = now;
      if (dt > 0 && dt < 1000) {
        const inst = 1000 / dt;
        live.ema = live.ema * 0.9 + inst * 0.1;
        if (live.ema < live.min) live.min = live.ema;
        hist.push(live.ema); hist.shift();
      }
      if (ctx && (++fc % drawEvery === 0)) {
        ctx.clearRect(0, 0, W, H);
        ctx.lineWidth = 1; ctx.globalAlpha = 0.9;
        for (let i = 0; i < W; i++) {
          const f = hist[i], h = Math.max(1, Math.min(H, (f / 70) * H));
          ctx.strokeStyle = col(f);
          ctx.beginPath(); ctx.moveTo(i + 0.5, H); ctx.lineTo(i + 0.5, H - h); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const id = setInterval(() => {
      const m = window.__perfMon ? window.__perfMon.get() : null;
      setInfo({ fps: Math.round(live.ema), min: Math.round(live.min), worst: m ? m.worst : 0, freezes: m ? m.longFrames : 0 });
    }, 300);

    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, [hidden]);

  if (hidden) return null;
  const cls = info.fps >= 55 ? 'good' : info.fps >= 30 ? 'warn' : 'bad';
  const prog = (typeof window !== 'undefined' && typeof window.__sceneProgress === 'number') ? window.__sceneProgress : null;

  return (
    <div className={`fps-hud ${open ? 'open' : ''}`} role="status" aria-live="off">
      <button className="fps-main" onClick={() => setOpen((o) => !o)} title="FPS-анализатор (тап — детали)">
        <span className={`fps-n ${cls}`}>{info.fps || '—'}</span>
        <span className="fps-u">FPS</span>
        <canvas ref={cvRef} className="fps-spark" />
        {info.freezes > 0 && <span className="fps-fz">⚠{info.freezes}</span>}
      </button>
      {open && (
        <div className="fps-panel">
          <div className="fps-row"><span>Страница</span><b>{PATHNAME[path] || path}</b></div>
          <div className="fps-row"><span>Мин. FPS</span><b className={info.min < 30 ? 'bad' : ''}>{info.min || '—'}</b></div>
          <div className="fps-row"><span>Худший кадр</span><b className={info.worst >= 120 ? 'bad' : ''}>{info.worst ? info.worst + ' мс' : '—'}</b></div>
          <div className="fps-row"><span>Фризов всего</span><b>{info.freezes}</b></div>
          <div className="fps-row"><span>Момент сцены</span><b>{prog != null ? prog.toFixed(2) : '—'}</b></div>
          <button className="fps-hide" onClick={() => { setHidden(true); try { sessionStorage.setItem('ddc_fps_hud', 'off'); } catch {} }}>
            Скрыть до перезагрузки
          </button>
        </div>
      )}
    </div>
  );
}

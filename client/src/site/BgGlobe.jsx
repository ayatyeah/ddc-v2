import { useEffect, useRef } from 'react';
import createGlobe from 'cobe';
import { perf } from './perfProfile.js';

/* Фоновый WebGL-глобус (cobe). Заменяет 2D-кружок #bg-planet, синие тона.
   ПРОИЗВОДИТЕЛЬНОСТЬ:
   • инициализация отложена на requestIdleCallback — НЕ блокирует первый заход
     (раньше cobe строил карту из 16000 сэмплов синхронно на загрузке → фриз скролла);
   • DPR/сэмплы/размер зависят от профиля (Firefox и слабые — легче);
   • рендерим ТОЛЬКО когда вкладка видна и пользователь не скроллит активно
     (на время скролла глобус замирает, чтобы не конкурировать с основной сценой). */

const MARKERS = [
  { location: [51.16, 71.47], size: 0.11 },  // Астана — ярче/крупнее
  { location: [43.24, 76.89], size: 0.06 },  // Алматы
  { location: [49.80, 73.10], size: 0.05 },  // Караганда
  { location: [47.10, 51.92], size: 0.05 },  // Атырау
  { location: [42.34, 69.59], size: 0.05 },  // Шымкент
  { location: [50.28, 57.17], size: 0.05 },  // Актобе
];

export default function BgGlobe() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const light = perf.lowPower || perf.engine === 'gecko';
    const dpr = Math.min(window.devicePixelRatio || 1, light ? 1.25 : 1.5);
    const samples = light ? 7000 : 12000;
    let globe = null, phi = 0, alive = true;
    let scrolling = false, scrollT = 0;

    const build = () => {
      if (!alive) return;
      const size = Math.round(Math.min(Math.max(Math.min(window.innerWidth, window.innerHeight) * 0.42, 260), 480));
      canvas.style.width = size + 'px';
      canvas.style.height = size + 'px';
      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width: size * dpr, height: size * dpr,
        phi: 0, theta: 0.28,
        dark: 1, diffuse: 1.4,
        mapSamples: samples, mapBrightness: 9,
        baseColor: [0.2, 0.42, 0.72],
        markerColor: [0.55, 0.8, 1],
        glowColor: [0.25, 0.5, 0.9],
        markers: MARKERS,
        // во время активного скролла и в фоновой вкладке не крутим (глобус замирает —
        // меньше конкуренции с основной сценой за GPU/кадр)
        onRender: (state) => {
          if (!scrolling && !document.hidden) phi += 0.0035;
          state.phi = phi;
        },
      });
    };

    // Инициализация в простое главного потока (после первого экрана) — не блокирует заход.
    const idle = window.requestIdleCallback || ((f) => setTimeout(() => f(), 600));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;
    const idleId = idle(build);

    const onScroll = () => { scrolling = true; clearTimeout(scrollT); scrollT = setTimeout(() => { scrolling = false; }, 140); };
    window.addEventListener('scroll', onScroll, { passive: true });

    let rzT = 0;
    const onResize = () => { clearTimeout(rzT); rzT = setTimeout(() => { if (globe) { globe.destroy(); globe = null; build(); } }, 250); };
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      alive = false;
      try { cancelIdle(idleId); } catch { /* noop */ }
      clearTimeout(rzT); clearTimeout(scrollT);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (globe) globe.destroy();
    };
  }, []);

  return <canvas id="bg-globe" ref={ref} aria-hidden="true" />;
}

import { useEffect, useRef } from 'react';
import createGlobe from 'cobe';
import { perf } from './perfProfile.js';

/* Фоновый WebGL-глобус (cobe). Заменяет 2D-кружок #bg-planet, синие тона.
   ПРОИЗВОДИТЕЛЬНОСТЬ:
   • инициализация отложена на requestIdleCallback — НЕ блокирует первый заход;
   • DPR/сэмплы/размер зависят от профиля (Firefox и слабые — легче);
   • пересоздаём ТОЛЬКО при смене ширины (изменение высоты от адресной строки на
     мобиле игнорируем — иначе глобус мигал, пересоздаваясь);
   • в фоновой вкладке вращение замирает. */

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
    let globe = null, phi = 0, alive = true, lastW = window.innerWidth;

    const build = () => {
      if (!alive) return;
      const size = Math.round(Math.min(Math.max(Math.min(window.innerWidth, window.innerHeight) * 0.42, 260), 480));
      canvas.style.width = size + 'px';
      canvas.style.height = size + 'px';
      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width: size * dpr, height: size * dpr,
        phi: 0, theta: 0.25,
        dark: 0.55,                          // ниже = меньше «чёрной» неосвещённой стороны
        diffuse: 1.6,
        mapSamples: samples, mapBrightness: 13,
        baseColor: [0.26, 0.5, 0.85],        // яркая синяя суша
        markerColor: [0.6, 0.85, 1],
        glowColor: [0.35, 0.6, 1.0],         // выраженное синее свечение
        markers: MARKERS,
        onRender: (state) => {
          if (!document.hidden) phi += 0.0035;   // тихое автовращение (в фоне — пауза)
          state.phi = phi;
        },
      });
    };

    // Инициализация в простое главного потока (после первого экрана) — не блокирует заход.
    const idle = window.requestIdleCallback || ((f) => setTimeout(() => f(), 600));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;
    const idleId = idle(build);

    // Пересоздаём только при смене ШИРИНЫ (cobe фиксирует размер при создании). Высота
    // на мобиле «дышит» от адресной строки — её игнорируем, иначе глобус мигает.
    let rzT = 0;
    const onResize = () => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      clearTimeout(rzT);
      rzT = setTimeout(() => { if (globe) { globe.destroy(); globe = null; } build(); }, 300);
    };
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      alive = false;
      try { cancelIdle(idleId); } catch { /* noop */ }
      clearTimeout(rzT);
      window.removeEventListener('resize', onResize);
      if (globe) globe.destroy();
    };
  }, []);

  return <canvas id="bg-globe" ref={ref} aria-hidden="true" />;
}

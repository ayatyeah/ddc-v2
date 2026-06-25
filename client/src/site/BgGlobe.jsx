import { useEffect, useRef } from 'react';
import createGlobe from 'cobe';

/* Фоновый WebGL-глобус (на библиотеке cobe — основа MagicUI Globe), синие тона.
   Заменяет прежний 2D-кружок #bg-planet. Декоративный: pointer-events:none, без драга.
   Лёгкий (cobe ~5 КБ, instanced-точки на шейдере); на слабых устройствах не монтируется
   (Site рендерит вместо него статичный 2D-кружок). rAF браузер троттлит в фоновой вкладке. */

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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let globe = null, phi = 0;

    const build = () => {
      const size = Math.round(Math.min(Math.max(Math.min(window.innerWidth, window.innerHeight) * 0.42, 240), 520));
      canvas.style.width = size + 'px';
      canvas.style.height = size + 'px';
      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width: size * dpr, height: size * dpr,
        phi: 0, theta: 0.28,
        dark: 1, diffuse: 1.2,
        mapSamples: 16000, mapBrightness: 6,
        baseColor: [0.12, 0.28, 0.5],      // синяя суша
        markerColor: [0.45, 0.75, 1],      // яркие синие маркеры
        glowColor: [0.18, 0.4, 0.75],      // синее свечение атмосферы
        markers: MARKERS,
        onRender: (state) => { state.phi = phi; phi += 0.0035; },   // тихое автовращение
      });
    };
    build();

    // Пересоздаём при ресайзе (cobe фиксирует размер при создании)
    let rzT = 0;
    const onResize = () => { clearTimeout(rzT); rzT = setTimeout(() => { if (globe) globe.destroy(); build(); }, 200); };
    window.addEventListener('resize', onResize, { passive: true });

    return () => { clearTimeout(rzT); window.removeEventListener('resize', onResize); if (globe) globe.destroy(); };
  }, []);

  return <canvas id="bg-globe" ref={ref} aria-hidden="true" />;
}

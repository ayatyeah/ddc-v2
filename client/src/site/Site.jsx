import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../store.js';
import { useRoute } from './router.js';
import { ROUTES } from './pages.jsx';
import Nav from './Nav.jsx';
import Brand from './Brand.jsx';
import Footer from './Footer.jsx';
import Assistant from './Assistant.jsx';
import Fog from './Fog.jsx';

// Three.js-сцена (самая тяжёлая зависимость) — отдельным ленивым чанком: грузится
// ПОСЛЕ первого экрана и плавно проявляется. Контент главной виден сразу.
const Background3D = lazy(() => import('./Background3D.jsx'));
import Particles from './Particles.jsx';
import DataFlow from './DataFlow.jsx';
import ErrorBoundary from '../ErrorBoundary.jsx';

function hex(v) { const n = parseInt(v.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

// Мобила (<=760px) — лёгкий 2D-фон вместо тяжёлой WebGL-сцены. Реагируем на смену брейкпоинта.
function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

// Слабое устройство: мало ядер/памяти или просьба о пониженной анимации. На таких
// НЕ грузим дополнительные canvas-слои (частицы, потоки данных) — только адаптивную сцену.
function isLowPowerDevice() {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    const cores = navigator.hardwareConcurrency || 8;
    const mem = navigator.deviceMemory || 8;
    return cores <= 4 || mem <= 4;
  } catch { return false; }
}

export default function Site() {
  const theme = useTheme();
  const path = useRoute();
  const route = ROUTES[path] || ROUTES['/'];
  const Page = route.Comp;
  const isMobile = useIsMobile();
  const lowPower = useState(isLowPowerDevice)[0];   // считаем один раз на маунте

  const sceneRef = useRef(null);
  const onReady = useCallback((inst) => { sceneRef.current = inst; inst.setTarget(route.prog); inst.setYaw?.(route.yaw ?? 0); }, []); // eslint-disable-line

  // Параллакс слоёв: публикуем scrollY в CSS-переменную --sy (px), а слои двигаем через
  // calc(var(--sy) * factor) в CSS — дальний фон медленнее, текст быстрее → ощущение глубины.
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    const apply = () => { raf = 0; root.style.setProperty('--sy', window.scrollY + 'px'); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // SEO: обновляем заголовок и meta-описание при смене страницы (SPA-навигация)
  useEffect(() => {
    if (route.title) document.title = route.title;
    const setMeta = (sel, attr, val) => { const el = document.querySelector(sel); if (el) el.setAttribute(attr, val); };
    if (route.desc) {
      setMeta('meta[name="description"]', 'content', route.desc);
      setMeta('meta[property="og:description"]', 'content', route.desc);
    }
    if (route.title) setMeta('meta[property="og:title"]', 'content', route.title);
    const url = window.location.origin + path;
    setMeta('link[rel="canonical"]', 'href', url);
    setMeta('meta[property="og:url"]', 'content', url);
  }, [route, path]);

  // 3D-фон: на главной здания «играют» при скролле (башни→планета→карта),
  // на внутренних страницах — фиксированное состояние под маршрут (бесшовный лерп в сцене).
  // Единственный scroll-слушатель на весь фон: одно чтение layout за кадр, отсюда же
  // кормится туман (--fog) — чтобы не плодить параллельные reflow-хендлеры.
  useEffect(() => {
    const root = document.documentElement;
    const fogEl = document.getElementById('fog');
    sceneRef.current?.setPage?.();          // при смене страницы узор планеты (DDC) слегка меняется
    sceneRef.current?.setYaw?.(route.yaw ?? 0);   // у каждой страницы свой угол доворота карты
    if (path === '/') {
      let raf = 0;
      // Кэшируем высоту прокрутки и пересчитываем только на resize — чтобы НЕ читать
      // scrollHeight (reflow) на каждом кадре скролла. На мобиле это заметно для плавности.
      let maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);
      const recalc = () => { maxScroll = Math.max(1, root.scrollHeight - window.innerHeight); };
      const apply = () => {
        raf = 0;
        const sp = Math.min(1, Math.max(0, window.scrollY / maxScroll));
        sceneRef.current?.setTarget(0.04 + sp * 0.56);
        if (fogEl) fogEl.style.setProperty('--fog', Math.min(0.85, sp * 1.25).toFixed(3));
      };
      const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
      const onResize = () => { recalc(); onScroll(); };
      recalc(); apply();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
      return () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
        if (raf) cancelAnimationFrame(raf);
      };
    }
    sceneRef.current?.setTarget(route.prog);
    if (fogEl) fogEl.style.setProperty('--fog', '0');
  }, [path, route.prog]);

  // Палитра неба: плавный переход цвета под страницу
  const curRef = useRef(null);
  useEffect(() => {
    const bg = document.getElementById('scroll-bg'); if (!bg) return;
    const target = () => (theme === 'dark' ? route.dark : route.light);
    if (!curRef.current) { const t = target(); curRef.current = { top: hex(t.top), a: hex(t.a), b: hex(t.b) }; }
    let raf = 0;
    const set = (k, c) => bg.style.setProperty(k, `rgb(${c[0]|0}, ${c[1]|0}, ${c[2]|0})`);
    const tick = () => {
      const t = target(); const tg = { top: hex(t.top), a: hex(t.a), b: hex(t.b) };
      const cur = curRef.current; let done = true;
      for (const key of ['top', 'a', 'b']) {
        for (let i = 0; i < 3; i++) {
          const d = tg[key][i] - cur[key][i];
          if (Math.abs(d) > 0.6) { cur[key][i] += d * 0.08; done = false; } else cur[key][i] = tg[key][i];
        }
      }
      set('--bg-top', cur.top); set('--bg-a', cur.a); set('--bg-b', cur.b);
      raf = done ? 0 : requestAnimationFrame(tick);
    };
    tick();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [route, theme]);

  return (
    <>
      <a href="#main" className="skip-link">К основному содержимому</a>
      <div id="scroll-bg" aria-hidden="true" />
      <div id="scroll-aurora" aria-hidden="true" />
      <div id="bg-planet" aria-hidden="true" />
      <div id="scroll-depth" aria-hidden="true" />
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <Background3D onReady={onReady} />
        </Suspense>
      </ErrorBoundary>
      {!isMobile && !lowPower && <Particles />}
      {!isMobile && !lowPower && <DataFlow />}
      <Fog />
      <div id="scroll-grain" aria-hidden="true" />
      <Nav />
      <Brand />
      <main key={path} id="main" className="page-enter">
        <Page />
      </main>
      <Footer />
      <Assistant />
    </>
  );
}

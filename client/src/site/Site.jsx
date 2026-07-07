import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useA11y, useTheme, useLang } from '../store.js';
import { t } from '../i18n.js';
import { useRoute } from './router.js';
import { ROUTES, NotFoundPage } from './pages.jsx';
import Nav from './Nav.jsx';
import Brand from './Brand.jsx';
import Footer from './Footer.jsx';
import Assistant from './Assistant.jsx';
import Fog from './Fog.jsx';
import CircuitField from './CircuitField.jsx';
import DepthFog from './DepthFog.jsx';
import DdcBrand from './DdcBrand.jsx';
import HudLayer from './HudLayer.jsx';

// Three.js-сцена (самая тяжёлая зависимость) — отдельным ленивым чанком: грузится
// ПОСЛЕ первого экрана и плавно проявляется. Контент главной виден сразу.
const Background3D = lazy(() => import('./Background3D.jsx'));
import Particles from './Particles.jsx';
import ErrorBoundary from '../ErrorBoundary.jsx';
import { hideSplash } from '../splash.js';
import { perf } from './perfProfile.js';   // профиль устройства + детект слабого GPU (perf.lite)

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

export default function Site() {
  const path = useRoute();
  const known = ROUTES[path];
  const route = known || ROUTES['/'];       // фон/оттенок неба для 404 берём как у главной
  const Page = known ? route.Comp : NotFoundPage;
  const isMobile = useIsMobile();
  const lang = useLang();
  // «Лёгкий» режим: слабое устройство ИЛИ слабый GPU ИЛИ reduced-motion (см. perfProfile).
  // На таких НЕ грузим декор-слои глубины (PCB/туман/HUD/частицы) и параллакс мыши.
  const lowPower = useState(() => perf.lite)[0];
  const a11y = useA11y();   // версия для слабовидящих — без 3D, частиц и тумана
  const theme = useTheme(); // dark/light — влияет на палитру неба под страницу

  useEffect(() => { hideSplash(); }, []);   // контент сайта смонтирован — убираем загрузочный экран

  // Веб-аналитика: фиксируем просмотр страницы при каждой смене маршрута (устройство определит сервер по UA).
  useEffect(() => {
    try {
      fetch('/api/track', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ path, lang: document.documentElement.lang || '', ref: document.referrer || '' }),
      }).catch(() => {});
    } catch { /* аналитика не критична */ }
  }, [path]);

  // Новая страница всегда открывается сверху (мгновенно, без smooth — переход маскирует прыжок).
  useEffect(() => { try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch { window.scrollTo(0, 0); } }, [path]);

  const sceneRef = useRef(null);
  const onReady = useCallback((inst) => { sceneRef.current = inst; inst.setTarget(route.prog); inst.setTheme?.(theme); inst.setHeroBias?.(window.location.pathname === '/' ? 1 : 0); inst.setYaw?.(route.yaw ?? 0); }, []); // eslint-disable-line

  // Параллакс слоёв: публикуем scrollY в CSS-переменную --sy (px), а слои двигаем через
  // calc(var(--sy) * factor) в CSS — дальний фон медленнее, текст быстрее → ощущение глубины.
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    // Высоту прокрутки кэшируем (не читаем scrollHeight на каждом кадре — reflow);
    // пересчёт при смене страницы/resize. Небольшая неточность после подгрузки данных
    // не критична — --sp питает только тонкий прогресс-бар.
    let maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);
    const recalc = () => { maxScroll = Math.max(1, root.scrollHeight - window.innerHeight); };
    const apply = () => {
      raf = 0;
      root.style.setProperty('--sy', window.scrollY + 'px');
      if (window.scrollY > maxScroll) recalc();   // контент дорос (ленивые данные) — обновляем базу
      root.style.setProperty('--sp', Math.min(1, window.scrollY / maxScroll).toFixed(4));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const t = setTimeout(recalc, 1200);   // после первичной загрузки данных высота устаканилась
    recalc(); apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', recalc, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', recalc);
      clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [path]);

  // Параллакс мыши: публикуем --mx/--my (−1…1) — слои глубины смещаются на разную величину
  // (calc(var(--mx) * Npx)), создавая ощущение объёма. Только десктоп (на мобиле мыши нет).
  useEffect(() => {
    if (isMobile || lowPower) return;   // параллакс мыши — только на достаточно мощных устройствах
    const root = document.documentElement;
    let raf = 0, mx = 0, my = 0;
    // При просадке FPS (perf-tier ≥ 1, ставит Scene3D) обнуляем параллакс мыши — это первое,
    // что снимаем: постоянный композитинг больших слоёв на каждом движении курсора дорог.
    const flush = () => { raf = 0; const k = (+(root.dataset.perfTier || 0) >= 1) ? 0 : 1; root.style.setProperty('--mx', (mx * k).toFixed(3)); root.style.setProperty('--my', (my * k).toFixed(3)); };
    const onMove = (e) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => { window.removeEventListener('pointermove', onMove); if (raf) cancelAnimationFrame(raf); root.style.removeProperty('--mx'); root.style.removeProperty('--my'); };
  }, [isMobile, lowPower]);

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
    sceneRef.current?.navEase?.();          // мягкий замедленный доезд фона при переходе между разделами
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
        // Здание смещено вправо на герое (текст слева), возвращается к центру при скролле.
        sceneRef.current?.setHeroBias?.(Math.max(0, 1 - sp / 0.28));
        // HUD-оверлей гаснет при скролле (виден только на первом экране героя).
        root.style.setProperty('--hud', Math.max(0, 1 - sp * 4).toFixed(3));
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
    sceneRef.current?.setHeroBias?.(0);       // сдвиг вправо только на главной
    if (fogEl) fogEl.style.setProperty('--fog', '0');
  }, [path, route.prog]);

  // Палитра неба: плавный переход цвета под страницу
  const curRef = useRef(null);
  useEffect(() => {
    sceneRef.current?.setTheme?.(theme);   // туман 3D-сцены под тему (иначе даль уходит в серое)
    const bg = document.getElementById('scroll-bg'); if (!bg) return;
    const target = () => (theme === 'light' ? route.light : route.dark);
    if (!curRef.current) { const t = target(); curRef.current = { top: hex(t.top), a: hex(t.a), b: hex(t.b) }; }
    let raf = 0;
    const set = (k, c) => bg.style.setProperty(k, `rgb(${c[0]|0}, ${c[1]|0}, ${c[2]|0})`);
    const tick = () => {
      const t = target(); const tg = { top: hex(t.top), a: hex(t.a), b: hex(t.b) };
      const cur = curRef.current; let done = true;
      for (const key of ['top', 'a', 'b']) {
        for (let i = 0; i < 3; i++) {
          const d = tg[key][i] - cur[key][i];
          if (Math.abs(d) > 0.6) { cur[key][i] += d * 0.05; done = false; } else cur[key][i] = tg[key][i];
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
      <a href="#main" className="skip-link">{t(lang, 'a11y.skip')}</a>
      <div id="scroll-bg" aria-hidden="true" />
      <div id="scroll-aurora" aria-hidden="true" />
      <div id="bg-planet" aria-hidden="true" />
      <div id="scroll-depth" aria-hidden="true" />
      {/* ── СЛОИ ГЛУБИНЫ (только десктоп) — назад→вперёд, каждый со своим параллаксом ──
          фон (#scroll-bg) → PCB-линии (CircuitField) → туман (DepthFog) → [3D-сцена] → HUD.
          На мобиле всё это композитится на каждом кадре скролла → фризы, поэтому там только
          сцена + небо. */}
      {!isMobile && !lowPower && !a11y && <CircuitField />}
      {!isMobile && !lowPower && !a11y && <DepthFog />}
      {!isMobile && !lowPower && !a11y && <DdcBrand />}
      {/* 3D-сцена DDC (карта + здание) — на ВСЕХ устройствах, включая телефон. */}
      {!a11y && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <Background3D onReady={onReady} />
          </Suspense>
        </ErrorBoundary>
      )}
      {!isMobile && !lowPower && !a11y && <Particles />}
      {!isMobile && !a11y && <Fog />}
      {/* HUD-оверлей (передний план) — техно-элементы вокруг сцены, только на главной, гаснут при скролле. */}
      {!isMobile && !lowPower && !a11y && path === '/' && <HudLayer />}
      <div id="scroll-grain" aria-hidden="true" />
      <div className="scroll-progress" aria-hidden="true" />
      <Nav />
      <Brand />
      <main key={path} id="main" className="page-tx">
        <Page />
      </main>
      <Footer />
      <Assistant />
      {/* Плашка «Установить приложение» с сайта убрана: установка — в портале (Профиль). */}
    </>
  );
}

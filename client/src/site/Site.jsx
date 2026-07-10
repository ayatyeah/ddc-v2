import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { useA11y, useTheme, useLang } from '../store.js';
import { t } from '../i18n.js';
import { useRoute } from './router.js';
import { ROUTES, NotFoundPage } from './pages.jsx';
import Nav from './Nav.jsx';
import Brand from './Brand.jsx';
import Footer from './Footer.jsx';
import Assistant from './Assistant.jsx';

// Three.js-сцена (самая тяжёлая зависимость) — отдельным ленивым чанком: грузится
// ПОСЛЕ первого экрана и плавно проявляется. Контент главной виден сразу.
const Background3D = lazy(() => import('./Background3D.jsx'));
import ErrorBoundary from '../ErrorBoundary.jsx';
import { hideSplash } from '../splash.js';

function hex(v) { const n = parseInt(v.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

export default function Site() {
  const path = useRoute();
  const known = ROUTES[path];
  const route = known || ROUTES['/'];       // фон/оттенок неба для 404 берём как у главной
  const Page = known ? route.Comp : NotFoundPage;
  const lang = useLang();
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

  // NB: прежние параллакс-слои (.hero-orbs/.hero-inner/.circuit-field/.depth-fog/.hud-layer)
  // удалены из DOM при упрощении фона, поэтому переменные --sy/--mx/--my/--hud больше НЕ
  // публикуем: их не читает ни один смонтированный слой, а запись на :root каждый кадр скролла
  // и каждое движение мыши стоила лишних style-recalc → микрофризы. Прогресс-бар (--sp) и
  // 3D-сцену теперь кормит ЕДИНЫЙ scroll-эффект ниже (одно чтение layout + один rAF на кадр).

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

  // Единый scroll-драйвер фона: одно чтение layout и ОДИН rAF на кадр (раньше на главной
  // висело ДВА отдельных scroll-слушателя, каждый со своим rAF → лишние кадры и style-recalc).
  // Публикует --sp (тонкий прогресс-бар — нужен на всех страницах, компоновка через scaleX),
  // а на главной тем же кадром двигает 3D-сцену: башни→планета→карта. На внутренних страницах —
  // фиксированное состояние под маршрут (бесшовный лерп в самой сцене).
  useEffect(() => {
    const root = document.documentElement;
    const home = path === '/';
    sceneRef.current?.setPage?.();          // при смене страницы узор планеты (DDC) слегка меняется
    sceneRef.current?.navEase?.();          // мягкий замедленный доезд фона при переходе между разделами
    sceneRef.current?.setYaw?.(route.yaw ?? 0);   // у каждой страницы свой угол доворота карты
    let raf = 0;
    // Кэшируем высоту прокрутки, пересчитываем только на resize/подгрузке — чтобы НЕ читать
    // scrollHeight (reflow) на каждом кадре скролла. На мобиле это заметно для плавности.
    let maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);
    const recalc = () => { maxScroll = Math.max(1, root.scrollHeight - window.innerHeight); };
    // --sp читает ТОЛЬКО прогресс-бар. Пишем переменную прямо на него, а не в :root —
    // иначе каждый кадр скролла инвалидируется стиль всего дерева (микрофризы).
    const bar = document.querySelector('.scroll-progress');
    let lastSp = '', lastBias = -1;
    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      if (y > maxScroll) recalc();          // контент дорос (ленивые данные) — обновляем базу
      const sp = Math.min(1, Math.max(0, y / maxScroll));
      const spStr = sp.toFixed(4);
      if (bar && spStr !== lastSp) { bar.style.setProperty('--sp', spStr); lastSp = spStr; }  // мемо: не переписываем то же значение
      if (home) {
        sceneRef.current?.setTarget(0.04 + sp * 0.56);
        // Здание смещено вправо на герое (текст слева), возвращается к центру при скролле.
        // Мемо: ниже первого экрана bias всегда 0 — не дёргаем сцену (в offthread это postMessage).
        const bias = Math.max(0, 1 - sp / 0.28);
        if (bias !== lastBias) { sceneRef.current?.setHeroBias?.(bias); lastBias = bias; }
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    // iOS: при скролле СНИЗУ ВВЕРХ разворачивается адресная строка и браузер сыплет resize-событиями.
    // recalc() читает scrollHeight — это принудительный reflow, и мы делали его десятки раз прямо
    // посреди жеста → падение FPS на обратном скролле. Дебаунсим: пересчёт после паузы, а слегка
    // устаревший maxScroll на эти 180 мс ни на что не влияет (он питает только прогресс-бар и сцену).
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { recalc(); onScroll(); }, 180); };
    const t = setTimeout(recalc, 1200);     // после первичной загрузки данных высота устаканилась
    recalc(); apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    if (!home) { sceneRef.current?.setTarget(route.prog); sceneRef.current?.setHeroBias?.(0); }   // статичное состояние под маршрут
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      clearTimeout(t); clearTimeout(rt);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [path, route.prog, route.yaw]);

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
      {/* 3D-сцена DDC (карта + здание) — на ВСЕХ устройствах, включая телефон. */}
      {!a11y && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <Background3D onReady={onReady} />
          </Suspense>
        </ErrorBoundary>
      )}
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

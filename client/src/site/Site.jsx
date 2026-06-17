import { useCallback, useEffect, useRef } from 'react';
import { useTheme } from '../store.js';
import { useRoute } from './router.js';
import { ROUTES } from './pages.jsx';
import Nav from './Nav.jsx';
import Brand from './Brand.jsx';
import Footer from './Footer.jsx';
import Assistant from './Assistant.jsx';
import Background3D from './Background3D.jsx';
import Fog from './Fog.jsx';
import Particles from './Particles.jsx';
import ErrorBoundary from '../ErrorBoundary.jsx';

function hex(v) { const n = parseInt(v.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

export default function Site() {
  const theme = useTheme();
  const path = useRoute();
  const route = ROUTES[path] || ROUTES['/'];
  const Page = route.Comp;

  const sceneRef = useRef(null);
  const onReady = useCallback((inst) => { sceneRef.current = inst; inst.setTarget(route.prog); }, []); // eslint-disable-line

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
    if (path === '/') {
      let raf = 0;
      const apply = () => {
        raf = 0;
        const max = root.scrollHeight - window.innerHeight;
        const sp = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        sceneRef.current?.setTarget(0.04 + sp * 0.56);
        if (fogEl) fogEl.style.setProperty('--fog', Math.min(0.85, sp * 1.25).toFixed(3));
      };
      const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
      apply();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      return () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
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
      <div id="scroll-depth" aria-hidden="true" />
      <ErrorBoundary fallback={null}>
        <Background3D onReady={onReady} />
      </ErrorBoundary>
      <Particles />
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

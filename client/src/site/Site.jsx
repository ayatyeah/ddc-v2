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

function hex(v) { const n = parseInt(v.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

export default function Site() {
  const theme = useTheme();
  const path = useRoute();
  const route = ROUTES[path] || ROUTES['/'];
  const Page = route.Comp;

  const sceneRef = useRef(null);
  const onReady = useCallback((inst) => { sceneRef.current = inst; inst.setTarget(route.prog); }, []); // eslint-disable-line

  // 3D-фон: на главной здания «играют» при скролле (башни→планета→карта),
  // на внутренних страницах — фиксированное состояние под маршрут (бесшовный лерп в сцене).
  useEffect(() => {
    if (path === '/') {
      const onScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const sp = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        sceneRef.current?.setTarget(0.04 + sp * 0.56);
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }
    sceneRef.current?.setTarget(route.prog);
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
      <div id="scroll-bg" />
      <div id="scroll-aurora" />
      <div id="scroll-depth" />
      <Background3D onReady={onReady} />
      <Fog />
      <div id="scroll-grain" />
      <Nav />
      <Brand />
      <main key={path} className="page-enter">
        <Page />
      </main>
      <Footer />
      <Assistant />
    </>
  );
}

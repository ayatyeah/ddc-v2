import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';

const listeners = new Set();
const prefersReduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export function navigate(path) {
  const lenis = typeof window !== 'undefined' ? window.__lenis : null;
  if (path === window.location.pathname) {
    if (lenis) lenis.scrollTo(0); else window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  history.pushState({}, '', path);
  // Сброс к началу новой страницы мгновенно (через Lenis, если активен — иначе он бы «доезжал»).
  if (lenis) lenis.scrollTo(0, { immediate: true }); else window.scrollTo(0, 0);
  listeners.forEach((l) => l(path));
}

export function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => {
      const apply = () => setPath(window.location.pathname);
      // Плавный кроссфейд между страницами через View Transitions API (Chrome/Edge/Firefox/Safari 18+).
      // flushSync — чтобы React обновил DOM синхронно ВНУТРИ перехода (иначе снимок сделается до апдейта).
      if (document.startViewTransition && !prefersReduced()) {
        try {
          const vt = document.startViewTransition(() => flushSync(apply));
          // Подавляем шум «Transition was skipped» при быстрой/прерванной навигации (переход просто мгновенный).
          vt.ready?.catch(() => {}); vt.finished?.catch(() => {}); vt.updateCallbackDone?.catch(() => {});
        } catch { apply(); }
      } else { apply(); }
    };
    listeners.add(on);
    window.addEventListener('popstate', on);
    return () => { listeners.delete(on); window.removeEventListener('popstate', on); };
  }, []);
  return path;
}

import { useState, useEffect } from 'react';

const listeners = new Set();

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
    const on = () => setPath(window.location.pathname);
    listeners.add(on);
    window.addEventListener('popstate', on);
    return () => { listeners.delete(on); window.removeEventListener('popstate', on); };
  }, []);
  return path;
}

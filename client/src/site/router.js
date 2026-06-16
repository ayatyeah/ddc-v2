import { useState, useEffect } from 'react';

const listeners = new Set();

export function navigate(path) {
  if (path === window.location.pathname) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  history.pushState({}, '', path);
  window.scrollTo(0, 0);
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

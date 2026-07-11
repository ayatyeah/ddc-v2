import { useState, useEffect } from 'react';

const listeners = new Set();

export function navigate(path) {
  const lenis = typeof window !== 'undefined' ? window.__lenis : null;
  if (path === window.location.pathname) {
    if (lenis) lenis.scrollTo(0); else window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  history.pushState({}, '', path);
  // Метка конца пролёта фона (navEase длится 1.1с). Ленивые 3D-виджеты новой страницы —
  // напр. витрина Услуг — по ней откладывают тяжёлую инициализацию за конец пролёта, чтобы
  // компиляция шейдеров не попала на движущийся фон и не дала фриз. Ставим СЕЙЧАС, синхронно
  // до ре-рендера: у React эффекты детей срабатывают раньше эффектов родителя, и виджет
  // должен увидеть метку уже выставленной. При первичной загрузке navigate() не вызывается —
  // прямой заход на /uslugi инициализируется без лишнего ожидания.
  window.__ddcFlyUntil = performance.now() + 1200;
  // Сброс к началу новой страницы мгновенно (через Lenis, если активен — иначе он бы «доезжал»).
  if (lenis) lenis.scrollTo(0, { immediate: true }); else window.scrollTo(0, 0);
  listeners.forEach((l) => l(path));
}

export function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    // Контент страницы меняем сразу, БЕЗ кроссфейда/снимка (он давал белую «пелену» поверх
    // сцены). Видимый переход — это анимация самой 3D-сцены (пролёт здания→карта, navEase),
    // её теперь ничто не перекрывает.
    const on = () => setPath(window.location.pathname);
    listeners.add(on);
    window.addEventListener('popstate', on);
    return () => { listeners.delete(on); window.removeEventListener('popstate', on); };
  }, []);
  return path;
}

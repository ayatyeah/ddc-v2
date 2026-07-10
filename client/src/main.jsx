import React from 'react';
import { createRoot } from 'react-dom/client';
import Lenis from 'lenis';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { perf } from './site/perfProfile.js';   // ставит <html data-engine/data-perf>; детект слабого GPU
import './styles.css';

// Плавный «инерционный» скролл, как у топ-агентств — только для мыши/десктопа.
// ПЕРФ ТЕЛЕФОНА: на тач-устройствах Lenis не даёт ничего (smoothTouch выключен — скролл
// и так нативный), но его rAF-цикл крутится КАЖДЫЙ кадр на главном потоке рядом с воркером
// 3D-сцены и композитором, не давая браузеру простаивать. Именно это ощущалось как
// подтормаживание. На тач не инициализируем вовсе: остаётся нативный скролл с родной
// инерцией и rubber-band, главный поток свободен.
// При reduced-motion и на слабых устройствах (perf.lite) — тоже не включаем.
// router.navigate() работает и без Lenis — там есть фолбэк на window.scrollTo.
// (pointer: coarse) = ОСНОВНОЙ ввод — палец (телефон/планшет). Именно это нам нужно:
// у ноутбука с тач-экраном pointer остаётся fine, и он сохраняет плавный скролл мышью.
const touchDevice = window.matchMedia('(pointer: coarse)').matches;
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !perf.lite && !touchDevice) {
  const lenis = new Lenis({ duration: 1.15, smoothWheel: true });   // длиннее инерция — «воздушный» скролл
  const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  window.__lenis = lenis;   // для программного скролла (router.navigate)
}

// PWA: ловим beforeinstallprompt ЗДЕСЬ (событие стреляет один раз при загрузке,
// раньше, чем смонтируется портал) — кнопка установки живёт в портале (Профиль).
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__ddcInstall = e; });
window.addEventListener('appinstalled', () => { window.__ddcInstall = null; });

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

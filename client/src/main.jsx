import React from 'react';
import { createRoot } from 'react-dom/client';
import Lenis from 'lenis';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { perf } from './site/perfProfile.js';   // ставит <html data-engine/data-perf>; детект слабого GPU
import './styles.css';

// Плавный «инерционный» скролл, как у топ-агентств. На тач-устройствах — нативный
// скролл (smoothTouch выключен по умолчанию: легче для телефона). При reduced-motion
// не инициализируем вовсе. Скролл-сцена 3D читает window.scrollY → плавно следует за ним.
// На слабых устройствах (perf.lite) Lenis не включаем — нативный скролл легче и не плодит
// ещё один вечный rAF-цикл рядом со сценой. Длительность инерции снижена (0.9) — снаппи и меньше
// «тяжёлых» кадров за жест.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !perf.lite) {
  const lenis = new Lenis({ duration: 0.9, smoothWheel: true });
  const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  window.__lenis = lenis;   // для программного скролла (router.navigate)
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

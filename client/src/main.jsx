import React from 'react';
import { createRoot } from 'react-dom/client';
import Lenis from 'lenis';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './site/perfProfile.js';   // ставит <html data-engine> до первого кадра (per-engine CSS)
import './perfMonitor.js';        // монитор фризов фона (смотрим в админке → «Перф»)
import './styles.css';

// Плавный «инерционный» скролл, как у топ-агентств. На тач-устройствах — нативный
// скролл (smoothTouch выключен по умолчанию: легче для телефона). При reduced-motion
// не инициализируем вовсе. Скролл-сцена 3D читает window.scrollY → плавно следует за ним.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
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

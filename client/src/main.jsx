import React from 'react';
import { createRoot } from 'react-dom/client';
import Lenis from 'lenis';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './site/perfProfile.js';   // ставит <html data-engine> до первого кадра (per-engine CSS)
import './perfMonitor.js';        // монитор фризов фона (смотрим в админке → «Перф»)
import './styles.css';

// Плавный «инерционный» скролл, как у топ-агентств. syncTouch:true — Lenis сам рулит
// тач-скроллом через rAF: на iOS (Safari/WebKit, в т.ч. «Chrome») это снимает троттлинг
// rAF во время нативного скролла, поэтому 3D-сцена, привязанная к scrollY, едет гладко,
// а не дёргается под палец. При reduced-motion не инициализируем. Внутренние скроллы
// (модалки) исключаются атрибутом data-lenis-prevent.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const lenis = new Lenis({ duration: 1.1, smoothWheel: true, syncTouch: true, syncTouchLerp: 0.08 });
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

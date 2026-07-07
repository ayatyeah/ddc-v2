import { useEffect, useRef } from 'react';
import { perf } from './perfProfile.js';

/* Фон: 3D-сцена DDC (Scene3D.js). Этот компонент — «мост» между DOM и сценой.
   • Основной путь — рендер в Web Worker через OffscreenCanvas: весь three.js (кадр, шейдеры,
     геометрия) уходит с главного потока → скролл и тапы плавные, даже когда сцена грузит GPU.
     Это и есть правильное лекарство от фризов 3D-фона на мобиле (вместо scroll-hijack).
   • Фолбэк (браузеры без OffscreenCanvas: старые Safari) — сцена на главном потоке, как раньше.
   Мост владеет всем DOM-ом: создаёт канвас, слушает resize/visibility/pointer и передаёт
   события сцене вызовами методов (инлайн) или postMessage (воркер) — протокол одинаковый.
   Канвас создаётся императивно (не в JSX): transferControlToOffscreen можно вызвать один раз
   на элемент, а StrictMode перезапускает эффекты — на каждый запуск нужен свежий элемент. */
export default function Background3D({ onReady }) {
  const hostRef = useRef(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const mobile = window.matchMedia('(max-width: 760px)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // На мобиле рендерим в стабильную (максимальную) высоту экрана: адресная строка при
    // скролле меняет высоту вьюпорта, и если на это ресайзить буфер — кадр «дышит» и фризит.
    // Низ канваса просто уходит под фолд.
    const stableH = mobile ? Math.max(window.innerHeight, (window.screen && window.screen.height) || 0) : 0;
    const vw = () => window.innerWidth;
    const vh = () => (mobile ? stableH : window.innerHeight);
    const dprNow = () => Math.min(window.devicePixelRatio || 1, perf.dprCap);

    const makeCanvas = () => {
      const c = document.createElement('canvas');
      c.id = 'bg3d'; c.setAttribute('aria-hidden', 'true');
      c.style.opacity = '0';
      if (mobile) { c.style.width = vw() + 'px'; c.style.height = stableH + 'px'; }   // фикс-размер (см. выше)
      host.appendChild(c);
      return c;
    };
    let canvas = makeCanvas();

    const offthread = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
      && typeof canvas.transferControlToOffscreen === 'function';
    const mkEnv = () => ({
      perf: { ...perf, offthread }, mobile, reduce,
      theme: document.documentElement.dataset.theme || 'dark',
      width: vw(), height: vh(), dpr: dprNow(),
    });

    let disposed = false, worker = null, inst = null, fellBack = false, lastTarget = 0;
    const queue = [];   // команды до готовности инлайн-сцены (воркер сам буферизует сообщения)
    const call = (m, ...a) => {
      if (disposed) return;
      if (m === 'setTarget') lastTarget = a[0] || 0;
      if (worker) worker.postMessage({ type: m, a });
      else if (inst) inst[m]?.(...a);
      else queue.push([m, a]);
    };
    const onTier = (t) => { try { document.documentElement.dataset.perfTier = String(t); } catch { /* SSR */ } };

    // Логотип DDC для вывески на крыше. SVG умеет растеризовать только DOM — грузим здесь;
    // инлайн-сцене отдаём Image, воркеру — растровый ImageBitmap через канву.
    const sendLogo = () => {
      const logo = new Image();
      logo.onload = () => {
        if (disposed) return;
        if (!worker) { call('setLogo', logo); return; }
        try {
          const cv = document.createElement('canvas'); cv.width = cv.height = 256;
          cv.getContext('2d').drawImage(logo, 0, 0, 256, 256);
          createImageBitmap(cv).then((bmp) => {
            if (!disposed && worker) worker.postMessage({ type: 'setLogo', a: [bmp] }, [bmp]);
          }).catch(() => {});
        } catch { /* вывеска необязательна */ }
      };
      logo.onerror = () => {};
      logo.src = '/logo_ddc.svg';
    };

    // Фолбэк: сцена на главном потоке. import() вместо статического импорта — чтобы в
    // offthread-режиме главный поток вообще не тянул чанки Scene3D/three (они в бандле воркера).
    const startInline = () => {
      import('./Scene3D.js').then(({ initScene }) => {
        if (disposed) return;
        inst = initScene(canvas, { ...mkEnv(), perf: { ...perf, offthread: false }, onTier });
        for (const [m, a] of queue.splice(0)) inst[m]?.(...a);
        sendLogo();
      }).catch(() => {});
    };

    if (offthread) {
      worker = new Worker(new URL('./scene.worker.js', import.meta.url), { type: 'module' });
      // Сбой воркера (нет WebGL в воркере, упал чанк) → пересоздаём канвас (старый уже
      // отдан воркеру навсегда) и поднимаем сцену на главном потоке. Один раз.
      const fallback = () => {
        if (disposed || fellBack) return;
        fellBack = true;
        try { worker.terminate(); } catch { /* уже мёртв */ }
        worker = null;
        try { host.removeChild(canvas); } catch { /* уже снят */ }
        canvas = makeCanvas();
        requestAnimationFrame(() => { canvas.style.opacity = ''; });
        startInline();
      };
      worker.onmessage = (e) => {
        const d = e.data || {};
        if (d.type === 'tier') onTier(d.tier);
        else if (d.type === 'error') fallback();
      };
      worker.onerror = fallback;
      const off = canvas.transferControlToOffscreen();
      worker.postMessage({ type: 'init', canvas: off, env: mkEnv() }, [off]);
      sendLogo();
    } else {
      startInline();
    }

    // ── DOM-события → сцена ──────────────────────────────────────────────────
    let lastW = vw();
    const onResize = () => {
      const w = vw();
      if (mobile && w === lastW) return;   // изменилась только высота (адресная строка) — игнор
      lastW = w;
      if (mobile) { canvas.style.width = w + 'px'; canvas.style.height = stableH + 'px'; }
      call('resize', w, vh(), dprNow());
    };
    const isUi = (el) => el && el.closest && el.closest('button, a, input, textarea, select, label, .modal, .nav-island, .af-card, .chip, .chip-info, .news-track');
    let dragOn = false;   // не гоняем pointermove в воркер, пока не тянут здание
    const onDown = (e) => {
      if ((e.button != null && e.button !== 0) || isUi(e.target) || lastTarget > 0.4) return;   // здание уже растворилось — не крутим
      dragOn = true; call('pointerDown', e.clientX);
    };
    const onMove = (e) => { if (dragOn) call('pointerMove', e.clientX); };
    const onUp = () => { if (dragOn) { dragOn = false; call('pointerUp'); } };
    // Не рендерим, когда вкладка скрыта ИЛИ окно без фокуса (фон фиксированный:
    // «вне фокуса» = «вне экрана») — прежняя логика Scene3D, теперь на мосте.
    const onVis = () => call('setVisible', !document.hidden);
    const onBlur = () => call('setVisible', false);
    const onFocus = () => { if (!document.hidden) call('setVisible', true); };
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    if (!mobile) {   // на телефоне вращение пальцем мешает скроллу — перетаскивание отключено
      window.addEventListener('pointerdown', onDown, { passive: true });
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp, { passive: true });
      window.addEventListener('pointercancel', onUp, { passive: true });
    }

    requestAnimationFrame(() => { canvas.style.opacity = ''; });   // плавное проявление (CSS-переход)

    onReady?.({
      setTarget: (p) => call('setTarget', p),
      navEase: () => call('navEase'),
      setTheme: (th) => call('setTheme', th),
      setHeroBias: (v) => call('setHeroBias', v),
      setYaw: (y) => call('setYaw', y),
      setPage: () => call('setPage'),
      dispose: () => {},   // реальная очистка — в cleanup эффекта ниже
    });

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (worker) {
        const w = worker; worker = null;
        try { w.postMessage({ type: 'dispose' }); } catch { /* канал закрыт */ }
        setTimeout(() => { try { w.terminate(); } catch { /* уже закрыт */ } }, 250);   // страховка, если dispose не дошёл
      }
      try { inst?.dispose(); } catch { /* уже снята */ }
      inst = null;
      try { host.removeChild(canvas); } catch { /* уже снят */ }
    };
  }, [onReady]);
  return <div ref={hostRef} style={{ display: 'contents' }} />;
}

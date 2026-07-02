import { useEffect } from 'react';
import { initScene } from './Scene3D.js';

/* Фон главной: 3D-сцена DDC (Scene3D.js). По возможности рендерим в Web Worker через
   OffscreenCanvas — рендер уходит с главного потока (плавный скролл, высокий DPR без
   «мыла»). Если браузер не поддерживает (или воркер упал) — фолбэк на главный поток
   с тем же initScene (прежнее поведение). */
export default function Background3D({ onReady }) {
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    const makeCanvas = () => {
      const c = document.createElement('canvas');
      c.id = 'bg3d'; c.setAttribute('aria-hidden', 'true'); c.style.opacity = '0';
      document.body.appendChild(c);
      requestAnimationFrame(() => { if (!disposed) c.style.opacity = ''; });   // плавное проявление (CSS-переход)
      return c;
    };
    const removeCanvas = (c) => { try { c.remove(); } catch {} };

    // ── Главный поток (fallback / старые браузеры) ──
    const mainThread = (canvas) => {
      let scene;
      try { scene = initScene(canvas); } catch (e) { console.error('Scene init:', e); return; }
      const inst = {
        setTarget: (p) => scene.setTarget(p), setYaw: (y) => scene.setYaw?.(y),
        setPage: () => scene.setPage?.(), dispose: () => { try { scene.dispose(); } catch {} },
      };
      onReady?.(inst);
      cleanup = () => { inst.dispose(); removeCanvas(canvas); };
    };

    // ── Web Worker (OffscreenCanvas) ──
    const workerThread = (canvas) => {
      let worker, ready = false, timer = 0, fellBack = false;
      const DPR = () => Math.min(window.devicePixelRatio || 1, 2.0);
      const post = (m, tr) => { try { worker.postMessage(m, tr || []); } catch {} };

      const onResize = () => post({ type: 'event', ev: 'resize', w: window.innerWidth, h: window.innerHeight, dpr: DPR() });
      const fwd = (ev) => (e) => post({ type: 'event', ev, clientX: e.clientX, clientY: e.clientY });
      const onMove = fwd('pointermove'), onDown = fwd('pointerdown'), onUp = fwd('pointerup'), onCancel = fwd('pointercancel');
      const onVis = () => post({ type: 'event', ev: 'visibility', hidden: document.hidden });
      const addL = () => {
        window.addEventListener('resize', onResize, { passive: true });
        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerdown', onDown, { passive: true });
        window.addEventListener('pointerup', onUp, { passive: true });
        window.addEventListener('pointercancel', onCancel, { passive: true });
        document.addEventListener('visibilitychange', onVis);
      };
      const removeL = () => {
        window.removeEventListener('resize', onResize); window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerdown', onDown); window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel); document.removeEventListener('visibilitychange', onVis);
      };

      const fallback = () => {
        if (fellBack || disposed) return; fellBack = true;
        clearTimeout(timer); removeL(); try { worker.terminate(); } catch {}
        removeCanvas(canvas);                       // канвас уже передан воркеру → мёртв, пересоздаём
        if (!disposed) mainThread(makeCanvas());
      };

      let off;
      try { off = canvas.transferControlToOffscreen(); } catch { mainThread(canvas); return; }
      try { worker = new Worker(new URL('./scene.worker.js', import.meta.url), { type: 'module' }); }
      catch { removeCanvas(canvas); if (!disposed) mainThread(makeCanvas()); return; }

      const inst = {
        setTarget: (p) => post({ type: 'call', fn: 'setTarget', arg: p }),
        setYaw: (y) => post({ type: 'call', fn: 'setYaw', arg: y }),
        setPage: () => post({ type: 'call', fn: 'setPage' }),
        dispose: () => { removeL(); post({ type: 'dispose' }); try { worker.terminate(); } catch {} removeCanvas(canvas); },
      };
      worker.onmessage = (e) => {
        const t = e.data && e.data.type;
        if (t === 'ready') { ready = true; clearTimeout(timer); onReady?.(inst); cleanup = () => inst.dispose(); }
        else if (t === 'error') fallback();
      };
      worker.onerror = () => fallback();
      timer = setTimeout(() => { if (!ready) fallback(); }, 3000);   // воркер не ожил за 3с — на главный поток

      post({
        type: 'init', canvas: off, w: window.innerWidth, h: window.innerHeight, dpr: DPR(),
        mobile: window.matchMedia('(max-width: 760px)').matches,
        reduce: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        screenH: (window.screen && window.screen.height) || 0,
      }, [off]);
      addL();
    };

    const canvas = makeCanvas();
    const supported = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
      && typeof canvas.transferControlToOffscreen === 'function' && typeof createImageBitmap === 'function';
    // Воркер применяем на ТЕЛЕФОНЕ (там проблема с «мылом»/лагом). Десктоп — проверенный
    // главный поток (и так плавно), чтобы не рисковать регрессом.
    const isMobile = window.matchMedia('(max-width: 820px)').matches || /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
    if (supported && isMobile) workerThread(canvas); else mainThread(canvas);

    return () => { disposed = true; cleanup(); };
  }, [onReady]);
  return null;
}

import { useEffect, useRef } from 'react';
import { initScene } from './Scene3D.js';

/* Фон главной (ДЕСКТОП): 3D-сцена DDC (Scene3D.js) — две стеклянные башни DDC на
   3D-карте Казахстана + параллакс-проезд камеры по скроллу. На мобиле используется
   лёгкий 2D-канвас MobileBackground.jsx (см. Site.jsx) — ради плавности на телефоне. */
export default function Background3D({ onReady }) {
  const sceneRef = useRef(null);
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = initScene(sceneRef.current);
    const el = sceneRef.current;
    requestAnimationFrame(() => { if (el) el.style.opacity = ''; });   // плавное проявление (CSS-переход)
    const inst = {
      setTarget(p) { scene.setTarget(p); },
      setTheme(th) { scene.setTheme?.(th); },
      setHeroBias(v) { scene.setHeroBias?.(v); },
      setYaw(y) { scene.setYaw?.(y); },
      setPage() { scene.setPage?.(); },
      dispose() { scene.dispose(); },
    };
    onReady?.(inst);
    return () => inst.dispose();
  }, [onReady]);
  return <canvas id="bg3d" ref={sceneRef} aria-hidden="true" style={{ opacity: 0 }} />;
}

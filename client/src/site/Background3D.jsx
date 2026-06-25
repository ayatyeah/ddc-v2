import { useEffect, useRef } from 'react';
import { initScene } from './Scene3D.js';

/* Фон главной: 3D-сцена DDC (Scene3D.js) — две стеклянные башни DDC, стоящие на
   3D-карте Казахстана, с сияющими линиями от основания к узлам по стране и
   параллакс-проездом по скроллу. (Прежний 2D-слой CityMap отключён — карта
   теперь полноценно трёхмерная внутри Scene3D.) */
export default function Background3D({ onReady }) {
  const sceneRef = useRef(null);
  useEffect(() => {
    if (!sceneRef.current) return;
    let scene = null, cancelled = false;
    // Тяжёлую инициализацию сцены (WebGL, PMREM, геометрия карты) запускаем в простое
    // главного потока — чтобы первый заход оставался отзывчивым (страница и скролл живые),
    // а не «висли» на синхронной настройке. Сцена проявляется плавным фейдом следом.
    const init = () => {
      if (cancelled || !sceneRef.current) return;
      scene = initScene(sceneRef.current);
      const el = sceneRef.current;
      requestAnimationFrame(() => { if (el) el.style.opacity = ''; });
      onReady?.({
        setTarget(p) { scene.setTarget(p); },
        setYaw(y) { scene.setYaw?.(y); },
        setPage() { scene.setPage?.(); },
        dispose() { scene.dispose(); },
      });
    };
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;
    const id = idle(init);
    return () => { cancelled = true; try { cancelIdle(id); } catch { /* noop */ } if (scene) scene.dispose(); };
  }, [onReady]);
  return (
    <>
      <canvas id="bg3d" ref={sceneRef} aria-hidden="true" style={{ opacity: 0 }} />
    </>
  );
}

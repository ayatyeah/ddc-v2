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
    const scene = initScene(sceneRef.current);
    // Плавное проявление сцены после инициализации (ленивый чанк подгрузился).
    // Снимаем инлайновый opacity:0 → канвас плавно доходит до значения из CSS (тема).
    const el = sceneRef.current;
    requestAnimationFrame(() => { if (el) el.style.opacity = ''; });
    const inst = {
      setTarget(p) { scene.setTarget(p); },
      setYaw(y) { scene.setYaw?.(y); },
      setPage() { scene.setPage?.(); },
      dispose() { scene.dispose(); },
    };
    onReady?.(inst);
    return () => inst.dispose();
  }, [onReady]);
  return (
    <>
      <canvas id="bg3d" ref={sceneRef} aria-hidden="true" style={{ opacity: 0 }} />
    </>
  );
}

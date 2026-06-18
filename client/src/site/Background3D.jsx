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
    const inst = {
      setTarget(p) { scene.setTarget(p); },
      setPage() { scene.setPage?.(); },
      dispose() { scene.dispose(); },
    };
    onReady?.(inst);
    return () => inst.dispose();
  }, [onReady]);
  return (
    <>
      <canvas id="bg3d" ref={sceneRef} aria-hidden="true" />
    </>
  );
}

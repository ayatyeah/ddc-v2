import { useEffect, useRef } from 'react';
import { initScene } from './Scene3D.js';

/* Полноэкранный 3D-фон с параллакс-проездом по станциям (см. Scene3D.js). */
export default function Background3D() {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const inst = initScene(ref.current);
    return () => inst.dispose();
  }, []);
  return <canvas id="bg3d" ref={ref} aria-hidden="true" />;
}

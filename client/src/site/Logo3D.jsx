import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/* Парящий 3D-логотип DDC: сам силуэт логотипа из SVG, без рамки,
   стеклянный с тёмно-зелёным оттенком. Держится в пустом боковом поле,
   мягко покачивается и переключает сторону по мере скролла. */
export default function Logo3D() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const FH = 10;
    let aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.OrthographicCamera(-FH * aspect / 2, FH * aspect / 2, FH / 2, -FH / 2, -100, 100);
    camera.position.z = 20;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8090b0, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 1.3); dir.position.set(5, 8, 10); scene.add(dir);
    const rim = new THREE.DirectionalLight(0x8fffce, 0.7); rim.position.set(-6, 2, 8); scene.add(rim);

    const spin = new THREE.Group(); scene.add(spin);

    // Стеклянный тёмно-зелёный материал
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0e3a28, metalness: 0, roughness: 0.06,
      transmission: 0.7, thickness: 1.6, ior: 1.5,
      transparent: true, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4,
    });

    new SVGLoader().load('/logo_ddc.svg', (data) => {
      const group = new THREE.Group();
      data.paths.forEach((p) => {
        SVGLoader.createShapes(p).forEach((shape) => {
          const geo = new THREE.ExtrudeGeometry(shape, { depth: 22, bevelEnabled: true, bevelThickness: 3, bevelSize: 2, bevelSegments: 2 });
          group.add(new THREE.Mesh(geo, glass));
        });
      });
      const bb = new THREE.Box3().setFromObject(group);
      const size = new THREE.Vector3(); bb.getSize(size);
      const ctr = new THREE.Vector3(); bb.getCenter(ctr);
      group.children.forEach((m) => m.position.sub(ctr));
      group.scale.y = -1;                       // SVG: ось Y вниз
      const pivot = new THREE.Group(); pivot.add(group);
      pivot.scale.setScalar(3.4 / (size.y || 1));
      spin.add(pivot);
    });

    let side = -1, targetX = 0, curX = 0;
    const edgeX = () => FH * aspect / 2 - 1.9;
    let progress = 0;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      const seg = Math.min(4, Math.floor(progress * 5));
      side = seg % 2 === 0 ? -1 : 1;
      targetX = side * edgeX();
    };
    onScroll(); curX = targetX;
    window.addEventListener('scroll', onScroll, { passive: true });

    function resize() {
      const w = window.innerWidth, h = window.innerHeight; aspect = w / h;
      camera.left = -FH * aspect / 2; camera.right = FH * aspect / 2; camera.top = FH / 2; camera.bottom = -FH / 2;
      camera.updateProjectionMatrix(); renderer.setSize(w, h, false); targetX = side * edgeX();
    }
    window.addEventListener('resize', resize); resize();

    const clock = new THREE.Clock(); let raf = 0;
    function loop() {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const t = clock.getElapsedTime();
      curX += (targetX - curX) * 0.06;
      spin.position.set(curX, reduce ? 0 : Math.sin(t * 0.8) * 0.5, 0);
      spin.rotation.y = reduce ? 0.15 : Math.sin(t * 0.5) * 0.3;   // мягко, чтобы лого читалось
      spin.rotation.z = reduce ? 0 : Math.sin(t * 0.4) * 0.04;
      renderer.render(scene, camera);
    }
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', resize);
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      pmrem.dispose(); renderer.dispose();
    };
  }, []);

  return <canvas id="logo3d" ref={ref} aria-hidden="true" />;
}

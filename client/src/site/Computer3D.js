/* Computer3D.js — 3D рабочая станция ЦЦР: монитор на подставке + клавиатура.
   На экране циклически отображаются факты о центре (CanvasTexture).
   Отражения через RoomEnvironment, орбитальная камера, рендер при видимости. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function initComputer(canvas, opts = {}) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let facts = opts.facts || [];
  let brand = opts.brand || 'DDC · ЦЦР';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 2.9, 12.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false; controls.enablePan = false;
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.autoRotate = !reduce; controls.autoRotateSpeed = 1.1;
  controls.minPolarAngle = Math.PI * 0.34; controls.maxPolarAngle = Math.PI * 0.56;
  controls.minAzimuthAngle = -Math.PI / 4; controls.maxAzimuthAngle = Math.PI / 4;
  controls.target.set(0, 2.4, 0);

  scene.add(new THREE.HemisphereLight(0xeaf1ff, 0xc7cedd, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(6, 12, 9); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.far = 40;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc0ff, 0.6);
  rim.position.set(-8, 6, -6); scene.add(rim);

  const ALU = new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.28, metalness: 0.85, envMapIntensity: 1.2 });
  const DARK = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.5, metalness: 0.3 });

  const rig = new THREE.Group();
  scene.add(rig);

  // ── Экран (CanvasTexture) ──────────────────────────────────────────────────
  const SW = 1024, SH = 600;
  const sCanvas = document.createElement('canvas');
  sCanvas.width = SW; sCanvas.height = SH;
  const sctx = sCanvas.getContext('2d');
  const screenTex = new THREE.CanvasTexture(sCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;

  // Геометрия монитора. MY — центр экрана по высоте.
  const MW = 7.4, MH = 4.2, MY = 2.95;
  const bottomBezel = MY - MH / 2; // нижняя кромка корпуса (~0.85)

  // Тонкий корпус: тёмная задняя плита + узкая алюминиевая рамка спереди
  const back = new THREE.Mesh(
    new RoundedBoxGeometry(MW, MH, 0.18, 6, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.45, metalness: 0.6, envMapIntensity: 1.0 })
  );
  back.position.set(0, MY, -0.02); back.castShadow = true; rig.add(back);

  const frame = new THREE.Mesh(
    new RoundedBoxGeometry(MW, MH, 0.12, 6, 0.14),
    new THREE.MeshStandardMaterial({ color: 0xe2e6ec, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.3 })
  );
  frame.position.set(0, MY, 0.05); rig.add(frame);

  // Экран — почти во всю рамку (тонкие поля), эмиссивная текстура
  const screenMat = new THREE.MeshStandardMaterial({ map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.95, roughness: 0.28, metalness: 0 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(MW - 0.34, MH - 0.34), screenMat);
  screen.position.set(0, MY, 0.115); rig.add(screen);

  // Точка веб-камеры в верхней рамке
  const cam = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), DARK);
  cam.position.set(0, MY + MH / 2 - 0.12, 0.12); rig.add(cam);

  // Подставка ЗА монитором: плоская алюминиевая «лопасть» + тонкая база.
  // Верх лопасти скрыт корпусом — на экран ничего не заходит.
  const neck = new THREE.Mesh(
    new RoundedBoxGeometry(0.9, MY - 0.1, 0.14, 4, 0.07),
    new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.2 })
  );
  neck.position.set(0, (MY - 0.1) / 2 + 0.12, -0.32); neck.castShadow = true; rig.add(neck);

  const base = new THREE.Mesh(
    new RoundedBoxGeometry(2.6, 0.12, 1.5, 4, 0.06), ALU
  );
  base.position.set(0, 0.06, -0.25); base.castShadow = true; base.receiveShadow = true; rig.add(base);

  // Современная низкопрофильная клавиатура: тонкая алюминиевая дека + утопленные клавиши
  const kb = new THREE.Group();
  const kbBase = new THREE.Mesh(new RoundedBoxGeometry(5.6, 0.16, 1.9, 4, 0.08), ALU);
  kbBase.castShadow = true; kbBase.receiveShadow = true; kb.add(kbBase);
  const keyGeo = new RoundedBoxGeometry(0.32, 0.08, 0.32, 2, 0.06);
  const keyMat = new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.55, metalness: 0.25 });
  const cols = 14, rows = 4;
  const inst = new THREE.InstancedMesh(keyGeo, keyMat, cols * rows);
  const dummy = new THREE.Object3D();
  let ki = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    dummy.position.set(-2.4 + c * 0.37, 0.12, -0.5 + r * 0.36);
    dummy.updateMatrix(); inst.setMatrixAt(ki++, dummy.matrix);
  }
  kb.add(inst);
  // трекпад справа от клавиатуры — современный штрих
  const pad = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.07, 1.3, 3, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xcfd5de, roughness: 0.35, metalness: 0.6 }));
  pad.position.set(3.7, 0.11, 0); kb.add(pad);
  kb.position.set(-0.4, 0.11, 2.9);
  kb.rotation.x = -0.05;
  rig.add(kb);

  // Стол
  const desk = new THREE.Mesh(
    new THREE.CircleGeometry(11, 64),
    new THREE.MeshStandardMaterial({ color: 0x1c2435, roughness: 0.6, metalness: 0.4, envMapIntensity: 0.6 })
  );
  desk.rotation.x = -Math.PI / 2; desk.position.y = 0; desk.receiveShadow = true;
  scene.add(desk);

  // ── Отрисовка экрана: бренд + переключение фактов с фейдом ───────────────────
  let idx = 0, since = 0;
  const HOLD = 2.6; // сек на факт
  function drawScreen(t, dt) {
    const g = sctx;
    // фон-градиент
    const grad = g.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, '#0b245f'); grad.addColorStop(1, '#14306e');
    g.fillStyle = grad; g.fillRect(0, 0, SW, SH);
    // декоративная сетка
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
    for (let x = 0; x < SW; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, SH); g.stroke(); }
    for (let y = 0; y < SH; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(SW, y); g.stroke(); }

    // шапка
    g.fillStyle = '#7fb0ff'; g.font = '600 30px Inter, sans-serif'; g.textBaseline = 'top';
    g.fillText('●  ' + brand, 56, 48);
    g.strokeStyle = 'rgba(127,176,255,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(56, 100); g.lineTo(SW - 56, 100); g.stroke();

    // факт с фейдом
    if (facts.length) {
      since += dt;
      if (since > HOLD) { since = 0; idx = (idx + 1) % facts.length; }
      const fade = Math.min(1, since / 0.4) * Math.min(1, (HOLD - since) / 0.4 + 1);
      const f = facts[idx];
      g.globalAlpha = Math.max(0, Math.min(1, fade));
      // Значение авто-подгоняется по ширине экрана: длинные строки (напр. zakup.nationalbank.kz)
      // больше не вылезают за край — шрифт уменьшается, пока не влезет в поля.
      const maxW = SW - 56 * 2;
      let vSize = 96; g.font = `700 ${vSize}px Inter, sans-serif`;
      while (vSize > 34 && g.measureText(f.value).width > maxW) { vSize -= 4; g.font = `700 ${vSize}px Inter, sans-serif`; }
      g.fillStyle = '#ffd98a';
      g.fillText(f.value, 56, 210 + (96 - vSize) * 0.55);   // вертикальная позиция компенсирует меньший кегль
      g.fillStyle = '#dce8ff'; g.font = '400 38px Inter, sans-serif';
      g.fillText(f.label, 58, 340);
      g.globalAlpha = 1;
      // индикаторы
      const n = facts.length, dotW = 26;
      for (let i = 0; i < n; i++) {
        g.fillStyle = i === idx ? '#ffd98a' : 'rgba(255,255,255,0.25)';
        g.beginPath(); g.arc(70 + i * dotW, SH - 60, i === idx ? 7 : 5, 0, Math.PI * 2); g.fill();
      }
    }
    screenTex.needsUpdate = true;
  }

  let progress = 0, visible = true;
  function setProgress(p) { progress = Math.max(0, Math.min(1, p)); }
  function setFacts(next, nextBrand) { facts = next || facts; if (nextBrand) brand = nextBrand; idx = 0; since = 0; }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.01 });
  io.observe(canvas);

  const clock = new THREE.Clock();
  let raf = 0, last = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, t - last); last = t;
    drawScreen(t, reduce ? 0 : dt); // экран обновляем всегда (дёшево)
    if (!visible) return;
    controls.target.y = 2.4 - progress * 0.4;
    controls.update();
    rig.position.y = reduce ? 0 : Math.sin(t * 0.8) * 0.05;
    renderer.render(scene, camera);
  }
  loop();

  return {
    setProgress, setFacts,
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); controls.dispose();
      screenTex.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); } });
      pmrem.dispose(); renderer.dispose();
    },
  };
}

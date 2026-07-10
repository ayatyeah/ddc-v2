/* Building3D.js — современный стеклянный небоскрёб DDC.
   Сплошная стеклянная навесная стена с тонкими горизонтальными и вертикальными
   импостами, тёмное стеклянное ядро для глубины, реальные отражения
   (RoomEnvironment), акцентные ленты НБК/DDC, корона с антенной.
   Орбитальная камера (авто-вращение), рендер только при видимости. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { perf } from './perfProfile.js';

export function initBuilding(canvas) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: perf.antialias, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, perf.dprCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // Тени на телефоне НЕ включаем. Дело не только в цене: USE_SHADOWMAP с мягким PCF навешивается
  // и на шейдер стекла, а он и так самый тяжёлый в сцене (transmission + clearcoat + 3 источника
  // света). На iOS такая программа перестаёт линковаться — и стекло просто пропадает, тогда как
  // опаковые меши с простыми шейдерами продолжают рисоваться. Firefox и слабые устройства — тоже
  // без теней. Земля под башней подсвечена «гало», без тени она не выглядит висящей.
  renderer.shadowMap.enabled = !perf.mobile && !perf.lowPower && perf.engine !== 'gecko';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  // PMREM/RoomEnvironment убран — самая тяжёлая часть init (зацеп при переходе). Отражения
  // теперь от направленного света/материалов; инициализация заметно короче.

  // ── Размеры башни ──────────────────────────────────────────────────────────
  const W = 5.0, D = 4.2, H = 24, podTop = 1.0;
  const cy = podTop + H / 2; // центр башни по высоте

  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 200);
  camera.position.set(16, 13, 25);

  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false; controls.enablePan = false;
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.autoRotate = !reduce; controls.autoRotateSpeed = 0.85;
  controls.minPolarAngle = Math.PI * 0.26; controls.maxPolarAngle = Math.PI * 0.55;
  controls.target.set(0, cy * 0.78, 0);

  // ── Освещение ──────────────────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0xeff8f7, 0xc9d1d1, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(14, 26, 16); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1; key.shadow.camera.far = 90;
  key.shadow.camera.left = -20; key.shadow.camera.right = 20;
  key.shadow.camera.top = 36; key.shadow.camera.bottom = -8;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fdcd6, 0.8);
  rim.position.set(-16, 12, -14); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xfff0d8, 0.35);
  fill.position.set(8, 6, 18); scene.add(fill);

  const COL = {
    glassTint: 0xa9ded8, core: 0x022622, mull: 0xe6e6e6,
    brand: 0x2bbaac, gold: 0xecc371, frame: 0xf2f5f4, dark: 0x022622, glow: 0x9fe0d8,
  };

  const tower = new THREE.Group();
  scene.add(tower);

  // Подиум
  const podium = new THREE.Mesh(
    new RoundedBoxGeometry(W + 2.2, podTop, D + 2.2, 4, 0.3),
    new THREE.MeshStandardMaterial({ color: COL.frame, roughness: 0.5, metalness: 0.25 })
  );
  podium.position.y = podTop / 2; podium.castShadow = true; podium.receiveShadow = true;
  tower.add(podium);

  // Тёмное стеклянное ядро (глубина + отражения внутри)
  const core = new THREE.Mesh(
    new RoundedBoxGeometry(W - 1.0, H - 0.6, D - 1.0, 5, 0.2),
    new THREE.MeshStandardMaterial({ color: COL.core, roughness: 0.16, metalness: 0.55, envMapIntensity: 1.1 })
  );
  core.position.y = cy; tower.add(core);

  // Светящиеся панели на ядре (немного «жизни»)
  const glowMat = new THREE.MeshStandardMaterial({ color: COL.glow, emissive: COL.glow, emissiveIntensity: 0.5, roughness: 0.4 });
  const glows = [];
  for (let i = 0; i < 22; i++) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), glowMat.clone());
    const face = Math.floor(Math.random() * 4);
    const yy = podTop + 1 + Math.random() * (H - 3);
    if (face < 2) { g.position.set((Math.random() - 0.5) * (W - 1.6), yy, (face ? -1 : 1) * (D / 2 - 0.55)); g.rotation.y = face ? Math.PI : 0; }
    else { g.position.set((face === 2 ? 1 : -1) * (W / 2 - 0.55), yy, (Math.random() - 0.5) * (D - 1.6)); g.rotation.y = (face === 2 ? -1 : 1) * Math.PI / 2; }
    g.userData.base = 0.3 + Math.random() * 0.5; glows.push(g); tower.add(g);
  }

  // Стеклянная навесная стена (полупрозрачная, отражающая) — настоящее физическое стекло
  // с преломлением, на ВСЕХ устройствах. Именно оно даёт зданию вид, поэтому не упрощаем.
  const glass = new THREE.Mesh(
    new RoundedBoxGeometry(W, H, D, 6, 0.28),
    new THREE.MeshPhysicalMaterial({
      color: COL.glassTint, metalness: 0.0, roughness: 0.04,
      transmission: 0.72, thickness: 2.6, ior: 1.45,
      transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.04,
      envMapIntensity: 1.7, reflectivity: 0.7,
    })
  );
  glass.position.y = cy; tower.add(glass);

  // Импосты и рёбра — через InstancedMesh: 88 одинаковых боксов = 88 draw call'ов, и каждый
  // выполняется в КАЖДОМ проходе рендера (тень + преломление стекла + основной) — ~260 вызовов
  // на кадр только на решётку фасада. Инстансинг сводит их к 4 вызовам. Геометрия, материал и
  // позиции те же — картинка попиксельно идентична.
  const mullMat = new THREE.MeshStandardMaterial({ color: COL.mull, roughness: 0.3, metalness: 0.75, envMapIntensity: 1.2 });
  const dummy = new THREE.Object3D();
  const instance = (geo, positions, castShadow) => {
    const im = new THREE.InstancedMesh(geo, mullMat, positions.length);
    positions.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = !!castShadow;
    im.frustumCulled = false;   // решётка всегда внутри габарита башни — отсечение не нужно
    tower.add(im);
  };

  const FLOORS = 18, fstep = (H - 0.6) / FLOORS;
  const posFB = [], posLR = [];
  for (let f = 1; f < FLOORS; f++) {
    const y = podTop + f * fstep;
    for (const sz of [1, -1]) posFB.push([0, y, sz * (D / 2 + 0.005)]);
    for (const sx of [1, -1]) posLR.push([sx * (W / 2 + 0.005), y, 0]);
  }
  instance(new THREE.BoxGeometry(W + 0.05, 0.05, 0.06), posFB);
  instance(new THREE.BoxGeometry(0.06, 0.05, D + 0.05), posLR);

  const posV = [];
  for (let i = -2; i <= 2; i++) for (const sz of [1, -1]) posV.push([i * (W / 5.2), cy, sz * (D / 2 + 0.01)]);
  for (let i = -1; i <= 1; i++) for (const sx of [1, -1]) posV.push([sx * (W / 2 + 0.01), cy, i * (D / 3.4)]);
  instance(new THREE.BoxGeometry(0.06, H - 0.5, 0.06), posV);

  // Угловые рёбра во всю высоту
  const posFin = [];
  for (const sx of [1, -1]) for (const sz of [1, -1]) posFin.push([sx * (W / 2 + 0.05), cy, sz * (D / 2 + 0.05)]);
  instance(new THREE.BoxGeometry(0.14, H + 0.1, 0.14), posFin, true);

  // Акцентные ленты: зелёная (DDC) и золотая (НБК)
  const band = (color, hh, yy, intensity) => {
    const m = new THREE.Mesh(
      new RoundedBoxGeometry(W + 0.3, hh, D + 0.3, 3, 0.1),
      new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.2, metalness: 0.4, clearcoat: 1, envMapIntensity: 1.2 })
    );
    m.position.y = yy; m.castShadow = true; tower.add(m); return m;
  };
  const brandBand = band(COL.brand, 0.5, podTop + H - 1.6, 0.45);
  band(COL.gold, 0.32, podTop + H - 2.5, 0.4);

  // Корона: ступень + кольцо + антенна с маяком
  const crown = new THREE.Mesh(
    new RoundedBoxGeometry(W - 1.4, 0.9, D - 1.4, 4, 0.2),
    new THREE.MeshStandardMaterial({ color: COL.frame, roughness: 0.35, metalness: 0.5 })
  );
  crown.position.y = podTop + H + 0.3; crown.castShadow = true; tower.add(crown);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.07, 16, 48),
    new THREE.MeshStandardMaterial({ color: COL.gold, emissive: COL.gold, emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.5 })
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = podTop + H + 0.8; tower.add(ring);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.07, 3.0, 12),
    new THREE.MeshStandardMaterial({ color: COL.mull, roughness: 0.3, metalness: 0.85 })
  );
  mast.position.y = podTop + H + 2.0; tower.add(mast);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0xff3030, emissiveIntensity: 1.2 })
  );
  beacon.position.y = podTop + H + 3.6; tower.add(beacon);

  // Земля + мягкое сияние
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(18, 64),
    new THREE.MeshStandardMaterial({ color: COL.dark, roughness: 0.55, metalness: 0.5, envMapIntensity: 0.7 })
  );
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshBasicMaterial({ color: 0x2bbaac, transparent: true, opacity: 0.15 })
  );
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.02; scene.add(halo);

  // ── Видимость / прогресс / рендер ─────────────────────────────────────────
  // Сцена статична: башня, свет и земля не двигаются — двигается только камера. Карта теней
  // рендерится из СОБСТВЕННОЙ ортокамеры источника света и от положения зрителя не зависит,
  // значит она каждый кадр получалась одна и та же. Считаем её один раз и замораживаем:
  // тени попиксельно те же, а лишний depth-пасс (1024×1024, каждый кадр) исчезает.
  key.shadow.autoUpdate = false;
  key.shadow.needsUpdate = true;

  let progress = 0;
  function setProgress(p) { progress = Math.max(0, Math.min(1, p)); }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  // Рендерим ТОЛЬКО когда канва в кадре и ПОЛНОСТЬЮ гасим rAF за её пределами (раньше цикл
  // крутился вхолостую даже за экраном — лишняя работа на главном потоке при скролле Услуг).
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); }, { threshold: 0.01 });
  io.observe(canvas);

  const clock = new THREE.Clock();
  // FPS-кэп. 13 мс → 60 fps на 60/120 Гц и 72 fps на 144 Гц. Телефон раньше держали на 30 fps,
  // но кадр подешевел вчетверо (инстансинг решётки + замороженная карта теней), а вращающееся
  // здание на 30 fps рядом со 120-Гц скроллом читается как рывки.
  // 30 fps оставляем двум случаям: софт-рендер (SwiftShader/llvmpipe — там не поможет ничто)
  // и prefers-reduced-motion (вращение и пульсация выключены, кадр статичен — чаще незачем).
  // Именно 30 мс, а не 1000/30 = 33.33: иначе окно промахивается мимо кадра 60-Гц экрана
  // (33.3 < 33.33) и вместо 30 fps выходит 20.
  const FRAME_MIN = (perf.softwareGpu || reduce) ? 30 : 13;
  let raf = 0, last = -1, ready = false, disposed = false;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME_MIN) return;   // держим целевой FPS
    last = now;
    const t = clock.getElapsedTime();
    controls.target.y = cy * 0.78 - progress * 2.0;
    controls.update();
    if (!reduce) {
      glows.forEach((g) => { g.material.emissiveIntensity = g.userData.base * (0.55 + 0.45 * Math.sin(t * 1.3 + g.position.y)); });
      beacon.material.emissiveIntensity = 0.8 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3));
      brandBand.material.emissiveIntensity = 0.42 + 0.13 * Math.sin(t * 1.2);
    }
    renderer.render(scene, camera);
  }
  function start() { if (ready && visible && !disposed && !raf) { last = -1; raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  // Шейдер физического стекла (transmission + clearcoat) — самый тяжёлый на компиляцию: сотни
  // миллисекунд синхронно на первом кадре. compileAsync задействует KHR_parallel_shader_compile,
  // то есть компиляция уходит с главного потока, и первый кадр больше не «стопорит» страницу.
  // Рендерить начинаем, когда программы готовы (нет расширения — промис отработает после
  // обычной компиляции). start() идемпотентен, поэтому страховки ниже безопасны.
  const go = () => { ready = true; start(); };
  const fallback = setTimeout(go, 2000);          // промис не пришёл — рендерим по-старому
  try { renderer.compileAsync(scene, camera).catch(() => {}).then(go); } catch { go(); }

  return {
    setProgress,
    dispose() {
      disposed = true; clearTimeout(fallback);
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); controls.dispose();
      scene.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
        if (o.geometry) o.geometry.dispose();
        if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); }
      });
      renderer.dispose();
    },
  };
}

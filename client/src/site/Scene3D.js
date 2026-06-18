/* Scene3D.js — фон главной: две стеклянные башни (как есть) + звёзды-частицы за
   ними в форме карты Казахстана. При скролле башни исчезают, карта остаётся, а
   затем частицы пересобираются в надпись «DDC», после чего сзади подлетает
   стеклянная 3D-модель логотипа. Камера почти статична (лёгкий параллакс). */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PARTICLE_N, DDC_PTS } from './particlePoints.js';
import { KZ_OUTLINE, KZ_NODES, KZ_HUB } from './kzGeo.js';

export function initScene(canvas) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // MSAA дорог на слабых/мобильных GPU; на мягком фоне (туман, свечение) почти
  // не виден — на узких экранах отключаем, на десктопе оставляем.
  const initMobile = window.innerWidth < 760 || (window.innerWidth / window.innerHeight) < 0.95;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !initMobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, initMobile ? 1 : 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xdfe8f5, 0.004);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 600);

  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0xc4ccdb, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(14, 28, 20); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc0ff, 0.7); rim.position.set(-16, 12, 8); scene.add(rim);

  const metal = (c = 0xd8dde6) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.8, roughness: 0.3, envMapIntensity: 1.2 });
  const matte = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.2, roughness: 0.65 });
  const emis = (c, i = 0.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.5 });
  const box = (w, h, d, m, r = 0.1) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), m);

  const TL = new THREE.TextureLoader();
  const facadeTex = (url, rx, ry) => { const t = TL.load(url); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; };
  const facadeA = facadeTex('/tex/facade_a.jpg', 2, 5);
  const facadeB = facadeTex('/tex/facade_b.jpg', 2, 4);

  // ── Две башни (как есть) ─────────────────────────────────────────────────────
  const gBuild = new THREE.Group(); gBuild.position.z = -9; scene.add(gBuild);  // ~20% дальше
  const towerMats = [];
  let beacon = null;
  (() => {
    const towerMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.32, metalness: 0.25, envMapIntensity: 1.25 });
    const tower = (w, d, h, x, tex) => {
      const tg = new THREE.Group();
      const body = box(w, h, d, towerMat(tex), 0.1); body.position.y = h / 2; tg.add(body);
      const finMat = metal(0xaab6c8);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.22), finMat); fin.position.set(sx * (w / 2), h / 2, sz * (d / 2)); tg.add(fin); }
      const crown = box(w + 0.4, 1.2, d + 0.4, matte(0xdfe4ec), 0.1); crown.position.y = h + 0.6; tg.add(crown);
      tg.position.x = x; return tg;
    };
    gBuild.add(tower(8, 8, 24, -7, facadeA));
    gBuild.add(tower(9, 9, 28, 6.5, facadeB));
    // Синий подиум, посаженный прямо на карту (тонкая плита у поверхности)
    const podium = box(26, 1.6, 14, matte(0x1c4f8e), 0.2); podium.position.y = 0.8; gBuild.add(podium);
    const podiumTop = box(22, 0.4, 11, emis(0x3a7fd6, 0.35), 0.2); podiumTop.position.y = 1.7; gBuild.add(podiumTop);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 3, 10), metal()); mast.position.set(6.5, 29.5, 0); gBuild.add(mast);
    beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), emis(0xe6c789, 0.9)); beacon.position.set(6.5, 31.4, 0); gBuild.add(beacon);
    gBuild.traverse((o) => { if (o.material) { o.material.transparent = true; towerMats.push(o.material); } });
  })();
  gBuild.rotation.y = -0.62;   // разворот как на фото: видно фронт + правый бок башен

  // ── 3D-карта Казахстана у подножия башен (extrude по контуру границы) ────────
  // Карта лежит горизонтально (XZ), башни стоят на ней в точке-хабе (Астана).
  // Карта — потомок gBuild: башни + страна образуют ЕДИНЫЙ объект (двигаются и
  // разворачиваются вместе как одно целое). Видимостью карты управляем отдельно,
  // через её материалы, чтобы она не пропадала, когда фасады башен растворяются.
  const gMap = new THREE.Group(); gBuild.add(gMap);
  const lineMats = [];
  let nodeMat = null, mapMats = [];
  (() => {
    const MAP_S = 58;                 // масштаб карты в мире (ширина ~2*MAP_S) — крупная карта, узлы/линии с запасом
    const hub2 = { x: KZ_HUB[0] * MAP_S, z: -KZ_HUB[1] * MAP_S };   // куда поставить хаб

    // контур -> Shape (lon->x, lat->-z так, чтобы север был «вперёд/вглубь»)
    const shape = new THREE.Shape();
    KZ_OUTLINE.forEach(([lo, la], i) => {
      const X = lo * MAP_S - hub2.x, Y = la * MAP_S;     // в плоскости shape: x, y(=lat)
      i === 0 ? shape.moveTo(X, Y) : shape.lineTo(X, Y);
    });

    // ExtrudeGeometry даёт настоящую толщину -> 3D-плита страны
    const extrude = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.4, bevelSegments: 2, steps: 1 });
    extrude.rotateX(-Math.PI / 2);    // положить плашмя: shape.y(lat) -> -z
    extrude.translate(0, 0, hub2.z);  // сдвиг чтобы хаб попал под башни (z)

    const mapMat = new THREE.MeshStandardMaterial({ color: 0x16386e, metalness: 0.4, roughness: 0.62, emissive: 0x0c2a5e, emissiveIntensity: 0.5, transparent: true, opacity: 0.92 });
    mapMat.userData = { baseOp: 0.92 };
    const mapMesh = new THREE.Mesh(extrude, mapMat); mapMesh.position.y = -1.4; gMap.add(mapMesh); mapMats.push(mapMat);

    // светящаяся кромка-граница (контур поверх плиты)
    const edgePts = KZ_OUTLINE.map(([lo, la]) => new THREE.Vector3(lo * MAP_S - hub2.x, 0.06, -la * MAP_S + hub2.z));
    edgePts.push(edgePts[0].clone());
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.9 });
    edgeMat.userData = { baseOp: 0.9 };
    gMap.add(new THREE.Line(edgeGeo, edgeMat)); mapMats.push(edgeMat);

    // узлы-точки по стране (сияющие диски-спрайты)
    const dotCv = document.createElement('canvas'); dotCv.width = dotCv.height = 64;
    const dctx = dotCv.getContext('2d');
    const dg = dctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    dg.addColorStop(0, 'rgba(220,248,255,1)'); dg.addColorStop(0.25, 'rgba(150,225,255,0.9)'); dg.addColorStop(1, 'rgba(120,210,250,0)');
    dctx.fillStyle = dg; dctx.fillRect(0, 0, 64, 64);
    const dotTex = new THREE.CanvasTexture(dotCv);
    nodeMat = new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0.95 });

    // линии выходят из края синего подиума (на его верхней кромке), направленно к узлу
    const PODX = 13, PODZ = 7, PODY = 1.9;     // полуразмеры подиума (26x14) + высота верха

    for (const [lo, la] of KZ_NODES) {
      const nx = lo * MAP_S - hub2.x, nz = -la * MAP_S + hub2.z;
      // пропустить узел в самом хабе (под башнями/подиумом)
      if (Math.hypot(nx, nz) < 12) continue;

      // точка старта линии = точка на кромке подиума в сторону узла
      const ang = Math.atan2(nz, nx);
      const ex = Math.max(-PODX, Math.min(PODX, Math.cos(ang) * PODX * 1.4));
      const ez = Math.max(-PODZ, Math.min(PODZ, Math.sin(ang) * PODZ * 1.4));
      const origin = new THREE.Vector3(ex, PODY, ez);

      // точка
      const sp = new THREE.Sprite(nodeMat.clone());
      sp.position.set(nx, 0.4, nz); sp.scale.set(3.2, 3.2, 1); gMap.add(sp);
      sp.material.userData = { baseOp: 0.95 };
      mapMats.push(sp.material);

      // сияющая изогнутая линия от основания башен к узлу (QuadraticBezier, приподнят)
      const end = new THREE.Vector3(nx, 0.5, nz);
      const mid = origin.clone().add(end).multiplyScalar(0.5);
      mid.y += Math.min(9, origin.distanceTo(end) * 0.22);   // выпуклость вверх
      const curve = new THREE.QuadraticBezierCurve3(origin.clone(), mid, end);
      const pts = curve.getPoints(40);
      const lGeo = new THREE.BufferGeometry().setFromPoints(pts);
      // сияние: толстая мягкая линия + яркое ядро (две линии)
      const glowMat = new THREE.LineBasicMaterial({ color: 0x5fc8ea, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
      const coreMat = new THREE.LineBasicMaterial({ color: 0xd6f6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      glowMat.userData = { glow: true, baseOp: 0.22 };
      coreMat.userData = { baseOp: 0.85 };
      gMap.add(new THREE.Line(lGeo, glowMat));
      gMap.add(new THREE.Line(lGeo, coreMat));
      lineMats.push(glowMat, coreMat);

      // бегущий пакет по линии
      const pkt = new THREE.Sprite(nodeMat.clone());
      pkt.position.copy(pts[0]); pkt.scale.set(2.0, 2.0, 1);
      pkt.userData = { curve, t: Math.random(), sp: 0.18 + Math.random() * 0.12 };
      gMap.add(pkt);
      gMap.userData.packets = gMap.userData.packets || [];
      gMap.userData.packets.push(pkt);
    }

    gMap.position.y = 0.0;
  })();

  // ── Звёзды-частицы: сразу собираются в «DDC» (адаптивно под экран) ──────────
  const CZ = -26;
  const N = PARTICLE_N;
  const kz = new Float32Array(N * 3), ddc = new Float32Array(N * 3);
  const zoff = new Float32Array(N);
  for (let i = 0; i < N; i++) zoff[i] = (Math.random() - 0.5) * 4;
  function layout() {
    const w = window.innerWidth, h = window.innerHeight, a = w / h;
    const mobile = w < 760 || a < 0.95;
    if (mobile) {
      // Узкий/портретный экран: горизонтальный FOV мал, поэтому планету и «DDC»
      // дополнительно сжимаем под ширину (s), кадр держим чуть дальше и выше,
      // а планету сажаем ниже (planetY < cy), чтобы она целиком влезала.
      const s = Math.max(0.78, Math.min(1, w / 430));
      // cy === planetY: «DDC» центрируется ровно по планете (и камера смотрит туда же).
      return { mobile: 1, camZ: 150, eyeY: 70, lookY: 6, cy: 17, planetY: 17,
               kzCX: 0, kzS: 11.5 * s, ddcCX: 0, ddcS: 9 * s };
    }
    return { mobile: 0, camZ: 140, eyeY: 62, lookY: 5, cy: 20, planetY: 20,
             kzCX: 0, kzS: 18, ddcCX: 0, ddcS: 15 };
  }
  let L = layout();
  function buildTargets() {
    // Частицы сразу собираются в «DDC» (без промежуточной карты Казахстана):
    // обе цели морфинга указывают на одну раскладку DDC, поэтому перехода нет.
    for (let i = 0; i < N; i++) {
      ddc[i * 3] = L.ddcCX + DDC_PTS[i * 2] * L.ddcS; ddc[i * 3 + 1] = L.cy + DDC_PTS[i * 2 + 1] * L.ddcS; ddc[i * 3 + 2] = CZ + zoff[i];
      kz[i * 3] = ddc[i * 3]; kz[i * 3 + 1] = ddc[i * 3 + 1]; kz[i * 3 + 2] = ddc[i * 3 + 2];
    }
  }
  buildTargets();
  const pos = new Float32Array(kz);
  const aRand = new Float32Array(N);
  for (let i = 0; i < N; i++) aRand[i] = Math.random();
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('aRand', new THREE.BufferAttribute(aRand, 1));
  // горящие светло-синие огоньки с индивидуальным мерцанием/бликами
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uSize: { value: 3.0 }, uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(0x6fdde6) },
      uHot: { value: new THREE.Color(0xffffff) },
    },
    vertexShader: `
      attribute float aRand; uniform float uTime, uSize; varying float vTw;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.5 + 0.5 * sin(uTime * 2.2 + aRand * 6.2831);
        vTw = tw;
        gl_PointSize = uSize * (0.6 + 0.7 * tw) * (220.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor, uHot; uniform float uOpacity; varying float vTw;
      void main(){
        vec2 d = gl_PointCoord - 0.5; float r = length(d);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r);
        float glow = pow(core, 2.2);
        vec3 col = mix(uColor, uHot, glow * (0.4 + 0.6 * vTw));
        float a = glow * (0.55 + 0.45 * vTw) * uOpacity;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const points = new THREE.Points(pGeo, pMat); scene.add(points);

  // ── Планета за зданиями: на ней крупно повторяется «DDC» (вращается, всегда в кадре).
  //    Текстура перерисовывается при смене страницы — узор слегка меняется. ─────
  const planetCv = document.createElement('canvas'); planetCv.width = 1024; planetCv.height = 512;
  const pc = planetCv.getContext('2d');
  function drawPlanet(variant = 0) {
    const W = 1024, Hh = 512;
    const pg = pc.createLinearGradient(0, 0, 0, Hh);
    // оттенок чуть смещается по variant — «меняется при смене страницы»
    const hueShift = (variant % 5) * 6;
    pg.addColorStop(0, `hsl(${214 + hueShift}, 48%, ${44}%)`);
    pg.addColorStop(0.5, `hsl(${212 + hueShift}, 50%, ${34}%)`);
    pg.addColorStop(1, `hsl(${214 + hueShift}, 52%, ${24}%)`);
    pc.fillStyle = pg; pc.fillRect(0, 0, W, Hh);
    // мягкие световые пятна (атмосфера)
    for (let i = 0; i < 26; i++) {
      pc.fillStyle = `rgba(180,210,245,${0.05 + ((i * 7 + variant * 13) % 10) / 60})`;
      const rx = ((i * 137 + variant * 53) % W), ry = ((i * 89 + variant * 31) % Hh);
      pc.beginPath(); pc.ellipse(rx, ry, 30 + (i % 5) * 16, 16 + (i % 4) * 10, (i + variant) * 0.7, 0, 6.28); pc.fill();
    }
    if (planetTex) planetTex.needsUpdate = true;
  }
  let planetTex = null;
  drawPlanet(0);
  planetTex = new THREE.CanvasTexture(planetCv); planetTex.colorSpace = THREE.SRGBColorSpace;
  planetTex.wrapS = THREE.RepeatWrapping;
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 40),          // гладкого шара хватает 40 сегментов (был 64×64)
    new THREE.MeshStandardMaterial({
      map: planetTex,
      roughness: 0.9, metalness: 0.05,
      emissive: 0xffffff, emissiveMap: planetTex, emissiveIntensity: 0.16,
      transparent: true, opacity: 1,
    })
  );
  planet.rotation.z = 0.34;                       // наклон оси — объёмнее смотрится
  scene.add(planet);

  function placePlanet() {
    planet.scale.setScalar(L.kzS * 1.12); planet.position.set(0, L.planetY, CZ - 9);
  }
  placePlanet();

  // ── Облака: смягчают исчезновение зданий (здания «растворяются» в них) ───────
  const cloudCv = document.createElement('canvas'); cloudCv.width = cloudCv.height = 128;
  const cctx = cloudCv.getContext('2d');
  const cgrad = cctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  cgrad.addColorStop(0, 'rgba(255,255,255,0.95)'); cgrad.addColorStop(0.5, 'rgba(255,255,255,0.45)'); cgrad.addColorStop(1, 'rgba(255,255,255,0)');
  cctx.fillStyle = cgrad; cctx.fillRect(0, 0, 128, 128);
  const cloudTex = new THREE.CanvasTexture(cloudCv);
  const clouds = [];
  const cloudDefs = [[-9, 31, -7, 15], [8, 34, -6, 14], [0, 27, -5, 13], [-5, 39, -9, 11], [6, 25, -8, 12], [-2, 35, -4, 10]];
  for (const [cx, cyy, cz, cs] of cloudDefs) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    sp.position.set(cx, cyy, cz); sp.scale.set(cs, cs * 0.6, 1); sp.userData.bx = cx;
    clouds.push(sp); scene.add(sp);
  }


  // ── (3D-логотип убран — бренд показывается DOM-локапом) ─────────────────────

  // ── Камера / целевое состояние (задаётся маршрутом) ─────────────────────────
  let progress = 0, tx = 0, ty = 0, px = 0, py = 0, pState = -1;
  const onPointer = (e) => { tx = (e.clientX / window.innerWidth - 0.5) * 2; ty = (e.clientY / window.innerHeight - 0.5) * 2; };
  if (!reduce) window.addEventListener('pointermove', onPointer, { passive: true });

  // ── Перетаскивание здания: только по горизонтали (рыскание), без наклона ─────
  let dragging = false, lastX = 0, yawVel = 0;
  const isUi = (el) => el && el.closest && el.closest('button, a, input, textarea, select, label, .modal, .nav-island, .af-card, .chip, .chip-info, .news-track');
  const onDown = (e) => {
    if ((e.button != null && e.button !== 0) || progress > 0.4 || isUi(e.target)) return; // только когда здание видно и не на UI
    dragging = true; lastX = e.clientX; yawVel = 0;
  };
  const onDrag = (e) => { if (!dragging) return; const d = (e.clientX - lastX) * 0.006; lastX = e.clientX; gBuild.rotation.y += d; yawVel = d; };
  const onUp = () => { dragging = false; };
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointermove', onDrag, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    L = layout();
    // На мобильных рисуем в 1× (экономит до ~4× пикселей на retina), на десктопе до 1.25×.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, L.mobile ? 1 : 1.25));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    pMat.uniforms.uSize.value = L.mobile ? 2.2 : 3.0;   // меньше размер искорок на мобильном → меньше перерисовки
    buildTargets();
    if (pState === 1) pos.set(ddc); else pos.set(kz);
    pGeo.attributes.position.needsUpdate = true;
    placePlanet();
  }
  window.addEventListener('resize', resize); resize();

  scene.fog.color.setHex(0x0f1626);            // цвет тумана постоянен — задаём один раз, не в кадре

  // Ограничение ~60 кадров/с: на дисплеях 120 Гц это вдвое снижает нагрузку на GPU
  // и убирает троттлинг/«провисание»; на 60 Гц проходит каждый кадр. Анимации
  // на основе времени (sin(t*…)) остаются плавными, а пошаговые приращения
  // (disp, u.t) рассчитаны как раз на 60 к/с.
  const MIN_DT = 1 / 62;
  const clock = new THREE.Clock(); let raf = 0, disp = progress, running = false, lastFrame = -1;
  function loop() {
    raf = 0;
    if (running) raf = requestAnimationFrame(loop);   // планируем следующий кадр заранее
    const t = clock.getElapsedTime();
    if (t - lastFrame < MIN_DT) return;               // кадр пришёл слишком рано — пропускаем
    lastFrame = t;
    disp += (progress - disp) * 0.05;          // плавный бесшовный переход между страницами
    const p = disp;

    // камера: фокус на верхних этажах / крышах (адаптивно)
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    // На hero (p~0) кадр охватывает башни + 3D-карту (низкий взгляд, дальше отъезд).
    // Единый объект «башни + карта» тает целиком при скролле (без подъёма башен),
    // освобождая сцену для частиц/надписи DDC. Камера на hero охватывает весь
    // объект; при скролле плавно поднимает взгляд к зоне частиц (cy≈30).
    const rise = smooth(p, 0.20, 0.46);
    const eyeY = L.eyeY + rise * (L.cy - L.eyeY) * 0.55;
    const camZ = L.camZ - rise * (L.camZ - 34);          // подъезжаем ближе к частицам
    const lookYY = L.lookY + rise * (L.cy - L.lookY);
    camera.position.set(px * 2.0, eyeY - py * 1.2 + Math.sin(t * 0.3) * 0.08, camZ);
    camera.lookAt(px * 0.4, lookYY, 0);

    // Башни + карта растворяются вместе как одно целое (общий прогресс fade).
    // Когда объект полностью растворился — снимаем его с отрисовки целиком
    // (gBuild.visible = false): это десятки мешей/линий/спрайтов и вся помесь
    // вычислений по пакетам, которые иначе считались бы и рисовались впустую.
    const fade = smooth(p, 0.16, 0.40);
    const buildVisible = fade < 0.999;
    gBuild.visible = buildVisible;
    if (buildVisible) {
      const mapFade = 1 - fade;
      for (const mt of towerMats) mt.opacity = mapFade;
      if (beacon) beacon.material.emissiveIntensity = (0.7 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3))) * mapFade;
      if (!dragging && Math.abs(yawVel) > 0.00001) { gBuild.rotation.y += yawVel; yawVel *= 0.93; } // инерция вращения

      // 3D-карта (потомок gBuild): тает синхронно с башнями, образуя единый объект.
      for (const mm of mapMats) mm.opacity = (mm.userData?.baseOp ?? 0.92) * mapFade;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
      for (const lm of lineMats) {
        if (lm.userData?.glow) lm.opacity = (0.16 + pulse * 0.20) * mapFade;
        else lm.opacity = (lm.userData?.baseOp ?? 0.85) * mapFade;
      }
      for (const pkt of (gMap.userData.packets || [])) {
        const u = pkt.userData; u.t += u.sp * 0.016; if (u.t > 1) u.t -= 1;
        u.curve.getPoint(u.t, pkt.position);
        pkt.material.opacity = (0.5 + 0.5 * Math.sin(t * 4 + u.t * 6)) * mapFade;
      }
    }

    // облака появляются, пока башни тают, и расходятся после — мягкое исчезновение
    const cloudOp = smooth(p, 0.06, 0.16) * (1 - smooth(p, 0.26, 0.34));
    for (const sp of clouds) {
      sp.visible = cloudOp > 0.01;
      sp.material.opacity = cloudOp * 0.92;
      sp.position.x = sp.userData.bx + Math.sin(t * 0.14 + sp.userData.bx) * 1.4;
    }

    // планета: постоянно вращается и «дышит», даже без скролла; исчезает к моменту сборки DDC
    const spin = reduce ? 0 : t * 0.12;             // постоянное автовращение глобуса
    planet.rotation.y = spin + t * 0.3 + p * 4.0;
    if (!reduce) {
      planet.rotation.z = 0.34 + Math.sin(t * 0.18) * 0.05;   // лёгкое покачивание оси наклона
      planet.rotation.x = Math.sin(t * 0.13) * 0.03;
    }
    const pop = 1 - smooth(p, 0.62, 0.82);
    const breathe = reduce ? 1 : 1 + Math.sin(t * 0.5) * 0.012; // мягкое «дыхание» размера
    planet.scale.setScalar(L.kzS * 1.12 * breathe);
    planet.position.y = L.planetY + (reduce ? 0 : Math.sin(t * 0.4) * 0.18); // парение
    planet.material.opacity = pop;
    planet.visible = pop > 0.02;

    // частицы появляются по мере исчезновения башен и сразу образуют «DDC»
    pMat.uniforms.uOpacity.value = smooth(p, 0.10, 0.26);
    const m = smooth(p, 0.50, 0.70);
    if (m <= 0.0001) {
      if (pState !== 0) { pos.set(kz); pGeo.attributes.position.needsUpdate = true; pState = 0; }
    } else if (m >= 0.9999) {
      if (pState !== 1) { pos.set(ddc); pGeo.attributes.position.needsUpdate = true; pState = 1; }
    } else {
      const sw = Math.sin(m * Math.PI);
      for (let i = 0; i < N; i++) {
        const a = i * 3;
        let x = kz[a] + (ddc[a] - kz[a]) * m;
        let y = kz[a + 1] + (ddc[a + 1] - kz[a + 1]) * m;
        let z = kz[a + 2] + (ddc[a + 2] - kz[a + 2]) * m;
        if (!reduce) { x += sw * Math.sin(i * 1.3 + t) * 1.6; y += sw * Math.cos(i * 0.7 + t) * 1.6; z += sw * Math.sin(i + t) * 2.0; }
        pos[a] = x; pos[a + 1] = y; pos[a + 2] = z;
      }
      pGeo.attributes.position.needsUpdate = true; pState = -1;
    }
    pMat.uniforms.uTime.value = t;                            // горящие огоньки + блики
    renderer.render(scene, camera);
  }

  function start() { if (!running) { running = true; clock.getDelta(); if (!raf) raf = requestAnimationFrame(loop); } }
  function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  const onVisibility = () => { document.hidden ? stop() : start(); };
  document.addEventListener('visibilitychange', onVisibility);
  start();

  let pageVar = 0;
  return {
    setTarget(p) { progress = Math.min(1, Math.max(0, p)); if (!running && !document.hidden) start(); },
    setPage() { pageVar++; drawPlanet(pageVar); if (!running && !document.hidden) start(); },
    dispose() {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer); window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onDrag);
      window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      pMat.dispose(); pGeo.dispose(); planetTex.dispose(); cloudTex.dispose(); [facadeA, facadeB].forEach((x) => x.dispose());
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const mm = o.material; (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose()); } });
      pmrem.dispose(); renderer.dispose();
    },
  };
}

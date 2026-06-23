/* Scene3D.js — фон главной: две стеклянные башни DDC на 3D-карте Казахстана.
   Скролл-сценарий («дрон взлетает над страной»):
   • Начало: камера плавно поднимается вверх, башни уменьшаются, DDC в центре кадра.
   • Середина: камера над Казахстаном, башни — маленький центральный ХАБ, над ними
     проявляется надпись «DDC»; от хаба расходятся световые линии и бегущие пакеты
     (потоки данных) к узлам по стране — один центр координирует цифровую экосистему.
   Карта и линии НЕ растворяются (это главный объект), планета — тихий дальний фон. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { PARTICLE_N, DDC_PTS } from './particlePoints.js';
import { KZ_OUTLINE, KZ_NODES, KZ_HUB } from './kzGeo.js';

export function initScene(canvas) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const DPR_CAP = 2;                   // потолок качества (как десктоп) — и на телефоне тоже
  // Адаптивное разрешение рендера: стартуем с максимума, а в кадре сами держим плавность —
  // на слабом телефоне тихо снижаем (для размытого фона незаметно), на сильном — десктопное.
  let curDpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  const FRAME_MS = 0;         // без ограничения кадров — 60fps везде
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(curDpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;        // чуть больше свечения/«воздуха» в кадре

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xdfe8f5, 0.004);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 600);

  // Меньше общего (ambient) света -> здания не «блекло-светлые», а тёмные с яркими бликами.
  scene.add(new THREE.HemisphereLight(0xb8cdea, 0x37425a, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(14, 28, 20); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc0ff, 0.8); rim.position.set(-16, 12, 8); scene.add(rim);  // холодный контровой свет — чётче кромки стеклянных башен
  // Направленный прожектор НА башни — драматичный «свет оттуда»: тёмные здания, яркая подсветка.
  const spot = new THREE.SpotLight(0xe2eeff, 4.4, 0, Math.PI / 5, 0.4, 0);   // distance 0, decay 0 -> предсказуемая яркость
  spot.position.set(8, 72, 40); spot.target.position.set(0, 12, -9);
  scene.add(spot); scene.add(spot.target);

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
  // gTowers — только башни/подиум: уменьшается при «взлёте дрона», оставаясь центральным
  // хабом на карте. Карта (gMap) — отдельный потомок gBuild и НЕ масштабируется вместе с ним.
  const gTowers = new THREE.Group(); gBuild.add(gTowers);
  const towerMats = [];
  let beacon = null;
  (() => {
    // Стекло башен светится собственным цветом фасада (emissiveMap = текстура): окна и
    // синева стекла «горят» изнутри, как на ночном референсе, а не выглядят блекло.
    // Лёгкий холодный тон + чуть глаже стекло -> насыщеннее синева и чётче блики.
    const towerMat = (tex) => new THREE.MeshStandardMaterial({
      map: tex, color: 0x5c6a86, roughness: 0.22, metalness: 0.42, envMapIntensity: 1.1,   // тёмное стекло, но с подсветкой
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.48,                        // окна светятся ярче
    });
    const tower = (w, d, h, x, tex) => {
      const tg = new THREE.Group();
      const body = box(w, h, d, towerMat(tex), 0.1); body.position.y = h / 2; tg.add(body);
      const finMat = metal(0xaab6c8);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.22), finMat); fin.position.set(sx * (w / 2), h / 2, sz * (d / 2)); tg.add(fin); }
      const crown = box(w + 0.4, 1.2, d + 0.4, matte(0xdfe4ec), 0.1); crown.position.y = h + 0.6; tg.add(crown);
      tg.position.x = x; return tg;
    };
    // Башни с уверенным широким силуэтом (h/w ≈ 2.7) — не вытянутые «спички».
    gTowers.add(tower(9.5, 9.5, 26, -7, facadeA));
    gTowers.add(tower(10.5, 10.5, 29, 6.5, facadeB));
    // Синий подиум, посаженный прямо на карту (тонкая плита у поверхности)
    const podium = box(26, 1.6, 14, matte(0x1c4f8e), 0.2); podium.position.y = 0.8; gTowers.add(podium);
    const podiumTop = box(22, 0.4, 11, emis(0x3a7fd6, 0.35), 0.2); podiumTop.position.y = 1.7; gTowers.add(podiumTop);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 3, 10), metal()); mast.position.set(6.5, 30.6, 0); gTowers.add(mast);
    beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), emis(0xe6c789, 0.9)); beacon.position.set(6.5, 32.4, 0); gTowers.add(beacon);
    gTowers.traverse((o) => { if (o.material) { o.material.transparent = true; towerMats.push(o.material); } });
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
  let edgeCoreMat = null, edgeGlowMat = null;   // материалы светящейся границы (Line2)

  // ── Параметры надписи «DDC» на карте ────────────────────────────────────────
  // Надпись лежит ПЛАШМЯ на карте в ЛОКАЛЬНЫХ координатах gMap (т.е. жёстко привязана
  // к карте: двигается и поворачивается вместе с ней). AX/AZ — полуразмеры рамки
  // надписи (x — ширина, z — высота букв); от этой рамки стартуют линии к узлам.
  const TEXT_Y = 0.6, TEXT_S = 13;
  let AX = 0, AZ = 0;
  for (let i = 0; i < PARTICLE_N; i++) { AX = Math.max(AX, Math.abs(DDC_PTS[i * 2])); AZ = Math.max(AZ, Math.abs(DDC_PTS[i * 2 + 1])); }
  AX *= TEXT_S; AZ *= TEXT_S;
  (() => {
    const MAP_S = 60;                 // карта пошире, чтобы не выглядела узкой полоской под башнями
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

    // Процедурный «рельеф» поверхности (шум) как roughness/bump-map — карта выглядит как
    // реальная поверхность под светом. ТОЛЬКО на десктопе: на мобиле bump-шейдинг лишний.
    let mapTex = null;
    if (!mobile) {
      const mcv = document.createElement('canvas'); mcv.width = mcv.height = 256;
      const mc = mcv.getContext('2d');
      mc.fillStyle = '#7a7a7a'; mc.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 150; i++) {
        const x = (i * 71) % 256, y = (i * 153 + 30) % 256, r = 9 + (i % 8) * 9;
        const c = i % 2 ? 255 : 0;
        mc.fillStyle = `rgba(${c},${c},${c},${0.04 + (i % 5) / 80})`;
        mc.beginPath(); mc.ellipse(x, y, r, r * 0.75, i, 0, 6.283); mc.fill();
      }
      mapTex = new THREE.CanvasTexture(mcv);
      mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping; mapTex.repeat.set(0.06, 0.06);
    }
    // Меньше эмиссии и металличности, выше шероховатость -> реалистичная суша.
    const mapMat = new THREE.MeshStandardMaterial({
      color: 0x1b3f6e, roughnessMap: mapTex, bumpMap: mapTex, bumpScale: 0.6,
      metalness: 0.2, roughness: 0.82, emissive: 0x0a1f3c, emissiveIntensity: 0.16,
      transparent: true, opacity: 0.96,
    });
    mapMat.userData = { baseOp: 0.96 };
    const mapMesh = new THREE.Mesh(extrude, mapMat); mapMesh.position.y = -1.4; gMap.add(mapMesh); mapMats.push(mapMat);

    // Светящаяся граница страны — жирная неоновая линия (Line2): яркое ядро + широкое
    // мягкое свечение под ним (аддитивно). Толщина в пикселях экрана -> чёткий неон на
    // любом отдалении. Контур приподнят над плитой, чтобы не «тонул» в бевеле.
    const edgeFlat = [];
    for (const [lo, la] of KZ_OUTLINE) edgeFlat.push(lo * MAP_S - hub2.x, 0.18, -la * MAP_S + hub2.z);
    edgeFlat.push(edgeFlat[0], edgeFlat[1], edgeFlat[2]);   // замкнуть контур
    const edgeGeo = new LineGeometry(); edgeGeo.setPositions(edgeFlat);
    const W0 = window.innerWidth, H0 = window.innerHeight;
    edgeGlowMat = new LineMaterial({ color: 0x3aa0ff, linewidth: 5, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    edgeCoreMat = new LineMaterial({ color: 0xcdeeff, linewidth: 1.3, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    edgeGlowMat.resolution.set(W0, H0); edgeCoreMat.resolution.set(W0, H0);
    edgeGlowMat.userData = { baseOp: 0.4 }; edgeCoreMat.userData = { baseOp: 0.95 };
    const edgeGlow = new Line2(edgeGeo, edgeGlowMat); edgeGlow.renderOrder = 4; gMap.add(edgeGlow);
    const edgeCore = new Line2(edgeGeo, edgeCoreMat); edgeCore.renderOrder = 5; gMap.add(edgeCore);

    // Нижний контур плиты — мягкая подсветка низа: берём ТОЛЬКО свечение (без яркого ядра),
    // чтобы низ читался как объём, а не вторая яркая граница. Одна линия — лёгкая (и на мобиле).
    extrude.computeBoundingBox();
    const slabBottom = extrude.boundingBox.min.y + mapMesh.position.y + 0.04;
    const bottomFlat = [];
    for (const [lo, la] of KZ_OUTLINE) bottomFlat.push(lo * MAP_S - hub2.x, slabBottom, -la * MAP_S + hub2.z);
    bottomFlat.push(bottomFlat[0], bottomFlat[1], bottomFlat[2]);
    const bottomGeo = new LineGeometry(); bottomGeo.setPositions(bottomFlat);
    const bEdge = new Line2(bottomGeo, edgeGlowMat); bEdge.renderOrder = 3; gMap.add(bEdge);

    // узлы-точки по стране (сияющие диски-спрайты)
    const dotCv = document.createElement('canvas'); dotCv.width = dotCv.height = 64;
    const dctx = dotCv.getContext('2d');
    const dg = dctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    dg.addColorStop(0, 'rgba(220,248,255,1)'); dg.addColorStop(0.25, 'rgba(150,225,255,0.9)'); dg.addColorStop(1, 'rgba(120,210,250,0)');
    dctx.fillStyle = dg; dctx.fillRect(0, 0, 64, 64);
    const dotTex = new THREE.CanvasTexture(dotCv);
    nodeMat = new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0.95 });

    // Линии расходятся С КРАЁВ надписи DDC: старт — точка на рамке надписи (AX×AZ вокруг
    // центра-хаба) в направлении узла. Надпись и линии лежат в одной группе gMap, поэтому
    // жёстко привязаны к карте и поворачиваются вместе с ней.
    const HUBY = TEXT_Y + 0.5;        // линии стартуют на уровне надписи

    for (const [lo, la] of KZ_NODES) {
      const nx = lo * MAP_S - hub2.x, nz = -la * MAP_S + hub2.z;
      // пропустить узел под самой надписью
      if (Math.hypot(nx, nz) < 12) continue;

      // точка старта линии = точка на рамке надписи DDC в сторону узла
      const ang = Math.atan2(nz, nx);
      const cx = Math.cos(ang), cz = Math.sin(ang);
      const sc = 1 / Math.max(Math.abs(cx) / (AX * 1.06), Math.abs(cz) / (AZ * 1.06));
      const origin = new THREE.Vector3(cx * sc, HUBY, cz * sc);

      // точка
      const sp = new THREE.Sprite(nodeMat.clone());
      sp.position.set(nx, 0.4, nz); sp.scale.set(3.2, 3.2, 1); gMap.add(sp);
      sp.material.userData = { baseOp: 0.95 };
      mapMats.push(sp.material);

      // сияющая изогнутая линия от основания башен к узлу (QuadraticBezier, приподнят).
      // end.y приподнят над поверхностью (карта сверху на y≈0), чтобы дуга не «ложилась» в текстуру.
      const end = new THREE.Vector3(nx, 1.2, nz);
      const mid = origin.clone().add(end).multiplyScalar(0.5);
      // Дуга выше: линии идут ВОЗДУШНЫМ лучом над картой, поэтому над вогнутыми участками
      // границы не «ложатся» на кромку и не пересекают грань карты неприятно.
      mid.y += Math.min(9, origin.distanceTo(end) * 0.20);
      const curve = new THREE.QuadraticBezierCurve3(origin.clone(), mid, end);
      const pts = curve.getPoints(40);
      const lGeo = new THREE.BufferGeometry().setFromPoints(pts);
      // сияние: толстая мягкая линия + яркое ядро (две линии).
      // depthTest:false — дуги рисуются ПОВЕРХ карты (как и точки-узлы), иначе наклонённая
      // толстая плита перекрывает их и они «уходят за/внутрь карты».
      const glowMat = new THREE.LineBasicMaterial({ color: 0x5fc8ea, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
      const coreMat = new THREE.LineBasicMaterial({ color: 0xd6f6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
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

  // ── Звёзды-частицы: надпись «DDC», лежащая ПЛАШМЯ на карте ───────────────────
  // Частицы в ЛОКАЛЬНЫХ координатах gMap (надпись жёстко привязана к карте). TEXT_Y/TEXT_S
  // и рамка AX×AZ заданы выше (рядом с картой), чтобы линии стартовали с краёв надписи.
  const CZ = -26;
  const N = mobile ? Math.round(PARTICLE_N * 0.6) : PARTICLE_N;   // на мобиле меньше частиц (облегчённая сцена)
  const kz = new Float32Array(N * 3), ddc = new Float32Array(N * 3);
  const zoff = new Float32Array(N);
  for (let i = 0; i < N; i++) zoff[i] = (Math.random() - 0.5) * 4;
  function layout() {
    return { mobile: 0, camZ: 112, eyeY: 56, lookY: 5, cy: 20, planetY: 20,
             kzCX: 0, kzS: 18, ddcCX: 0, ddcS: 15 };
  }
  let L = layout();
  function buildTargets() {
    // Частицы образуют «DDC» на карте (локальные коорд. gMap; «верх» букв -> к северу -z).
    for (let i = 0; i < N; i++) {
      ddc[i * 3]     = DDC_PTS[i * 2] * TEXT_S;                    // x — ширина надписи
      ddc[i * 3 + 1] = TEXT_Y + zoff[i] * 0.12;                   // лежит на карте, лёгкий разброс по высоте
      ddc[i * 3 + 2] = -DDC_PTS[i * 2 + 1] * TEXT_S;              // z — высота букв (к северу)
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
  // Надпись — потомок карты (gMap): жёстко привязана, поворачивается вместе с картой.
  const points = new THREE.Points(pGeo, pMat); gMap.add(points);

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
  if (mobile) planet.visible = false;             // тяжёлый эффект — на мобиле выключен

  const PLANET_K = 0.98;             // планета — сдержанный фон, а не во весь экран
  function placePlanet() {
    planet.scale.setScalar(L.kzS * PLANET_K); planet.position.set(0, L.planetY, CZ - 9);
  }
  placePlanet();

  // ── Звёздное поле далеко позади: заполняет «пустое» небо за картой/зданиями ───
  // Один Points + лёгкий шейдер мерцания; позиции статичны (в кадре меняется только
  // время/прозрачность) — дёшево и не грузит мобильные. Уходит при выходе в вид сверху.
  const STAR_N = 1200;   // плотное звёздное поле (десктоп) — наполняет фон
  const sPos = new Float32Array(STAR_N * 3), sRnd = new Float32Array(STAR_N);
  for (let i = 0; i < STAR_N; i++) {
    if (i % 2 === 0) {
      // «небо»: высоко и далеко — для hero и облических ракурсов
      sPos[i * 3]     = (Math.random() - 0.5) * 540;
      sPos[i * 3 + 1] = 18 + Math.random() * 205;
      sPos[i * 3 + 2] = -70 - Math.random() * 230;
    } else {
      // «поле»: кольцо точек вокруг страны (низко по Y) — заполняет пустоту при виде сверху
      const ang = Math.random() * 6.2831, rad = 95 + Math.random() * 240;
      sPos[i * 3]     = Math.cos(ang) * rad;
      sPos[i * 3 + 1] = -3 + Math.random() * 9;
      sPos[i * 3 + 2] = -9 + Math.sin(ang) * rad * 0.7;
    }
    sRnd[i] = Math.random();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute('aRand', new THREE.BufferAttribute(sRnd, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Color(0x9fc6ff) } },
    vertexShader: `attribute float aRand; uniform float uTime; varying float vTw;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.5 + 0.5 * sin(uTime * 1.3 + aRand * 6.2831); vTw = tw;
        gl_PointSize = (0.6 + 1.7 * aRand) * (0.8 + 0.6 * tw) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vTw;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r) * (0.22 + 0.55 * vTw) * uOpacity;
        gl_FragColor = vec4(uColor, a); }`,
  });
  const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; scene.add(stars);
  if (mobile) stars.visible = false;   // тяжёлый эффект — на мобиле выключен

  // ── Спутники-огоньки: несколько светящихся точек на орбитах над страной — добавляют
  //    «жизни» и наполняют фон (десктоп). Дёшево: спрайты с одной glow-текстурой. ──
  const satCv = document.createElement('canvas'); satCv.width = satCv.height = 64;
  const satC = satCv.getContext('2d');
  const satG = satC.createRadialGradient(32, 32, 0, 32, 32, 32);
  satG.addColorStop(0, 'rgba(224,242,255,1)'); satG.addColorStop(0.3, 'rgba(120,200,255,0.7)'); satG.addColorStop(1, 'rgba(120,200,255,0)');
  satC.fillStyle = satG; satC.fillRect(0, 0, 64, 64);
  const satTex = new THREE.CanvasTexture(satCv);
  const sats = [];
  const satDefs = [
    { r: 72, y: 42, sp: 0.16, ph: 0.0, s: 2.6 }, { r: 98, y: 58, sp: -0.11, ph: 2.1, s: 2.2 },
    { r: 54, y: 30, sp: 0.22, ph: 4.0, s: 3.0 }, { r: 122, y: 70, sp: 0.08, ph: 1.0, s: 2.0 },
  ];
  for (const d of satDefs) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: satTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    sp.scale.set(d.s, d.s, 1); sp.userData = d; sats.push(sp); scene.add(sp);
    if (mobile) sp.visible = false;
  }

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
    if (mobile) sp.visible = false;     // тяжёлый эффект — на мобиле выключен
    clouds.push(sp); scene.add(sp);
  }


  // ── (3D-логотип убран — бренд показывается DOM-локапом) ─────────────────────

  // ── Камера / целевое состояние (задаётся маршрутом) ─────────────────────────
  let progress = 0, tx = 0, ty = 0, px = 0, py = 0, pState = -1;
  let viewYaw = 0, dispYaw = 0;   // целевой/сглаженный угол «ровного» разворота карты (свой для каждой страницы)
  const onPointer = (e) => { tx = (e.clientX / window.innerWidth - 0.5) * 2; ty = (e.clientY / window.innerHeight - 0.5) * 2; };
  if (!reduce && !mobile) window.addEventListener('pointermove', onPointer, { passive: true });

  // ── Перетаскивание здания: только по горизонтали (рыскание), без наклона ─────
  let dragging = false, lastX = 0, yawVel = 0, dragYaw = -0.62;   // управляемый разворот зданий (на hero как фото)
  const isUi = (el) => el && el.closest && el.closest('button, a, input, textarea, select, label, .modal, .nav-island, .af-card, .chip, .chip-info, .news-track');
  const onDown = (e) => {
    if ((e.button != null && e.button !== 0) || progress > 0.4 || isUi(e.target)) return; // только когда здание видно и не на UI
    dragging = true; lastX = e.clientX; yawVel = 0;
  };
  const onDrag = (e) => { if (!dragging) return; const d = (e.clientX - lastX) * 0.006; lastX = e.clientX; dragYaw += d; yawVel = d; };
  const onUp = () => { dragging = false; };
  if (!mobile) {   // на телефоне вращение пальцем мешает скроллу — отключаем перетаскивание
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onDrag, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
  }

  let lastW = 0;
  // На мобильных адресная строка при скролле постоянно меняет ВЫСОТУ вьюпорта. Если на это
  // менять размер буфера и camera.aspect — кадр «дышит» по ширине и фризит. Поэтому на телефоне
  // рендерим в стабильную (максимальную) высоту экрана и канвас сайзим в CSS-пикселях (низ просто
  // уходит под фолд), а реагируем ТОЛЬКО на смену ширины/ориентации.
  const stableH = Math.max(window.innerHeight, (window.screen && window.screen.height) || 0);
  function doResize() {
    const w = window.innerWidth;
    const h = mobile ? stableH : window.innerHeight;
    L = layout();
    renderer.setPixelRatio(curDpr);   // уважаем текущее адаптивное качество (не сбрасываем на ресайзе)
    renderer.setSize(w, h, mobile);   // mobile: фиксируем CSS-размер канваса (без растяжения при адресной строке)
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (edgeGlowMat) edgeGlowMat.resolution.set(w, h);   // px-толщина неон-границы зависит от размера канваса
    if (edgeCoreMat) edgeCoreMat.resolution.set(w, h);
    pMat.uniforms.uSize.value = 3.0;
    buildTargets();
    if (pState === 1) pos.set(ddc); else pos.set(kz);
    pGeo.attributes.position.needsUpdate = true;
    placePlanet();
    lastW = w;
  }
  function resize() {
    if (mobile && window.innerWidth === lastW) return;   // изменилась только высота (адресная строка) — игнор
    doResize();
  }
  window.addEventListener('resize', resize); doResize();

  scene.fog.color.setHex(0x0f1626);            // цвет тумана постоянен — задаём один раз, не в кадре

  const clock = new THREE.Clock(); let raf = 0, disp = progress, running = false, lastFrame = -1e9, prevT = 0;
  let perfAcc = 0, perfN = 0, perfT = 0;   // окно измерения fps для адаптивного DPR
  function loop() {
    raf = 0;
    if (running) raf = requestAnimationFrame(loop);
    // Ограничение кадров (опционально, для слабых устройств): быстро выходим из колбэка,
    // не трогая GPU, оставляя main-thread компоновщику скролла. Сейчас выключено (FRAME_MS=0).
    if (FRAME_MS) {
      const ms = clock.getElapsedTime() * 1000;
      if (ms - lastFrame < FRAME_MS) return;
      lastFrame = ms;
    }
    const t = clock.getElapsedTime();
    // Сглаживание по реальному времени кадра (а не фикс-шаг): переходы одинаково
    // плавные на 60/90/120 Гц и не «дёргаются» при просадках fps. dt ограничен,
    // чтобы после возврата из фоновой вкладки не было рывка.
    const rawDt = t - prevT;                    // реальная длительность кадра (для оценки производительности)
    const dt = Math.min(0.05, Math.max(0.001, rawDt)); prevT = t;
    const kSmooth = 1 - Math.exp(-dt * 6.0);    // быстрее переход между страницами (≈вдвое), кадронезависимо

    // Адаптивное качество: держим плавность. Тяжёлые кадры -> ниже разрешение рендера
    // (для размытого фона незаметно); лёгкие -> поднимаем к максимуму (десктопное качество).
    perfAcc += rawDt; perfN++;
    if (t - perfT > 0.7 && perfN > 8) {
      const avg = perfAcc / perfN;                                   // средняя длительность кадра, сек
      const maxDpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      let nd = curDpr;
      if (avg > 0.025 && curDpr > 1.0) nd = Math.max(1.0, curDpr - 0.25);              // <~40fps -> снижаем
      else if (avg < 0.0166 && curDpr < maxDpr) nd = Math.min(maxDpr, curDpr + 0.15);  // >~60fps -> повышаем
      if (Math.abs(nd - curDpr) > 0.02) { curDpr = nd; renderer.setPixelRatio(curDpr); renderer.setSize(window.innerWidth, window.innerHeight, false); }
      perfAcc = 0; perfN = 0; perfT = t;
    }
    disp += (progress - disp) * kSmooth;        // плавный бесшовный переход между страницами/скроллом
    dispYaw += (viewYaw - dispYaw) * kSmooth;    // плавный доворот карты к углу текущей страницы
    const p = disp;

    // камера: фокус на верхних этажах / крышах (адаптивно)
    px += (tx - px) * kSmooth; py += (ty - py) * kSmooth;
    // На hero (p~0) кадр охватывает башни + 3D-карту (низкий взгляд, дальше отъезд).
    // Единый объект «башни + карта» тает целиком при скролле (без подъёма башен),
    // освобождая сцену для частиц/надписи DDC. Камера на hero охватывает весь
    // объект; при скролле плавно поднимает взгляд к зоне частиц (cy≈30).
    // «Дрон взлетает»: камера плавно поднимается над страной и наклоняет взгляд вниз к
    // карте. Не резкий зум, а взлёт с набором высоты; башни остаются в центре кадра.
    // «Дрон взлетает и встаёт ПРЯМО НАД картой»: камера поднимается высоко и переходит в
    // вид сверху над центральным хабом, чтобы показать всю страну целиком.
    const lift = smooth(p, 0.05, 0.45);
    const eyeY = L.eyeY + lift * 120;            // 56 → ~176 (высоко над страной)
    const camZ = L.camZ + lift * (6 - L.camZ);   // 112 → ~6 (почти прямо над хабом z≈-9)
    const lookY = L.lookY * (1 - lift);          // 5 → 0 (взгляд вертикально вниз)
    const lookZ = lift * -9;                     // 0 → -9 (центр кадра — хаб)
    // На узких/портретных экранах (мобила) отъезжаем дальше и выше, СОХРАНЯЯ угол наклона,
    // чтобы тот же 3/4-вид на всю страну с башнями влезал в кадр, как на десктопе.
    const asp = camera.aspect || 1;
    const fit = asp < 1.2 ? 1 + (1.2 - asp) * 0.8 : 1;
    const par = 1 - lift;                        // параллакс гаснет в виде сверху
    camera.position.set(px * 2.0 * par, eyeY * fit - py * 1.2 * par + Math.sin(t * 0.3) * 0.08, camZ * fit);
    camera.lookAt(px * 0.4 * par, lookY, lookZ);

    // Здания стоят в полный рост, пока камера поднимается; затем ПРОПАДАЮТ, освобождая
    // основание под плоскую надпись DDC. Карта и линии остаются — главный объект.
    if (beacon) beacon.material.emissiveIntensity = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3));
    if (!dragging && Math.abs(yawVel) > 0.00001) { dragYaw += yawVel; yawVel *= 0.93; } // инерция перетаскивания
    // Карта со зданиями доворачивается к углу текущей страницы: на hero — пользовательский
    // разворот dragYaw, к виду сверху — заданный для страницы dispYaw (у каждой свой).
    const align = smooth(p, 0.18, 0.52);
    gBuild.rotation.y = dragYaw * (1 - align) + dispYaw * align;
    // Здания растворяются, когда камера уже над картой.
    const buildFade = smooth(p, 0.30, 0.46);
    gTowers.visible = buildFade < 0.999;
    if (gTowers.visible) for (const mt of towerMats) mt.opacity = 1 - buildFade;

    // К середине скролла линии/потоки данных усиливаются: один центр (DDC) координирует
    // цифровую экосистему страны. Карта держит базовую непрозрачность.
    const aerial = smooth(p, 0.30, 0.60);
    const boost = 1 + aerial * 0.8;
    for (const mm of mapMats) mm.opacity = (mm.userData?.baseOp ?? 0.92);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
    for (const lm of lineMats) {
      if (lm.userData?.glow) lm.opacity = Math.min(1, (0.16 + pulse * 0.20) * boost);
      else lm.opacity = Math.min(1, (lm.userData?.baseOp ?? 0.85) * boost);
    }
    // Неоновая граница страны: пульсирует и разгорается к середине скролла.
    if (edgeCoreMat) {
      edgeCoreMat.opacity = Math.min(1, (0.78 + pulse * 0.22) * boost);
      edgeGlowMat.opacity = Math.min(0.95, (0.30 + pulse * 0.28) * boost);
    }
    for (const pkt of (gMap.userData.packets || [])) {
      const u = pkt.userData; u.t += u.sp * 0.016; if (u.t > 1) u.t -= 1;
      u.curve.getPoint(u.t, pkt.position);
      pkt.material.opacity = Math.min(1, (0.5 + 0.5 * Math.sin(t * 4 + u.t * 6)) * boost);
    }

    // Тяжёлые fullscreen-эффекты (звёзды, облака, планета) — ТОЛЬКО на десктопе.
    // На мобиле они отключены (выставлены invisible при создании) ради плавности —
    // остаётся «облегчённая» 3D-сцена: башни, карта, надпись DDC, неон, движение камеры.
    if (!mobile) {
      // звёзды/поле остаются всегда — наполняют фон и при виде сверху (раньше гасли)
      starMat.uniforms.uTime.value = t;
      starMat.uniforms.uOpacity.value = 1;

      // спутники-огоньки тихо вращаются на орбитах над страной
      for (const sp of sats) {
        const d = sp.userData, a = t * d.sp + d.ph;
        sp.position.set(Math.cos(a) * d.r, d.y + Math.sin(a * 1.3) * 3, -9 + Math.sin(a) * d.r);
        sp.material.opacity = 0.5 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.8 + d.ph));
      }

      // облака появляются, пока башни тают, и расходятся после — мягкое исчезновение
      const cloudOp = smooth(p, 0.06, 0.16) * (1 - smooth(p, 0.26, 0.34));
      for (const sp of clouds) {
        sp.visible = cloudOp > 0.01;
        sp.material.opacity = cloudOp * 0.92;
        sp.position.x = sp.userData.bx + Math.sin(t * 0.14 + sp.userData.bx) * 1.4;
      }

      // планета: тихий ДАЛЬНИЙ ФОН — медленно вращается и «дышит».
      const spin = reduce ? 0 : t * 0.12;             // постоянное автовращение глобуса
      planet.rotation.y = spin + t * 0.3 + p * 1.2;
      if (!reduce) {
        planet.rotation.z = 0.34 + Math.sin(t * 0.18) * 0.05;   // лёгкое покачивание оси наклона
        planet.rotation.x = Math.sin(t * 0.13) * 0.03;
      }
      const breathe = reduce ? 1 : 1 + Math.sin(t * 0.5) * 0.012; // мягкое «дыхание» размера
      planet.scale.setScalar(L.kzS * PLANET_K * breathe);
      planet.position.set(0, L.planetY - 6, CZ - 22 + (reduce ? 0 : Math.sin(t * 0.4) * 0.18));
      // планета ВОЗВРАЩЕНА как постоянный задний фон: держится почти весь скролл,
      // лишь у самого вида сверху слегка притухает (раньше полностью исчезала к середине).
      planet.material.opacity = 0.82 * (1 - 0.5 * smooth(p, 0.55, 0.82));
      planet.visible = true;
    }

    // Надпись «DDC» из частиц проявляется над хабом к середине скролла, с лёгким
    // «живым» мерцанием/дрожанием частиц (центральный логотип цифровой экосистемы).
    const pOp = smooth(p, 0.34, 0.54);
    pMat.uniforms.uOpacity.value = pOp;
    pMat.uniforms.uTime.value = t;
    // Надпись видна только во второй половине скролла. На hero и в начале скролла НЕ пересчитываем
    // 1500 частиц и не льём буфер в GPU каждый кадр — это снимает фризы при старте скролла.
    if (pOp > 0.01) {
      const wob = reduce ? 0 : 1;
      for (let i = 0; i < N; i++) {
        const a = i * 3;
        pos[a]     = ddc[a]     + wob * Math.sin(i * 1.3 + t) * 0.18;
        pos[a + 1] = ddc[a + 1] + wob * Math.cos(i * 0.7 + t) * 0.18;
        pos[a + 2] = ddc[a + 2] + wob * Math.sin(i + t) * 0.22;
      }
      pGeo.attributes.position.needsUpdate = true; pState = 1;
    }                            // горящие огоньки + блики
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
    setYaw(y) { viewYaw = y || 0; if (!running && !document.hidden) start(); },
    setPage() { pageVar++; drawPlanet(pageVar); if (!running && !document.hidden) start(); },
    dispose() {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer); window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onDrag);
      window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      pMat.dispose(); pGeo.dispose(); planetTex.dispose(); cloudTex.dispose(); satTex.dispose(); [facadeA, facadeB].forEach((x) => x.dispose());
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const mm = o.material; (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose()); } });
      pmrem.dispose(); renderer.dispose();
    },
  };
}

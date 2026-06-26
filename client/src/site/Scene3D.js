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
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { PARTICLE_N, DDC_PTS } from './particlePoints.js';
import { KZ_OUTLINE, KZ_NODES, KZ_HUB } from './kzGeo.js';
import { perf } from './perfProfile.js';

export function initScene(canvas) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  // Профиль производительности (движок + устройство) — см. perfProfile.js.
  const lowPower = perf.lowPower;
  // Лёгкая сцена для ВСЕХ устройств: без тяжёлых fullscreen-эффектов (звёзды/облака/
  // спутники/планета/параллакс) — ради плавности в браузерах. Ядро (карта/башни/неон/DDC) остаётся.
  const LIGHT = true;
  // Потолок разрешения рендера: по движку/устройству (Firefox ниже — fill-rate тяжелее).
  const DPR_CAP = perf.dprCap;
  // Кадры НЕ ограничиваем — фон должен идти на нативной частоте дисплея (60/120/144 Гц).
  // За плавность под нагрузкой отвечает адаптивный DPR (ниже разрешение, но FPS высокий).
  // Адаптивное разрешение рендера: стартуем с максимума, а в кадре сами держим плавность —
  // на слабом телефоне тихо снижаем (для размытого фона незаметно), на сильном — десктопное.
  let curDpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: perf.antialias, alpha: true, powerPreference: 'high-performance' });
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

  // Контактная тень под зданием — «сажает» башни на карту (иначе они кажутся обособленными).
  // Это отдельный тёмный диск НА поверхности карты, само здание он не красит.
  let groundShadowMat = null;
  (() => {
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const sx = sc.getContext('2d');
    const g = sx.createRadialGradient(64, 64, 6, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(0.55, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    sx.fillStyle = g; sx.fillRect(0, 0, 128, 128);
    groundShadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, opacity: 0.6 });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(38, 23), groundShadowMat);
    sh.rotation.x = -Math.PI / 2; sh.position.set(-0.3, 0.12, 0); sh.renderOrder = 2;
    gTowers.add(sh);
  })();

  const HERO_YAW = -1.2;      // угол, под которым конструкция «встречает» на главной (3/4-вид)
  gBuild.rotation.y = HERO_YAW;

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

    // Контур в плоскости shape (lon->x, lat->y). Последняя точка дублирует первую — убираем.
    const raw = KZ_OUTLINE.map(([lo, la]) => new THREE.Vector2(lo * MAP_S - hub2.x, la * MAP_S));
    if (raw.length > 1 && raw[0].distanceTo(raw[raw.length - 1]) < 1e-4) raw.pop();

    // Скругление углов (филет малым радиусом): острые вершины заменяем короткими дугами —
    // граница выглядит реалистичнее (не гранёный полигон), форма страны сохраняется.
    // Радиус ограничен долей соседних отрезков, чтобы не «съедать» мелкие детали.
    const FILLET = 0.8, ARC = 2, Nr = raw.length;
    const outlinePts = [];
    for (let i = 0; i < Nr; i++) {
      const cur = raw[i], prev = raw[(i - 1 + Nr) % Nr], next = raw[(i + 1) % Nr];
      const v1 = new THREE.Vector2().subVectors(prev, cur), v2 = new THREE.Vector2().subVectors(next, cur);
      const l1 = v1.length(), l2 = v2.length();
      const cosA = (v1.x * v2.x + v1.y * v2.y) / (l1 * l2 || 1);
      // почти-прямой участок (угол > ~145°) НЕ скругляем — иначе берег «волнится»/кажется кривым
      if (cosA < -0.82) { outlinePts.push(cur.clone()); continue; }
      const rr = Math.min(FILLET, l1 * 0.35, l2 * 0.35);
      const a = cur.clone().addScaledVector(v1.divideScalar(l1), rr), b = cur.clone().addScaledVector(v2.divideScalar(l2), rr);
      outlinePts.push(a);
      for (let s = 1; s <= ARC; s++) {   // промежуточные точки квадратичной дуги a->cur->b
        const tt = s / (ARC + 1), mt = 1 - tt;
        outlinePts.push(new THREE.Vector2(mt * mt * a.x + 2 * mt * tt * cur.x + tt * tt * b.x,
                                          mt * mt * a.y + 2 * mt * tt * cur.y + tt * tt * b.y));
      }
      outlinePts.push(b);
    }
    const shape = new THREE.Shape();
    outlinePts.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
    shape.closePath();

    // ExtrudeGeometry — плита страны. bevelSegments 2 -> мягкая реалистичная кромка (не гранёная).
    const extrude = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.4, bevelSegments: 2, steps: 1 });

    // Цвета как на физической карте, распределены по географии (коорд. shape: x=lon, y=lat):
    //   север — зелёная степь, юг — тан/песок (пустыни), восток/юго-восток — бурые горы.
    extrude.computeBoundingBox();
    {
      const bb = extrude.boundingBox, pos = extrude.attributes.position;
      const cN = new THREE.Color(0x4f8a30), cS = new THREE.Color(0x7e9442), cM = new THREE.Color(0x6f6238), tmp = new THREE.Color();
      const cols = new Float32Array(pos.count * 3);
      const dy = (bb.max.y - bb.min.y) || 1, dx = (bb.max.x - bb.min.x) || 1;
      for (let i = 0; i < pos.count; i++) {
        const latN = (pos.getY(i) - bb.min.y) / dy;   // 0 юг .. 1 север
        const eastN = (pos.getX(i) - bb.min.x) / dx;   // 0 запад .. 1 восток
        tmp.copy(cS).lerp(cN, latN);                   // юг (тан/пустыня) -> север (зелёная степь)
        const mtn = Math.min(0.62, Math.max(0, eastN - 0.62) / 0.38 * (0.45 + 0.55 * (1 - latN)));
        tmp.lerp(cM, mtn);                             // восток/юго-восток -> бурые горы
        cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
      }
      extrude.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    }

    extrude.rotateX(-Math.PI / 2);    // положить плашмя: shape.y(lat) -> -z
    extrude.translate(0, 0, hub2.z);  // сдвиг чтобы хаб попал под башни (z)

    // Процедурный «рельеф» суши (шум + лёгкий градиент) как roughness/bump-map: под светом
    // поверхность играет светотенью — карта не плоская и «живая». Дёшево (одна 256² канва).
    const TS = 512;
    const mcv = document.createElement('canvas'); mcv.width = mcv.height = TS;
    const mc = mcv.getContext('2d');
    const bgGrad = mc.createLinearGradient(0, 0, TS, TS);
    bgGrad.addColorStop(0, '#8e8e8e'); bgGrad.addColorStop(1, '#6a6a6a');   // крупная тональная вариация
    mc.fillStyle = bgGrad; mc.fillRect(0, 0, TS, TS);
    // крупный «рельеф» — пятна разного размера (холмы/низины)
    for (let i = 0; i < 340; i++) {
      const x = (i * 137) % TS, y = (i * 211 + 40) % TS, r = 10 + (i % 11) * 11;
      const c = i % 2 ? 255 : 0;
      mc.fillStyle = `rgba(${c},${c},${c},${0.05 + (i % 6) / 80})`;
      mc.beginPath(); mc.ellipse(x, y, r, r * (0.55 + (i % 3) * 0.2), i, 0, 6.283); mc.fill();
    }
    // мелкая зернистость — фактура поверхности (трещины/неровности)
    for (let i = 0; i < 1500; i++) {
      const x = (i * 53) % TS, y = (i * 97 + 17) % TS, c = i % 2 ? 245 : 18;
      mc.fillStyle = `rgba(${c},${c},${c},${0.06 + (i % 4) / 60})`;
      mc.fillRect(x, y, 2, 2);
    }
    const mapTex = new THREE.CanvasTexture(mcv);
    mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping; mapTex.repeat.set(0.09, 0.09); mapTex.anisotropy = 4;

    // Цвет берём из вершинных цветов (физическая карта по географии). Матовая суша + рельеф
    // под светом; синяя неон-граница обрамляет «землю», как на рельефной карте.
    const mapMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughnessMap: mapTex, bumpMap: mapTex, bumpScale: 1.25,
      metalness: 0.06, roughness: 0.92, emissive: 0x0e1a08, emissiveIntensity: 0.24,
      transparent: true, opacity: 0.96,
    });
    mapMat.userData = { baseOp: 0.96 };
    const mapMesh = new THREE.Mesh(extrude, mapMat); mapMesh.position.y = -1.4; gMap.add(mapMesh); mapMats.push(mapMat);

    // Светящаяся граница страны — жирная неоновая линия (Line2): яркое ядро + широкое
    // мягкое свечение под ним (аддитивно). Толщина в пикселях экрана -> чёткий неон на
    // любом отдалении. Контур приподнят над плитой, чтобы не «тонул» в бевеле.
    const edgeFlat = [];
    for (const p of outlinePts) edgeFlat.push(p.x, 0.18, -p.y + hub2.z);
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
    for (const p of outlinePts) bottomFlat.push(p.x, slabBottom, -p.y + hub2.z);
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
      const pts = curve.getPoints(26);   // 40→26 точек на дугу: меньше вершин, на глаз так же гладко
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

  // ── Надпись «DDC»: статичный 3D-меш + неоновый контур по буквам ──────────────
  // Лежит ПЛАШМЯ на карте (XZ), «верх» букв -> к северу (-z). Грузится ОДИН РАЗ
  // (никакого обновления буфера каждый кадр, как было у частиц) -> легче для телефона.
  // TEXT_Y/TEXT_S и рамка AX×AZ заданы выше (надпись жёстко привязана к карте gMap).
  function layout() {
    return { mobile: 0, camZ: 112, eyeY: 56, lookY: 5, cy: 20, planetY: 20,
             kzCX: 0, kzS: 18, ddcCX: 0, ddcS: 15 };
  }
  let L = layout();

  const ddcGroup = new THREE.Group(); ddcGroup.visible = false; gMap.add(ddcGroup);
  const ddcMeshMats = [];     // материалы тела букв (fade по скроллу)
  const ddcLineMats = [];     // материалы неон-контура (fade + пульс); их resolution обновляем в resize
  (() => {
    const font = new FontLoader().parse(helvetikerBold);
    const shapes = font.generateShapes('DDC', 10);
    // габариты в координатах шрифта -> центрируем и вписываем по ширине в рамку AX
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const sh of shapes) for (const p of sh.getPoints(10)) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const cxf = (minX + maxX) / 2, cyf = (minY + maxY) / 2;
    const s = (AX * 2 * 0.92) / ((maxX - minX) || 1);   // масштаб шрифт→world
    const TH = 1.4;                                      // толщина букв (world)
    const depth = TH / s;                                // depth в координатах шрифта (после scale -> TH)
    const topY = TEXT_Y + TH + 0.06;                     // верхняя грань — там неон-контур

    // тело букв (extrude). После rotateX(-90°): верх букв (y шрифта) -> -z (север).
    const geo = new TextGeometry('DDC', {
      font, size: 10, height: depth, curveSegments: 6,
      bevelEnabled: true, bevelThickness: depth * 0.12, bevelSize: depth * 0.08, bevelSegments: 1,
    });
    geo.translate(-cxf, -cyf, 0); geo.scale(s, s, s); geo.rotateX(-Math.PI / 2); geo.translate(0, TEXT_Y, 0);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x12386e, metalness: 0.55, roughness: 0.32, envMapIntensity: 1.0,
      emissive: 0x0a2452, emissiveIntensity: 0.45, transparent: true, opacity: 0,
    });
    bodyMat.userData = { baseOp: 1 };
    const mesh = new THREE.Mesh(geo, bodyMat); mesh.renderOrder = 6; ddcGroup.add(mesh); ddcMeshMats.push(bodyMat);

    // неон-контур по буквам: внешний контур + «дырки» (счётчик в D), на верхней грани.
    const W0 = window.innerWidth, H0 = window.innerHeight;
    const glowMat = new LineMaterial({ color: 0x3aa0ff, linewidth: 4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    const coreMat = new LineMaterial({ color: 0xcdeeff, linewidth: 1.4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    glowMat.resolution.set(W0, H0); coreMat.resolution.set(W0, H0);
    glowMat.userData = { baseOp: 0.5, glow: true }; coreMat.userData = { baseOp: 0.95 };
    ddcLineMats.push(glowMat, coreMat);
    const toWorld = (p) => [(p.x - cxf) * s, topY, -((p.y - cyf) * s)];
    const addContour = (pts) => {
      if (!pts || pts.length < 2) return;
      const flat = [];
      for (const p of pts) { const w = toWorld(p); flat.push(w[0], w[1], w[2]); }
      const f0 = toWorld(pts[0]); flat.push(f0[0], f0[1], f0[2]);   // замкнуть контур
      const g = new LineGeometry(); g.setPositions(flat);
      const glow = new Line2(g, glowMat); glow.renderOrder = 7; ddcGroup.add(glow);
      const core = new Line2(g, coreMat); core.renderOrder = 8; ddcGroup.add(core);
    };
    for (const sh of shapes) {
      const ep = sh.extractPoints(10);   // { shape, holes }
      addContour(ep.shape);
      for (const hole of ep.holes) addContour(hole);
    }
  })();

  // ── Планета: теперь 2D-кружок на фоне (DOM-слой #bg-planet в Site.jsx + styles.css).
  //    3D-планета удалена — она была невидимой и зря держала текстуру 1024×512 и
  //    перерисовывалась при каждой навигации. Звёзды/спутники/облака тоже удалены:
  //    в LIGHT-режиме они никогда не рисовались (мёртвый груз памяти/инициализации). ──

  // ── (3D-логотип убран — бренд показывается DOM-локапом) ─────────────────────

  // ── Камера / целевое состояние (задаётся маршрутом) ─────────────────────────
  let progress = 0, tx = 0, ty = 0, px = 0, py = 0;
  let viewYaw = 0, dispYaw = 0;   // целевой/сглаженный угол «ровного» разворота карты (свой для каждой страницы)
  const onPointer = (e) => { tx = (e.clientX / window.innerWidth - 0.5) * 2; ty = (e.clientY / window.innerHeight - 0.5) * 2; };
  if (!reduce && !LIGHT) window.addEventListener('pointermove', onPointer, { passive: true });

  // ── Перетаскивание здания: только по горизонтали (рыскание), без наклона ─────
  let dragging = false, lastX = 0, yawVel = 0, dragYaw = HERO_YAW;   // стартовый разворот = угол приветствия
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
    for (const m of ddcLineMats) m.resolution.set(w, h);  // px-толщина неон-контура DDC
    lastW = w;
  }
  function resize() {
    if (mobile && window.innerWidth === lastW) return;   // изменилась только высота (адресная строка) — игнор
    doResize();
  }
  window.addEventListener('resize', resize); doResize();

  scene.fog.color.setHex(0x0f1626);            // цвет тумана постоянен — задаём один раз, не в кадре

  const clock = new THREE.Clock(); let raf = 0, disp = progress, running = false, prevT = 0;
  let perfAcc = 0, perfN = 0, perfT = 0;   // окно измерения fps для адаптивного DPR
  function loop() {
    raf = 0;
    if (running) raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    // Сглаживание по реальному времени кадра (а не фикс-шаг): переходы одинаково
    // плавные на 60/90/120 Гц и не «дёргаются» при просадках fps. dt ограничен,
    // чтобы после возврата из фоновой вкладки не было рывка.
    const rawDt = t - prevT;                    // реальная длительность кадра (для оценки производительности)
    const dt = Math.min(0.05, Math.max(0.001, rawDt)); prevT = t;
    const kSmooth = 1 - Math.exp(-dt * 6.0);    // быстрее переход между страницами (≈вдвое), кадронезависимо

    // Адаптивное качество: держим плавность. Тяжёлые кадры -> ниже разрешение рендера
    // (для размытого фона незаметно); лёгкие -> поднимаем к максимуму (десктопное качество).
    // На Firefox (gecko) снижаем РАНЬШЕ и до меньшего пола — приоритет высокому/ровному FPS.
    perfAcc += rawDt; perfN++;
    if (t - perfT > 0.7 && perfN > 8) {
      const avg = perfAcc / perfN;                                   // средняя длительность кадра, сек
      const maxDpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const lowerAt = perf.engine === 'gecko' ? 0.0182 : 0.025;      // gecko: реагируем уже на ~55fps
      const floor = perf.engine === 'gecko' ? 0.85 : 1.0;
      let nd = curDpr;
      if (avg > lowerAt && curDpr > floor) nd = Math.max(floor, curDpr - 0.2);          // просадка -> ниже разрешение
      else if (avg < 0.0166 && curDpr < maxDpr) nd = Math.min(maxDpr, curDpr + 0.15);   // запас -> выше
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
    if (gTowers.visible) {
      for (const mt of towerMats) mt.opacity = 1 - buildFade;
      if (groundShadowMat) groundShadowMat.opacity = 0.6 * (1 - buildFade);   // тень тает вместе со зданием
    }

    // К середине скролла линии/потоки данных усиливаются: один центр (DDC) координирует
    // цифровую экосистему страны. Карта держит базовую непрозрачность.
    const aerial = smooth(p, 0.30, 0.60);
    const boost = 1 + aerial * 0.8;
    // (opacity карты/узлов не анимируется — задана при создании, поэтому в кадре не трогаем)
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

    // (звёзды/спутники/облака/планета удалены — в LIGHT-режиме они не рисовались)

    // Надпись «DDC» (3D-меш + неон-контур) проявляется над хабом к середине скролла.
    // Статичная геометрия — только меняем прозрачность материалов (без per-frame буфера).
    const pOp = smooth(p, 0.34, 0.54);
    ddcGroup.visible = pOp > 0.01;
    if (ddcGroup.visible) {
      for (const m of ddcMeshMats) m.opacity = (m.userData?.baseOp ?? 1) * pOp;
      for (const m of ddcLineMats) {
        const base = m.userData?.baseOp ?? 0.9;
        m.opacity = Math.min(1, base * pOp * (m.userData?.glow ? (0.7 + 0.6 * pulse) : 1));
      }
    }
    renderer.render(scene, camera);
  }

  function start() { if (!running) { running = true; clock.getDelta(); if (!raf) raf = requestAnimationFrame(loop); } }
  function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  const onVisibility = () => { document.hidden ? stop() : start(); };
  document.addEventListener('visibilitychange', onVisibility);
  start();

  return {
    setTarget(p) { progress = Math.min(1, Math.max(0, p)); if (!running && !document.hidden) start(); },
    setYaw(y) { viewYaw = y || 0; if (!running && !document.hidden) start(); },
    setPage() { if (!running && !document.hidden) start(); },
    dispose() {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer); window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onDrag);
      window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      [facadeA, facadeB].forEach((x) => x.dispose());
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const mm = o.material; (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose()); } });
      pmrem.dispose(); renderer.dispose();
    },
  };
}

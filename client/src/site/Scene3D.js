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
      emissive: 0xbfe6ff, emissiveMap: tex, emissiveIntensity: 0.72,                        // окна светятся ярче (тёплая синева)
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
    const podiumTop = box(22, 0.4, 11, emis(0x3a7fd6, 0.62), 0.2); podiumTop.position.y = 1.7; gTowers.add(podiumTop);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 3, 10), metal()); mast.position.set(6.5, 30.6, 0); gTowers.add(mast);
    beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), emis(0x7ad6ff, 0.9)); beacon.position.set(6.5, 32.4, 0); gTowers.add(beacon);

    // Мягкое голубое свечение у основания — «штаб-квартира светится на карте».
    // На мобиле пропускаем (большой additive-план = тяжёлый overdraw → фризы).
    if (!mobile) {
      const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128;
      const gx = glowCv.getContext('2d');
      const gr = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(120,210,255,0.9)'); gr.addColorStop(0.45, 'rgba(70,160,255,0.32)'); gr.addColorStop(1, 'rgba(70,160,255,0)');
      gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
      const glowTex = new THREE.CanvasTexture(glowCv);
      const baseGlow = new THREE.Mesh(new THREE.PlaneGeometry(46, 32),
        new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
      baseGlow.rotation.x = -Math.PI / 2; baseGlow.position.set(-0.3, 0.15, 0); baseGlow.renderOrder = 3; gTowers.add(baseGlow);
    }

    // Светящаяся надпись «DDC» на крыше высокой башни — спрайт всегда лицом к камере.
    const signCv = document.createElement('canvas'); signCv.width = 256; signCv.height = 96;
    const sg = signCv.getContext('2d');
    sg.font = '800 62px Inter, Arial, sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
    sg.shadowColor = 'rgba(120,210,255,0.95)'; sg.shadowBlur = 26; sg.fillStyle = '#dff3ff';
    sg.fillText('DDC', 128, 52);
    const signTex = new THREE.CanvasTexture(signCv);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sign.position.set(6.5, 32.0, 0); sign.scale.set(9, 3.4, 1); gTowers.add(sign);

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

    // Тёмно-синяя «силуэтная» суша (как на референсе): почти однотонный navy с едва
    //   заметной вариацией — север чуть светлее, восток чуть синее. Свет дают граница,
    //   узлы и дуги, а сама плита остаётся тёмной — чтобы сеть «светилась» поверх неё.
    extrude.computeBoundingBox();
    {
      const bb = extrude.boundingBox, pos = extrude.attributes.position;
      const cN = new THREE.Color(0x16294e), cS = new THREE.Color(0x101d3c), cM = new THREE.Color(0x1a2e56), tmp = new THREE.Color();
      const cols = new Float32Array(pos.count * 3);
      const dy = (bb.max.y - bb.min.y) || 1, dx = (bb.max.x - bb.min.x) || 1;
      for (let i = 0; i < pos.count; i++) {
        const latN = (pos.getY(i) - bb.min.y) / dy;   // 0 юг .. 1 север
        const eastN = (pos.getX(i) - bb.min.x) / dx;   // 0 запад .. 1 восток
        tmp.copy(cS).lerp(cN, latN);                   // юг (темнее navy) -> север (чуть светлее)
        const mtn = Math.min(0.62, Math.max(0, eastN - 0.62) / 0.38 * (0.45 + 0.55 * (1 - latN)));
        tmp.lerp(cM, mtn);                             // восток/юго-восток -> чуть более синий navy
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
      color: 0xffffff, vertexColors: true, roughnessMap: mapTex, bumpMap: mapTex, bumpScale: 0.55,
      metalness: 0.14, roughness: 0.88, emissive: 0x10254e, emissiveIntensity: 0.3,
      transparent: true, opacity: 1,
    });
    mapMat.userData = { baseOp: 0.96 };
    const mapMesh = new THREE.Mesh(extrude, mapMat); mapMesh.position.y = -1.4; gMap.add(mapMesh); mapMats.push(mapMat);

    // Сплошная неоновая граница страны убрана намеренно — карта более абстрактная.
    // Контур страны читается теперь только по россыпи точек-огоньков (см. ниже),
    // без «ровной» чёткой линии. edgeCoreMat/edgeGlowMat остаются null — все места,
    // что их анимируют/ресайзят, защищены проверками `if (edgeCoreMat)` и просто пропускаются.

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

      // размер узла варьируем: часть городов — крупные «хабы», часть — мелкие точки
      const big = (Math.abs(Math.round(lo * 53 + la * 29)) % 4) === 0;
      const nodeS = big ? 4.4 : 2.9;
      // мягкий ореол под точкой (bloom-стиль свечение) — на мобиле пропускаем (overdraw)
      let haloMat = null;
      if (!mobile) {
        const halo = new THREE.Sprite(nodeMat.clone());
        halo.position.set(nx, 0.36, nz); halo.scale.set(nodeS * 2.7, nodeS * 2.7, 1); gMap.add(halo);
        halo.material.opacity = 0.34; halo.material.userData = { baseOp: 0.34 };
        mapMats.push(halo.material); haloMat = halo.material;
      }
      // яркое ядро узла
      const sp = new THREE.Sprite(nodeMat.clone());
      sp.position.set(nx, 0.4, nz); sp.scale.set(nodeS, nodeS, 1); gMap.add(sp);
      sp.material.userData = { baseOp: 0.95 };
      mapMats.push(sp.material);
      // для «мерцания городов»: запоминаем материалы узла + индивидуальную фазу
      (gMap.userData.nodes = gMap.userData.nodes || []).push({ c: sp.material, h: haloMat, ph: (Math.abs(Math.round(lo * 71 + la * 43)) % 360) * 0.01745 });

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
      const glowMat = new THREE.LineBasicMaterial({ color: 0x5fc8ea, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
      const coreMat = new THREE.LineBasicMaterial({ color: 0xe2f7ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
      glowMat.userData = { glow: true, baseOp: 0.28 };
      coreMat.userData = { baseOp: 0.9 };
      const arcGlow = new THREE.Line(lGeo, glowMat); gMap.add(arcGlow);
      const arcCore = new THREE.Line(lGeo, coreMat); gMap.add(arcCore);
      lineMats.push(glowMat, coreMat);
      // для boot-интро: дугу «протягиваем» через geometry.drawRange (общая геометрия у glow+core)
      (gMap.userData.arcs = gMap.userData.arcs || []).push({ geo: lGeo, glow: glowMat, core: coreMat, n: pts.length });

      // бегущий пакет по линии
      const pkt = new THREE.Sprite(nodeMat.clone());
      pkt.position.copy(pts[0]); pkt.scale.set(2.0, 2.0, 1);
      pkt.userData = { curve, t: Math.random(), sp: 0.18 + Math.random() * 0.12 };
      gMap.add(pkt);
      gMap.userData.packets = gMap.userData.packets || [];
      gMap.userData.packets.push(pkt);
    }

    // ── Абстрактный контур страны: только россыпь мелких огоньков вдоль границы
    //    (без сплошной неон-линии). Один THREE.Points → один drawcall, поэтому рисуем
    //    его И НА МОБИЛЕ — иначе после удаления неон-границы контур страны пропал бы. ──
    {
      const STEP = 0.85;                 // шаг между огоньками вдоль контура (ед. сцены)
      const dots = [];
      const n = outlinePts.length;
      for (let i = 0; i < n; i++) {
        const a = outlinePts[i], b = outlinePts[(i + 1) % n];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.round(segLen / STEP));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          dots.push(a.x + (b.x - a.x) * t, 0.3, -(a.y + (b.y - a.y) * t) + hub2.z);
        }
      }
      const og = new THREE.BufferGeometry();
      og.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
      // Чуть ярче/крупнее прежнего — компенсируем отсутствие сплошной границы, но контур
      // остаётся «пунктирным», абстрактным, без ровной линии.
      const outlineDotMat = new THREE.PointsMaterial({
        map: dotTex, color: 0x7ad6ff, size: 1.7, sizeAttenuation: true,
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0.95,
      });
      outlineDotMat.userData = { baseOp: 0.95 };
      const outlineDots = new THREE.Points(og, outlineDotMat); outlineDots.renderOrder = 6; gMap.add(outlineDots);
      mapMats.push(outlineDotMat);
      gMap.userData.outlineDots = outlineDots; gMap.userData.outlineN = dots.length / 3;   // для boot-интро (прорисовка контура)
    }

    // ── Тонкая внутренняя «звёздная пыль» по площади страны — еле заметная фактура суши.
    //    Тяжёлый additive overdraw → только на десктопе. ──
    if (!mobile) {
      const inside = (px, py) => {
        let c = false;
        for (let i = 0, j = raw.length - 1; i < raw.length; j = i++) {
          const xi = raw[i].x, yi = raw[i].y, xj = raw[j].x, yj = raw[j].y;
          if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) c = !c;
        }
        return c;
      };
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (const p of raw) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); }
      // детерминированный псевдослучай (без Math.random — стабильно между перезагрузками)
      let seed = 20260626; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      const dust = []; let tries = 0;
      while (dust.length < 240 * 3 && tries < 6000) {
        tries++;
        const px = minx + rnd() * (maxx - minx), py = miny + rnd() * (maxy - miny);
        if (inside(px, py)) dust.push(px, 0.24, -py + hub2.z);
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dust, 3));
      const dustMat = new THREE.PointsMaterial({
        map: dotTex, color: 0x63c4ec, size: 0.8, sizeAttenuation: true,
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0.3,
      });
      dustMat.userData = { baseOp: 0.3 };
      const dustPts = new THREE.Points(dustGeo, dustMat); dustPts.renderOrder = 2; gMap.add(dustPts);
      mapMats.push(dustMat);
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
  // Вступительная «сборка» карты при загрузке (один раз, по таймеру — не под скролл):
  // контур прорисовывается → города зажигаются по очереди → дуги протягиваются → башни.
  let introStart = -1, introDone = false; const INTRO_DUR = 2.6;
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
    // Очень медленный «живой» дрейф камеры (2-3%) — кадр не статичен, но и не «плавает».
    const drift = Math.sin(t * 0.13) * par;
    camera.position.set(px * 2.0 * par + drift * 0.8, eyeY * fit - py * 1.2 * par + Math.sin(t * 0.26) * 0.2, camZ * fit);
    camera.lookAt(px * 0.4 * par + drift * 0.3, lookY, lookZ);

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
    // Лёгкое мерцание городов — у каждого узла своя фаза (живой, но спокойный кадр).
    for (const nd of (gMap.userData.nodes || [])) {
      const tw = 0.82 + 0.18 * Math.sin(t * 1.4 + nd.ph);
      nd.c.opacity = Math.min(1, 0.95 * tw * boost);
      if (nd.h) nd.h.opacity = Math.min(1, 0.34 * (0.6 + 0.55 * tw) * boost);
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
    // ── Boot-интро: одноразовая «сборка» карты при загрузке (поверх обычных opacity).
    //    Контур (0.03–0.42) → города по очереди (0.30–0.78) → дуги (0.45–0.9) → башни.
    if (!introDone) {
      if (introStart < 0) introStart = t;
      const ik = Math.min(1, (t - introStart) / INTRO_DUR);
      const ud = gMap.userData;
      // 1) контур страны прорисовывается
      const outR = smooth(ik, 0.03, 0.42);
      if (edgeGlowMat) edgeGlowMat.opacity *= outR;
      if (edgeCoreMat) edgeCoreMat.opacity *= outR;
      const od = ud.outlineDots;
      if (od) { od.material.opacity *= smooth(ik, 0.05, 0.5); od.geometry.setDrawRange(0, Math.floor((ud.outlineN || 0) * outR)); }
      // 2) города зажигаются по очереди
      const nodes = ud.nodes || [];
      for (let i = 0; i < nodes.length; i++) {
        const s = 0.30 + (i / Math.max(1, nodes.length)) * 0.48;
        const k = smooth(ik, s, s + 0.12);
        nodes[i].c.opacity *= k; if (nodes[i].h) nodes[i].h.opacity *= k;
      }
      // 3) дуги протягиваются от хаба к узлам
      const arcs = ud.arcs || [];
      for (let i = 0; i < arcs.length; i++) {
        const a = arcs[i];
        const s = 0.45 + (i / Math.max(1, arcs.length)) * 0.42;
        const k = smooth(ik, s, s + 0.18);
        const cnt = Math.max(0, Math.floor(a.n * k));
        a.geo.setDrawRange(0, cnt);
        const vis = cnt > 1 ? 1 : 0;
        a.glow.opacity *= vis; a.core.opacity *= vis;
      }
      // 4) пакеты-импульсы и башни проявляются к концу
      for (const pkt of (ud.packets || [])) pkt.material.opacity *= smooth(ik, 0.72, 0.95);
      const twk = smooth(ik, 0.12, 0.62);
      for (const mt of towerMats) mt.opacity *= twk;
      if (ik >= 1) {
        introDone = true;                                   // вернуть полные диапазоны отрисовки
        if (od) od.geometry.setDrawRange(0, Infinity);
        for (const a of arcs) a.geo.setDrawRange(0, Infinity);
      }
    }

    renderer.render(scene, camera);
  }

  let warmed = false;
  function start() {
    if (!running) {
      running = true; clock.getDelta();
      // Прогрев шейдеров: компилируем материалы ДО первого появления (башни, надпись DDC,
      // сеть). Иначе при первом показе на скролле (прогресс ~0.4–0.6) GPU компилирует шейдер
      // в кадре → разовый фриз. Делаем один раз, временно показав скрытые группы.
      if (!warmed) {
        warmed = true;
        try {
          const tv = gTowers.visible, dv = ddcGroup.visible;
          gTowers.visible = true; ddcGroup.visible = true;
          renderer.compile(scene, camera);
          gTowers.visible = tv; ddcGroup.visible = dv;
        } catch { /* compile необязателен */ }
      }
      if (!raf) raf = requestAnimationFrame(loop);
    }
  }
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

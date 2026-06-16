/* Scene3D.js — фон главной: две стеклянные башни (как есть) + звёзды-частицы за
   ними в форме карты Казахстана. При скролле башни исчезают, карта остаётся, а
   затем частицы пересобираются в надпись «DDC», после чего сзади подлетает
   стеклянная 3D-модель логотипа. Камера почти статична (лёгкий параллакс). */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PARTICLE_N, KZ_PTS, DDC_PTS } from './particlePoints.js';

export function initScene(canvas) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
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
    const fl = new THREE.Mesh(new THREE.CircleGeometry(40, 48), matte(0x172033)); fl.rotation.x = -Math.PI / 2; gBuild.add(fl);
    const towerMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.32, metalness: 0.25, envMapIntensity: 1.25 });
    const tower = (w, d, h, x, tex) => {
      const tg = new THREE.Group();
      const body = box(w, h, d, towerMat(tex), 0.1); body.position.y = h / 2; tg.add(body);
      const finMat = metal(0xaab6c8);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.22), finMat); fin.position.set(sx * (w / 2), h / 2, sz * (d / 2)); tg.add(fin); }
      const crown = box(w + 0.4, 1.2, d + 0.4, matte(0xdfe4ec), 0.1); crown.position.y = h + 0.6; tg.add(crown);
      tg.position.x = x; return tg;
    };
    gBuild.add(tower(9, 9, 32, -8, facadeA));
    gBuild.add(tower(10, 10, 38, 7.5, facadeB));
    const podium = box(34, 3, 18, matte(0xeef1f6), 0.15); podium.position.y = 1.5; gBuild.add(podium);
    for (let i = -7; i <= 7; i++) { const coln = box(0.5, 3, 0.5, matte(0xe2e7ee)); coln.position.set(i * 2.2, 1.5, 9); gBuild.add(coln); }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 4, 10), metal()); mast.position.set(7.5, 40, 0); gBuild.add(mast);
    beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), emis(0xff4040, 1.2)); beacon.position.set(7.5, 42.2, 0); gBuild.add(beacon);
    gBuild.traverse((o) => { if (o.material) { o.material.transparent = true; towerMats.push(o.material); } });
  })();

  // ── Звёзды-частицы: Казахстан ↔ DDC (адаптивно под экран) ───────────────────
  const CZ = -26;
  const N = PARTICLE_N;
  const kz = new Float32Array(N * 3), ddc = new Float32Array(N * 3);
  const zoff = new Float32Array(N);
  for (let i = 0; i < N; i++) zoff[i] = (Math.random() - 0.5) * 4;
  function layout() {
    const w = window.innerWidth, h = window.innerHeight, a = w / h;
    const mobile = w < 760 || a < 0.95;
    if (mobile) return { mobile: 1, camZ: 64, eyeY: 24, lookY: 28, cy: 28, kzCX: 0, kzS: 13, ddcCX: 0, ddcS: 10 };
    return { mobile: 0, camZ: 46, eyeY: 18, lookY: 30, cy: 30, kzCX: 0, kzS: 18, ddcCX: 0, ddcS: 15 };
  }
  let L = layout();
  function buildTargets() {
    for (let i = 0; i < N; i++) {
      kz[i * 3] = L.kzCX + KZ_PTS[i * 2] * L.kzS; kz[i * 3 + 1] = L.cy + KZ_PTS[i * 2 + 1] * L.kzS; kz[i * 3 + 2] = CZ + zoff[i];
      ddc[i * 3] = L.ddcCX + DDC_PTS[i * 2] * L.ddcS; ddc[i * 3 + 1] = L.cy + DDC_PTS[i * 2 + 1] * L.ddcS; ddc[i * 3 + 2] = CZ + zoff[i];
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
      uColor: { value: new THREE.Color(0x9fd0ff) },
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

  // ── 2D-планета за зданиями (вращается, на ней проявляется карта) ─────────────
  const planetCv = document.createElement('canvas'); planetCv.width = 512; planetCv.height = 256;
  const pc = planetCv.getContext('2d');
  const pg = pc.createLinearGradient(0, 0, 0, 256);
  pg.addColorStop(0, '#3a6cab'); pg.addColorStop(0.5, '#28518a'); pg.addColorStop(1, '#1a3a68');
  pc.fillStyle = pg; pc.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 30; i++) {                       // мягкие «материки/облака»
    pc.fillStyle = `rgba(180,210,245,${0.06 + Math.random() * 0.14})`;
    pc.beginPath(); pc.ellipse(Math.random() * 512, Math.random() * 256, 20 + Math.random() * 60, 10 + Math.random() * 28, Math.random() * 6.28, 0, 6.28); pc.fill();
  }
  const planetTex = new THREE.CanvasTexture(planetCv); planetTex.colorSpace = THREE.SRGBColorSpace;
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 48),
    new THREE.MeshBasicMaterial({ map: planetTex, transparent: true, opacity: 1 })
  );
  scene.add(planet);
  function placePlanet() { planet.scale.setScalar(L.kzS * 1.12); planet.position.set(0, L.cy, CZ - 9); }
  placePlanet();


  // ── (3D-логотип убран — бренд показывается DOM-локапом) ─────────────────────

  // ── Камера / скролл ──────────────────────────────────────────────────────────
  let progress = 0, tx = 0, ty = 0, px = 0, py = 0, pState = -1;
  const onScroll = () => { const max = document.documentElement.scrollHeight - window.innerHeight; progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0; };
  const onPointer = (e) => { tx = (e.clientX / window.innerWidth - 0.5) * 2; ty = (e.clientY / window.innerHeight - 0.5) * 2; };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  if (!reduce) window.addEventListener('pointermove', onPointer, { passive: true });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    L = layout(); buildTargets();
    if (pState === 1) pos.set(ddc); else pos.set(kz);
    pGeo.attributes.position.needsUpdate = true;
    placePlanet();
  }
  window.addEventListener('resize', resize); resize();

  const clock = new THREE.Clock(); let raf = 0, disp = progress;
  function loop() {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const t = clock.getElapsedTime();
    disp += (progress - disp) * 0.12;          // сглаживание резкого скролла (меньше лагов)
    const p = disp;

    // камера: фокус на верхних этажах / крышах (адаптивно)
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    camera.position.set(px * 2.0, L.eyeY - py * 1.2 + Math.sin(t * 0.3) * 0.08, L.camZ);
    camera.lookAt(px * 0.4, L.lookY, 0);

    // башни исчезают (поднимаются и тают)
    const fade = smooth(p, 0.12, 0.30);
    gBuild.position.y = fade * 26;
    for (const mt of towerMats) mt.opacity = 1 - fade;
    gBuild.visible = fade < 0.999;
    if (beacon) beacon.material.emissiveIntensity = (0.7 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3))) * (1 - fade);

    // планета: вращается (быстрее при скролле), исчезает к моменту сборки DDC
    planet.rotation.y = t * 0.12 + p * 5.0;
    planet.material.opacity = 1 - smooth(p, 0.62, 0.82);
    planet.visible = planet.material.opacity > 0.02;

    // частицы появляются по мере исчезновения башен, затем Казахстан → DDC
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
    pMat.uniforms.uColor.value.setHex(isDark() ? 0x9fd0ff : 0x8fc4ff);

    scene.fog.color.setHex(isDark() ? 0x0f1626 : 0xdfe8f5);
    renderer.render(scene, camera);
  }
  loop();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll); window.removeEventListener('pointermove', onPointer); window.removeEventListener('resize', resize);
      pMat.dispose(); pGeo.dispose(); planetTex.dispose(); [facadeA, facadeB].forEach((x) => x.dispose());
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const mm = o.material; (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose()); } });
      pmrem.dispose(); renderer.dispose();
    },
  };
}

/* Scene3D.js — 3D-фон: проезд камеры вперёд по вертикальному скроллу.
   1) бизнес-центр (фасады-фото, насыщенные) → облака (заполняют пустоту) →
   2) офис (дерев. пол, рабочие места и мебель из GLB). В центре офиса — большой
   монитор: на нём идёт «движ» (дашборд), а на финале (к контактам) камера
   подлетает к нему и на экране — форма заявки. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function initScene(canvas) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(0xdfe8f5, 0.012);
  scene.fog = fog;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 600);

  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0xc4ccdb, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(14, 28, 20); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc0ff, 0.7); rim.position.set(-16, 12, 8); scene.add(rim);

  const COL = { blue: 0x2f6fe0, gold: 0xc8a14a };
  const metal = (c = 0xd8dde6) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.8, roughness: 0.3, envMapIntensity: 1.2 });
  const matte = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.2, roughness: 0.65 });
  const emis = (c, i = 0.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.5 });
  const box = (w, h, d, m, r = 0.1) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), m);

  const TL = new THREE.TextureLoader();
  const facadeTex = (url, rx, ry) => { const t = TL.load(url); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; };
  const facadeA = facadeTex('/tex/facade_a.jpg', 2, 5);
  const facadeB = facadeTex('/tex/facade_b.jpg', 2, 4);
  const woodTex = (url, color = true) => { const t = TL.load(url); if (color) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 7); t.anisotropy = 4; return t; };
  const woodBase = woodTex('/tex/wood_base.jpg'), woodNormal = woodTex('/tex/wood_normal.jpg', false), woodRough = woodTex('/tex/wood_rough.jpg', false);

  const OFFICE_Z = -120;
  const groundMat = matte(0x172033);

  // ── Бизнес-центр ────────────────────────────────────────────────────────────
  const gBuild = new THREE.Group(); scene.add(gBuild);
  { const fl = new THREE.Mesh(new THREE.CircleGeometry(40, 48), groundMat.clone()); fl.rotation.x = -Math.PI / 2; gBuild.add(fl); }
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
    gBuild.add(tower(9, 9, 32, -8, facadeA));
    gBuild.add(tower(10, 10, 38, 7.5, facadeB));
    const podium = box(34, 3, 18, matte(0xeef1f6), 0.15); podium.position.y = 1.5; gBuild.add(podium);
    for (let i = -7; i <= 7; i++) { const coln = box(0.5, 3, 0.5, matte(0xe2e7ee)); coln.position.set(i * 2.2, 1.5, 9); gBuild.add(coln); }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 4, 10), metal()); mast.position.set(7.5, 40, 0); gBuild.add(mast);
    beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), emis(0xff4040, 1.2)); beacon.position.set(7.5, 42.2, 0); gBuild.add(beacon);
  })();

  // ── Офис ────────────────────────────────────────────────────────────────────
  const gOffice = new THREE.Group(); gOffice.position.z = OFFICE_Z; scene.add(gOffice);
  (() => {
    const woodMat = new THREE.MeshStandardMaterial({ map: woodBase, normalMap: woodNormal, roughnessMap: woodRough, roughness: 0.9, metalness: 0.05 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), woodMat); floor.rotation.x = -Math.PI / 2; gOffice.add(floor);
    const wall = box(44, 22, 0.4, matte(0x26324c)); wall.position.set(0, 11, -12); gOffice.add(wall);
    const win = box(28, 12, 0.2, emis(0x6f9bff, 0.22)); win.position.set(0, 11, -11.7); gOffice.add(win);
    for (let i = 0; i < 12; i++) { const h = 3 + Math.random() * 7; const c = box(1.5, h, 1, matte(0x2c3a5c)); c.position.set(-13 + i * 2.4, 4 + h / 2 - 1, -13.2); gOffice.add(c); }
    for (const dx of [-9, 0, 9]) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 14), emis(COL.gold, 0.7)); lamp.position.set(dx, 17, -3); gOffice.add(lamp); }
  })();

  // Центральная цифровая доска (без информации — просто доска)
  (() => {
    const frame = box(18, 10, 0.4, metal(0xe2e6ec), 0.2); frame.position.set(0, 9.5, -0.7); gOffice.add(frame);
    // мягкий ореол позади панели (чуть больше, низкая яркость)
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(17.6, 9.6),
      new THREE.MeshBasicMaterial({ color: 0x4f86e8, transparent: true, opacity: 0.35 })
    );
    glow.position.set(0, 9.5, -0.45); gOffice.add(glow);
    // сама панель доски — заметно впереди рамки/ореола, без совпадения по Z
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 9),
      new THREE.MeshStandardMaterial({ color: 0x2a3d6e, emissive: 0x274a8c, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0 })
    );
    panel.position.set(0, 9.5, -0.25); gOffice.add(panel);
    for (const dx of [-7, 7]) { const leg = box(0.4, 9, 0.4, metal(0xb9c0cc)); leg.position.set(dx, 4.5, -0.85); gOffice.add(leg); }
    const footBar = box(16, 0.4, 1.2, metal(0xcfd5de)); footBar.position.set(0, 0.4, -0.85); gOffice.add(footBar);
  })();

  // ── GLB ──────────────────────────────────────────────────────────────────────
  function placeProp(src, name, h, pos, rotY, target) {
    const node = src.getObjectByName(name); if (!node) return;
    node.updateWorldMatrix(true, false);
    const clone = node.clone(true);
    clone.position.set(0, 0, 0); clone.quaternion.identity(); clone.scale.set(1, 1, 1);
    clone.applyMatrix4(node.matrixWorld);
    const holder = new THREE.Group(); holder.add(clone);
    const bb = new THREE.Box3().setFromObject(holder);
    const size = new THREE.Vector3(); bb.getSize(size); const ctr = new THREE.Vector3(); bb.getCenter(ctr);
    clone.position.x -= ctr.x; clone.position.z -= ctr.z; clone.position.y -= bb.min.y;
    holder.scale.setScalar(h / (size.y || 1)); holder.position.copy(pos); holder.rotation.y = rotY;
    target.add(holder);
  }
  const loader = new GLTFLoader(), V = THREE.MathUtils.degToRad;
  loader.load('/workstation.glb', (g) => {
    const src = g.scene; src.updateMatrixWorld(true);
    [[-9, 6, 0], [9, 6, 0], [-9, -4, 0], [9, -4, 0]].forEach(([x, z, r]) => placeProp(src, 'RootNode', 4.6, new THREE.Vector3(x, 0.05, z), V(r), gOffice));
  }, undefined, (e) => console.warn('workstation.glb:', e?.message || e));
  loader.load('/office_props.glb', (g) => {
    const src = g.scene; src.updateMatrixWorld(true);
    placeProp(src, 'Shelves1', 8, new THREE.Vector3(-17, 0, 1), V(90), gOffice);
    placeProp(src, 'Drawers', 4.5, new THREE.Vector3(16, 0, 2), V(-90), gOffice);
    placeProp(src, 'Plant', 3.4, new THREE.Vector3(13, 0, 7), 0, gOffice);
  }, undefined, (e) => console.warn('office_props.glb:', e?.message || e));

  // ── Облака (заполняют пространство после зданий) ────────────────────────────
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sxx = sc.getContext('2d');
  const rg = sxx.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  sxx.fillStyle = rg; sxx.fillRect(0, 0, 128, 128);
  const smokeTex = new THREE.CanvasTexture(sc);
  const cloudMat = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.6, depthWrite: false });
  const clouds = [];
  [-18, -38, -58].forEach((gz) => {
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(cloudMat); const ss = 60 + Math.random() * 70; s.scale.set(ss, ss, 1);
      s.position.set((Math.random() - 0.5) * 54, 8 + (Math.random() - 0.5) * 28, gz + (Math.random() - 0.5) * 30);
      s.userData.sp = 0.2 + Math.random() * 0.5; s.userData.ph = Math.random() * 6.28; clouds.push(s); scene.add(s);
    }
  });

  // ── Камера ───────────────────────────────────────────────────────────────────
  const KF = [
    [0.00, 46, 5, 22], [0.08, 16, 4.5, 26],   // подлёт к зданиям (hero)
    [0.15, -30, 9, 9],                          // короткий проход сквозь облака
    [0.22, -94, 8, 8],                          // офис начинается (секция «Системы…»)
    [0.90, -104, 8, 8],                         // медленно движемся вглубь офиса
    [1.00, -112.5, 8, 8],                       // подлёт к цифровой доске
  ];
  function frame(p) {
    let a = KF[0], b = KF[KF.length - 1];
    for (let i = 0; i < KF.length - 1; i++) { if (p >= KF[i][0] && p <= KF[i + 1][0]) { a = KF[i]; b = KF[i + 1]; break; } }
    const span = b[0] - a[0] || 1; let lp = (p - a[0]) / span; lp = lp * lp * (3 - 2 * lp);
    return { z: a[1] + (b[1] - a[1]) * lp, ey: a[2] + (b[2] - a[2]) * lp, ly: a[3] + (b[3] - a[3]) * lp };
  }

  let progress = 0, tx = 0, ty = 0, px = 0, py = 0;
  const onScroll = () => { const max = document.documentElement.scrollHeight - window.innerHeight; progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0; };
  const onPointer = (e) => { tx = (e.clientX / window.innerWidth - 0.5) * 2; ty = (e.clientY / window.innerHeight - 0.5) * 2; };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  if (!reduce) window.addEventListener('pointermove', onPointer, { passive: true });

  function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); resize();

  const clock = new THREE.Clock(); let last = 0, raf = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const t = clock.getElapsedTime(); const dt = Math.min(0.05, t - last); last = t;
    const dk = isDark();
    fog.color.setHex(dk ? 0x0f1626 : 0xdfe8f5);
    cloudMat.color.setHex(dk ? 0x223047 : 0xeef3fa); cloudMat.opacity = dk ? 0.5 : 0.6;
    const f = frame(progress);
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    camera.position.set(px * 2.2, f.ey - py * 1.3 + Math.sin(t * 0.4) * 0.1, f.z);
    camera.lookAt(px * 0.5, f.ly, f.z - 40);
    if (beacon) beacon.material.emissiveIntensity = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3));
    if (!reduce) clouds.forEach((c) => { c.position.x += Math.sin(t * c.userData.sp + c.userData.ph) * 0.012; c.position.y += Math.cos(t * c.userData.sp) * 0.006; });
    renderer.render(scene, camera);
  }
  loop();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll); window.removeEventListener('pointermove', onPointer); window.removeEventListener('resize', resize);
      smokeTex.dispose(); cloudMat.dispose();
      [facadeA, facadeB, woodBase, woodNormal, woodRough].forEach((x) => x.dispose());
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); } });
      pmrem.dispose(); renderer.dispose();
    },
  };
}

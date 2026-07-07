/* bakeEntry.js — пребейк пролёта 3D-сцены в кадры WebP (страница /bake.html).
   Открывается в dev/локально: ?theme=dark|light&w=720&h=1280. window.__bakeRun()
   гонит сцену по прогрессу 0…PMAX (N кадров), каждый кадр шлёт POST /api/bake/frame,
   в конце — манифест. Результат кладётся в client/public/bake/ (коммитится в репо).
   Телефонный рантайм (bakedScene.js) скраббит эти кадры вместо WebGL. */
import { initScene } from './site/Scene3D.js';
import { perf } from './site/perfProfile.js';

export const N_FRAMES = 48;
export const P_MAX = 0.64;   // прогресс сцены: главная скроллит 0.04→0.60, разделы стоят на 0.62

const q = new URLSearchParams(location.search);
const W = +q.get('w') || 720;
const H = +q.get('h') || 1280;
const THEME = q.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = THEME;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

// Качество бейка максимальное (оффлайн же): MSAA включён, lite выключен, всё «тяжёлое» на месте.
const inst = initScene(canvas, {
  perf: { ...perf, antialias: true, lite: false, lowPower: false, weakGpu: false, offthread: false },
  mobile: true,   // телефонная композиция кадра: без сдвига героя, портретный fit — как увидит телефон
  reduce: false, bake: true,
  theme: THEME, width: W, height: H, dpr: 1,
  onTier: () => {},
});

// Вывеска DDC на крыше — как на живом сайте.
const logo = new Image();
logo.onload = () => inst.setLogo(logo);
logo.src = '/logo_ddc.svg';

const raf = () => new Promise((r) => requestAnimationFrame(r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

window.__bakeRun = async () => {
  await wait(1200);   // текстуры/шейдеры/лого догрузились
  let sent = 0;
  for (let i = 0; i < N_FRAMES; i++) {
    const p = (i / (N_FRAMES - 1)) * P_MAX;
    inst.snap(p);
    for (let k = 0; k < 4; k++) await raf();   // сцена дорисовала кадр с новым p
    const dataUrl = canvas.toDataURL('image/webp', 0.82);
    const res = await fetch('/api/bake/frame', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: THEME, i, dataUrl }),
    });
    if (!res.ok) throw new Error('frame ' + i + ' → HTTP ' + res.status);
    sent++;
  }
  await fetch('/api/bake/manifest', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ v: 1, frames: N_FRAMES, pMax: P_MAX, w: W, h: H, theme: THEME }),
  });
  return `OK: ${THEME} — ${sent} кадров ${W}x${H}`;
};

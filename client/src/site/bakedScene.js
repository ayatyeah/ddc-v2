/* bakedScene.js — «апловский» фон для телефона: вместо WebGL скраббим по запечённым
   кадрам пролёта (client/public/bake/, см. bakeEntry.js). Телефон не грузит three.js
   вообще; рисование — canvas 2D drawImage ТОЛЬКО пока прогресс движется (скролл/переход),
   в покое — ноль работы, ноль нагрева. Между соседними кадрами — кроссфейд, поэтому
   48 кадров выглядят как непрерывный пролёт.
   API идентичен initScene (мост Background3D зовёт те же методы). */

export async function initBaked(canvas, env) {
  const mres = await fetch('/bake/manifest.json');
  if (!mres.ok) throw new Error('нет манифеста пребейка');
  const man = await mres.json();
  const N = man.frames | 0, PMAX = man.pMax || 0.64;
  if (!N || !(man.themes || []).length) throw new Error('пустой манифест пребейка');

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d недоступен');

  let theme = (man.themes.includes(env.theme) ? env.theme : man.themes[0]);
  let visible = true, raf = 0, disposed = false;
  let target = 0.06, disp = target, navUntil = -1, drawnKey = '';
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;

  // Кадры темы: лениво, лесенкой — сначала каждый 6-й (мгновенный охват всего пролёта),
  // затем остальные в простое. Пока точного кадра нет — рисуем ближайший загруженный.
  const sets = {};
  const setFor = (th) => sets[th] || (sets[th] = Array.from({ length: N }, () => ({ img: null, ok: false })));
  const load = (th, i) => {
    const s = setFor(th)[i];
    if (s.img) return;
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => { s.ok = true; if (th === theme) { drawnKey = ''; tick(); } };
    im.onerror = () => { s.img = null; };   // повторная попытка при следующем обращении
    im.src = `/bake/${th}/${String(i).padStart(2, '0')}.webp`;
    s.img = im;
  };
  const preload = (th) => {
    for (let i = 0; i < N; i += 6) load(th, i);
    let j = 0;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 150));
    const rest = () => {
      if (disposed) return;
      while (j < N && setFor(th)[j].img) j++;
      if (j < N) { load(th, j); idle(rest); }
    };
    idle(rest);
  };

  const nearest = (s, f) => {
    const c = Math.round(f);
    for (let d = 0; d < N; d++) {
      if (c - d >= 0 && s[c - d].ok) return c - d;
      if (c + d < N && s[c + d].ok) return c + d;
    }
    return -1;
  };
  const drawCover = (img, alpha) => {
    const cw = canvas.width, ch = canvas.height;
    const k = Math.max(cw / man.w, ch / man.h);
    const dw = man.w * k, dh = man.h * k;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  };
  const draw = () => {
    const s = setFor(theme);
    const f = Math.min(N - 1, Math.max(0, (disp / PMAX) * (N - 1)));
    const i0 = Math.floor(f), i1 = Math.min(N - 1, i0 + 1), a = f - i0;
    const base = s[i0].ok ? i0 : nearest(s, f);
    const key = theme + ':' + base + ':' + (a * 64 | 0) + ':' + canvas.width;
    if (base < 0 || key === drawnKey) return;   // нечего рисовать / кадр не изменился
    drawnKey = key;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCover(s[base].img, 1);
    if (base === i0 && i1 !== i0 && a > 0.02 && s[i1].ok) drawCover(s[i1].img, a);
    ctx.globalAlpha = 1;
  };
  // Цикл живёт только пока прогресс доезжает до цели; дальше засыпаем до следующего tick().
  const step = () => {
    raf = 0;
    if (disposed || !visible) return;
    const k = now() < navUntil ? 0.036 : 0.1;   // ≈ живой сцене (exp-сглаживание на 60 fps)
    disp += (target - disp) * k;
    if (Math.abs(target - disp) < 0.0005) disp = target;
    draw();
    if (disp !== target) raf = requestAnimationFrame(step);
  };
  const tick = () => { if (!raf && visible && !disposed) raf = requestAnimationFrame(step); };

  const resize = (w, h, dpr) => {
    // 2D-канвасу высокий DPR не нужен: кадры 720px шириной, тянуть буфер выше — пустой блит.
    const d = Math.min(dpr || 1, 2);
    canvas.width = Math.max(2, Math.round(w * d));
    canvas.height = Math.max(2, Math.round(h * d));
    drawnKey = '';
    tick();
  };
  resize(env.width, env.height, env.dpr);
  preload(theme);

  return {
    setTarget(p) { target = Math.min(1, Math.max(0, p)); tick(); },
    navEase() { navUntil = now() + 1.1; tick(); },
    setTheme(th) {
      if (!man.themes.includes(th) || th === theme) return;
      theme = th; drawnKey = ''; preload(theme); tick();
    },
    setHeroBias() {}, setYaw() {}, setPage() {}, setLogo() {},
    pointerDown() {}, pointerMove() {}, pointerUp() {},
    setVisible(v) { visible = !!v; if (visible) { drawnKey = ''; tick(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    resize,
    dispose() { disposed = true; if (raf) cancelAnimationFrame(raf); },
  };
}

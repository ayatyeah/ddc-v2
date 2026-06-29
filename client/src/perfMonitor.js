/* perfMonitor.js — лёгкий монитор фризов фона.
   Меряет длительность каждого кадра на главном потоке (rAF). Любой «долгий» кадр
   (фриз) пишет событие с контекстом: страница, scrollY, ПРОГРЕСС 3D-сцены (0..1) и
   текущий адаптивный DPR — чтобы понять, в каком моменте фона рвётся плавность.
   Данные смотрим в админке (вкладка «Перф»). Работает на всём сайте (а не только
   в админке), потому что фризы случаются именно на страницах с 3D-фоном. */

const FREEZE_MS = 50;      // кадр дольше этого = фриз (≈ <20 fps на этом кадре)
const GAP_MS = 1000;       // больше этого — не фриз, а пауза вкладки (rAF замирает) → игнор
const MAX_EVENTS = 600;    // кольцевой буфер
const LS_KEY = 'ddc_perf_log';
const FLUSH_MS = 2500;     // localStorage пишем не на каждый фриз (он синхронный)

const state = {
  startedAt: Math.round(performance.now()),
  bootAt: Date.now(),
  events: [],              // { t, dt, path, scrollY, prog, dpr }
  frames: 0,
  longFrames: 0,
  worst: 0,
  fps: 0,
  recording: true,
  device: (() => {
    try { return `${window.innerWidth}×${window.innerHeight} · dpr ${window.devicePixelRatio || 1} · ${document.documentElement.dataset.engine || '?'}`; }
    catch { return '?'; }
  })(),
};

// восстановим прошлый лог (если страница перезагружалась)
try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  if (saved && Array.isArray(saved.events)) state.events = saved.events.slice(-MAX_EVENTS);
} catch { /* нет данных */ }

let last = performance.now();
let fpsAcc = 0, fpsN = 0, fpsT = last, lastFlush = last, dirty = false;

function flush() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ events: state.events.slice(-MAX_EVENTS), savedAt: Date.now() })); } catch { /* quota */ }
  dirty = false;
}

function tick(now) {
  const dt = now - last; last = now;
  if (state.recording && dt > 0 && dt < GAP_MS) {
    state.frames++;
    fpsAcc += dt; fpsN++;
    if (now - fpsT > 500 && fpsN) { state.fps = Math.round(1000 / (fpsAcc / fpsN)); fpsAcc = 0; fpsN = 0; fpsT = now; }
    if (dt >= FREEZE_MS) {
      state.longFrames++;
      if (dt > state.worst) state.worst = dt;
      state.events.push({
        t: Math.round(now - state.startedAt),
        dt: Math.round(dt),
        path: location.pathname,
        scrollY: Math.round(window.scrollY || 0),
        prog: typeof window.__sceneProgress === 'number' ? Math.round(window.__sceneProgress * 100) / 100 : null,
        dpr: typeof window.__sceneDpr === 'number' ? Math.round(window.__sceneDpr * 100) / 100 : null,
      });
      if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
      dirty = true;
    }
  }
  if (dirty && now - lastFlush > FLUSH_MS) { flush(); lastFlush = now; }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.addEventListener('pagehide', () => { if (dirty) flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) flush(); });

export const perfMon = {
  get: () => state,
  freezeMs: FREEZE_MS,
  clear() {
    state.events = []; state.frames = 0; state.longFrames = 0; state.worst = 0;
    state.startedAt = Math.round(performance.now()); state.bootAt = Date.now();
    flush();
  },
  setRecording(v) { state.recording = !!v; },
};
window.__perfMon = perfMon;

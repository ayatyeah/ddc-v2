/* scene.worker.js — рендер 3D-сцены (Scene3D) в Web Worker через OffscreenCanvas.
   Идея: тот же initScene запускается ЗДЕСЬ, а не в главном потоке → скролл/UI не
   блокируются рендером (нет лагов), и можно держать высокий DPR (без «мыла»).
   Scene3D использует window/document/Image — подкладываем лёгкие шимы, чтобы код
   работал без изменений. Главный поток форвардит события (resize/pointer/visibility). */

// В воркере нет requestAnimationFrame (в старых движках) — полифилл через setTimeout.
if (typeof self.requestAnimationFrame !== 'function') {
  self.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
  self.cancelAnimationFrame = (id) => clearTimeout(id);
}

const env = { w: 1, h: 1, dpr: 1, mobile: false, reduce: false, screenH: 0, hidden: false };
const winH = {};   // обработчики window-событий (resize/pointer*)
const docH = {};   // обработчики document-событий (visibilitychange)
const fire = (map, type, ev) => { (map[type] || []).slice().forEach((fn) => { try { fn(ev); } catch {} }); };

function installShims() {
  self.window = {
    get innerWidth() { return env.w; },
    get innerHeight() { return env.h; },
    get devicePixelRatio() { return env.dpr; },
    get screen() { return { height: env.screenH }; },
    matchMedia(q) {
      const m = /max-width/.test(q) ? env.mobile : /prefers-reduced-motion/.test(q) ? env.reduce : false;
      return { matches: m, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
    },
    addEventListener(type, fn) { (winH[type] = winH[type] || []).push(fn); },
    removeEventListener(type, fn) { const a = winH[type]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    requestAnimationFrame: (fn) => self.requestAnimationFrame(fn),
    cancelAnimationFrame: (id) => self.cancelAnimationFrame(id),
  };
  self.document = {
    createElement(tag) { return tag === 'canvas' ? new OffscreenCanvas(1, 1) : {}; },
    addEventListener(type, fn) { (docH[type] = docH[type] || []).push(fn); },
    removeEventListener(type, fn) { const a = docH[type]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    get hidden() { return env.hidden; },
    documentElement: { dataset: {}, style: {} },
  };
  // Логотип: в воркере грузим через fetch + createImageBitmap, отдаём как __bitmap.
  self.Image = class {
    constructor() { this.onload = null; this.onerror = null; this.__bitmap = null; }
    set src(url) {
      fetch(url).then((r) => r.blob()).then((b) => createImageBitmap(b))
        .then((bmp) => { this.__bitmap = bmp; if (this.onload) this.onload(); })
        .catch(() => { if (this.onerror) this.onerror(); });
    }
  };
}

let inst = null;

self.onmessage = async (e) => {
  const d = e.data || {};
  if (d.type === 'init') {
    env.w = d.w; env.h = d.h; env.dpr = d.dpr; env.mobile = d.mobile; env.reduce = d.reduce; env.screenH = d.screenH;
    installShims();
    try { d.canvas.style = {}; } catch {}   // Three.setSize(updateStyle) не должен падать на OffscreenCanvas
    try {
      const [{ initScene }, { perf }] = await Promise.all([import('./Scene3D.js'), import('./perfProfile.js')]);
      perf.offthread = true;                                   // не снижать DPR/качество — поток свободен
      if (env.mobile) perf.dprCap = Math.min(env.dpr, 2.0);    // держим чёткость на телефоне
      inst = initScene(d.canvas);
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', msg: String(err && err.message || err) });
    }
    return;
  }
  if (d.type === 'event') {
    if (d.ev === 'resize') { env.w = d.w; env.h = d.h; env.dpr = d.dpr; fire(winH, 'resize', {}); }
    else if (d.ev === 'visibility') { env.hidden = d.hidden; fire(docH, 'visibilitychange', {}); }
    else { fire(winH, d.ev, { clientX: d.clientX, clientY: d.clientY }); }   // pointer*
    return;
  }
  if (d.type === 'call' && inst) { try { inst[d.fn] && inst[d.fn](d.arg); } catch {} return; }
  if (d.type === 'dispose' && inst) { try { inst.dispose && inst.dispose(); } catch {} inst = null; }
};

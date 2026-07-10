/* scene.worker.js — рендер 3D-фона (Scene3D) в Web Worker через OffscreenCanvas.
   Главный поток свободен от three.js: скролл и тапы остаются плавными, даже когда сцена
   нагружает GPU. Мост (Background3D.jsx) передаёт сюда канвас + снимок окружения (env)
   и дальше шлёт команды вида { type: '<метод сцены>', a: [аргументы] } — диспетчер ниже
   вызывает одноимённый метод инстанса. Обратно уходят { type:'tier' } (perf-ступень для
   <html data-perf-tier>) и { type:'error' } (мост пересоздаст сцену на главном потоке). */
import { initScene } from './Scene3D.js';

// requestAnimationFrame внутри воркера есть в Chromium, но НЕ в Safari и Firefox — а именно
// там (iOS) сцена и идёт через OffscreenCanvas. Прежняя страховка на setTimeout(16) не привязана
// к развёртке экрана: 16 мс бьются с 16.7 мс, кадры то дублируются, то теряются — на глаз это
// рывки при формально нормальном FPS. Поэтому просим такты у главного потока: там rAF настоящий,
// а сообщение туда-обратно стоит доли миллисекунды. Аргумент времени не используется сценой
// (она берёт своё время из THREE.Clock), так что смешения таймлайнов не возникает.
if (typeof self.requestAnimationFrame !== 'function') {
  let seq = 0;
  const pending = new Map();
  self.requestAnimationFrame = (cb) => { const id = ++seq; pending.set(id, cb); self.postMessage({ type: 'raf' }); return id; };
  self.cancelAnimationFrame = (id) => { pending.delete(id); };
  self.__vsync = (t) => {
    if (!pending.size) return;
    const due = Array.from(pending.values());
    pending.clear();
    for (const cb of due) cb(t);
  };
}

let scene = null;
self.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === 'init') {
    try {
      scene = initScene(m.canvas, { ...m.env, onTier: (t) => self.postMessage({ type: 'tier', tier: t }) });
    } catch (err) {
      // Нет WebGL в воркере и т.п. — сообщаем мосту (он поднимет сцену на главном потоке) и закрываемся.
      try { self.postMessage({ type: 'error', message: String((err && err.message) || err) }); } catch { /* канал закрыт */ }
      self.close();
    }
    return;
  }
  if (m.type === 'vsync') { self.__vsync?.(m.t); return; }   // такт развёртки от главного потока
  if (!scene) return;
  if (m.type === 'dispose') { try { scene.dispose(); } catch { /* уже мёртв */ } scene = null; self.close(); return; }
  const fn = scene[m.type];
  if (typeof fn === 'function') fn.apply(scene, m.a || []);
};

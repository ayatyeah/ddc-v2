/* scene.worker.js — рендер 3D-фона (Scene3D) в Web Worker через OffscreenCanvas.
   Главный поток свободен от three.js: скролл и тапы остаются плавными, даже когда сцена
   нагружает GPU. Мост (Background3D.jsx) передаёт сюда канвас + снимок окружения (env)
   и дальше шлёт команды вида { type: '<метод сцены>', a: [аргументы] } — диспетчер ниже
   вызывает одноимённый метод инстанса. Обратно уходят { type:'tier' } (perf-ступень для
   <html data-perf-tier>) и { type:'error' } (мост пересоздаст сцену на главном потоке). */
import { initScene } from './Scene3D.js';

// Страховка для сред без requestAnimationFrame в воркере (очень старые браузеры).
if (typeof self.requestAnimationFrame !== 'function') {
  self.requestAnimationFrame = (cb) => self.setTimeout(() => cb(self.performance.now()), 16);
  self.cancelAnimationFrame = (id) => self.clearTimeout(id);
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
  if (!scene) return;
  if (m.type === 'dispose') { try { scene.dispose(); } catch { /* уже мёртв */ } scene = null; self.close(); return; }
  const fn = scene[m.type];
  if (typeof fn === 'function') fn.apply(scene, m.a || []);
};

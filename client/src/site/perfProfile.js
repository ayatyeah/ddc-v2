/* perfProfile.js — единый профиль производительности фона.
   Определяет браузерный движок и возможности устройства ОДИН раз, ставит
   <html data-engine="…"> (для per-engine правил в CSS) и отдаёт флаги для 3D-сцены.

   Зачем per-engine: Firefox (gecko) ощутимо тяжелее тянет backdrop-filter и
   большой CSS-blur, чем Chrome/Edge (blink). Поэтому ему даём «спокойный» профиль
   (ниже DPR, без MSAA, мягче размытия). Поверх этого в сцене работает адаптивный
   DPR — он ловит реальные просадки FPS независимо от движка. */

function detectEngine() {
  try {
    const ua = navigator.userAgent || '';
    if (/firefox|fxios/i.test(ua)) return 'gecko';
    // Safari = WebKit, но НЕ Chrome/Chromium/Edge/Opera/прочие
    if (/safari/i.test(ua) && !/chrome|chromium|crios|edg|opr|samsungbrowser/i.test(ua)) return 'webkit';
    return 'blink';
  } catch { return 'blink'; }
}

const engine = detectEngine();

let lowPower = false;
try {
  lowPower = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || (navigator.hardwareConcurrency || 8) <= 4
    || (navigator.deviceMemory || 8) <= 4;
} catch { /* старый браузер — оставляем дефолт */ }

// Потолок разрешения рендера WebGL и MSAA по движку/устройству.
const dprCap = lowPower ? 1.25 : engine === 'gecko' ? 1.5 : 1.75;
const antialias = !(lowPower || engine === 'gecko');

// Метка движка на <html> — её используют per-engine правила в styles.css
try { document.documentElement.dataset.engine = engine; } catch { /* SSR/edge */ }

export const perf = { engine, lowPower, dprCap, antialias };

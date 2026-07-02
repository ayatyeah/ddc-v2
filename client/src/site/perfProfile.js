/* perfProfile.js — единый профиль производительности фона.
   Определяет браузер + движок и возможности устройства ОДИН раз, ставит
   <html data-engine="…" data-browser="…"> (для правил в CSS) и отдаёт флаги для сцены.

   Движки:
   • blink  — Chrome, Edge, Yandex, Opera, Samsung Internet (полный профиль: best качество)
   • gecko  — Firefox (спокойный профиль: ниже DPR, без MSAA, мягче backdrop-blur)
   • webkit — Safari и ВСЕ браузеры на iOS (там движок всегда WebKit)
   Поверх этого в сцене работает адаптивный DPR — он ловит реальные просадки FPS. */

function detect() {
  let engine = 'blink', browser = 'chrome';
  try {
    const ua = navigator.userAgent || '';
    const iOS = /iphone|ipad|ipod/i.test(ua) || /crios|fxios|edgios/i.test(ua);
    if (iOS) {
      engine = 'webkit';
      browser = /crios/i.test(ua) ? 'chrome' : /fxios/i.test(ua) ? 'firefox' : /edgios/i.test(ua) ? 'edge' : 'safari';
    } else if (/firefox/i.test(ua)) { engine = 'gecko'; browser = 'firefox'; }
    else if (/edg/i.test(ua)) { engine = 'blink'; browser = 'edge'; }            // Edge (Chromium)
    else if (/yabrowser/i.test(ua)) { engine = 'blink'; browser = 'yandex'; }    // Yandex Browser
    else if (/opr|opera/i.test(ua)) { engine = 'blink'; browser = 'opera'; }
    else if (/samsungbrowser/i.test(ua)) { engine = 'blink'; browser = 'samsung'; }
    else if (/chrome|chromium/i.test(ua)) { engine = 'blink'; browser = 'chrome'; }
    else if (/safari/i.test(ua)) { engine = 'webkit'; browser = 'safari'; }
  } catch { /* оставляем дефолт blink/chrome */ }
  return { engine, browser };
}

const { engine, browser } = detect();

let lowPower = false;
try {
  lowPower = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || (navigator.hardwareConcurrency || 8) <= 4
    || (navigator.deviceMemory || 8) <= 4;
} catch { /* старый браузер — оставляем дефолт */ }

// Телефон/планшет: узкий экран или мобильный UA. На таких физический DPR часто 2.5–3×,
// а fill-rate GPU слабый → рендер в полный DPR = главный источник фризов при скролле 3D-сцены.
let mobile = false;
try {
  mobile = window.matchMedia('(max-width: 820px)').matches
    || /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
} catch { /* оставляем дефолт desktop */ }

// Потолок разрешения рендера WebGL и MSAA по движку/устройству.
// blink/webkit — полное качество; gecko (Firefox) — ниже ради стабильного FPS; телефон —
// заметно ниже (меньше пикселей = глаже скролл); слабые устройства — ещё ниже. Поверх
// этого адаптивный DPR в сцене ещё опускает качество при реальных просадках FPS.
const dprCap = lowPower ? 1.1 : mobile ? 1.35 : engine === 'gecko' ? 1.3 : 1.75;
const antialias = !(lowPower || mobile || engine === 'gecko');

// Метки на <html> — их используют per-engine/per-browser правила в styles.css
try {
  document.documentElement.dataset.engine = engine;
  document.documentElement.dataset.browser = browser;
} catch { /* SSR/edge */ }

// offthread выставляется в true из scene.worker.js (рендер в Web Worker): в этом режиме
// сцена не снижает DPR/качество под fps — главный поток свободен, скролл плавный.
export const perf = { engine, browser, lowPower, dprCap, antialias, offthread: false };

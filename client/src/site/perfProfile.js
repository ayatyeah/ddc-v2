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

// Реальный GPU (WEBGL_debug_renderer_info): эвристика по CPU/памяти НЕ ловит слабую
// встроенную графику (Intel HD/UHD, старые Mali/Adreno, софт-рендер) — а тормозит именно фон.
// Прямой сигнал о видеокарте позволяет заранее снять эффекты, не снижая разрешение (без мыла).
let gpu = '', weakGpu = false, softwareGpu = false;
try {
  const cv = document.createElement('canvas');
  const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    const g = gpu.toLowerCase();
    softwareGpu = /swiftshader|llvmpipe|software|microsoft basic|mesa offscreen/.test(g);
    weakGpu = softwareGpu
      || /intel.*(hd graphics|uhd graphics)/.test(g)     // старые/базовые интеграшки Intel (HD/UHD)
      || /gma|mobile intel/.test(g)
      || /mali-4|mali-t[0-6]|mali-g3[01]/.test(g)         // слабые Mali
      || /adreno \(?[1-4]\d\d/.test(g)                    // Adreno 1xx–4xx
      || /powervr/.test(g);
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
  }
} catch { /* нет WebGL/расширения — оставляем дефолт (не слабый) */ }

// «Лёгкий» режим: слабое устройство ИЛИ слабый GPU ИЛИ просьба о пониженной анимации.
// В нём фон-эффекты (PCB/туман/HUD/параллакс мыши) не рисуются — но РАЗРЕШЕНИЕ НЕ РЕЖЕМ.
const lite = lowPower || weakGpu;

// Потолок разрешения рендера. Крипко везде (без «мыла»): рендерим в разрешение устройства
// вплоть до 2×. Нагрузку на слабых снимаем НЕ понижением DPR (это и есть мыло), а отключением
// эффектов + упрощением геометрии + паузой вне фокуса. Адаптивное понижение DPR в сцене выключено.
const dprCap = engine === 'gecko' ? 1.75 : 2.0;
const antialias = !(mobile || engine === 'gecko' || lite);   // MSAA — только на мощных non-Firefox

// Метки на <html> — их используют per-engine/per-browser правила в styles.css
try {
  document.documentElement.dataset.engine = engine;
  document.documentElement.dataset.browser = browser;
  if (lite) document.documentElement.dataset.perf = 'lite';
} catch { /* SSR/edge */ }

// offthread выставляет мост (Background3D.jsx), когда сцена рендерится в Web Worker через
// OffscreenCanvas: three.js уходит с главного потока, скролл плавный даже под GPU-нагрузкой.
// Здесь всегда false — это дефолт для снимка env.perf, который мост передаёт сцене.
export const perf = { engine, browser, lowPower, weakGpu, softwareGpu, lite, mobile, gpu, dprCap, antialias, offthread: false };

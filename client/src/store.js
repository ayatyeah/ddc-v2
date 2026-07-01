/* Минималистичное глобальное состояние без внешних библиотек.
   Хранит язык (ru/kk/en) и тему (dark/light), синхронизирует с localStorage,
   <html lang> и <html data-theme>. Тема действует на весь сайт, портал и админку. */
import { useSyncExternalStore } from 'react';

const LANGS = ['ru', 'kk', 'en'];
const THEMES = ['dark', 'light'];

function read(key, fallback, allowed) {
  try {
    const v = localStorage.getItem(key);
    if (v && (!allowed || allowed.includes(v))) return v;
  } catch {}
  return fallback;
}

let state = {
  lang: read('ddc_lang', 'ru', LANGS),
  a11y: read('ddc_a11y', 'off', ['on', 'off']),   // версия для слабовидящих
  theme: read('ddc_theme', 'dark', THEMES),        // тема оформления (весь сайт/портал/админка)
};

const listeners = new Set();
function emit() { listeners.forEach((l) => l()); }
function subscribe(l) { listeners.add(l); return () => listeners.delete(l); }
function snapshot() { return state; }

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === state.lang) return;
  state = { ...state, lang };
  try { localStorage.setItem('ddc_lang', lang); } catch {}
  document.documentElement.lang = lang;
  emit();
}

// Тема оформления: dark/light. Держим в <html data-theme> — токены во всех CSS
// (styles.css, admin.css, portal.css) переключаются автоматически.
export function setTheme(theme) {
  if (!THEMES.includes(theme) || theme === state.theme) return;
  state = { ...state, theme };
  try { localStorage.setItem('ddc_theme', theme); } catch {}
  document.documentElement.setAttribute('data-theme', theme);
  emit();
}
export function toggleTheme() { setTheme(state.theme === 'dark' ? 'light' : 'dark'); }

// Версия для слабовидящих: крупный шрифт, высокий контраст, без 3D/анимаций.
// Состояние держим в <html data-a11y> — стили подхватываются из CSS.
export function setA11y(on) {
  const v = on ? 'on' : 'off';
  if (state.a11y === v) return;
  state = { ...state, a11y: v };
  try { localStorage.setItem('ddc_a11y', v); } catch {}
  document.documentElement.setAttribute('data-a11y', v);
  emit();
}

// Применяем сразу при загрузке модуля: язык + выбранная тема + режим a11y.
document.documentElement.lang = state.lang;
document.documentElement.setAttribute('data-theme', state.theme);
document.documentElement.setAttribute('data-a11y', state.a11y);

export function useStore() { return useSyncExternalStore(subscribe, snapshot); }
export function useLang() { return useStore().lang; }
export function useA11y() { return useStore().a11y === 'on'; }
export function useTheme() { return useStore().theme; }
export { LANGS, THEMES };

/* Минималистичное глобальное состояние без внешних библиотек.
   Хранит язык (ru/kk/en), синхронизирует с localStorage и <html lang>.
   Тема всегда тёмная (data-theme="dark" выставляется один раз) — переключения нет. */
import { useSyncExternalStore } from 'react';

const LANGS = ['ru', 'kk', 'en'];

function read(key, fallback, allowed) {
  try {
    const v = localStorage.getItem(key);
    if (v && (!allowed || allowed.includes(v))) return v;
  } catch {}
  return fallback;
}

let state = {
  lang: read('ddc_lang', 'ru', LANGS),
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

// Применяем сразу при загрузке модуля: язык + фиксированная тёмная тема.
document.documentElement.lang = state.lang;
document.documentElement.setAttribute('data-theme', 'dark');

export function useStore() { return useSyncExternalStore(subscribe, snapshot); }
export function useLang() { return useStore().lang; }
export { LANGS };

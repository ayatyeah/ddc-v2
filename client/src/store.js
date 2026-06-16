/* Минималистичное глобальное состояние без внешних библиотек.
   Хранит язык (ru/kk/en) и тему (light/dark), синхронизирует с localStorage
   и <html data-theme lang>. Компоненты подписываются через хуки useLang/useTheme. */
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
  theme: 'dark',
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

export function setTheme() {
  // Тема зафиксирована: только тёмная (строгая изумрудная).
  state = { ...state, theme: 'dark' };
  document.documentElement.setAttribute('data-theme', 'dark');
  emit();
}

export function toggleTheme() { /* тема зафиксирована тёмной */ }

// Применяем сохранённые значения к <html> сразу при загрузке модуля.
document.documentElement.lang = state.lang;
document.documentElement.setAttribute('data-theme', 'dark');

export function useStore() { return useSyncExternalStore(subscribe, snapshot); }
export function useLang() { return useStore().lang; }
export function useTheme() { return useStore().theme; }
export { LANGS };

import { useTheme, toggleTheme } from './store.js';

// Переключатель темы (dark/light) — общий для сайта, портала и админки.
// className задаёт хозяин (кнопка в навбаре / рейле / футере портала).
export default function ThemeToggle({ className = '', size = 20 }) {
  const theme = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Светлая тема' : 'Тёмная тема';
  return (
    <button type="button" className={className} onClick={toggleTheme}
      aria-label={label} title={label} aria-pressed={!dark}>
      {dark ? (
        // солнце — переключить на светлую
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // луна — переключить на тёмную
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

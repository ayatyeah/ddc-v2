import { useEffect, useState } from 'react';
import { useLang, setLang, LANGS } from '../store.js';
import { t } from '../i18n.js';
import { useRoute, navigate } from './router.js';

const LINKS = [
  { to: '/', k: 'nav.home' },
  { to: '/uslugi', k: 'nav.services' },
  { to: '/o-nas', k: 'nav.about' },
  { to: '/kontakty', k: 'nav.contacts' },
];

export default function Nav() {
  const lang = useLang();
  const path = useRoute();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [path]);

  const go = (to) => (e) => { e.preventDefault(); setOpen(false); navigate(to); };

  return (
    <nav className="nav" aria-label="Основная навигация">
      <div className="wrap">
        <div className="nav-island">
          <div className={`nav-links ${open ? 'open' : ''}`} id="nav-menu">
            {LINKS.map((l) => (
              <a key={l.to} href={l.to} onClick={go(l.to)}
                className={path === l.to ? 'active' : ''}
                aria-current={path === l.to ? 'page' : undefined}>
                {t(lang, l.k)}
              </a>
            ))}
          </div>
          <div className="lang" role="group" aria-label="Язык / Тіл / Language">
            {LANGS.map((l) => (
              <button key={l} className={l === lang ? 'active' : ''} onClick={() => setLang(l)}
                aria-pressed={l === lang} aria-label={l === 'kk' ? 'Қазақша' : l === 'ru' ? 'Русский' : 'English'}>
                {l === 'kk' ? 'KZ' : l.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="icon-btn nav-burger" onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Закрыть меню' : 'Меню'} aria-expanded={open} aria-controls="nav-menu">
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d={open ? 'M6 6l12 12M18 6l-12 12' : 'M3 6h18M3 12h18M3 18h18'} />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}

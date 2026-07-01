import { useEffect, useState } from 'react';
import { useLang, setLang, LANGS, useA11y, setA11y } from '../store.js';
import { t } from '../i18n.js';
import { useRoute, navigate } from './router.js';
import { IcoEye } from './icons.jsx';

// Простой навбар: только названия разделов (максимум 7 страниц сайта).
const LINKS = [
  { to: '/', k: 'nav.home' },
  { to: '/uslugi', k: 'nav.services' },
  { to: '/proekty', k: 'nav.projects' },
  { to: '/o-nas', k: 'nav.about' },
  { to: '/karera', k: 'nav.careers' },
  { to: '/partners', k: 'nav.partners' },
  { to: '/kontakty', k: 'nav.contacts' },
];

export default function Nav() {
  const lang = useLang();
  const a11y = useA11y();
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
          <a className="nav-portal-btn" href="/portal" data-spa onClick={() => setOpen(false)}>
            {t(lang, 'portal.enter')}
          </a>
          <div className="lang" role="group" aria-label="Язык / Тіл / Language">
            {LANGS.map((l) => (
              <button key={l} className={l === lang ? 'active' : ''} onClick={() => setLang(l)}
                aria-pressed={l === lang} aria-label={l === 'kk' ? 'Қазақша' : l === 'ru' ? 'Русский' : 'English'}>
                {l === 'kk' ? 'KZ' : l.toUpperCase()}
              </button>
            ))}
          </div>
          <button className={`icon-btn a11y-btn ${a11y ? 'active' : ''}`} onClick={() => setA11y(!a11y)}
            aria-pressed={a11y} title={t(lang, 'a11y.toggle')} aria-label={t(lang, 'a11y.toggle')}>
            <IcoEye size={20} />
          </button>
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

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
    <nav className="nav">
      <div className="wrap">
        <div className="nav-island">
          <div className={`nav-links ${open ? 'open' : ''}`}>
            {LINKS.map((l) => (
              <a key={l.to} href={l.to} onClick={go(l.to)} className={path === l.to ? 'active' : ''}>
                {t(lang, l.k)}
              </a>
            ))}
          </div>
          <div className="lang">
            {LANGS.map((l) => (
              <button key={l} className={l === lang ? 'active' : ''} onClick={() => setLang(l)}>
                {l === 'kk' ? 'KZ' : l.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="icon-btn nav-burger" onClick={() => setOpen((o) => !o)} aria-label="Меню">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}

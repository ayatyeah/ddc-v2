import { useEffect, useState } from 'react';
import { useLang, useTheme, setLang, toggleTheme, LANGS } from '../store.js';
import { t } from '../i18n.js';
import { IcoSun, IcoMoon } from './icons.jsx';

export default function Nav() {
  const lang = useLang();
  const theme = useTheme();
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cur = window.scrollY > 12; setSolid(cur);
    const onScroll = () => { const next = window.scrollY > 12; if (next !== cur) { cur = next; setSolid(next); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (id) => (e) => {
    e.preventDefault();
    setOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className={`nav ${solid ? 'solid' : ''}`}>
      <div className="wrap">
        <div className={`nav-links ${open ? 'open' : ''}`}>
          <a href="#services" onClick={go('services')}>{t(lang, 'nav.services')}</a>
          <a href="#about" onClick={go('about')}>{t(lang, 'nav.about')}</a>
          <a href="#news" onClick={go('news')}>{t(lang, 'nav.news')}</a>
          <a href="#contacts" onClick={go('contacts')}>{t(lang, 'nav.contacts')}</a>
        </div>
        <div className="nav-right">
          <div className="lang">
            {LANGS.map((l) => (
              <button key={l} className={l === lang ? 'active' : ''} onClick={() => setLang(l)}>
                {l === 'kk' ? 'KZ' : l.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={toggleTheme} aria-label="Тема">
            {theme === 'dark' ? <IcoMoon size={17} /> : <IcoSun size={17} />}
          </button>
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

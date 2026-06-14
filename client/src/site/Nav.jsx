import { useEffect, useState } from 'react';
import { useLang, useTheme, setLang, toggleTheme, LANGS } from '../store.js';
import { t } from '../i18n.js';
import { IcoSun, IcoMoon } from './icons.jsx';

const SECTIONS = ['services', 'about', 'news', 'contacts'];

export default function Nav() {
  const lang = useLang();
  const theme = useTheme();
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
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
        <a href="#top" className="brand" onClick={go('top')}>
          <img className="brand-logo" src="/ddc.png" alt="" /> DDC
        </a>
        <div className={`nav-links ${open ? 'open' : ''}`}>
          <a href="#services" onClick={go('services')}>{t(lang, 'nav.services')}</a>
          <a href="#about" onClick={go('about')}>{t(lang, 'nav.about')}</a>
          <a href="#news" onClick={go('news')}>{t(lang, 'nav.news')}</a>
          <a href="#contacts" onClick={go('contacts')}>{t(lang, 'nav.contacts')}</a>
        </div>
        <div className="nav-right">
          <span className="nav-phone">+7 727 258-49-58</span>
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

import { useEffect } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { navigate } from './router.js';
import { IcoArrow } from './icons.jsx';

/* Кастомная 404 — вместо тихой подмены главной. Ставит noindex, чтобы «мягкие»
   404 (SPA отдаёт 200) не индексировались как контент. */
export default function NotFound() {
  const lang = useLang();
  useEffect(() => {
    const m = document.querySelector('meta[name="robots"]');
    const prev = m ? m.getAttribute('content') : null;
    if (m) m.setAttribute('content', 'noindex, follow');
    return () => { if (m && prev != null) m.setAttribute('content', prev); };
  }, []);
  const go = (to) => (e) => { e.preventDefault(); navigate(to); };
  return (
    <section className="section nf">
      <div className="wrap">
        <div className="nf-inner text-glass">
          <div className="eyebrow">{t(lang, 'nf.code')}</div>
          <h1 className="nf-title">{t(lang, 'nf.title')}</h1>
          <p className="lede" style={{ marginTop: 16 }}>{t(lang, 'nf.sub')}</p>
          <div className="hero-cta" style={{ marginTop: 28 }}>
            <button className="btn btn-primary" onClick={go('/')}>{t(lang, 'nf.home')}</button>
            <button className="btn btn-ghost" onClick={go('/uslugi')}>{t(lang, 'nf.services')} <IcoArrow size={16} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { IcoArrow } from './icons.jsx';
import { navigate } from './router.js';

export default function Hero() {
  const lang = useLang();
  const go = (to) => () => navigate(to);
  return (
    <header className="hero" id="top">
      <div className="wrap">
        <div className="hero-inner text-glass">
          <div className="eyebrow">{t(lang, 'hq.eyebrow')}</div>
          <h1>{t(lang, 'hq.title')}</h1>
          <p className="hero-sub">{t(lang, 'hero.sub')}</p>
          <div className="hero-cta">
            <button className="btn btn-primary" onClick={go('/uslugi')}>{t(lang, 'hero.cta1')}</button>
            <button className="btn btn-ghost" onClick={go('/kontakty')}>
              {t(lang, 'hero.cta2')} <IcoArrow size={16} />
            </button>
          </div>
          <div className="hero-loc">
            <span className="dot" />{t(lang, 'hq.caption')}
          </div>
        </div>
      </div>
    </header>
  );
}

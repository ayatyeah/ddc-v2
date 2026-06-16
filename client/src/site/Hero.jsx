import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { IcoArrow } from './icons.jsx';

export default function Hero() {
  const lang = useLang();
  const go = (id) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  return (
    <header className="hero" id="top">
      <div className="hero-inner">
        <p className="hero-sub">{t(lang, 'hero.sub')}</p>
        <div className="hero-cta">
          <button className="btn btn-primary" onClick={go('services')}>{t(lang, 'hero.cta1')}</button>
          <button className="btn btn-ghost" onClick={go('contacts')}>
            {t(lang, 'hero.cta2')} <IcoArrow size={16} />
          </button>
        </div>
      </div>
      <div className="scroll-cue" />
    </header>
  );
}

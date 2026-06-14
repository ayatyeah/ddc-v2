import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { IcoArrow } from './icons.jsx';

export default function Hero() {
  const lang = useLang();
  const go = (id) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  return (
    <header className="hero" id="top">
      <div className="hero-orbs">
        <div className="orb o1" /><div className="orb o2" /><div className="orb o3" />
      </div>
      <div className="hero-inner">
        <div className="eyebrow">{t(lang, 'hero.eyebrow')}</div>
        <h1>{t(lang, 'hero.t1')}<br /><span className="grad">{t(lang, 'hero.t2')}</span></h1>
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

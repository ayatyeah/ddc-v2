import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { IcoArrow } from './icons.jsx';
import { navigate } from './router.js';

// Статы героя (как на макете): 10+ / 250+ / 99,9% / 100%.
const STATS = [
  ['hero.hs1n', 'hero.hs1l'],
  ['hero.hs2n', 'hero.hs2l'],
  ['hero.hs3n', 'hero.hs3l'],
  ['hero.hs4n', 'hero.hs4l'],
];

export default function Hero() {
  const lang = useLang();
  const go = (to) => () => navigate(to);
  return (
    <header className="hero hero-split" id="top">
      <div className="wrap hero-grid">
        {/* Левая колонка — текст, CTA, адрес, статы */}
        <div className="hero-col">
          <div className="eyebrow eyebrow-dot">{t(lang, 'hero.reyebrow')}</div>
          <h1 className="hero-h1">
            {t(lang, 'hero.rt1')}<span className="accent">{t(lang, 'hero.rt2')}</span>{t(lang, 'hero.rt3')}
          </h1>
          <p className="hero-sub">{t(lang, 'hero.rsub')}</p>
          <div className="hero-cta">
            <button className="btn btn-primary" onClick={go('/uslugi')}>
              {t(lang, 'hero.cta1')} <IcoArrow size={16} />
            </button>
            <button className="btn btn-ghost" onClick={go('/kontakty')}>
              {t(lang, 'hero.cta2b')} <IcoArrow size={16} />
            </button>
          </div>
          <div className="hero-loc"><span className="dot" />{t(lang, 'hq.caption')}</div>
          <div className="hero-stats">
            {STATS.map(([n, l]) => (
              <div className="hstat" key={n}>
                <div className="hstat-n">{t(lang, n)}</div>
                <div className="hstat-l">{t(lang, l)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Правая колонка — за ней видна 3D-сцена (фикс-фон). Поверх — плавающие виджеты. */}
        <div className="hero-visual" aria-hidden="true">
          <div className="hv-widget hv-shield">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 3l7 3v5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6l7-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <button className="hv-explore" onClick={go('/o-nas')} aria-hidden="false">
            <span className="hve-dot" />{t(lang, 'hero.explore')}
          </button>
        </div>
      </div>
    </header>
  );
}

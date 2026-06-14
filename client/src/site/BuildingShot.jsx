import { useLang } from '../store.js';
import { t } from '../i18n.js';
import Reveal from './Reveal.jsx';

/* Секция «Штаб-квартира» — реальное фото здания (вырезанное, building.png)
   на мягком фоне-свечении, с лёгким парением. */
export default function BuildingShot() {
  const lang = useLang();
  return (
    <section className="section hq">
      <div className="wrap">
        <div className="hq-grid">
          <Reveal>
            <div className="eyebrow">{t(lang, 'hq.eyebrow')}</div>
            <h2 className="h2" style={{ marginTop: 14 }}>{t(lang, 'hq.title')}</h2>
            <p className="lede" style={{ marginTop: 18 }}>{t(lang, 'hq.sub')}</p>
            <div className="hq-caption">{t(lang, 'hq.caption')}</div>
          </Reveal>
          <Reveal delay={120}>
            <figure className="hq-figure">
              <span className="hq-glow" />
              <img src="/building.png" alt={t(lang, 'hq.eyebrow')} loading="lazy" decoding="async" />
            </figure>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

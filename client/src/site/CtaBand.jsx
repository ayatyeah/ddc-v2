import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { navigate } from './router.js';
import Reveal from './Reveal.jsx';
import { IcoArrow } from './icons.jsx';

/* Конверсионный бэнд перед футером: явный призыв оставить заявку.
   Ставится на внутренних страницах (услуги/проекты/о-нас). */
export default function CtaBand() {
  const lang = useLang();
  return (
    <section className="section cta-band-sec">
      <div className="wrap">
        <Reveal className="cta-band">
          <div className="cta-band-txt">
            <h2 className="h2">{t(lang, 'cta.title')}</h2>
            <p className="lede" style={{ marginTop: 12 }}>{t(lang, 'cta.sub')}</p>
          </div>
          <button className="btn btn-primary cta-band-btn" onClick={() => navigate('/kontakty')}>
            {t(lang, 'cta.btn')} <IcoArrow size={16} />
          </button>
        </Reveal>
      </div>
    </section>
  );
}

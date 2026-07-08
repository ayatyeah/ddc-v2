import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { SECTION_BY_KEY, tx } from './siteMap.js';
import { NAV_ICONS, IcoArrow } from './icons.jsx';
import { navigate } from './router.js';
import Reveal from './Reveal.jsx';
import CtaBand from './CtaBand.jsx';

// Акцентные цвета для карточек подпунктов (по кругу) — в духе текущей палитры.
const ACCENTS = ['#22d3ee', '#34e3b0', '#2f6fe0', '#a78bfa', '#0a8a5a', '#b07d12'];

/* Типовой лендинг раздела: строится из конфига siteMap по ключу. Один компонент —
   на все новые разделы (Тест-драйв ИИ, Разработчикам, Блог, Карьера, Партнёрам, Документы). */
export default function SectionLanding({ sectionKey, hideCta = false }) {
  const lang = useLang();
  const s = SECTION_BY_KEY[sectionKey];
  if (!s) return null;
  const items = s.items || [];
  return (
    <>
      <section className="section" id={s.key}>
        <div className="wrap">
          <Reveal className="section-head">
            <div className="text-glass svc-head">
              <div className="eyebrow">{tx(s.title, lang)}</div>
              <h1 className="h2">{tx(s.intro, lang)}</h1>
              <div className="kz-ornament" aria-hidden="true" />
            </div>
          </Reveal>
          <div className="proj-grid">
            {items.map((it, i) => {
              const Ico = NAV_ICONS[it.icon] || NAV_ICONS.doc;
              const c = ACCENTS[i % ACCENTS.length];
              return (
                <Reveal key={i} className="proj-card sl-card" delay={i * 80} style={{ '--accent': c }}>
                  <div className="proj-top">
                    <div className="proj-ico"><Ico size={24} /></div>
                    {it.wow && <span className="sl-wow">WOW</span>}
                  </div>
                  <h3 className="proj-title">{tx(it.title, lang)}</h3>
                  <p className="proj-desc">{tx(it.desc, lang)}</p>
                </Reveal>
              );
            })}
          </div>
          {!hideCta && (
            <Reveal delay={120}>
              <button className="btn btn-ghost sl-back" onClick={() => navigate('/kontakty')}>
                {t(lang, 'cta.btn')} <IcoArrow size={16} />
              </button>
            </Reveal>
          )}
        </div>
      </section>
      {!hideCta && <CtaBand />}
    </>
  );
}

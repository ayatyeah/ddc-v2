import { useLang } from '../store.js';
import { t, PROJECTS } from '../i18n.js';
import Reveal from './Reveal.jsx';
import { IcoChart, IcoCpu, IcoCart, IcoCoin } from './icons.jsx';

// Иконка + неоновый цвет-акцент на каждый проект (по индексу, язык-независимо).
const META = [
  { Ico: IcoChart, c: '#22d3ee' },   // Фабрика данных — неоновый голубой
  { Ico: IcoCpu, c: '#34e3b0' },     // NBK AI Platform — неоновый бирюзово-зелёный
  { Ico: IcoCart, c: '#2f6fe0' },    // Портал закупок — фирменный синий
  { Ico: IcoCoin, c: '#a78bfa' },    // Регуляторная песочница — фиолетовый
];

export default function Projects() {
  const lang = useLang();
  const items = PROJECTS[lang] || PROJECTS.ru;
  return (
    <section className="section" id="projects">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="text-glass svc-head">
            <div className="eyebrow">{t(lang, 'projects.eyebrow')}</div>
            <h2 className="h2">{t(lang, 'projects.title')}</h2>
            <p className="lede" style={{ marginTop: 16 }}>{t(lang, 'projects.sub')}</p>
          </div>
        </Reveal>
        <div className="proj-grid">
          {items.map((p, i) => {
            const M = META[i] || META[0];
            return (
              <Reveal key={i} className="proj-card" delay={i * 90} style={{ '--accent': M.c }}>
                <div className="proj-top">
                  <div className="proj-ico"><M.Ico size={26} /></div>
                  <span className="proj-sub">{p.sub}</span>
                </div>
                <h3 className="proj-title">{p.title}</h3>
                <p className="proj-tagline">{p.tagline}</p>
                <p className="proj-desc">{p.desc}</p>
                <div className="proj-tags">
                  {p.tags.map((tg, j) => <span className="proj-tag" key={j}>{tg}</span>)}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

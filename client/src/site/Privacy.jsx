import { useLang } from '../store.js';
import { PRIVACY } from '../i18n.js';
import Reveal from './Reveal.jsx';

/* Политика конфиденциальности — контент из словаря PRIVACY (RU/KK/EN),
   в читаемой панели поверх 3D-сцены. Текст подлежит согласованию с юристом. */
export default function Privacy() {
  const lang = useLang();
  const p = PRIVACY[lang] || PRIVACY.ru;
  const year = new Date().getFullYear();
  return (
    <section className="section" id="privacy">
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">{p.eyebrow}</div>
          <h1 className="h2" style={{ marginTop: 14 }}>{p.title}</h1>
        </Reveal>
        <Reveal delay={100}>
          <div className="legal">
            <p className="legal-note">{p.note.replace('{year}', year)}</p>
            {p.sections.map(([h, body]) => (
              <div className="legal-block" key={h}><h3>{h}</h3><p>{body}</p></div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

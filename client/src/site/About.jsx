import { useRef } from 'react';
import { useLang } from '../store.js';
import { t, BOARD, PRAVLENIE, VALUES } from '../i18n.js';
import Reveal from './Reveal.jsx';
import Workstation from './Workstation.jsx';

function TeamCard({ name, role, slug, i }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${px * 16}deg`);
    el.style.setProperty('--rx', `${-py * 16}deg`);
    el.style.setProperty('--mx', `${(px + 0.5) * 100}%`);
    el.style.setProperty('--my', `${(py + 0.5) * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
  };
  return (
    <div className="tcard-wrap" style={{ animationDelay: `${(i % 4) * 0.6}s` }}>
      <div className="tcard" ref={ref} onMouseMove={onMove} onMouseLeave={onLeave}>
        <div className="tcard-photo" style={{ backgroundImage: `url(/team/${slug}.jpg)` }} />
        <div className="tcard-shine" />
        <div className="tcard-info"><b>{name}</b><i>{role}</i></div>
      </div>
    </div>
  );
}

export default function About() {
  const lang = useLang();
  const board = BOARD[lang] || BOARD.ru;
  const pravlenie = PRAVLENIE[lang] || PRAVLENIE.ru;
  const values = VALUES[lang] || VALUES.ru;
  return (
    <>
      {/* О центре */}
      <section className="section" id="about">
        <div className="wrap">
          <Reveal className="about-grid">
            <div>
              <div className="eyebrow">{t(lang, 'about.eyebrow')}</div>
              <p className="about-text" style={{ marginTop: 16 }}>{t(lang, 'about.title')}</p>
            </div>
            <div>
              <p className="about-body">{t(lang, 'about.text')}</p>
              <p className="about-vision"><span className="av-label">{t(lang, 'about.vision')}</span>{t(lang, 'about.visionText')}</p>
              <div className="values">
                <span className="values-label">{t(lang, 'about.values')}</span>
                <div className="values-chips">
                  {values.map((v, i) => <span className="vchip" key={i}>{v}</span>)}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Цифровое рабочее место — между «о центре» и «Советом директоров» */}
      <Workstation />

      {/* Руководство */}
      <section className="section">
        <div className="wrap">
          <Reveal className="board-title">
            <h2 className="h2" style={{ fontSize: 'clamp(1.5rem,3vw,2.2rem)' }}>{t(lang, 'about.board')}</h2>
          </Reveal>
          <div className="team-grid">
            {board.map(([name, role, slug], i) => (
              <TeamCard key={slug + i} name={name} role={role} slug={slug} i={i} />
            ))}
          </div>

          <Reveal className="board-title" style={{ marginTop: 56 }}>
            <h2 className="h2" style={{ fontSize: 'clamp(1.5rem,3vw,2.2rem)' }}>{t(lang, 'about.pravlenie')}</h2>
          </Reveal>
          <div className="team-grid">
            {pravlenie.map(([name, role, slug], i) => (
              <TeamCard key={slug + i} name={name} role={role} slug={slug} i={i} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

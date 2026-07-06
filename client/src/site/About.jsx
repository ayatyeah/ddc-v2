import { useRef } from 'react';
import { useLang } from '../store.js';
import { t, BOARD, PRAVLENIE, VALUES, TIMELINE } from '../i18n.js';
import Reveal from './Reveal.jsx';
import Workstation from './Workstation.jsx';

// Таймлайн истории 1995 → 2025 (БСБ → ЦЦР). Проявляется по скроллу.
function Timeline({ lang }) {
  const items = TIMELINE[lang] || TIMELINE.ru;
  return (
    <section className="section">
      <div className="wrap">
        <Reveal className="board-title"><h2 className="h2" style={{ fontSize: 'clamp(1.5rem,3vw,2.2rem)' }}>История</h2></Reveal>
        <div className="tl">
          <span className="tl-rail" />
          {items.map((it, i) => (
            <Reveal className="tl-item" key={i} delay={i * 90}>
              <span className="tl-dot" />
              <div className="tl-card">
                <span className="tl-year">{it.y}</span>
                <b className="tl-t">{it.t}</b>
                <p className="tl-d">{it.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function TeamCard({ name, role, slug, i }) {
  const ref = useRef(null);
  const rectRef = useRef(null);   // кэш геометрии: читаем layout ОДИН раз на входе, не на каждом движении
  const rafRef = useRef(0);
  const posRef = useRef({ x: 0, y: 0 });
  // Наведение: запоминаем rect (единственное чтение layout), дальше только пишем стили.
  const onEnter = () => { if (ref.current) rectRef.current = ref.current.getBoundingClientRect(); };
  const onMove = (e) => {
    const r = rectRef.current; if (!r) return;
    posRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current) return;   // троттлинг через rAF — не чаще одного кадра
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = ref.current; if (!el) return;
      const px = (posRef.current.x - r.left) / r.width - 0.5;
      const py = (posRef.current.y - r.top) / r.height - 0.5;
      el.style.setProperty('--ry', `${px * 16}deg`);
      el.style.setProperty('--rx', `${-py * 16}deg`);
      el.style.setProperty('--mx', `${(px + 0.5) * 100}%`);
      el.style.setProperty('--my', `${(py + 0.5) * 100}%`);
    });
  };
  const onLeave = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    const el = ref.current; if (!el) return;
    el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
  };
  return (
    <div className="tcard-wrap" style={{ animationDelay: `${(i % 4) * 0.6}s` }}>
      <div className="tcard" ref={ref} onMouseEnter={onEnter} onMouseMove={onMove} onMouseLeave={onLeave}>
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
            <div className="text-glass">
              <div className="eyebrow">{t(lang, 'about.eyebrow')}</div>
              <p className="about-text" style={{ marginTop: 16 }}>{t(lang, 'about.title')}</p>
            </div>
            <div className="text-glass">
              <p className="about-body">{t(lang, 'about.text')}</p>
              <p className="about-body" style={{ marginTop: 14 }}>{t(lang, 'about.systems')}</p>
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

      {/* История центра: 1995 → 2025 */}
      <Timeline lang={lang} />

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

import { useLang } from '../store.js';
import { t, BOARD } from '../i18n.js';
import Reveal from './Reveal.jsx';

const initials = (name) => name.split(' ').slice(0, 2).map((w) => w[0]).join('');

export default function About() {
  const lang = useLang();
  const board = BOARD[lang] || BOARD.ru;
  return (
    <section className="section" id="about">
      <div className="wrap">
        <Reveal className="about-grid">
          <div>
            <div className="eyebrow">{t(lang, 'about.eyebrow')}</div>
            <p className="about-text" style={{ marginTop: 16 }}>{t(lang, 'about.title')}</p>
          </div>
          <p className="about-body">{t(lang, 'about.text')}</p>
        </Reveal>

        <Reveal className="board-title">
          <h2 className="h2" style={{ fontSize: 'clamp(1.5rem,3vw,2.2rem)' }}>{t(lang, 'about.board')}</h2>
        </Reveal>
        <div className="board">
          {board.map(([name, role], i) => (
            <Reveal key={i} className="person" delay={i * 50}>
              <div className="av">{initials(name)}</div>
              <div><b>{name}</b><i>{role}</i></div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

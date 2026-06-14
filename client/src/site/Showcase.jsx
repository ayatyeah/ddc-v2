import { useEffect, useRef } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import Reveal from './Reveal.jsx';
import { initBuilding } from './Building3D.js';

const CHIPS = [
  { k: 'c1', c: '#2f6fe0', style: { top: '8%', left: '5%' } },
  { k: 'c2', c: '#0a8a5a', style: { top: '32%', right: '5%' } },
  { k: 'c3', c: '#b07d12', style: { top: '60%', left: '5%' } },
  { k: 'c4', c: '#5a3fd6', style: { bottom: '8%', right: '7%' } },
  { k: 'c5', c: '#c0455a', style: { top: '6%', right: '6%' } },
];

export default function Showcase() {
  const lang = useLang();
  const canvasRef = useRef(null);
  const sectionRef = useRef(null);

  useEffect(() => {
    const inst = initBuilding(canvasRef.current);
    const onScroll = () => {
      const el = sectionRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = 1 - (r.bottom) / (window.innerHeight + r.height);
      inst.setProgress(p);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); inst.dispose(); };
  }, []);

  return (
    <section className="section showcase" ref={sectionRef}>
      <div className="wrap">
        <div className="show-grid">
          <Reveal>
            <div className="eyebrow">{t(lang, 'showcase.eyebrow')}</div>
            <h2 className="h2" style={{ marginTop: 14 }}>{t(lang, 'showcase.title')}</h2>
            <p className="lede" style={{ marginTop: 18 }}>{t(lang, 'showcase.sub')}</p>
          </Reveal>
          <Reveal delay={120}>
            <div className="stage">
              <canvas ref={canvasRef} />
              {CHIPS.map((ch, i) => (
                <button
                  key={ch.k}
                  className="chip"
                  style={{ ...ch.style, animationDelay: `${i * 0.7}s` }}
                  onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  <i style={{ background: ch.c }} />{t(lang, `showcase.${ch.k}`)}
                </button>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

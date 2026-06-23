import { useEffect, useRef, useState } from 'react';
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
  const [panel, setPanel] = useState('c1'); // последняя выбранная карточка (для плавного закрытия)
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const inst = initBuilding(canvasRef.current);
    let raf = 0;
    const apply = () => {
      raf = 0;
      const el = sectionRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = 1 - (r.bottom) / (window.innerHeight + r.height);
      inst.setProgress(p);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); inst.dispose(); };
  }, []);

  const click = (k) => (e) => {
    e?.preventDefault?.();
    if (open && panel === k) { setOpen(false); }
    else { setPanel(k); setOpen(true); }
  };

  const color = (CHIPS.find((c) => c.k === panel) || CHIPS[0]).c;
  const active = CHIPS.find((c) => c.k === panel) || CHIPS[0];
  const isLeft = 'left' in active.style;
  const panelStyle = isLeft ? { right: '4%' } : { left: '4%' };   // кнопка слева → плашка справа, и наоборот
  if ('top' in active.style) panelStyle.top = active.style.top;
  if ('bottom' in active.style) panelStyle.bottom = active.style.bottom;

  return (
    <section className="section showcase" ref={sectionRef}>
      <div className="wrap">
        <div className="show-grid">
          <Reveal className="text-glass">
            <div className="eyebrow">{t(lang, 'showcase.eyebrow')}</div>
            <h2 className="h2" style={{ marginTop: 14 }}>{t(lang, 'showcase.title')}</h2>
            <p className="lede" style={{ marginTop: 18 }}>{t(lang, 'showcase.sub')}</p>
          </Reveal>
          <Reveal delay={120}>
            <div className={`stage ${open ? 'panel-open' : ''}`}>
              <canvas ref={canvasRef} />
              {CHIPS.map((ch, i) => (
                <button
                  key={ch.k}
                  type="button"
                  className={`chip ${open && panel === ch.k ? 'active' : ''} ${open && panel !== ch.k ? 'dimmed' : ''}`}
                  style={{ ...ch.style, animationDelay: `${i * 0.7}s` }}
                  onClick={click(ch.k)}
                  aria-expanded={open && panel === ch.k}
                >
                  <i style={{ background: ch.c }} />{t(lang, `showcase.${ch.k}`)}
                </button>
              ))}

              <div className={`chip-info ${open ? 'show' : ''}`} style={panelStyle} role="dialog">
                <button type="button" className="ci-close" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>
                <div className="ci-title"><i style={{ background: color }} />{t(lang, `showcase.${panel}`)}</div>
                <p>{t(lang, `showcase.${panel}d`)}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

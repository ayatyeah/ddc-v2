import { useEffect, useRef } from 'react';
import { useLang } from '../store.js';
import { t, WORK_FACTS } from '../i18n.js';
import Reveal from './Reveal.jsx';
import { initComputer } from './Computer3D.js';

export default function Workstation() {
  const lang = useLang();
  const canvasRef = useRef(null);
  const sectionRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    const inst = initComputer(canvasRef.current, {
      facts: WORK_FACTS[lang] || WORK_FACTS.ru,
      brand: 'DDC · ЦЦР',
    });
    apiRef.current = inst;
    const onScroll = () => {
      const el = sectionRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      inst.setProgress(1 - r.bottom / (window.innerHeight + r.height));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); inst.dispose(); apiRef.current = null; };
  }, []);

  // Смена языка — обновляем факты на экране без пересборки сцены.
  useEffect(() => {
    apiRef.current?.setFacts(WORK_FACTS[lang] || WORK_FACTS.ru);
  }, [lang]);

  return (
    <section className="section workstation" ref={sectionRef}>
      <div className="wrap">
        <div className="work-grid">
          <Reveal>
            <div className="stage stage-pc">
              <canvas ref={canvasRef} />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="eyebrow">{t(lang, 'work.eyebrow')}</div>
            <h2 className="h2" style={{ marginTop: 14 }}>{t(lang, 'work.title')}</h2>
            <p className="lede" style={{ marginTop: 18 }}>{t(lang, 'work.sub')}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

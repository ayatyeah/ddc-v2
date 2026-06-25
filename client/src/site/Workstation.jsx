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
    let inst = null, raf = 0, cancelled = false;
    const apply = () => {
      raf = 0;
      const el = sectionRef.current;
      if (!el || !inst) return;
      const r = el.getBoundingClientRect();
      inst.setProgress(1 - r.bottom / (window.innerHeight + r.height));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    // Тяжёлую инициализацию 3D-модели откладываем на простой главного потока — чтобы
    // переход на страницу был бесшовным (плашки появляются сразу, моделька — следом, фейдом).
    const init = () => {
      if (cancelled || !canvasRef.current) return;
      const cv = canvasRef.current;
      cv.style.transition = 'opacity 0.6s ease'; cv.style.opacity = '0';
      inst = initComputer(cv, { facts: WORK_FACTS[lang] || WORK_FACTS.ru, brand: 'DDC · ЦЦР' });
      apiRef.current = inst;
      apply();
      requestAnimationFrame(() => { cv.style.opacity = '1'; });
      window.addEventListener('scroll', onScroll, { passive: true });
    };
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;
    const id = idle(init);
    return () => {
      cancelled = true;
      try { cancelIdle(id); } catch { /* noop */ }
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      if (inst) inst.dispose();
      apiRef.current = null;
    };
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
          <Reveal delay={120} className="text-glass">
            <div className="eyebrow">{t(lang, 'work.eyebrow')}</div>
            <h2 className="h2" style={{ marginTop: 14 }}>{t(lang, 'work.title')}</h2>
            <p className="lede" style={{ marginTop: 18 }}>{t(lang, 'work.sub')}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

import { useEffect, useRef } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';

/* Интро-локап: логотип + «DDC» под ним. На старте — крупно по центру экрана,
   при скролле плавно поднимается и фиксируется по центру шапки (уменьшаясь). */
export default function Brand() {
  const lang = useLang();
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ease = (x) => x * x * (3 - 2 * x);
    let raf = 0;

    const apply = () => {
      raf = 0;
      const vh = window.innerHeight;
      const t = reduce ? 1 : Math.min(1, Math.max(0, window.scrollY / (vh * 0.55)));
      const e = ease(t);
      const ty = vh * 0.15 + (8 - vh * 0.15) * e;     // верхняя зона → к шапке
      const sc = 1 + (0.36 - 1) * e;                  // крупно → мелко (влезает в навбар)
      el.style.transform = `translate(-50%, ${ty}px) scale(${sc})`;
      el.style.setProperty('--fade', String(1 - t));  // подпись/капция тают
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="brandlock" ref={ref} aria-hidden="true">
      <div className="bl-cap">{t(lang, 'hero.eyebrow')}</div>
      <img className="bl-logo" src="/logo_ddc.svg" alt="" />
      <div className="bl-word">DDC</div>
      <div className="bl-sub">{t(lang, 'hero.t1')} {t(lang, 'hero.t2')}</div>
    </div>
  );
}

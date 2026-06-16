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
      const vw = window.innerWidth, vh = window.innerHeight;
      const mobile = vw < 760;
      const t = reduce ? 1 : Math.min(1, Math.max(0, window.scrollY / (vh * 0.55)));
      const e = ease(t);
      const w = el.offsetWidth || 140, h = el.offsetHeight || 140;
      const navH = 64;
      const scDock = mobile ? 0.42 : 0.36;
      const sc = 1 + (scDock - 1) * e;
      // по горизонтали: старт — по центру; в доке — центр (десктоп) или слева (мобайл)
      const centerX = (vw - w) / 2;
      const dockX = mobile ? 14 : (vw - w * scDock) / 2;
      const x = centerX + (dockX - centerX) * e;
      // по вертикали: из верхней зоны в центр шапки
      const startY = vh * 0.15;
      const dockY = Math.max(6, (navH - h * scDock) / 2);
      const ty = startY + (dockY - startY) * e;
      el.style.transform = `translate(${x}px, ${ty}px) scale(${sc})`;
      el.style.setProperty('--fade', String(1 - t));
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

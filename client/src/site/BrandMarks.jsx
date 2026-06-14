import { useEffect, useRef } from 'react';

/* Фоновые логотипы: ЦЦР и Нацбанк рядом, с лёгким нахлёстом краёв (Нацбанк сверху).
   При скролле логотип ЦЦР чуть приближается (масштаб), не вытесняя второй. */
export default function BrandMarks() {
  const ddcRef = useRef(null);

  useEffect(() => {
    const el = ddcRef.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.setProperty('--ddc-scale', (1 + p * 0.16).toFixed(3));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <div id="brand-marks" aria-hidden="true">
      <div className="bm-wrap">
        <img className="bm-ddc" ref={ddcRef} src="/ddc.png" alt="" />
        <img className="bm-nbk" src="/nbk.png" alt="" />
      </div>
    </div>
  );
}

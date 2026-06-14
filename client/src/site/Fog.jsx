import { useEffect } from 'react';

/* Слой «дыма»/облаков снизу. Прозрачность растёт по мере скролла —
   секции будто проявляются сквозь дымку у нижнего края экрана. */
export default function Fog() {
  useEffect(() => {
    const el = document.getElementById('fog');
    if (!el) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      // у самого верха дымки почти нет, дальше нарастает
      el.style.setProperty('--fog', Math.min(0.85, p * 1.25).toFixed(3));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <div id="fog" aria-hidden="true">
      <span className="cloud c1" /><span className="cloud c2" />
      <span className="cloud c3" /><span className="cloud c4" />
    </div>
  );
}

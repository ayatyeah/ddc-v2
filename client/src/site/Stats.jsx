import { useEffect, useRef, useState } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';

const KEYS = ['s1', 's2', 's3', 's4'];

function CountUp({ value }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const num = parseInt(String(value).replace(/\D/g, ''), 10);
    if (!Number.isFinite(num)) { setShown(value); return; }
    const el = ref.current;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
      const dur = 1100, t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - k, 3);
        setShown(String(Math.round(num * eased)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    if (el) io.observe(el);
    return () => io.disconnect();
  }, [value]);
  return <span ref={ref}>{shown}</span>;
}

export default function Stats() {
  const lang = useLang();
  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="stats">
          {KEYS.map((k) => (
            <div className="stat" key={k}>
              <div className="n"><CountUp value={t(lang, `stats.${k}n`)} /></div>
              <div className="l">{t(lang, `stats.${k}l`)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

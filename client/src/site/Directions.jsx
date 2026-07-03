import { useEffect, useState } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { getJSON } from '../api.js';
import Reveal from './Reveal.jsx';
import { navigate } from './router.js';
import { SERVICE_ICONS, IcoArrow } from './icons.jsx';

// Превью направлений на ГЛАВНОЙ (как в референсе-макете): 4 карточки-выжимки из услуг,
// клик по любой → страница «Услуги». Данные берём из того же /api/services, что и полная
// страница услуг (чтобы контент был консистентным), с откатом на словарь.
const FALLBACK_META = [
  { k: 's1', icon: 'code', color: '#2f6fe0' },
  { k: 's2', icon: 'link', color: '#5a3fd6' },
  { k: 's3', icon: 'cart', color: '#0a8a5a' },
  { k: 's4', icon: 'chart', color: '#b07d12' },
];

const pick = (row, lang, base) => row[`${base}_${lang}`] || row[`${base}_ru`] || row[`${base}_en`] || '';

export default function Directions() {
  const lang = useLang();
  const [items, setItems] = useState(null);

  useEffect(() => {
    let alive = true;
    getJSON('/api/services')
      .then((d) => { if (alive) setItems(Array.isArray(d) ? d : []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  // Первые 4 услуги (как в макете); пока грузится/пусто — словарный фолбэк.
  const list = (items && items.length)
    ? items.slice(0, 4).map((r) => ({ id: r.id, icon: r.icon, color: r.color, name: pick(r, lang, 'name'), desc: pick(r, lang, 'desc') }))
    : FALLBACK_META.map((m) => ({ id: m.k, icon: m.icon, color: m.color, name: t(lang, `services.${m.k}t`), desc: t(lang, `services.${m.k}d`) }));

  return (
    <section className="section dir" id="directions">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="text-glass dir-head">
            <div className="eyebrow">{t(lang, 'dir.eyebrow')}</div>
            <h2 className="h2">{t(lang, 'dir.title')}</h2>
          </div>
        </Reveal>
        <div className="dir-grid">
          {list.map((s, i) => {
            const Ico = SERVICE_ICONS[s.icon] || SERVICE_ICONS.code;
            return (
              <Reveal as="button" type="button" key={s.id} className="dir-card" delay={i * 70}
                onClick={() => navigate('/uslugi')} aria-label={s.name}>
                <div className="dir-ico" style={{ '--c': s.color }}><Ico size={22} /></div>
                <h3>{s.name}</h3>
                <p>{s.desc}</p>
                <span className="dir-more">{t(lang, 'dir.cta')} <IcoArrow size={14} /></span>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

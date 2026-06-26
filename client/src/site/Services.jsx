import { useEffect, useState } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { getJSON } from '../api.js';
import Reveal from './Reveal.jsx';
import ServiceApplyModal from './ServiceApplyModal.jsx';
import { SERVICE_ICONS, IcoArrow } from './icons.jsx';

// Фолбэк из словаря — если API недоступен или услуг ещё нет в БД.
const FALLBACK_META = [
  { k: 's1', icon: 'code', color: '#2f6fe0' },
  { k: 's2', icon: 'link', color: '#5a3fd6' },
  { k: 's3', icon: 'cart', color: '#0a8a5a' },
  { k: 's4', icon: 'chart', color: '#b07d12' },
  { k: 's5', icon: 'support', color: '#0a7aa8' },
  { k: 's6', icon: 'shield', color: '#c0455a' },
];

// Локализованное поле с откатом на русский/английский, если перевод пуст.
const pick = (row, lang, base) => row[`${base}_${lang}`] || row[`${base}_ru`] || row[`${base}_en`] || '';

export default function Services() {
  const lang = useLang();
  const [items, setItems] = useState(null);   // null — ещё грузим
  const [applyId, setApplyId] = useState(null);   // открытая форма заявки (id услуги)

  useEffect(() => {
    let alive = true;
    getJSON('/api/services')
      .then((d) => { if (alive) setItems(Array.isArray(d) ? d : []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  // Единый вид карточки. Пока грузится или пусто — показываем словарный фолбэк.
  const list = (items && items.length)
    ? items.map((r) => ({ id: r.id, icon: r.icon, color: r.color, name: pick(r, lang, 'name'), desc: pick(r, lang, 'desc') }))
    : FALLBACK_META.map((m) => ({ id: m.k, icon: m.icon, color: m.color, name: t(lang, `services.${m.k}t`), desc: t(lang, `services.${m.k}d`) }));

  return (
    <section className="section" id="services">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="text-glass svc-head">
            <div className="eyebrow">{t(lang, 'services.eyebrow')}</div>
            <h2 className="h2">{t(lang, 'services.title')}</h2>
          </div>
        </Reveal>
        <div className="svc-grid">
          {list.map((s, i) => {
            const Ico = SERVICE_ICONS[s.icon] || SERVICE_ICONS.code;
            return (
              <Reveal as="button" type="button" key={s.id} className="svc svc-btn" delay={i * 70}
                onClick={() => setApplyId(s.id)} aria-label={`${t(lang, 'services.apply')}: ${s.name}`}>
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <div className="svc-ico" style={{ '--c': s.color }}><Ico size={24} /></div>
                <h3>{s.name}</h3>
                <p>{s.desc}</p>
                <span className="svc-cta">{t(lang, 'services.apply')} <IcoArrow size={15} /></span>
              </Reveal>
            );
          })}
        </div>
      </div>

      {applyId != null && (
        <ServiceApplyModal
          services={list}
          initialId={applyId}
          lang={lang}
          onClose={() => setApplyId(null)}
        />
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { getJSON } from '../api.js';
import Reveal from './Reveal.jsx';

// Открытые вакансии на странице «Карьера» — управляются из админки.
// Если вакансий нет, секция ничего не рендерит (страница остаётся аккуратной).
export default function Vacancies({ onApply }) {
  const lang = useLang();
  const [items, setItems] = useState(null);
  useEffect(() => { getJSON('/api/vacancies').then(setItems).catch(() => setItems([])); }, []);
  if (!items || items.length === 0) return null;

  return (
    <section className="section vac-sec">
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">{t(lang, 'vac.eyebrow')}</div>
          <h2 className="h2" style={{ marginTop: 14 }}>{t(lang, 'vac.title')}</h2>
        </Reveal>
        <div className="vac-list">
          {items.map((v) => (
            <Reveal key={v.id}>
              <article className="vac-card text-glass">
                <div className="vac-top">
                  <h3>{v.title}</h3>
                  {v.department && <span className="vac-dep">{v.department}</span>}
                </div>
                <div className="vac-meta">
                  <span>📍 {v.location}</span>
                  <span>🕘 {v.employment}</span>
                </div>
                {v.description && <p className="vac-desc">{v.description}</p>}
                <button type="button" className="btn btn-primary vac-apply" onClick={() => onApply?.(v.title)}>{t(lang, 'vac.apply')}</button>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

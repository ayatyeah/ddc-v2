import { useEffect, useRef, useState } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { getJSON } from '../api.js';
import Reveal from './Reveal.jsx';

// Открытые вакансии на странице «Карьера» — управляются из админки.
// Если вакансий нет, секция ничего не рендерит (страница остаётся аккуратной).
// Описание сворачивается (аккордеон): карточки в ряду одной высоты, а полный
// текст раскрывается по клику — ничего не обрезается насовсем.
export default function Vacancies({ onApply }) {
  const lang = useLang();
  const [items, setItems] = useState(null);
  // Единое состояние на всю секцию: любая кнопка раскрывает/сворачивает все карточки.
  const [open, setOpen] = useState(false);
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
              <VacancyCard v={v} lang={lang} onApply={onApply} open={open} onToggle={() => setOpen((o) => !o)} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// Одна карточка вакансии со сворачиваемым описанием.
// Состояние open общее для всей секции, поэтому приходит пропсами.
function VacancyCard({ v, lang, onApply, open, onToggle }) {
  const [clamped, setClamped] = useState(false);   // текст реально длиннее свёрнутой высоты?
  const descRef = useRef(null);

  // После рендера проверяем, переполняет ли описание свёрнутую область.
  // Если нет — кнопку «Показать полностью» не показываем.
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    const check = () => setClamped(el.scrollHeight - el.clientHeight > 4);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [v.description, open]);

  return (
    <article className={`vac-card text-glass${open ? ' is-open' : ''}`}>
      <div className="vac-top">
        <h3>{v.title}</h3>
        {v.department && <span className="vac-dep">{v.department}</span>}
      </div>
      <div className="vac-meta">
        <span>📍 {v.location}</span>
        <span>🕘 {v.employment}</span>
      </div>
      {v.description && (
        <div className="vac-body">
          <p ref={descRef} className={`vac-desc${open ? '' : ' is-clamped'}`}>{v.description}</p>
          {(clamped || open) && (
            <button type="button" className="vac-toggle" aria-expanded={open} onClick={onToggle}>
              {open ? t(lang, 'vac.less') : t(lang, 'vac.more')}
            </button>
          )}
        </div>
      )}
      <button type="button" className="btn btn-primary vac-apply" onClick={() => onApply?.(v.title)}>{t(lang, 'vac.apply')}</button>
    </article>
  );
}

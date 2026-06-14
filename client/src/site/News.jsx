import { useEffect, useRef, useState } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { getJSON } from '../api.js';
import Reveal from './Reveal.jsx';
import { IcoArrow } from './icons.jsx';

function pick(row, base, lang) { return row[`${base}_${lang}`] || row[`${base}_ru`] || ''; }

function fmtDate(value, lang) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const loc = lang === 'kk' ? 'kk-KZ' : lang === 'en' ? 'en-US' : 'ru-RU';
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function News() {
  const lang = useLang();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(null);
  const [idx, setIdx] = useState(0);
  const trackRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getJSON('/api/news')
      .then((rows) => { if (alive) setItems(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  // Шаг прокрутки = ширина карточки + gap
  const step = () => {
    const tr = trackRef.current; if (!tr) return 0;
    const card = tr.querySelector('.nc-card');
    return card ? card.getBoundingClientRect().width + 18 : tr.clientWidth;
  };
  const scrollTo = (i) => {
    const tr = trackRef.current; if (!tr) return;
    const clamped = Math.max(0, Math.min(items.length - 1, i));
    tr.scrollTo({ left: clamped * step(), behavior: 'smooth' });
  };
  const onScroll = () => {
    const tr = trackRef.current; if (!tr) return;
    const s = step() || 1;
    setIdx(Math.round(tr.scrollLeft / s));
  };

  const atStart = idx <= 0;
  const atEnd = idx >= items.length - 1;

  return (
    <section className="section" id="news">
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">{t(lang, 'news.eyebrow')}</div>
          <h2 className="h2" style={{ marginTop: 14 }}>{t(lang, 'news.title')}</h2>
        </Reveal>

        <div style={{ marginTop: 34 }}>
          {loaded && items.length === 0 ? (
            <div className="news-empty">{t(lang, 'news.empty')}</div>
          ) : (
            <Reveal>
              <div className="news-carousel">
                <button className="nc-arrow prev" onClick={() => scrollTo(idx - 1)} disabled={atStart} aria-label="Назад">
                  <IcoArrow size={18} />
                </button>
                <button className="nc-arrow next" onClick={() => scrollTo(idx + 1)} disabled={atEnd} aria-label="Вперёд">
                  <IcoArrow size={18} />
                </button>

                <div className="nc-track" ref={trackRef} onScroll={onScroll}>
                  {items.map((row) => (
                    <article className="nc-card" key={row.id} onClick={() => setActive(row)}>
                      <div className="ph" style={row.image ? undefined : { background: row.color || '#1a4aaa' }}>
                        {row.image && <img src={row.image} alt={pick(row, 'title', lang)} loading="lazy" />}
                      </div>
                      <div className="body">
                        <time>{fmtDate(row.news_date || row.created_at, lang)}</time>
                        <h3>{pick(row, 'title', lang)}</h3>
                        <p>{pick(row, 'excerpt', lang)}</p>
                        <span className="more">{t(lang, 'news.read')} →</span>
                      </div>
                    </article>
                  ))}
                </div>

                {items.length > 1 && (
                  <div className="nc-dots">
                    {items.map((_, i) => (
                      <button key={i} className={`nc-dot ${i === idx ? 'on' : ''}`} onClick={() => scrollTo(i)} aria-label={`${i + 1}`} />
                    ))}
                  </div>
                )}
              </div>
            </Reveal>
          )}
        </div>
      </div>

      {active && (
        <div className="modal-ov" onClick={() => setActive(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {active.image
              ? <div className="bar" style={{ height: 200, padding: 0 }}><img src={active.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
              : <div className="bar" style={{ background: active.color || '#1a4aaa' }} />}
            <div className="inner">
              <button className="x" onClick={() => setActive(null)} aria-label={t(lang, 'news.close')}>×</button>
              <time>{fmtDate(active.news_date || active.created_at, lang)}</time>
              <h2>{pick(active, 'title', lang)}</h2>
              <p>{pick(active, 'body', lang) || pick(active, 'excerpt', lang)}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { getJSON } from '../api.js';
import Reveal from './Reveal.jsx';
import { IcoArrow } from './icons.jsx';

function pick(row, base, lang) { return row[`${base}_${lang}`] || row[`${base}_ru`] || ''; }

// AI-лента: поле может быть строкой (старый кэш) или объектом {ru,kk,en} (мультиязычно).
function pickT(v, lang) {
  if (v && typeof v === 'object') return v[lang] || v.ru || v.en || v.kk || '';
  return v || '';
}

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
  const [feed, setFeed] = useState([]);
  const [feedAt, setFeedAt] = useState(null);
  const [feedDigest, setFeedDigest] = useState('');
  const [aiActive, setAiActive] = useState(null);

  useEffect(() => {
    let alive = true;
    const bust = () => `_=${Date.now()}`;
    getJSON('/api/news?' + bust())
      .then((rows) => { if (alive) setItems(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoaded(true); });

    let tries = 0, timer = 0;
    const loadFeed = () => {
      getJSON('/api/news/aggregated?' + bust())
        .then((d) => {
          if (!alive) return;
          const arr = Array.isArray(d.items) ? d.items : [];
          setFeed(arr); setFeedAt(d.updated_at || null); setFeedDigest(d.digest || '');
          if (arr.length === 0 && tries < 3) { tries += 1; timer = setTimeout(loadFeed, 6000); } // лента ещё собирается
        })
        .catch(() => {});
    };
    loadFeed();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const open = active || aiActive;
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { setActive(null); setAiActive(null); } };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [active, aiActive]);

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

        <h3 className="news-part">{t(lang, 'news.ours')}</h3>
        <div style={{ marginTop: 20 }}>
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
                      <div className="ph" style={{ background: row.color || '#1a4aaa' }}>
                        {row.image && <img src={row.image} alt={pick(row, 'title', lang)} loading="lazy"
                          style={{ objectFit: row.image_fit || 'cover', objectPosition: row.image_pos || '50% 50%' }} />}
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

        <h3 className="news-part news-part-ai">{t(lang, 'news.ai')} <span className="ai-tag">AI</span></h3>
        <div className="news-ai-note">
          {t(lang, 'news.aiNote')}{feedAt ? ` · ${t(lang, 'news.updated')} ${fmtDate(feedAt, lang)}` : ''}
        </div>
        {pickT(feedDigest, lang) && <div className="ai-digest"><span className="ai-digest-lbl">{t(lang, 'news.digest')}</span>{pickT(feedDigest, lang)}</div>}
        <div className="ai-feed">
          {feed.length === 0 ? (
            <div className="news-empty">{t(lang, 'news.aiEmpty')}</div>
          ) : feed.map((it, i) => (
            <button className="af-card" key={i} onClick={() => setAiActive(it)}>
              {it.image && <div className="af-ph"><img src={it.image} alt="" loading="lazy" /></div>}
              <div className="af-src">{it.source}{it.date ? ` · ${it.date}` : ''}</div>
              <h4>{pickT(it.title, lang)}</h4>
              {pickT(it.summary, lang) && <p>{pickT(it.summary, lang)}</p>}
              <span className="more">{t(lang, 'news.read')} →</span>
            </button>
          ))}
        </div>
      </div>

      {aiActive && createPortal(
        <div className="modal-ov" onClick={() => setAiActive(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="bar" style={aiActive.image
              ? { height: 200, padding: 0, background: '#0a1a3e' }
              : { background: 'linear-gradient(120deg,#13245a,#0a1a3e)' }}>
              {aiActive.image && <img src={aiActive.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              <span className="ai-tag" style={{ position: 'absolute', left: 20, bottom: 16 }}>AI</span>
            </div>
            <div className="inner">
              <button className="x" onClick={() => setAiActive(null)} aria-label={t(lang, 'news.close')}>×</button>
              <time>{aiActive.source}{aiActive.date ? ` · ${aiActive.date}` : ''}</time>
              <h2>{pickT(aiActive.title, lang)}</h2>
              <p>{pickT(aiActive.summary, lang)}</p>
              {aiActive.url && <a className="btn btn-ghost" href={aiActive.url} target="_blank" rel="noopener noreferrer" style={{ marginTop: 8, display: 'inline-flex' }}>{t(lang, 'news.source')} ↗</a>}
            </div>
          </div>
        </div>,
        document.body
      )}

      {active && createPortal(
        <div className="modal-ov" onClick={() => setActive(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {active.image
              ? <div className="bar" style={{ height: 200, padding: 0, background: active.color || '#1a4aaa' }}><img src={active.image} alt="" style={{ width: '100%', height: '100%', objectFit: active.image_fit || 'cover', objectPosition: active.image_pos || '50% 50%' }} /></div>
              : <div className="bar" style={{ background: active.color || '#1a4aaa' }} />}
            <div className="inner">
              <button className="x" onClick={() => setActive(null)} aria-label={t(lang, 'news.close')}>×</button>
              <time>{fmtDate(active.news_date || active.created_at, lang)}</time>
              <h2>{pick(active, 'title', lang)}</h2>
              <p>{pick(active, 'body', lang) || pick(active, 'excerpt', lang)}</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

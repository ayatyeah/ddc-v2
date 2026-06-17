import { useEffect, useState } from 'react';
import { getJSON } from '../api.js';

const ENTITY_LABEL = { lead: 'Заявка', news: 'Новость', feed: 'AI-лента' };
const FILTERS = [
  { id: '', label: 'Все' },
  { id: 'lead', label: 'Заявки' },
  { id: 'news', label: 'Новости' },
  { id: 'feed', label: 'AI-лента' },
];
const fmt = (ts) => { try { return new Date(ts).toLocaleString('ru-RU'); } catch { return ''; } };

export default function History({ onAuthLost }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    let alive = true;
    getJSON('/api/admin/audit' + (filter ? `?entity=${filter}` : ''))
      .then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch((e) => { if (e.status === 401) return onAuthLost?.(); if (alive) setRows([]); });
    return () => { alive = false; };
  }, [filter]);

  const activeIdx = Math.max(0, FILTERS.findIndex((f) => f.id === filter));

  return (
    <div className="hist-wrap">
      <div className="seg" role="tablist" aria-label="Фильтр истории" style={{ '--seg-count': FILTERS.length, '--seg-active': activeIdx }}>
        <span className="seg-thumb" aria-hidden="true" />
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={`seg-btn ${filter === f.id ? 'on' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!rows ? <div className="adm-hint">Загрузка…</div> : rows.length === 0 ? <div className="adm-hint">Записей нет</div> : (
        <ul className="audit-list big">
          {rows.map((r, i) => (
            <li key={i}>
              <span className={`au-badge au-${r.entity}`}>{ENTITY_LABEL[r.entity] || r.entity}</span>
              <span className="au-sum">{r.summary}</span>
              <span className="au-meta">{r.actor}{r.actor_role ? ` · ${r.actor_role}` : ''} · {fmt(r.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

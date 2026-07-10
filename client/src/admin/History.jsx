import { useEffect, useState } from 'react';
import { getJSON } from '../api.js';

const ENTITY_LABEL = { lead: 'Заявка', news: 'Новость', service: 'Услуга', career: 'Карьера', vacancy: 'Вакансия', user: 'Пользователь', department: 'Отдел', feed: 'AI-лента', system: 'Система', incident: 'Инцидент', wiki: 'База знаний', broadcast: 'Рассылка' };
const FILTERS = [
  { id: '', label: 'Все' },
  { id: 'lead', label: 'Заявки' },
  { id: 'news', label: 'Новости' },
  { id: 'service', label: 'Услуги' },
  { id: 'career', label: 'Карьера' },
  { id: 'vacancy', label: 'Вакансии' },
  { id: 'user', label: 'Пользователи' },
  { id: 'department', label: 'Отделы' },
  { id: 'system', label: 'Системы' },
  { id: 'incident', label: 'Инциденты' },
  { id: 'wiki', label: 'База знаний' },
  { id: 'broadcast', label: 'Рассылки' },
  { id: 'feed', label: 'AI-лента' },
];
const fmt = (ts) => { try { return new Date(ts).toLocaleString('ru-RU'); } catch { return ''; } };
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function History({ onAuthLost }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('');
  const activeLabel = FILTERS.find((f) => f.id === filter)?.label || 'Все';
  useEffect(() => {
    let alive = true;
    getJSON('/api/admin/audit' + (filter ? `?entity=${filter}` : ''))
      .then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch((e) => { if (e.status === 401) return onAuthLost?.(); if (alive) setRows([]); });
    return () => { alive = false; };
  }, [filter]);

  const exportCsv = () => {
    if (!rows?.length) return;
    const header = ['Тип', 'Действие', 'Описание', 'Кто', 'Роль', 'Когда'];
    const lines = rows.map((r) => [ENTITY_LABEL[r.entity] || r.entity, r.action, r.summary, r.actor, r.actor_role, fmt(r.created_at)].map(csvCell).join(','));
    const csv = '﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `ddc-audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="hist-page">
      <div className="hist-hero card-surface">
        <div>
          <div className="nm-head"><h2>История</h2></div>
          <p className="hist-lead">Журнал изменений админки: кто, что и когда менял. Список можно фильтровать по типам событий и выгружать в CSV.</p>
        </div>
        <div className="hist-stats">
          <div className="hist-stat"><b>{rows?.length ?? '—'}</b><span>записей</span></div>
          <div className="hist-stat"><b>{activeLabel}</b><span>текущий фильтр</span></div>
        </div>
      </div>

      <div className="hist-bar card-surface">
        <div className="cal-filters hist-filters">
          {FILTERS.map((f) => (
            <button key={f.id} className={`cal-fchip ${filter === f.id ? 'on' : ''}`} style={{ '--c': 'var(--brand)' }} onClick={() => setFilter(f.id)}>
              <span className="cal-dot" /> {f.label}
            </button>
          ))}
        </div>
        <button className="adm-btn sm" onClick={exportCsv} disabled={!rows?.length} title="Экспорт в CSV">⬇ CSV</button>
      </div>

      {!rows ? <div className="adm-hint">Загрузка…</div> : rows.length === 0 ? <div className="adm-empty">Записей нет.</div> : (
        <ul className="audit-list big hist-list">
          {rows.map((r, i) => (
            <li key={i} className="hist-item">
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

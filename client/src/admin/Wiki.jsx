import { useCallback, useEffect, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';
import { emitAdminDataChange, useAdminDataSync } from './adminEvents.js';

const fmt = (v) => { try { return new Date(v).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const EMPTY = { title: '', category: 'Общее', tags: '', body: '' };

// База знаний (Wiki): статьи с категориями и поиском. Индексируются в семантический поиск портала.
export default function Wiki({ onAuthLost, canEdit = true }) {
  const [data, setData] = useState({ items: [], categories: [] });
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [active, setActive] = useState(null);   // открытая статья (полный текст)
  const [edit, setEdit] = useState(null);        // { id?, title, category, tags, body }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const p = new URLSearchParams(); if (q.trim()) p.set('q', q.trim()); if (cat) p.set('category', cat);
    try { setData(await getJSON(`/api/wiki?${p}`)); } catch (e) { if (e.status === 401) onAuthLost?.(); }
  }, [q, cat, onAuthLost]);
  useEffect(() => { const t = setTimeout(load, 220); return () => clearTimeout(t); }, [load]);
  useAdminDataSync(load);

  const open = async (it) => { try { setActive(await getJSON(`/api/wiki/${it.id}`)); } catch {} };
  const save = async () => {
    if (!edit.title.trim()) return;
    setBusy(true);
    try {
      if (edit.id) await sendJSON(`/api/admin/wiki/${edit.id}`, 'PATCH', edit);
      else await sendJSON('/api/admin/wiki', 'POST', edit);
      setEdit(null); emitAdminDataChange('wiki'); load();
    } catch (e) { if (e.status === 401) onAuthLost?.(); else alert(e.message || 'Не удалось'); }
    finally { setBusy(false); }
  };
  const del = async (it) => { if (!confirm('Удалить статью?')) return; try { await apiFetch(`/api/admin/wiki/${it.id}`, { method: 'DELETE' }); setActive(null); emitAdminDataChange('wiki'); load(); } catch {} };

  // ── Редактор ──
  if (edit) {
    return (
      <>
        <div className="nm-head"><h2>{edit.id ? 'Редактирование статьи' : 'Новая статья'}</h2>
          <button className="adm-ghost" onClick={() => setEdit(null)}>← Назад</button></div>
        <div className="wiki-editor">
          <input className="adm-input" placeholder="Заголовок статьи" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} autoFocus />
          <div className="wiki-ed-row">
            <input className="adm-input" placeholder="Категория" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
            <input className="adm-input" placeholder="Теги через запятую" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} />
          </div>
          <textarea className="adm-input wiki-body" placeholder="Текст статьи…" value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
          <div className="wiki-ed-foot">
            <button className="adm-ghost" onClick={() => setEdit(null)}>Отмена</button>
            <button className="adm-btn" onClick={save} disabled={busy || !edit.title.trim()}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="nm-head"><h2>База знаний</h2>
        {canEdit && <button className="adm-btn" onClick={() => setEdit({ ...EMPTY })}>+ Статья</button>}</div>
      <div className="adm-note">Внутренние регламенты и инструкции. Статьи находятся и через семантический поиск портала.</div>

      <input className="adm-input wiki-search" placeholder="Поиск по базе знаний…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="wiki-cats">
        <button className={`wiki-cat ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>Все</button>
        {data.categories.map((c) => <button key={c.category} className={`wiki-cat ${cat === c.category ? 'on' : ''}`} onClick={() => setCat(c.category)}>{c.category} <span>{c.c}</span></button>)}
      </div>

      <div className="wiki-grid">
        {data.items.length === 0 && <div className="adm-empty">Статей не найдено.</div>}
        {data.items.map((it) => (
          <button className="wiki-card" key={it.id} onClick={() => open(it)}>
            <span className="wiki-card-cat">{it.category}</span>
            <b>{it.title}</b>
            <small>{it.tags ? it.tags : it.author} · {fmt(it.updated_at)}</small>
          </button>
        ))}
      </div>

      {active && (
        <div className="wiki-modal-ov" onClick={() => setActive(null)}>
          <div className="wiki-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wiki-modal-h">
              <div><span className="wiki-card-cat">{active.category}</span><h3>{active.title}</h3></div>
              <button onClick={() => setActive(null)} aria-label="Закрыть">×</button>
            </div>
            <div className="wiki-modal-b">{active.body}</div>
            {active.tags && <div className="wiki-tags">{active.tags.split(',').map((t, i) => t.trim() && <span key={i}>#{t.trim()}</span>)}</div>}
            {canEdit && (
              <div className="wiki-modal-foot">
                <button className="adm-btn" onClick={() => { setEdit({ id: active.id, title: active.title, category: active.category, tags: active.tags, body: active.body }); setActive(null); }}>Редактировать</button>
                <button className="adm-ghost danger" onClick={() => del(active)}>Удалить</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

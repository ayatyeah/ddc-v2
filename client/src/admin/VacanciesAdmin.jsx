import { useCallback, useEffect, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';

const EMPTY = { title: '', department: '', location: 'Астана', employment: 'Полная занятость', description: '', published: true };

// Управление вакансиями: опубликованные показываются на странице «Карьера».
export default function VacanciesAdmin({ onAuthLost }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setItems(await getJSON('/api/admin/vacancies')); } catch (e) { if (e.status === 401) onAuthLost?.(); }
  }, [onAuthLost]);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    if (!form.title.trim()) { setErr('Укажите название вакансии'); return; }
    setBusy(true); setErr('');
    try {
      if (editId) await sendJSON(`/api/admin/vacancies/${editId}`, 'PATCH', form);
      else await sendJSON('/api/admin/vacancies', 'POST', form);
      setForm(EMPTY); setEditId(null); load();
    } catch (e) { if (e.status === 401) onAuthLost?.(); else setErr(e.message || 'Не удалось сохранить'); }
    finally { setBusy(false); }
  };
  const edit = (v) => {
    setEditId(v.id);
    setForm({ title: v.title, department: v.department, location: v.location, employment: v.employment, description: v.description, published: v.published });
  };
  const cancel = () => { setEditId(null); setForm(EMPTY); setErr(''); };
  const togglePub = async (v) => { try { await sendJSON(`/api/admin/vacancies/${v.id}`, 'PATCH', { published: !v.published }); load(); } catch (e) { if (e.status === 401) onAuthLost?.(); } };
  const remove = async (v) => {
    if (!window.confirm('Удалить вакансию?')) return;
    try { const r = await apiFetch(`/api/admin/vacancies/${v.id}`, { method: 'DELETE' }); if (r.status === 401) { onAuthLost?.(); return; } load(); } catch {}
  };

  return (
    <>
      <div className="nm-head"><h2>Вакансии</h2></div>
      <div className="adm-note">Опубликованные вакансии сразу появляются на странице «Карьера» сайта.</div>

      <div className="vac-form">
        <input className="adm-input" placeholder="Название вакансии" value={form.title} onChange={set('title')} />
        <input className="adm-input" placeholder="Отдел" value={form.department} onChange={set('department')} />
        <input className="adm-input" placeholder="Локация" value={form.location} onChange={set('location')} />
        <input className="adm-input" placeholder="Занятость" value={form.employment} onChange={set('employment')} />
        <textarea className="adm-input vac-form-desc" placeholder="Описание и требования…" value={form.description} onChange={set('description')} />
        <label className="vac-pub"><input type="checkbox" checked={form.published} onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))} /> Опубликовать на сайте</label>
        <div className="vac-form-actions">
          {editId && <button className="adm-ghost" onClick={cancel}>Отмена</button>}
          <button className="adm-btn" onClick={save} disabled={busy}>{busy ? 'Сохраняем…' : editId ? 'Сохранить изменения' : '+ Добавить вакансию'}</button>
        </div>
      </div>
      {err && <div className="adm-err">{err}</div>}

      <div className="vac-admin-list">
        {items.map((v) => (
          <div className={`vac-admin-card ${v.published ? '' : 'off'}`} key={v.id}>
            <div className="vac-admin-t">
              <b>{v.title} {!v.published && <span className="vac-off-tag">черновик</span>}</b>
              <small>{[v.department, v.location, v.employment].filter(Boolean).join(' · ')}</small>
            </div>
            <div className="vac-admin-act">
              <button className="nm-mini" onClick={() => togglePub(v)}>{v.published ? 'Снять с сайта' : 'Опубликовать'}</button>
              <button className="nm-mini" onClick={() => edit(v)}>Изменить</button>
              <button className="nm-mini del" onClick={() => remove(v)}>Удалить</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="adm-empty">Вакансий пока нет. Добавьте первую выше.</div>}
      </div>
    </>
  );
}

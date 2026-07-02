import { useCallback, useEffect, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';

const KINDS = [
  { id: 'vacation', label: 'Отпуск' }, { id: 'sick', label: 'Больничный' }, { id: 'trip', label: 'Командировка' },
  { id: 'certificate', label: 'Справка' }, { id: 'access', label: 'Доступ к системе' },
  { id: 'equipment', label: 'Закупка оборудования' }, { id: 'pass', label: 'Пропуск' }, { id: 'other', label: 'Другое' },
];
const STATUS = { review: ['На согласовании', '#c8960c'], approved: ['Одобрено', '#1f9d57'], rejected: ['Отклонено', '#c0455a'], done: ['Выполнено', '#2f6fe0'] };
const kindLabel = (id) => KINDS.find((k) => k.id === id)?.label || id;
const fmtDate = (v) => { try { return new Date(v).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };

// Раздел «Заявки»: сотрудник подаёт (отпуск/справка/доступ…), руководитель согласует.
export default function Requests({ me, onAuthLost }) {
  const isHead = ['admin', 'manager'].includes(me?.role);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ kind: 'vacation', title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => getJSON('/api/portal/requests').then(setItems).catch((e) => { if (e.status === 401) onAuthLost?.(); }), [onAuthLost]);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e?.preventDefault?.();
    if (!form.title.trim()) { setErr('Укажите заголовок заявки'); return; }
    setBusy(true); setErr('');
    try { await sendJSON('/api/portal/requests', 'POST', { kind: form.kind, title: form.title.trim(), body: form.body.trim() }); setForm({ kind: 'vacation', title: '', body: '' }); load(); }
    catch (e2) { if (e2.status === 401) onAuthLost?.(); else setErr(e2.message || 'Не удалось отправить'); }
    finally { setBusy(false); }
  };
  const decide = async (r, status) => { try { await sendJSON(`/api/portal/requests/${r.id}`, 'PATCH', { status }); load(); } catch (e) { if (e.status === 401) onAuthLost?.(); } };
  const del = async (r) => { if (!window.confirm('Удалить заявку?')) return; try { await apiFetch(`/api/portal/requests/${r.id}`, { method: 'DELETE' }); load(); } catch {} };

  return (
    <div className="pt-view">
      <div className="pt-view-h"><h2>Заявки</h2><span className="pt-hint">{isHead ? 'Согласование заявок сотрудников' : 'Отпуск, справка, доступ, командировка и т.п.'}</span></div>

      <form className="pt-reqform" onSubmit={create}>
        <select className="adm-input" value={form.kind}
          onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value, title: f.title || kindLabel(e.target.value) }))}>
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <input className="adm-input" placeholder="Заголовок (напр. «Отпуск с 10 по 20 июля»)" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        <textarea className="adm-input pt-req-body-in" placeholder="Детали заявки (необязательно)" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
        <button className="adm-btn" type="submit" disabled={busy}>{busy ? 'Отправляем…' : 'Подать заявку'}</button>
      </form>
      {err && <div className="adm-err">{err}</div>}

      <div className="pt-reqs">
        {items.length === 0 && <div className="pt-empty">Заявок пока нет.</div>}
        {items.map((r) => {
          const [lbl, col] = STATUS[r.status] || [r.status, '#8a8a8a'];
          const mine = r.author_id === me?.id;
          return (
            <div className="pt-req" key={r.id}>
              <div className="pt-req-top">
                <div className="pt-req-t">
                  <b>{r.title}</b>
                  <small>{r.kind_label || kindLabel(r.kind)} · {isHead && !mine ? `${r.author_name} · ` : ''}{fmtDate(r.created_at)}</small>
                </div>
                <span className="pt-req-st" style={{ background: col }}>{lbl}</span>
              </div>
              {r.body && <p className="pt-req-b">{r.body}</p>}
              <div className="pt-req-act">
                {isHead && r.status === 'review' && (<>
                  <button className="pt-req-btn ok" onClick={() => decide(r, 'approved')}>Одобрить</button>
                  <button className="pt-req-btn no" onClick={() => decide(r, 'rejected')}>Отклонить</button>
                </>)}
                {isHead && r.status === 'approved' && <button className="pt-req-btn" onClick={() => decide(r, 'done')}>Отметить выполненной</button>}
                {r.decided_by && r.status !== 'review' && <span className="pt-req-by">решение: {r.decided_by}</span>}
                {(mine || isHead) && <button className="nm-mini del" onClick={() => del(r)}>Удалить</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

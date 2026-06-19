import { useEffect, useState } from 'react';
import { getJSON, sendJSON } from '../api.js';

const EMPTY = {
  accepted_by: '', performed_by: '', will_return: '', revisions_count: 0,
  had_conflict: false, comm_quality: 0, q_budget: '', q_clarity: '', q_extra: '', notes: '',
};

const RETURN_OPTS = [['', '—'], ['yes', 'Да'], ['maybe', 'Возможно'], ['no', 'Нет']];

/* Оценочный лист по лиду (Фаза 3). Заполняет сотрудник после обслуживания.
   Опросник «для клиента» вносит сам сотрудник (по решению заказчика). */
export default function EvaluationModal({ lead, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    getJSON(`/api/leads/${lead.id}/evaluation`)
      .then((d) => { if (alive && d) setForm({ ...EMPTY, ...d, had_conflict: !!d.had_conflict }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [lead.id]);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await sendJSON(`/api/leads/${lead.id}/evaluation`, 'POST', {
        ...form,
        revisions_count: Number(form.revisions_count) || 0,
        comm_quality: Number(form.comm_quality) || 0,
      });
      onSaved?.(lead.id);
      onClose?.();
    } catch (e) {
      setErr(e.message || 'Не удалось сохранить');
    } finally { setBusy(false); }
  };

  return (
    <div className="eval-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="eval-modal">
        <h3>Оценочный лист</h3>
        <p className="sub">{lead.full_name}{lead.subject ? ` · ${lead.subject}` : ''}</p>

        <div className="eval-grid">
          <div className="eval-field">
            <label>Кто принял заказ</label>
            <input className="adm-input" value={form.accepted_by} onChange={set('accepted_by')} />
          </div>
          <div className="eval-field">
            <label>Кто выполнял</label>
            <input className="adm-input" value={form.performed_by} onChange={set('performed_by')} />
          </div>
          <div className="eval-field">
            <label>Будет работать с нами ещё?</label>
            <select className="adm-input" value={form.will_return} onChange={set('will_return')}>
              {RETURN_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="eval-field">
            <label>Кол-во правок</label>
            <input className="adm-input" type="number" min="0" value={form.revisions_count} onChange={set('revisions_count')} />
          </div>
          <div className="eval-field">
            <label>Качество коммуникации (0–5)</label>
            <select className="adm-input" value={form.comm_quality} onChange={set('comm_quality')}>
              {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="eval-field" style={{ justifyContent: 'flex-end' }}>
            <label className="eval-check">
              <input type="checkbox" checked={form.had_conflict} onChange={set('had_conflict')} />
              Был конфликт / напряжение
            </label>
          </div>

          <div className="eval-field full">
            <label>Опрос клиента · Бюджет / масштаб проекта</label>
            <textarea className="adm-input" value={form.q_budget} onChange={set('q_budget')} />
          </div>
          <div className="eval-field full">
            <label>Опрос клиента · Насколько чёткий запрос</label>
            <textarea className="adm-input" value={form.q_clarity} onChange={set('q_clarity')} />
          </div>
          <div className="eval-field full">
            <label>Опрос клиента · Дополнительно</label>
            <textarea className="adm-input" value={form.q_extra} onChange={set('q_extra')} />
          </div>
          <div className="eval-field full">
            <label>Заметки сотрудника</label>
            <textarea className="adm-input" value={form.notes} onChange={set('notes')} />
          </div>
        </div>

        {err && <div className="adm-err">{err}</div>}
        <div className="eval-actions">
          <button className="adm-ghost" onClick={onClose} disabled={busy}>Отмена</button>
          <button className="adm-btn" onClick={save} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  );
}

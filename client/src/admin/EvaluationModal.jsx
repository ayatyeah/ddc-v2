import { useEffect, useState } from 'react';
import { getJSON, sendJSON } from '../api.js';

const SPEED = [['', '—'], ['fast', 'Быстро'], ['medium', 'Средне'], ['slow', 'Долго']];
const PAID = [['', '—'], ['yes', 'Вовремя'], ['partial', 'С задержкой'], ['no', 'Не оплатил']];
const CLARITY = [['', '—'], ['low', 'Низкая'], ['medium', 'Средняя'], ['high', 'Высокая']];

const EMPTY = {
  response_speed: '', revisions: 0, paid_on_time: '', conflict: false, ts_clarity: '',
  repeat_prob: 5, comment: '',
  cost: 0, duration_days: 0, messages: 0, calls: 0, avg_response: '',
};

/* Оценочный лист = ФАКТЫ по сделке (заполняет сотрудник) + метрики проекта (пока вручную)
   + авто «сколько раз клиент уже обращался». Эти данные попадают в PDF-отчёт по клиенту. */
export default function EvaluationModal({ lead, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [prior, setPrior] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    getJSON(`/api/leads/${lead.id}/evaluation`)
      .then((d) => {
        if (!alive || !d) return;
        setPrior(d.prior_orders || 0);
        if (d.facts && typeof d.facts === 'object') setForm({ ...EMPTY, ...d.facts });
      })
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
      const facts = {
        ...form,
        revisions: Number(form.revisions) || 0,
        repeat_prob: Number(form.repeat_prob) || 0,
        cost: Number(form.cost) || 0,
        duration_days: Number(form.duration_days) || 0,
        messages: Number(form.messages) || 0,
        calls: Number(form.calls) || 0,
      };
      await sendJSON(`/api/leads/${lead.id}/evaluation`, 'POST', { facts });
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

        <div className="eval-sec">Факты по работе с клиентом</div>
        <div className="eval-grid">
          <div className="eval-field">
            <label>Скорость ответа клиента</label>
            <select className="adm-input" value={form.response_speed} onChange={set('response_speed')}>
              {SPEED.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="eval-field">
            <label>Оплата</label>
            <select className="adm-input" value={form.paid_on_time} onChange={set('paid_on_time')}>
              {PAID.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="eval-field">
            <label>Чёткость ТЗ</label>
            <select className="adm-input" value={form.ts_clarity} onChange={set('ts_clarity')}>
              {CLARITY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="eval-field">
            <label>Кол-во правок</label>
            <input className="adm-input" type="number" min="0" value={form.revisions} onChange={set('revisions')} />
          </div>
          <div className="eval-field full">
            <label>Вероятность повторного заказа (мнение сотрудника): <b>{form.repeat_prob} / 10</b></label>
            <input type="range" min="0" max="10" step="1" value={form.repeat_prob} onChange={set('repeat_prob')}
              style={{ width: '100%', accentColor: 'var(--blue)' }} />
          </div>
          <div className="eval-field full">
            <label className="eval-check">
              <input type="checkbox" checked={form.conflict} onChange={set('conflict')} /> Был конфликт / напряжение
            </label>
          </div>
        </div>

        <div className="eval-sec">Данные по проекту <small>(пока вносятся вручную)</small></div>
        <div className="eval-grid">
          <div className="eval-field"><label>Стоимость проекта, ₸</label><input className="adm-input" type="number" min="0" value={form.cost} onChange={set('cost')} /></div>
          <div className="eval-field"><label>Время выполнения, дней</label><input className="adm-input" type="number" min="0" value={form.duration_days} onChange={set('duration_days')} /></div>
          <div className="eval-field"><label>Кол-во сообщений</label><input className="adm-input" type="number" min="0" value={form.messages} onChange={set('messages')} /></div>
          <div className="eval-field"><label>Кол-во созвонов</label><input className="adm-input" type="number" min="0" value={form.calls} onChange={set('calls')} /></div>
          <div className="eval-field"><label>Средний ответ клиента</label><input className="adm-input" placeholder="напр. 2 часа" value={form.avg_response} onChange={set('avg_response')} /></div>
          <div className="eval-field"><label>Прошлых обращений <small>(авто)</small></label><input className="adm-input" value={String(prior)} readOnly disabled /></div>
        </div>

        <div className="eval-grid">
          <div className="eval-field full">
            <label>Комментарий</label>
            <textarea className="adm-input" value={form.comment} onChange={set('comment')} />
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

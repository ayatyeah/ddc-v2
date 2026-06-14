import { useCallback, useEffect, useRef, useState } from 'react';
import { getJSON, sendJSON } from '../api.js';

const STATUS_LABELS = { new: 'Новый', in_progress: 'В процессе', on_hold: 'Отложен', served: 'Обслужен', rejected: 'Отказ' };
const STATUS_ORDER = ['new', 'in_progress', 'on_hold', 'served', 'rejected'];
const FILTERS = [['', 'Все'], ['new', 'Новые'], ['in_progress', 'В процессе'], ['on_hold', 'Отложены'], ['served', 'Обслужены'], ['rejected', 'Отказ']];

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso || ''; }
}

function Row({ row, onPatch, canEdit }) {
  const [comment, setComment] = useState(row.admin_comment || '');
  const [saved, setSaved] = useState(false);

  const patch = (body) => onPatch(row.id, body);

  const saveComment = async () => {
    await patch({ admin_comment: comment });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <tr>
      <td data-label="Клиент">
        <div className="who-name">{row.full_name}</div>
        <div className="who-sub">{row.email || '—'}{row.phone ? ` · ${row.phone}` : ''}</div>
      </td>
      <td data-label="Вопрос">
        <div>{row.subject || '—'}</div>
        {row.message && <div className="who-sub">{row.message}</div>}
      </td>
      <td data-label="Статус">
        <select
          className={`status-select st-${row.status}`}
          value={row.status}
          disabled={!canEdit}
          onChange={(e) => patch({ status: e.target.value })}
        >
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </td>
      <td data-label="Оценка">
        <div className="stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`star ${n <= (row.rating || 0) ? 'on' : ''}`}
              disabled={!canEdit}
              onClick={() => patch({ rating: n === row.rating ? 0 : n })}
              aria-label={`${n}`}
            >★</button>
          ))}
        </div>
      </td>
      <td data-label="Комментарий">
        <div className="comment-box">
          <textarea className="adm-input" value={comment} readOnly={!canEdit} onChange={(e) => setComment(e.target.value)} />
          {canEdit && (
            <div className="save-row">
              <button className="btn-sm" onClick={saveComment}>Сохранить</button>
              <span className={`saved-tag ${saved ? 'show' : ''}`}>Сохранено ✓</span>
            </div>
          )}
        </div>
      </td>
      <td data-label="Дата" className="nowrap">{fmtDate(row.created_at)}</td>
    </tr>
  );
}

export default function Leads({ onAuthLost, canEdit = true }) {
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [empty, setEmpty] = useState(false);
  const debRef = useRef(0);

  const loadStats = useCallback(async () => {
    try { setStats(await getJSON('/api/stats')); } catch {}
  }, []);

  const loadLeads = useCallback(async (statusFilter, query) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (query) params.set('q', query);
    try {
      const data = await getJSON('/api/leads?' + params.toString());
      setRows(Array.isArray(data) ? data : []);
      setEmpty(!data.length);
    } catch (e) {
      if (e.status === 401) onAuthLost?.();
    }
  }, [onAuthLost]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadLeads(filter, q); }, [filter, loadLeads]); // q обрабатывается отдельно с дебаунсом

  const onSearch = (val) => {
    setQ(val);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => loadLeads(filter, val), 300);
  };

  const patch = async (id, body) => {
    try {
      const updated = await sendJSON(`/api/leads/${id}`, 'PATCH', body);
      setRows((rs) => rs.map((r) => (r.id === id ? updated : r)));
      loadStats();
    } catch (e) {
      if (e.status === 401) onAuthLost?.();
    }
  };

  return (
    <>
      <div className="adm-stats">
        <div className="adm-stat s-total"><div className="k">Всего клиентов</div><div className="v">{stats?.total ?? '—'}</div></div>
        <div className="adm-stat s-new"><div className="k">Новые</div><div className="v">{stats?.new ?? '—'}</div></div>
        <div className="adm-stat s-prog"><div className="k">В процессе</div><div className="v">{stats?.in_progress ?? '—'}</div></div>
        <div className="adm-stat s-hold"><div className="k">Отложены</div><div className="v">{stats?.on_hold ?? '—'}</div></div>
        <div className="adm-stat s-served"><div className="k">Обслужены</div><div className="v">{stats?.served ?? '—'}</div></div>
      </div>

      <div className="adm-toolbar">
        <input className="adm-input search" placeholder="Поиск по ФИО, email, телефону…" value={q} onChange={(e) => onSearch(e.target.value)} />
        <div className="adm-seg">
          {FILTERS.map(([f, label]) => (
            <button key={f} className={f === filter ? 'active' : ''} onClick={() => setFilter(f)}>{label}</button>
          ))}
        </div>
        <button className="adm-ghost" onClick={() => { loadStats(); loadLeads(filter, q); }}>Обновить</button>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Клиент</th><th>Вопрос</th><th>Статус</th><th>Оценка</th><th>Комментарий</th><th className="nowrap">Дата</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => <Row key={row.id} row={row} onPatch={patch} canEdit={canEdit} />)}
          </tbody>
        </table>
        {empty && <div className="adm-empty">Заявок пока нет.</div>}
      </div>
    </>
  );
}

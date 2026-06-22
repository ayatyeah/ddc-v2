import { useCallback, useEffect, useRef, useState } from 'react';
import { getJSON, sendJSON } from '../api.js';
import EvaluationModal from './EvaluationModal.jsx';

const STATUS_LABELS = { new: 'Новый', in_progress: 'В процессе', on_hold: 'Отложен', served: 'Обслужен', rejected: 'Отказ' };
const STATUS_ORDER = ['new', 'in_progress', 'on_hold', 'served', 'rejected'];
const FILTERS = [['', 'Все'], ['new', 'Новые'], ['in_progress', 'В процессе'], ['on_hold', 'Отложены'], ['served', 'Обслужены'], ['rejected', 'Отказ']];

// 7 осей AI-скоринга — для разворачиваемой разбивки под лидом
const AXIS_ORDER = ['value_ltv', 'lead_quality', 'conversion_prob', 'satisfaction', 'repeat_potential', 'risk', 'urgency'];
const AXIS_LABELS = {
  value_ltv: ['Ценность / LTV', 'масштаб, бюджет, повтор'],
  lead_quality: ['Качество заявки', 'конкретика, адекватность'],
  conversion_prob: ['Вероятность конверсии', 'станет ли оплатой'],
  satisfaction: ['Удовлетворённость', 'конфликт, правки, общение'],
  repeat_potential: ['Повторное сотрудничество', 'приведёт ли ещё'],
  risk: ['Риск / проблемность', 'анти-скоринг'],
  urgency: ['Срочность', ''],
};
function scoreClass(s) { if (s == null) return 's-none'; if (s >= 70) return 's-hi'; if (s >= 40) return 's-mid'; return 's-lo'; }

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso || ''; }
}

function Row({ row, onPatch, canEdit, highlight, onDelete, canAssign, staff, onAssign, showAssignee, expanded, onToggle, onOpenEval, colCount }) {
  const [comment, setComment] = useState(row.admin_comment || '');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setComment(row.admin_comment || ''); }, [row.admin_comment]);

  const patch = (body) => onPatch(row.id, body);
  const saveComment = async () => {
    await patch({ admin_comment: comment });
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };
  const axes = row.score_json && row.score_json.axes;

  return (
    <>
      {/* Сводка — кликабельна, разворачивает панель редактирования */}
      <tr id={`lead-${row.id}`} className={`lead-row ${highlight ? 'lead-flash' : ''} ${expanded ? 'is-open' : ''}`}
        onClick={() => onToggle(row.id)}>
        <td data-label="Клиент">
          <div className="who-name">{row.full_name}</div>
          <div className="who-sub">{row.email || '—'}{row.phone ? ` · ${row.phone}` : ''}</div>
        </td>
        <td data-label="Вопрос">
          <div className="lead-subject">{row.subject || '—'}</div>
          {row.message && <div className="who-sub lead-msg-1">{row.message}</div>}
        </td>
        <td data-label="Статус"><span className={`st-badge st-${row.status}`}>{STATUS_LABELS[row.status]}</span></td>
        <td data-label="Скор">
          {row.score != null
            ? <span className={`score-badge ${scoreClass(row.score)}`}>{row.score}</span>
            : <span className="score-badge s-none">—</span>}
        </td>
        {showAssignee && (
          <td data-label="Исполнитель">
            <span className={row.assignee_name || row.assignee_username ? 'who-name' : 'who-sub'}>
              {row.assignee_name || row.assignee_username || '— не назначен'}
            </span>
          </td>
        )}
        <td data-label="Дата" className="nowrap">
          <div>{fmtDate(row.created_at)}</div>
          {row.rating ? <div className="lead-rating-mini">{'★★★★★'.slice(0, row.rating)}<span className="off">{'★★★★★'.slice(row.rating)}</span></div> : null}
        </td>
        <td className="lead-chev" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </td>
      </tr>

      {/* Детальная панель: всё редактирование собрано здесь */}
      {expanded && (
        <tr className="lead-detail">
          <td colSpan={colCount}>
            <div className="ld-grid">
              <div className="ld-block ld-full">
                <div className="ld-lab">Вопрос клиента</div>
                <div className="ld-subject">{row.subject || '—'}</div>
                {row.message && <p className="ld-msg">{row.message}</p>}
              </div>

              <div className="ld-block">
                <div className="ld-lab">Статус</div>
                <select className={`status-select st-${row.status}`} value={row.status} disabled={!canEdit}
                  onChange={(e) => patch({ status: e.target.value })}>
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>

              {showAssignee && (
                <div className="ld-block">
                  <div className="ld-lab">Исполнитель</div>
                  {canAssign ? (
                    <select className="adm-input" value={row.assignee_id || ''} onChange={(e) => onAssign(row.id, e.target.value)}>
                      <option value="">— не назначен —</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {(s.full_name || s.username)}{s.department ? ` · ${s.department}` : ''}{s.role === 'manager' ? ' (нач.)' : ''}
                        </option>
                      ))}
                    </select>
                  ) : <div className="who-name">{row.assignee_name || row.assignee_username || '—'}</div>}
                </div>
              )}

              <div className="ld-block">
                <div className="ld-lab">Оценка клиента</div>
                <div className="stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={`star ${n <= (row.rating || 0) ? 'on' : ''}`} disabled={!canEdit}
                      onClick={() => patch({ rating: n === row.rating ? 0 : n })} aria-label={`${n}`}>★</button>
                  ))}
                </div>
              </div>

              <div className="ld-block ld-full">
                <div className="ld-lab">Комментарий менеджера</div>
                <textarea className="adm-input" value={comment} readOnly={!canEdit} onChange={(e) => setComment(e.target.value)} />
                {canEdit && (
                  <div className="save-row">
                    <button className="btn-sm" onClick={saveComment}>Сохранить</button>
                    <span className={`saved-tag ${saved ? 'show' : ''}`}>Сохранено ✓</span>
                  </div>
                )}
              </div>

              {axes && (
                <div className="ld-block ld-full">
                  <div className="ld-lab">AI-разбор по 7 осям</div>
                  {AXIS_ORDER.map((k) => {
                    const a = axes[k] || { score: 0, reason: '' };
                    return (
                      <div key={k}>
                        <div className="axis-row">
                          <div className="axis-name">{AXIS_LABELS[k][0]}<small>{AXIS_LABELS[k][1]}</small></div>
                          <div className={`axis-bar ${k === 'risk' ? 'risk' : ''}`}><span style={{ width: `${a.score}%` }} /></div>
                          <div className="axis-val">{a.score}</div>
                        </div>
                        {a.reason && <div className="axis-reason">{a.reason}</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              {canEdit && (
                <div className="ld-block ld-full ld-actions">
                  <button className={`eval-btn ${row.has_evaluation ? 'done' : ''}`} onClick={() => onOpenEval(row)}>
                    {row.has_evaluation ? 'Оценочный лист ✓' : 'Оценочный лист'}
                  </button>
                  <span className="sp" />
                  <button className="lead-del" onClick={() => onDelete(row.id, row.full_name)}>Удалить заявку</button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Leads({ onAuthLost, canEdit = true, canAssign = false, isStaff = false, focusId = null }) {
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [empty, setEmpty] = useState(false);
  const [evalLead, setEvalLead] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [sortScore, setSortScore] = useState(false);
  const debRef = useRef(0);
  const showAssignee = !isStaff;
  const colCount = showAssignee ? 7 : 6;

  const toggleScore = (id) => setExpanded((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const onSavedEval = (id) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, has_evaluation: true } : r)));

  const loadStats = useCallback(async () => {
    try { setStats(await getJSON('/api/stats')); } catch {}
  }, []);

  // Список сотрудников для дропдауна назначения (только тем, кто может назначать)
  useEffect(() => {
    if (!canAssign) return;
    let alive = true;
    getJSON('/api/admin/staff').then((d) => { if (alive) setStaff(Array.isArray(d) ? d : []); }).catch(() => {});
    return () => { alive = false; };
  }, [canAssign]);

  const assign = async (id, assigneeId) => {
    try {
      const updated = await sendJSON(`/api/leads/${id}/assign`, 'PATCH',
        { assignee_id: assigneeId === '' ? null : Number(assigneeId) });
      setRows((rs) => rs.map((r) => (r.id === id ? updated : r)));
    } catch (e) {
      if (e.status === 401) onAuthLost?.();
    }
  };

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

  useEffect(() => { if (focusId != null) { setFilter(''); setQ(''); } }, [focusId]);

  useEffect(() => {
    if (focusId == null) return;
    const el = document.getElementById(`lead-${focusId}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash-on'); setTimeout(() => el.classList.remove('flash-on'), 1800); }
  }, [rows, focusId]);

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

  const del = async (id, name) => {
    if (!window.confirm(`Удалить заявку от «${name || 'клиента'}»? Действие необратимо.`)) return;
    try {
      await sendJSON(`/api/leads/${id}`, 'DELETE');
      setRows((rs) => rs.filter((r) => r.id !== id));
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
        <button className={`adm-ghost ${sortScore ? 'active' : ''}`} onClick={() => setSortScore((v) => !v)}>
          {sortScore ? 'Сортировка: по скору ▼' : 'Сортировать по скору'}
        </button>
        <button className="adm-ghost" onClick={() => { loadStats(); loadLeads(filter, q); }}>Обновить</button>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Клиент</th><th>Вопрос</th><th>Статус</th><th>Скор</th>
              {showAssignee && <th>Исполнитель</th>}
              <th className="nowrap">Дата</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {(sortScore ? [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)) : rows).map((row) => (
              <Row key={row.id} row={row} onPatch={patch} canEdit={canEdit} highlight={focusId === row.id} onDelete={del}
                canAssign={canAssign} staff={staff} onAssign={assign} showAssignee={showAssignee}
                expanded={expanded.has(row.id)} onToggle={toggleScore} onOpenEval={setEvalLead} colCount={colCount} />
            ))}
          </tbody>
        </table>
        {empty && <div className="adm-empty">Заявок пока нет.</div>}
      </div>

      {evalLead && <EvaluationModal lead={evalLead} onClose={() => setEvalLead(null)} onSaved={onSavedEval} />}
    </>
  );
}

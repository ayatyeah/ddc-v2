import { useCallback, useEffect, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';
import { on as rtOn } from './realtime.js';

// Раздел «Опросы»: сотрудники голосуют, результаты обновляются вживую (SSE). Создают руководители.
export default function Polls({ me, onAuthLost }) {
  const isHead = ['admin', 'manager'].includes(me?.role);
  const [items, setItems] = useState([]);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => getJSON('/api/portal/polls').then(setItems).catch((e) => { if (e.status === 401) onAuthLost?.(); }), [onAuthLost]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => rtOn('poll', () => load()), [load]);   // живые результаты

  const vote = async (p, i) => {
    // оптимистично
    setItems((its) => its.map((x) => x.id !== p.id ? x : {
      ...x,
      counts: x.counts.map((c, idx) => idx === i ? c + (x.my_vote === i ? 0 : 1) : (idx === x.my_vote ? Math.max(0, c - 1) : c)),
      total: x.total + (x.my_vote == null ? 1 : 0),
      my_vote: i,
    }));
    try { await sendJSON(`/api/portal/polls/${p.id}/vote`, 'POST', { option: i }); } catch (e) { if (e.status === 401) onAuthLost?.(); load(); }
  };
  const create = async (e) => {
    e?.preventDefault?.();
    const options = opts.map((o) => o.trim()).filter(Boolean);
    if (!q.trim() || options.length < 2) { alert('Введите вопрос и минимум 2 варианта'); return; }
    setBusy(true);
    try { await sendJSON('/api/portal/polls', 'POST', { question: q.trim(), options }); setCreating(false); setQ(''); setOpts(['', '']); load(); }
    catch (e2) { if (e2.status === 401) onAuthLost?.(); else alert(e2.message || 'Не удалось'); }
    finally { setBusy(false); }
  };
  const del = async (p) => { if (!confirm('Удалить опрос?')) return; try { await apiFetch(`/api/portal/polls/${p.id}`, { method: 'DELETE' }); load(); } catch {} };

  return (
    <div className="pt-view">
      <div className="pt-view-h">
        <h2>Опросы</h2>
        <span className="pt-hint">Голосования сотрудников · результаты вживую</span>
        {isHead && <button className="adm-btn sm pt-view-act" onClick={() => setCreating((v) => !v)}>{creating ? '× Отмена' : '+ Опрос'}</button>}
      </div>

      {creating && (
        <form className="poll-form" onSubmit={create}>
          <input className="adm-input" placeholder="Вопрос опроса" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {opts.map((o, i) => (
            <div className="poll-opt-row" key={i}>
              <input className="adm-input" placeholder={`Вариант ${i + 1}`} value={o} onChange={(e) => setOpts((a) => a.map((x, j) => j === i ? e.target.value : x))} />
              {opts.length > 2 && <button type="button" className="poll-opt-x" onClick={() => setOpts((a) => a.filter((_, j) => j !== i))}>×</button>}
            </div>
          ))}
          <div className="poll-form-foot">
            {opts.length < 8 && <button type="button" className="adm-ghost" onClick={() => setOpts((a) => [...a, ''])}>+ вариант</button>}
            <button className="adm-btn" type="submit" disabled={busy}>{busy ? 'Создаём…' : 'Опубликовать опрос'}</button>
          </div>
        </form>
      )}

      <div className="polls">
        {items.length === 0 && <div className="pt-empty">Опросов пока нет.{isHead ? ' Создайте первый.' : ''}</div>}
        {items.map((p) => {
          const max = Math.max(1, ...p.counts);
          return (
            <div className="poll-card" key={p.id}>
              <div className="poll-q">
                <b>{p.question}</b>
                {(p.author_id === me?.id || me?.role === 'admin') && <button className="cal-del" onClick={() => del(p)} aria-label="Удалить">×</button>}
              </div>
              <div className="poll-opts">
                {p.options.map((o, i) => {
                  const c = p.counts[i] || 0;
                  const pct = p.total ? Math.round((c / p.total) * 100) : 0;
                  const mine = p.my_vote === i;
                  return (
                    <button key={i} className={`poll-opt ${mine ? 'mine' : ''}`} onClick={() => vote(p, i)}>
                      <span className="poll-bar" style={{ width: `${pct}%`, opacity: c === max && c > 0 ? 1 : 0.6 }} />
                      <span className="poll-opt-l">{mine ? '✓ ' : ''}{o}</span>
                      <span className="poll-opt-pct">{pct}%</span>
                    </button>
                  );
                })}
              </div>
              <div className="poll-foot">{p.total} голос{p.total % 10 === 1 && p.total % 100 !== 11 ? '' : p.total % 10 >= 2 && p.total % 10 <= 4 && (p.total % 100 < 10 || p.total % 100 >= 20) ? 'а' : 'ов'} · {p.author_name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

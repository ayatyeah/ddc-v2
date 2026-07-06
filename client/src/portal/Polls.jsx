import { useCallback, useEffect, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';
import { on as rtOn } from './realtime.js';

const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'голос' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'голоса' : 'голосов');

// Раздел «Опросы»: голосование (один или несколько вариантов), результаты вживую (SSE).
export default function Polls({ me, onAuthLost }) {
  const isHead = ['admin', 'manager'].includes(me?.role);
  const [items, setItems] = useState([]);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => getJSON('/api/portal/polls').then(setItems).catch((e) => { if (e.status === 401) onAuthLost?.(); }), [onAuthLost]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => rtOn('poll', () => load()), [load]);

  const vote = async (p, i) => {
    try { await sendJSON(`/api/portal/polls/${p.id}/vote`, 'POST', { option: i }); load(); }
    catch (e) { if (e.status === 401) onAuthLost?.(); else alert(e.message || 'Не удалось'); }
  };
  const create = async (e) => {
    e?.preventDefault?.();
    const options = opts.map((o) => o.trim()).filter(Boolean);
    if (!q.trim() || options.length < 2) { alert('Введите вопрос и минимум 2 варианта'); return; }
    setBusy(true);
    try { await sendJSON('/api/portal/polls', 'POST', { question: q.trim(), options, multi }); setCreating(false); setQ(''); setOpts(['', '']); setMulti(false); load(); }
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
          <label className="poll-multi">
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
            <span>Можно выбрать несколько вариантов</span>
          </label>
          <div className="poll-form-foot">
            {opts.length < 8 && <button type="button" className="adm-ghost" onClick={() => setOpts((a) => [...a, ''])}>+ вариант</button>}
            <button className="adm-btn" type="submit" disabled={busy}>{busy ? 'Создаём…' : 'Опубликовать опрос'}</button>
          </div>
        </form>
      )}

      <div className="polls">
        {items.length === 0 && <div className="pt-empty">Опросов пока нет.{isHead ? ' Создайте первый.' : ''}</div>}
        {items.map((p) => {
          const mine = p.my_votes || [];
          const max = Math.max(1, ...p.counts);
          return (
            <div className="poll-card" key={p.id}>
              <div className="poll-q">
                <b>{p.question}{p.multi && <span className="poll-multi-tag">несколько</span>}</b>
                {(p.author_id === me?.id || me?.role === 'admin') && <button className="cal-del" onClick={() => del(p)} aria-label="Удалить">×</button>}
              </div>
              <div className="poll-opts">
                {p.options.map((o, i) => {
                  const c = p.counts[i] || 0;
                  const pct = p.total ? Math.round((c / p.total) * 100) : 0;
                  const picked = mine.includes(i);
                  return (
                    <button key={i} className={`poll-opt ${picked ? 'mine' : ''} ${p.multi ? 'multi' : ''}`} onClick={() => vote(p, i)}>
                      <span className="poll-bar" style={{ width: `${pct}%`, opacity: c === max && c > 0 ? 1 : 0.6 }} />
                      <span className="poll-opt-mark">{picked ? (p.multi ? '☑' : '◉') : (p.multi ? '☐' : '◯')}</span>
                      <span className="poll-opt-l">{o}</span>
                      <span className="poll-opt-pct">{pct}%</span>
                    </button>
                  );
                })}
              </div>
              <div className="poll-foot">{p.total} {plural(p.total)}{p.multi ? ' · выбор нескольких' : ''} · {p.author_name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

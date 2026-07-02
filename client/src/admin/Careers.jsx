import { useCallback, useEffect, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';

// Рекомендации ИИ → подпись + цвет
const REC = { invite: ['Пригласить', '#1f9d57'], maybe: ['Под вопросом', '#c8960c'], reject: ['Не подходит', '#c0455a'] };
const fmtDate = (v) => { try { return new Date(v).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const scoreColor = (s) => (s >= 70 ? '#1f9d57' : s >= 45 ? '#c8960c' : '#c0455a');

export default function Careers({ onAuthLost }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { setItems(await getJSON('/api/admin/careers')); }
    catch (e) { if (e.status === 401) onAuthLost?.(); }
    finally { setLoaded(true); }
  }, [onAuthLost]);
  useEffect(() => { load(); }, [load]);

  const analyze = async (id) => {
    setBusy(id);
    try {
      const r = await sendJSON(`/api/admin/careers/${id}/analyze`, 'POST', {});
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, fit_score: r.fit_score, verdict: r.verdict, analyzed_at: r.analyzed_at } : x)));
    } catch (e) { if (e.status === 401) onAuthLost?.(); else alert(e.message || 'ИИ недоступен'); }
    finally { setBusy(null); }
  };

  const remove = async (id) => {
    if (!window.confirm('Удалить отклик? Кандидат и его CV будут удалены.')) return;
    try { const r = await apiFetch(`/api/leads/${id}`, { method: 'DELETE' }); if (r.status === 401) { onAuthLost?.(); return; } setItems((prev) => prev.filter((x) => x.id !== id)); } catch {}
  };

  const analyzed = items.filter((c) => typeof c.fit_score === 'number');
  const avg = analyzed.length ? Math.round(analyzed.reduce((s, c) => s + c.fit_score, 0) / analyzed.length) : null;

  return (
    <>
      <div className="nm-head"><h2>Отклики на вакансии</h2></div>
      <div className="adm-note">
        Кандидаты с формы «Карьера». ИИ оценивает пригодность по отклику (скор 0–100, сильные/слабые стороны, рекомендация).
        Резюме скачивается по кнопке. Всего откликов: <b>{items.length}</b>{avg !== null ? <> · средний скор проанализированных: <b>{avg}</b></> : null}.
      </div>

      <div className="cr-list">
        {items.map((c) => {
          const v = c.verdict || {};
          const hasAi = v && typeof v.summary === 'string' && v.summary;
          const rec = REC[v.recommendation];
          return (
            <div className="cr-card" key={c.id}>
              <div className="cr-top">
                <div className="cr-id">
                  <div className="cr-name">{c.full_name}</div>
                  <div className="cr-meta">{c.subject || 'Отклик'} · {fmtDate(c.created_at)}</div>
                  <div className="cr-contacts">
                    {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
                  </div>
                </div>
                {typeof c.fit_score === 'number' && (
                  <div className="cr-score" style={{ color: scoreColor(c.fit_score) }}>{c.fit_score}<small>/100</small></div>
                )}
              </div>

              {c.message && <p className="cr-msg">{c.message}</p>}

              <div className="cr-actions">
                {c.cv_file_id
                  ? <a className="adm-ghost" href={`/api/files/${c.cv_file_id}`} target="_blank" rel="noreferrer">📎 Резюме{c.cv_name ? `: ${c.cv_name}` : ''}</a>
                  : <span className="cr-nocv">Резюме не приложено</span>}
                <button className="adm-btn" onClick={() => analyze(c.id)} disabled={busy === c.id}>
                  {busy === c.id ? 'Анализ…' : hasAi ? 'Переанализировать' : 'ИИ-анализ кандидата'}
                </button>
                <button className="nm-mini del" onClick={() => remove(c.id)}>Удалить</button>
              </div>

              {hasAi && (
                <div className="cr-ai">
                  {rec && <span className="cr-rec" style={{ background: rec[1] }}>{rec[0]}</span>}
                  <p className="cr-sum">{v.summary}</p>
                  <div className="cr-cols">
                    {v.strengths?.length > 0 && (
                      <div className="cr-col"><b>Сильные стороны</b><ul>{v.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
                    )}
                    {v.risks?.length > 0 && (
                      <div className="cr-col cr-risk"><b>Риски / пробелы</b><ul>{v.risks.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
                    )}
                  </div>
                  {v.reason && <p className="cr-reason">💡 {v.reason}</p>}
                </div>
              )}
            </div>
          );
        })}
        {loaded && items.length === 0 && (
          <div className="adm-empty">Откликов пока нет. Они появятся после заполнения формы на странице «Карьера» (с резюме).</div>
        )}
      </div>
    </>
  );
}

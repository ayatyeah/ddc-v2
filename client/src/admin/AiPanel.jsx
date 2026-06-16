import { useEffect, useState } from 'react';
import { getJSON, sendJSON } from '../api.js';

const PRI = { high: { t: 'Высокий', c: '#e2483d' }, medium: { t: 'Средний', c: '#c8901f' }, low: { t: 'Низкий', c: '#1f9d63' } };

export default function AiPanel({ onAuthLost, onOpenLead }) {
  const [a, setA] = useState(null);
  const [cachedAt, setCachedAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    getJSON('/api/admin/ai/analysis')
      .then((d) => { if (d.analysis) { setA(d.analysis); setCachedAt(d.cached_at); } })
      .catch((e) => { if (e.status === 401) onAuthLost?.(); });
  }, [onAuthLost]);

  const run = async (force) => {
    setBusy(true); setErr(''); setNote('');
    try {
      const d = await sendJSON('/api/admin/ai/analyze', 'POST', { force });
      setA(d.analysis); setCachedAt(d.cached_at || new Date().toISOString());
      setNote(d.fromCache ? 'Показан кэш (заявки не менялись — запрос к ИИ не тратился).' : 'Анализ обновлён.');
    } catch (e) {
      if (e.status === 401) return onAuthLost?.();
      setErr(e.data?.error || 'Не удалось выполнить анализ');
    } finally { setBusy(false); }
  };

  return (
    <div className="ai-wrap">
      <div className="ai-head">
        <div>
          <h2 className="ai-title">ИИ-аналитика клиентов</h2>
          <p className="ai-sub">Оценка важности клиентов и ключевых проблем по заявкам. Результат кэшируется — повторный запуск не тратит запрос, пока заявки не изменились.</p>
        </div>
        <div className="ai-actions">
          <button className="adm-btn" onClick={() => run(false)} disabled={busy}>{busy ? 'Анализирую…' : (a ? 'Проверить' : 'Запустить анализ')}</button>
          <button className="adm-ghost" onClick={() => run(true)} disabled={busy} title="Игнорировать кэш">Обновить заново</button>
        </div>
      </div>

      {err && <div className="ai-err">{err}</div>}
      {note && <div className="ai-note">{note}</div>}
      {cachedAt && <div className="ai-meta">Последний анализ: {new Date(cachedAt).toLocaleString('ru-RU')}</div>}

      {!a && !busy && <div className="ai-empty">Нажмите «Запустить анализ», чтобы ИИ оценил клиентов и их запросы.</div>}

      {a && (
        <div className="ai-grid">
          {a.summary && (
            <section className="ai-card ai-summary">
              <div className="ai-card-h">Сводка</div>
              <p>{a.summary}</p>
            </section>
          )}

          {Array.isArray(a.important_clients) && a.important_clients.length > 0 && (
            <section className="ai-card">
              <div className="ai-card-h">Важные клиенты</div>
              <ul className="ai-clients">
                {a.important_clients.map((c, i) => (
                  <li key={i}>
                    <span className="ai-pri" style={{ background: (PRI[c.priority] || PRI.medium).c }}>{(PRI[c.priority] || PRI.medium).t}</span>
                    <div>
                      <div className="ai-cname">
                        {c.id ? <button className="ai-link" onClick={() => onOpenLead?.(c.id)}>{c.name} <span className="ai-id">#{c.id} ↗</span></button> : <span>{c.name}</span>}
                      </div>
                      <div className="ai-reason">{c.reason}</div>
                      {c.action && <div className="ai-action">→ {c.action}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {Array.isArray(a.main_problems) && a.main_problems.length > 0 && (
            <section className="ai-card">
              <div className="ai-card-h">Главные проблемы</div>
              <ul className="ai-probs">
                {a.main_problems.map((p, i) => (
                  <li key={i}><b>{p.problem}</b>{(p.action || p.detail) ? <div className="ai-action">→ {p.action || p.detail}</div> : null}</li>
                ))}
              </ul>
            </section>
          )}

          {Array.isArray(a.recommendations) && a.recommendations.length > 0 && (
            <section className="ai-card">
              <div className="ai-card-h">Рекомендации</div>
              <ul className="ai-recs">{a.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

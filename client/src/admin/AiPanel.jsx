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
          <h2 className="ai-title">ИИ-анализ обращений</h2>
          <p className="ai-sub">ИИ анализирует людей, заполнивших форму на сайте: сегменты заявителей, частые темы запросов и отдельные важные обращения. Результаты кэшируются.</p>
        </div>
        <div className="ai-actions">
          <button className="adm-btn" onClick={() => run(false)} disabled={busy}>{busy ? 'Работаю…' : (a ? 'Проверить' : 'Запустить анализ')}</button>
          <button className="adm-ghost" onClick={() => run(true)} disabled={busy} title="Игнорировать кэш">Обновить заново</button>
        </div>
      </div>

      {err && <div className="ai-err">{err}</div>}
      {note && <div className="ai-note">{note}</div>}
      {cachedAt && <div className="ai-meta">Последний анализ: {new Date(cachedAt).toLocaleString('ru-RU')}</div>}

      {!a && !busy && <div className="ai-empty">Нажмите «Запустить анализ», чтобы ИИ разобрал, кто и зачем заполняет форму.</div>}

      {a && (
        <div className="ai-grid">
          {a.summary && (
            <section className="ai-card ai-summary">
              <div className="ai-card-h">Сводка</div>
              <p>{a.summary}</p>
            </section>
          )}

          {Array.isArray(a.segments) && a.segments.length > 0 && (
            <section className="ai-card">
              <div className="ai-card-h">Сегменты заявителей</div>
              <ul className="ai-segments">
                {a.segments.map((s, i) => (
                  <li key={i}>
                    <div className="ai-cname">
                      {s.name}{s.count != null ? <span className="ai-id"> · {s.count}</span> : null}
                    </div>
                    {s.description && <div className="ai-reason">{s.description}</div>}
                    {s.action && <div className="ai-action">→ {s.action}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {Array.isArray(a.topics) && a.topics.length > 0 && (
            <section className="ai-card">
              <div className="ai-card-h">Частые темы запросов</div>
              <ul className="ai-topics">
                {a.topics.map((t, i) => (
                  <li key={i}><span>{t.topic}</span>{t.count != null ? <b className="ai-id">{t.count}</b> : null}</li>
                ))}
              </ul>
            </section>
          )}

          {Array.isArray(a.important_clients) && a.important_clients.length > 0 && (
            <section className="ai-card">
              <div className="ai-card-h">Важные обращения</div>
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

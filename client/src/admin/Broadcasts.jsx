import { useCallback, useEffect, useState } from 'react';
import { getJSON, sendJSON } from '../api.js';

const ROLE_OPTS = [
  ['role:admin', 'Роль: Администраторы'],
  ['role:manager', 'Роль: Начальники отделов'],
  ['role:staff', 'Роль: Сотрудники'],
  ['role:editor', 'Роль: Редакторы'],
  ['role:viewer', 'Роль: Просмотр'],
];
const CHAN = { portal: 'Уведомление', news: 'Новость + уведомление' };
const fmt = (ts) => { try { return new Date(ts).toLocaleString('ru-RU'); } catch { return ''; } };

// Таблицы, доступные для выгрузки (совпадает с сервером EXPORT_TABLES)
const EXPORT = [
  ['users', 'Пользователи'], ['leads', 'Заявки'], ['news', 'Новости'], ['services', 'Услуги'],
  ['departments', 'Отделы'], ['tasks', 'Задачи'], ['systems', 'ИТ-системы'], ['incidents', 'Инциденты'],
  ['wiki', 'База знаний'], ['audit_log', 'История действий'], ['broadcasts', 'Рассылки'],
];

export default function Broadcasts({ onAuthLost, isAdmin }) {
  const [depts, setDepts] = useState([]);
  const [hist, setHist] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', audience: 'all', channel: 'portal' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await getJSON('/api/admin/broadcasts');
      setDepts(r.departments || []); setHist(r.broadcasts || []);
    } catch (e) { if (e.status === 401) onAuthLost?.(); }
  }, [onAuthLost]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!form.title.trim() || !form.body.trim()) { setErr('Заполните заголовок и текст'); return; }
    if (!window.confirm('Отправить рассылку выбранной аудитории?')) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await sendJSON('/api/admin/broadcasts', 'POST', { ...form, title: form.title.trim(), body: form.body.trim() });
      setMsg(`Доставлено получателям: ${r.recipients}`);
      setForm({ title: '', body: '', audience: 'all', channel: 'portal' });
      load();
    } catch (e) { if (e.status === 401) onAuthLost?.(); else setErr(e.message || 'Не удалось отправить'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="nm-head"><h2>Массовая рассылка</h2></div>
      <div className="adm-note">Мгновенная доставка in-app уведомления сотрудникам (по SSE) с фолбэком через опрос. При выборе «Новость» сообщение также публикуется в ленте портала.</div>

      <div className="bc-compose">
        <input className="adm-input" placeholder="Заголовок рассылки" value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={200} />
        <textarea className="adm-input bc-body" placeholder="Текст сообщения…" value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} maxLength={4000} rows={5} />
        <div className="bc-row">
          <label className="bc-lbl">Аудитория
            <select className="adm-input" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
              <option value="all">Все сотрудники</option>
              {ROLE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {depts.map((d) => <option key={d} value={`dept:${d}`}>Отдел: {d}</option>)}
            </select>
          </label>
          <label className="bc-lbl">Канал
            <select className="adm-input" value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
              {Object.entries(CHAN).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <button className="adm-btn" onClick={send} disabled={busy} style={{ alignSelf: 'flex-end' }}>{busy ? 'Отправка…' : 'Отправить'}</button>
        </div>
        {err && <div className="adm-err">{err}</div>}
        {msg && <div className="adm-ok">{msg}</div>}
      </div>

      <div className="nm-head" style={{ marginTop: 26 }}><h2>История рассылок</h2></div>
      {hist.length === 0 ? <div className="adm-empty">Рассылок пока не было.</div> : (
        <div className="bc-hist">
          {hist.map((b) => (
            <div className="bc-item" key={b.id}>
              <div className="bc-item-b">
                <b>{b.title}</b>
                <p>{b.body}</p>
                <small>{b.author} · {CHAN[b.channel] || b.channel} · {b.audience === 'all' ? 'все' : b.audience} · {fmt(b.created_at)}</small>
              </div>
              <span className="bc-count">{b.recipients} <small>чел.</small></span>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (<>
        <div className="nm-head" style={{ marginTop: 30 }}><h2>Экспорт и резервная копия</h2></div>
        <div className="adm-note">Выгрузка данных для отчётности и бэкапа. CSV — по отдельной таблице (Excel, UTF-8), JSON — полный снимок всех таблиц.</div>
        <div className="bc-export">
          <a className="adm-btn bc-backup" href="/api/admin/backup.json">⬇ Полный бэкап (JSON)</a>
          <div className="bc-csv-grid">
            {EXPORT.map(([t, l]) => (
              <a key={t} className="adm-ghost sm" href={`/api/admin/export/${t}.csv`}>⬇ {l} <span className="bc-csv-tag">CSV</span></a>
            ))}
          </div>
        </div>
      </>)}
    </>
  );
}

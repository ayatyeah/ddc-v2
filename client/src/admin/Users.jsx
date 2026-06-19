import { useCallback, useEffect, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';

const ROLES = [
  ['admin', 'Администратор'],
  ['manager', 'Начальник отдела'],
  ['staff', 'Сотрудник'],
  ['editor', 'Редактор'],
  ['viewer', 'Просмотр'],
];
const roleLabel = (r) => (ROLES.find(([k]) => k === r)?.[1] || r);

function fmtDate(v) {
  try { return new Date(v).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return ''; }
}

export default function Users({ onAuthLost, me }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', department: '', role: 'staff' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await getJSON('/api/admin/users')); }
    catch (e) { if (e.status === 401) onAuthLost?.(); }
    finally { setLoaded(true); }
  }, [onAuthLost]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true); setErr('');
    try {
      await sendJSON('/api/admin/users', 'POST', form);
      setForm({ username: '', password: '', full_name: '', department: '', role: 'staff' });
      load();
    } catch (e) {
      if (e.status === 401) { onAuthLost?.(); return; }
      setErr(e.message || 'Не удалось создать');
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Удалить пользователя?')) return;
    try {
      const r = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (r.status === 401) { onAuthLost?.(); return; }
      load();
    } catch {}
  };

  return (
    <>
      <div className="nm-head"><h2>Пользователи</h2></div>

      <div className="us-create">
        <input className="adm-input" placeholder="Логин" value={form.username}
          onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} autoComplete="off" />
        <input className="adm-input" placeholder="ФИО" value={form.full_name}
          onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} autoComplete="off" />
        <input className="adm-input" placeholder="Отдел" value={form.department}
          onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} autoComplete="off" />
        <input className="adm-input" type="password" placeholder="Пароль (от 4 символов)" value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
        <select className="adm-input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
          {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="adm-btn" onClick={create} disabled={busy}>{busy ? 'Создаём…' : '+ Добавить'}</button>
      </div>
      {err && <div className="adm-err">{err}</div>}
      <div className="adm-note">Суперадмин из .env (<b>{me?.username}</b>) работает всегда и в списке не отображается.</div>

      <div className="adm-table-wrap" style={{ marginTop: 14 }}>
        <table className="adm-table">
          <thead><tr><th>Логин</th><th>ФИО</th><th>Отдел</th><th>Роль</th><th>Создан</th><th></th></tr></thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td data-label="Логин"><div className="who-name">{u.username}</div></td>
                <td data-label="ФИО">{u.full_name || '—'}</td>
                <td data-label="Отдел">{u.department || '—'}</td>
                <td data-label="Роль"><span className={`us-role r-${u.role}`}>{roleLabel(u.role)}</span></td>
                <td data-label="Создан" className="nowrap">{fmtDate(u.created_at)}</td>
                <td data-label=""><button className="nm-mini del" onClick={() => remove(u.id)}>Удалить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && items.length === 0 && <div className="adm-empty">Пользователей пока нет. Создайте первого выше.</div>}
      </div>
    </>
  );
}

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
  const [depts, setDepts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', phone: '', department: '', role: 'staff', birth_date: '' });
  const [dept, setDept] = useState({ name: '', descr: '' });
  const [err, setErr] = useState('');
  const [derr, setDerr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dbusy, setDbusy] = useState(false);

  const authGuard = useCallback((e) => { if (e.status === 401) { onAuthLost?.(); return true; } return false; }, [onAuthLost]);

  const load = useCallback(async () => {
    try {
      const [u, d] = await Promise.all([getJSON('/api/admin/users'), getJSON('/api/admin/departments')]);
      setItems(u); setDepts(d);
    } catch (e) { authGuard(e); }
    finally { setLoaded(true); }
  }, [authGuard]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (form.full_name.trim().split(/\s+/).filter(Boolean).length < 2) { setErr('Укажите ФИО полностью (фамилия и имя)'); return; }
    if (form.phone.replace(/\D/g, '').length < 10) { setErr('Укажите корректный номер телефона'); return; }
    if (!form.birth_date) { setErr('Укажите дату рождения сотрудника'); return; }
    setBusy(true); setErr('');
    try {
      await sendJSON('/api/admin/users', 'POST', form);
      setForm({ username: '', password: '', full_name: '', phone: '', department: '', role: 'staff', birth_date: '' });
      load();
    } catch (e) {
      if (authGuard(e)) return;
      setErr(e.message || 'Не удалось создать');
    } finally { setBusy(false); }
  };

  const resetPass = async (u) => {
    const pass = window.prompt(`Новый пароль для «${u.username}» (от 4 символов):`);
    if (pass == null) return;
    if (pass.length < 4) { alert('Пароль должен быть не короче 4 символов'); return; }
    try { await sendJSON(`/api/admin/users/${u.id}/password`, 'POST', { password: pass }); alert(`Пароль пользователя «${u.username}» изменён.`); }
    catch (e) { if (!authGuard(e)) alert(e.message || 'Не удалось сменить пароль'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Удалить пользователя?')) return;
    try {
      const r = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (r.status === 401) { onAuthLost?.(); return; }
      load();
    } catch {}
  };

  // Раскидать по отделам: инлайн-смена отдела пользователя
  const assign = async (id, department) => {
    setItems((prev) => prev.map((u) => (u.id === id ? { ...u, department } : u)));   // оптимистично
    try { await sendJSON(`/api/admin/users/${id}`, 'PATCH', { department }); load(); }
    catch (e) { if (!authGuard(e)) { setErr(e.message || 'Не удалось обновить'); load(); } }
  };

  const createDept = async () => {
    setDbusy(true); setDerr('');
    try {
      await sendJSON('/api/admin/departments', 'POST', dept);
      setDept({ name: '', descr: '' });
      load();
    } catch (e) {
      if (authGuard(e)) return;
      setDerr(e.message || 'Не удалось создать отдел');
    } finally { setDbusy(false); }
  };

  const removeDept = async (id, name) => {
    if (!window.confirm(`Удалить отдел «${name}»? Сотрудники будут откреплены от него.`)) return;
    try {
      const r = await apiFetch(`/api/admin/departments/${id}`, { method: 'DELETE' });
      if (r.status === 401) { onAuthLost?.(); return; }
      load();
    } catch {}
  };

  return (
    <>
      {/* ── Отделы ── */}
      <div className="nm-head"><h2>Отделы</h2></div>
      <div className="us-create">
        <input className="adm-input" placeholder="Название отдела" value={dept.name}
          onChange={(e) => setDept((d) => ({ ...d, name: e.target.value }))} autoComplete="off" />
        <input className="adm-input" placeholder="Описание (необязательно)" value={dept.descr}
          onChange={(e) => setDept((d) => ({ ...d, descr: e.target.value }))} autoComplete="off"
          style={{ flex: 2 }} />
        <button className="adm-btn" onClick={createDept} disabled={dbusy}>{dbusy ? 'Создаём…' : '+ Отдел'}</button>
      </div>
      {derr && <div className="adm-err">{derr}</div>}
      <div className="us-depts">
        {depts.map((d) => (
          <div key={d.id} className="us-dept">
            <div className="us-dept-t">
              <b>{d.name}</b>
              <span className="us-dept-c">{d.members} чел.</span>
            </div>
            {d.descr && <p>{d.descr}</p>}
            <button className="nm-mini del" onClick={() => removeDept(d.id, d.name)}>Удалить</button>
          </div>
        ))}
        {loaded && depts.length === 0 && <div className="adm-empty">Отделов пока нет. Создайте первый выше.</div>}
      </div>

      {/* ── Пользователи ── */}
      <div className="nm-head" style={{ marginTop: 26 }}><h2>Пользователи</h2></div>

      <div className="us-create">
        <input className="adm-input" placeholder="Логин" value={form.username}
          onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} autoComplete="off" />
        <input className="adm-input" placeholder="ФИО полностью *" title="Фамилия и имя обязательны" value={form.full_name}
          onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} autoComplete="off" required />
        <input className="adm-input" type="tel" placeholder="Телефон *" title="Телефон обязателен" value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} autoComplete="off" inputMode="tel" required />
        <select className="adm-input" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}>
          <option value="">— без отдела —</option>
          {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <input className="adm-input" type="password" placeholder="Пароль (от 4 символов)" value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
        <input className="adm-input" type="date" title="Дата рождения (обязательно)" value={form.birth_date}
          onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))} required />
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
                <td data-label="Отдел">
                  <select className="us-assign" value={u.department || ''} onChange={(e) => assign(u.id, e.target.value)}>
                    <option value="">— без отдела —</option>
                    {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                    {/* если отдел пользователя не из списка (устаревший) — показываем как есть */}
                    {u.department && !depts.some((d) => d.name === u.department) && <option value={u.department}>{u.department}</option>}
                  </select>
                </td>
                <td data-label="Роль"><span className={`us-role r-${u.role}`}>{roleLabel(u.role)}</span></td>
                <td data-label="Создан" className="nowrap">{fmtDate(u.created_at)}</td>
                <td data-label=""><button className="nm-mini" onClick={() => resetPass(u)}>Пароль</button> <button className="nm-mini del" onClick={() => remove(u.id)}>Удалить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && items.length === 0 && <div className="adm-empty">Пользователей пока нет. Создайте первого выше.</div>}
      </div>
    </>
  );
}

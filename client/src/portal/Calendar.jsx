import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJSON, sendJSON } from '../api.js';
import { on as rtOn } from './realtime.js';

// Типы событий календаря + цвет/подпись. birthday/task/holiday вычисляются на сервере;
// meeting/presentation создаёт сотрудник, holiday — только админ.
// label — для фильтров (мн. число), one — подпись в карточке события (ед. число).
const KINDS = {
  birthday: { label: 'Дни рождения', one: 'День рождения', color: '#b07d12' },
  meeting: { label: 'Встречи', one: 'Встреча', color: '#2f6fe0' },
  presentation: { label: 'Презентации', one: 'Презентация', color: '#5a3fd6' },
  task: { label: 'Мои задачи', one: 'Задача', color: '#0a8a5a' },
  holiday: { label: 'Праздники', one: 'Праздник', color: '#c0455a' },
  other: { label: 'Другое', one: 'Событие', color: '#0a7aa8' },
};
// Имя автора в карточке: техническую учётку admin показываем по-человечески.
const authorLabel = (n) => (n === 'admin' ? 'Администратор' : n);
const FILTERS = ['birthday', 'meeting', 'presentation', 'task', 'holiday'];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayStr = () => { const n = new Date(); return ymd(n.getFullYear(), n.getMonth(), n.getDate()); };

export default function Calendar({ me, onAuthLost }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [events, setEvents] = useState([]);
  const [active, setActive] = useState(new Set(FILTERS));   // включённые фильтры
  const [sel, setSel] = useState(todayStr());
  const [form, setForm] = useState(null);   // объект формы создания или null
  const isAdmin = me?.role === 'admin';

  const range = useMemo(() => {
    const from = ymd(ym.y, ym.m, 1);
    const last = new Date(ym.y, ym.m + 1, 0).getDate();
    const to = ymd(ym.y, ym.m, last);
    return { from, to, last };
  }, [ym]);

  const load = useCallback(async () => {
    try { setEvents(await getJSON(`/api/portal/events?from=${range.from}&to=${range.to}`)); }
    catch (e) { if (e.status === 401) onAuthLost?.(); }
  }, [range.from, range.to, onAuthLost]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => rtOn('event', () => load()), [load]);   // живое обновление: ДиДи/коллега изменил календарь

  // События по дню (YYYY-MM-DD), уже отфильтрованные активными типами.
  const byDay = useMemo(() => {
    const map = {};
    for (const e of events) {
      if (!active.has(e.kind)) continue;
      const d = String(e.starts_at).slice(0, 10);
      (map[d] = map[d] || []).push(e);
    }
    return map;
  }, [events, active]);

  // Сетка месяца (6 недель, Пн–Вс)
  const cells = useMemo(() => {
    const firstWd = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7;   // Пн=0
    const out = [];
    for (let i = 0; i < firstWd; i++) out.push(null);
    for (let d = 1; d <= range.last; d++) out.push(ymd(ym.y, ym.m, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [ym, range.last]);

  const shift = (delta) => setYm(({ y, m }) => { const nm = m + delta; return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }; });
  const toggleFilter = (k) => setActive((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const dayEvents = byDay[sel] || [];

  const openCreate = () => setForm({ mode: 'create', kind: 'meeting', title: '', date: sel, time: '10:00', all_day: false, descr: '' });
  const openEdit = (ev) => {
    const iso = String(ev.starts_at || '');
    const date = iso.slice(0, 10) || sel;
    const time = ev.all_day ? '10:00' : (iso.slice(11, 16) || '10:00');
    setForm({ mode: 'edit', id: ev.id, kind: KINDS[ev.kind] ? ev.kind : 'other', title: ev.title || '', date, time, all_day: !!ev.all_day, descr: ev.descr || '' });
  };
  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.title.trim()) return;
    const starts_at = form.all_day ? `${form.date}T00:00:00` : `${form.date}T${form.time || '00:00'}:00`;
    try {
      if (form.mode === 'edit') {
        await sendJSON(`/api/portal/events/${form.id}`, 'PATCH', {
          kind: form.kind, title: form.title.trim(), descr: form.descr.trim(),
          starts_at, all_day: form.all_day,
        });
      } else {
        await sendJSON('/api/portal/events', 'POST', {
          kind: form.kind, title: form.title.trim(), descr: form.descr.trim(),
          starts_at, all_day: form.all_day, author_name: me?.username,
        });
      }
      setForm(null); load();
    } catch (e2) { if (e2.status === 401) onAuthLost?.(); else alert(e2.message || 'Не удалось сохранить'); }
  };
  const del = async (ev) => {
    if (!ev.can_delete || typeof ev.id !== 'number') return;
    if (!confirm('Удалить событие?')) return;
    try { await sendJSON(`/api/portal/events/${ev.id}`, 'DELETE'); load(); } catch (e) { if (e.status === 401) onAuthLost?.(); }
  };

  const today = todayStr();
  return (
    <div className="pt-view pt-cal">
      <div className="pt-view-h">
        <h2>Календарь</h2>
        <span className="pt-hint">Праздники, дни рождения, встречи и дедлайны</span>
      </div>

      {/* Фильтры типов событий */}
      <div className="cal-filters">
        {FILTERS.map((k) => (
          <button key={k} className={`cal-fchip ${active.has(k) ? 'on' : ''}`} onClick={() => toggleFilter(k)}
            style={{ '--c': KINDS[k].color }}>
            <span className="cal-dot" /> {KINDS[k].label}
          </button>
        ))}
      </div>

      <div className="cal-wrap">
        <div className="cal-main">
          <div className="cal-bar">
            <button className="cal-nav" onClick={() => shift(-1)} aria-label="Назад">‹</button>
            <div className="cal-title">{MON[ym.m]} {ym.y}</div>
            <button className="cal-nav" onClick={() => shift(1)} aria-label="Вперёд">›</button>
            <button className="cal-today" onClick={() => { const n = new Date(); setYm({ y: n.getFullYear(), m: n.getMonth() }); setSel(todayStr()); }}>Сегодня</button>
          </div>
          <div className="cal-grid cal-head">{WD.map((w) => <div key={w} className="cal-wd">{w}</div>)}</div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="cal-cell empty" />;
              const evs = byDay[d] || [];
              const day = +d.slice(8, 10);
              return (
                <button key={i} className={`cal-cell ${d === sel ? 'sel' : ''} ${d === today ? 'today' : ''}`} onClick={() => setSel(d)}>
                  <span className="cal-num">{day}</span>
                  <span className="cal-dots">
                    {evs.slice(0, 4).map((e, j) => <span key={j} className="cal-ev-dot" style={{ background: KINDS[e.kind]?.color || '#888' }} />)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Панель выбранного дня */}
        <aside className="cal-side">
          <div className="cal-side-h">
            <b>{(() => { const [Y, M, D] = sel.split('-'); return `${+D} ${MON[+M - 1].toLowerCase()}`; })()}</b>
            <button className="adm-btn sm" onClick={openCreate}>+ Событие</button>
          </div>
          {dayEvents.length === 0 && <div className="pt-empty sm">На этот день событий нет.</div>}
          <div className="cal-list">
            {dayEvents.map((e, i) => (
              <div key={i} className={`cal-item ${e.done ? 'done' : ''}`} style={{ '--c': KINDS[e.kind]?.color || '#888' }}>
                <span className="cal-item-bar" />
                <div className="cal-item-b">
                  <div className="cal-item-t">{e.title}</div>
                  <div className="cal-item-m">
                    {KINDS[e.kind]?.one || e.kind}
                    {!e.all_day && e.starts_at && ` · ${new Date(e.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`}
                    {e.created_by_name && ` · ${authorLabel(e.created_by_name)}`}
                  </div>
                  {e.descr && <div className="cal-item-d">{e.descr}</div>}
                </div>
                {(e.can_edit || e.can_delete) && typeof e.id === 'number' && (
                  <div className="cal-item-tools">
                    {e.can_edit && <button className="cal-edit" onClick={() => openEdit(e)} aria-label="Изменить" title="Изменить">✎</button>}
                    {e.can_delete && <button className="cal-del" onClick={() => del(e)} aria-label="Удалить" title="Удалить">×</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Модалка создания события */}
      {form && (
        <div className="pt-modal-bg" onClick={() => setForm(null)}>
          <form className="pt-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h3>{form.mode === 'edit' ? 'Изменить событие' : 'Новое событие'}</h3>
            <div className="adm-field"><label>Тип</label>
              <select className="adm-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="meeting">Встреча</option>
                <option value="presentation">Презентация</option>
                <option value="other">Другое</option>
                {isAdmin && <option value="holiday">Праздник</option>}
              </select>
            </div>
            <div className="adm-field"><label>Название</label>
              <input className="adm-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /></div>
            <div className="cal-form-row">
              <div className="adm-field"><label>Дата</label>
                <input className="adm-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              {!form.all_day && <div className="adm-field"><label>Время</label>
                <input className="adm-input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>}
            </div>
            <label className="cal-allday"><input type="checkbox" checked={form.all_day} onChange={(e) => setForm({ ...form, all_day: e.target.checked })} /> Весь день</label>
            <div className="adm-field"><label>Описание</label>
              <textarea className="adm-input" rows={3} value={form.descr} onChange={(e) => setForm({ ...form, descr: e.target.value })} /></div>
            <div className="pt-modal-foot">
              <button type="button" className="adm-btn ghost" onClick={() => setForm(null)}>Отмена</button>
              <button type="submit" className="adm-btn">{form.mode === 'edit' ? 'Сохранить' : 'Создать'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

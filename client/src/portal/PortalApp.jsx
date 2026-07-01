import { useEffect, useRef, useState, useCallback } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';
import { hideSplash } from '../splash.js';
import ThemeToggle from '../ThemeToggle.jsx';
import '../admin/admin.css';
import './portal.css';

const TABS = [
  { id: 'chat', label: 'Командный чат' },
  { id: 'dm', label: 'Личные сообщения' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'depts', label: 'Отделы' },
];

const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const initials = (n) => (n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function PortalApp() {
  const [state, setState] = useState('checking'); // checking | login | app
  const [me, setMe] = useState(null);
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('chat');
  // На мобиле при открытом диалоге прячем нижний таб-бар (мессенджер-стиль, как в Telegram).
  const [convOpen, setConvOpen] = useState(false);
  const goTab = (id) => { setConvOpen(false); setTab(id); };

  useEffect(() => {
    hideSplash();
    let alive = true;
    getJSON('/api/me')
      .then((m) => { if (alive) { setMe(m); setState('app'); } })
      .catch(() => { if (alive) setState('login'); });
    return () => { alive = false; };
  }, []);

  const doLogin = async () => {
    setBusy(true); setErr('');
    try {
      const d = await sendJSON('/api/login', 'POST', { username: login.trim(), password: pass });
      setMe(d); setState('app');
    } catch (e) { setErr(e.status === 401 ? 'Неверный логин или пароль' : 'Сервер недоступен'); }
    finally { setBusy(false); }
  };
  const doLogout = async () => { try { await apiFetch('/api/logout', { method: 'POST' }); } catch {} setState('login'); setMe(null); setLogin(''); setPass(''); };
  const onAuthLost = () => { setState('login'); setMe(null); };

  if (state === 'checking') return <div className="pt"><div className="pt-center">Загрузка…</div></div>;

  if (state === 'login') {
    return (
      <div className="pt">
        <div className="pt-login">
          <div className="pt-login-card">
            <div className="pt-login-logo"><img src="/logo_ddc.svg?v=2" alt="" /> Портал DDC</div>
            <h1>Вход в портал</h1>
            <p className="pt-sub">Рабочее пространство сотрудников</p>
            <div className="adm-field"><label>Логин</label>
              <input className="adm-input" value={login} onChange={(e) => setLogin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doLogin()} autoComplete="username" /></div>
            <div className="adm-field"><label>Пароль</label>
              <input className="adm-input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doLogin()} autoComplete="current-password" /></div>
            <button className="adm-btn" style={{ width: '100%' }} onClick={doLogin} disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
            <div className="adm-err">{err}</div>
            <a className="pt-back" href="/" data-spa>← На сайт</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`pt pt-shell ${convOpen ? 'pt-conv-open' : ''}`}>
      <aside className="pt-rail">
        <div className="pt-brand"><img src="/logo_ddc.svg?v=2" alt="DDC" /></div>
        <nav className="pt-nav">
          {TABS.map((tb) => (
            <button key={tb.id} className={`pt-tab ${tab === tb.id ? 'active' : ''}`} onClick={() => goTab(tb.id)}>
              <PtIco name={tb.id} /><span className="pt-tab-l">{tb.label}</span>
            </button>
          ))}
        </nav>
        <div className="pt-foot">
          <div className="pt-me"><span className="pt-av">{initials(me?.username)}</span><span className="pt-me-n">{me?.username}</span></div>
          <ThemeToggle className="pt-foot-btn" size={17} />
          <a className="pt-foot-btn" href="/" data-spa title="На сайт">↗</a>
          <button className="pt-foot-btn" onClick={doLogout} title="Выйти">⎋</button>
        </div>
      </aside>
      <main className="pt-main">
        {tab === 'chat' && <TeamChat me={me} onAuthLost={onAuthLost} />}
        {tab === 'dm' && <Dm me={me} onAuthLost={onAuthLost} onConv={setConvOpen} />}
        {tab === 'tasks' && <Tasks me={me} onAuthLost={onAuthLost} />}
        {tab === 'depts' && <Departments onAuthLost={onAuthLost} />}
      </main>
    </div>
  );
}

/* Иконки таб-бара портала (мессенджер-стиль) */
function PtIco({ name }) {
  const p = {
    chat: <path d="M4 5h16v11H8l-4 4V5z" />,
    dm: <><path d="M4 5h16v14l-3-3H4z" /><path d="M8 10h8M8 13h5" /></>,
    tasks: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 12l2.5 2.5L16 9" /></>,
    depts: <><circle cx="9" cy="8" r="2.6" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a2.6 2.6 0 0 1 0 4.6M20.5 19a5 5 0 0 0-3.5-4.4" /></>,
  }[name];
  return <svg className="pt-tab-i" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>;
}

/* ── Командный чат ── */
function TeamChat({ me, onAuthLost }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const lastId = useRef(0);
  const boxRef = useRef(null);
  const scrollDown = () => { const b = boxRef.current; if (b) b.scrollTop = b.scrollHeight; };

  const poll = useCallback(async () => {
    try {
      const q = lastId.current ? `?after=${lastId.current}` : '';
      const rows = await getJSON('/api/portal/chat' + q);
      if (rows.length) {
        setMsgs((prev) => (lastId.current ? [...prev, ...rows] : rows));
        lastId.current = rows[rows.length - 1].id;
        setTimeout(scrollDown, 20);
      }
    } catch (e) { if (e.status === 401) onAuthLost?.(); }
  }, [onAuthLost]);

  useEffect(() => { poll(); const t = setInterval(poll, 4000); return () => clearInterval(t); }, [poll]);

  const send = async (e) => {
    e?.preventDefault?.();
    const body = text.trim(); if (!body) return;
    setText('');
    try { await sendJSON('/api/portal/chat', 'POST', { body }); await poll(); }
    catch (e2) { if (e2.status === 401) onAuthLost?.(); }
  };

  return (
    <div className="pt-view">
      <div className="pt-view-h"><h2>Командный чат</h2><span className="pt-hint">Общий канал команды DDC</span></div>
      <div className="pt-chat" ref={boxRef}>
        {msgs.length === 0 && <div className="pt-empty">Пока нет сообщений. Напишите первое!</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`pt-msg ${m.author_name === me?.username ? 'own' : ''}`}>
            <span className="pt-av sm">{initials(m.author_name)}</span>
            <div className="pt-bubble"><div className="pt-msg-top"><b>{m.author_name}</b><time>{fmtTime(m.created_at)}</time></div><p>{m.body}</p></div>
          </div>
        ))}
      </div>
      <form className="pt-compose" onSubmit={send}>
        <input className="adm-input" placeholder="Сообщение в командный чат…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="adm-btn pt-send" type="submit" aria-label="Отправить">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
        </button>
      </form>
    </div>
  );
}

/* ── Личные сообщения (мессенджер-стиль: список → диалог на весь экран) ── */
function Dm({ me, onAuthLost, onConv }) {
  const [users, setUsers] = useState([]);
  const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const boxRef = useRef(null);
  const scrollDown = () => { const b = boxRef.current; if (b) b.scrollTop = b.scrollHeight; };

  const openChat = (u) => { setActive(u); setMsgs([]); onConv?.(true); };
  const closeChat = () => { setActive(null); onConv?.(false); };
  // Уходя со вкладки ЛС — снимаем режим диалога, чтобы вернулся нижний таб-бар.
  useEffect(() => () => onConv?.(false), [onConv]);

  useEffect(() => {
    getJSON('/api/portal/users').then((u) => setUsers(u.filter((x) => x.id !== me?.id))).catch((e) => { if (e.status === 401) onAuthLost?.(); });
  }, [me, onAuthLost]);

  const loadDm = useCallback(async (uid) => {
    try { const rows = await getJSON(`/api/portal/dm/${uid}`); setMsgs(rows); setTimeout(scrollDown, 20); }
    catch (e) { if (e.status === 401) onAuthLost?.(); else setMsgs([]); }
  }, [onAuthLost]);

  useEffect(() => {
    if (!active) return;
    loadDm(active.id);
    const t = setInterval(() => loadDm(active.id), 4500);
    return () => clearInterval(t);
  }, [active, loadDm]);

  const send = async (e) => {
    e?.preventDefault?.();
    const body = text.trim(); if (!body || !active) return;
    setText('');
    try { await sendJSON('/api/portal/dm', 'POST', { to: active.id, body }); await loadDm(active.id); }
    catch (e2) { if (e2.status === 401) onAuthLost?.(); else if (e2.status === 403) alert('ЛС доступны сотрудникам с учётной записью (не супер-админу).'); }
  };

  return (
    <div className={`pt-view pt-dm ${active ? 'has-active' : ''}`}>
      <div className="pt-dm-list">
        <div className="pt-view-h"><h2>Личные сообщения</h2></div>
        {users.length === 0 && <div className="pt-empty sm">Список пуст.</div>}
        {users.map((u) => (
          <button key={u.id} className={`pt-user ${active?.id === u.id ? 'active' : ''}`} onClick={() => openChat(u)}>
            <span className="pt-av sm">{initials(u.name)}</span>
            <span className="pt-user-t"><b>{u.name}</b><small>{u.department || u.role}</small></span>
          </button>
        ))}
      </div>
      <div className="pt-dm-conv">
        {!active ? <div className="pt-empty pt-dm-hint">Выберите сотрудника слева, чтобы написать в личку.</div> : (
          <>
            <div className="pt-conv-head">
              <button className="pt-back-btn" onClick={closeChat} aria-label="Назад">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span className="pt-av sm">{initials(active.name)}</span>
              <div className="pt-conv-who"><b>{active.name}</b><small>{active.department || active.role}</small></div>
            </div>
            <div className="pt-chat" ref={boxRef}>
              {msgs.length === 0 && <div className="pt-empty">Начните диалог.</div>}
              {msgs.map((m) => (
                <div key={m.id} className={`pt-msg ${m.author_id === me?.id ? 'own' : ''}`}>
                  <div className="pt-bubble"><p>{m.body}</p><time>{fmtTime(m.created_at)}</time></div>
                </div>
              ))}
            </div>
            <form className="pt-compose" onSubmit={send}>
              <input className="adm-input" placeholder={`Написать ${active.name}…`} value={text} onChange={(e) => setText(e.target.value)} />
              <button className="adm-btn pt-send" type="submit" aria-label="Отправить">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Задачи ── */
function Tasks({ me, onAuthLost }) {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const load = useCallback(async () => {
    try { setTasks(await getJSON('/api/portal/tasks')); } catch (e) { if (e.status === 401) onAuthLost?.(); }
  }, [onAuthLost]);
  useEffect(() => { load(); getJSON('/api/portal/users').then(setUsers).catch(() => {}); }, [load]);

  const create = async (e) => {
    e?.preventDefault?.();
    if (!title.trim()) return;
    try { await sendJSON('/api/portal/tasks', 'POST', { title: title.trim(), assignee_id: assignee ? Number(assignee) : undefined }); setTitle(''); setAssignee(''); load(); }
    catch (e2) { if (e2.status === 401) onAuthLost?.(); }
  };
  const toggle = async (tk) => {
    try { await sendJSON(`/api/portal/tasks/${tk.id}`, 'PATCH', { status: tk.status === 'done' ? 'open' : 'done' }); load(); }
    catch (e) { if (e.status === 401) onAuthLost?.(); }
  };

  return (
    <div className="pt-view">
      <div className="pt-view-h"><h2>Рабочие задачи</h2><span className="pt-hint">Назначенные вам и созданные вами</span></div>
      <form className="pt-taskform" onSubmit={create}>
        <input className="adm-input" placeholder="Новая задача…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="adm-input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">— исполнитель —</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button className="adm-btn" type="submit">Добавить</button>
      </form>
      <div className="pt-tasks">
        {tasks.length === 0 && <div className="pt-empty">Задач пока нет.</div>}
        {tasks.map((tk) => (
          <div key={tk.id} className={`pt-task ${tk.status === 'done' ? 'done' : ''}`}>
            <button className="pt-check" onClick={() => toggle(tk)} aria-label="Готово">{tk.status === 'done' ? '✓' : ''}</button>
            <div className="pt-task-b">
              <div className="pt-task-t">{tk.title}</div>
              <div className="pt-task-m">{tk.assignee_name ? `→ ${tk.assignee_name}` : 'без исполнителя'} · от {tk.created_by}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Отделы ── */
function Departments({ onAuthLost }) {
  const [depts, setDepts] = useState([]);
  useEffect(() => { getJSON('/api/portal/departments').then((d) => setDepts(d.departments || [])).catch((e) => { if (e.status === 401) onAuthLost?.(); }); }, [onAuthLost]);
  return (
    <div className="pt-view">
      <div className="pt-view-h"><h2>Отделы DDC</h2><span className="pt-hint">Структура и сотрудники</span></div>
      <div className="pt-depts">
        {depts.map((d, i) => (
          <div className="pt-dept" key={i}>
            <h3>{d.name}</h3>
            <p>{d.desc}</p>
            <div className="pt-dept-m">
              {(d.members || []).length === 0 ? <span className="pt-empty sm">Нет сотрудников</span>
                : d.members.map((m, j) => <span className="pt-chip" key={j}><span className="pt-av xs">{initials(m.name)}</span>{m.name}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

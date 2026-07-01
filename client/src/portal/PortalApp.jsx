import { useEffect, useRef, useState, useCallback } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';
import { hideSplash } from '../splash.js';
import ThemeToggle from '../ThemeToggle.jsx';
import '../admin/admin.css';
import './portal.css';

// Разделы портала (внутренняя соцсеть/интранет). Порядок = порядок в меню.
const SECTIONS = [
  { id: 'home', label: 'Главная', icon: 'home' },
  { id: 'profile', label: 'Профиль', icon: 'user' },
  { id: 'people', label: 'Сотрудники', icon: 'people' },
  { id: 'calendar', label: 'Календарь', icon: 'calendar' },
  { id: 'news', label: 'Новости', icon: 'news' },
  { id: 'docs', label: 'Документы', icon: 'docs' },
  { id: 'requests', label: 'Заявки', icon: 'requests' },
  { id: 'tasks', label: 'Задачи', icon: 'tasks' },
  { id: 'depts', label: 'Отделы', icon: 'depts' },
  { id: 'dm', label: 'Личные сообщения', icon: 'dm' },
  { id: 'chat', label: 'Чаты', icon: 'chat' },
];
const labelOf = (id) => SECTIONS.find((s) => s.id === id)?.label || '';

const ROLE_LABEL = { admin: 'Администратор', manager: 'Начальник отдела', staff: 'Сотрудник', editor: 'Редактор', viewer: 'Просмотр' };
const roleLabel = (r) => ROLE_LABEL[r] || r || 'Сотрудник';

const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const initials = (n) => (n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function PortalApp() {
  const [state, setState] = useState('checking'); // checking | login | app
  const [me, setMe] = useState(null);
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('home');
  // На мобиле при открытом диалоге прячем верхнюю панель (мессенджер-стиль).
  const [convOpen, setConvOpen] = useState(false);
  // Боковое меню (на телефоне выезжает слева по бургеру; на десктопе всегда видно).
  const [menuOpen, setMenuOpen] = useState(false);
  const goTab = (id) => { setConvOpen(false); setMenuOpen(false); setTab(id); };

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
    <div className={`pt pt-shell ${convOpen ? 'pt-conv-open' : ''} ${menuOpen ? 'pt-menu-open' : ''}`}>
      {/* Мобильная верхняя панель: бургер + название текущего раздела */}
      <header className="pt-topbar">
        <button className="pt-burger" onClick={() => setMenuOpen((o) => !o)} aria-label="Меню" aria-expanded={menuOpen}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d={menuOpen ? 'M6 6l12 12M18 6L6 18' : 'M3 6h18M3 12h18M3 18h18'} /></svg>
        </button>
        <span className="pt-topbar-t">{labelOf(tab)}</span>
      </header>
      <div className="pt-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <aside className="pt-rail">
        <div className="pt-brand"><img src="/logo_ddc.svg?v=2" alt="DDC" /></div>
        <nav className="pt-nav">
          {SECTIONS.map((s) => (
            <button key={s.id} className={`pt-tab ${tab === s.id ? 'active' : ''}`} onClick={() => goTab(s.id)}>
              <PtIco name={s.icon} /><span className="pt-tab-l">{s.label}</span>
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
        {tab === 'home' && <Home me={me} onGo={goTab} />}
        {tab === 'profile' && <Profile me={me} onAuthLost={onAuthLost} />}
        {tab === 'people' && <People onAuthLost={onAuthLost} />}
        {tab === 'calendar' && <Stub icon="calendar" title="Календарь" note="Праздники, выходные, отпуска сотрудников, корпоративные мероприятия и дни рождения." />}
        {tab === 'news' && <Stub icon="news" title="Новости" note="Объявления по категориям (HR, IT, Финансы, Компания, Важное) с лайками и комментариями." />}
        {tab === 'docs' && <Stub icon="docs" title="Документы" note="Шаблоны, регламенты, инструкции, политика безопасности, брендбук, NDA, договоры." />}
        {tab === 'requests' && <Stub icon="requests" title="Заявки" note="Отпуск, больничный, командировка, справка, закупка, доступ к системе, пропуск — со статусами согласования." />}
        {tab === 'tasks' && <Tasks me={me} onAuthLost={onAuthLost} />}
        {tab === 'depts' && <Departments onAuthLost={onAuthLost} />}
        {tab === 'dm' && <Dm me={me} onAuthLost={onAuthLost} onConv={setConvOpen} />}
        {tab === 'chat' && <Chats me={me} onAuthLost={onAuthLost} onConv={setConvOpen} />}
      </main>
    </div>
  );
}

/* Иконки разделов портала */
function PtIco({ name }) {
  const p = {
    home: <><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /></>,
    user: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    people: <><circle cx="9" cy="8" r="2.6" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a2.6 2.6 0 0 1 0 4.6M20.5 19a5 5 0 0 0-3.5-4.4" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 9h17M8 3v4M16 3v4" /></>,
    news: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    docs: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 13h6M9 17h6" /></>,
    requests: <><path d="M9 4h6l1 3H8z" /><rect x="4" y="7" width="16" height="14" rx="2" /><path d="M9 13l2 2 4-4" /></>,
    tasks: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 12l2.5 2.5L16 9" /></>,
    depts: <><circle cx="9" cy="8" r="2.6" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a2.6 2.6 0 0 1 0 4.6M20.5 19a5 5 0 0 0-3.5-4.4" /></>,
    dm: <><path d="M4 5h16v14l-3-3H4z" /><path d="M8 10h8M8 13h5" /></>,
    chat: <path d="M4 5h16v11H8l-4 4V5z" />,
  }[name];
  return <svg className="pt-tab-i" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>;
}

/* ── Главная: приветствие + быстрые ссылки ── */
function Home({ me, onGo }) {
  const tiles = [
    { id: 'requests', label: 'Подать заявку', note: 'отпуск, справка, доступ' },
    { id: 'docs', label: 'Документы', note: 'шаблоны, регламенты' },
    { id: 'people', label: 'Сотрудники', note: 'справочник команды' },
    { id: 'chat', label: 'Командный чат', note: 'общий канал' },
    { id: 'calendar', label: 'Календарь', note: 'события и отпуска' },
    { id: 'news', label: 'Новости', note: 'объявления компании' },
  ];
  return (
    <div className="pt-view">
      <div className="pt-view-h"><h2>Здравствуйте, {me?.username}!</h2><span className="pt-hint">Рабочее пространство DDC</span></div>
      <div className="pt-tiles">
        {tiles.map((t) => (
          <button className="pt-tile" key={t.id} onClick={() => onGo(t.id)}>
            <PtIco name={SECTIONS.find((s) => s.id === t.id)?.icon || 'home'} />
            <b>{t.label}</b><span>{t.note}</span>
          </button>
        ))}
      </div>
      <div className="pt-widget">
        <b>Виджеты</b>
        <p className="pt-empty sm">Новости компании, дни рождения и новые сотрудники появятся здесь.</p>
      </div>
    </div>
  );
}

/* ── Профиль сотрудника ── */
function Profile({ me, onAuthLost }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    getJSON('/api/portal/users').then((list) => setInfo(list.find((u) => u.id === me?.id) || null)).catch((e) => { if (e.status === 401) onAuthLost?.(); });
  }, [me, onAuthLost]);
  const rows = [
    ['Должность', roleLabel(me?.role)],
    ['Отдел', info?.department || '—'],
    ['Руководитель', '—'],
    ['Телефон', '—'],
    ['Почта', '—'],
    ['Дата приёма', '—'],
    ['Рабочий график', '—'],
  ];
  return (
    <div className="pt-view">
      <div className="pt-view-h"><h2>Профиль</h2></div>
      <div className="pt-profile">
        <div className="pt-profile-top">
          <span className="pt-av xl">{initials(me?.username)}</span>
          <div className="pt-profile-id">
            <h3>{me?.username}</h3>
            <p>{roleLabel(me?.role)}{info?.department ? ` · ${info.department}` : ''}</p>
          </div>
        </div>
        <div className="pt-fields">
          {rows.map(([k, v]) => <div className="pt-field" key={k}><span>{k}</span><b>{v}</b></div>)}
        </div>
        <div className="pt-field-note">Контакты, навыки и график заполняются в HR-профиле.</div>
      </div>
    </div>
  );
}

/* ── Сотрудники: справочник + поиск ── */
function People({ onAuthLost }) {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  useEffect(() => { getJSON('/api/portal/users').then(setUsers).catch((e) => { if (e.status === 401) onAuthLost?.(); }); }, [onAuthLost]);
  const ql = q.trim().toLowerCase();
  const list = ql ? users.filter((u) => [u.name, u.department, u.role, roleLabel(u.role)].some((x) => (x || '').toLowerCase().includes(ql))) : users;
  return (
    <div className="pt-view">
      <div className="pt-view-h"><h2>Сотрудники</h2><span className="pt-hint">{users.length} чел.</span></div>
      <input className="adm-input pt-search" placeholder="Поиск: имя, отдел, должность…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="pt-people">
        {list.map((u) => (
          <div className="pt-person" key={u.id}>
            <span className="pt-av">{initials(u.name)}</span>
            <div className="pt-person-t"><b>{u.name}</b><small>{roleLabel(u.role)}{u.department ? ` · ${u.department}` : ''}</small></div>
          </div>
        ))}
        {list.length === 0 && <div className="pt-empty">{users.length ? 'Никого не найдено.' : 'Список пуст.'}</div>}
      </div>
    </div>
  );
}

/* ── Заглушка раздела «в разработке» ── */
function Stub({ icon, title, note }) {
  return (
    <div className="pt-view">
      <div className="pt-view-h"><h2>{title}</h2></div>
      <div className="pt-stub">
        <span className="pt-stub-ico"><PtIco name={icon} /></span>
        <h3>Раздел в разработке</h3>
        <p>{note}</p>
      </div>
    </div>
  );
}

const PaperPlane = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
);

/* ── Универсальная лента сообщений: поллинг, отправка, правка/удаление своих ── */
function Thread({ me, title, sub, avatar, showAuthor, onBack, poll, post }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [editId, setEditId] = useState(null);
  const boxRef = useRef(null);
  const scrollDown = () => { const b = boxRef.current; if (b) b.scrollTop = b.scrollHeight; };

  const reload = useCallback(async () => {
    try { const rows = await poll(); setMsgs(rows || []); setTimeout(scrollDown, 20); } catch { /* тихо: временная сетевая ошибка */ }
  }, [poll]);
  useEffect(() => { reload(); const t = setInterval(reload, 4000); return () => clearInterval(t); }, [reload]);

  const submit = async (e) => {
    e?.preventDefault?.();
    const body = text.trim(); if (!body) return;
    setText('');
    try {
      if (editId) { await sendJSON(`/api/portal/messages/${editId}`, 'PATCH', { body }); setEditId(null); }
      else { await post(body); }
      await reload();
    } catch (e2) { if (e2.status === 403) alert(e2.message || 'Нет доступа'); }
  };
  const startEdit = (m) => { setEditId(m.id); setText(m.body); };
  const cancelEdit = () => { setEditId(null); setText(''); };
  const del = async (m) => {
    if (!window.confirm('Удалить сообщение?')) return;
    try { await apiFetch(`/api/portal/messages/${m.id}`, { method: 'DELETE' }); await reload(); } catch { /* пропускаем */ }
  };

  return (
    <>
      <div className="pt-conv-head">
        {onBack && (
          <button className="pt-back-btn" onClick={onBack} aria-label="Назад">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <span className="pt-av sm">{avatar || initials(title)}</span>
        <div className="pt-conv-who"><b>{title}</b>{sub && <small>{sub}</small>}</div>
      </div>
      <div className="pt-chat" ref={boxRef}>
        {msgs.length === 0 && <div className="pt-empty">Пока нет сообщений.</div>}
        {msgs.map((m) => {
          const own = (m.author_id != null && m.author_id === me?.id) || (m.author_id == null && m.author_name === me?.username);
          const canEdit = !!m.author_id && m.author_id === me?.id && !m.deleted;
          return (
            <div key={m.id} className={`pt-msg ${own ? 'own' : ''}`}>
              {showAuthor && !own && <span className="pt-av sm">{initials(m.author_name)}</span>}
              <div className="pt-bubble">
                {showAuthor && !own && <div className="pt-msg-top"><b>{m.author_name}</b></div>}
                {m.deleted ? <p className="pt-del">сообщение удалено</p> : <p>{m.body}</p>}
                <time>{fmtTime(m.created_at)}{m.edited_at && !m.deleted ? ' · изм.' : ''}</time>
                {canEdit && (
                  <div className="pt-msg-tools">
                    <button onClick={() => startEdit(m)} aria-label="Изменить" title="Изменить">✎</button>
                    <button onClick={() => del(m)} aria-label="Удалить" title="Удалить" className="danger">🗑</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <form className="pt-compose" onSubmit={submit}>
        {editId && <button type="button" className="pt-edit-x" onClick={cancelEdit} aria-label="Отмена правки" title="Отмена">✕</button>}
        <input className="adm-input" placeholder={editId ? 'Изменить сообщение…' : 'Сообщение…'} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="adm-btn pt-send" type="submit" aria-label={editId ? 'Сохранить' : 'Отправить'}>{editId ? '✓' : <PaperPlane />}</button>
      </form>
    </>
  );
}

/* ── Чаты: общий канал + групповые чаты команд (создание) ── */
function Chats({ me, onAuthLost, onConv }) {
  const [chats, setChats] = useState([]);
  const [active, setActive] = useState(null);
  const [creating, setCreating] = useState(false);
  const loadChats = useCallback(() => getJSON('/api/portal/chats').then(setChats).catch((e) => { if (e.status === 401) onAuthLost?.(); }), [onAuthLost]);
  useEffect(() => { loadChats(); }, [loadChats]);
  useEffect(() => () => onConv?.(false), [onConv]);
  const open = (c) => { setActive(c); onConv?.(true); };
  const close = () => { setActive(null); onConv?.(false); loadChats(); };

  const poll = useCallback(() => (active?.id === 'team' ? getJSON('/api/portal/chat') : getJSON(`/api/portal/chats/${active.id}/messages`)), [active]);
  const post = useCallback((body) => (active?.id === 'team' ? sendJSON('/api/portal/chat', 'POST', { body }) : sendJSON(`/api/portal/chats/${active.id}/messages`, 'POST', { body })), [active]);

  return (
    <div className={`pt-view pt-dm ${active ? 'has-active' : ''}`}>
      <div className="pt-dm-list">
        <div className="pt-view-h"><h2>Чаты</h2><button className="pt-new" onClick={() => setCreating(true)}>+ Чат</button></div>
        <button className={`pt-user ${active?.id === 'team' ? 'active' : ''}`} onClick={() => open({ id: 'team', name: 'Общий канал' })}>
          <span className="pt-av sm">#</span>
          <span className="pt-user-t"><b>Общий канал</b><small>вся команда DDC</small></span>
        </button>
        {chats.map((c) => (
          <button key={c.id} className={`pt-user ${active?.id === c.id ? 'active' : ''}`} onClick={() => open(c)}>
            <span className="pt-av sm">{initials(c.name)}</span>
            <span className="pt-user-t"><b>{c.name}</b><small>{c.members} участн.</small></span>
          </button>
        ))}
        {chats.length === 0 && <div className="pt-empty sm">Групповых чатов пока нет. Создайте первый.</div>}
      </div>
      <div className="pt-dm-conv">
        {!active ? <div className="pt-empty pt-dm-hint">Выберите чат или создайте новый.</div>
          : <Thread key={active.id} me={me} title={active.name} sub={active.id === 'team' ? 'вся команда DDC' : `${active.members || ''} участников`} avatar={active.id === 'team' ? '#' : null} showAuthor onBack={close} poll={poll} post={post} />}
      </div>
      {creating && <CreateChat me={me} onAuthLost={onAuthLost} onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); loadChats(); open(c); }} />}
    </div>
  );
}

/* ── Модалка создания группового чата ── */
function CreateChat({ me, onClose, onCreated, onAuthLost }) {
  const [name, setName] = useState('');
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { getJSON('/api/portal/users').then((u) => setUsers(u.filter((x) => x.id !== me?.id))).catch(() => {}); }, [me]);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { const c = await sendJSON('/api/portal/chats', 'POST', { name: name.trim(), member_ids: [...sel] }); onCreated(c); }
    catch (e) { if (e.status === 401) onAuthLost?.(); else alert(e.message || 'Не удалось создать чат'); }
    finally { setBusy(false); }
  };
  return (
    <div className="pt-modal-ov" onClick={onClose}>
      <div className="pt-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Новый чат команды</h3>
        <input className="adm-input" placeholder="Название чата" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="pt-modal-sub">Участники ({sel.size})</div>
        <div className="pt-modal-users">
          {users.length === 0 && <div className="pt-empty sm">Нет сотрудников.</div>}
          {users.map((u) => (
            <label key={u.id} className={`pt-pick ${sel.has(u.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} />
              <span className="pt-av xs">{initials(u.name)}</span>
              <span className="pt-pick-n">{u.name}<small>{u.department || roleLabel(u.role)}</small></span>
            </label>
          ))}
        </div>
        <div className="pt-modal-foot">
          <button className="adm-ghost" onClick={onClose}>Отмена</button>
          <button className="adm-btn" onClick={create} disabled={busy || !name.trim()}>{busy ? 'Создаём…' : 'Создать'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Личные сообщения (список → диалог через Thread) ── */
function Dm({ me, onAuthLost, onConv }) {
  const [users, setUsers] = useState([]);
  const [active, setActive] = useState(null);
  const openChat = (u) => { setActive(u); onConv?.(true); };
  const closeChat = () => { setActive(null); onConv?.(false); };
  useEffect(() => () => onConv?.(false), [onConv]);
  useEffect(() => {
    getJSON('/api/portal/users').then((u) => setUsers(u.filter((x) => x.id !== me?.id))).catch((e) => { if (e.status === 401) onAuthLost?.(); });
  }, [me, onAuthLost]);

  const poll = useCallback(() => getJSON(`/api/portal/dm/${active.id}`), [active]);
  const post = useCallback((body) => sendJSON('/api/portal/dm', 'POST', { to: active.id, body }), [active]);

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
        {!active ? <div className="pt-empty pt-dm-hint">Выберите сотрудника слева, чтобы написать в личку.</div>
          : <Thread key={active.id} me={me} title={active.name} sub={active.department || active.role} showAuthor={false} onBack={closeChat} poll={poll} post={post} />}
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

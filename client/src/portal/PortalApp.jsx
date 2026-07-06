import { useEffect, useRef, useState, useCallback } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';
import { hideSplash } from '../splash.js';
import ThemeToggle from '../ThemeToggle.jsx';
import { useLogo } from '../store.js';
import Mission from './Mission.jsx';
import Documents from './Documents.jsx';
import Requests from './Requests.jsx';
import Calendar from './Calendar.jsx';
import PortalNews from './PortalNews.jsx';
import Polls from './Polls.jsx';
import Booking from './Booking.jsx';
import PortalBell from './PortalBell.jsx';
import VoiceAgent from './VoiceAgent.jsx';
import { connect as rtConnect, on as rtOn, usePresence } from './realtime.js';
import '../admin/admin.css';
import './portal.css';

// Разделы портала (внутренняя соцсеть/интранет). Порядок = порядок в меню.
const SECTIONS = [
  { id: 'home', label: 'Главная', icon: 'home' },
  { id: 'mission', label: 'Mission Control', icon: 'mission' },
  { id: 'profile', label: 'Профиль', icon: 'user' },
  { id: 'people', label: 'Сотрудники', icon: 'people' },
  { id: 'calendar', label: 'Календарь', icon: 'calendar' },
  { id: 'booking', label: 'Переговорные', icon: 'booking' },
  { id: 'news', label: 'Новости', icon: 'news' },
  { id: 'polls', label: 'Опросы', icon: 'polls' },
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

// Вложения чата
const ATTACH_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt';
const MAX_ATTACH = 6 * 1024 * 1024;
const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round((n || 0) / 1024)) + ' КБ');
const fileToPayload = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve({ name: file.name, data: String(r.result) });
  r.onerror = () => reject(new Error('Не удалось прочитать файл'));
  r.readAsDataURL(file);
});

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
  const [searchOpen, setSearchOpen] = useState(false);   // глобальный ИИ-поиск по порталу (Ctrl/Cmd+K)
  const [toast, setToast] = useState(null);   // всплывающее живое уведомление
  const goTab = (id) => { setConvOpen(false); setMenuOpen(false); setTab(id); };
  const logo = useLogo();   // чёрный логотип на светлой теме, белый на тёмной

  // Realtime: держим SSE-соединение, пока открыт портал; показываем тост на новое уведомление.
  useEffect(() => {
    if (state !== 'app') return;
    const dis = rtConnect();
    const off = rtOn('notification', (n) => { setToast({ title: n.title, body: n.body, t: Date.now() }); });
    return () => { off(); dis(); };
  }, [state]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  // Ctrl/Cmd+K — открыть глобальный поиск из любого места портала.
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) { e.preventDefault(); setSearchOpen((o) => !o); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Mission Control — только для админа и начальников отделов (остальным раздел не виден).
  const isHead = ['admin', 'manager'].includes(me?.role);
  const sections = SECTIONS.filter((s) => s.id !== 'mission' || isHead);

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
            <div className="pt-login-logo"><img src={logo} alt="" /> Портал DDC</div>
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
        <PortalBell onGo={goTab} onAuthLost={onAuthLost} />
      </header>
      <div className="pt-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <aside className="pt-rail">
        <div className="pt-rail-top">
          <div className="pt-brand"><img src={logo} alt="DDC" /></div>
          <PortalBell onGo={goTab} onAuthLost={onAuthLost} />
        </div>
        <button className="pt-searchbar" onClick={() => setSearchOpen(true)} title="Поиск по порталу (Ctrl+K)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <span>Поиск…</span><kbd>Ctrl K</kbd>
        </button>
        <nav className="pt-nav">
          {sections.map((s) => (
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
        {tab === 'mission' && (isHead ? <Mission onAuthLost={onAuthLost} /> : <Home me={me} onGo={goTab} />)}
        {tab === 'home' && <Home me={me} onGo={goTab} />}
        {tab === 'profile' && <Profile me={me} onAuthLost={onAuthLost} />}
        {tab === 'people' && <People onAuthLost={onAuthLost} />}
        {tab === 'calendar' && <Calendar me={me} onAuthLost={onAuthLost} />}
        {tab === 'news' && <PortalNews me={me} onAuthLost={onAuthLost} />}
        {tab === 'polls' && <Polls me={me} onAuthLost={onAuthLost} />}
        {tab === 'booking' && <Booking me={me} onAuthLost={onAuthLost} />}
        {tab === 'docs' && <Documents me={me} onAuthLost={onAuthLost} />}
        {tab === 'requests' && <Requests me={me} onAuthLost={onAuthLost} />}
        {tab === 'tasks' && <Tasks me={me} onAuthLost={onAuthLost} />}
        {tab === 'depts' && <Departments me={me} onAuthLost={onAuthLost} />}
        {tab === 'dm' && <Dm me={me} onAuthLost={onAuthLost} onConv={setConvOpen} />}
        {tab === 'chat' && <Chats me={me} onAuthLost={onAuthLost} onConv={setConvOpen} />}
      </main>

      {/* Живое уведомление (SSE) */}
      {toast && (
        <div className="pt-toast" onClick={() => { setToast(null); goTab('news'); }} role="status">
          <span className="pt-toast-dot" />
          <div className="pt-toast-b"><b>{toast.title || 'Уведомление'}</b>{toast.body && <small>{toast.body}</small>}</div>
        </div>
      )}

      {/* Глобальный ИИ-поиск по порталу (Ctrl/Cmd+K) */}
      {searchOpen && <GlobalSearch onGo={goTab} onClose={() => setSearchOpen(false)} onAuthLost={onAuthLost} />}

      {/* Голосовой ассистент — плавающая кнопка, доступен из любого раздела */}
      <VoiceAgent onGo={goTab} me={me} />
    </div>
  );
}

/* Иконки разделов портала */
function PtIco({ name }) {
  const p = {
    mission: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.4" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
    home: <><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /></>,
    user: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    people: <><circle cx="9" cy="8" r="2.6" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a2.6 2.6 0 0 1 0 4.6M20.5 19a5 5 0 0 0-3.5-4.4" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 9h17M8 3v4M16 3v4" /></>,
    news: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    polls: <><path d="M8 20V10M12 20V4M16 20v-6" /><path d="M4 20h16" /></>,
    booking: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M9 15h6" /></>,
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
      <LeaderboardWidget onGo={onGo} />
    </div>
  );
}

/* ── Рейтинг активности (топ-5) на главной ── */
function LeaderboardWidget({ onGo }) {
  const [top, setTop] = useState(null);
  useEffect(() => { getJSON('/api/portal/leaderboard').then((l) => setTop(l.slice(0, 5))).catch(() => setTop([])); }, []);
  return (
    <div className="pt-widget">
      <div className="pt-widget-h"><b>🏆 Рейтинг активности</b><button className="pt-widget-more" onClick={() => onGo('profile')}>Мой профиль →</button></div>
      {top == null ? <p className="pt-empty sm">Загрузка…</p>
        : top.filter((u) => u.points > 0).length === 0 ? <p className="pt-empty sm">Активность появится, когда команда начнёт работать в портале.</p>
          : (
            <div className="lb">
              {top.filter((u) => u.points > 0).map((u, i) => (
                <div className="lb-row" key={u.id}>
                  <span className={`lb-rank r${i + 1}`}>{i + 1}</span>
                  <span className="pt-av xs">{initials(u.name)}</span>
                  <span className="lb-name">{u.name}<small>{u.department}</small></span>
                  <span className="lb-badges">{(u.badges || []).slice(0, 3).map((b, j) => <span key={j} title={b.label}>{b.icon}</span>)}</span>
                  <span className="lb-pts">{u.points}</span>
                </div>
              ))}
            </div>
          )}
    </div>
  );
}

/* ── Профиль сотрудника: контакты/навыки (редактируемые) + геймификация + онбординг ── */
function Profile({ me, onAuthLost }) {
  const [info, setInfo] = useState(null);
  const [rank, setRank] = useState(null);   // моя позиция в рейтинге + очки/бейджи
  const [ob, setOb] = useState({ steps: [], done: [] });
  const [edit, setEdit] = useState(null);   // { position, phone, skills } при редактировании
  const load = useCallback(() => {
    getJSON('/api/portal/users').then((list) => setInfo(list.find((u) => u.id === me?.id) || null)).catch((e) => { if (e.status === 401) onAuthLost?.(); });
    getJSON('/api/portal/leaderboard').then((l) => setRank(l.find((u) => u.id === me?.id) || { points: 0, badges: [] })).catch(() => {});
    getJSON('/api/portal/onboarding').then(setOb).catch(() => {});
  }, [me, onAuthLost]);
  useEffect(() => { load(); }, [load]);

  const saveEdit = async () => {
    try { await sendJSON('/api/portal/profile', 'PATCH', edit); setEdit(null); load(); }
    catch (e) { if (e.status === 401) onAuthLost?.(); else alert(e.message || 'Не удалось'); }
  };
  const toggleStep = async (step, done) => {
    setOb((o) => ({ ...o, done: done ? [...o.done, step] : o.done.filter((s) => s !== step) }));
    try { await sendJSON('/api/portal/onboarding', 'POST', { step, done }); } catch { load(); }
  };
  const obDone = ob.done.length, obTotal = ob.steps.length;

  const rows = [
    ['Должность', info?.position || roleLabel(me?.role)],
    ['Отдел', info?.department || '—'],
    ['Телефон', info?.phone || '—'],
    ['Навыки', info?.skills || '—'],
    ['Дата приёма', info?.hired_at ? new Date(info.hired_at).toLocaleDateString('ru-RU') : '—'],
  ];
  return (
    <div className="pt-view">
      <div className="pt-view-h"><h2>Профиль</h2>
        <button className="adm-btn sm pt-view-act" onClick={() => setEdit(edit ? null : { position: info?.position || '', phone: info?.phone || '', skills: info?.skills || '' })}>{edit ? '× Отмена' : '✎ Редактировать'}</button>
      </div>
      <div className="pt-profile">
        <div className="pt-profile-top">
          <span className="pt-av xl">{initials(me?.username)}</span>
          <div className="pt-profile-id">
            <h3>{me?.username}</h3>
            <p>{info?.position || roleLabel(me?.role)}{info?.department ? ` · ${info.department}` : ''}</p>
            {rank && (
              <div className="pt-gami">
                <span className="pt-points">⭐ {rank.points} очк.</span>
                {(rank.badges || []).map((b, i) => <span className="pt-badge" key={i} title={b.label}>{b.icon} {b.label}</span>)}
              </div>
            )}
          </div>
        </div>

        {edit ? (
          <div className="pt-fields edit">
            <label className="pt-editf"><span>Должность</span><input className="adm-input" value={edit.position} onChange={(e) => setEdit({ ...edit, position: e.target.value })} placeholder="напр. Ведущий разработчик" /></label>
            <label className="pt-editf"><span>Телефон</span><input className="adm-input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="+7 …" /></label>
            <label className="pt-editf"><span>Навыки</span><input className="adm-input" value={edit.skills} onChange={(e) => setEdit({ ...edit, skills: e.target.value })} placeholder="React, PostgreSQL, DevOps…" /></label>
            <button className="adm-btn" onClick={saveEdit}>Сохранить</button>
          </div>
        ) : (
          <div className="pt-fields">
            {rows.map(([k, v]) => <div className="pt-field" key={k}><span>{k}</span><b>{v}</b></div>)}
          </div>
        )}

        {obTotal > 0 && obDone < obTotal && (
          <div className="pt-onboard">
            <div className="pt-onboard-h"><b>🚀 Онбординг</b><span>{obDone}/{obTotal}</span></div>
            <div className="pt-onboard-bar"><span style={{ width: `${Math.round((obDone / obTotal) * 100)}%` }} /></div>
            <div className="pt-onboard-steps">
              {ob.steps.map((s) => {
                const done = ob.done.includes(s.id);
                return (
                  <label className={`pt-onboard-step ${done ? 'done' : ''}`} key={s.id}>
                    <input type="checkbox" checked={done} onChange={(e) => toggleStep(s.id, e.target.checked)} />
                    <span>{s.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Сотрудники: справочник + поиск ── */
function People({ onAuthLost }) {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const online = usePresence();
  useEffect(() => { getJSON('/api/portal/users').then(setUsers).catch((e) => { if (e.status === 401) onAuthLost?.(); }); }, [onAuthLost]);
  const ql = q.trim().toLowerCase();
  const list = ql ? users.filter((u) => [u.name, u.department, u.role, roleLabel(u.role)].some((x) => (x || '').toLowerCase().includes(ql))) : users;
  const onlineCount = users.filter((u) => online(u.id)).length;
  return (
    <div className="pt-view">
      <div className="pt-view-h"><h2>Сотрудники</h2><span className="pt-hint">{users.length} чел.{onlineCount ? ` · ${onlineCount} онлайн` : ''}</span></div>
      <input className="adm-input pt-search" placeholder="Поиск: имя, отдел, должность…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="pt-people">
        {list.map((u) => (
          <div className="pt-person" key={u.id}>
            <span className={`pt-av ${online(u.id) ? 'on' : ''}`}>{initials(u.name)}</span>
            <div className="pt-person-t"><b>{u.name}{online(u.id) && <span className="pt-online-tag">онлайн</span>}</b><small>{roleLabel(u.role)}{u.department ? ` · ${u.department}` : ''}</small></div>
          </div>
        ))}
        {list.length === 0 && <div className="pt-empty">{users.length ? 'Никого не найдено.' : 'Список пуст.'}</div>}
      </div>
    </div>
  );
}

/* ── Глобальный ИИ-поиск по порталу (семантический, Ctrl/Cmd+K) ── */
const SEARCH_KIND_ICON = { document: '📄', news: '📰', request: '📝', task: '✓', event: '📅', person: '👤', service: '⚙' };
function GlobalSearch({ onGo, onClose, onAuthLost }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [semantic, setSemantic] = useState(true);
  const [active, setActive] = useState(0);
  const tRef = useRef(0);
  useEffect(() => {
    const ql = q.trim();
    if (!ql) { setResults([]); return; }
    clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      setBusy(true);
      try { const d = await sendJSON('/api/portal/search', 'POST', { q: ql }); setResults(d.results || []); setSemantic(d.semantic); setActive(0); }
      catch (e) { if (e.status === 401) onAuthLost?.(); }
      finally { setBusy(false); }
    }, 220);
    return () => clearTimeout(tRef.current);
  }, [q, onAuthLost]);
  const openResult = (r) => { if (r?.tab) { onGo?.(r.tab); onClose?.(); } };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose?.();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); openResult(results[active]); }
  };
  return (
    <div className="pt-gs-ov" onClick={onClose}>
      <div className="pt-gs" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="pt-gs-in">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input autoFocus className="pt-gs-input" placeholder="Поиск по документам, новостям, людям, задачам…" value={q} onChange={(e) => setQ(e.target.value)} />
          {busy && <span className="pt-gs-spin" />}
          <button className="pt-gs-esc" onClick={onClose}>Esc</button>
        </div>
        <div className="pt-gs-list">
          {q.trim() && !busy && results.length === 0 && <div className="pt-gs-empty">Ничего не найдено.</div>}
          {results.map((r, i) => (
            <button key={r.kind + r.ref_id} className={`pt-gs-item ${i === active ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => openResult(r)} disabled={!r.tab}>
              <span className="pt-gs-ico">{SEARCH_KIND_ICON[r.kind] || '•'}</span>
              <span className="pt-gs-body"><b>{r.title}</b><small>{r.snippet}</small></span>
              <span className="pt-gs-kind">{r.kindLabel}</span>
            </button>
          ))}
        </div>
        <div className="pt-gs-foot">{semantic ? '⚡ Семантический ИИ-поиск' : 'Поиск по ключевым словам'} · ↑↓ выбор · Enter открыть</div>
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
  const [file, setFile] = useState(null);
  const boxRef = useRef(null);
  const scrollDown = () => { const b = boxRef.current; if (b) b.scrollTop = b.scrollHeight; };

  const reload = useCallback(async () => {
    try { const rows = await poll(); setMsgs(rows || []); setTimeout(scrollDown, 20); } catch { /* тихо: временная сетевая ошибка */ }
  }, [poll]);
  // Мгновенное обновление по SSE + редкий поллинг как фолбэк (если SSE недоступен).
  useEffect(() => { reload(); const t = setInterval(reload, 8000); const off = rtOn('chat', () => reload()); return () => { clearInterval(t); off(); }; }, [reload]);

  const onPick = (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.size > MAX_ATTACH) { alert('Файл больше 6 МБ'); return; }
    setFile(f);
  };
  const submit = async (e) => {
    e?.preventDefault?.();
    const body = text.trim();
    if (!body && !file) return;
    setText('');
    const pending = file; setFile(null);
    try {
      if (editId) { await sendJSON(`/api/portal/messages/${editId}`, 'PATCH', { body }); setEditId(null); }
      else { await post(body, pending ? await fileToPayload(pending) : null); }
      await reload();
    } catch (e2) { alert(e2.message || 'Не удалось отправить'); }
  };
  const startEdit = (m) => { setEditId(m.id); setText(m.body); setFile(null); };
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
                {m.deleted ? <p className="pt-del">сообщение удалено</p> : (<>
                  {m.file_id && <Attachment m={m} />}
                  {m.body && <p>{m.body}</p>}
                </>)}
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
        {file && (
          <div className="pt-att-pending">
            <span>📎 {file.name} · {fmtSize(file.size)}</span>
            <button type="button" onClick={() => setFile(null)} aria-label="Убрать файл">✕</button>
          </div>
        )}
        {editId && <button type="button" className="pt-edit-x" onClick={cancelEdit} aria-label="Отмена правки" title="Отмена">✕</button>}
        {!editId && (
          <label className="pt-attach" title="Прикрепить файл">
            <input type="file" hidden accept={ATTACH_ACCEPT} onChange={onPick} />
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11l-8.5 8.5a4.5 4.5 0 0 1-6.4-6.4l8.7-8.7a3 3 0 0 1 4.3 4.3l-8.7 8.7a1.5 1.5 0 0 1-2.1-2.1l7.9-7.9" /></svg>
          </label>
        )}
        <input className="adm-input" placeholder={editId ? 'Изменить сообщение…' : 'Сообщение…'} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="adm-btn pt-send" type="submit" aria-label={editId ? 'Сохранить' : 'Отправить'}>{editId ? '✓' : <PaperPlane />}</button>
      </form>
    </>
  );
}

/* Вложение сообщения: картинки показываем, остальное — файл со скачиванием */
function Attachment({ m }) {
  const url = `/api/files/${m.file_id}`;
  if (/^image\//.test(m.file_mime || '')) {
    return <a className="pt-att-img" href={url} target="_blank" rel="noreferrer"><img src={url} alt={m.file_name || ''} loading="lazy" /></a>;
  }
  return (
    <a className="pt-att-file" href={url} target="_blank" rel="noreferrer">
      <span className="pt-att-ic">📎</span>
      <span className="pt-att-t"><b>{m.file_name || 'файл'}</b><small>{fmtSize(m.file_size)}</small></span>
    </a>
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
  const post = useCallback((body, file) => (active?.id === 'team' ? sendJSON('/api/portal/chat', 'POST', { body, file }) : sendJSON(`/api/portal/chats/${active.id}/messages`, 'POST', { body, file })), [active]);

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
  const online = usePresence();
  const openChat = (u) => { setActive(u); onConv?.(true); };
  const closeChat = () => { setActive(null); onConv?.(false); };
  useEffect(() => () => onConv?.(false), [onConv]);
  useEffect(() => {
    getJSON('/api/portal/users').then((u) => setUsers(u.filter((x) => x.id !== me?.id))).catch((e) => { if (e.status === 401) onAuthLost?.(); });
  }, [me, onAuthLost]);

  const poll = useCallback(() => getJSON(`/api/portal/dm/${active.id}`), [active]);
  const post = useCallback((body, file) => sendJSON('/api/portal/dm', 'POST', { to: active.id, body, file }), [active]);

  return (
    <div className={`pt-view pt-dm ${active ? 'has-active' : ''}`}>
      <div className="pt-dm-list">
        <div className="pt-view-h"><h2>Личные сообщения</h2></div>
        {users.length === 0 && <div className="pt-empty sm">Список пуст.</div>}
        {users.map((u) => (
          <button key={u.id} className={`pt-user ${active?.id === u.id ? 'active' : ''}`} onClick={() => openChat(u)}>
            <span className={`pt-av sm ${online(u.id) ? 'on' : ''}`}>{initials(u.name)}</span>
            <span className="pt-user-t"><b>{u.name}</b><small>{online(u.id) ? '● онлайн' : (u.department || u.role)}</small></span>
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
const PRIO = { urgent: { l: 'Срочно', c: '#c0455a' }, high: { l: 'Высокий', c: '#b07d12' }, normal: { l: 'Обычный', c: '#2f6fe0' }, low: { l: 'Низкий', c: '#5b6472' } };
const TSTATUS = { open: 'Открыта', in_progress: 'В работе', done: 'Готово' };
const dateStr = (d) => (d ? String(d).slice(0, 10) : '');
const fmtDay = (d) => { try { return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); } catch { return ''; } };
function Tasks({ me, onAuthLost }) {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('active');   // active | all | done | overdue
  const [view, setView] = useState('board');         // board (канбан) | list
  const [drag, setDrag] = useState(null);            // id перетаскиваемой карточки
  const [form, setForm] = useState({ title: '', body: '', assignee: '', priority: 'normal', due_date: '' });
  const [expanded, setExpanded] = useState(null);
  const load = useCallback(async () => {
    try { setTasks(await getJSON('/api/portal/tasks')); } catch (e) { if (e.status === 401) onAuthLost?.(); }
  }, [onAuthLost]);
  useEffect(() => { load(); getJSON('/api/portal/users').then(setUsers).catch(() => {}); }, [load]);
  useEffect(() => rtOn('task', () => load()), [load]);   // живая синхронизация доски

  const isHead = ['admin', 'manager'].includes(me?.role);   // назначать другим могут руководители/замы
  const create = async (e) => {
    e?.preventDefault?.();
    if (!form.title.trim()) return;
    try {
      await sendJSON('/api/portal/tasks', 'POST', {
        title: form.title.trim(), body: form.body.trim(), priority: form.priority,
        due_date: form.due_date || undefined, assignee_id: form.assignee ? Number(form.assignee) : undefined,
      });
      setForm({ title: '', body: '', assignee: '', priority: 'normal', due_date: '' }); load();
    } catch (e2) { if (e2.status === 401) onAuthLost?.(); else alert(e2.message || 'Не удалось'); }
  };
  const patch = async (tk, body) => {
    try { await sendJSON(`/api/portal/tasks/${tk.id}`, 'PATCH', body); load(); } catch (e) { if (e.status === 401) onAuthLost?.(); }
  };
  const del = async (tk) => { if (!confirm('Удалить задачу?')) return; try { await sendJSON(`/api/portal/tasks/${tk.id}`, 'DELETE'); load(); } catch (e) { if (e.status === 401) onAuthLost?.(); } };
  const cycle = (tk) => patch(tk, { status: tk.status === 'open' ? 'in_progress' : tk.status === 'in_progress' ? 'done' : 'open' });
  const onDrop = (status) => { const tk = tasks.find((t) => t.id === drag); if (tk && tk.status !== status) { setTasks((ts) => ts.map((t) => t.id === tk.id ? { ...t, status } : t)); patch(tk, { status }); } setDrag(null); };

  const today = dateStr(new Date().toISOString());
  const overdue = (tk) => tk.due_date && tk.status !== 'done' && dateStr(tk.due_date) < today;
  const shown = tasks.filter((tk) =>
    filter === 'all' ? true : filter === 'done' ? tk.status === 'done'
      : filter === 'overdue' ? overdue(tk) : tk.status !== 'done');
  const counts = { active: tasks.filter((t) => t.status !== 'done').length, overdue: tasks.filter(overdue).length };

  return (
    <div className="pt-view pt-tasks-v">
      <div className="pt-view-h">
        <h2>Рабочие задачи</h2>
        <div className="pt-viewtoggle">
          <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')} title="Канбан-доска">▦ Доска</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} title="Список">☰ Список</button>
        </div>
      </div>

      <form className="pt-taskform grid" onSubmit={create}>
        <input className="adm-input tf-title" placeholder={isHead ? 'Новая задача для сотрудника…' : 'Моя задача…'} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <select className="adm-input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} title="Приоритет">
          {Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
        </select>
        <input className="adm-input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} title="Срок" />
        {isHead && (
          <select className="adm-input" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
            <option value="">— исполнитель —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <input className="adm-input tf-desc" placeholder="Описание (необязательно)…" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <button className="adm-btn" type="submit">Добавить</button>
      </form>

      {view === 'board' ? (
        <div className="kanban">
          {[['open', 'Открыта'], ['in_progress', 'В работе'], ['done', 'Готово']].map(([st, label]) => {
            const col = tasks.filter((t) => t.status === st);
            return (
              <div key={st} className={`kb-col ${drag ? 'dropzone' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(st)}>
                <div className="kb-col-h"><span className={`kb-dot st-${st}`} />{label}<span className="kb-count">{col.length}</span></div>
                <div className="kb-cards">
                  {col.map((tk) => (
                    <div key={tk.id} className={`kb-card ${overdue(tk) ? 'over' : ''} ${drag === tk.id ? 'dragging' : ''}`}
                      draggable onDragStart={() => setDrag(tk.id)} onDragEnd={() => setDrag(null)}>
                      <div className="kb-card-t">{tk.title}</div>
                      {tk.body && <div className="kb-card-d">{tk.body}</div>}
                      <div className="kb-card-m">
                        <span className="pt-prio" style={{ '--c': PRIO[tk.priority]?.c || '#888' }}>{PRIO[tk.priority]?.l}</span>
                        {tk.due_date && <span className={`pt-due ${overdue(tk) ? 'over' : ''}`}>⏱ {fmtDay(tk.due_date)}</span>}
                      </div>
                      <div className="kb-card-f">
                        <span className="kb-who">{tk.assignee_name ? `👤 ${tk.assignee_name}` : 'без исполнителя'}</span>
                        {(tk.created_by === me?.username || isHead) && <button className="kb-del" onClick={() => del(tk)} aria-label="Удалить">×</button>}
                      </div>
                    </div>
                  ))}
                  {col.length === 0 && <div className="kb-empty">перетащите сюда</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (<>
        <div className="cal-filters">
          {[['active', `Активные${counts.active ? ` (${counts.active})` : ''}`], ['overdue', `Просроченные${counts.overdue ? ` (${counts.overdue})` : ''}`], ['done', 'Выполненные'], ['all', 'Все']].map(([k, l]) => (
            <button key={k} className={`cal-fchip ${filter === k ? 'on' : ''}`} style={{ '--c': k === 'overdue' ? '#c0455a' : '#2f6fe0' }} onClick={() => setFilter(k)}><span className="cal-dot" /> {l}</button>
          ))}
        </div>
        <div className="pt-tasks">
          {shown.length === 0 && <div className="pt-empty">Задач нет.</div>}
          {shown.map((tk) => (
            <div key={tk.id} className={`pt-task rich ${tk.status === 'done' ? 'done' : ''}`}>
              <button className={`pt-check st-${tk.status}`} onClick={() => cycle(tk)} title={TSTATUS[tk.status]} aria-label={TSTATUS[tk.status]}>
                {tk.status === 'done' ? '✓' : tk.status === 'in_progress' ? '◐' : ''}
              </button>
              <div className="pt-task-b" onClick={() => tk.body && setExpanded(expanded === tk.id ? null : tk.id)} style={{ cursor: tk.body ? 'pointer' : 'default' }}>
                <div className="pt-task-t">
                  {tk.title}
                  <span className="pt-prio" style={{ '--c': PRIO[tk.priority]?.c || '#888' }}>{PRIO[tk.priority]?.l}</span>
                  {tk.due_date && <span className={`pt-due ${overdue(tk) ? 'over' : ''}`}>⏱ {fmtDay(tk.due_date)}</span>}
                </div>
                <div className="pt-task-m">
                  <span className={`pt-st st-${tk.status}`}>{TSTATUS[tk.status]}</span>
                  {' · '}{tk.assignee_name ? `→ ${tk.assignee_name}` : 'без исполнителя'} · от {tk.created_by}
                </div>
                {expanded === tk.id && tk.body && <div className="pt-task-d">{tk.body}</div>}
              </div>
              {(tk.created_by === me?.username || isHead) && <button className="cal-del" onClick={() => del(tk)} aria-label="Удалить">×</button>}
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

/* ── Отделы ── */
function Departments({ me, onAuthLost }) {
  const [depts, setDepts] = useState([]);
  const [edit, setEdit] = useState(null);   // {id,name,desc} редактируемого отдела
  const [view, setView] = useState('org');  // org (дерево) | list (карточки)
  const online = usePresence();
  const isAdmin = me?.role === 'admin';
  const load = useCallback(() => { getJSON('/api/portal/departments').then((d) => setDepts(d.departments || [])).catch((e) => { if (e.status === 401) onAuthLost?.(); }); }, [onAuthLost]);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e?.preventDefault?.();
    if (!edit.name.trim()) return;
    try { await sendJSON(`/api/admin/departments/${edit.id}`, 'PATCH', { name: edit.name.trim(), descr: edit.desc }); setEdit(null); load(); }
    catch (e2) { if (e2.status === 401) onAuthLost?.(); else alert(e2.message || 'Не удалось'); }
  };
  const totalPeople = depts.reduce((s, d) => s + (d.members?.length || 0), 0);

  return (
    <div className="pt-view">
      <div className="pt-view-h">
        <h2>Отделы ЦЦР</h2>
        <div className="pt-viewtoggle">
          <button className={view === 'org' ? 'on' : ''} onClick={() => setView('org')}>🏛 Оргструктура</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>☰ Список</button>
        </div>
      </div>

      {view === 'org' && (
        <div className="orgchart">
          <div className="org-root-node">
            <span className="org-logo">🏛</span>
            <div className="org-root-t"><b>ЦЦР</b><small>Центр цифрового развития · {totalPeople} чел.</small></div>
          </div>
          <div className="org-trunk" />
          <div className="org-branches">
            {depts.map((d, i) => (
              <div className="org-branch" key={d.id ?? i}>
                <div className="org-dept">
                  <b>{d.name}</b><small>{d.members?.length || 0} чел.</small>
                </div>
                <div className="org-people">
                  {(d.members || []).length === 0 ? <span className="org-empty">—</span>
                    : d.members.map((m, j) => (
                      <div className="org-leaf" key={j} title={m.name}>
                        <span className={`pt-av xs ${online(m.id) ? 'on' : ''}`}>{initials(m.name)}</span>
                        <span className="org-leaf-n">{m.name}</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'list' && (
      <div className="pt-depts">
        {depts.map((d, i) => (
          <div className="pt-dept" key={d.id ?? i}>
            <div className="pt-dept-top">
              <h3>{d.name}</h3>
              {isAdmin && d.id != null && <button className="pt-dept-edit" onClick={() => setEdit({ id: d.id, name: d.name, desc: d.desc || '' })} title="Изменить отдел">Изменить</button>}
            </div>
            <p>{d.desc}</p>
            <div className="pt-dept-m">
              {(d.members || []).length === 0 ? <span className="pt-empty sm">Нет сотрудников</span>
                : d.members.map((m, j) => <span className="pt-chip" key={j}><span className="pt-av xs">{initials(m.name)}</span>{m.name}</span>)}
            </div>
          </div>
        ))}
      </div>
      )}

      {edit && (
        <div className="pt-modal-bg" onClick={() => setEdit(null)}>
          <form className="pt-modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>Изменить отдел</h3>
            <div className="adm-field"><label>Название</label>
              <input className="adm-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></div>
            <div className="adm-field"><label>Описание</label>
              <textarea className="adm-input" rows={3} value={edit.desc} onChange={(e) => setEdit({ ...edit, desc: e.target.value })} /></div>
            <div className="pt-modal-foot">
              <button type="button" className="adm-btn ghost" onClick={() => setEdit(null)}>Отмена</button>
              <button type="submit" className="adm-btn">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

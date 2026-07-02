import { lazy, Suspense, useEffect, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';
import NotificationBell from './NotificationBell.jsx';
import ThemeToggle from '../ThemeToggle.jsx';
import { useLogo } from '../store.js';
import { hideSplash } from '../splash.js';
import './admin.css';

// Вкладки админки — ленивые чанки: грузятся по требованию, а не все сразу.
// Первичная загрузка панели легче (особенно тяжёлые Аналитика/Новости).
const Dashboard = lazy(() => import('./Dashboard.jsx'));
const History = lazy(() => import('./History.jsx'));
const Leads = lazy(() => import('./Leads.jsx'));
const NewsManager = lazy(() => import('./NewsManager.jsx'));
const ServicesManager = lazy(() => import('./ServicesManager.jsx'));
const Analytics = lazy(() => import('./Analytics.jsx'));
const Users = lazy(() => import('./Users.jsx'));
const AiPanel = lazy(() => import('./AiPanel.jsx'));
const Careers = lazy(() => import('./Careers.jsx'));
const System = lazy(() => import('./System.jsx'));

const ROLE_LABEL = { admin: 'Администратор', manager: 'Начальник отдела', staff: 'Сотрудник', editor: 'Редактор', viewer: 'Просмотр' };
const TITLES = { dashboard: 'Дашборд', leads: 'Заявки', ai: 'ИИ-аналитика', analytics: 'Аналитика', careers: 'Отклики', system: 'Система', services: 'Услуги', news: 'Новости', history: 'История', users: 'Пользователи' };

function Ico({ name, size = 20 }) {
  const p = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
    history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    leads: <><path d="M4 6h16M4 12h16M4 18h10" /></>,
    ai: <><circle cx="12" cy="12" r="3.2" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
    analytics: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    careers: <><path d="M4 7h16v13H4z" /><path d="M9 7V4h6v3M4 12h16" /></>,
    system: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.2" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
    news: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    services: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 6.5a3 3 0 0 1 0 5M21 20a5 5 0 0 0-4-4.9" /></>,
  }[name];
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{p}</svg>;
}

export default function Admin() {
  const [state, setState] = useState('checking');
  const [me, setMe] = useState({ username: '', role: 'viewer' });
  const [tab, setTab] = useState('dashboard');
  const [focusLead, setFocusLead] = useState(null);

  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const logo = useLogo();   // чёрный логотип на светлой теме, белый на тёмной

  useEffect(() => {
    hideSplash();   // админка смонтирована — убираем загрузочный экран
    let alive = true;
    getJSON('/api/me')
      .then((m) => { if (alive) { const r = m.role || 'viewer'; setMe({ username: m.username || '', role: r, id: m.id ?? null }); if (r === 'staff') setTab('leads'); setState('app'); } })
      .catch(() => { if (alive) setState('login'); });
    return () => { alive = false; };
  }, []);

  const doLogin = async () => {
    setBusy(true); setErr('');
    try {
      const d = await sendJSON('/api/login', 'POST', { username: login.trim(), password: pass });
      const r = d.role || 'viewer';
      setMe({ username: d.username || login.trim(), role: r, id: d.id ?? null });
      if (r === 'staff') setTab('leads');
      setState('app');
    } catch (e) {
      setErr(e.status === 401 ? 'Неверный логин или пароль' : 'Сервер недоступен');
    } finally { setBusy(false); }
  };

  const doLogout = async () => {
    try { await apiFetch('/api/logout', { method: 'POST' }); } catch {}
    setState('login'); setLogin(''); setPass(''); setTab('dashboard');
  };

  if (state === 'checking') {
    return <div className="adm"><div className="adm-login"><div className="adm-hint">Загрузка…</div></div></div>;
  }

  if (state === 'login') {
    return (
      <div className="adm">
        <div className="adm-login">
          <div className="adm-login-card">
            <div className="adm-login-logo"><img src={logo} alt="" className="adm-logo-img" /> DDC · Админ</div>
            <h1>Вход в панель</h1>
            <p className="sub">Центр цифрового развития</p>
            <div className="adm-field">
              <label>Логин</label>
              <input className="adm-input" value={login} onChange={(e) => setLogin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doLogin()} autoComplete="username" />
            </div>
            <div className="adm-field">
              <label>Пароль</label>
              <input className="adm-input" type="password" value={pass} onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doLogin()} autoComplete="current-password" />
            </div>
            <button className="adm-btn" style={{ width: '100%' }} onClick={doLogin} disabled={busy}>
              {busy ? 'Входим…' : 'Войти'}
            </button>
            <div className="adm-err">{err}</div>
            <div className="adm-hint">Доступ по логину и паролю с назначенной ролью</div>
          </div>
        </div>
      </div>
    );
  }

  const role = me.role;
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isStaff = role === 'staff';
  const canAssign = isAdmin || isManager;                       // назначать исполнителя
  const canEditLeads = isAdmin || isManager || isStaff || role === 'editor';
  const canEditNews = isAdmin || role === 'editor';
  const aiAccess = isAdmin || isManager;
  const titleOf = (id) => (id === 'leads' && isStaff ? 'Мои задачи' : TITLES[id]);

  const items = [
    { id: 'dashboard', show: !isStaff },
    { id: 'leads', show: true },
    { id: 'ai', show: aiAccess },
    { id: 'analytics', show: !isStaff },
    { id: 'careers', show: isAdmin || isManager },
    { id: 'system', show: isAdmin || isManager },
    { id: 'services', show: isAdmin || role === 'editor' || role === 'viewer' },
    { id: 'news', show: isAdmin || role === 'editor' || role === 'viewer' },
    { id: 'history', show: !isStaff },
    { id: 'users', show: isAdmin },
  ].filter((x) => x.show);

  return (
    <div className="adm adm-shell">
      <aside className="adm-rail">
        <div className="rail-brand"><img src={logo} alt="DDC" /></div>
        <nav className="rail-nav">
          {items.map((it) => (
            <button key={it.id} className={`rail-btn ${tab === it.id ? 'active' : ''}`} onClick={() => setTab(it.id)} title={titleOf(it.id)}>
              <Ico name={it.id} /><span>{titleOf(it.id)}</span>
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <ThemeToggle className="rail-icon" size={18} />
          <a className="rail-icon" href="/" data-spa aria-label="На сайт">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </a>
          <button className="rail-icon" onClick={doLogout} aria-label="Выйти">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </aside>

      <div className="adm-body">
        <header className="adm-bar">
          <h1 className="adm-bar-title">{titleOf(tab)}</h1>
          <span className="sp" />
          <NotificationBell onOpenLead={(id) => { setFocusLead(id); setTab('leads'); }} />
          {me.username && <span className="who">{me.username} <span className={`us-role r-${role}`}>{ROLE_LABEL[role]}</span></span>}
        </header>
        <main className="adm-main" key={tab}>
          <Suspense fallback={<div className="adm-hint">Загрузка…</div>}>
            {tab === 'dashboard' && !isStaff && <Dashboard onAuthLost={() => setState('login')} onGoTab={setTab} />}
            {tab === 'leads' && <Leads onAuthLost={() => setState('login')} canEdit={canEditLeads} canAssign={canAssign} isStaff={isStaff} focusId={focusLead} />}
            {tab === 'ai' && aiAccess && <AiPanel onAuthLost={() => setState('login')} onOpenLead={(id) => { setFocusLead(id); setTab('leads'); }} />}
            {tab === 'analytics' && !isStaff && <Analytics onAuthLost={() => setState('login')} />}
            {tab === 'careers' && (isAdmin || isManager) && <Careers onAuthLost={() => setState('login')} />}
            {tab === 'system' && (isAdmin || isManager) && <System onAuthLost={() => setState('login')} />}
            {tab === 'services' && <ServicesManager onAuthLost={() => setState('login')} canEdit={canEditNews} />}
            {tab === 'news' && <NewsManager onAuthLost={() => setState('login')} canEdit={canEditNews} />}
            {tab === 'history' && <History onAuthLost={() => setState('login')} />}
            {tab === 'users' && isAdmin && <Users onAuthLost={() => setState('login')} me={me} />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getJSON, sendJSON, apiFetch } from '../api.js';
import { useTheme, toggleTheme } from '../store.js';
import { IcoSun, IcoMoon } from '../site/icons.jsx';
import Leads from './Leads.jsx';
import NewsManager from './NewsManager.jsx';
import Analytics from './Analytics.jsx';
import Users from './Users.jsx';
import './admin.css';

const ROLE_LABEL = { admin: 'Администратор', editor: 'Редактор', viewer: 'Просмотр' };

export default function Admin() {
  const theme = useTheme();
  const [state, setState] = useState('checking'); // checking | login | app
  const [me, setMe] = useState({ username: '', role: 'viewer' });
  const [tab, setTab] = useState('leads');

  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getJSON('/api/me')
      .then((m) => { if (alive) { setMe({ username: m.username || '', role: m.role || 'viewer' }); setState('app'); } })
      .catch(() => { if (alive) setState('login'); });
    return () => { alive = false; };
  }, []);

  const doLogin = async () => {
    setBusy(true); setErr('');
    try {
      const d = await sendJSON('/api/login', 'POST', { username: login.trim(), password: pass });
      setMe({ username: d.username || login.trim(), role: d.role || 'viewer' });
      setState('app');
    } catch (e) {
      setErr(e.status === 401 ? 'Неверный логин или пароль' : 'Сервер недоступен');
    } finally { setBusy(false); }
  };

  const doLogout = async () => {
    try { await apiFetch('/api/logout', { method: 'POST' }); } catch {}
    setState('login'); setLogin(''); setPass(''); setTab('leads');
  };

  if (state === 'checking') {
    return <div className="adm"><div className="adm-login"><div className="adm-hint">Загрузка…</div></div></div>;
  }

  if (state === 'login') {
    return (
      <div className="adm">
        <div className="adm-login">
          <div className="adm-login-card">
            <div className="adm-login-logo"><img src="/ddc.png" alt="" className="adm-logo-img" /> DDC · Админ</div>
            <h1>Вход в панель</h1>
            <p className="sub">Центр цифрового развития НБК</p>
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
  const canEdit = role === 'admin' || role === 'editor';
  const isAdmin = role === 'admin';

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="brand"><img src="/ddc.png" alt="" className="adm-logo-img" /> DDC <small>Админ-панель</small></div>
        <span className="sp" />
        {me.username && <span className="who">👤 {me.username} <span className={`us-role r-${role}`}>{ROLE_LABEL[role]}</span></span>}
        <button className="adm-ghost" onClick={toggleTheme} aria-label="Тема">
          {theme === 'dark' ? <IcoMoon size={16} /> : <IcoSun size={16} />}
        </button>
        <a className="adm-ghost" href="/" data-spa>← На сайт</a>
        <button className="adm-ghost" onClick={doLogout}>Выйти</button>
      </header>

      <div className="adm-tabs">
        <button className={`adm-tab ${tab === 'leads' ? 'active' : ''}`} onClick={() => setTab('leads')}>Заявки</button>
        <button className={`adm-tab ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}>Аналитика</button>
        <button className={`adm-tab ${tab === 'news' ? 'active' : ''}`} onClick={() => setTab('news')}>Новости</button>
        {isAdmin && <button className={`adm-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>Пользователи</button>}
      </div>

      <main className="adm-main">
        {tab === 'leads' && <Leads onAuthLost={() => setState('login')} canEdit={canEdit} />}
        {tab === 'analytics' && <Analytics onAuthLost={() => setState('login')} />}
        {tab === 'news' && <NewsManager onAuthLost={() => setState('login')} canEdit={canEdit} />}
        {tab === 'users' && isAdmin && <Users onAuthLost={() => setState('login')} me={me} />}
      </main>
    </div>
  );
}

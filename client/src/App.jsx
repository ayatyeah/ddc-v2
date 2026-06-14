import { useEffect, useState } from 'react';
import Site from './site/Site.jsx';
import Admin from './admin/Admin.jsx';

/* Простейший роутинг по pathname: /admin → админка, всё остальное → сайт.
   SPA-fallback на сервере отдаёт index.html для любого пути. */
export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    // Перехватываем клики по внутренним ссылкам с data-spa
    const onClick = (e) => {
      const a = e.target.closest('a[data-spa]');
      if (!a) return;
      const url = new URL(a.href);
      if (url.origin === window.location.origin) {
        e.preventDefault();
        window.history.pushState({}, '', url.pathname);
        setPath(url.pathname);
        window.scrollTo(0, 0);
      }
    };
    document.addEventListener('click', onClick);
    return () => { window.removeEventListener('popstate', onPop); document.removeEventListener('click', onClick); };
  }, []);

  return path.startsWith('/admin') ? <Admin /> : <Site />;
}

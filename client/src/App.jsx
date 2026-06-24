import { lazy, Suspense, useEffect, useState } from 'react';

/* Сайт и админка — отдельные ленивые чанки: посетитель сайта не качает код админки,
   и наоборот. Это режет первичную загрузку, не меняя внешний вид. */
const Site = lazy(() => import('./site/Site.jsx'));
const Admin = lazy(() => import('./admin/Admin.jsx'));

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

  // fallback=null: фон страницы тёмный, кратковременная пустота незаметна
  return (
    <Suspense fallback={null}>
      {path.startsWith('/admin') ? <Admin /> : <Site />}
    </Suspense>
  );
}

import { useLang, useLogo } from '../store.js';
import { t } from '../i18n.js';
import { navigate } from './router.js';

/* Полноценный фирменный футер: бренд-блок + три колонки ссылок + нижняя строка.
   Ссылки разделов идут через SPA-роутер (без перезагрузки страницы). */
const NAV = [
  ['/uslugi', 'nav.services'],
  ['/proekty', 'nav.projects'],
  ['/o-nas', 'nav.about'],
  ['/karera', 'nav.careers'],
  ['/partners', 'nav.partners'],
  ['/kontakty', 'nav.contacts'],
];

export default function Footer() {
  const lang = useLang();
  const logo = useLogo();
  const year = new Date().getFullYear();
  const go = (to) => (e) => { e.preventDefault(); navigate(to); };
  return (
    <footer className="footer2">
      <div className="wrap">
        <div className="footer2-grid">
          <div className="footer2-brand">
            <div className="f2-logo">
              <img src={logo} alt="" decoding="async" loading="lazy" />
              <span>Digital Development Center</span>
            </div>
            <p>{t(lang, 'footer.desc')}</p>
            <div className="f2-addr">{t(lang, 'contact.addr')}</div>
          </div>

          <nav className="f2-col" aria-label={t(lang, 'footer.nav')}>
            <b>{t(lang, 'footer.nav')}</b>
            {NAV.map(([to, key]) => (
              <a key={to} href={to} onClick={go(to)}>{t(lang, key)}</a>
            ))}
          </nav>

          <div className="f2-col">
            <b>{t(lang, 'footer.contacts')}</b>
            <a href="tel:+77272584958">+7 727 258-49-58</a>
            <a href="mailto:info@bsbnb.kz">info@bsbnb.kz</a>
            <a href="tel:1477">1477 · 24/7</a>
          </div>

          <div className="f2-col">
            <b>{t(lang, 'footer.access')}</b>
            <a href="/portal" data-spa>{t(lang, 'portal.enter')}</a>
            <a href="/admin" data-spa>{t(lang, 'footer.admin')}</a>
            <a href="https://zakup.nationalbank.kz" target="_blank" rel="noopener noreferrer">zakup.nationalbank.kz</a>
          </div>
        </div>

        <div className="footer2-bottom">
          <span>© {year} DDC — {t(lang, 'hero.eyebrow')} · {t(lang, 'footer.rights')}</span>
          <span className="sp" />
          <a href="/politika-konfidencialnosti" onClick={go('/politika-konfidencialnosti')}>{t(lang, 'footer.privacy')}</a>
        </div>
      </div>
    </footer>
  );
}

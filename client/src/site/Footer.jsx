import { useLang } from '../store.js';
import { t } from '../i18n.js';
import { navigate } from './router.js';

export default function Footer() {
  const lang = useLang();
  const year = new Date().getFullYear();
  const goPrivacy = (e) => { e.preventDefault(); navigate('/politika-konfidencialnosti'); };
  return (
    <footer className="footer">
      <div className="wrap">
        <span className="brand">DDC — {t(lang, 'hero.eyebrow')}</span>
        <span className="sp" />
        <span>© {year} · {t(lang, 'footer.rights')}</span>
        <a href="/politika-konfidencialnosti" onClick={goPrivacy}>{t(lang, 'footer.privacy')}</a>
        <a href="tel:+77272584958">+7 727 258-49-58</a>
        <a href="mailto:info@bsbnb.kz">info@bsbnb.kz</a>
        <a href="/portal" data-spa>{t(lang, 'portal.enter')}</a>
        <a href="/admin" data-spa>{t(lang, 'footer.admin')}</a>
      </div>
    </footer>
  );
}

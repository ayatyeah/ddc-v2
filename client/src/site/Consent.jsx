import { t } from '../i18n.js';

/* Текст согласия с кликабельной ссылкой на политику конфиденциальности.
   Открывается в новой вкладке, чтобы не потерять заполненную форму.
   Клик по ссылке не должен переключать чекбокс (stopPropagation). */
export default function Consent({ lang }) {
  return (
    <span>
      {t(lang, 'consent.pre')}
      <a
        href="/politika-konfidencialnosti"
        target="_blank"
        rel="noopener"
        className="consent-link"
        onClick={(e) => e.stopPropagation()}
      >{t(lang, 'consent.link')}</a>
      {t(lang, 'consent.post')}
    </span>
  );
}

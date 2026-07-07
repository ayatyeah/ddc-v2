import { useEffect, useState } from 'react';
import { useLang } from '../store.js';
import { t } from '../i18n.js';

/* Плавающая кнопка «Установить приложение».
   • Android/Chrome/Edge: ловим beforeinstallprompt, показываем кнопку, по клику — нативный prompt().
   • iOS Safari: события нет — показываем подсказку про «Поделиться → На экран Домой».
   Прячем в standalone-режиме и после закрытия (запоминаем в localStorage на 14 дней). */
const SNOOZE_KEY = 'ddc_pwa_snooze';
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
const snoozed = () => {
  try { const v = Number(localStorage.getItem(SNOOZE_KEY) || 0); return v > Date.now(); } catch { return false; }
};

export default function InstallPrompt() {
  const lang = useLang();
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;

    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); setShow(true); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const onInstalled = () => { setShow(false); setDeferred(null); };
    window.addEventListener('appinstalled', onInstalled);

    // iOS: beforeinstallprompt не существует — показываем подсказку с задержкой
    let iosTimer;
    if (isIOS()) iosTimer = setTimeout(() => setShow(true), 2600);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const snooze = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 14 * 24 * 3600 * 1000)); } catch {}
    setShow(false); setIosHint(false);
  };

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch {}
      setDeferred(null); setShow(false);
    } else if (isIOS()) {
      setIosHint((v) => !v);
    }
  };

  if (!show) return null;

  return (
    <div className="pwa-install" role="dialog" aria-label={t(lang, 'pwa.install')}>
      {iosHint && <p className="pwa-ios-hint">{t(lang, 'pwa.iosHint')}</p>}
      <div className="pwa-install-row">
        <button className="pwa-install-btn" onClick={install}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
          </svg>
          {t(lang, 'pwa.install')}
        </button>
        <button className="pwa-install-x" onClick={snooze} aria-label={t(lang, 'pwa.dismiss')}>✕</button>
      </div>
    </div>
  );
}

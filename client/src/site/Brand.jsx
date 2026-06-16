import { navigate } from './router.js';

/* Статичный логотип-бренд по центру шапки (на всех страницах). Клик — на главную. */
export default function Brand() {
  return (
    <div className="brandlock" onClick={() => navigate('/')} role="link" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/')} aria-label="DDC — на главную">
      <img className="bl-logo" src="/logo_ddc.svg" alt="" />
      <div className="bl-word">DDC</div>
    </div>
  );
}

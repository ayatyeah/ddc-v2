import { navigate } from './router.js';

/* Статичный логотип-бренд по центру шапки (на всех страницах). Клик — на главную. */
export default function Brand() {
  return (
    <div className="brandlock" onClick={() => navigate('/')} role="link" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/')} aria-label="Digital Development Center — на главную">
      <img className="bl-logo" src="/logo_ddc.svg?v=2" alt="" />
      <div className="bl-word">
        <span>Digital</span>
        <span>Development</span>
        <span>Center</span>
      </div>
    </div>
  );
}

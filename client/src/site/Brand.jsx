import { navigate } from './router.js';
import { useLogo } from '../store.js';

/* Статичный логотип-бренд по центру шапки (на всех страницах). Клик — на главную. */
export default function Brand() {
  const logo = useLogo();   // чёрный на светлой теме, белый на тёмной
  return (
    <div className="brandlock" onClick={() => navigate('/')} role="link" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/')} aria-label="Digital Development Center — на главную">
      <img className="bl-logo" src={logo} alt="" decoding="async" />
      <div className="bl-word">
        <span>Digital</span>
        <span>Development</span>
        <span>Center</span>
      </div>
    </div>
  );
}

/* Набор лёгких inline-SVG иконок (без внешних зависимостей). */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const wrap = (children, vb = '0 0 24 24') => (p) => (
  <svg viewBox={vb} width={p.size || 22} height={p.size || 22} {...S}>{children}</svg>
);

export const IcoCode = wrap(<><path d="M8 6l-6 6 6 6" /><path d="M16 6l6 6-6 6" /></>);
export const IcoLink = wrap(<><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>);
export const IcoCart = wrap(<><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.5 13h11l2-8H6" /></>);
export const IcoChart = wrap(<><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>);
export const IcoSupport = wrap(<><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3zM3 19a2 2 0 0 0 2 2h1v-7H3z" /></>);
export const IcoShield = wrap(<><path d="M12 3l8 4v5c0 4.4-3.1 7.8-8 9-4.9-1.2-8-4.6-8-9V7l8-4z" /></>);
export const IcoSun = wrap(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></>);
export const IcoMoon = wrap(<><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></>);
export const IcoChat = wrap(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>);
export const IcoArrow = wrap(<><path d="M5 12h14M13 6l6 6-6 6" /></>);
// Чип/процессор — для ИИ-инфраструктуры (NBK AI Platform)
export const IcoCpu = wrap(<><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" /></>);
// Стопка монет/токенов — для регуляторной песочницы (цифровые активы)
export const IcoCoin = wrap(<><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>);
// Глаз — переключатель версии для слабовидящих
export const IcoEye = wrap(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>);

// Дополнительные иконки для разделов новой архитектуры
export const IcoCloud = wrap(<><path d="M17.5 19a4.5 4.5 0 0 0 .5-8.98A6 6 0 0 0 6.3 10.5 4 4 0 0 0 7 19h10.5z" /></>);
export const IcoDoc = wrap(<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h6" /></>);
export const IcoUsers = wrap(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 6.5a3 3 0 0 1 0 5M21 20a5 5 0 0 0-4-4.9" /></>);
export const IcoBriefcase = wrap(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></>);
export const IcoMap = wrap(<><path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z" /><path d="M9 3v15M15 6v15" /></>);
export const IcoFlask = wrap(<><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" /><path d="M7.5 15h9" /></>);
export const IcoCheck = wrap(<><path d="M20 6 9 17l-5-5" /></>);
export const IcoRadar = wrap(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /><path d="M12 12 20 7" /></>);
export const IcoSearch = wrap(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>);
export const IcoHome = wrap(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>);

// Реестр иконок услуг: ключ (хранится в БД) → компонент. Один на сайт и админку,
// чтобы выбор иконки в админке совпадал с тем, что рисуется на сайте.
export const SERVICE_ICONS = {
  code: IcoCode, link: IcoLink, cart: IcoCart, chart: IcoChart,
  support: IcoSupport, shield: IcoShield, cpu: IcoCpu, coin: IcoCoin,
};
export const SERVICE_ICON_KEYS = Object.keys(SERVICE_ICONS);

// Реестр иконок для разделов/подпунктов новой архитектуры (ключ → компонент).
export const NAV_ICONS = {
  home: IcoHome, cpu: IcoCpu, shield: IcoShield, cloud: IcoCloud, support: IcoSupport,
  chat: IcoChat, chart: IcoChart, flask: IcoFlask, code: IcoCode, coin: IcoCoin,
  doc: IcoDoc, radar: IcoRadar, briefcase: IcoBriefcase, users: IcoUsers, map: IcoMap,
  check: IcoCheck, search: IcoSearch, link: IcoLink, cart: IcoCart,
};

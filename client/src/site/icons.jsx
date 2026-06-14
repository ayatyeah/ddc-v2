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

/* Лента «пульс инфраструктуры» под героем: бегущая строка с продуктами и фактами
   ЦЦР (только то, что уже заявлено на сайте). Имена собственные и цифры читаются
   на любом языке — без переводов. Чистый CSS-marquee: один композитный слой,
   пауза при наведении; в reduced-motion не движется, в a11y-режиме скрыта. */
const ITEMS = [
  'DDC · ЦЦР',
  'EST. 1995',
  'zakup.nationalbank.kz',
  'NBK Analytics',
  'NBK AI Platform',
  'Фабрика данных',
  '1477 · 24/7',
  'Astana · Qazaqstan',
];

export default function Ribbon() {
  // Дублируем список: трек шириной 200%, анимация до −50% — бесшовный цикл.
  const twice = [...ITEMS, ...ITEMS];
  return (
    <div className="ribbon" aria-hidden="true">
      <div className="ribbon-track">
        {twice.map((it, i) => <span className="ribbon-item" key={i}>{it}</span>)}
      </div>
    </div>
  );
}

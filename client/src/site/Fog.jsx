/* Слой «дыма»/облаков снизу. Прозрачность (--fog) задаёт единый scroll-источник
   в Site.jsx — здесь только разметка, без собственного слушателя скролла,
   чтобы не дублировать чтение layout. */
export default function Fog() {
  return (
    <div id="fog" aria-hidden="true">
      <span className="cloud c1" /><span className="cloud c2" />
      <span className="cloud c3" /><span className="cloud c4" />
    </div>
  );
}

import { useEffect, useRef } from 'react';

/* Круглый курсор-«спутник»: светящееся кольцо мягко догоняет настоящий курсор
   (лёгкое запаздывание = ощущение инерции), при нажатии коротко пульсирует.
   Только десктоп + точный указатель; при reduce-motion и на тач-устройствах не монтируется. */
export default function Cursor() {
  const ref = useRef(null);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduce) return;

    const el = ref.current;
    if (!el) return;

    // Целевая (мышь) и текущая (отрисованная) позиции — между ними лерп для «догоняния».
    let tx = window.innerWidth / 2, ty = window.innerHeight / 2;
    let cx = tx, cy = ty;
    let raf = 0, visible = false;

    const onMove = (e) => {
      tx = e.clientX; ty = e.clientY;
      if (!visible) { visible = true; el.classList.add('on'); }
      el.classList.remove('over-iframe');   // вернулись с iframe на страницу — снова показываем кольцо
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => { visible = false; el.classList.remove('on'); };
    const onDown = () => { el.classList.add('down'); };
    const onUp = () => { el.classList.remove('down'); };

    // Курсор крупнее над кликабельными элементами — подсказка интерактивности.
    const isUi = (t) => t && t.closest && t.closest('button, a, input, textarea, select, label, .chip, .nc-dot, .nav-burger');
    const onOver = (e) => {
      // Над iframe (Яндекс.Карта) родитель перестаёт получать pointermove — кольцо «застряло»
      // бы на краю. Над iframe прячем своё кольцо и отдаём управление системному курсору;
      // как только вернулись на страницу — pointermove ниже снова покажет кольцо.
      if (e.target && e.target.tagName === 'IFRAME') { el.classList.add('over-iframe'); return; }
      el.classList.toggle('hot', !!isUi(e.target));
    };

    const tick = () => {
      raf = 0;
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
      if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('mouseleave', onLeave);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return <div ref={ref} className="cursor-dot" aria-hidden="true" />;
}

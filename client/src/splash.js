/* Убираем загрузочный экран (#splash из index.html), когда приложение смонтировалось.
   Вызывается из Site/Admin при первом рендере — то есть когда ленивый чанк уже загружен
   и контент рендерится. Фейд + удаление элемента из DOM. */
export function hideSplash() {
  const el = document.getElementById('splash');
  if (!el || el.classList.contains('hide')) return;
  el.classList.add('hide');
  setTimeout(() => el.remove(), 700);
}

/* clientReport.js — скачивание PDF-отчёта по клиенту.
   Отчёт генерируется на сервере (GET /api/leads/:id/report.pdf) и приходит готовым
   PDF-файлом. Тянем его как blob (с cookie-сессией) и сохраняем под именем
   «ИмяКлиента_Отчёт.pdf». Кнопка показывается только для обслуженных клиентов
   с ИИ-скором и оценочным листом. */
import { apiFetch } from '../api.js';

function safeFile(name) {
  return (String(name || '').trim().replace(/\s+/g, '_').replace(/[\\/:*?"<>|.]+/g, '').slice(0, 80)) || 'Клиент';
}

export async function downloadClientReport(lead) {
  let res;
  try {
    res = await apiFetch(`/api/leads/${lead.id}/report.pdf`);
  } catch {
    alert('Нет соединения с сервером — не удалось сформировать отчёт.');
    return;
  }
  if (!res.ok) {
    let msg = 'Не удалось сформировать отчёт.';
    try { msg = (await res.json()).error || msg; } catch { /* не JSON */ }
    alert(msg);
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFile(lead.full_name)}_Отчёт.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* Обёртка над fetch. В dev /api проксируется Vite на бэкенд, на проде — тот же origin.
   credentials:'include' нужен для cookie-сессии админа. */
export async function apiFetch(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
  } catch {
    // Сеть недоступна / запрос прерван
    throw Object.assign(new Error('Нет соединения с сервером'), { status: 0 });
  }
  return res;
}


export async function getJSON(path) {
  const r = await apiFetch(path);
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || 'Ошибка запроса'), { status: r.status });
  }
  return r.json();
}

export async function sendJSON(path, method, body) {
  const r = await apiFetch(path, { method, body: JSON.stringify(body || {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Ошибка'), { status: r.status });
  return data;
}

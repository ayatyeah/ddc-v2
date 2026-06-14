/* Обёртка над fetch. В dev /api проксируется Vite на бэкенд, на проде — тот же origin.
   credentials:'include' нужен для cookie-сессии админа. */
export async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  return res;
}


export async function getJSON(path) {
  const r = await apiFetch(path);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Ошибка запроса');
  return r.json();
}

export async function sendJSON(path, method, body) {
  const r = await apiFetch(path, { method, body: JSON.stringify(body || {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Ошибка'), { status: r.status });
  return data;
}

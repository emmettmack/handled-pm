// In the static build (GitHub Pages) the same routes run in the browser; otherwise they hit the Node server.
const STATIC = import.meta.env.VITE_STATIC === '1';
const staticApi = STATIC ? import('./demo/staticApi.js') : null;

async function request(path, opts = {}) {
  if (STATIC) {
    const { staticRequest } = await staticApi;
    return staticRequest(path, opts.method || 'GET', opts.body ? JSON.parse(opts.body) : {});
  }
  const res = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body: JSON.stringify(body || {}) }),
  put: (p, body) => request(p, { method: 'PUT', body: JSON.stringify(body || {}) }),
  del: (p) => request(p, { method: 'DELETE' }),
};

// In the static build (GitHub Pages) the same routes run in the browser; otherwise they hit the Node server.
import { loadStatic } from './backend.js';

async function request(path, opts = {}) {
  if (loadStatic) {
    const { staticRequest } = await loadStatic();
    return staticRequest(path, opts.method || 'GET', opts.body ? JSON.parse(opts.body) : {});
  }
  const token = await window.Clerk?.session?.getToken(); // set when signed in with Clerk
  const res = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...opts });
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

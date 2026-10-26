// The server's route table (server/routes.js), run in the browser so the dashboard works on static hosting.
// The same store/triage/actions modules run over an in-browser SQLite.
import { db } from './browserDb.js';
import * as A from '../../../server/actions.js';
import { seed } from '../../../server/seed.js';
import { routes, fail } from '../../../server/routes.js';
import { applyMigrations } from '../../../server/migrations/index.js';

applyMigrations(db);
seed();
A.startScheduler();

const compiled = routes.map(([method, path, handler]) => ({ method, handler, re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') }));

export async function staticRequest(path, method = 'GET', body = {}) {
  for (const r of compiled) {
    const m = r.method === method && r.re.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, k === 'type' ? v : Number(v)]));
    return (await r.handler({ params, body })) ?? { ok: true };
  }
  throw fail('Not found', 404);
}

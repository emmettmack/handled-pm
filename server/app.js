// The Express app, without starting it, so tests can run the real server in-process (see index.js for startup).
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { routes } from './routes.js';
import { authenticate } from './auth.js';
import { inboundSms, inboundStatus } from './twilio.js';
import { router as adminRouter, requireAdmin, adminMe } from './admin.js';
import { setMetricSink } from './metrics.js';
import { bumpMetric, getKv } from './registry.js';
import { currentAccount } from './accounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded webhooks

const wrap = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error(e); // refusals (4xx) are normal, not errors
    res.status(e.status || 500).json({ error: e.message });
  }
};

// Health check for the host (no sign-in, reveals nothing).
app.get('/healthz', (_req, res) => res.send('ok'));

// Incoming texts from Twilio. Outside the sign-in check because Twilio can't sign in; it is protected by Twilio's
// request signature instead (see twilio.js).
app.post('/api/webhooks/sms', inboundSms);
app.post('/api/webhooks/sms-status', inboundStatus);

// Body parsing comes after the sign-in check so strangers can't make the server buffer large uploads.
app.use('/api', authenticate, express.json({ limit: '25mb' })); // tenant photos and videos arrive as data URLs

// Usage counters for the admin page
setMetricSink((key, n) => bumpMetric(currentAccount(), key, n));

// Site-wide notice from the admin page (shown to every signed-in user); and who is an admin
app.get('/api/announcement', wrap(() => getKv('announcement', { text: '', level: 'info', active: false })));
app.get('/api/admin/me', adminMe);
app.use('/api/admin', requireAdmin, adminRouter);

// Every JSON route lives in routes.js (shared with the static browser demo).
for (const [method, path, handler] of routes) {
  app[method.toLowerCase()]('/api' + path, wrap((req) => {
    const params = Object.fromEntries(Object.entries(req.params).map(([k, v]) => [k, k === 'type' ? v : Number(v)]));
    return handler({ params, body: req.body || {} });
  }));
}

// ---------- static frontend (after `npm run build`) ----------
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

export { app };

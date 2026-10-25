import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as S from './store.js';
import * as ai from './ai.js';
import * as A from './actions.js';
import { seed } from './seed.js';
import { routes } from './routes.js';
import { authenticate, authEnabled } from './auth.js';
import { isDemo } from './mode.js';
import { inboundSms } from './twilio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (isDemo() && !S.getCompany()) seed(); // sample data is for local development only; real accounts start empty

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded webhooks

const wrap = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
};

// Health check for the host (no sign-in, reveals nothing).
app.get('/healthz', (_req, res) => res.send('ok'));

// Incoming texts from Twilio. Outside the sign-in check because Twilio can't sign in; it is protected by Twilio's
// request signature instead (see twilio.js).
app.post('/api/webhooks/sms', inboundSms);

// Body parsing comes after the sign-in check so strangers can't make the server buffer large uploads.
app.use('/api', authenticate, express.json({ limit: '25mb' })); // tenant photos and videos arrive as data URLs

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

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  const s = ai.aiStatus();
  console.log(`\n  Macalisto API running on http://localhost:${port}`);
  console.log(s.mock ? '  AI: DEMO MODE (no ANTHROPIC_API_KEY set, using canned responses)' : `  AI: live, model ${s.model}`);
});
A.startScheduler();

// Public demo hosting: wipe visitor changes and restore the sample data every N hours.
if (isDemo() && Number(process.env.DEMO_RESET_HOURS) > 0) setInterval(() => seed(), Number(process.env.DEMO_RESET_HOURS) * 3600000);

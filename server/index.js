import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import * as S from './store.js';
import * as ai from './ai.js';
import * as A from './actions.js';
import { seed } from './seed.js';
import { receiveInboundMessage } from './intake.js';
import { pickScenario } from './scenarios.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!S.getCompany()) seed();

const app = express();
app.use(express.json());
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
const id = (req) => Number(req.params.id);

// ---------- app state ----------
app.get('/api/status', wrap(() => ({ ...ai.aiStatus(), company: S.getCompany() })));

app.get('/api/dashboard', wrap(() => {
  const tickets = S.listBrief();
  return {
    stats: S.stats(),
    approvals: S.approvalQueue(),
    emergencies: tickets.filter((t) => t.urgency === 'emergency' && !S.CLOSED_STATUSES.includes(t.status)),
    attention: tickets.filter((t) => t.flags.some((f) => f.type !== 'no_response') && !S.CLOSED_STATUSES.includes(t.status)),
    tickets,
    ai: ai.aiStatus(),
  };
}));

app.get('/api/tickets/:id', wrap((req) => {
  const t = S.ticketDetail(id(req));
  if (!t) throw Object.assign(new Error('Not found'), { status: 404 });
  return t;
}));

// ---------- intake (simulated) ----------
const UNKNOWN_LOCKOUT = { urgency: 'urgent', brief: 'locked out of apartment', en: "I'm locked out of my apartment, lost my keys. Can someone come open the door today?" };

/** Picks a random tenant (rarely an unknown number) and a scenario weighted mostly routine, and writes the text. */
async function randomTenantText() {
  const tenants = db.prepare('SELECT * FROM tenants').all();
  const tenant = Math.random() < 0.06 ? null : tenants[Math.floor(Math.random() * tenants.length)];
  const language = tenant?.language || 'en';
  const scenario = tenant ? pickScenario(language === 'es') : UNKNOWN_LOCKOUT;
  return { tenantId: tenant?.id ?? null, body: await ai.generateTenantMessage({ scenario, tenant, language }) };
}

app.post('/api/simulate/generate', wrap(() => randomTenantText()));

app.post('/api/simulate/incoming', wrap(async (req) => {
  let { tenantId, body } = req.body || {};
  if (!body) ({ tenantId, body } = await randomTenantText());
  const tenant = tenantId ? S.db_tenant(tenantId) : null;
  const from = tenant?.phone || `+1310555${String(Math.floor(1000 + Math.random() * 8999))}`;
  const out = receiveInboundMessage({ channel: 'sim', from, body });
  return { ...out, body, tenant_name: tenant?.name || 'Unknown number' };
}));

app.get('/api/tenants', wrap(() => S.allTenantsWithUnits()));

// Twilio-shaped webhook stub. Point a Twilio number's "A message comes in" webhook here and the same
// pipeline handles it. (Add signature validation + a TwiML/empty 200 response before going live.)
app.post('/api/webhooks/sms', wrap((req, res) => {
  receiveInboundMessage({ channel: 'sms', from: req.body.From, body: req.body.Body });
  res.type('text/xml').send('<Response></Response>');
}));

// ---------- tenant / PM messaging on a ticket ----------
app.post('/api/tickets/:id/tenant-reply', wrap((req) => {
  const t = S.getTicket(id(req));
  return receiveInboundMessage({ channel: 'sim', from: t.from_phone, body: req.body.body, ticketId: t.id });
}));
app.post('/api/tickets/:id/pm-message', wrap((req) => A.pmMessage(id(req), req.body.body)));
app.post('/api/tickets/:id/notes', wrap((req) => S.updateTicket(id(req), { internal_notes: String(req.body.notes ?? '') })));

// ---------- approvals ----------
app.post('/api/dispatches/:id/approve', wrap((req) => A.approveDispatch(id(req), req.body?.text)));
app.post('/api/dispatches/:id/reject', wrap((req) => A.rejectDispatch(id(req), req.body?.note)));
app.post('/api/tickets/:id/redraft', wrap((req) => { A.redraft(id(req), req.body?.note); }));

// ---------- lifecycle ----------
app.post('/api/tickets/:id/owner-approved', wrap((req) => { A.ownerApproved(id(req)); }));
app.post('/api/tickets/:id/vendor-accepted', wrap((req) => A.vendorAccepted(id(req))));
app.post('/api/tickets/:id/skip-timer', wrap((req) => { A.skipTimer(id(req)); }));
app.post('/api/tickets/:id/status', wrap((req) => A.advanceStatus(id(req), req.body.status)));
app.post('/api/tickets/:id/flags/:type', wrap((req) => { A.resolveFlagAction(id(req), req.params.type, req.body?.action); }));
app.post('/api/tickets/:id/ack-emergency', wrap((req) => A.ackEmergency(id(req))));

// ---------- vendors ----------
const vendorFields = (b) => [b.name, b.trade, b.phone || '', b.email || '', b.rate || '', b.preferred ? 1 : 0, b.notes || ''];
app.get('/api/vendors', wrap(() => db.prepare('SELECT * FROM vendors WHERE active = 1 ORDER BY trade, preferred DESC, name').all()));
app.post('/api/vendors', wrap((req) => {
  if (!req.body.name || !req.body.trade) throw Object.assign(new Error('Name and trade are required'), { status: 400 });
  const r = db.prepare('INSERT INTO vendors (name,trade,phone,email,rate,preferred,notes) VALUES (?,?,?,?,?,?,?)').run(...vendorFields(req.body));
  return S.getVendor(r.lastInsertRowid);
}));
app.put('/api/vendors/:id', wrap((req) => {
  db.prepare('UPDATE vendors SET name=?, trade=?, phone=?, email=?, rate=?, preferred=?, notes=? WHERE id=?').run(...vendorFields(req.body), id(req));
  return S.getVendor(id(req));
}));
app.delete('/api/vendors/:id', wrap((req) => { db.prepare('UPDATE vendors SET active = 0 WHERE id = ?').run(id(req)); }));

// ---------- properties ----------
app.get('/api/properties', wrap(() => db.prepare('SELECT p.*, (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) AS unit_count FROM properties p').all()));
app.put('/api/properties/:id', wrap((req) => {
  const limit = Math.max(0, Math.round(Number(req.body.approval_limit)));
  if (Number.isNaN(limit)) throw Object.assign(new Error('Enter a dollar amount'), { status: 400 });
  db.prepare('UPDATE properties SET approval_limit = ? WHERE id = ?').run(limit, id(req));
}));

app.post('/api/demo/reset', wrap(() => { seed(); }));

// ---------- static frontend (after `npm run build`) ----------
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  const s = ai.aiStatus();
  console.log(`\n  Handled API running on http://localhost:${port}`);
  console.log(s.mock ? '  AI: DEMO MODE (no ANTHROPIC_API_KEY set, using canned responses)' : `  AI: live, model ${s.model}`);
});
A.startScheduler();

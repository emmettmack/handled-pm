// The server's route table, run in the browser so the dashboard works on static hosting.
// Handlers mirror server/index.js and call the same store/triage/actions modules over an in-browser SQLite.
import { db } from './browserDb.js';
import * as S from '../../../server/store.js';
import * as ai from '../../../server/ai.js';
import * as A from '../../../server/actions.js';
import { seed } from '../../../server/seed.js';
import { receiveInboundMessage } from '../../../server/intake.js';
import { pickScenario } from '../../../server/scenarios.js';
import { SCHEMA } from './schema.js';

db.exec(SCHEMA);
seed();
try {
  const c = localStorage.getItem('handled_contact');
  if (c) db.prepare(c.includes('@') ? 'UPDATE company SET email = ? WHERE id = 1' : 'UPDATE company SET phone = ? WHERE id = 1').run(c);
} catch { /* storage unavailable: keep sample contact */ }
A.startScheduler();

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const UNKNOWN_LOCKOUT = { urgency: 'urgent', brief: 'locked out of apartment', en: "I'm locked out of my apartment, lost my keys. Can someone come open the door today?" };

async function randomTenantText() {
  const tenants = db.prepare('SELECT * FROM tenants').all();
  const tenant = Math.random() < 0.06 ? null : tenants[Math.floor(Math.random() * tenants.length)];
  const language = tenant?.language || 'en';
  const scenario = tenant ? pickScenario(language === 'es') : UNKNOWN_LOCKOUT;
  return { tenantId: tenant?.id ?? null, body: await ai.generateTenantMessage({ scenario, tenant, language }) };
}
const vendorFields = (b) => [b.name, b.trade, b.phone || '', b.email || '', b.rate || '', b.preferred ? 1 : 0, b.notes || ''];

const routes = [];
const on = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

on('GET', '/status', () => ({ ...ai.aiStatus(), company: S.getCompany() }));
on('GET', '/dashboard', () => {
  const tickets = S.listBrief();
  const open = (t) => !S.CLOSED_STATUSES.includes(t.status);
  return {
    stats: S.stats(), approvals: S.approvalQueue(),
    emergencies: tickets.filter((t) => t.urgency === 'emergency' && open(t)),
    attention: tickets.filter((t) => t.flags.some((f) => f.type !== 'no_response') && open(t)),
    tickets, ai: ai.aiStatus(),
  };
});
on('GET', '/tickets/:id', ({ id }) => S.ticketDetail(id) || (() => { throw fail('Not found', 404); })());
on('POST', '/simulate/generate', () => randomTenantText());
on('POST', '/simulate/incoming', async ({ body }) => {
  let { tenantId, body: text } = body;
  if (!text) ({ tenantId, body: text } = await randomTenantText());
  const tenant = tenantId ? S.db_tenant(tenantId) : null;
  const from = tenant?.phone || `+1310555${String(Math.floor(1000 + Math.random() * 8999))}`;
  const out = receiveInboundMessage({ channel: 'sim', from, body: text });
  return { ...out, body: text, tenant_name: tenant?.name || 'Unknown number' };
});
on('GET', '/tenants', () => S.allTenantsWithUnits());
on('POST', '/tickets/:id/tenant-reply', ({ id, body }) => {
  const t = S.getTicket(id);
  return receiveInboundMessage({ channel: 'sim', from: t.from_phone, body: body.body, ticketId: t.id });
});
on('POST', '/tickets/:id/pm-message', ({ id, body }) => A.pmMessage(id, body.body));
on('POST', '/tickets/:id/notes', ({ id, body }) => S.updateTicket(id, { internal_notes: String(body.notes ?? '') }));
on('POST', '/dispatches/:id/approve', ({ id, body }) => A.approveDispatch(id, body?.text));
on('POST', '/dispatches/:id/reject', ({ id, body }) => A.rejectDispatch(id, body?.note));
on('POST', '/tickets/:id/redraft', ({ id, body }) => { A.redraft(id, body?.note); });
on('POST', '/tickets/:id/owner-approved', ({ id }) => { A.ownerApproved(id); });
on('POST', '/tickets/:id/vendor-accepted', ({ id }) => A.vendorAccepted(id));
on('POST', '/tickets/:id/skip-timer', ({ id }) => { A.skipTimer(id); });
on('POST', '/tickets/:id/status', ({ id, body }) => A.advanceStatus(id, body.status));
on('POST', '/tickets/:id/flags/:type', ({ id, type, body }) => { A.resolveFlagAction(id, type, body?.action); });
on('POST', '/tickets/:id/ack-emergency', ({ id }) => A.ackEmergency(id));
on('GET', '/vendors', () => db.prepare('SELECT * FROM vendors WHERE active = 1 ORDER BY trade, preferred DESC, name').all());
on('POST', '/vendors', ({ body }) => {
  if (!body.name || !body.trade) throw fail('Name and trade are required');
  const r = db.prepare('INSERT INTO vendors (name,trade,phone,email,rate,preferred,notes) VALUES (?,?,?,?,?,?,?)').run(...vendorFields(body));
  return S.getVendor(r.lastInsertRowid);
});
on('PUT', '/vendors/:id', ({ id, body }) => {
  db.prepare('UPDATE vendors SET name=?, trade=?, phone=?, email=?, rate=?, preferred=?, notes=? WHERE id=?').run(...vendorFields(body), id);
  return S.getVendor(id);
});
on('DELETE', '/vendors/:id', ({ id }) => { db.prepare('UPDATE vendors SET active = 0 WHERE id = ?').run(id); });
on('GET', '/properties', () => db.prepare('SELECT p.*, (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) AS unit_count FROM properties p').all());
on('PUT', '/properties/:id', ({ id, body }) => {
  const limit = Math.max(0, Math.round(Number(body.approval_limit)));
  if (Number.isNaN(limit)) throw fail('Enter a dollar amount');
  db.prepare('UPDATE properties SET approval_limit = ? WHERE id = ?').run(limit, id);
});
on('POST', '/demo/reset', () => { seed(); });

export async function staticRequest(path, method = 'GET', body = {}) {
  for (const r of routes) {
    const m = r.method === method && r.re.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, k === 'type' ? v : Number(v)]));
    return (await r.fn({ ...params, body })) ?? { ok: true };
  }
  throw fail('Not found', 404);
}

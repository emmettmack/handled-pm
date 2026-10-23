// The API as plain data: [method, path, handler({ params, body }) -> result]. server/index.js mounts it on Express;
// the static GitHub Pages demo runs the very same table in the browser (client/src/demo/staticApi.js).
import { db } from './db.js';
import * as S from './store.js';
import * as ai from './ai.js';
import * as A from './actions.js';
import { seed } from './seed.js';
import { receiveInboundMessage } from './intake.js';
import { pickScenario } from './scenarios.js';
import { buildText } from './mockAi.js';

export const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });

const UNKNOWN_LOCKOUT = { urgency: 'urgent', brief: 'locked out of apartment', en: "I'm locked out of my apartment, lost my keys. Can someone come open the door today?" };

/** Picks a random tenant (rarely an unknown number) and a scenario weighted mostly routine, and writes the text. */
async function randomTenantText() {
  const tenants = db.prepare('SELECT * FROM tenants').all();
  const tenant = Math.random() < 0.06 ? null : tenants[Math.floor(Math.random() * tenants.length)];
  const language = tenant?.language || 'en';
  const scenario = tenant ? pickScenario(language === 'es') : UNKNOWN_LOCKOUT;
  return { tenantId: tenant?.id ?? null, body: await ai.generateTenantMessage({ scenario, tenant, language }) };
}

const vendorFields = (b) => [b.name, b.trade, b.phone || '', b.personal_phone || '', b.email || '', b.rate || '', b.preferred ? 1 : 0, b.notes || '', b.primary_company ? 1 : 0, b.primary_personal ? 1 : 0, b.primary_email ? 1 : 0];

/** Every vendor needs at least one primary contact method, and each primary one needs a value to reach them at. */
function checkVendor(b) {
  if (!b.name || !b.trade) throw fail('Name and trade are required');
  const picks = [['primary_company', 'phone', 'company phone'], ['primary_personal', 'personal_phone', 'personal phone'], ['primary_email', 'email', 'email']].filter(([flag]) => b[flag]);
  if (!picks.length) throw fail('Pick at least one primary contact so Macalisto knows how to reach this vendor.');
  const missing = picks.find(([, field]) => !String(b[field] || '').trim());
  if (missing) throw fail(`You marked ${missing[2]} as primary but left it blank.`);
}

const SAMPLE = {
  company: null,
  ticket: { id: 1042, urgency: 'urgent', summary: 'Kitchen sink is leaking under the cabinet. Active but contained leak, tenant is home evenings.', diagnosis: 'Likely a worn supply line or loose fitting under the sink.', access_notes: 'Tenant is home after 5pm.', category: 'plumbing', language: 'es', cost_estimate: 400, title: 'Kitchen sink leak' },
  unit: { number: '4B', address: '2830 Hyperion Ave', neighborhood: 'Silver Lake' },
  tenant: { name: 'Maria Lopez', phone: '+13235550101' },
  accessAllowed: true, mediaCount: 2,
};

export const routes = [
  // ---------- app state ----------
  ['GET', '/status', () => ({ ...ai.aiStatus(), company: S.getCompany() })],
  ['GET', '/dashboard', () => {
    const tickets = S.listBrief();
    const open = (t) => !S.CLOSED_STATUSES.includes(t.status);
    return {
      stats: S.stats(),
      approvals: S.approvalQueue(),
      emergencies: tickets.filter((t) => t.urgency === 'emergency' && open(t)),
      attention: tickets.filter((t) => t.flags.length && open(t)),
      tickets,
      ai: ai.aiStatus(),
    };
  }],
  ['GET', '/tickets/:id', ({ params }) => S.ticketDetail(params.id) || (() => { throw fail('Not found', 404); })()],

  // ---------- intake (simulated) ----------
  ['POST', '/simulate/generate', () => randomTenantText()],
  ['POST', '/simulate/incoming', async ({ body }) => {
    let { tenantId, body: text } = body;
    if (!text) ({ tenantId, body: text } = await randomTenantText());
    const tenant = tenantId ? S.db_tenant(tenantId) : null;
    const from = tenant?.phone || `+1310555${String(Math.floor(1000 + Math.random() * 8999))}`;
    const out = receiveInboundMessage({ channel: 'sim', from, body: text });
    return { ...out, body: text, tenant_name: tenant?.name || 'Unknown number' };
  }],
  ['GET', '/tenants', () => S.allTenantsWithUnits()],

  // ---------- tenant / PM messaging on a ticket ----------
  ['POST', '/tickets/:id/tenant-reply', ({ params, body }) => {
    const t = S.getTicket(params.id);
    return receiveInboundMessage({ channel: 'sim', from: t.from_phone, body: body.body, ticketId: t.id });
  }],
  ['POST', '/tickets/:id/pm-message', ({ params, body }) => A.pmMessage(params.id, body.body)],
  ['POST', '/tickets/:id/notes', ({ params, body }) => S.updateTicket(params.id, { internal_notes: String(body.notes ?? '') })],
  // Photos and videos a tenant sent by text or email, or uploaded to the tenant portal (url is a data: URL or a hosted file)
  ['POST', '/tickets/:id/media', ({ params, body }) => {
    if (!body.url) throw fail('Choose a photo or video first.');
    return { id: S.addMedia(params.id, { kind: body.kind, name: body.name, url: body.url, source: body.source || 'upload' }) };
  }],

  // ---------- approvals ----------
  ['POST', '/dispatches/:id/approve', ({ params, body }) => A.approveDispatch(params.id, body?.text)],
  ['POST', '/dispatches/:id/reject', ({ params, body }) => A.rejectDispatch(params.id, body?.note)],
  ['POST', '/tickets/:id/redraft', ({ params, body }) => { A.redraft(params.id, body?.note); }],

  // ---------- lifecycle ----------
  ['POST', '/tickets/:id/vendor-accepted', ({ params }) => A.vendorAccepted(params.id)],
  ['POST', '/tickets/:id/skip-timer', ({ params }) => { A.skipTimer(params.id); }],
  ['POST', '/tickets/:id/status', ({ params, body }) => A.advanceStatus(params.id, body.status)],
  ['POST', '/tickets/:id/flags/:type', ({ params, body }) => { A.resolveFlagAction(params.id, params.type, body?.action); }],
  ['POST', '/tickets/:id/ack-emergency', ({ params }) => A.ackEmergency(params.id)],

  // ---------- vendors ----------
  ['GET', '/vendors', () => db.prepare('SELECT * FROM vendors WHERE active = 1 ORDER BY trade, preferred DESC, name').all()],
  ['POST', '/vendors', ({ body }) => {
    checkVendor(body);
    const r = db.prepare('INSERT INTO vendors (name,trade,phone,personal_phone,email,rate,preferred,notes,primary_company,primary_personal,primary_email) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...vendorFields(body));
    return S.getVendor(r.lastInsertRowid);
  }],
  ['PUT', '/vendors/:id', ({ params, body }) => {
    checkVendor(body);
    db.prepare('UPDATE vendors SET name=?, trade=?, phone=?, personal_phone=?, email=?, rate=?, preferred=?, notes=?, primary_company=?, primary_personal=?, primary_email=? WHERE id=?').run(...vendorFields(body), params.id);
    return S.getVendor(params.id);
  }],
  ['DELETE', '/vendors/:id', ({ params }) => { db.prepare('UPDATE vendors SET active = 0 WHERE id = ?').run(params.id); }],

  // ---------- properties ----------
  ['GET', '/properties', () => db.prepare('SELECT p.*, (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) AS unit_count FROM properties p').all()],
  ['PUT', '/properties/:id', ({ params, body }) => {
    const limit = Math.max(0, Math.round(Number(body.approval_limit)));
    if (Number.isNaN(limit)) throw fail('Enter a dollar amount');
    db.prepare('UPDATE properties SET approval_limit = ? WHERE id = ?').run(limit, params.id);
  }],

  // ---------- company + preferences ----------
  ['PUT', '/company', ({ body }) => {
    if (!String(body.name || '').trim() || !String(body.pm_name || '').trim()) throw fail('Company name and your name are required');
    return S.updateCompany(body);
  }],
  ['GET', '/prefs', () => S.getPrefs()],
  ['PUT', '/prefs', ({ body }) => S.setPrefs(body)],
  // Shows what a vendor draft will look like with the preferences currently on screen (not yet saved)
  ['POST', '/prefs/preview', ({ body }) => {
    const prefs = { ...S.getPrefs(), draft: { ...S.getPrefs().draft, ...(body?.draft || {}) } };
    const vendor = { name: 'Rivera Plumbing' };
    return { text: buildText({ ...SAMPLE, company: S.getCompany(), prefs }, vendor) };
  }],

  ['POST', '/demo/reset', () => { seed(); }],
];

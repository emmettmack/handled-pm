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
import { currentAccount } from './accounts.js';
import { isDemo } from './mode.js';
import { companyNameProblem } from './labels.js';
import { normalizeLanguage } from './languages.js';
import { formatRate, validateCents } from './rates.js';
import { twilioConfigured, twilioNumber } from './sms.js';

export const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** Simulation and reset tools exist only in the demo; a real account must never be able to wipe or fake its own data. */
const demoOnly = (fn) => (arg) => {
  if (!isDemo()) throw fail('That is only available in the demo.', 403);
  return fn(arg);
};

const UNKNOWN_LOCKOUT = { urgency: 'urgent', brief: 'locked out of apartment', en: "I'm locked out of my apartment, lost my keys. Can someone come open the door today?" };

/** Picks a random tenant (rarely an unknown number) and a scenario weighted mostly routine, and writes the text. */
async function randomTenantText() {
  const tenants = db.prepare('SELECT * FROM tenants').all();
  const tenant = Math.random() < 0.06 ? null : tenants[Math.floor(Math.random() * tenants.length)];
  const language = tenant?.language || 'en';
  const scenario = tenant ? pickScenario(language === 'es') : UNKNOWN_LOCKOUT;
  return { tenantId: tenant?.id ?? null, body: await ai.generateTenantMessage({ scenario, tenant, language }) };
}

const cents = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const vendorFields = (b) => [
  b.name, b.trade, b.phone || '', b.personal_phone || '', b.email || '', formatRate({ ...b, rate: b.rate_notes || b.rate }), b.preferred ? 1 : 0, b.notes || '',
  b.primary_company ? 1 : 0, b.primary_personal ? 1 : 0, b.primary_email ? 1 : 0,
  cents(b.rate_hourly_cents), cents(b.rate_flat_cents), cents(b.rate_trip_cents), b.rate_notes || '', normalizeLanguage(b.language),
];

/** Every vendor needs at least one primary contact method, and each primary one needs a value to reach them at. */
function checkVendor(b) {
  if (!b.name || !b.trade) throw fail('Name and trade are required');
  for (const [k, label] of [['rate_hourly_cents', 'The hourly rate'], ['rate_flat_cents', 'The flat rate'], ['rate_trip_cents', 'The trip charge']]) {
    const problem = validateCents(b[k], label);
    if (problem) throw fail(problem);
  }
  const picks = [['primary_company', 'phone', 'company phone'], ['primary_personal', 'personal_phone', 'personal phone'], ['primary_email', 'email', 'email']].filter(([flag]) => b[flag]);
  if (!picks.length) throw fail('Pick at least one primary contact so Macalisto knows how to reach this vendor.');
  const missing = picks.find(([, field]) => !String(b[field] || '').trim());
  if (missing) throw fail(`You marked ${missing[2]} as primary but left it blank.`);
}

/** Create or edit a property and its units. `units` is a list or a comma-separated string; units are only ever added here. */
function saveProperty(id, b) {
  const name = String(b.name || '').trim();
  const address = String(b.address || '').trim();
  if (!name || !address) throw fail('A name and an address are required.');
  const limit = Math.max(0, Math.round(Number(b.approval_limit ?? 500)) || 0);
  const vals = [name, address, String(b.neighborhood || '').trim(), String(b.owner_name || '').trim(), String(b.owner_email || '').trim(), String(b.company || '').trim(), limit];
  if (id) {
    db.prepare('UPDATE properties SET name=?, address=?, neighborhood=?, owner_name=?, owner_email=?, company=?, approval_limit=? WHERE id=?').run(...vals, id);
  } else {
    id = db.prepare('INSERT INTO properties (name,address,neighborhood,owner_name,owner_email,company,approval_limit) VALUES (?,?,?,?,?,?,?)').run(...vals).lastInsertRowid;
  }
  const units = (Array.isArray(b.units) ? b.units : String(b.units ?? '').split(',')).map((u) => String(u).trim()).filter(Boolean);
  if (!units.length && !db.prepare('SELECT 1 FROM units WHERE property_id = ?').get(id)) units.push('Main');
  const have = new Set(db.prepare('SELECT number FROM units WHERE property_id = ?').all(id).map((u) => u.number.toLowerCase()));
  for (const u of units) if (!have.has(u.toLowerCase())) { db.prepare('INSERT INTO units (property_id, number) VALUES (?,?)').run(id, u); have.add(u.toLowerCase()); }
  return { id: Number(id) };
}

/** Create or edit a tenant. Their phone number is how Macalisto recognizes their texts, so it must be unique. */
function saveTenant(id, b) {
  const name = String(b.name || '').trim();
  const phone = S.normPhone(b.phone);
  if (!name) throw fail('Enter the tenant’s name.');
  if (String(phone).replace(/\D/g, '').length < 10) throw fail('Enter a full 10-digit phone number.');
  if (!b.unit_id || !db.prepare('SELECT 1 FROM units WHERE id = ?').get(b.unit_id)) throw fail('Choose which unit they live in.');
  const dupe = db.prepare('SELECT id FROM tenants WHERE phone = ? AND id != ?').get(phone, id || 0);
  if (dupe) throw fail('Another tenant already uses that phone number.');
  const vals = [name, phone, b.unit_id, normalizeLanguage(b.language)];
  if (id) db.prepare('UPDATE tenants SET name=?, phone=?, unit_id=?, language=? WHERE id=?').run(...vals, id);
  else id = db.prepare('INSERT INTO tenants (name,phone,unit_id,language) VALUES (?,?,?,?)').run(...vals).lastInsertRowid;
  return { id: Number(id) };
}

/** Permanently deletes resolved or closed work orders (and their messages, history, drafts and photos). Open ones are never touched. */
function deleteClosedTickets(onlyId = null) {
  const ids = db.prepare(`SELECT id FROM tickets WHERE status IN ('resolved','closed')${onlyId ? ' AND id = ?' : ''}`).all(...(onlyId ? [onlyId] : [])).map((r) => r.id);
  for (const id of ids) {
    for (const table of ['messages', 'status_history', 'dispatches', 'media']) db.prepare(`DELETE FROM ${table} WHERE ticket_id = ?`).run(id);
    db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
  }
  return ids.length;
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
  ['GET', '/status', () => ({ ...ai.aiStatus(), company: S.getCompany(), demo: isDemo(), homeMode: S.isHomeMode() })],
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
  // "closed" must come before ":id" so it isn't read as a ticket number
  ['DELETE', '/tickets/closed', () => ({ deleted: deleteClosedTickets() })],
  ['DELETE', '/tickets/:id', ({ params }) => {
    if (!deleteClosedTickets(params.id)) throw fail('Only resolved or closed work orders can be deleted.');
  }],
  ['GET', '/tickets/:id', ({ params }) => S.ticketDetail(params.id) || (() => { throw fail('Not found', 404); })()],

  // ---------- intake (simulated) ----------
  ['POST', '/simulate/generate', demoOnly(() => randomTenantText())],
  ['POST', '/simulate/incoming', demoOnly(async ({ body }) => {
    let { tenantId, body: text } = body;
    if (!text) ({ tenantId, body: text } = await randomTenantText());
    const tenant = tenantId ? S.db_tenant(tenantId) : null;
    const from = tenant?.phone || `+1310555${String(Math.floor(1000 + Math.random() * 8999))}`;
    const out = receiveInboundMessage({ channel: 'sim', from, body: text });
    return { ...out, body: text, tenant_name: tenant?.name || 'Unknown number' };
  })],
  ['GET', '/tenants', () => S.allTenantsWithUnits()],

  // ---------- tenant / PM messaging on a ticket ----------
  ['POST', '/tickets/:id/tenant-reply', demoOnly(({ params, body }) => {
    const t = S.getTicket(params.id);
    return receiveInboundMessage({ channel: 'sim', from: t.from_phone, body: body.body, ticketId: t.id });
  })],
  // PM inbox: every conversation, newest first; opening one marks it read; the assistant can be paused or handed back.
  ['GET', '/inbox', () => S.inboxList()],
  ['POST', '/tickets/:id/read', ({ params }) => { S.markRead(params.id); }],
  ['POST', '/tickets/:id/assistant', ({ params, body }) => { A.setAssistant(params.id, !!body?.on); }],
  ['POST', '/tickets/:id/pm-message', ({ params, body }) => A.pmMessage(params.id, body.body)],
  ['POST', '/tickets/:id/merge', ({ params, body }) => { A.mergeTickets(params.id, Number(body?.into)); return { into: Number(body.into) }; }],
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
  ['POST', '/tickets/:id/vendor-accepted', ({ params, body }) => {
    // a real account must give the time the vendor really confirmed; the demo may make one up
    if (!isDemo() && !String(body?.when || '').trim()) throw fail('Enter the time the vendor confirmed.');
    return A.vendorAccepted(params.id, body?.when);
  }],
  ['POST', '/tickets/:id/skip-timer', demoOnly(({ params }) => { A.skipTimer(params.id); })],
  ['POST', '/tickets/:id/status', ({ params, body }) => A.advanceStatus(params.id, body.status)],
  ['POST', '/tickets/:id/flags/:type', ({ params, body }) => { A.resolveFlagAction(params.id, params.type, body?.action); }],
  ['POST', '/tickets/:id/ack-emergency', ({ params }) => A.ackEmergency(params.id)],

  // ---------- vendors ----------
  ['GET', '/vendors', () => db.prepare('SELECT * FROM vendors WHERE active = 1 ORDER BY trade, preferred DESC, name').all()],
  ['POST', '/vendors', ({ body }) => {
    checkVendor(body);
    const r = db.prepare('INSERT INTO vendors (name,trade,phone,personal_phone,email,rate,preferred,notes,primary_company,primary_personal,primary_email,rate_hourly_cents,rate_flat_cents,rate_trip_cents,rate_notes,language) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...vendorFields(body));
    return S.getVendor(r.lastInsertRowid);
  }],
  ['PUT', '/vendors/:id', ({ params, body }) => {
    checkVendor(body);
    db.prepare('UPDATE vendors SET name=?, trade=?, phone=?, personal_phone=?, email=?, rate=?, preferred=?, notes=?, primary_company=?, primary_personal=?, primary_email=?, rate_hourly_cents=?, rate_flat_cents=?, rate_trip_cents=?, rate_notes=?, language=? WHERE id=?').run(...vendorFields(body), params.id);
    return S.getVendor(params.id);
  }],
  ['DELETE', '/vendors/:id', ({ params }) => { db.prepare('UPDATE vendors SET active = 0 WHERE id = ?').run(params.id); }],

  // ---------- properties ----------
  ['GET', '/properties', () => db.prepare('SELECT p.*, (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) AS unit_count FROM properties p').all()],
  ['PUT', '/properties/:id', ({ params, body }) => {
    if (body.name !== undefined) return saveProperty(params.id, body); // full edit
    const limit = Math.max(0, Math.round(Number(body.approval_limit))); // just the owner limit
    if (Number.isNaN(limit)) throw fail('Enter a dollar amount');
    db.prepare('UPDATE properties SET approval_limit = ? WHERE id = ?').run(limit, params.id);
  }],
  ['POST', '/properties', ({ body }) => saveProperty(null, body)],
  ['DELETE', '/properties/:id', ({ params }) => {
    const used = db.prepare('SELECT COUNT(*) c FROM tickets t JOIN units u ON u.id = t.unit_id WHERE u.property_id = ?').get(params.id).c;
    if (used) throw fail('This property has work orders on file, so it can’t be removed.');
    db.prepare('DELETE FROM tenants WHERE unit_id IN (SELECT id FROM units WHERE property_id = ?)').run(params.id);
    db.prepare('DELETE FROM units WHERE property_id = ?').run(params.id);
    db.prepare('DELETE FROM properties WHERE id = ?').run(params.id);
  }],
  ['GET', '/units', () => db.prepare('SELECT u.id, u.number, u.property_id, p.name AS property_name FROM units u JOIN properties p ON p.id = u.property_id ORDER BY p.name, u.number').all()],

  // ---------- tenants ----------
  ['POST', '/tenants', ({ body }) => saveTenant(null, body)],
  ['PUT', '/tenants/:id', ({ params, body }) => saveTenant(params.id, body)],
  ['DELETE', '/tenants/:id', ({ params }) => {
    db.prepare('UPDATE tickets SET tenant_id = NULL WHERE tenant_id = ?').run(params.id); // keep their work orders
    db.prepare('DELETE FROM tenants WHERE id = ?').run(params.id);
  }],

  // ---------- first-run setup ----------
  ['GET', '/setup', () => ({
    ...S.getSetup(),
    counts: {
      properties: db.prepare('SELECT COUNT(*) c FROM properties').get().c,
      tenants: db.prepare('SELECT COUNT(*) c FROM tenants').get().c,
      vendors: db.prepare('SELECT COUNT(*) c FROM vendors WHERE active = 1').get().c,
    },
  })],
  ['PUT', '/setup', ({ body }) => S.setSetup(body)],

  // ---------- company + preferences ----------
  ['PUT', '/company', ({ body }) => {
    if (!String(body.pm_name || '').trim()) throw fail('Please enter your name.');
    if (!S.isHomeMode()) { const problem = companyNameProblem(body.name, body.email); if (problem) throw fail(problem); } // home owners need no company name
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

  // Which account this is, and whether texting is connected (shown under Preferences so the number can be linked)
  ['GET', '/account', () => ({ id: currentAccount(), texting: { connected: twilioConfigured(), number: twilioNumber() } })],

  ['POST', '/demo/reset', demoOnly(() => { seed(); })],
];

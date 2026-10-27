// Data access + small helpers. Everything the rest of the server needs from SQLite lives here.
import { db } from './db.js';
import { unitName } from './labels.js';
import { ticketView } from './ticketView.js';

export const nowIso = () => new Date().toISOString();
export const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
export const minsFromNow = (m) => new Date(Date.now() + m * 60000).toISOString();

export const STATUS_LABELS = {
  new: 'New',
  triaged: 'Triaged',
  needs_info: 'Needs info',
  dispatch_drafted: 'Dispatch drafted',
  awaiting_approval: 'Awaiting approval',
  dispatched: 'Dispatched',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};
export const CLOSED_STATUSES = ['resolved', 'closed'];
export const TRADE_FOR_CATEGORY = {
  plumbing: 'plumber',
  electrical: 'electrician',
  HVAC: 'HVAC',
  appliance: 'appliance',
  lockout: 'locksmith',
  other: 'handyman',
};

export function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length >= 10 ? '+1' + d.slice(-10) : String(p || '').trim();
}
export function prettyPhone(p) {
  const d = String(p || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p || '';
}

const JSON_FIELDS = ['next_steps', 'flags'];

function parseTicket(row) {
  if (!row) return null;
  const t = { ...row };
  for (const f of JSON_FIELDS) {
    try { t[f] = JSON.parse(t[f] || '[]'); } catch { t[f] = []; }
  }
  return t;
}

export function getCompany() {
  return db.prepare('SELECT * FROM company LIMIT 1').get();
}
export function updateCompany(c) {
  const f = ['name', 'pm_name', 'phone', 'email', 'address', 'maintenance_line'];
  const prev = getCompany();
  const name = String(c.name ?? '').trim();
  // A name only counts as confirmed when the user typed something new, or it was already confirmed and is unchanged.
  const usable = !!name && name !== 'My rentals' && !name.includes('@');
  const confirmed = usable && ((prev?.name_confirmed && prev.name === name) || prev?.name !== name) ? 1 : 0;
  db.prepare(`UPDATE company SET ${f.map((k) => `${k} = ?`).join(', ')}, name_confirmed = ? WHERE id = 1`).run(...f.map((k) => String(c[k] ?? '').trim()), confirmed);
  return getCompany();
}

// ---------- preferences (what goes into drafts, how long to wait on vendors) ----------
export const DEFAULT_PREFS = {
  draft: {
    work_order: true, priority: true, cause: true, address: true,
    tenant_name: true, tenant_phone: true, language: true, access: true, photos: true,
    cost_cap: true, cost_cap_amount: '', signature: true,
    intro: '', footer: '',
  },
  vendor_followup_hours: 24,
  // What the assistant may tell tenants about when they'll hear back. The PM owns these words; the assistant never makes up its own.
  timing_routine: 'within one business day',
  timing_urgent: 'as soon as possible, usually the same day',
};
export function getPrefs() {
  let saved = {};
  try { saved = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'prefs'").get()?.value || '{}'); } catch { /* fall back to defaults */ }
  return { ...DEFAULT_PREFS, ...saved, draft: { ...DEFAULT_PREFS.draft, ...(saved.draft || {}) } };
}
export function setPrefs(p) {
  const hours = Math.min(168, Math.max(1, Math.round(Number(p.vendor_followup_hours) || DEFAULT_PREFS.vendor_followup_hours)));
  const draft = { ...DEFAULT_PREFS.draft };
  for (const k of Object.keys(draft)) if (p.draft && k in p.draft) draft[k] = typeof draft[k] === 'boolean' ? !!p.draft[k] : String(p.draft[k] ?? '');
  db.prepare("INSERT INTO settings (key, value) VALUES ('prefs', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({
    draft, vendor_followup_hours: hours,
    timing_routine: String(p.timing_routine ?? DEFAULT_PREFS.timing_routine).trim().slice(0, 80) || DEFAULT_PREFS.timing_routine,
    timing_urgent: String(p.timing_urgent ?? DEFAULT_PREFS.timing_urgent).trim().slice(0, 80) || DEFAULT_PREFS.timing_urgent,
  }));
  return getPrefs();
}

// ---------- first-run setup (mode, whether the tutorial is finished) ----------
// mode 'manager' = managing properties for other owners; 'home' = renting out your own home.
export function getSetup() {
  let saved = {};
  try { saved = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'setup'").get()?.value || '{}'); } catch { /* use defaults */ }
  return { mode: 'manager', done: false, ...saved };
}
export function setSetup(patch) {
  const next = { ...getSetup() };
  if (patch.mode === 'home' || patch.mode === 'manager') next.mode = patch.mode;
  if (typeof patch.done === 'boolean') next.done = patch.done;
  db.prepare("INSERT INTO settings (key, value) VALUES ('setup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next));
  return next;
}
export const isHomeMode = () => getSetup().mode === 'home';

// ---------- texting rules: opt-outs and delivery results ----------
export const isOptedOut = (phone) => !!db.prepare('SELECT 1 FROM opt_outs WHERE phone = ?').get(normPhone(phone));
export function setOptOut(phone, optedOut, source = 'text') {
  const p = normPhone(phone);
  if (optedOut) db.prepare('INSERT INTO opt_outs (phone, opted_out_at, source) VALUES (?,?,?) ON CONFLICT(phone) DO UPDATE SET opted_out_at = excluded.opted_out_at').run(p, nowIso(), source);
  else db.prepare('DELETE FROM opt_outs WHERE phone = ?').run(p);
}
export const setMessageSid = (messageId, sid) => db.prepare('UPDATE messages SET provider_sid = ? WHERE id = ?').run(sid, messageId);
/** Record the carrier's report on one outgoing text; returns the message so the caller can tell the PM if it failed. */
export function recordDelivery(sid, status, error = null) {
  const m = db.prepare('SELECT id, ticket_id FROM messages WHERE provider_sid = ?').get(sid);
  if (m) db.prepare('UPDATE messages SET delivery_status = ?, delivery_error = ? WHERE id = ?').run(status, error, m.id);
  return m || null;
}

// ---------- photos and videos from tenants ----------
// The server plugs in file storage (see files.js). Without it (the browser demo) photos stay inline as data URLs.
let mediaSaver = null;   // (dataUrl) => { file, mime } | null
let mediaLinker = null;  // (mediaRow) => a short-lived URL the browser can load
export const setMediaStorage = (saver, linker) => { mediaSaver = saver; mediaLinker = linker; };
export const addMedia = (ticketId, { kind = 'photo', name = '', url, source = 'upload', at }) => {
  const saved = mediaSaver && String(url).startsWith('data:') ? mediaSaver(url) : null;
  return db.prepare('INSERT INTO media (ticket_id, kind, name, url, file, mime, source, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(ticketId, kind === 'video' ? 'video' : 'photo', name, saved ? '' : url, saved?.file ?? null, saved?.mime ?? null, source, at || nowIso()).lastInsertRowid;
};
let mediaReader = null; // (mediaRow) => Buffer | null, plugged in by the server (files.js)
export const setMediaReader = (fn) => { mediaReader = fn; };
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_MODEL_IMAGES = 4;
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024; // the model accepts up to 5 MB per image once encoded
/** The newest photos on a work order as { media_type, data } for the model, plus a count of anything it can't view (videos, HEIC). */
export function mediaForModel(ticketId) {
  const rows = db.prepare('SELECT * FROM media WHERE ticket_id = ? ORDER BY id DESC').all(ticketId);
  const images = [];
  let unviewable = 0;
  for (const m of rows) {
    let type = m.mime, buf = null;
    if (m.kind === 'photo' && m.file && mediaReader) buf = mediaReader(m);
    else if (m.kind === 'photo' && String(m.url).startsWith('data:')) {
      const d = /^data:([\w/+.-]+);base64,(.*)$/s.exec(m.url);
      if (d) { type = d[1]; buf = Buffer.from(d[2], 'base64'); }
    }
    if (buf && IMAGE_TYPES.has(type) && buf.length <= MAX_IMAGE_BYTES && images.length < MAX_MODEL_IMAGES) images.unshift({ media_type: type, data: buf.toString('base64') });
    else unviewable++;
  }
  return { images, unviewable };
}
export const mediaFor = (ticketId) => db.prepare('SELECT * FROM media WHERE ticket_id = ? ORDER BY id').all(ticketId)
  .map((m) => (m.file && mediaLinker ? { ...m, url: mediaLinker(m) } : m));
export const mediaCount = (ticketId) => db.prepare('SELECT COUNT(*) c FROM media WHERE ticket_id = ?').get(ticketId).c;

/** The vendor's primary contact methods, e.g. [{ label: 'Company phone', value: '(323) 555-0201' }]. */
export function vendorChannels(v) {
  if (!v) return [];
  return [
    v.primary_company && v.phone && { label: 'Company phone', value: v.phone },
    v.primary_personal && v.personal_phone && { label: 'Personal phone', value: v.personal_phone },
    v.primary_email && v.email && { label: 'Email', value: v.email },
  ].filter(Boolean);
}
export function getTicket(id) {
  return parseTicket(db.prepare('SELECT * FROM tickets WHERE id = ?').get(id));
}

export function updateTicket(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const vals = keys.map((k) => {
    const v = fields[k];
    return JSON_FIELDS.includes(k) ? JSON.stringify(v ?? []) : v;
  });
  db.prepare(`UPDATE tickets SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
    ...vals, nowIso(), id,
  );
}

export function addMessage(ticketId, sender, body, { kind = 'sms', at } = {}) {
  const info = db
    .prepare('INSERT INTO messages (ticket_id, sender, body, kind, direction, created_at) VALUES (?,?,?,?,?,?)')
    .run(ticketId, sender, body, kind, kind === 'sms' ? (sender === 'tenant' ? 'in' : 'out') : null, at || nowIso());
  db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(nowIso(), ticketId);
  return info.lastInsertRowid;
}
/** Internal activity line shown muted in the thread (never sent to anyone). */
export const addNote = (ticketId, body) => addMessage(ticketId, 'system', body, { kind: 'note' });

export function setStatus(ticketId, status, note = null, at) {
  const t = getTicket(ticketId);
  if (t && t.status === status && !note) return;
  const patch = { status };
  if (status === 'resolved' && !t.resolved_at) patch.resolved_at = at || nowIso();
  updateTicket(ticketId, patch);
  db.prepare('INSERT INTO status_history (ticket_id, status, note, created_at) VALUES (?,?,?,?)').run(
    ticketId, status, note, at || nowIso(),
  );
}

export function addFlag(ticketId, type, reason) {
  const t = getTicket(ticketId);
  if (t.flags.some((f) => f.type === type && !f.resolved)) return false;
  t.flags.push({ type, reason, resolved: false, at: nowIso() });
  updateTicket(ticketId, { flags: t.flags });
  return true;
}
export function resolveFlag(ticketId, type, resolution = 'resolved') {
  const t = getTicket(ticketId);
  let changed = false;
  for (const f of t.flags) {
    if (f.type === type && !f.resolved) { f.resolved = true; f.resolution = resolution; changed = true; }
  }
  if (changed) updateTicket(ticketId, { flags: t.flags });
  return changed;
}
export const hasOpenFlag = (t, type) => t.flags.some((f) => f.type === type && !f.resolved);

// ---------- lookups ----------
export function findTenantByPhone(phone) {
  return db.prepare('SELECT * FROM tenants WHERE phone = ?').get(normPhone(phone));
}
export function getUnit(unitId) {
  if (!unitId) return null;
  return db
    .prepare(
      `SELECT u.id, u.number, p.id AS property_id, p.name AS property_name, p.address, p.neighborhood,
              p.approval_limit, p.owner_name, p.owner_email, p.company
       FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ?`,
    )
    .get(unitId);
}
export function getVendor(id) {
  return id ? db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) : null;
}
export function activeVendors() {
  return db.prepare('SELECT * FROM vendors WHERE active = 1').all();
}

// ---------- views ----------
function pendingDispatch(ticketId) {
  return db.prepare("SELECT * FROM dispatches WHERE ticket_id = ? AND state = 'pending' ORDER BY id DESC LIMIT 1").get(ticketId);
}

export function ticketDetail(id) {
  const t = getTicket(id);
  if (!t) return null;
  const tenant = t.tenant_id ? db.prepare('SELECT * FROM tenants WHERE id = ?').get(t.tenant_id) : null;
  const unit = getUnit(t.unit_id);
  const dispatches = db
    .prepare(
      `SELECT d.*, v.name AS vendor_name, v.trade AS vendor_trade, v.phone AS vendor_phone
       FROM dispatches d LEFT JOIN vendors v ON v.id = d.vendor_id WHERE d.ticket_id = ? ORDER BY d.id`,
    )
    .all(id);
  return {
    ...t,
    tenant,
    unit,
    view: ticketView({ ...t, dispatches }),
    vendor: getVendor(t.vendor_id),
    vendor_channels: vendorChannels(getVendor(t.vendor_id)),
    media: mediaFor(id),
    messages: db.prepare('SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at, id').all(id),
    history: db.prepare('SELECT * FROM status_history WHERE ticket_id = ? ORDER BY id').all(id),
    dispatches,
    pending_dispatch: dispatches.find((d) => d.state === 'pending') || null,
    active_dispatch: dispatches.filter((d) => d.kind === 'vendor' && d.state === 'approved').pop() || null,
  };
}

export const setAiPaused = (id, paused) => db.prepare('UPDATE tickets SET ai_paused = ? WHERE id = ?').run(paused ? 1 : 0, id);
export const markRead = (id) => db.prepare('UPDATE tickets SET pm_read_at = ? WHERE id = ?').run(nowIso(), id);

/** Conversations for the PM inbox: newest message first, with an unread flag and whether the assistant is paused. */
export function inboxList() {
  const rows = db.prepare(`
    SELECT t.id, t.title, t.status, t.urgency, t.ai_paused, t.pm_read_at, t.from_phone, t.channel,
           (SELECT name FROM tenants WHERE id = t.tenant_id) AS tenant_name,
           (SELECT body FROM messages m WHERE m.ticket_id = t.id AND m.kind = 'sms' ORDER BY m.id DESC LIMIT 1) AS last_body,
           (SELECT sender FROM messages m WHERE m.ticket_id = t.id AND m.kind = 'sms' ORDER BY m.id DESC LIMIT 1) AS last_sender,
           (SELECT created_at FROM messages m WHERE m.ticket_id = t.id AND m.kind = 'sms' ORDER BY m.id DESC LIMIT 1) AS last_at,
           (SELECT MAX(created_at) FROM messages m WHERE m.ticket_id = t.id AND m.sender = 'tenant') AS last_tenant_at
    FROM tickets t ORDER BY last_at DESC, t.id DESC`).all();
  return rows.map((r) => ({
    id: r.id, title: r.title, status: r.status, urgency: r.urgency, ai_paused: !!r.ai_paused,
    contact: r.tenant_name || r.from_phone || 'Unknown', from_phone: r.from_phone,
    last_body: r.last_body || '', last_sender: r.last_sender || '', last_at: r.last_at || null,
    unread: !!r.last_tenant_at && (!r.pm_read_at || r.last_tenant_at > r.pm_read_at),
    opted_out: !!r.from_phone && r.channel === 'sms' && isOptedOut(r.from_phone),
  })).filter((r) => r.last_at);
}

/**
 * One plain row per work order, for the "send it to your other system" export. scope 'closed' = finished jobs closed in the date range;
 * 'all' = every job opened in the range. Private PM notes are never included.
 */
export function exportWorkOrders({ scope = 'closed', from = '', to = '' } = {}) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00.000Z` : '';
  const end = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : '';
  const rows = db.prepare('SELECT * FROM tickets ORDER BY id').all().filter((t) => {
    const closed = CLOSED_STATUSES.includes(t.status);
    if (scope === 'closed' && !closed) return false;
    const when = scope === 'closed' ? (t.resolved_at || t.updated_at || t.created_at) : t.created_at;
    return (!start || when >= start) && (!end || when <= end);
  });
  const SOURCE = { ai_model: 'AI estimate, not a quote', sample_rules: 'Sample estimate', vendor_quote: 'Vendor quote', invoice: 'Invoice' };
  return rows.map((t) => {
    const unit = t.unit_id ? db.prepare('SELECT u.number, p.name AS property, p.address FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ?').get(t.unit_id) : null;
    const tenant = t.tenant_id ? db.prepare('SELECT name, phone FROM tenants WHERE id = ?').get(t.tenant_id) : null;
    const vendor = t.vendor_id ? db.prepare('SELECT name, phone FROM vendors WHERE id = ?').get(t.vendor_id) : null;
    return {
      work_order: t.id, status: t.status, opened: t.created_at, closed: CLOSED_STATUSES.includes(t.status) ? (t.resolved_at || t.updated_at) : '',
      property: unit?.property || '', address: unit?.address || '', unit: unit?.number || '',
      tenant: tenant?.name || '', tenant_phone: tenant?.phone || t.from_phone || '',
      issue: t.title || '', category: t.category || '', urgency: t.urgency || '', summary: t.summary || '',
      vendor: vendor?.name || '', vendor_phone: vendor?.phone || '', scheduled_for: t.scheduled_for || '',
      estimate_usd: t.cost_estimate ?? '', estimate_source: t.cost_estimate != null ? (SOURCE[t.cost_estimate_source || 'ai_model'] || '') : '',
      photos: mediaCount(t.id),
    };
  });
}

export function listBrief() {
  const rows = db.prepare('SELECT id FROM tickets ORDER BY id DESC').all();
  return rows.map(({ id }) => {
    const t = getTicket(id);
    const tenant = t.tenant_id ? db.prepare('SELECT name FROM tenants WHERE id = ?').get(t.tenant_id) : null;
    const unit = getUnit(t.unit_id);
    const pd = pendingDispatch(id);
    const last = db.prepare('SELECT body, sender FROM messages WHERE ticket_id = ? AND kind = ? ORDER BY id DESC LIMIT 1').get(id, 'sms');
    return {
      id: t.id, title: t.title, category: t.category, urgency: t.urgency, status: t.status,
      created_at: t.created_at, updated_at: t.updated_at, language: t.language,
      tenant_name: tenant?.name || null, from_phone: t.from_phone,
      unit_label: unit ? `${unitName(unit.number)} · ${unit.property_name}` : null,
      media_count: mediaCount(id),
      flags: t.flags.filter((f) => !f.resolved),
      emergency_ack: t.emergency_ack, cost_estimate: t.cost_estimate,
      last_message: last?.body || '', last_sender: last?.sender || '',
    };
  });
}

export function approvalQueue() {
  const rows = db.prepare("SELECT d.id FROM dispatches d JOIN tickets t ON t.id = d.ticket_id WHERE d.state = 'pending' ORDER BY d.id").all();
  return rows
    .map(({ id }) => {
      const d = db.prepare('SELECT d.*, v.name AS vendor_name, v.trade AS vendor_trade, v.phone AS vendor_phone, v.rate AS vendor_rate FROM dispatches d LEFT JOIN vendors v ON v.id = d.vendor_id WHERE d.id = ?').get(id);
      const t = ticketDetail(d.ticket_id);
      return { ...d, vendor_channels: vendorChannels(getVendor(d.vendor_id)), ticket: { ...t, messages: undefined, history: undefined } };
    })
    .sort((a, b) => {
      const rank = { emergency: 0, urgent: 1, routine: 2 };
      return rank[a.ticket.urgency] - rank[b.ticket.urgency] || a.id - b.id;
    });
}

export function stats() {
  const open = db.prepare("SELECT COUNT(*) c FROM tickets WHERE status NOT IN ('resolved','closed')").get().c;
  const awaiting = db.prepare("SELECT COUNT(DISTINCT ticket_id) c FROM dispatches WHERE state = 'pending'").get().c;
  const emergencies = db.prepare("SELECT COUNT(*) c FROM tickets WHERE urgency = 'emergency' AND status NOT IN ('resolved','closed')").get().c;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const resolved = db.prepare("SELECT COUNT(*) c FROM tickets WHERE resolved_at IS NOT NULL AND resolved_at >= ?").get(weekAgo).c;
  return { open, awaiting, emergencies, resolved_this_week: resolved };
}

export function db_tenant(id) {
  return db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
}
export function allTenantsWithUnits() {
  return db
    .prepare(
      `SELECT t.*, u.number AS unit_number, u.property_id, p.name AS property_name
       FROM tenants t JOIN units u ON u.id = t.unit_id JOIN properties p ON p.id = u.property_id`,
    )
    .all();
}
export function db_insertDispatch({ ticket_id, vendor_id, kind, text, reasoning, state = 'pending', at, response_due_at = null }) {
  return db
    .prepare('INSERT INTO dispatches (ticket_id, vendor_id, kind, text, reasoning, state, created_at, response_due_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(ticket_id, vendor_id, kind, text, reasoning, state, at || nowIso(), response_due_at).lastInsertRowid;
}

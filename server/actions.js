// Things the property manager (or the demo timers) can do to a ticket after the AI has done its part.
import { db } from './db.js';
import * as S from './store.js';
import { enqueue, draftAndQueue } from './triage.js';
import { sendToTenant } from './outbound.js';
import { T } from './templates.js';

const fail = (msg) => Object.assign(new Error(msg), { status: 400 });

function getDispatch(id) {
  const d = db.prepare('SELECT d.*, v.name AS vendor_name FROM dispatches d LEFT JOIN vendors v ON v.id = d.vendor_id WHERE d.id = ?').get(id);
  if (!d) throw Object.assign(new Error('Dispatch not found'), { status: 404 });
  return d;
}

export function approveDispatch(id, editedText) {
  const d = getDispatch(id);
  if (d.state !== 'pending') throw fail('This draft was already handled.');
  const text = (editedText ?? '').trim() || d.text;
  const edited = text !== d.text ? 1 : 0;
  const now = S.nowIso();
  const hours = S.getPrefs().vendor_followup_hours;
  const via = S.vendorChannels(S.getVendor(d.vendor_id)).map((c) => c.label.toLowerCase()).join(' and ');
  db.prepare("UPDATE dispatches SET state='approved', text=?, edited=?, decided_at=?, response_due_at=? WHERE id=?").run(text, edited, now, S.minsFromNow(hours * 60), id);
  S.updateTicket(d.ticket_id, { vendor_id: d.vendor_id });
  S.resolveFlag(d.ticket_id, 'no_response', 'redispatched');
  S.resolveFlag(d.ticket_id, 'over_limit', 'approved');
  S.setStatus(d.ticket_id, 'dispatched', `Sent to ${d.vendor_name}${edited ? ' (edited by you)' : ''}`);
  S.addNote(d.ticket_id, `Dispatch ${edited ? '(your edited version) ' : ''}approved and sent to ${d.vendor_name}${via ? ` by ${via}` : ''}. (Demo: nothing was actually sent.) If they haven't replied in ${hours} hours, this work order comes back to the top of your list.`);
}

export function rejectDispatch(id, note) {
  const d = getDispatch(id);
  if (d.state !== 'pending') throw fail('This draft was already handled.');
  db.prepare("UPDATE dispatches SET state='rejected', pm_note=?, decided_at=? WHERE id=?").run(note || null, S.nowIso(), id);
  S.setStatus(d.ticket_id, 'triaged', `Draft rejected${note ? ': ' + note : ''}`);
  S.addNote(d.ticket_id, `You rejected the draft${note ? ` ("${note}")` : ''}. Nothing was sent.`);
}

export function redraft(ticketId, note) {
  const t = S.getTicket(ticketId);
  if (!t) throw fail('Ticket not found');
  const last = db.prepare("SELECT * FROM dispatches WHERE ticket_id = ? AND state IN ('rejected', 'no_response') ORDER BY id DESC LIMIT 1").get(ticketId);
  const exclude = last ? [last.vendor_id] : [];
  S.resolveFlag(ticketId, 'no_response', 'redrafted');
  return enqueue(ticketId, () => draftAndQueue(ticketId, { excludeVendorIds: exclude, note: note || last?.pm_note || '' }));
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function vendorAccepted(ticketId) {
  const t = S.getTicket(ticketId);
  const d = db.prepare("SELECT d.*, v.name AS vendor_name FROM dispatches d JOIN vendors v ON v.id = d.vendor_id WHERE d.ticket_id=? AND d.kind='vendor' AND d.state='approved' ORDER BY d.id DESC LIMIT 1").get(ticketId);
  if (!d || t.status !== 'dispatched') throw fail('No dispatch is waiting on a vendor.');
  db.prepare("UPDATE dispatches SET state='accepted' WHERE id=?").run(d.id);
  const tomorrow = new Date(Date.now() + 86400000);
  const when = t.urgency === 'emergency' ? 'today, arriving within the hour' : t.urgency === 'urgent' ? `tomorrow (${DAYS[tomorrow.getDay()]}) between 9 and 11 AM` : `${DAYS[new Date(Date.now() + 2 * 86400000).getDay()]} between 1 and 3 PM`;
  S.updateTicket(ticketId, { scheduled_for: when });
  S.setStatus(ticketId, 'scheduled', `${d.vendor_name} confirmed for ${when}`);
  S.addNote(ticketId, `${d.vendor_name} replied YES (simulated): ${when}.`);
  sendToTenant(t, T.scheduled(t.language, d.vendor_name, when));
}

export function advanceStatus(ticketId, status) {
  const t = S.getTicket(ticketId);
  if (!['in_progress', 'resolved', 'closed'].includes(status)) throw fail('Unsupported status');
  S.setStatus(ticketId, status);
  if (status === 'resolved') sendToTenant(t, T.resolved(t.language));
}

/** Vendor didn't answer in the PM's chosen window: flag the work order so it comes back to the top. Nothing is sent. */
export function markNoResponse(ticketId) {
  const t = S.getTicket(ticketId);
  const d = db.prepare("SELECT d.*, v.name AS vendor_name FROM dispatches d JOIN vendors v ON v.id = d.vendor_id WHERE d.ticket_id=? AND d.kind='vendor' AND d.state='approved' ORDER BY d.id DESC LIMIT 1").get(ticketId);
  if (!d || t.status !== 'dispatched') return;
  const hours = S.getPrefs().vendor_followup_hours;
  db.prepare("UPDATE dispatches SET state='no_response' WHERE id=?").run(d.id);
  S.addFlag(ticketId, 'no_response', `${d.vendor_name} hasn't replied in ${hours} ${hours === 1 ? 'hour' : 'hours'}. Give them a call, or draft a dispatch to a different vendor.`);
  S.addNote(ticketId, `No reply from ${d.vendor_name} after ${hours} ${hours === 1 ? 'hour' : 'hours'}. Brought back to the top of your list. Nothing was sent.`);
}

export function skipTimer(ticketId) {
  db.prepare("UPDATE dispatches SET response_due_at=? WHERE ticket_id=? AND kind='vendor' AND state='approved'").run(S.minsAgo(1), ticketId);
  markNoResponse(ticketId);
}

export function startScheduler() {
  setInterval(() => {
    const due = db.prepare("SELECT DISTINCT ticket_id FROM dispatches WHERE kind='vendor' AND state='approved' AND response_due_at IS NOT NULL AND response_due_at <= ?").all(S.nowIso());
    for (const { ticket_id } of due) markNoResponse(ticket_id);
  }, 5000);
}

export function resolveFlagAction(ticketId, type, action) {
  const t = S.getTicket(ticketId);
  if (type === 'identity') {
    if (action === 'cleared') {
      S.updateTicket(ticketId, { identity_cleared: 1 });
      S.resolveFlag(ticketId, 'identity', 'cleared');
      S.addNote(ticketId, 'You confirmed the tenant\'s identity. The assistant is drafting the dispatch.');
      return enqueue(ticketId, () => draftAndQueue(ticketId));
    }
    S.resolveFlag(ticketId, 'identity', 'not_verified');
    sendToTenant(t, T.closedNoVerify(t.language), 'pm');
    S.setStatus(ticketId, 'closed', 'Identity could not be verified');
    S.addNote(ticketId, 'You could not verify the texter. Ticket closed; no one was dispatched.');
    return;
  }
  S.resolveFlag(ticketId, type, 'dismissed');
}

export function ackEmergency(ticketId) {
  S.updateTicket(ticketId, { emergency_ack: 1 });
  S.addNote(ticketId, 'You acknowledged the emergency. (Demo: in the live product the on-call phone page stops here.)');
}

export function pmMessage(ticketId, body) {
  const t = S.getTicket(ticketId);
  if (!body?.trim()) throw fail('Message is empty');
  sendToTenant(t, body.trim(), 'pm');
}

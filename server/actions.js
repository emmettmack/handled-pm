// Things the property manager (or the demo timers) can do to a ticket after the AI has done its part.
import { db, accountIds } from './db.js';
import { runAs } from './accounts.js';
import * as S from './store.js';
import { enqueue, draftAndQueue } from './triage.js';
import { sendToTenant } from './outbound.js';
import { T } from './templates.js';
import { sendSms, twilioConfigured } from './sms.js';
import { isDemo } from './mode.js';

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
  const channels = S.vendorChannels(S.getVendor(d.vendor_id));
  const via = channels.map((c) => c.label.toLowerCase()).join(' and ');
  const live = twilioConfigured();
  const demo = isDemo();
  db.prepare("UPDATE dispatches SET state='approved', text=?, edited=?, decided_at=?, response_due_at=? WHERE id=?").run(text, edited, now, S.minsFromNow(hours * 60), id);
  S.updateTicket(d.ticket_id, { vendor_id: d.vendor_id });
  S.resolveFlag(d.ticket_id, 'no_response', 'redispatched');
  S.resolveFlag(d.ticket_id, 'over_limit', 'approved');
  S.setStatus(d.ticket_id, 'dispatched', `Sent to ${d.vendor_name}${edited ? ' (edited by you)' : ''}`);
  if (live) textVendor(d.ticket_id, d.vendor_name, channels, text);
  S.addNote(d.ticket_id, `Dispatch ${edited ? '(your edited version) ' : ''}approved${live ? '' : demo ? ' (Demo: nothing was actually sent.)' : ' (Texting is not connected yet, so nothing was sent. Please contact the vendor yourself.)'}${live ? ` and being texted to ${d.vendor_name}${via ? ` (${via})` : ''}` : ` for ${d.vendor_name}`}. If they haven't replied in ${hours} hours, this work order comes back to the top of your list.`);
}

/** Texts the vendor's primary phone numbers and records what happened on the job. Email isn't connected yet. */
async function textVendor(ticketId, vendorName, channels, text) {
  const phones = channels.filter((c) => c.label !== 'Email');
  const results = await Promise.all(phones.map(async (c) => ({ c, r: await sendSms(S.normPhone(c.value), text) })));
  const sent = results.filter((x) => x.r.ok).map((x) => x.c.label.toLowerCase());
  const failed = results.filter((x) => !x.r.ok);
  if (sent.length) S.addNote(ticketId, `Texted ${vendorName} (${sent.join(' and ')}).`);
  for (const f of failed) S.addNote(ticketId, `The text to ${vendorName}'s ${f.c.label.toLowerCase()} did not go through: ${f.r.error}`);
  if (!phones.length) S.addNote(ticketId, `${vendorName} is set up for email only, and email sending isn't connected yet. Nothing was sent. Please contact them yourself.`);
  else if (channels.some((c) => c.label === 'Email')) S.addNote(ticketId, 'Email sending is not connected yet, so only the phone contact was used.');
}

/** Fold a duplicate work order into another: conversation, photos, history and drafts all move; the duplicate disappears. */
export function mergeTickets(sourceId, targetId) {
  if (sourceId === targetId) throw fail('Choose a different work order.');
  const source = S.getTicket(sourceId), target = S.getTicket(targetId);
  if (!source || !target) throw fail('Work order not found.');
  if (db.prepare("SELECT 1 FROM dispatches WHERE ticket_id = ? AND kind = 'vendor' AND state IN ('approved','accepted','no_response')").get(sourceId)) {
    throw fail('A dispatch was already sent for that work order. Merge the other one into it instead.');
  }
  const moved = db.prepare('SELECT COUNT(*) c FROM messages WHERE ticket_id = ?').get(sourceId).c;
  db.prepare("UPDATE dispatches SET state = 'rejected', pm_note = ? WHERE ticket_id = ? AND state = 'pending'").run(`Merged into #${targetId}`, sourceId);
  for (const table of ['messages', 'media', 'dispatches', 'status_history', 'inbound_messages']) db.prepare(`UPDATE ${table} SET ticket_id = ? WHERE ticket_id = ?`).run(targetId, sourceId);
  db.prepare('UPDATE tickets SET related_to = ? WHERE related_to = ?').run(targetId, sourceId);
  db.prepare('DELETE FROM tickets WHERE id = ?').run(sourceId);
  db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(S.nowIso(), targetId);
  S.addNote(targetId, `Merged work order #${sourceId} into this one (${moved} messages moved).`);
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
export function vendorAccepted(ticketId, confirmedTime) {
  const t = S.getTicket(ticketId);
  const d = db.prepare("SELECT d.*, v.name AS vendor_name FROM dispatches d JOIN vendors v ON v.id = d.vendor_id WHERE d.ticket_id=? AND d.kind='vendor' AND d.state IN ('approved','no_response') ORDER BY d.id DESC LIMIT 1").get(ticketId);
  if (!d || t.status !== 'dispatched') throw fail('No dispatch is waiting on a vendor.');
  db.prepare("UPDATE dispatches SET state='accepted' WHERE id=?").run(d.id);
  S.resolveFlag(ticketId, 'no_response', 'vendor confirmed');
  S.resolveFlag(ticketId, 'vendor_reply', 'vendor confirmed');
  const tomorrow = new Date(Date.now() + 86400000);
  const given = String(confirmedTime || '').trim().slice(0, 120); // the time the vendor really confirmed; blank = demo's made-up time
  const when = given || (t.urgency === 'emergency' ? 'today, arriving within the hour' : t.urgency === 'urgent' ? `tomorrow (${DAYS[tomorrow.getDay()]}) between 9 and 11 AM` : `${DAYS[new Date(Date.now() + 2 * 86400000).getDay()]} between 1 and 3 PM`);
  S.updateTicket(ticketId, { scheduled_for: when });
  S.setStatus(ticketId, 'scheduled', `${d.vendor_name} confirmed for ${when}`);
  S.addNote(ticketId, given ? `${d.vendor_name} confirmed: ${when}.` : `${d.vendor_name} replied YES (simulated): ${when}.`);
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
    for (const id of accountIds()) {
      runAs(id, () => {
        const due = db.prepare("SELECT DISTINCT ticket_id FROM dispatches WHERE kind='vendor' AND state='approved' AND response_due_at IS NOT NULL AND response_due_at <= ?").all(S.nowIso());
        for (const { ticket_id } of due) markNoResponse(ticket_id);
      });
    }
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
  if (!t.ai_paused) {
    S.setAiPaused(ticketId, true);
    S.addNote(ticketId, 'You replied, so the assistant has paused on this conversation. Turn it back on from the inbox whenever you want it to take over again.');
  }
  sendToTenant(t, body.trim(), 'pm');
}

export function setAssistant(ticketId, on) {
  const t = S.getTicket(ticketId);
  if (!!t.ai_paused === !on) return;
  S.setAiPaused(ticketId, !on);
  S.addNote(ticketId, on ? 'You handed this conversation back to the assistant.' : 'You paused the assistant on this conversation.');
}

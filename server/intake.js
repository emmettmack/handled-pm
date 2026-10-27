// THE intake layer. Every inbound tenant text, from any channel, enters through receiveInboundMessage().
//
//   demo:   POST /api/simulate/incoming  ->  receiveInboundMessage({ channel: 'sim', from, body })
//   real:   POST /api/webhooks/sms (Twilio) -> receiveInboundMessage({ channel: 'sms', from: From, body: Body, providerSid })
//
// Nothing below this line knows or cares where the text came from.
import { db } from './db.js';
import * as S from './store.js';
import { enqueue, processTicket, replyToUpdate } from './triage.js';
import { findMatch } from './dedupe.js';
import { sendToTenant } from './outbound.js';
import { T, COMPENSATION_ASK, sanitizeTenantReply, violatesLiability } from './templates.js';

/** This phone number's recent work orders (open, or closed in the last week) with their conversations, for the matcher. */
function candidatesFor(phone) {
  const rows = db.prepare("SELECT id, status, category, resolved_at, updated_at FROM tickets WHERE from_phone = ? AND (status NOT IN ('resolved','closed') OR COALESCE(resolved_at, updated_at) >= ?) ORDER BY id DESC LIMIT 20").all(phone, S.minsAgo(7 * 24 * 60));
  return rows.map((t) => ({ ...t, messages: db.prepare("SELECT sender, body, created_at FROM messages WHERE ticket_id = ? AND kind = 'sms' ORDER BY id").all(t.id) }));
}

/**
 * `providerSid` is the carrier's id for this exact message. A message we've already seen is acknowledged and ignored,
 * which makes webhook retries and double deliveries harmless.
 */
export function receiveInboundMessage({ channel = 'sms', from, body, ticketId = null, providerSid = null, media = [] }) {
  const text = String(body || '').trim();
  if (!text) throw Object.assign(new Error('Message is empty'), { status: 400 });
  const phone = S.normPhone(from);

  if (providerSid) {
    const first = db.prepare('INSERT OR IGNORE INTO inbound_messages (provider_sid, ticket_id, received_at) VALUES (?,?,?)').run(providerSid, null, S.nowIso()).changes;
    if (!first) return { ticketId: db.prepare('SELECT ticket_id FROM inbound_messages WHERE provider_sid = ?').get(providerSid)?.ticket_id ?? null, isNew: false, duplicate: true };
  }
  const attach = (tid) => { for (const m of media) S.addMedia(tid, m); };
  const done = (result) => {
    if (providerSid && result.ticketId) db.prepare('UPDATE inbound_messages SET ticket_id = ? WHERE provider_sid = ?').run(result.ticketId, providerSid);
    return result;
  };

  const addTo = (ticket) => {
    S.addMessage(ticket.id, 'tenant', text);
    attach(ticket.id);
    if (ticket.ai_paused) return done({ ticketId: ticket.id, isNew: false, paused: true }); // the PM has taken over: no automatic reply
    enqueue(ticket.id, () => (ticket.status === 'needs_info' ? processTicket(ticket.id) : handleUpdate(ticket.id, text)));
    return done({ ticketId: ticket.id, isNew: false });
  };

  // The PM's own "reply as the tenant" box names the work order outright.
  if (ticketId) return addTo(S.getTicket(ticketId));

  const match = findMatch({ text, candidates: candidatesFor(phone) });

  if (match.action === 'drop') return done({ ticketId: match.ticketId, isNew: false, duplicate: true });

  if (match.action === 'append') { // "thanks": part of the conversation, nothing to triage
    S.addMessage(match.ticketId, 'tenant', text);
    attach(match.ticketId);
    return done({ ticketId: match.ticketId, isNew: false });
  }

  if (match.action === 'merge') {
    const t = S.getTicket(match.ticketId);
    const count = db.prepare("SELECT COUNT(*) c FROM messages WHERE ticket_id = ? AND sender = 'tenant'").get(t.id).c;
    if (count >= 1 && t.status !== 'needs_info') S.addNote(t.id, 'The tenant wrote again about this. Their messages are combined here, not in a new work order.');
    return addTo(t);
  }

  if (match.action === 'reopen') {
    const t = S.getTicket(match.ticketId);
    S.addMessage(t.id, 'tenant', text);
    attach(t.id);
    db.prepare('UPDATE tickets SET resolved_at = NULL WHERE id = ?').run(t.id);
    S.setStatus(t.id, 'triaged', 'Reopened: the tenant wrote again after it was marked done');
    S.addFlag(t.id, 'callback', 'The tenant wrote again after this was marked done. Check whether the repair held.');
    S.addNote(t.id, 'Reopened because the tenant wrote again within two days of it being closed.');
    if (!t.ai_paused) enqueue(t.id, () => handleUpdate(t.id, text));
    return done({ ticketId: t.id, isNew: false, reopened: true });
  }

  const tenant = S.findTenantByPhone(phone);
  const info = db
    .prepare('INSERT INTO tickets (tenant_id, unit_id, from_phone, channel, verified, language, related_to, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(tenant?.id ?? null, tenant?.unit_id ?? null, phone, channel, tenant ? 1 : 0, tenant?.language || 'en', match.relatedTo ?? null, S.nowIso(), S.nowIso());
  const id = Number(info.lastInsertRowid);
  S.setStatus(id, 'new', 'Text received');
  S.addMessage(id, 'tenant', text);
  attach(id);
  if (match.relatedTo) S.addNote(id, `Related to earlier work order #${match.relatedTo} from the same number.`);
  if (match.possibleDuplicateOf) S.addFlag(id, 'possible_duplicate', `This may be the same problem as work order #${match.possibleDuplicateOf}, which is still open. If so, merge them.`);
  enqueue(id, () => processTicket(id));
  return done({ ticketId: id, isNew: true });
}

/**
 * Tenant wrote in after the first pass (a new detail, a photo, a question, "it's getting worse"). The model reads the whole
 * conversation, any photos and where the job stands, and answers the way a person at the office would. Compensation questions
 * stay fixed, and the money/fault filter still runs on whatever it writes. Without a live model this falls back to a short
 * acknowledgement and a flag for the PM.
 */
async function handleUpdate(id, text) {
  const t = S.getTicket(id);
  if (S.CLOSED_STATUSES.includes(t.status)) return;
  if (COMPENSATION_ASK.test(text)) {
    if (S.addFlag(id, 'compensation', 'Tenant asked about compensation, a credit, or who is responsible. The assistant replied neutrally and did not commit to anything.')) {
      S.addNote(id, 'Tenant raised compensation or responsibility. Flagged for you.');
    }
    sendToTenant(t, T.compensation(t.language));
    return;
  }
  const r = await replyToUpdate(id);
  if (!r) {
    S.addFlag(id, 'update', 'The tenant sent a new message after this was triaged. Take a look in case it changes anything.');
    sendToTenant(t, T.updateAck(t.language));
    return;
  }
  if (r.emergency) return processTicket(id); // a new danger goes through the emergency path, with its fixed safety text
  if (r.needs_pm) S.addFlag(id, 'update', r.note_for_pm || 'The tenant sent a new message that may need your attention.');
  const lang = r.language;
  const safe = lang === 'en' || lang === 'es' ? sanitizeTenantReply(r.reply, lang) : (r.reply_english && !violatesLiability(r.reply_english) ? r.reply : T.liabilitySafe(lang));
  sendToTenant(t, safe);
}

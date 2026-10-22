// THE intake layer. Every inbound tenant text, from any channel, enters through receiveInboundMessage().
//
//   demo:   POST /api/simulate/incoming  ->  receiveInboundMessage({ channel: 'sim', from, body })
//   later:  POST /api/webhooks/sms (Twilio) -> receiveInboundMessage({ channel: 'sms', from: From, body: Body })
//
// Nothing below this line knows or cares where the text came from.
import { db } from './db.js';
import * as S from './store.js';
import { enqueue, processTicket } from './triage.js';
import { sendToTenant } from './outbound.js';
import { T, COMPENSATION_ASK } from './templates.js';

export function receiveInboundMessage({ channel = 'sms', from, body, ticketId = null }) {
  const text = String(body || '').trim();
  if (!text) throw Object.assign(new Error('Message is empty'), { status: 400 });
  const phone = S.normPhone(from);

  let ticket = ticketId ? S.getTicket(ticketId) : null;
  if (!ticket) {
    // A text from someone with a ticket waiting on their answer is a reply, not a new problem.
    const waiting = db.prepare("SELECT id FROM tickets WHERE from_phone = ? AND status = 'needs_info' ORDER BY id DESC LIMIT 1").get(phone);
    if (waiting) ticket = S.getTicket(waiting.id);
  }

  if (ticket) {
    S.addMessage(ticket.id, 'tenant', text);
    if (ticket.status === 'needs_info') {
      enqueue(ticket.id, () => processTicket(ticket.id));
    } else {
      enqueue(ticket.id, () => handleUpdate(ticket.id, text));
    }
    return { ticketId: ticket.id, isNew: false };
  }

  const tenant = S.findTenantByPhone(phone);
  const info = db
    .prepare('INSERT INTO tickets (tenant_id, unit_id, from_phone, channel, verified, language, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(tenant?.id ?? null, tenant?.unit_id ?? null, phone, channel, tenant ? 1 : 0, tenant?.language || 'en', S.nowIso(), S.nowIso());
  const id = Number(info.lastInsertRowid);
  S.setStatus(id, 'new', 'Text received');
  S.addMessage(id, 'tenant', text);
  enqueue(id, () => processTicket(id));
  return { ticketId: id, isNew: true };
}

/** Tenant wrote in after triage (e.g. "it's getting worse"). The assistant acknowledges; a human is flagged. */
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
  S.addFlag(id, 'update', 'The tenant sent a new message after this was triaged. Take a look in case it changes anything.');
  sendToTenant(t, T.updateAck(t.language));
}

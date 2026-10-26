// Outbound messages. Every message is written to the ticket's log. When the ticket came in by real text and Twilio
// is configured, it is also sent. Someone who texted STOP is never texted; a failed send becomes a note on the work order.
import { addMessage, addNote, isOptedOut, setMessageSid, getTicket } from './store.js';
import { db } from './db.js';
import { sendSms, twilioConfigured } from './sms.js';

export function sendToTenant(ticket, body, sender = 'ai') {
  // When the PM has taken over a thread the assistant stays quiet, even for a reply that was already being written.
  if (sender === 'ai' && db.prepare('SELECT ai_paused FROM tickets WHERE id = ?').get(ticket.id)?.ai_paused) return null;
  const id = addMessage(ticket.id, sender, body);
  if (ticket.channel === 'sms' && ticket.from_phone && twilioConfigured()) {
    if (isOptedOut(ticket.from_phone)) {
      addNote(ticket.id, 'Not sent: this person replied STOP and has opted out of texts. Reach them another way, or they can text START.');
      return id;
    }
    sendSms(ticket.from_phone, body).then((r) => {
      if (r.ok) setMessageSid(id, r.sid);
      else {
        db.prepare("UPDATE messages SET delivery_status = 'failed', delivery_error = ? WHERE id = ?").run(r.code || r.error, id);
        addNote(ticket.id, `This text did not reach the tenant: ${r.error}`);
      }
    });
  }
  return id;
}

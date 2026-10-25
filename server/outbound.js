// Outbound messages. Every message is written to the ticket's log. When the ticket came in by real text and Twilio
// is configured, it is also sent. Someone who texted STOP is never texted; a failed send becomes a note on the work order.
import { addMessage, addNote, isOptedOut, setMessageSid } from './store.js';
import { sendSms, twilioConfigured } from './sms.js';

export function sendToTenant(ticket, body, sender = 'ai') {
  const id = addMessage(ticket.id, sender, body);
  if (ticket.channel === 'sms' && ticket.from_phone && twilioConfigured()) {
    if (isOptedOut(ticket.from_phone)) {
      addNote(ticket.id, 'Not sent: this person replied STOP and has opted out of texts. Reach them another way, or they can text START.');
      return id;
    }
    sendSms(ticket.from_phone, body).then((r) => {
      if (r.ok) setMessageSid(id, r.sid);
      else addNote(ticket.id, `This text did not reach the tenant: ${r.error}`);
    });
  }
  return id;
}

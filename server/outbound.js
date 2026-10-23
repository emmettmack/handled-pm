// Outbound messages. Every message is written to the ticket's log. When the ticket came in by real text and Twilio
// is configured, it is also sent; a failed send is added to the log as a note so the PM can see it.
import { addMessage, addNote } from './store.js';
import { sendSms, twilioConfigured } from './sms.js';

export function sendToTenant(ticket, body, sender = 'ai') {
  const id = addMessage(ticket.id, sender, body);
  if (ticket.channel === 'sms' && ticket.from_phone && twilioConfigured()) {
    sendSms(ticket.from_phone, body).then((r) => { if (!r.ok) addNote(ticket.id, `This text did not reach the tenant: ${r.error}`); });
  }
  return id;
}

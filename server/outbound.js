// Outbound messages. In this demo nothing leaves the machine: messages are written to the ticket's
// message log. To go live, replace the body of sendToTenant with a Twilio call, e.g.
//   await twilio.messages.create({ from: MAINTENANCE_LINE, to: ticket.from_phone, body })
// and keep the addMessage line so the log stays accurate.
import { addMessage } from './store.js';

export function sendToTenant(ticket, body, sender = 'ai') {
  return addMessage(ticket.id, sender, body);
}

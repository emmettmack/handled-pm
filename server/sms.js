// Sending texts through Twilio's REST API. Safe to import anywhere: with no Twilio settings it does nothing,
// which is how local development and the static demo keep working.
const api = () => process.env.TWILIO_API_BASE || 'https://api.twilio.com';
import { bump } from './metrics.js';

export const twilioNumber = () => process.env.TWILIO_PHONE_NUMBER?.trim() || '';
export const twilioConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim() && twilioNumber());
export const twilioAuthHeader = () => 'Basic ' + btoa(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`);

/** Resolves to { ok: true } or { ok: false, error } and never throws, so a failed text can be shown to the PM instead of crashing. */
export async function sendSms(to, body) {
  try {
    const res = await fetch(`${api()}/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: twilioAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: twilioNumber(), Body: String(body).slice(0, 1500) }),
    });
    const data = await res.json().catch(() => ({}));
    bump(res.ok ? 'outbound_sms' : 'failed_sms');
    return res.ok ? { ok: true } : { ok: false, error: data.message || `Twilio returned ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

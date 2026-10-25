// Incoming texts from Twilio (server only). Twilio POSTs here when someone texts your number:
// check the signature, work out which account owns the number, then hand the text to the normal intake.
import crypto from 'node:crypto';
import { runAs } from './accounts.js';
import { db, accountIds } from './db.js';
import * as S from './store.js';
import { receiveInboundMessage } from './intake.js';
import { twilioConfigured, twilioAuthHeader } from './sms.js';
import { bump } from './metrics.js';
import { numberOwner } from './registry.js';

const publicUrl = (req) => (process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') : `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`) + req.originalUrl;

/** Twilio signs the full URL plus every form field (sorted by name) with your auth token. */
export function validSignature(req) {
  const given = req.headers['x-twilio-signature'];
  if (!given) return false;
  const data = Object.keys(req.body || {}).sort().reduce((s, k) => s + k + req.body[k], publicUrl(req));
  const expected = crypto.createHmac('sha1', process.env.TWILIO_AUTH_TOKEN).update(data).digest('base64');
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Which account owns this Twilio number? TWILIO_ROUTES is JSON like {"+18055550100":"user_abc"}; with one signed-up account it's that one. */
export function accountForNumber(to) {
  const assigned = numberOwner(to); // numbers assigned on the admin page come first
  if (assigned) return assigned;
  try {
    const routes = JSON.parse(process.env.TWILIO_ROUTES || '{}');
    if (routes[to]) return routes[to];
  } catch { /* ignore a malformed value and fall through */ }
  const real = accountIds().filter((id) => id !== 'local');
  return real.length === 1 ? real[0] : null;
}

const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
async function downloadMedia(url, type) {
  try {
    const res = await fetch(url, { headers: { Authorization: twilioAuthHeader() } });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || buf.length > MAX_MEDIA_BYTES) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch { return null; }
}

const same = (a, b) => a && b && S.normPhone(a) === S.normPhone(b);

/** A text from one of your vendors (their reply to a dispatch): put it on the job and flag it. It is never treated as a new tenant request. */
function vendorReply(from, text) {
  const v = S.activeVendors().find((x) => same(x.phone, from) || same(x.personal_phone, from));
  if (!v) return false;
  const d = db_lastDispatch(v.id);
  if (!d) return true;
  S.addNote(d.ticket_id, `${v.name} replied by text: “${text}”`);
  S.addFlag(d.ticket_id, 'vendor_reply', `${v.name} replied: “${text.slice(0, 200)}”. Check it and let the tenant know the time.`);
  return true;
}
const db_lastDispatch = (vendorId) => db.prepare("SELECT ticket_id FROM dispatches WHERE vendor_id = ? AND kind = 'vendor' AND state IN ('approved','no_response','accepted') ORDER BY id DESC LIMIT 1").get(vendorId);

export async function inboundSms(req, res) {
  const empty = () => res.type('text/xml').send('<Response></Response>');
  if (!twilioConfigured()) return res.status(503).send('Texting is not set up yet.');
  if (!validSignature(req)) return res.status(403).send('Invalid signature.');

  const { From: from, To: to, Body: body = '' } = req.body;
  const account = accountForNumber(to);
  if (!account) { console.warn(`[sms] no account for ${to}; text from ${from} dropped`); return empty(); }

  try {
    await runAs(account, async () => {
      bump('inbound_sms');
      const text = String(body).trim();
      const n = Number(req.body.NumMedia) || 0;
      if (text && vendorReply(from, text)) return;
      const out = receiveInboundMessage({ channel: 'sms', from, body: text || '(photo or video)' });
      for (let i = 0; i < Math.min(n, 6); i++) {
        const type = req.body[`MediaContentType${i}`] || 'image/jpeg';
        const url = await downloadMedia(req.body[`MediaUrl${i}`], type);
        if (url) S.addMedia(out.ticketId, { kind: type.startsWith('video') ? 'video' : 'photo', name: `from-text-${i + 1}`, url, source: 'text' });
      }
    });
  } catch (e) {
    console.error('[sms] inbound failed', e);
  }
  return empty();
}

// Incoming texts from Twilio (server only). Twilio POSTs here when someone texts your number:
// check the signature, work out which account owns the number, then hand the text to the normal intake.
import crypto from 'node:crypto';
import { runAs } from './accounts.js';
import { db, accountIds } from './db.js';
import * as S from './store.js';
import { receiveInboundMessage } from './intake.js';
import { twilioConfigured, twilioAuthHeader, sendSms } from './sms.js';
import { T } from './templates.js';
import { displayCompany } from './labels.js';
import { normalizeLanguage } from './languages.js';
import { bump } from './metrics.js';
import { numberOwner } from './registry.js';

// Twilio signs the exact URL it called, query string included
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

const STOP = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START = new Set(['START', 'YES', 'UNSTOP']);
const HELP = new Set(['HELP', 'INFO']);

const inflight = new Set();
/** Resolves when no incoming text is still being processed (tests, graceful shutdown). */
export async function inboundIdle() {
  while (inflight.size) await Promise.all([...inflight]);
}

async function processInbound(req, account) {
  const { From: from, Body: body = '', MessageSid: providerSid } = req.body;
  await runAs(account, async () => {
    bump('inbound_sms');
    const text = String(body).trim();
    const n = Number(req.body.NumMedia) || 0;
    const word = text.toUpperCase().replace(/[^A-Z]/g, '');
    if (STOP.has(word)) { S.setOptOut(from, true); return; } // carriers require honoring these words, whatever else is going on
    if (START.has(word)) { S.setOptOut(from, false); return; }
    if (HELP.has(word)) {
      const lang = normalizeLanguage(S.findTenantByPhone(S.normPhone(from))?.language);
      if (!S.isOptedOut(from)) await sendSms(S.normPhone(from), T.help(lang, displayCompany(S.getCompany())));
      return;
    }
    if (text && vendorReply(from, text)) return;
    const out = receiveInboundMessage({ channel: 'sms', from, body: text || '(photo or video)', providerSid });
    if (out.duplicate) return; // the same message delivered again: nothing more to do
    for (let i = 0; i < Math.min(n, 6); i++) {
      const type = req.body[`MediaContentType${i}`] || 'image/jpeg';
      const url = await downloadMedia(req.body[`MediaUrl${i}`], type);
      if (url && out.ticketId) S.addMedia(out.ticketId, { kind: type.startsWith('video') ? 'video' : 'photo', name: `from-text-${i + 1}`, url, source: 'text' });
    }
  });
}

/** Twilio waits about 15 seconds and then sends the text again, so we answer at once and do the work afterwards. */
export async function inboundSms(req, res) {
  if (!twilioConfigured()) return res.status(503).send('Texting is not set up yet.');
  if (!validSignature(req)) return res.status(403).send('Invalid signature.');

  const account = accountForNumber(req.body.To);
  res.type('text/xml').send('<Response></Response>');
  if (!account) { console.warn(`[sms] no account for ${req.body.To}; text from ${req.body.From} dropped`); return; }

  const job = processInbound(req, account).catch((e) => console.error('[sms] inbound failed', e)).finally(() => inflight.delete(job));
  inflight.add(job);
}

/** The carrier's report on a text we sent (delivered, failed, ...). A failure shows up as a note on the work order. */
export async function inboundStatus(req, res) {
  if (!twilioConfigured()) return res.status(503).send('Texting is not set up yet.');
  if (!validSignature(req)) return res.status(403).send('Invalid signature.');
  res.status(204).end();
  const account = String(req.query.a || '');
  const { MessageSid: sid, MessageStatus: status, ErrorCode: code, To: to } = req.body;
  if (!account || !sid) return;
  try {
    runAs(account, () => {
      const m = S.recordDelivery(sid, status, code || null);
      if (code === '21610' && to) S.setOptOut(to, true, 'carrier'); // the carrier says they opted out
      if (m && ['failed', 'undelivered'].includes(status)) S.addNote(m.ticket_id, `A text to the tenant did not arrive (${status}${code ? `, carrier code ${code}` : ''}).`);
    });
  } catch (e) { console.error('[sms] status callback failed', e.message); }
}

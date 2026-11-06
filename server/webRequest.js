// The public web repair-request form: a real way to submit a repair WITHOUT texting. This is what makes
// "texting is optional" true. One form serves two places: the static default page (site/text/index.html,
// posting to the hosted app) and each account's own page (/t/<slug>). No text consent is asked for and no
// texts are sent to the requester: outbound tenant texts only ever go to channel 'sms' tickets (see outbound.js).
//
// Routing is grounded the same way as the opt-in form: the account comes from the page's slug (or the default
// number's account on the main page), so a submission always lands in the right property manager's queue with
// the work orders they already review. Identity is NOT pre-trusted: the name and unit go into the request text,
// and the normal triage identity flow decides whether they match a tenant on file. A lockout from an unmatched
// name is still held for the PM, exactly as with an unknown texter.
import { runAs } from './accounts.js';
import { db } from './db.js';
import * as S from './store.js';
import { enqueue, processTicket } from './triage.js';
import { accountForSlug } from './registry.js';
import { accountForNumber } from './twilio.js';
import { getCompany } from './store.js';
import { displayCompany } from './labels.js';
import { bump } from './metrics.js';
import { DEFAULT_NUMBER, SITE, renderRequestThanks, renderRequestError } from './optinPage.js';

const HOUR = 3600e3, DAY = 24 * HOUR;
const attempts = new Map(); // ip -> recent attempt times (including refused ones)
const dailyCap = () => Number(process.env.WEB_REQUEST_DAILY_CAP) || 300;

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
const tooManyAttempts = (ip) => {
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((t) => now - t < HOUR);
  recent.push(now);
  attempts.set(ip, recent);
  if (attempts.size > 5000) for (const [k, v] of attempts) if (!v.some((t) => now - t < HOUR)) attempts.delete(k);
  return recent.length > 10;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function repairRequestSubmit(req, res) {
  const page = (status, html) => res.status(status).set('Cache-Control', 'no-store').type('html').send(html);
  const { name: rawName, unit: rawUnit, description: rawDesc, email: rawEmail, website, slug: rawSlug } = req.body || {};
  const slug = String(rawSlug || '').toLowerCase().slice(0, 40);
  const back = slug ? `/t/${slug}#online` : `${SITE}/text/#online`;
  const fail = (status, message) => page(status, renderRequestError({ message, back }));
  const ip = clientIp(req);

  if (website) return page(200, renderRequestThanks({ back })); // a bot filled the hidden field: look successful, do nothing
  if (tooManyAttempts(ip)) return fail(429, 'Too many tries from this connection. Please wait an hour.');

  const name = String(rawName || '').trim().replace(/\s+/g, ' ');
  const unit = String(rawUnit || '').trim().replace(/\s+/g, ' ');
  const description = String(rawDesc || '').trim();
  const email = String(rawEmail || '').trim();
  if (name.length < 2 || name.length > 80) return fail(400, 'Please enter your full name.');
  if (!unit || unit.length > 40) return fail(400, 'Please enter your unit or home (for example "Unit 4B").');
  if (description.length < 10 || description.length > 2000) return fail(400, 'Please describe the problem in at least a sentence.');
  if (email && (email.length > 200 || !EMAIL.test(email))) return fail(400, 'That email address does not look right.');

  const account = slug ? accountForSlug(slug) : accountForNumber(DEFAULT_NUMBER);
  if (!account) return fail(slug ? 404 : 503, slug ? 'That page was not found.' : 'Online requests are not available right now. Please text the number on this page instead.');

  const company = runAs(account, () => { const c = getCompany(); return c?.name_confirmed ? displayCompany(c) : null; });

  // The name and unit lead the message the same way a texter would write them, so the ordinary triage identity
  // flow reads them as an identity claim and checks them against the tenants on file. No special treatment.
  const composed = `I'm ${name}, unit ${unit}. ${description}`;

  const result = await runAs(account, () => {
    // A true double submit (same words from the same person within 10 minutes) is shown the confirmation again
    // without opening a second work order.
    const dupe = db
      .prepare("SELECT t.id FROM tickets t JOIN messages m ON m.ticket_id = t.id AND m.sender = 'tenant' WHERE t.channel = 'web' AND m.body = ? AND t.created_at >= ? LIMIT 1")
      .get(composed, S.minsAgo(10));
    if (dupe) return { id: dupe.id, duplicate: true };

    const info = db
      .prepare('INSERT INTO tickets (tenant_id, unit_id, from_phone, channel, verified, language, related_to, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(null, null, null, 'web', 0, 'en', null, S.nowIso(), S.nowIso());
    const id = Number(info.lastInsertRowid);
    S.setStatus(id, 'new', 'Repair request submitted online');
    S.addMessage(id, 'tenant', composed);
    S.addNote(
      id,
      `Submitted through the online form${company ? ` on the ${company} page` : ''}, not by text. `
        + `Name and unit as typed: ${name}, ${unit}. `
        + (email ? `Email for updates: ${email}. ` : 'No email given. ')
        + 'There is no text channel for this request: the assistant cannot text or call this person, so anything it writes below is saved here for you, not delivered. '
        + 'If you need an answer from them, reach them directly.',
    );
    bump('web_request');
    enqueue(id, () => processTicket(id));
    return { id, duplicate: false };
  });

  bump('web_request_page');
  return page(200, renderRequestThanks({ company, back, duplicate: result.duplicate }));
}

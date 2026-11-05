// The web sign-up form on the public opt-in page. It is the written, checkbox consent carriers look for:
// the person enters their own number, ticks an unchecked box next to the exact words, and we record who agreed to what, when.
// Then the registered confirmation text goes out. Public (no sign-in), so it is rate limited and has a hidden trap field.
import { runAs } from './accounts.js';
import * as S from './store.js';
import { twilioConfigured, sendSms } from './sms.js';
import { FIRST_CONTACT } from './templates.js';
import { accountForNumber } from './twilio.js';
import { accountForSlug, recordConsent, setConsentResult, lastConsent, consentsSince, consentsFromIpSince } from './registry.js';
import { getCompany } from './store.js';
import { displayCompany } from './labels.js';
import { bump } from './metrics.js';
import { DEFAULT_NUMBER, SITE, consentCheckboxText, renderThanksPage, renderOptinError } from './optinPage.js';

const HOUR = 3600e3, DAY = 24 * HOUR;
const attempts = new Map(); // ip -> recent attempt times (including refused ones)
const dailyCap = () => Number(process.env.OPTIN_DAILY_CAP) || 300;

/** A US mobile number from whatever was typed: "(805) 555-0142", "805-555-0142", "+1 805 555 0142". Null if it isn't one. */
export function usNumber(input) {
  const d = String(input || '').replace(/\D/g, '');
  const ten = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? `+1${ten}` : null;
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
const tooManyAttempts = (ip) => {
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((t) => now - t < HOUR);
  recent.push(now);
  attempts.set(ip, recent);
  if (attempts.size > 5000) for (const [k, v] of attempts) if (!v.some((t) => now - t < HOUR)) attempts.delete(k);
  return recent.length > 10;
};
const sinceIso = (ms) => new Date(Date.now() - ms).toISOString();

export async function optinSubmit(req, res) {
  const page = (status, html) => res.status(status).set('Cache-Control', 'no-store').type('html').send(html);
  const fail = (status, message, slug) => page(status, renderOptinError({ message, back: slug ? `/t/${slug}#signup` : `${SITE}/text/#signup` }));
  const { phone: rawPhone, consent, website, slug: rawSlug } = req.body || {};
  const slug = String(rawSlug || '').toLowerCase().slice(0, 40);
  const ip = clientIp(req);

  if (website) return res.redirect(303, `${SITE}/text/thanks.html`); // a bot filled the hidden field: look successful, do nothing
  if (tooManyAttempts(ip)) return fail(429, 'Too many tries from this connection. Please wait an hour, or text the number directly.', slug);
  if (consent !== 'yes') return fail(400, 'Please tick the box to agree to receive text messages.', slug);
  const phone = usNumber(rawPhone);
  if (!phone) return fail(400, 'Please enter a 10-digit US mobile number.', slug);
  if (consentsFromIpSince(ip, sinceIso(HOUR)) >= 5 || consentsSince(sinceIso(DAY)) >= dailyCap()) {
    return fail(429, 'Sign-ups are paused for now. Please try again later, or text the number directly.', slug);
  }

  const account = slug ? accountForSlug(slug) : accountForNumber(DEFAULT_NUMBER);
  if (!account) return fail(slug ? 404 : 503, slug ? 'That page was not found.' : 'Sign-up is not available right now. Please text the number directly.', slug);
  const company = slug ? runAs(account, () => { const c = getCompany(); return c?.name_confirmed ? displayCompany(c) : null; }) : null;

  // Same person signing up again within a day: show the thank-you page without a second text.
  const prior = lastConsent(phone);
  const again = prior && Date.parse(prior.created_at) > Date.now() - DAY;
  const id = recordConsent({
    phone, accountId: account, slug: slug || null, consentText: consentCheckboxText(company),
    pageUrl: String(req.headers.referer || '').slice(0, 300) || `${SITE}/text/`, ip, userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
  });
  bump('optin_form');

  let sid = null, error = null;
  await runAs(account, async () => {
    S.setOptOut(phone, false); // signing up on the form is fresh written consent, even after an earlier STOP
    if (again || !twilioConfigured()) return;
    S.markDisclosed(phone); // this confirmation is the program disclosure, so their first text won't trigger it again
    const r = await sendSms(phone, FIRST_CONTACT);
    sid = r.sid || null; error = r.ok ? null : (r.error || 'send failed');
  });
  setConsentResult(id, sid, error);

  if (slug) return res.redirect(303, `/t/${slug}/thanks`);
  return res.redirect(303, `${SITE}/text/thanks.html`);
}

/** GET /t/:slug/thanks, the page shown after signing up on a company's own page. */
export function servePublicThanks(req, res) {
  const account = accountForSlug(req.params.slug);
  const company = account && runAs(account, () => { const c = getCompany(); return c?.name_confirmed ? displayCompany(c) : null; });
  if (!account || !company) return res.status(404).type('text/plain').send('Page not found');
  res.set('Cache-Control', 'no-store').type('html').send(renderThanksPage({ company, back: `/t/${req.params.slug}#signup` }));
}

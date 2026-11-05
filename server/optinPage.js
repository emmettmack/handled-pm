// The public "text us" page carriers review for SMS opt-in. One template serves two places: the static default page
// (site/text/index.html, built by scripts/build-optin.mjs) and each account's own page (/t/<slug>, rendered by the server).
// Plain HTML and CSS only: it must read fully with JavaScript off.
import qrcode from 'qrcode-generator';
import { FIRST_CONTACT } from './templates.js';

export const DEFAULT_NUMBER = '+18059093422';
export const DEFAULT_BRAND = 'Macalisto';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "+18059093422" -> "(805) 909-3422" */
export function prettyNumber(n) {
  const d = String(n || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(n || '');
}

export const SUPPORT_EMAIL = 'efmack@usc.edu';
export const PAGE_UPDATED = 'November 4, 2026';

/** A QR code that opens a text to the number (for the printed flyer and for people reading this on a computer). Plain SVG, no scripts. */
function qrSvg(tel) {
  const q = qrcode(0, 'M');
  q.addData(`sms:${tel}`);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

const CSS = `:root{--ink:#111;--muted:#555;--line:#cfcfcf}
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff}
header{border-bottom:1px solid var(--line)}
.bar{max-width:760px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
.brand{font-weight:700;color:var(--ink);text-decoration:none}
.bar span{color:var(--muted);font-size:14px}
main{max-width:760px;margin:0 auto;padding:32px 24px 64px}
.eyebrow{font-size:14px;color:var(--muted);font-weight:600}
h1{font-size:24px;line-height:1.25;margin:6px 0 12px}
h2{font-size:18px;margin:32px 0 10px}
p{margin:0 0 12px}
.lead{color:var(--ink)}
.cta{margin:20px 0 8px;padding:20px;border:1px solid var(--ink);border-radius:4px}
.cta .label{font-size:14px;color:var(--muted);font-weight:600}
.number{display:block;font-size:24px;font-weight:700;color:var(--ink);text-decoration:underline;margin:2px 0 8px}
.ctaRow{display:flex;gap:24px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.ctaRow>div:first-child{flex:1 1 300px}
.qr{text-align:center;font-size:12px;color:var(--muted)} .qr svg{display:block;width:96px;height:96px;margin:0 auto 4px}
.consent{margin:0;padding:10px 14px;border-left:3px solid var(--ink)}
.legal{margin-top:12px;font-size:14px;color:var(--muted)}
a{color:var(--ink);text-decoration:underline}
ol.steps{margin:0;padding-left:22px} ol.steps li{margin:6px 0}
dl{margin:0;border:1px solid var(--line);border-radius:4px}
dl div{display:grid;grid-template-columns:190px 1fr;gap:16px;padding:10px 14px;border-top:1px solid var(--line)}
dl div:first-child{border-top:0}
dt{font-weight:600} dd{margin:0}
.samples{display:grid;gap:8px}
.msg{padding:10px 14px;border:1px solid var(--line);border-radius:4px;max-width:560px}
.note{font-size:14px;color:var(--muted)}
.warn{padding:12px 14px;border:1px solid var(--ink);border-radius:4px}
button{font:inherit;font-weight:600;padding:8px 16px;border-radius:4px;border:1px solid var(--ink);background:#fff;color:var(--ink);cursor:pointer;margin-top:24px}
footer{border-top:1px solid var(--line);color:var(--muted);font-size:14px}
footer div{max-width:760px;margin:0 auto;padding:18px 24px}
@media (max-width:620px){dl div{grid-template-columns:1fr;gap:2px} .qr,.note.screen{display:none}}
@media print{
  .signup{display:none}
  @page{margin:.6in}
  body{font-size:12pt}
  header,button,.screen,footer .links{display:none}
  main{padding:0;max-width:none}
  .number{font-size:30pt}
  a{text-decoration:none}
  h2,.cta,dl,.samples{break-inside:avoid}
  .qr{display:block!important}
}
input[type=tel]{display:block;width:100%;max-width:320px;font:inherit;padding:8px 10px;border:1px solid var(--ink);border-radius:4px;margin:4px 0 14px}
label{font-weight:600}
.check{display:flex;gap:10px;align-items:flex-start;font-weight:400;margin:4px 0 8px}
.check input{margin-top:6px;flex:none}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.signup{padding:20px;border:1px solid var(--line);border-radius:4px}
.signup button{margin-top:8px}`;

/** The words next to the opt-in checkbox. The server stores this exact text with every sign-up, so build it in one place. */
export const consentCheckboxText = (company = null) => `I agree to receive text messages from ${company ? `${company} through Macalisto` : (company || DEFAULT_BRAND)} about my repair request, such as confirmations, questions, scheduling and updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of any lease or purchase.`;

export const SITE = 'https://macalisto.com';
export const FORM_ACTION = 'https://app.macalisto.com/api/optin';

export function renderOptinPage({ number = DEFAULT_NUMBER, company = null, base = '', autoPrint = false, formAction = FORM_ACTION, slug = '' } = {}) {
  const brand = company || DEFAULT_BRAND;
  const b = esc(brand);
  const shown = prettyNumber(number);
  const tel = `+1${String(number).replace(/\D/g, '').slice(-10)}`;
  const fromWho = company ? `${b} through Macalisto` : b;
  // The consent sentence is the exact wording registered with the carriers. Only the number and the sender's name change.
  const consent = `Text your maintenance request to ${shown}. By texting, you agree to receive text messages from ${fromWho} about your repair request, such as confirmations, questions, scheduling and updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of any lease or purchase.`;
  const lead = company
    ? `This is the maintenance line for ${b}. If you rent a home managed by ${b}, text this number to report a repair or ask about one that is already open.`
    : `This is a maintenance request line operated by Macalisto on behalf of landlords and property managers. If your landlord or property manager gave you this number, text it to report a repair or ask about one that is already open.`;
  const sender = company ? `${b}, with messaging provided by Macalisto (operated by Emmett Mack)` : 'Macalisto, operated by Emmett Mack';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maintenance request line · ${b}</title>
<meta name="description" content="How to text a maintenance request to ${b}, what messages to expect, and how to opt out.">
<meta property="og:title" content="Text your maintenance request · ${b}">
<meta property="og:description" content="Text ${shown} to report a repair. See what messages to expect and how to opt out.">
<meta property="og:type" content="website">
<meta name="robots" content="index,follow">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23111111'/%3E%3Cpath d='M9 16.5l5 5 9-10' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<style>
${CSS}
</style></head><body>
<header><div class="bar"><a class="brand" href="https://macalisto.com/">${b}</a><span>Maintenance request line</span></div></header>
<main>
<div class="eyebrow">Maintenance request line</div>
<h1>Text your maintenance request</h1>
<p class="lead">${lead}</p>

<div class="cta">
<div class="label">Text this number</div>
<div class="ctaRow">
<div>
<a class="number" href="sms:${tel}">${shown}</a>
<p class="note screen" style="margin:0 0 14px">On a phone, tap the number to open a text. On a computer, scan the code with your phone.</p>
</div>
<div class="qr" aria-label="QR code that opens a text message to ${shown}">${qrSvg(tel)}<span>Scan to text</span></div>
</div>
<p class="consent">${consent}</p>
<p class="legal">Questions or trouble texting? Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
<p class="legal" style="margin-top:4px">By texting this number you also agree to the <a href="https://macalisto.com/terms.html">Terms of Service</a> and acknowledge the <a href="https://macalisto.com/privacy.html">Privacy Policy</a>.</p>
</div>

<h2 id="signup">Or sign up here</h2>
<form class="signup" method="post" action="${esc(formAction)}">
<p class="note" style="margin-top:0">Prefer to start with a form? Enter your mobile number and agree below. We will text you a confirmation, and then you can text your repair requests to ${shown}.</p>
<label for="phone">Mobile phone number</label>
<input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 555-5555" required>
<div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
<label class="check"><input type="checkbox" name="consent" value="yes" required><span>${esc(consentCheckboxText(company))}</span></label>
<p class="legal">By signing up you also agree to the <a href="https://macalisto.com/terms.html">Terms of Service</a> and acknowledge the <a href="https://macalisto.com/privacy.html">Privacy Policy</a>.</p>
<input type="hidden" name="slug" value="${esc(slug)}">
<button type="submit">Sign me up for repair request texts</button>
</form>

<h2>How it works</h2>
<ol class="steps">
<li><strong>You text the problem.</strong> Describe what is wrong. Photos help and can be sent in the same conversation.</li>
<li><strong>We ask for what a repair person needs.</strong> This may include where the problem is, how serious it is, and when someone can get into your home.</li>
<li><strong>Your property manager reviews and approves the repair.</strong> Nothing is sent to a repair person until they do.</li>
<li><strong>You are kept informed.</strong> You will get a text with the day and time once a repair person confirms, and a follow-up when the work is done.</li>
</ol>

<h2>Program details</h2>
<dl>
<div><dt>Program</dt><dd>Macalisto Repair Request Texts: maintenance request messaging for residents of rental homes</dd></div>
<div><dt>Messages come from</dt><dd>${shown}</dd></div>
<div><dt>Sender</dt><dd>${sender}</dd></div>
<div><dt>Messages you may receive</dt><dd>Confirmation that we received your request, questions about the problem, scheduling and status updates, and notice when the work is complete</dd></div>
<div><dt>Message frequency</dt><dd>Varies with your request. Typically a few messages per repair.</dd></div>
<div><dt>Cost</dt><dd>We do not charge you to text. Your carrier’s message and data rates may apply.</dd></div>
<div><dt>Opt out</dt><dd>Reply <strong>STOP</strong> at any time. You will receive one confirmation and no further messages. Reply <strong>START</strong> to resume.</dd></div>
<div><dt>Help</dt><dd>Reply <strong>HELP</strong>, or email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></dd></div>
<div><dt>Your information</dt><dd>We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes. See the <a href="https://macalisto.com/privacy.html">Privacy Policy</a>.</dd></div>
<div><dt>Marketing</dt><dd>This line is used only for maintenance. We do not send promotional messages.</dd></div>
</dl>

<h2>Examples of messages you may receive</h2>
<div class="samples">
<div class="msg">${esc(FIRST_CONTACT)}</div>
<div class="msg">Macalisto: Got your repair request for Unit 4B at 123 Main St: "Kitchen sink leaking under cabinet". Your property manager has been notified. We may text you questions and updates. Msg frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help.</div>
<div class="msg">Macalisto: Thanks, Maria. Is the leak under the sink still dripping right now? If you can, reply with a photo. A plumber will be scheduled once your property manager approves.</div>
<div class="msg">Macalisto: Your property manager approved the repair for Unit 4B. We're finding a time with a repair person and will text you once it's scheduled. Reply STOP to opt out.</div>
<div class="msg">Macalisto: Update on your repair request for Unit 4B: Rivera Plumbing is scheduled for 11/04 between 1 and 3 PM. Reply here if that time doesn't work.</div>
<div class="msg">Macalisto: Your report of a gas smell at Unit 4B has been marked urgent and sent to your property manager. Leave the unit now and call 911 or the gas company from outside. Do not use light switches or flames.</div>
</div>
<p class="note" style="margin-top:12px">These are examples. The wording of real messages depends on your request.</p>

<h2>In an emergency</h2>
<div class="warn"><strong>If there is a fire, a gas smell, a medical emergency or immediate danger, call 911 first.</strong> This number is for maintenance requests and is not an emergency service.</div>

<button onclick="window.print()" type="button" class="screen">Print this notice</button>
</main>
<footer><div><div class="links"><a href="https://macalisto.com/terms.html">Terms of Service</a> · <a href="https://macalisto.com/privacy.html">Privacy Policy</a> · <a href="mailto:${SUPPORT_EMAIL}">Contact</a></div><div style="padding:8px 0 0">Macalisto is operated by Emmett Mack. Page last updated ${PAGE_UPDATED}.</div></div></footer>${autoPrint ? '<script>window.print()</script>' : ''}</body></html>
`;
}

const shell = (title, body, b = DEFAULT_BRAND) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(b)}</title>
<meta name="robots" content="noindex">
<style>
${CSS}
</style></head><body>
<header><div class="bar"><a class="brand" href="${SITE}/">${esc(b)}</a><span>Maintenance request line</span></div></header>
<main>
${body}
</main>
<footer><div><div class="links"><a href="${SITE}/terms.html">Terms of Service</a> · <a href="${SITE}/privacy.html">Privacy Policy</a> · <a href="mailto:${SUPPORT_EMAIL}">Contact</a></div><div style="padding:8px 0 0">Macalisto is operated by Emmett Mack. Page last updated ${PAGE_UPDATED}.</div></div></footer></body></html>
`;

/** Shown after a sign-up. The default one is also published as a static page so reviewers can see what happens after submitting. */
export function renderThanksPage({ number = DEFAULT_NUMBER, company = null, back = `${SITE}/text/` } = {}) {
  const shown = prettyNumber(number);
  return shell('You are signed up', `<h1>You are signed up</h1>
<p class="lead">We sent a confirmation text to the number you entered. It should arrive within a minute.</p>
<div class="cta"><div class="label">To report a repair, text</div><a class="number" href="sms:+1${String(number).replace(/\D/g, '').slice(-10)}">${shown}</a>
<p class="legal" style="margin:0">The confirmation reads:</p><div class="msg" style="margin-top:8px">${esc(FIRST_CONTACT)}</div></div>
<p>Message frequency varies. Message and data rates may apply. Reply <strong>STOP</strong> at any time to opt out, or <strong>HELP</strong> for help. Questions? Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
<p><a href="${esc(back)}">Back to the sign-up page</a></p>`, company || DEFAULT_BRAND);
}

/** Shown when a sign-up cannot be completed (missing box, bad number, too many tries). */
export function renderOptinError({ message, back = `${SITE}/text/#signup`, company = null }) {
  return shell('Sign-up not completed', `<h1>We could not sign you up</h1>
<p class="lead">${esc(message)}</p>
<p><a href="${esc(back)}">Back to the sign-up form</a></p>
<p class="note">You can also text ${prettyNumber(DEFAULT_NUMBER)} directly to report a repair.</p>`, company || DEFAULT_BRAND);
}

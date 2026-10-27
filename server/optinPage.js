// The public "text us" page carriers review for SMS opt-in. One template serves two places: the static default page
// (site/text/index.html, built by scripts/build-optin.mjs) and each account's own page (/t/<slug>, rendered by the server).
// Plain HTML and CSS only: it must read fully with JavaScript off.
import qrcode from 'qrcode-generator';

export const DEFAULT_NUMBER = '+18059093422';
export const DEFAULT_BRAND = 'Macalisto';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "+18059093422" -> "(805) 909-3422" */
export function prettyNumber(n) {
  const d = String(n || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(n || '');
}

export const SUPPORT_EMAIL = 'efmack@usc.edu';
export const PAGE_UPDATED = 'October 27, 2026';

/** A QR code that opens a text to the number (for the printed flyer and for people reading this on a computer). Plain SVG, no scripts. */
function qrSvg(tel) {
  const q = qrcode(0, 'M');
  q.addData(`sms:${tel}`);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

export function renderOptinPage({ number = DEFAULT_NUMBER, company = null, base = '', autoPrint = false } = {}) {
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
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234433d6'/%3E%3Cpath d='M9 16.5l5 5 9-10' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<style>
:root{--ink:#161a2b;--muted:#566075;--line:#dfe3ee;--brand:#4433d6;--soft:#f4f6fb}
*{box-sizing:border-box}
body{margin:0;font:16px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff}
header{border-bottom:1px solid var(--line)}
.bar{max-width:820px;margin:0 auto;padding:16px 24px;display:flex;align-items:center;justify-content:space-between}
.brand{font-weight:700;letter-spacing:-.01em;color:var(--ink);text-decoration:none;font-size:18px}
.bar span{color:var(--muted);font-size:14px}
main{max-width:820px;margin:0 auto;padding:40px 24px 72px}
.eyebrow{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
h1{font-size:clamp(30px,5vw,42px);line-height:1.12;letter-spacing:-.025em;margin:10px 0 14px}
h2{font-size:20px;margin:44px 0 12px;letter-spacing:-.01em}
p{margin:0 0 12px}
.lead{font-size:18px;color:#2a3147;max-width:62ch}
.cta{margin:26px 0 8px;padding:24px;border:1px solid var(--line);border-radius:14px;background:var(--soft)}
.cta .label{font-size:14px;color:var(--muted);font-weight:600}
.number{display:block;font-size:clamp(34px,7vw,52px);font-weight:700;letter-spacing:-.02em;color:var(--brand);text-decoration:none;margin:4px 0 10px}
.ctaRow{display:flex;gap:24px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.qr{text-align:center;font-size:12px;color:var(--muted)} .qr svg{display:block;width:104px;height:104px;margin:0 auto 4px}
.consent{margin:0;padding:14px 16px;border-left:4px solid var(--brand);background:#fff;border-radius:0 8px 8px 0;font-size:15.5px;color:#2a3147}
.legal{margin-top:12px;font-size:14px;color:var(--muted)}
a{color:var(--brand)}
ol.steps{margin:0;padding-left:22px} ol.steps li{margin:8px 0}
dl{margin:0;border:1px solid var(--line);border-radius:12px;overflow:hidden}
dl div{display:grid;grid-template-columns:200px 1fr;gap:16px;padding:12px 16px;border-top:1px solid var(--line)}
dl div:first-child{border-top:0}
dt{font-weight:600} dd{margin:0;color:#2a3147}
.samples{display:grid;gap:10px}
.msg{padding:12px 16px;border:1px solid var(--line);border-radius:14px 14px 14px 4px;background:var(--soft);max-width:560px;font-size:15.5px}
.note{font-size:14px;color:var(--muted)}
.warn{padding:14px 16px;border:1px solid #f0c9c9;background:#fff6f6;border-radius:10px}
button{font:inherit;font-weight:600;padding:10px 18px;border-radius:10px;border:1px solid var(--brand);background:#fff;color:var(--brand);cursor:pointer;margin-top:28px}
footer{border-top:1px solid var(--line);color:var(--muted);font-size:14px}
footer div{max-width:820px;margin:0 auto;padding:20px 24px}
@media (max-width:620px){dl div{grid-template-columns:1fr;gap:2px} .qr,.note.screen{display:none}}
@media print{
  @page{margin:.6in}
  body{font-size:12.5pt}
  header,button,.screen,footer .links{display:none}
  main{padding:0;max-width:none}
  .cta{background:#fff;border:2px solid #000}
  .number{color:#000;font-size:48pt}
  a{color:#000;text-decoration:none}
  .consent{border-left-color:#000}
  h2,.cta,dl,.samples{break-inside:avoid}
  .qr{display:block!important}
}
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
<p class="legal">By texting this number you also agree to the <a href="https://macalisto.com/terms.html">Terms of Service</a> and acknowledge the <a href="https://macalisto.com/privacy.html">Privacy Policy</a>.</p>
</div>

<h2>How it works</h2>
<ol class="steps">
<li><strong>You text the problem.</strong> Describe what is wrong. Photos help and can be sent in the same conversation.</li>
<li><strong>We ask for what a repair person needs.</strong> This may include where the problem is, how serious it is, and when someone can get into your home.</li>
<li><strong>Your property manager reviews and approves the repair.</strong> Nothing is sent to a repair person until they do.</li>
<li><strong>You are kept informed.</strong> You will get a text with the day and time once a repair person confirms, and a follow-up when the work is done.</li>
</ol>

<h2>Program details</h2>
<dl>
<div><dt>Program</dt><dd>Maintenance request messaging for residents of rental homes</dd></div>
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
<div class="msg">Hi, happy to help. What is going on that you need help with?</div>
<div class="msg">Thanks for the photo. Is the water still leaking, or is it only damp?</div>
<div class="msg">Your request has been sent to your property manager for approval. You will get a text with the day and time once a repair person confirms.</div>
</div>
<p class="note" style="margin-top:12px">These are examples. The wording of real messages depends on your request.</p>

<h2>In an emergency</h2>
<div class="warn"><strong>If there is a fire, a gas smell, a medical emergency or immediate danger, call 911 first.</strong> This number is for maintenance requests and is not an emergency service.</div>

<button onclick="window.print()" type="button" class="screen">Print this notice</button>
</main>
<footer><div><div class="links"><a href="https://macalisto.com/terms.html">Terms of Service</a> · <a href="https://macalisto.com/privacy.html">Privacy Policy</a> · <a href="mailto:${SUPPORT_EMAIL}">Contact</a></div><div style="padding:8px 0 0">Macalisto is operated by Emmett Mack. Page last updated ${PAGE_UPDATED}.</div></div></footer>${autoPrint ? '<script>window.print()</script>' : ''}</body></html>
`;
}

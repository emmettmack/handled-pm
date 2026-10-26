// The public "text us" page carriers review for SMS opt-in. One template serves two places: the static default page
// (site/text/index.html, built by scripts/build-optin.mjs) and each account's own page (/t/<slug>, rendered by the server).
// Plain HTML and CSS only: it must read fully with JavaScript off.
export const DEFAULT_NUMBER = '+18059093422';
export const DEFAULT_BRAND = 'Macalisto';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "+18059093422" -> "(805) 909-3422" */
export function prettyNumber(n) {
  const d = String(n || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(n || '');
}

export function renderOptinPage({ number = DEFAULT_NUMBER, company = null, base = '', autoPrint = false } = {}) {
  const brand = company || DEFAULT_BRAND;
  const shown = prettyNumber(number);
  const tel = `+1${String(number).replace(/\D/g, '').slice(-10)}`;
  const heading = company ? `Text ${esc(company)}’s maintenance line` : 'Text your maintenance request';
  const intro = company ? `Having a problem at your home? Text ${esc(company)} at the number below.` : 'Something broken at your home? Text it to the number below.';
  const consent = `Text your maintenance request to ${shown}. By texting, you agree to receive text messages from ${esc(brand)} about your repair request, such as confirmations, questions, scheduling and updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of any lease or purchase.`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Text your maintenance request · ${esc(brand)}</title>
<meta name="description" content="How to text a maintenance request to ${esc(brand)}.">
<style>
body{margin:0;font:16px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1d1d1f;background:#fff}
main{max-width:720px;margin:0 auto;padding:48px 20px 80px}
a{color:#2457d6} h1{font-size:34px;line-height:1.2;margin:24px 0 8px} h2{font-size:19px;margin:32px 0 6px}
.top{font-weight:600;text-decoration:none;color:#1d1d1f}
.number{display:block;font-size:44px;font-weight:700;text-decoration:none;color:#2457d6;margin:12px 0}
.consent{border:1px solid #d5dbe8;background:#f6f8fc;border-radius:12px;padding:18px 20px;margin:16px 0}
ol{padding-left:22px} li{margin:6px 0}
.links,.foot{color:#666;font-size:14px;margin-top:24px}
button{font:inherit;font-weight:600;padding:10px 18px;border-radius:99px;border:1px solid #2457d6;background:#fff;color:#2457d6;cursor:pointer;margin-top:20px}
@media print{
  @page{margin:.6in}
  body{font-size:15pt}
  main{padding:0;max-width:none}
  button,.top,.links{display:none}
  .number{color:#000;font-size:54pt}
  .consent{background:#fff;border:2px solid #000;font-size:12pt}
  a{color:#000;text-decoration:none}
  h2{break-after:avoid} .consent,ol{break-inside:avoid}
}
</style></head><body><main>
<a class="top" href="https://macalisto.com/">Macalisto</a>
<h1>${heading}</h1>
<p>${intro}</p>
<a class="number" href="sms:${tel}">${shown}</a>
<div class="consent"><p style="margin:0">${consent}</p></div>
<p class="links"><a href="https://macalisto.com/terms.html">Terms of Service</a> · <a href="https://macalisto.com/privacy.html">Privacy Policy</a></p>
<h2>How it works</h2>
<ol>
<li>Text the problem to the number above.</li>
<li>${esc(brand)} confirms your request and may ask a few questions.</li>
<li>Your property manager approves the repair.</li>
<li>You get updates by text until it’s done.</li>
</ol>
<p>In an emergency, such as fire, gas or a medical emergency, call 911 first.</p>
<button onclick="window.print()" type="button">Print this notice</button>
<p class="foot">Macalisto is operated by Emmett Mack.</p>
</main>${autoPrint ? '<script>window.print()</script>' : ''}</body></html>
`;
}

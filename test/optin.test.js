import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, asLocal } from './helpers.js';
import { renderOptinPage } from '../server/optinPage.js';

const t = await boot();
after(() => t.close());
const registry = await import('../server/registry.js');

const CONSENT = (num, brand, via = '') => `Text your maintenance request to ${num}. By texting, you agree to receive text messages from ${brand}${via} about your repair request, such as confirmations, questions, scheduling and updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of any lease or purchase.`;

test('the committed static page matches the template and has the exact consent wording, no script', () => {
  const html = fs.readFileSync(new URL('../site/text/index.html', import.meta.url), 'utf8');
  assert.equal(html, renderOptinPage(), 'run: node scripts/build-optin.mjs');
  assert.ok(html.includes(CONSENT('(805) 909-3422', 'Macalisto')));
  assert.ok(html.includes('href="sms:+18059093422"'));
  assert.ok(!/<script/i.test(html));
  assert.ok(html.includes('Macalisto is operated by Emmett Mack.'));
});

test('an account page needs a confirmed company name, shows its own number and name, and leaks nothing else', async () => {
  assert.equal((await fetch(`${t.base}/t/nobody`)).status, 404);
  await asLocal(t, () => t.mods.store.updateCompany({ name: 'Hyperion Property Management', pm_name: 'Dana Private', email: 'secret@example.com', phone: '555-000-9999' }));
  const info = (await t.api('GET', '/public-page')).data;
  assert.equal(info.slug, 'hyperion-property-management');
  assert.equal(info.usingDefaultNumber, true);
  registry.assignNumber('+13105550142', 'local');
  assert.equal((await t.api('GET', '/public-page')).data.number, '(310) 555-0142');

  const res = await fetch(`${t.base}/t/${info.slug}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes(CONSENT('(310) 555-0142', 'Hyperion Property Management', ' through Macalisto')));
  assert.ok(html.includes('sms:+13105550142'));
  assert.ok(!/<script/i.test(html));
  for (const secret of ['secret@example.com', '555-000-9999', 'Dana Private']) assert.ok(!html.includes(secret));
  assert.ok((await (await fetch(`${t.base}/t/${info.slug}?flyer=1`)).text()).includes('window.print()'));
});

test('link names are validated and unique, and company names are escaped', async () => {
  assert.equal((await t.api('PUT', '/public-page', { slug: 'a' })).status, 400);
  assert.equal((await t.api('PUT', '/public-page', { slug: 'admin' })).status, 400);
  registry.setPageSlug('someone-else', 'taken-name');
  assert.equal((await t.api('PUT', '/public-page', { slug: 'taken-name' })).status, 409);
  assert.equal((await t.api('PUT', '/public-page', { slug: 'hyperion-pm' })).data.slug, 'hyperion-pm');
  assert.equal((await fetch(`${t.base}/t/hyperion-property-management`)).status, 404);
  assert.ok(renderOptinPage({ company: '<b>x</b>' }).includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('the page states what carriers and residents need to see: sender, message types, frequency, cost, opt-out, help, privacy, 911', () => {
  const html = renderOptinPage();
  for (const must of ['Program details', 'Message frequency', 'Reply <strong>STOP</strong>', 'Reply <strong>HELP</strong>', 'efmack@usc.edu', 'We do not sell or share your SMS opt-in data', 'call 911 first', 'Examples of messages you may receive', 'terms.html', 'privacy.html', 'Macalisto, operated by Emmett Mack']) assert.ok(html.includes(must), must);
  assert.ok(renderOptinPage({ company: 'Hyperion Property Management' }).includes('messaging provided by Macalisto (operated by Emmett Mack)'));
});

test('the page has a scannable code that opens a text, a desktop note, a favicon, preview tags and a date, and still no scripts', () => {
  const html = renderOptinPage();
  assert.match(html, /<svg[^>]*viewBox/);
  assert.ok(html.includes('Scan to text'));
  assert.ok(html.includes('On a computer, scan the code'));
  assert.ok(html.includes('rel="icon"') && html.includes('og:title'));
  assert.match(html, /Page last updated October 29, 2026/);
  assert.ok(!/<script/i.test(html));
});

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, asLocal } from './helpers.js';
import { FIRST_CONTACT } from '../server/templates.js';

const t = await boot({ twilio: true });
after(() => t.close());
// Imported after boot so they use the test's temporary data folder, not the real one.
const registry = await import('../server/registry.js');
const { consentCheckboxText } = await import('../server/optinPage.js');
const { usNumber } = await import('../server/optin.js');
registry.assignNumber('+18059093422', 'local'); // the public number belongs to this account

let n = 0;
const post = (fields, ip = `10.0.0.${++n}`) => fetch(`${t.base}/api/optin`, {
  method: 'POST', redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': ip, Referer: 'https://macalisto.com/text/', 'User-Agent': 'test-browser' },
  body: new URLSearchParams(fields),
});
const toThem = (p) => t.fake.sent.filter((m) => m.To === p);

test('US numbers are read from however they were typed, and anything else is refused', () => {
  for (const ok of ['(805) 555-0142', '805-555-0142', '+1 805 555 0142', '18055550142', '8055550142']) assert.equal(usNumber(ok), '+18055550142', ok);
  for (const bad of ['', '555', '123-456-7890', '(805) 155-0142', '+44 20 7946 0958', 'abc']) assert.equal(usNumber(bad), null, bad);
});

test('signing up records the consent and sends the registered confirmation, once', async () => {
  const res = await post({ phone: '(310) 555-0201', consent: 'yes', website: '' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), 'https://macalisto.com/text/thanks.html');
  const c = registry.lastConsent('+13105550201');
  assert.equal(c.role, 'tenant');
  assert.equal(c.consent_text, consentCheckboxText(null), 'the exact words next to the box are stored');
  assert.equal(c.page_url, 'https://macalisto.com/text/');
  assert.ok(c.ip && c.user_agent && c.created_at);
  assert.deepEqual(toThem('+13105550201').map((m) => m.Body), [FIRST_CONTACT]);
  assert.ok(c.confirmation_sid, 'the send is recorded');
  // again within a day: still a thank-you, no second text
  assert.equal((await post({ phone: '3105550201', consent: 'yes' })).status, 303);
  assert.equal(toThem('+13105550201').length, 1);
  // their first real text does not repeat the disclosure
  await t.sms({ From: '+13105550201', Body: 'my sink is leaking' }); await t.whenIdle();
  assert.equal(toThem('+13105550201').filter((m) => m.Body === FIRST_CONTACT).length, 1);
});

test('no box ticked, a bad number, or a bot filling the hidden field sends nothing and records nothing', async () => {
  const noBox = await post({ phone: '(310) 555-0202' });
  assert.equal(noBox.status, 400); assert.match(await noBox.text(), /tick the box/);
  const bad = await post({ phone: '12345', consent: 'yes' });
  assert.equal(bad.status, 400); assert.match(await bad.text(), /10-digit US mobile number/);
  const bot = await post({ phone: '(310) 555-0203', consent: 'yes', website: 'http://spam.example' });
  assert.equal(bot.status, 303);
  assert.equal(registry.lastConsent('+13105550202'), null);
  assert.equal(registry.lastConsent('+13105550203'), null);
  for (const p of ['+13105550202', '+13105550203']) assert.equal(toThem(p).length, 0, `nothing was sent to ${p}`);
});

test('signing up on the form clears an earlier STOP, because it is new written consent', async () => {
  const p = '+13105550204';
  await t.sms({ From: p, Body: 'STOP' }); await t.whenIdle();
  assert.ok(await asLocal(t, () => t.mods.store.isOptedOut(p)));
  assert.equal((await post({ phone: p, consent: 'yes' })).status, 303);
  assert.equal(await asLocal(t, () => t.mods.store.isOptedOut(p)), false);
});

test('a company page has its own form and thank-you page, and records which page it came from', async () => {
  await asLocal(t, () => t.mods.store.updateCompany({ name: 'Hyperion Property Management', pm_name: 'Dana', email: 'a@b.co', phone: '5550001111' }));
  const slug = (await t.api('GET', '/public-page')).data.slug;
  const html = await (await fetch(`${t.base}/t/${slug}`)).text();
  assert.match(html, /<form class="signup" method="post" action="\/api\/optin">/);
  assert.match(html, new RegExp(`name="slug" value="${slug}"`));
  assert.match(html, /<input type="checkbox" name="consent" value="yes" required>/);
  assert.doesNotMatch(html, /name="consent"[^>]*checked/);
  const res = await post({ phone: '(310) 555-0205', consent: 'yes', slug });
  assert.equal(res.headers.get('location'), `/t/${slug}/thanks`);
  assert.equal(registry.lastConsent('+13105550205').consent_text, consentCheckboxText('Hyperion Property Management'));
  const thanks = await (await fetch(`${t.base}/t/${slug}/thanks`)).text();
  assert.match(thanks, /You are signed up/);
  assert.equal((await fetch(`${t.base}/t/nobody/thanks`)).status, 404);
});

test('one connection can only sign up five numbers an hour, and the daily cap pauses sign-ups', async () => {
  const ip = '10.9.9.9';
  for (let i = 0; i < 5; i++) assert.equal((await post({ phone: `(310) 555-03${10 + i}`, consent: 'yes' }, ip)).status, 303);
  const sixth = await post({ phone: '(310) 555-0399', consent: 'yes' }, ip);
  assert.equal(sixth.status, 429);
  assert.equal(registry.lastConsent('+13105550399'), null);
  process.env.OPTIN_DAILY_CAP = '1';
  assert.equal((await post({ phone: '(310) 555-0398', consent: 'yes' })).status, 429);
  delete process.env.OPTIN_DAILY_CAP;
});

test('the published thank-you page matches the template and shows what happens next', async () => {
  const fs = await import('node:fs');
  const { renderThanksPage } = await import('../server/optinPage.js');
  const html = fs.readFileSync(new URL('../site/text/thanks.html', import.meta.url), 'utf8');
  assert.equal(html, renderThanksPage(), 'run: node scripts/build-optin.mjs');
  assert.ok(html.includes('opted in to repair request texts from Macalisto'));
});

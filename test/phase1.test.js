import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { boot, asLocal } from './helpers.js';
import { parseLegacyRate, formatRate, validateCents } from '../server/rates.js';
import { companyNameProblem, displayCompany, senderLine } from '../server/labels.js';
import { ticketView } from '../server/ticketView.js';
import { TEXT, TEMPLATE_KEYS } from '../server/templates.js';
import { LANGUAGE_CODES } from '../server/languages.js';
import { detectLanguage, detectOtherLanguage } from '../server/mockAi.js';

// ---------- pure logic ----------
test('old free-text rates are read into the right fields, or kept as a note', () => {
  assert.deepEqual(parseLegacyRate('$95/hr'), { hourly: 9500, flat: null, trip: null, notes: '' });
  assert.deepEqual(parseLegacyRate('$140 flat call-out'), { hourly: null, flat: 14000, trip: null, notes: '' });
  const mixed = parseLegacyRate('$65 diagnostic + $90/hr');
  assert.equal(mixed.hourly, 9000); assert.equal(mixed.trip, 6500);
  assert.equal(parseLegacyRate('call for pricing').notes, 'call for pricing');
  assert.equal(parseLegacyRate('').hourly, null);
});

test('rates display in plain words and validate between $1 and $10,000', () => {
  assert.equal(formatRate({ rate_hourly_cents: 18000 }), '$180 per hour');
  assert.equal(formatRate({ rate_hourly_cents: 9050 }), '$90.50 per hour');
  assert.equal(formatRate({ rate_trip_cents: 6500, rate_hourly_cents: 9000 }), '$65 trip charge + $90 per hour');
  assert.equal(formatRate({ rate: 'ask Mike' }), 'ask Mike');
  assert.equal(validateCents(18000, 'x'), null);
  assert.equal(validateCents('', 'x'), null);
  for (const bad of [50, 1000001, 12.5, 'abc']) assert.ok(validateCents(bad, 'The rate'), String(bad));
});

test('a company name is only used when confirmed, and never looks like a sign-in handle', () => {
  assert.equal(companyNameProblem('', ''), 'Enter your company name. Vendors see it on every message.');
  assert.ok(companyNameProblem('pat@gmail.com', ''));
  assert.ok(companyNameProblem('emack805', 'emack805@gmail.com'));
  assert.ok(companyNameProblem('My rentals', ''));
  assert.equal(companyNameProblem('Doe Property Management', 'pat@gmail.com'), null);
  const co = { name: 'emack805', pm_name: 'Emmett Mack', name_confirmed: 0 };
  assert.equal(displayCompany(co), 'Emmett Mack');
  assert.equal(senderLine(co), 'this is Emmett Mack.');
  assert.equal(senderLine({ ...co, name: 'Doe Property Management', name_confirmed: 1 }), 'this is Emmett Mack at Doe Property Management.');
  assert.equal(displayCompany({ name: 'a@b.com', pm_name: 'Pat', name_confirmed: 1 }), 'Pat', 'even a "confirmed" email is never shown');
});

test('a work order only shows vendor, estimate and access once verified and dispatched', () => {
  const base = { cost_estimate: 196, cost_estimate_source: 'sample_rules', dispatches: [] };
  const closedUnverified = ticketView({ ...base, status: 'closed', verified: 0 });
  assert.equal(closedUnverified.showEstimate, false); assert.equal(closedUnverified.showVendor, false); assert.equal(closedUnverified.showAccess, false);
  assert.match(closedUnverified.notice, /never verified/);
  assert.equal(ticketView({ ...base, status: 'triaged', verified: 1 }).showVendor, false, 'verified but nothing drafted yet');
  const live = ticketView({ ...base, status: 'dispatched', verified: 1, dispatches: [{ kind: 'vendor' }] });
  assert.equal(live.showEstimate, true); assert.equal(live.showAccess, true);
  assert.match(live.estimateLabel, /demo only/);
  assert.equal(ticketView({ ...base, cost_estimate_source: 'ai_model', status: 'dispatched', identity_cleared: 1, dispatches: [{ kind: 'vendor' }] }).estimateLabel, 'AI estimate, not a quote');
});

test('every fixed message exists in every supported language', () => {
  assert.equal(LANGUAGE_CODES.length, 8);
  for (const key of TEMPLATE_KEYS) for (const code of LANGUAGE_CODES) assert.ok(TEXT[key][code], `${key} / ${code}`);
  for (const code of LANGUAGE_CODES) assert.match(TEXT.help[code], /911/, `help text mentions 911 in ${code}`);
});

test('the sample AI tells the supported languages apart', () => {
  const cases = { ko: '안녕하세요 부엌 싱크대에서 물이 새요', hy: 'Բարև, խոհանոցի լվացարանը ջուր է հոսում', 'zh-Hans': '你好，厨房水槽漏水了，请尽快来修', 'zh-Hant': '你好，廚房水槽漏水了，請盡快來修理，謝謝您們', vi: 'Xin chào, vòi nước trong bếp bị rò rỉ ạ', tl: 'Po, sira ang gripo sa kusina at may tubig sa sahig', es: 'Hola, el inodoro está tapado', en: 'my sink is leaking' };
  for (const [code, text] of Object.entries(cases)) assert.equal(detectLanguage(text), code, text);
});

test('only genuinely unsupported languages count as "another language"', () => {
  for (const text of ['안녕하세요 싱크대가 새요', '你好，水槽漏水', 'Բարև, ջուր է հոսում', 'Xin chào, vòi nước bị rò', 'Po, sira ang gripo at tubig sa sahig', 'hola el inodoro está tapado', 'my sink is leaking']) assert.equal(detectOtherLanguage(text), false, text);
  for (const text of ['Привет, кран течёт', 'مرحبا الصنبور يسرب', 'こんにちは、水漏れです', 'Bonjour, il y a une fuite']) assert.equal(detectOtherLanguage(text), true, text);
});

// ---------- the running app ----------
const t = await boot({ twilio: true });
after(() => t.close());
const sign = (url, p) => crypto.createHmac('sha1', process.env.TWILIO_AUTH_TOKEN).update(Object.keys(p).sort().reduce((s, k) => s + k + p[k], url)).digest('base64');
const ticketFor = async (phone) => (await t.api('GET', '/dashboard')).data.tickets.find((x) => x.from_phone === phone);
const detail = async (id) => (await t.api('GET', `/tickets/${id}`)).data;

test('vendors: bad rates are refused, good ones are stored in cents and shown in plain words', async () => {
  const body = { name: 'Rivera', trade: 'plumber', phone: '(805) 555-0100', primary_company: 1 };
  assert.equal((await t.api('POST', '/vendors', { ...body, rate_hourly_cents: 50 })).status, 400);
  const ok = await t.api('POST', '/vendors', { ...body, rate_hourly_cents: 18000, language: 'ko' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.rate, '$180 per hour');
  assert.equal(ok.data.language, 'ko');
  assert.equal((await t.api('POST', '/vendors', { ...body, language: 'klingon' })).data.language, 'en', 'unknown language falls back to English');
});

test('company name: a sign-in handle is refused, a real name is confirmed, and an unconfirmed name never reaches a draft', async () => {
  const me = { pm_name: 'Emmett Mack', email: 'emack805@gmail.com', phone: '(805) 555-0100' };
  assert.equal((await t.api('PUT', '/company', { ...me, name: 'emack805' })).status, 400);
  assert.equal((await t.api('PUT', '/company', { ...me, name: 'emack805@gmail.com' })).status, 400);
  assert.equal((await t.api('PUT', '/company', { ...me, name: '' })).status, 400);
  const ok = await t.api('PUT', '/company', { ...me, name: 'Mack Property Co' });
  assert.equal(ok.status, 200); assert.equal(ok.data.name_confirmed, 1);
  assert.match((await t.api('POST', '/prefs/preview', {})).data.text, /this is Emmett Mack at Mack Property Co\./);
  asLocal(t, () => t.mods.db.db.prepare("UPDATE company SET name = 'emack805', name_confirmed = 0").run());
  const text = (await t.api('POST', '/prefs/preview', {})).data.text;
  assert.ok(!text.includes('emack805'), 'the handle never appears');
  assert.match(text, /this is Emmett Mack\./);
});

test('a text in Korean from an unknown number: flagged for the PM, language recorded, no invented estimate', async () => {
  const from = '+14155550124';
  await t.sms({ From: from, Body: '안녕하세요 부엌 싱크대에서 물이 새요 지금 바닥이 다 젖었어요' });
  await t.whenIdle();
  const tk = await detail((await ticketFor(from)).id);
  assert.equal(tk.language, 'ko');
  assert.ok(tk.flags.some((f) => f.type === 'language' && !f.resolved));
  assert.equal(tk.cost_estimate, null, 'real accounts never show the sample AI’s invented figure');
  assert.equal(tk.view.showEstimate, false);
});

test('STOP opts a person out: they are never texted again, and the PM is told why', async () => {
  const from = '+14155550125';
  await t.sms({ From: from, Body: 'my kitchen sink is leaking under the cabinet' }); await t.whenIdle();
  await t.sms({ From: from, Body: 'STOP' }); await t.whenIdle();
  const before = t.fake.sent.filter((s) => s.To === from).length;
  await t.sms({ From: from, Body: 'Grace Liu, unit 204' }); await t.whenIdle();
  assert.equal(t.fake.sent.filter((s) => s.To === from).length, before, 'nothing was sent after STOP');
  const tk = await detail((await ticketFor(from)).id);
  assert.ok(tk.messages.some((m) => m.kind === 'note' && /opted out/.test(m.body)));
  await t.sms({ From: from, Body: 'START' }); await t.whenIdle();
  assert.equal(asLocal(t, () => t.mods.store.isOptedOut(from)), false);
});

test('HELP gets a reply that names the service and says how to stop', async () => {
  const from = '+14155550126';
  await t.sms({ From: from, Body: 'HELP' }); await t.whenIdle();
  const reply = t.fake.sent.filter((s) => s.To === from).at(-1);
  assert.match(reply.Body, /STOP/); assert.match(reply.Body, /911/);
});

test('a carrier delivery failure becomes a note on the work order, and a forged report is refused', async () => {
  const from = '+14155550127';
  await t.sms({ From: from, Body: 'the garage door opener is broken' }); await t.whenIdle();
  const id = (await ticketFor(from)).id;
  const sid = asLocal(t, () => t.mods.db.db.prepare('SELECT provider_sid FROM messages WHERE ticket_id = ? AND provider_sid IS NOT NULL').get(id)?.provider_sid);
  assert.ok(sid, 'outgoing texts remember the carrier id');
  const url = `${t.base}/api/webhooks/sms-status?a=local`;
  const params = { MessageSid: sid, MessageStatus: 'undelivered', ErrorCode: '30003', To: from };
  const post = (sig) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig }, body: new URLSearchParams(params) });
  assert.equal((await post('AAAA')).status, 403);
  assert.equal((await post(sign(url, params))).status, 204);
  assert.ok((await detail(id)).messages.some((m) => m.kind === 'note' && /did not arrive/.test(m.body)));
});

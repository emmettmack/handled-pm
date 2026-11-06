import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { FIRST_CONTACT } from '../server/templates.js';

const t = await boot({ twilio: true });
after(() => t.close());
const text = async (from, body) => { await t.sms({ From: from, Body: body }); await t.whenIdle(); };
const toThem = (n) => t.fake.sent.filter((m) => m.To === n);

test('the first text from a new number gets the program disclosure, exactly as registered, once', async () => {
  const n = '+13105550601';
  await text(n, 'my kitchen sink is leaking under the cabinet');
  assert.equal(toThem(n)[0].Body, FIRST_CONTACT);
  assert.equal(FIRST_CONTACT, "Macalisto: You're opted in to repair request texts from Macalisto. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.");
  assert.match(FIRST_CONTACT, /Msg frequency varies.*Msg & data rates may apply.*HELP.*STOP/);
  const before = toThem(n).length;
  await text(n, 'it is getting worse');
  assert.equal(toThem(n).filter((m) => m.Body === FIRST_CONTACT).length, 1, 'never repeated');
  assert.ok(toThem(n).length >= before);
});

test('STOP, HELP and opted-out numbers do not trigger the disclosure', async () => {
  const stopper = '+13105550602';
  await text(stopper, 'STOP');
  await text(stopper, 'my heater is out and it is cold');
  assert.equal(toThem(stopper).filter((m) => m.Body === FIRST_CONTACT).length, 0, 'opted out: nothing sent');
  const helper = '+13105550603';
  await text(helper, 'HELP');
  assert.equal(toThem(helper).filter((m) => m.Body === FIRST_CONTACT).length, 0, 'HELP gets the help message instead');
});

test('every text to a tenant names the sender, but the stored message is unchanged and a message already naming Macalisto is not doubled', async () => {
  const { brandTenantText, brandVendorText } = await import('../server/templates.js');
  assert.equal(brandTenantText('Hello there'), 'Macalisto: Hello there');
  assert.equal(brandTenantText('Macalisto: Hello there'), 'Macalisto: Hello there');
  assert.equal(brandVendorText('New work order #4', 'Hyperion PM'), 'Macalisto for Hyperion PM: New work order #4');
  const n = '+13105550604';
  await text(n, 'the bathroom fan is making a grinding noise and rattles');
  const sentToThem = toThem(n).map((m) => m.Body);
  assert.ok(sentToThem.slice(1).every((b) => b.startsWith('Macalisto: ')), JSON.stringify(sentToThem));
  const inbox = (await t.api('GET', '/inbox')).data.find((c) => c.from_phone === n);
  const stored = (await t.api('GET', `/tickets/${inbox.id}`)).data.messages.filter((m) => m.sender === 'ai').map((m) => m.body);
  assert.ok(stored.every((b) => !b.startsWith('Macalisto: ')), 'stored text has no prefix');
});

test('a disclosure that fails to send is not recorded, and is retried on the next text', async () => {
  const { asLocal } = await import('./helpers.js');
  const store = (await import('../server/store.js'));
  const n = '+13105550605';
  const attempts = () => toThem(n).filter((m) => m.Body === FIRST_CONTACT).length; // the fake records every attempt, delivered or not
  t.fake.state.failWith = { code: 30034, message: 'registration pending' };
  await text(n, 'my dishwasher is flooding the kitchen');
  assert.equal(attempts(), 1, 'disclosure attempted');
  assert.equal(await asLocal(t, () => store.isDisclosed(n)), false, 'not marked disclosed when the send failed');
  t.fake.state.failWith = null;
  await text(n, 'water everywhere, please hurry');
  assert.equal(attempts(), 2, 'disclosure retried on the next text');
  assert.equal(await asLocal(t, () => store.isDisclosed(n)), true, 'recorded only after a successful send');
  await text(n, 'still leaking');
  assert.equal(attempts(), 2, 'no third attempt once recorded');
});

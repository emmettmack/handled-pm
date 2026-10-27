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

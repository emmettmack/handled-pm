import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, asLocal } from './helpers.js';

const t = await boot({ twilio: true });
after(() => t.close());

const LOCKOUT = "I'm locked out of my apartment, lost my keys. Can someone come open the door today?";
const tickets = async () => (await t.api('GET', '/dashboard')).data.tickets;
const ofPhone = async (phone) => (await tickets()).filter((x) => x.from_phone === phone);
const text = (from, body, extra = {}) => t.sms({ From: from, Body: body, ...extra });

test('three identical lockout texts from one number make ONE work order (repeats are not stored twice)', async () => {
  const from = '+13105553156'; // the number in the review
  for (let i = 0; i < 3; i++) { assert.equal((await text(from, LOCKOUT)).status, 200); await t.whenIdle(); }
  const mine = await ofPhone(from);
  assert.equal(mine.length, 1);
  const detail = (await t.api('GET', `/tickets/${mine[0].id}`)).data;
  assert.equal(detail.messages.filter((m) => m.sender === 'tenant').length, 1, 'the same message again within minutes is a duplicate delivery, so it is not stored twice');
});

test('Twilio delivering the same message twice (same MessageSid) is handled once', async () => {
  const from = '+13105550201';
  const first = await text(from, 'my kitchen sink is leaking under the cabinet');
  await t.whenIdle();
  await t.sms({ From: from, Body: 'my kitchen sink is leaking under the cabinet', MessageSid: first.sid });
  await t.whenIdle();
  const mine = await ofPhone(from);
  assert.equal(mine.length, 1);
  assert.equal((await t.api('GET', `/tickets/${mine[0].id}`)).data.messages.filter((m) => m.sender === 'tenant').length, 1);
});

test('two deliveries of the same message arriving at the same instant make one work order', async () => {
  const from = '+13105550202';
  const sid = 'SMsame0000000000000000000000000001';
  await Promise.all([text(from, LOCKOUT, { MessageSid: sid }), text(from, LOCKOUT, { MessageSid: sid })]);
  await t.whenIdle();
  assert.equal((await ofPhone(from)).length, 1);
});

test('three different deliveries of the same text at the same instant make one work order', async () => {
  const from = '+13105550203';
  await Promise.all([text(from, LOCKOUT), text(from, LOCKOUT), text(from, LOCKOUT)]);
  await t.whenIdle();
  assert.equal((await ofPhone(from)).length, 1);
});

test('same number, a different problem: a separate work order', async () => {
  const from = '+13105550204';
  await text(from, LOCKOUT); await t.whenIdle();
  await text(from, 'my refrigerator stopped cooling and the freezer is thawing'); await t.whenIdle();
  assert.equal((await ofPhone(from)).length, 2);
});

test('different numbers, the same problem: separate work orders', async () => {
  await text('+13105550205', LOCKOUT); await t.whenIdle();
  await text('+13105550206', LOCKOUT); await t.whenIdle();
  assert.equal((await ofPhone('+13105550205')).length + (await ofPhone('+13105550206')).length, 2);
});

test('a "thanks" never becomes its own work order', async () => {
  const from = '+13105550207';
  await text(from, 'the toilet is clogged and overflowing'); await t.whenIdle();
  await text(from, 'thanks!'); await t.whenIdle();
  assert.equal((await ofPhone(from)).length, 1);
});

test('after a work order closes: "leaking again" soon after reopens it as a callback', async () => {
  const from = '+13105550208';
  await text(from, 'my kitchen sink is leaking under the cabinet and there is water on the floor'); await t.whenIdle();
  const [orig] = await ofPhone(from);
  assert.equal((await t.api('POST', `/tickets/${orig.id}/status`, { status: 'resolved' })).status, 200);
  await text(from, 'the kitchen sink is leaking again, same spot'); await t.whenIdle();
  const mine = await ofPhone(from);
  assert.equal(mine.length, 1, 'no second work order');
  const detail = (await t.api('GET', `/tickets/${orig.id}`)).data;
  assert.notEqual(detail.status, 'resolved');
  assert.ok(detail.flags.some((f) => f.type === 'callback' && !f.resolved));
});

test('after a work order closes: the same problem days later is a NEW work order linked to the old one', async () => {
  const from = '+13105550209';
  await text(from, 'my kitchen sink is leaking under the cabinet and there is water on the floor'); await t.whenIdle();
  const [orig] = await ofPhone(from);
  await t.api('POST', `/tickets/${orig.id}/status`, { status: 'resolved' });
  asLocal(t, () => t.mods.db.db.prepare('UPDATE tickets SET resolved_at = ?, updated_at = ? WHERE id = ?').run(new Date(Date.now() - 5 * 86400000).toISOString(), new Date(Date.now() - 5 * 86400000).toISOString(), orig.id));
  await text(from, 'my kitchen sink is leaking under the cabinet again'); await t.whenIdle();
  const mine = await ofPhone(from);
  assert.equal(mine.length, 2);
  const newer = (await t.api('GET', `/tickets/${Math.max(...mine.map((x) => x.id))}`)).data;
  assert.equal(newer.related_to, orig.id);
});

test('the webhook answers immediately; photos are downloaded afterwards', async () => {
  const from = '+13105550210';
  const started = Date.now();
  const res = await text(from, 'the bedroom outlet is sparking', { NumMedia: '1', MediaUrl0: `${t.fake.url}/media/slow`, MediaContentType0: 'image/jpeg' });
  assert.equal(res.status, 200);
  assert.ok(Date.now() - started < 900, `answered in ${Date.now() - started} ms, before the 1.2 s photo download`);
  await t.whenIdle();
  const [tk] = await ofPhone(from);
  assert.equal((await t.api('GET', `/tickets/${tk.id}`)).data.media.length, 1);
});

test('a forged or unsigned webhook creates nothing', async () => {
  const from = '+13105550211';
  assert.equal((await text(from, 'hello', {}, undefined)).status, 200);
  const forged = await t.sms({ From: '+13105550212', Body: 'forged' }, { signature: 'AAAA' });
  const unsigned = await t.sms({ From: '+13105550213', Body: 'unsigned' }, { sign: false });
  assert.equal(forged.status, 403);
  assert.equal(unsigned.status, 403);
  await t.whenIdle();
  assert.equal((await ofPhone('+13105550212')).length + (await ofPhone('+13105550213')).length, 0);
});

test('a PM can merge a duplicate into another work order', async () => {
  const a = '+13105550214', b = '+13105550215';
  await text(a, 'the heater is making a loud banging noise'); await t.whenIdle();
  await text(b, 'my neighbor says the heater is banging loudly again'); await t.whenIdle();
  const [one] = await ofPhone(a), [two] = await ofPhone(b);
  assert.equal((await t.api('POST', `/tickets/${two.id}/merge`, { into: one.id })).status, 200);
  assert.equal((await t.api('GET', `/tickets/${two.id}`)).status, 404, 'the duplicate is gone');
  const merged = (await t.api('GET', `/tickets/${one.id}`)).data;
  assert.ok(merged.messages.some((m) => m.body.includes('neighbor')), 'its messages moved over');
  assert.equal((await t.api('POST', `/tickets/${one.id}/merge`, { into: one.id })).status, 400, 'cannot merge into itself');
});

test('a work order that already had a dispatch sent cannot be merged away', async () => {
  const a = '+13105550216', b = '+13105550217';
  await text(a, 'the water heater is leaking'); await t.whenIdle();
  await text(b, 'the garage door will not open'); await t.whenIdle();
  const [src] = await ofPhone(a), [dst] = await ofPhone(b);
  asLocal(t, () => t.mods.db.db.prepare("INSERT INTO dispatches (ticket_id, vendor_id, kind, text, state, created_at) VALUES (?, NULL, 'vendor', 'sent', 'approved', ?)").run(src.id, new Date().toISOString()));
  const res = await t.api('POST', `/tickets/${src.id}/merge`, { into: dst.id });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /already sent/);
});

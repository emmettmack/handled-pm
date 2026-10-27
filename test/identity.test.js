import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const t = await boot({ twilio: true });
after(() => t.close());

const say = async (from, body) => { await t.sms({ From: from, Body: body }); await t.whenIdle(); };
const ticketFor = async (from) => (await t.api('GET', '/inbox')).data.find((c) => c.from_phone === from);
const detail = async (id) => (await t.api('GET', `/tickets/${id}`)).data;
const aiSaid = (d) => d.messages.filter((m) => m.sender === 'ai').map((m) => m.body);

test('setup: one plumber and one handyman on the vendor list', async () => {
  for (const [name, trade] of [['Pipe Pros', 'plumber'], ['Fix-It Fred', 'handyman']]) {
    assert.equal((await t.api('POST', '/vendors', { name, trade, phone: '+13105550888', rate_hourly_cents: 9500, primary_company: 1 })).status, 200);
  }
});

test('an unknown number is helped with the problem first, not asked to prove who it is', async () => {
  const from = '+13105550201';
  await say(from, 'The kitchen sink is leaking under the cabinet and the floor is wet');
  const d = await detail((await ticketFor(from)).id);
  const first = aiSaid(d)[0] || '';
  assert.ok(!/confirm who I'm texting/i.test(first), first);
  assert.ok(first.length > 0, 'the assistant replied');
});

test('after the issue is clear it asks once for name and address, and a dispatch is drafted once they answer', async () => {
  const from = '+13105550202';
  await say(from, 'The kitchen sink is leaking under the cabinet and the floor is wet, it is a steady drip from the pipe');
  let d = await detail((await ticketFor(from)).id);
  for (let i = 0; i < 3 && !aiSaid(d).some((m) => /full name and the address/i.test(m)); i++) {
    await say(from, 'It is the pipe under the sink, a steady drip, no other leaks');
    d = await detail(d.id);
  }
  assert.ok(aiSaid(d).some((m) => /full name and the address/i.test(m)), 'asked for name and address');
  assert.ok(!d.flags.some((f) => f.type === 'identity' && !f.resolved), 'no identity block raised yet');

  await say(from, 'My name is Dana Reyes, unit 4B');
  d = await detail(d.id);
  assert.ok(['awaiting_approval', 'dispatch_drafted'].includes(d.status), `status was ${d.status}`);
  assert.ok(d.pending_dispatch, 'a dispatch is waiting for the PM to approve');
  assert.ok(d.messages.some((m) => m.kind === 'note' && /not on file|different number/i.test(m.body)), 'the PM is told who this was checked against');
});

test('a name and unit that match a tenant on file are treated as that tenant, from any phone', async () => {
  await t.api('POST', '/properties', { name: 'Test House', address: '12 Oak St', units: ['2'] });
  const unit = (await t.api('GET', '/units')).data.find((u) => u.property_name === 'Test House');
  assert.equal((await t.api('POST', '/tenants', { name: 'Maria Lopez', phone: '+13105550999', unit_id: unit.id })).status, 200);
  const tenant = (await t.api('GET', '/tenants')).data[0];
  assert.equal(tenant.name, 'Maria Lopez');
  const from = '+13105550203';
  await say(from, 'The bathroom faucet will not stop dripping and the handle is loose, it has been going for two days');
  let d = await detail((await ticketFor(from)).id);
  for (let i = 0; i < 3 && !aiSaid(d).some((m) => /full name and the address/i.test(m)); i++) { await say(from, 'Just the bathroom faucet, dripping constantly'); d = await detail(d.id); }
  await say(from, 'This is Maria Lopez, unit 2');
  d = await detail(d.id);
  assert.equal(d.identity_cleared, 1);
  assert.equal(d.tenant?.name, 'Maria Lopez');
});

test('a lockout from someone who is not on file still waits for the PM', async () => {
  const from = '+13105550204';
  await say(from, 'I am locked out of my apartment, lost my keys, please send a locksmith');
  let d = await detail((await ticketFor(from)).id);
  for (let i = 0; i < 3 && !aiSaid(d).some((m) => /full name and the address/i.test(m)); i++) { await say(from, 'Yes I am locked out'); d = await detail(d.id); }
  await say(from, 'I am Sam Poole, unit 9');
  d = await detail(d.id);
  assert.ok(d.flags.some((f) => f.type === 'identity' && !f.resolved), 'held for the PM');
  assert.ok(!d.pending_dispatch);
});

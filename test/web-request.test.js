import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const t = await boot({ twilio: true });
after(() => t.close());
const registry = await import('../server/registry.js');

const post = async (fields) => {
  const res = await fetch(`${t.base}/api/repair-request`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
  return { status: res.status, html: await res.text() };
};
const submit = async (fields) => { const r = await post({ slug: 'test-house-pm', ...fields }); await t.whenIdle(); return r; };
const webTickets = async () => (await t.api('GET', '/inbox')).data.filter((c) => c.channel === 'web');
const detail = async (id) => (await t.api('GET', `/tickets/${id}`)).data;
const sentTexts = () => t.fake.sent.length;

test('setup: a tenant on file, a plumber, and the public page slug', async () => {
  assert.equal((await t.api('POST', '/vendors', { name: 'Pipe Pros', trade: 'plumber', phone: '+13105550888', rate_hourly_cents: 9500, primary_company: 1 })).status, 200);
  await t.api('POST', '/properties', { name: 'Test House', address: '12 Oak St', units: ['2', '9'] });
  const unit = (await t.api('GET', '/units')).data.find((u) => u.property_name === 'Test House' && u.number === '2');
  assert.equal((await t.api('POST', '/tenants', { name: 'Maria Lopez', phone: '+13105550999', unit_id: unit.id })).status, 200);
  registry.setPageSlug('local', 'test-house-pm');
});

test('a matching name and unit are treated as that tenant, the dispatch waits for the PM, and no text is sent', async () => {
  const r = await submit({ name: 'Maria Lopez', unit: '2', description: 'The bathroom faucet will not stop dripping and the handle is loose, it has been going for two days', email: 'maria@example.com' });
  assert.equal(r.status, 200);
  assert.match(r.html, /Your repair request is in/);
  assert.match(r.html, /No text messages will be sent/);
  assert.match(r.html, /call 911 first/);
  const w = await webTickets();
  assert.equal(w.length, 1);
  const d = await detail(w[0].id);
  assert.equal(d.identity_cleared, 0, 'a form match identifies, it never verifies');
  assert.equal(d.tenant?.name, 'Maria Lopez');
  assert.ok(['awaiting_approval', 'dispatch_drafted'].includes(d.status), `status was ${d.status}`);
  assert.ok(d.pending_dispatch, 'a dispatch draft waits for the PM');
  assert.match(d.pending_dispatch.text, /Do NOT enter the unit until our office confirms/, 'entry stays office-confirms while unverified');
  assert.ok(d.messages.some((m) => m.kind === 'note' && /identification, not verification/.test(m.body)), 'the PM is told the match is not verification');
  const aiBodies = d.messages.filter((m) => m.sender === 'ai').map((m) => m.body).join(' ');
  assert.ok(!/text you|reply here|will text/i.test(aiBodies), 'no stored reply promises texting: ' + aiBodies);
  assert.ok(d.messages.some((m) => m.kind === 'note' && /maria@example\.com/.test(m.body)), 'the email is recorded for the PM');
  assert.ok(d.messages.some((m) => m.kind === 'note' && /no text channel/i.test(m.body)), 'the PM is told replies are not delivered');
  assert.equal(sentTexts(), 0, 'nothing was texted');
});

test('a name and unit not on file still reaches the PM with a clear note, and no text is sent', async () => {
  const r = await submit({ name: 'Nobody Known', unit: '9', description: 'The kitchen sink is leaking under the cabinet and the floor is wet, it is a steady drip' });
  assert.equal(r.status, 200);
  const w = await webTickets();
  assert.equal(w.length, 2);
  const d = await detail(w[0].id); // inbox is newest-first
  assert.ok(['awaiting_approval', 'dispatch_drafted'].includes(d.status), `status was ${d.status}`);
  assert.equal(d.identity_cleared, 0, 'unmatched web requester is never identity-cleared');
  assert.ok(d.messages.some((m) => m.kind === 'note' && /not on file|do not match/i.test(m.body)), 'the PM is told the identity did not match');
  assert.match(d.pending_dispatch.text, /Do NOT enter the unit until our office confirms/);
  assert.equal(sentTexts(), 0);
});

test('an unmatched lockout is held for the PM: no dispatch is drafted', async () => {
  const r = await submit({ name: 'Stranger Person', unit: '9', description: 'I am locked out of my apartment and cannot get back inside, my keys are gone' });
  assert.equal(r.status, 200);
  const w = await webTickets();
  assert.equal(w.length, 3);
  const d = await detail(w[0].id);
  assert.equal(d.status, 'triaged', `status was ${d.status}`);
  assert.ok(!d.pending_dispatch, 'no dispatch drafted for an unverified lockout');
  assert.ok(d.flags.some((f) => f.type === 'identity'), 'identity flag raised');
  assert.equal(sentTexts(), 0);
});

test('an emergency submission is flagged immediately and the confirmation page carries the safety wording', async () => {
  const r = await submit({ name: 'Maria Lopez', unit: '2', description: 'I smell gas in my kitchen, it is really strong near the stove and I do not know what to do' });
  assert.equal(r.status, 200);
  assert.match(r.html, /call 911 first/);
  assert.match(r.html, /leave the building and call the gas company from outside/i);
  const w = await webTickets();
  assert.equal(w.length, 4);
  const d = await detail(w[0].id);
  assert.equal(d.urgency, 'emergency');
  assert.ok(d.emergency_at, 'emergency timestamp set');
  assert.equal(sentTexts(), 0);
});

test('the honeypot looks successful but creates nothing', async () => {
  const r = await submit({ name: 'Bot McBotface', unit: '1', description: 'spam spam spam spam spam spam spam spam spam spam', website: 'http://spam.example' });
  assert.equal(r.status, 200);
  assert.match(r.html, /Your repair request is in/);
  assert.equal((await webTickets()).length, 4, 'no ticket for a bot');
});

test('missing or short fields are refused with a clear page', async () => {
  const r = await submit({ name: 'Maria Lopez', unit: '2', description: 'leak' });
  assert.equal(r.status, 400);
  assert.match(r.html, /describe the problem/i);
  assert.equal((await webTickets()).length, 4);
});

test('an unknown page slug is a 404 and creates nothing', async () => {
  const r = await post({ slug: 'no-such-pm', name: 'Maria Lopez', unit: '2', description: 'The bathroom faucet drips all day and all night, it never stops' });
  assert.equal(r.status, 404);
  assert.equal((await webTickets()).length, 4);
});

test('a true double submit is acknowledged without a second work order', async () => {
  const fields = { name: 'Maria Lopez', unit: '2', description: 'The hallway light flickers every evening and the bulb casing feels loose' };
  const first = await submit(fields);
  assert.equal(first.status, 200);
  const again = await submit(fields);
  assert.equal(again.status, 200);
  assert.match(again.html, /already have this exact request/);
  assert.equal((await webTickets()).length, 5, 'one ticket, not two');
  assert.equal(sentTexts(), 0);
});

test('a MATCHED name and unit on a web lockout is still held until the PM confirms identity, then drafts on confirmation', async () => {
  assert.equal((await t.api('POST', '/vendors', { name: 'Rapid Keys', trade: 'locksmith', phone: '+13105550777', rate_hourly_cents: 12000, primary_company: 1 })).status, 200);
  const r = await submit({ name: 'Maria Lopez', unit: '2', description: 'I am locked out of my unit and cannot get back in, my keys are inside on the table' });
  assert.equal(r.status, 200);
  let w = await webTickets();
  const d = await detail(w[0].id);
  assert.equal(d.tenant?.name, 'Maria Lopez', 'the match is linked for the PM to see');
  assert.equal(d.identity_cleared, 0, 'not verified by the form');
  assert.equal(d.status, 'triaged', `status was ${d.status}`);
  assert.ok(!d.pending_dispatch, 'no dispatch drafted for an unverified lockout, even with a matching name');
  assert.ok(d.flags.some((f) => f.type === 'identity' && /anyone can type that/.test(f.reason)), 'flag explains the form proves nothing');
  assert.equal(sentTexts(), 0);
  assert.equal((await t.api('POST', `/tickets/${d.id}/flags/identity`, { action: 'cleared' })).status, 200);
  await t.whenIdle();
  const after = await detail(d.id);
  assert.equal(after.identity_cleared, 1, 'PM confirmation is the verification');
  assert.ok(after.pending_dispatch, 'dispatch drafted only after human confirmation');
  assert.ok(!/Do NOT enter the unit until our office confirms/.test(after.pending_dispatch.text), 'once verified, the vendor may be told entry is arranged');
});

test('a PM message on a web ticket is saved, marked not-delivered once, and sends no text', async () => {
  await submit({ name: 'Marcus Johnson', unit: '2A', description: 'The kitchen sink drain is clogged and water backs up when the tap runs' });
  const w = await webTickets();
  assert.equal((await t.api('POST', `/tickets/${w[0].id}/pm-message`, { body: 'Hi Marcus, your manager here. When works for a plumber?' })).status, 200);
  assert.equal((await t.api('POST', `/tickets/${w[0].id}/pm-message`, { body: 'Also, is weekdays ok?' })).status, 200);
  const d = await detail(w[0].id);
  const notes = d.messages.filter((m) => m.kind === 'note' && m.body.startsWith('Not delivered:'));
  assert.equal(notes.length, 1, 'the not-delivered note is added exactly once');
  assert.equal(sentTexts(), 0);
});

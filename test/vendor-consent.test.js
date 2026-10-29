import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { T } from '../server/templates.js';

const t = await boot({ twilio: true, anthropic: true });
after(() => t.close());

const triage = { language: 'en', category: 'plumbing', urgency: 'routine', urgency_reason: 'No danger.', needs_info: false, reply_to_tenant: 'Lining up a plumber.', reply_english: 'Lining up a plumber.', title: 'Leaking sink', summary: 'Leak.', diagnosis: 'Seal.', next_steps: ['Replace seal'], estimated_cost: 180, access_notes: '', other_language: false, compensation_requested: false, identity_claim: { name: 'Dana Reyes', unit: '4B', address: null } };
const FROM = '+13105550777';

test('approving a dispatch does not text the vendor unless VENDOR_TEXTING=on, and the PM is told to contact them', async () => {
  await t.api('POST', '/vendors', { name: 'Pipe Pros', trade: 'plumber', phone: '+13105550999', primary_company: 1 });
  t.ai.state.respond = (kind) => (kind === 'triage' ? triage : { vendor_id: 1, reasoning: 'Plumber.', text: 'Hi Pipe Pros, leak at 4B. Can you take it?' });
  await t.sms({ From: FROM, Body: 'sink is leaking under the cabinet' });
  await t.whenIdle();
  const inbox = (await t.api('GET', '/inbox')).data.find((x) => x.from_phone === FROM);
  const ticket = (await t.api('GET', `/tickets/${inbox.id}`)).data;
  const d = ticket.pending_dispatch;
  assert.ok(d, 'a draft is waiting');
  const before = t.fake.sent.length;
  assert.equal((await t.api('POST', `/dispatches/${d.id}/approve`, {})).status, 200);
  await t.whenIdle();
  assert.equal(t.fake.sent.filter((m) => m.To === '+13105550999').length, 0, 'the vendor was not texted');
  assert.equal(t.fake.sent.length, before);
  const after_ = (await t.api('GET', `/tickets/${inbox.id}`)).data;
  assert.ok(after_.messages.some((m) => /Vendor texting is off/.test(m.body || '')), JSON.stringify(after_.messages.map((m) => [m.sender, m.body])));
});

test('the HELP reply in every language names Macalisto, gives the support email and says how to stop', () => {
  for (const lang of ['en', 'es', 'ko', 'zh-Hans', 'zh-Hant', 'hy', 'tl', 'vi']) {
    const msg = T.help(lang, 'Hyperion PM');
    assert.match(msg, /^Macalisto[:：․]/, lang);
    assert.match(msg, /efmack@usc\.edu/, lang);
    assert.match(msg, /STOP/, lang);
  }
});

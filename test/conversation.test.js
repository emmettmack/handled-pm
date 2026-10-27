import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const t = await boot({ twilio: true, anthropic: true });
after(() => t.close());

const triageAnswer = (over = {}) => ({
  language: 'en', category: 'plumbing', urgency: 'routine', urgency_reason: 'No danger.', needs_info: false,
  reply_to_tenant: 'I can see the leak under your sink. Lining up a plumber now.', reply_english: 'I can see the leak under your sink. Lining up a plumber now.',
  title: 'Leaking sink trap', summary: 'Sink trap leaking.', diagnosis: 'Worn trap seal.', next_steps: ['Replace seal'], estimated_cost: 180,
  access_notes: 'Tenant to arrange entry', other_language: false, compensation_requested: false, identity_claim: { name: 'Dana Reyes', unit: '4B', address: null }, ...over,
});
const FROM = '+13105550301';
const say = async (body, extra = {}) => { await t.sms({ From: FROM, Body: body, ...extra }); await t.whenIdle(); };
const thread = async () => { const c = (await t.api('GET', '/inbox')).data.find((x) => x.from_phone === FROM); return (await t.api('GET', `/tickets/${c.id}`)).data; };
const said = (d) => d.messages.filter((m) => m.sender === 'ai').map((m) => m.body);

test('setup: a vendor to dispatch to', async () => {
  assert.equal((await t.api('POST', '/vendors', { name: 'Pipe Pros', trade: 'plumber', phone: '+13105550888', primary_company: 1 })).status, 200);
});

test('a photo sent with the text reaches the model, and the reply uses what it says', async () => {
  t.ai.state.respond = (kind) => (kind === 'triage' ? triageAnswer() : { vendor_id: 1, reasoning: 'Plumber.', text: 'Hi Pipe Pros, leak at 4B. Can you take it?' });
  await say('look at this sink', { NumMedia: '1', MediaUrl0: `${t.fake.url}/media/a.jpg`, MediaContentType0: 'image/jpeg' });
  const triageCalls = t.ai.requests.filter((r) => /Read the whole conversation/.test(r.system));
  const withImage = triageCalls.find((r) => Array.isArray(r.messages[0].content) && r.messages[0].content.some((b) => b.type === 'image'));
  assert.ok(withImage, 'an image block was sent to the model');
  assert.equal(withImage.messages[0].content.find((b) => b.type === 'image').source.media_type, 'image/jpeg');
  assert.ok(said(await thread()).some((m) => /leak under your sink/.test(m)));
});

test('later messages get a real, specific reply from the model, not a fixed acknowledgement', async () => {
  const before = t.ai.requests.length;
  t.ai.state.respond = (kind) => (kind === 'reply'
    ? { reply_to_tenant: 'Thanks for the update. A leak that has reached the cabinet floor is worth checking quickly, so I have let the property manager know.', reply_english: 'x', language: 'en', needs_pm: true, note_for_pm: 'Water has reached the cabinet floor.', emergency: false }
    : triageAnswer());
  await say('it is getting worse, the cabinet floor is soaked now');
  const d = await thread();
  assert.ok(t.ai.requests.length > before);
  assert.ok(said(d).at(-1).includes('cabinet floor'), said(d).at(-1));
  assert.ok(d.flags.some((f) => f.type === 'update' && /cabinet floor/.test(f.detail || f.text || f.note || JSON.stringify(f))));
});

test('the money and fault filter still runs on model replies', async () => {
  t.ai.state.respond = (kind) => (kind === 'reply'
    ? { reply_to_tenant: 'We will reimburse you for the damage. A plumber is coming.', reply_english: 'x', language: 'en', needs_pm: false, note_for_pm: '', emergency: false }
    : triageAnswer());
  await say('ok so who pays for the towels I used');
  const last = said(await thread()).at(-1);
  assert.ok(!/reimburse/i.test(last), last);
});

test('a PM who has taken over still silences the model', async () => {
  const d = await thread();
  await t.api('POST', `/tickets/${d.id}/assistant`, { on: false });
  const n = t.ai.requests.length;
  await say('hello? anyone there');
  assert.equal(t.ai.requests.length, n, 'no model call while paused');
});

test('a model that answers in plain words, or needs a second try, still produces a reply', async () => {
  const d = await thread();
  await t.api('POST', `/tickets/${d.id}/assistant`, { on: true });
  // plain prose instead of JSON, every time: the prose itself is used as the reply
  t.ai.state.respond = (kind) => (kind === 'reply' ? 'RAW:Sorry about that. I am here. What would you like to know about the plumber visit?' : triageAnswer());
  await say('why are you not replying to me');
  assert.ok(said(await thread()).at(-1).startsWith('Sorry about that. I am here.'));
  // JSON on the second attempt only
  let calls = 0;
  t.ai.state.respond = (kind) => {
    if (kind !== 'reply') return triageAnswer();
    return ++calls === 1 ? 'RAW:not json' : { reply_to_tenant: 'Second try worked, thanks for waiting.', reply_english: 'x', language: 'en', needs_pm: false, note_for_pm: '', emergency: false };
  };
  await say('let us try again');
  assert.ok(said(await thread()).at(-1).includes('Second try worked'));
});

test('the model is told what to gather, to explain next steps, and the PM-set timing words; dispatch and triage get enough room', async () => {
  const d = await thread();
  await t.api('PUT', '/prefs', { ...(await t.api('GET', '/prefs')).data, timing_routine: 'by end of day tomorrow', timing_urgent: 'within a few hours' });
  t.ai.state.respond = (kind) => (kind === 'triage' ? triageAnswer() : { reply_to_tenant: 'ok', reply_english: 'ok', language: 'en', needs_pm: false, note_for_pm: '', emergency: false });
  t.ai.requests.length = 0;
  await t.api('POST', `/tickets/${d.id}/assistant`, { on: true });
  await t.api('POST', `/tickets/${d.id}/tenant-reply`, { body: 'x' }).catch(() => {});
  await say('the stair is broken, third step from the top');
  const call = t.ai.requests.find((r) => /GATHER WHAT A VENDOR NEEDS/.test(r.system));
  assert.ok(call, 'the gathering rule is in the prompt');
  assert.match(call.system, /NEXT STEPS/);
  const body = JSON.stringify(call.messages);
  assert.match(body, /by end of day tomorrow/);
  assert.match(body, /within a few hours/);
  assert.ok(t.ai.requests.every((r) => r.max_tokens >= 800));
  assert.ok(t.ai.requests.filter((r) => /Choose the best vendor/.test(r.system)).every((r) => r.max_tokens >= 3000));
});

test('when a photo would help and none was sent, the tenant is asked once, with specifics; if not, no photo is demanded', async () => {
  const from2 = '+13105550302';
  const say2 = async (body) => { await t.sms({ From: from2, Body: body }); await t.whenIdle(); };
  const t2 = async () => { const c = (await t.api('GET', '/inbox')).data.find((x) => x.from_phone === from2); return (await t.api('GET', `/tickets/${c.id}`)).data; };
  t.ai.state.respond = (kind) => (kind === 'triage'
    ? triageAnswer({ needs_info: false, photos_helpful: true, photo_request: 'Could you send a wide shot of the stair and a close-up of the broken step? It helps the carpenter bring the right materials. A short description is fine if you cannot.', photo_request_english: 'x', reply_to_tenant: 'Lining up a vendor now.' })
    : { vendor_id: 1, reasoning: 'r', text: 'dispatch text' });
  await say2('the third step on my stairs cracked and is wobbly, been like this since Monday');
  let d = await t2();
  assert.ok(said(d).at(-1).includes('wide shot of the stair'), said(d).at(-1));
  assert.equal(d.status, 'needs_info');
  await say2('I cannot take one right now, the step is about two feet wide and the wood has split along the grain');
  d = await t2();
  assert.ok(!said(d).at(-1).includes('wide shot'), JSON.stringify(d.messages.map((m) => m.sender + ': ' + m.body.slice(0, 70))));
  assert.ok(['awaiting_approval', 'triaged', 'dispatch_drafted'].includes(d.status), d.status);

  // not visible: the model asks for details itself; the code does not force a photo
  const from3 = '+13105550303';
  t.ai.state.respond = (kind) => (kind === 'triage'
    ? triageAnswer({ category: 'HVAC', needs_info: true, photos_helpful: false, reply_to_tenant: 'When does the AC stop cooling, and what does the thermostat show?', photo_request: 'x' })
    : { vendor_id: 1, reasoning: 'r', text: 't' });
  await t.sms({ From: from3, Body: 'my AC is not cooling the apartment at all' }); await t.whenIdle();
  const c3 = (await t.api('GET', '/inbox')).data.find((x) => x.from_phone === from3);
  const d3 = (await t.api('GET', `/tickets/${c3.id}`)).data;
  assert.ok(said(d3).at(-1).includes('thermostat'));
  assert.ok(!/photo/i.test(said(d3).join(' ')));
});

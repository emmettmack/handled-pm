import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIRST_CONTACT, T, brandTenantText } from '../server/templates.js';

const page = (f) => fs.readFileSync(new URL(`../site/${f}`, import.meta.url), 'utf8');
const text = page('text/index.html').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');

test('terms and privacy contain what Twilio and the carriers require', () => {
  const terms = page('terms.html'), privacy = page('privacy.html');
  assert.match(terms, /<strong>STOP<\/strong>/);
  assert.match(terms, /<strong>HELP<\/strong>/);
  assert.match(terms, /Macalisto Repair Request Texts/);
  assert.match(terms, /Message and data rates may apply/);
  assert.match(terms, /Message frequency varies/);
  assert.match(terms, /Carriers are not liable for any delayed or undelivered messages/);
  assert.match(terms, /mailto:efmack@usc\.edu/);
  assert.match(terms, /href="\/privacy\.html"/);
  assert.match(terms, /only sends them to people who have texted a Macalisto number or signed up on the opt-in form first/);
  assert.match(privacy, /We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes/);
  assert.match(privacy, /Macalisto/);
  assert.match(terms, /ticking the consent box on the opt-in form/);
  assert.match(privacy, /we keep a record of your consent/);
  assert.doesNotMatch(terms + privacy, /being added as a tenant or vendor/);
});

test('the public opt-in page shows the registered consent language and the six registered examples, in order', () => {
  assert.ok(text.includes('Text your maintenance request to (805) 909-3422. By texting, you agree to receive text messages from Macalisto about your repair request, such as confirmations, questions, scheduling and updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of any lease or purchase.'));
  const examples = [
    "Macalisto: You're opted in to repair request texts from Macalisto. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.",
    'Macalisto: Got your repair request for Unit 4B at 123 Main St: "Kitchen sink leaking under cabinet". Your property manager has been notified. We may text you questions and updates. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    'Macalisto: Thanks, Maria. Is the leak under the sink still dripping right now? If you can, reply with a photo. A plumber will be scheduled once your property manager approves.',
    "Macalisto: Your property manager approved the repair for Unit 4B. We're finding a time with a repair person and will text you once it's scheduled. Reply STOP to opt out.",
    "Macalisto: Update on your repair request for Unit 4B: Rivera Plumbing is scheduled for 11/04 between 1 and 3 PM. Reply here if that time doesn't work.",
    'Macalisto: Your report of a gas smell at Unit 4B has been marked urgent and sent to your property manager. Leave the unit now and call 911 or the gas company from outside. Do not use light switches or flames.',
  ];
  let at = 0;
  for (const e of examples) { const i = text.indexOf(e, at); assert.ok(i >= at, `missing or out of order: ${e.slice(0, 50)}`); at = i; }
});

test('the app sends the registered wording for the opt-in, HELP, approval and scheduling texts', () => {
  assert.equal(FIRST_CONTACT, examplesFirst());
  assert.equal(T.help('en', 'Any PM'), 'Macalisto: Repair request texts. Help: efmack@usc.edu. Msg & data rates may apply. Reply STOP to opt out.');
  assert.equal(brandTenantText(T.approved('en', 'Unit 4B')), "Macalisto: Your property manager approved the repair for Unit 4B. We're finding a time with a repair person and will text you once it's scheduled. Reply STOP to opt out.");
  assert.equal(brandTenantText(T.scheduled('en', 'Rivera Plumbing', '11/04 between 1 and 3 PM', 'Unit 4B')), "Macalisto: Update on your repair request for Unit 4B: Rivera Plumbing is scheduled for 11/04 between 1 and 3 PM. Reply here if that time doesn't work.");
});
function examplesFirst() { return "Macalisto: You're opted in to repair request texts from Macalisto. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out."; }

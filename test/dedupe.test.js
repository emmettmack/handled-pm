import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMatch, similarity, isAcknowledgement, STILL_BROKEN } from '../server/dedupe.js';

const NOW = Date.parse('2026-03-10T18:00:00Z');
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const ticket = (o = {}) => ({ id: 1, status: 'triaged', category: 'plumbing', resolved_at: null, updated_at: ago(30), messages: [{ sender: 'tenant', body: 'my kitchen sink is leaking under the cabinet', created_at: ago(30) }], ...o });
const run = (text, candidates) => findMatch({ text, now: NOW, candidates });

test('the same words from the same number a few minutes apart are a repeat delivery and dropped', () => {
  const t = ticket({ messages: [{ sender: 'tenant', body: "I'm locked out, lost my keys!", created_at: ago(3) }], category: 'lockout' });
  assert.deepEqual(run("I'm locked out, lost my keys", [t]), { action: 'drop', ticketId: 1 });
});

test('three identical lockout texts end up on one work order', () => {
  const t = ticket({ category: 'lockout', messages: [{ sender: 'tenant', body: "I'm locked out of my apartment, lost my keys. Can someone come open the door today?", created_at: ago(40) }, { sender: 'tenant', body: "I'm locked out of my apartment, lost my keys. Can someone come open the door today?", created_at: ago(20) }] });
  assert.equal(run("I'm locked out of my apartment, lost my keys. Can someone come open the door today?", [t]).action, 'merge');
});

test('same number, same kind of problem, open ticket: merge', () => {
  assert.deepEqual(run('the sink is still leaking, water is on the floor now', [ticket()]), { action: 'merge', ticketId: 1 });
});

test('same number, a different kind of problem: new work order', () => {
  assert.equal(run('my refrigerator stopped cooling and the freezer is thawing', [ticket()]).action, 'new');
});

test('no earlier tickets from this number: new', () => {
  assert.equal(run('my sink is leaking', []).action, 'new');
});

test('a reply while the ticket is waiting on the tenant is always a reply', () => {
  const t = ticket({ status: 'needs_info', category: 'other', messages: [{ sender: 'tenant', body: 'my sink is broken', created_at: ago(500) }] });
  assert.equal(run('the kitchen one', [t]).action, 'merge');
});

test('an unclear message soon after an open ticket merges; much later it is new but flagged as a possible duplicate', () => {
  const soon = ticket({ category: 'other', messages: [{ sender: 'tenant', body: 'something is wrong in the bathroom', created_at: ago(20) }] });
  assert.equal(run('can someone come today please', [soon]).action, 'merge');
  const late = ticket({ category: 'other', messages: [{ sender: 'tenant', body: 'something is wrong in the bathroom', created_at: ago(60 * 20) }] });
  assert.deepEqual(run('can someone come today please', [late]), { action: 'new', possibleDuplicateOf: 1 });
});

test('a short thank-you never makes a new work order', () => {
  for (const msg of ['thanks', 'Ok thank you!', 'gracias', '👍']) assert.ok(isAcknowledgement(msg), msg);
  assert.ok(!isAcknowledgement('thanks but the leak is back and worse'));
  const open = run('ok thanks', [ticket()]);
  assert.equal(open.action, 'append');
  const closed = ticket({ status: 'closed', resolved_at: ago(60 * 24 * 5), updated_at: ago(60 * 24 * 5) });
  assert.equal(run('thank you!', [closed]).action, 'append');
});

test('closed ticket: "it is leaking again" within the window reopens it as a callback', () => {
  const closed = ticket({ status: 'resolved', resolved_at: ago(60 * 20), updated_at: ago(60 * 20) });
  assert.deepEqual(run("the sink is leaking again, same spot", [closed]), { action: 'reopen', ticketId: 1 });
  assert.ok(STILL_BROKEN.test('todavía gotea') && STILL_BROKEN.test("it's not fixed"));
});

test('closed ticket: a different problem inside the window is new, linked to the old one', () => {
  const closed = ticket({ status: 'closed', resolved_at: ago(60 * 5), updated_at: ago(60 * 5) });
  assert.deepEqual(run('the AC is not cooling at all', [closed]), { action: 'new', relatedTo: 1 });
});

test('closed ticket: the same problem after the window is a new work order, linked', () => {
  const closed = ticket({ status: 'closed', resolved_at: ago(60 * 24 * 5), updated_at: ago(60 * 24 * 5) });
  assert.deepEqual(run('my kitchen sink is leaking under the cabinet again', [closed]), { action: 'new', relatedTo: 1 });
});

test('with an open ticket and a recently closed one, the open one wins', () => {
  const closed = ticket({ id: 7, status: 'closed', resolved_at: ago(60), updated_at: ago(60) });
  const open = ticket({ id: 9 });
  assert.equal(run('the sink is leaking again', [closed, open]).ticketId, 9);
});

test('similarity ignores filler words and punctuation', () => {
  assert.ok(similarity('The sink is leaking!!', 'my sink leaking') > 0.5);
  assert.ok(similarity('sink leaking', 'refrigerator warm') < 0.2);
});

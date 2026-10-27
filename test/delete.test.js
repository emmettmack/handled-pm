import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boot, asLocal } from './helpers.js';

const t = await boot({ twilio: true });
after(() => t.close());
const files = await import('../server/files.js');

const text = async (from, body, extra = {}) => { await t.sms({ From: from, Body: body, ...extra }); await t.whenIdle(); };
const inbox = async () => (await t.api('GET', '/inbox')).data;
const idFor = async (from) => (await inbox()).find((c) => c.from_phone === from).id;
const count = (table) => asLocal(t, () => t.mods.db.db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c);

test('deleting chosen conversations removes their messages, history and photo files, and leaves the others alone', async () => {
  await text('+13105550401', 'sink leaking under the cabinet and the floor is getting wet', { NumMedia: '1', MediaUrl0: `${t.fake.url}/media/a.jpg`, MediaContentType0: 'image/jpeg' });
  await text('+13105550402', 'my heater makes a loud banging noise every evening');
  await text('+13105550403', 'the front door lock is sticking and hard to turn');
  const a = await idFor('+13105550401'), b = await idFor('+13105550402'), c = await idFor('+13105550403');
  const photo = (await t.api('GET', `/tickets/${a}`)).data.media[0];
  const onDisk = path.join(files.FILES_DIR, 'local', photo.file);
  assert.ok(fs.existsSync(onDisk));

  const r = await t.api('POST', '/tickets/delete', { ids: [a, b] });
  assert.equal(r.data.deleted, 2);
  assert.deepEqual(r.data.skipped, []);
  assert.ok(!fs.existsSync(onDisk), 'the photo file is gone from disk');
  assert.equal((await t.api('GET', `/tickets/${a}`)).status, 404);
  const remaining = await inbox();
  assert.deepEqual(remaining.map((x) => x.id), [c]);
  assert.equal(await count('media'), 0);
  assert.equal(await count('messages') > 0, true, 'the other conversation keeps its messages');
  assert.equal(asLocal(t, () => t.mods.db.db.prepare('SELECT COUNT(*) c FROM messages WHERE ticket_id IN (?, ?)').get(a, b).c), 0);
});

test('a job a vendor is already working on is skipped and reported, not deleted', async () => {
  const c = (await inbox())[0].id;
  asLocal(t, () => t.mods.store.setStatus(c, 'dispatched', 'test'));
  const r = await t.api('POST', '/tickets/delete', { ids: [c, 999999] });
  assert.equal(r.data.deleted, 0);
  assert.equal(r.data.skipped.length, 1);
  assert.match(r.data.skipped[0].reason, /vendor is already on this job/);
  assert.equal((await t.api('GET', `/tickets/${c}`)).status, 200);
});

test('nothing chosen is refused, junk ids are ignored, and deleting finished jobs also cleans up photos', async () => {
  assert.equal((await t.api('POST', '/tickets/delete', { ids: [] })).status, 400);
  assert.equal((await t.api('POST', '/tickets/delete', { ids: ['x', -1, 1.5] })).status, 400);
  await text('+13105550404', 'water stain on the ceiling is spreading', { NumMedia: '1', MediaUrl0: `${t.fake.url}/media/b.jpg`, MediaContentType0: 'image/jpeg' });
  const d = await idFor('+13105550404');
  const photo = (await t.api('GET', `/tickets/${d}`)).data.media[0];
  const onDisk = path.join(files.FILES_DIR, 'local', photo.file);
  asLocal(t, () => t.mods.store.setStatus(d, 'closed', 'done'));
  assert.equal((await t.api('DELETE', '/tickets/closed')).data.deleted, 1);
  assert.ok(!fs.existsSync(onDisk), 'closing out finished jobs no longer leaves photos behind');
});

test('a retried text for a deleted conversation is still ignored, not turned into a new one', async () => {
  const sid = 'SMretry0001';
  await t.sms({ From: '+13105550405', Body: 'the garage door will not close', MessageSid: sid }); await t.whenIdle();
  const e = await idFor('+13105550405');
  await t.api('POST', '/tickets/delete', { ids: [e] });
  const before = (await inbox()).length;
  await t.sms({ From: '+13105550405', Body: 'the garage door will not close', MessageSid: sid }); await t.whenIdle();
  assert.equal((await inbox()).length, before);
});

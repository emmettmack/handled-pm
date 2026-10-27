import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boot, asLocal } from './helpers.js';

const t = await boot({ twilio: true });
after(() => t.close());
const registry = await import('../server/registry.js');
const files = await import('../server/files.js');

const tenantText = async (from, body, extra = {}) => { const r = await t.sms({ From: from, Body: body, ...extra }); await t.whenIdle(); return r; };
const thread = async (id) => (await t.api('GET', `/tickets/${id}`)).data;

test('signature: unsigned and wrongly signed texts are refused and create nothing', async () => {
  const bad = await t.sms({ From: '+13105550101', Body: 'sink leaking' }, { sign: false });
  assert.equal(bad.status, 403);
  const forged = await t.sms({ From: '+13105550101', Body: 'sink leaking' }, { signature: 'AAAA' });
  assert.equal(forged.status, 403);
  await t.whenIdle();
  assert.equal((await t.api('GET', '/inbox')).data.length, 0);
});

test('routing: a text goes to the account that owns the number it was sent to', async () => {
  registry.assignNumber('+15550002222', 'acct-b');
  await tenantText('+13105550102', 'The kitchen faucet is dripping', { To: '+15550002222' });
  const inB = t.mods.accounts.runAs('acct-b', () => t.mods.db.db.prepare('SELECT COUNT(*) c FROM tickets').get().c);
  assert.equal(inB, 1);
  assert.equal((await t.api('GET', '/inbox')).data.length, 0); // nothing leaked to the local account
});

test('inbox: new threads are unread, newest first, and opening one marks it read', async () => {
  await tenantText('+13105550103', 'My toilet is running nonstop');
  const list = (await t.api('GET', '/inbox')).data;
  assert.equal(list.length, 1);
  assert.equal(list[0].unread, true);
  assert.equal(list[0].ai_paused, false);
  await t.api('POST', `/tickets/${list[0].id}/read`, {});
  assert.equal((await t.api('GET', '/inbox')).data[0].unread, false);
});

test('a PM reply goes from the thread, pauses the assistant, and the assistant stays quiet until handed back', async () => {
  const id = (await t.api('GET', '/inbox')).data[0].id;
  const before = (await thread(id)).messages.filter((m) => m.sender === 'ai').length;
  t.fake.sent.length = 0;
  assert.equal((await t.api('POST', `/tickets/${id}/pm-message`, { body: 'I will call you in ten minutes.' })).status, 200);
  assert.equal((await thread(id)).ai_paused, 1);
  assert.equal(t.fake.sent.at(-1).Body, 'I will call you in ten minutes.');
  assert.equal(t.fake.sent.at(-1).From, '+15550001111');

  await tenantText('+13105550103', 'ok, but it is getting worse');
  const paused = await thread(id);
  assert.equal(paused.messages.filter((m) => m.sender === 'ai').length, before, 'no assistant reply while paused');
  assert.equal(paused.messages.at(-1).sender, 'tenant');
  assert.equal(t.fake.sent.length, 1, 'only the PM text went out');
  assert.equal((await t.api('GET', '/inbox')).data.find((c) => c.id === id).unread, true);

  await t.api('POST', `/tickets/${id}/assistant`, { on: true });
  assert.equal((await thread(id)).ai_paused, 0);
  await tenantText('+13105550103', 'still dripping, any update?');
  assert.ok((await thread(id)).messages.filter((m) => m.sender === 'ai').length > before, 'assistant replies again after hand-back');
});

test('the PM can pause the assistant before replying', async () => {
  const id = (await t.api('GET', '/inbox')).data[0].id;
  await t.api('POST', `/tickets/${id}/assistant`, { on: false });
  assert.equal((await thread(id)).ai_paused, 1);
});

test('a refused text (carrier registration pending, 30034) is logged and shown, not a crash', async () => {
  t.fake.state.failWith = { code: 30034, message: 'Message from an unregistered number' };
  const id = (await t.api('GET', '/inbox')).data[0].id;
  assert.equal((await t.api('POST', `/tickets/${id}/pm-message`, { body: 'Plumber is on the way' })).status, 200);
  await new Promise((r) => setTimeout(r, 100));
  const d = await thread(id);
  const msg = d.messages.find((m) => m.body === 'Plumber is on the way');
  assert.ok(msg, 'saved in the thread');
  assert.equal(msg.delivery_status, 'failed');
  assert.equal(msg.delivery_error, '30034');
  assert.ok(d.messages.some((m) => m.kind === 'note' && /registration still in review/.test(m.body)), 'the PM is told why');
  t.fake.state.failWith = null;
});

test('opt-out: someone who texted STOP is shown as opted out and never texted', async () => {
  await tenantText('+13105550104', 'my heater is out');
  await tenantText('+13105550104', 'STOP');
  const row = (await t.api('GET', '/inbox')).data.find((c) => c.from_phone === '+13105550104');
  assert.equal(row.opted_out, true);
  t.fake.sent.length = 0;
  await t.api('POST', `/tickets/${row.id}/pm-message`, { body: 'checking in' });
  assert.equal(t.fake.sent.length, 0);
});

test('photos from texts are stored as files and served by a signed link that expires or fails if altered', async () => {
  await tenantText('+13105550105', 'water stain on the ceiling', { NumMedia: '1', MediaUrl0: `${t.fake.url}/media/a.jpg`, MediaContentType0: 'image/jpeg' });
  const id = (await t.api('GET', '/inbox')).data.find((c) => c.from_phone === '+13105550105').id;
  const d = await thread(id);
  assert.equal(d.media.length, 1);
  assert.ok(d.media[0].url.startsWith('/f/local/'));
  assert.ok(fs.existsSync(path.join(files.FILES_DIR, 'local', d.media[0].file)));
  const ok = await fetch(`${t.base}${d.media[0].url}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/jpeg');
  assert.equal(Buffer.from(await ok.arrayBuffer()).toString(), 'fake-image-bytes');
  const altered = d.media[0].url.replace(/sig=(.)/, (_, c) => `sig=${c === '0' ? '1' : '0'}`); // always a different first character
  assert.equal((await fetch(`${t.base}${altered}`)).status, 403);
  assert.equal((await fetch(`${t.base}/f/local/${d.media[0].id}`)).status, 403);
  const raw = asLocal(t, () => t.mods.db.db.prepare('SELECT url FROM media WHERE id = ?').get(d.media[0].id));
  assert.equal(raw.url, '', 'no photo bytes left in the database');
});

test('old photos stored inside the database are moved to files once, and none are lost', async () => {
  const id = (await t.api('GET', '/inbox')).data[0].id;
  const dataUrl = `data:image/png;base64,${Buffer.from('legacy-bytes').toString('base64')}`;
  const mid = asLocal(t, () => t.mods.db.db.prepare("INSERT INTO media (ticket_id, kind, name, url, source, created_at) VALUES (?, 'photo', 'old.png', ?, 'text', ?)").run(id, dataUrl, new Date().toISOString()).lastInsertRowid);
  assert.ok(asLocal(t, () => files.moveLegacyMedia()) >= 1);
  assert.equal(asLocal(t, () => files.moveLegacyMedia()), 0, 'second run does nothing');
  const m = (await thread(id)).media.find((x) => x.id === mid);
  assert.equal(Buffer.from(await (await fetch(`${t.base}${m.url}`)).arrayBuffer()).toString(), 'legacy-bytes');
});

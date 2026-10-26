import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const t = await boot();
after(() => t.close());

test('the server starts, is healthy, and a new real account starts empty', async () => {
  assert.equal((await fetch(`${t.base}/healthz`)).status, 200);
  const status = await t.api('GET', '/status');
  assert.equal(status.data.demo, false);
  const dash = await t.api('GET', '/dashboard');
  assert.equal(dash.data.tickets.length, 0);
});

test('demo-only routes are refused in a real account', async () => {
  for (const p of ['/demo/reset', '/simulate/incoming']) assert.equal((await t.api('POST', p, {})).status, 403);
});

test('upgrading an existing database leaves a copy of the old file first', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const Database = (await import('better-sqlite3')).default;
  // an account file from before migrations existed, with real-looking data in it
  fs.mkdirSync(path.join(t.dir, 'accounts'), { recursive: true });
  const file = path.join(t.dir, 'accounts', 'acct_old.db');
  const old = new Database(file);
  old.exec(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'schema-current.sql'), 'utf8'));
  old.prepare("INSERT INTO company (id, name, pm_name) VALUES (1, 'Old Co', 'Pat')").run();
  old.close();
  const name = t.mods.accounts.runAs('acct_old', () => t.mods.store.getCompany().name);
  assert.equal(name, 'Old Co');
  assert.ok(fs.readdirSync(path.join(t.dir, 'accounts')).some((f) => f.includes('.pre-v') && f.endsWith('.bak')), 'pre-migration copy exists');
});

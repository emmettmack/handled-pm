import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { applyMigrations, pendingMigrations, schemaVersion, MIGRATIONS } from '../server/migrations/index.js';
import { REGISTRY_MIGRATIONS } from '../server/migrations/registry.js';

const fixture = (name) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');
const cols = (d, t) => d.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

test('a brand-new database gets every migration and records them', () => {
  const d = new Database(':memory:');
  applyMigrations(d);
  assert.equal(schemaVersion(d), MIGRATIONS.at(-1).id);
  assert.equal(pendingMigrations(d).length, 0);
  assert.ok(cols(d, 'tickets').includes('cost_estimate'));
});

test('running migrations twice changes nothing', () => {
  const d = new Database(':memory:');
  applyMigrations(d);
  const before = d.prepare("SELECT COUNT(*) c FROM sqlite_master").get().c;
  applyMigrations(d);
  assert.equal(d.prepare("SELECT COUNT(*) c FROM sqlite_master").get().c, before);
  assert.equal(d.prepare('SELECT COUNT(*) c FROM schema_version').get().c, MIGRATIONS.length);
});

for (const name of ['schema-current.sql', 'schema-oldest.sql']) {
  test(`${name}: an existing database keeps its data and is upgraded`, () => {
    const d = new Database(':memory:');
    d.exec(fixture(name)); // the schema as it was before migrations existed
    d.prepare("INSERT INTO company (id, name, pm_name) VALUES (1, 'Acme Rentals', 'Pat Doe')").run();
    d.prepare("INSERT INTO vendors (name, trade, phone, rate) VALUES ('Rivera Plumbing', 'plumber', '(323) 555-0201', '$95/hr')").run();
    d.prepare("INSERT INTO tickets (title, status) VALUES ('Leaking sink', 'triaged')").run();
    applyMigrations(d);
    assert.equal(d.prepare('SELECT name FROM company').get().name, 'Acme Rentals');
    assert.equal(d.prepare('SELECT rate FROM vendors').get().rate, '$95/hr');
    assert.equal(d.prepare('SELECT title FROM tickets').get().title, 'Leaking sink');
    for (const c of ['personal_phone', 'primary_company', 'primary_personal', 'primary_email']) assert.ok(cols(d, 'vendors').includes(c), `vendors.${c}`);
    assert.ok(cols(d, 'properties').includes('company'));
  });
}

test('a failing migration rolls back completely and reports which one', () => {
  const d = new Database(':memory:');
  const list = [{ id: 1, name: 'ok', up: (x) => x.exec('CREATE TABLE a (x)') }, { id: 2, name: 'bad', up: (x) => { x.exec('CREATE TABLE b (x)'); throw new Error('boom'); } }];
  assert.throws(() => applyMigrations(d, list), /Migration 2 \(bad\) failed: boom/);
  assert.equal(schemaVersion(d), 1);
  assert.equal(d.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name = 'b'").get().c, 0);
});

test('the registry database migrates too', () => {
  const d = new Database(':memory:');
  applyMigrations(d, REGISTRY_MIGRATIONS);
  assert.ok(d.prepare("SELECT 1 FROM sqlite_master WHERE name = 'numbers'").get());
});

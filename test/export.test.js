import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { toCsv, workOrderSummary } from '../client/src/csv.js';

const t = await boot({ twilio: true });
after(() => t.close());

test('the spreadsheet is safe to open: quotes, commas and newlines survive, formulas are defused, Excel gets a BOM', () => {
  const csv = toCsv([{ work_order: 7, issue: 'Sink, "leaking"\nbadly', summary: '=HYPERLINK("http://evil")', tenant: '+15551234567', estimate_usd: 180 }]);
  assert.ok(csv.startsWith('﻿Work order #'));
  assert.ok(csv.includes('"Sink, ""leaking""\nbadly"'));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`), csv);
  assert.ok(csv.includes('7,'));
});

test('export rows: finished jobs by default, private notes never included, date range respected', async () => {
  await t.api('POST', '/properties', { name: 'Oak House', address: '12 Oak St', units: ['1'] });
  const unit = (await t.api('GET', '/units')).data[0];
  await t.api('POST', '/tenants', { name: 'Maria Lopez', phone: '+13105550999', unit_id: unit.id });
  await t.api('POST', '/vendors', { name: 'Pipe Pros', trade: 'plumber', phone: '+13105550888', primary_company: 1 });
  await t.sms({ From: '+13105550999', Body: 'The kitchen sink is leaking under the cabinet and the floor is wet' });
  await t.whenIdle();
  const id = (await t.api('GET', '/inbox')).data[0].id;
  await t.api('POST', `/tickets/${id}/notes`, { notes: 'PRIVATE: tenant is difficult' });

  let r = await t.api('POST', '/export/work-orders', {});
  assert.deepEqual(r.data, [], 'open jobs are not in the finished export');

  r = await t.api('POST', '/export/work-orders', { scope: 'all' });
  assert.equal(r.data.length, 1);
  const row = r.data[0];
  assert.equal(row.property, 'Oak House');
  assert.equal(row.unit, '1');
  assert.equal(row.tenant, 'Maria Lopez');
  assert.ok(!JSON.stringify(row).includes('PRIVATE'));

  await t.api('POST', `/tickets/${id}/status`, { status: 'closed' }).catch(() => {});
  await t.mods.accounts.runAs('local', () => t.mods.store.setStatus(id, 'closed', 'done'));
  r = await t.api('POST', '/export/work-orders', { scope: 'closed', from: '2000-01-01', to: '2100-01-01' });
  assert.equal(r.data.length, 1);
  assert.ok(r.data[0].closed);
  r = await t.api('POST', '/export/work-orders', { scope: 'closed', from: '2000-01-01', to: '2000-12-31' });
  assert.equal(r.data.length, 0, 'outside the range');
});

test('the copy-ready summary has the facts and leaves out private notes', () => {
  const text = workOrderSummary({ id: 4, title: 'Leaking sink', status: 'closed', urgency: 'urgent', summary: 'Trap leaking.', tenant: { name: 'Maria', phone: '+1310' }, vendor: { name: 'Pipe Pros', phone: '+1311' }, cost_estimate: 180, view: { estimateLabel: 'AI estimate, not a quote' }, created_at: '2026-10-01T00:00:00Z', resolved_at: '2026-10-03T00:00:00Z', internal_notes: 'PRIVATE' }, 'Unit 1 · Oak House');
  assert.match(text, /Work order #4: Leaking sink/);
  assert.match(text, /Estimate: \$180 \(AI estimate, not a quote\)/);
  assert.ok(!text.includes('PRIVATE'));
});

// Forward-only schema migrations. Each migration has an increasing id and runs once per database, inside a
// transaction, and is recorded in schema_version. Nothing here may drop or rewrite real data: add columns and
// tables, backfill, and keep old columns for at least one release. Portable: the browser demo runs these too.
import baseline, { SCHEMA } from './001_baseline.js';
import dedupe from './002_dedupe.js';
import estimateSource from './003_estimate_source.js';
import companyName from './004_company_name.js';
import vendorRates from './005_vendor_rates_language.js';
import smsCompliance from './006_sms_compliance.js';
import inbox from './007_inbox.js';
import photoAsked from './008_photo_asked.js';
import smsDisclosure from './009_sms_disclosure.js';

export { SCHEMA };
export const MIGRATIONS = [baseline, dedupe, estimateSource, companyName, vendorRates, smsCompliance, inbox, photoAsked, smsDisclosure];

const ensureTable = (d) => d.exec('CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)');

export function pendingMigrations(d, list = MIGRATIONS) {
  ensureTable(d);
  const done = new Set(d.prepare('SELECT id FROM schema_version').all().map((r) => r.id));
  return list.filter((m) => !done.has(m.id));
}

export const schemaVersion = (d) => { ensureTable(d); return d.prepare('SELECT MAX(id) v FROM schema_version').get().v || 0; };

export function applyMigrations(d, list = MIGRATIONS) {
  for (const m of pendingMigrations(d, list)) {
    d.exec('BEGIN');
    try {
      m.up(d);
      d.prepare('INSERT INTO schema_version (id, name, applied_at) VALUES (?,?,?)').run(m.id, m.name, new Date().toISOString());
      d.exec('COMMIT');
    } catch (e) {
      d.exec('ROLLBACK');
      throw new Error(`Migration ${m.id} (${m.name}) failed: ${e.message}`);
    }
  }
}

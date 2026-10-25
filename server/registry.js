// Things that belong to the whole service, not to one account: which Twilio number belongs to which account,
// daily usage counters, an audit log of admin actions, and site-wide settings. Kept in its own small database.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';
import { applyMigrations } from './migrations/index.js';
import { REGISTRY_MIGRATIONS } from './migrations/registry.js';

let reg;
function r() {
  if (reg) return reg;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  reg = new Database(path.join(DATA_DIR, 'registry.db'));
  reg.pragma('journal_mode = WAL');
  applyMigrations(reg, REGISTRY_MIGRATIONS);
  return reg;
}
export const registryFile = () => path.join(DATA_DIR, 'registry.db');
export const backupRegistry = (dest) => r().backup(dest);

const today = () => new Date().toISOString().slice(0, 10);
const normNumber = (n) => { const d = String(n || '').replace(/\D/g, ''); return d.length >= 10 ? `+1${d.slice(-10)}` : String(n || '').trim(); };

// ---- numbers ----
export const numberOwner = (number) => r().prepare('SELECT account_id FROM numbers WHERE number = ?').get(normNumber(number))?.account_id || null;
export const listNumbers = () => r().prepare('SELECT * FROM numbers ORDER BY created_at').all();
export function assignNumber(number, accountId, label = '') {
  const n = normNumber(number);
  if (n.replace(/\D/g, '').length < 10) throw Object.assign(new Error('Enter the full phone number, like +18055550100.'), { status: 400 });
  r().prepare('INSERT INTO numbers (number, account_id, label, created_at) VALUES (?,?,?,?) ON CONFLICT(number) DO UPDATE SET account_id = excluded.account_id, label = excluded.label')
    .run(n, accountId, String(label || ''), new Date().toISOString());
  return n;
}
export const unassignNumber = (number) => r().prepare('DELETE FROM numbers WHERE number = ?').run(normNumber(number)).changes;
export const unassignAccount = (accountId) => r().prepare('DELETE FROM numbers WHERE account_id = ?').run(accountId).changes;

// ---- usage counters ----
export const bumpMetric = (accountId, key, n = 1) => r().prepare(
  'INSERT INTO metrics (account_id, day, key, n) VALUES (?,?,?,?) ON CONFLICT(account_id, day, key) DO UPDATE SET n = n + excluded.n',
).run(accountId, today(), key, n);
const since = (days) => new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
export const metricsForAccount = (accountId, days = 30) => Object.fromEntries(
  r().prepare('SELECT key, SUM(n) n FROM metrics WHERE account_id = ? AND day >= ? GROUP BY key').all(accountId, since(days)).map((x) => [x.key, x.n]));
export const metricsTotals = (days = 30) => Object.fromEntries(r().prepare('SELECT key, SUM(n) n FROM metrics WHERE day >= ? GROUP BY key').all(since(days)).map((x) => [x.key, x.n]));
export const metricsByDay = (days = 14) => r().prepare('SELECT day, key, SUM(n) n FROM metrics WHERE day >= ? GROUP BY day, key ORDER BY day').all(since(days));

// ---- audit log ----
export const logAudit = (admin, action, target = '', detail = '') => r().prepare('INSERT INTO audit (at, admin, action, target, detail) VALUES (?,?,?,?,?)').run(new Date().toISOString(), admin, action, String(target), String(detail));
export const listAudit = (limit = 100) => r().prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit);

// ---- site-wide settings ----
export const getKv = (key, fallback = null) => { const v = r().prepare('SELECT value FROM kv WHERE key = ?').get(key)?.value; return v ? JSON.parse(v) : fallback; };
export const setKv = (key, value) => r().prepare('INSERT INTO kv (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));

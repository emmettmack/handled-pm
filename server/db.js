import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { currentAccount, LOCAL_ACCOUNT } from './accounts.js';
import { isDemo } from './mode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LOCAL_FILE = process.env.DB_PATH || path.join(DATA_DIR, 'handled.db');

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS company (
  id INTEGER PRIMARY KEY, name TEXT, pm_name TEXT, phone TEXT, email TEXT, address TEXT, maintenance_line TEXT
);
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, trade TEXT NOT NULL,
  phone TEXT, email TEXT, rate TEXT, preferred INTEGER DEFAULT 0, notes TEXT, active INTEGER DEFAULT 1,
  personal_phone TEXT DEFAULT '', primary_company INTEGER DEFAULT 1, primary_personal INTEGER DEFAULT 0, primary_email INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, address TEXT, neighborhood TEXT,
  owner_name TEXT, owner_email TEXT, approval_limit INTEGER DEFAULT 500, company TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT, property_id INTEGER REFERENCES properties(id), number TEXT
);
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, unit_id INTEGER REFERENCES units(id),
  language TEXT DEFAULT 'en'
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER, unit_id INTEGER, from_phone TEXT, channel TEXT DEFAULT 'sms',
  title TEXT DEFAULT 'New text', category TEXT DEFAULT 'other', urgency TEXT DEFAULT 'routine',
  status TEXT DEFAULT 'new', language TEXT DEFAULT 'en',
  summary TEXT, diagnosis TEXT, next_steps TEXT DEFAULT '[]', reasoning TEXT,
  trade TEXT, access_notes TEXT, cost_estimate INTEGER, internal_notes TEXT DEFAULT '',
  followup_rounds INTEGER DEFAULT 0, verified INTEGER DEFAULT 0, verification_asked INTEGER DEFAULT 0,
  identity_cleared INTEGER DEFAULT 0, vendor_id INTEGER,
  emergency_ack INTEGER DEFAULT 0, emergency_at TEXT,
  scheduled_for TEXT, flags TEXT DEFAULT '[]',
  created_at TEXT, updated_at TEXT, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS dispatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER REFERENCES tickets(id), vendor_id INTEGER,
  kind TEXT DEFAULT 'vendor', text TEXT, reasoning TEXT, state TEXT DEFAULT 'pending',
  pm_note TEXT, edited INTEGER DEFAULT 0, created_at TEXT, decided_at TEXT, response_due_at TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER REFERENCES tickets(id),
  sender TEXT, body TEXT, kind TEXT DEFAULT 'sms', created_at TEXT
);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER REFERENCES tickets(id),
  kind TEXT DEFAULT 'photo', name TEXT, url TEXT, source TEXT DEFAULT 'text', created_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER REFERENCES tickets(id),
  status TEXT, note TEXT, created_at TEXT
);
`;

// Databases created before a column existed get it added here (CREATE TABLE IF NOT EXISTS won't).
function migrate(d) {
  d.exec(SCHEMA);
  const ensureColumn = (table, name, def) => {
    if (!d.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  };
  ensureColumn('vendors', 'personal_phone', "TEXT DEFAULT ''");
  ensureColumn('vendors', 'primary_company', 'INTEGER DEFAULT 1');
  ensureColumn('vendors', 'primary_personal', 'INTEGER DEFAULT 0');
  ensureColumn('vendors', 'primary_email', 'INTEGER DEFAULT 0');
  ensureColumn('properties', 'company', "TEXT DEFAULT ''");
}

const open = new Map();

/** Each account has its own SQLite file: DATA_DIR/accounts/<id>.db. The local dev account keeps the original file. */
function forAccount(id) {
  if (open.has(id)) return open.get(id);
  if (id !== LOCAL_ACCOUNT && !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid account id');
  const file = id === LOCAL_ACCOUNT ? LOCAL_FILE : path.join(DATA_DIR, 'accounts', `${id}.db`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new Database(file);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  migrate(d);
  // A brand-new real account starts empty, with a blank company profile to fill in under Preferences.
  if ((id !== LOCAL_ACCOUNT || !isDemo()) && !d.prepare('SELECT 1 FROM company').get()) {
    d.prepare("INSERT INTO company (id, name, pm_name, phone, email, address, maintenance_line) VALUES (1, 'My rentals', 'You', '', '', '', '')").run();
  }
  open.set(id, d);
  return d;
}

/** Same surface as a better-sqlite3 database, but always the current request's account. */
export const db = new Proxy({}, {
  get(_, key) {
    const d = forAccount(currentAccount());
    const v = d[key];
    return typeof v === 'function' ? v.bind(d) : v;
  },
});

/** Every account that has a database on disk (used by background timers). */
export function accountIds() {
  const dir = path.join(DATA_DIR, 'accounts');
  const ids = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.db')).map((f) => f.slice(0, -3)) : [];
  return fs.existsSync(LOCAL_FILE) ? [LOCAL_ACCOUNT, ...ids] : ids;
}

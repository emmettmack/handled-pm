import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { currentAccount, LOCAL_ACCOUNT } from './accounts.js';
import { isDemo } from './mode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LOCAL_FILE = process.env.DB_PATH || path.join(DATA_DIR, 'handled.db');

import { applyMigrations, pendingMigrations, MIGRATIONS, SCHEMA } from './migrations/index.js';
export { SCHEMA };

/** Bring a database up to date. An existing file is copied first, so a bad migration can always be undone. */
function migrate(d, file, existed) {
  const pending = pendingMigrations(d);
  if (!pending.length) return;
  if (existed) {
    d.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(file, `${file}.pre-v${MIGRATIONS.at(-1).id}.bak`);
  }
  applyMigrations(d);
}

const open = new Map();

/** Each account has its own SQLite file: DATA_DIR/accounts/<id>.db. The local dev account keeps the original file. */
function forAccount(id) {
  if (open.has(id)) return open.get(id);
  if (id !== LOCAL_ACCOUNT && !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid account id');
  const file = id === LOCAL_ACCOUNT ? LOCAL_FILE : path.join(DATA_DIR, 'accounts', `${id}.db`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existed = fs.existsSync(file) && fs.statSync(file).size > 0;
  const d = new Database(file);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  migrate(d, file, existed);
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

// ---------- helpers for the admin tools ----------
export const accountFile = (id) => (id === LOCAL_ACCOUNT ? LOCAL_FILE : path.join(DATA_DIR, 'accounts', `${id}.db`));
export const accountExists = (id) => fs.existsSync(accountFile(id));
export const rawDb = (id) => forAccount(id);

/** Close and forget an account's database handle (before deleting its files). */
export function closeAccount(id) {
  open.get(id)?.close();
  open.delete(id);
}

/** A consistent copy of every account's database into `dir` (SQLite's own online backup, safe while the app runs). */
export async function backupAll(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const done = [];
  for (const id of accountIds()) {
    await forAccount(id).backup(path.join(dir, `${id}.db`));
    done.push(id);
  }
  return done;
}

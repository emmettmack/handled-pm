// Migrations for registry.db (things that belong to the whole service, not to one account).
export const REGISTRY_MIGRATIONS = [
  {
    id: 1,
    name: 'baseline',
    up(d) {
      d.exec(`
        CREATE TABLE IF NOT EXISTS numbers (number TEXT PRIMARY KEY, account_id TEXT NOT NULL, label TEXT DEFAULT '', created_at TEXT);
        CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, admin TEXT, action TEXT, target TEXT, detail TEXT);
        CREATE TABLE IF NOT EXISTS metrics (account_id TEXT, day TEXT, key TEXT, n INTEGER DEFAULT 0, PRIMARY KEY (account_id, day, key));
        CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
      `);
    },
  },
];

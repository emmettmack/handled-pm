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
  {
    id: 2,
    name: 'public_pages',
    up(d) {
      d.exec(`CREATE TABLE IF NOT EXISTS public_pages (slug TEXT PRIMARY KEY, account_id TEXT NOT NULL UNIQUE, created_at TEXT);`);
    },
  },
  {
    id: 3,
    name: 'sms_consents',
    up(d) {
      // One row per web-form opt-in: who agreed, to exactly what words, from which page, and when. This is the proof of consent.
      d.exec(`
        CREATE TABLE IF NOT EXISTS sms_consents (
          id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'tenant', account_id TEXT, slug TEXT,
          consent_text TEXT NOT NULL, page_url TEXT, ip TEXT, user_agent TEXT, created_at TEXT NOT NULL, confirmation_sid TEXT, confirmation_error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sms_consents_phone ON sms_consents (phone, created_at);
      `);
    },
  },
];

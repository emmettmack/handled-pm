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

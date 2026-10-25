export const hasColumn = (d, table, name) => d.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name);
export const ensureColumn = (d, table, name, def) => { if (!hasColumn(d, table, name)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`); };

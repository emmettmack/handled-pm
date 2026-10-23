// Browser stand-in for server/db.js: the same prepare/run/all/get/exec surface, backed by sql.js (SQLite in WebAssembly).
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

const SQL = await initSqlJs({ locateFile: () => wasmUrl });
const raw = new SQL.Database();
raw.run('PRAGMA foreign_keys = ON');

const scalar = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
// Positional values pass through; a single object means named parameters (@name in the SQL), which sql.js wants prefixed.
const bindable = (args) => {
  if (args.length === 1 && args[0] && typeof args[0] === 'object') {
    return Object.fromEntries(Object.entries(args[0]).map(([k, v]) => ['@' + k, scalar(v)]));
  }
  return args.map(scalar);
};

export const db = {
  pragma() {},
  exec(sql) { raw.run(sql); },
  prepare(sql) {
    return {
      run(...args) {
        const st = raw.prepare(sql);
        st.run(bindable(args));
        st.free();
        return { changes: raw.getRowsModified(), lastInsertRowid: raw.exec('SELECT last_insert_rowid()')[0].values[0][0] };
      },
      all(...args) {
        const st = raw.prepare(sql);
        st.bind(bindable(args));
        const rows = [];
        while (st.step()) rows.push(st.getAsObject());
        st.free();
        return rows;
      },
      get(...args) { return this.all(...args)[0]; },
    };
  },
};

export const SCHEMA = '';
export const accountIds = () => ['local'];

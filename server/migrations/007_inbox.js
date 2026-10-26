// Migration 7: the PM inbox. A thread can be taken over by the PM (the assistant stops replying until it is handed back),
// the PM's last-read time gives the unread dot, each message records its direction, and photos can live in files
// instead of inside the database (media.file; the old data-URL column is kept and moved by a startup step, never dropped here).
import { ensureColumn } from './util.js';

export default {
  id: 7,
  name: 'inbox',
  up(d) {
    ensureColumn(d, 'tickets', 'ai_paused', 'INTEGER DEFAULT 0');
    ensureColumn(d, 'tickets', 'pm_read_at', 'TEXT');
    ensureColumn(d, 'messages', 'direction', 'TEXT');
    d.exec("UPDATE messages SET direction = CASE WHEN sender = 'tenant' THEN 'in' ELSE 'out' END WHERE direction IS NULL AND kind = 'sms'");
    ensureColumn(d, 'media', 'file', 'TEXT');
    ensureColumn(d, 'media', 'mime', 'TEXT');
    // Everything that exists today counts as already read, so the first inbox doesn't open with every old thread unread.
    d.exec("UPDATE tickets SET pm_read_at = updated_at WHERE pm_read_at IS NULL");
  },
};

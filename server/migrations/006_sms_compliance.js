// Migration 6: texting rules carriers require. People who text STOP are remembered and never texted again until they
// text START, and each outgoing message records the carrier's id and delivery result.
import { ensureColumn } from './util.js';

export default {
  id: 6,
  name: 'sms_compliance',
  up(d) {
    d.exec("CREATE TABLE IF NOT EXISTS opt_outs (phone TEXT PRIMARY KEY, opted_out_at TEXT, source TEXT DEFAULT 'text')");
    ensureColumn(d, 'messages', 'provider_sid', 'TEXT');
    ensureColumn(d, 'messages', 'delivery_status', 'TEXT');
    ensureColumn(d, 'messages', 'delivery_error', 'TEXT');
    d.exec('CREATE INDEX IF NOT EXISTS idx_messages_sid ON messages(provider_sid)');
  },
};

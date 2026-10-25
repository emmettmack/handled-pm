// Migration 2: duplicate-text protection. Every provider message id is remembered so a text Twilio delivers twice is
// handled once, and a work order can point at the earlier one it relates to.
import { ensureColumn } from './util.js';

export default {
  id: 2,
  name: 'dedupe',
  up(d) {
    d.exec('CREATE TABLE IF NOT EXISTS inbound_messages (provider_sid TEXT PRIMARY KEY, ticket_id INTEGER, received_at TEXT)');
    ensureColumn(d, 'tickets', 'related_to', 'INTEGER');
    d.exec('CREATE INDEX IF NOT EXISTS idx_tickets_phone ON tickets(from_phone)');
  },
};

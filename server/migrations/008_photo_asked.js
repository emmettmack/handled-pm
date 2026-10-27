// Migration 8: remember that the tenant was already asked for photos, so they are asked once and not on every reply.
import { ensureColumn } from './util.js';

export default {
  id: 8,
  name: 'photo_asked',
  up(d) {
    ensureColumn(d, 'tickets', 'photo_asked', 'INTEGER DEFAULT 0');
  },
};

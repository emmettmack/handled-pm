// Migration 3: remember where a cost estimate came from, so the PM can tell an AI guess from a vendor quote.
import { ensureColumn } from './util.js';

export default {
  id: 3,
  name: 'estimate_source',
  up(d) {
    ensureColumn(d, 'tickets', 'cost_estimate_source', 'TEXT');
    // existing estimates were produced by the AI (or the demo's sample rules): label them honestly
    d.exec("UPDATE tickets SET cost_estimate_source = 'ai_model' WHERE cost_estimate IS NOT NULL AND cost_estimate_source IS NULL");
  },
};

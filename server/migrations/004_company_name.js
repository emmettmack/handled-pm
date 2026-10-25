// Migration 4: a company name only reaches vendors once the user has typed and confirmed it.
// Every existing account starts unconfirmed, so drafts use the person's name until they confirm (a banner asks them to).
import { ensureColumn } from './util.js';

export default {
  id: 4,
  name: 'company_name_confirmed',
  up(d) {
    ensureColumn(d, 'company', 'name_confirmed', 'INTEGER DEFAULT 0');
  },
};

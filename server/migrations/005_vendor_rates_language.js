// Migration 5: structured vendor pricing (cents, three optional fields) and the language to write to each vendor in.
// The old free-text `rate` column is kept (it now holds the formatted display text).
import { ensureColumn } from './util.js';
import { backfillVendorRates } from '../rates.js';

export default {
  id: 5,
  name: 'vendor_rates_language',
  up(d) {
    ensureColumn(d, 'vendors', 'rate_hourly_cents', 'INTEGER');
    ensureColumn(d, 'vendors', 'rate_flat_cents', 'INTEGER');
    ensureColumn(d, 'vendors', 'rate_trip_cents', 'INTEGER');
    ensureColumn(d, 'vendors', 'rate_notes', "TEXT DEFAULT ''");
    ensureColumn(d, 'vendors', 'language', "TEXT DEFAULT 'en'");
    backfillVendorRates(d);
  },
};

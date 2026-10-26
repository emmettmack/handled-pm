// Vendor pricing. Stored as whole cents in three optional fields because real pricing mixes them:
// "$65 diagnostic + $90/hr" is a trip charge of 6500 plus an hourly rate of 9000.
export const MIN_RATE_CENTS = 100;       // $1
export const MAX_RATE_CENTS = 1_000_000; // $10,000

const money = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** "$180 per hour", "$140 flat", "$65 trip charge + $90 per hour". Falls back to older free text if nothing structured is set. */
export function formatRate(v = {}) {
  const parts = [];
  if (v.rate_trip_cents) parts.push(`${money(v.rate_trip_cents)} trip charge`);
  if (v.rate_flat_cents) parts.push(`${money(v.rate_flat_cents)} flat`);
  if (v.rate_hourly_cents) parts.push(`${money(v.rate_hourly_cents)} per hour`);
  return parts.length ? parts.join(' + ') : String(v.rate || '');
}

/** Returns null when valid, or a plain-language problem. Empty is fine: every field is optional. */
export function validateCents(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n)) return `${label} must be a dollar amount with at most two decimals.`;
  if (n < MIN_RATE_CENTS || n > MAX_RATE_CENTS) return `${label} must be between $1 and $10,000.`;
  return null;
}

/** Best-effort read of the old free-text rate. Anything it can't read confidently is kept as a note instead. */
export function parseLegacyRate(text) {
  const t = String(text || '').trim();
  const out = { hourly: null, flat: null, trip: null, notes: '' };
  if (!t) return out;
  const cents = (s) => Math.round(parseFloat(s) * 100);
  const take = (re) => { const m = t.match(re); return m ? cents(m[1]) : null; };
  out.hourly = take(/\$?\s*(\d+(?:\.\d+)?)\s*(?:\/\s*h(?:ou)?r|per\s*hour|an\s*hour|hourly)/i);
  out.flat = take(/\$?\s*(\d+(?:\.\d+)?)\s*(?:flat)/i);
  out.trip = take(/\$?\s*(\d+(?:\.\d+)?)\s*(?:diagnostic|trip|call[- ]?out|service call)/i);
  if (out.hourly === null && out.flat === null && out.trip === null) out.notes = t; // could not tell what the number means
  return out;
}

/** Fill the structured fields from old free text, only where nothing structured exists yet. */
export function backfillVendorRates(d) {
  const rows = d.prepare("SELECT id, rate FROM vendors WHERE rate_hourly_cents IS NULL AND rate_flat_cents IS NULL AND rate_trip_cents IS NULL AND rate IS NOT NULL AND rate != ''").all();
  const update = d.prepare('UPDATE vendors SET rate_hourly_cents = ?, rate_flat_cents = ?, rate_trip_cents = ?, rate_notes = ?, rate = ? WHERE id = ?');
  for (const r of rows) {
    const p = parseLegacyRate(r.rate);
    // when the old text was understood, show it in the standard wording; otherwise leave it exactly as it was
    const shown = p.hourly || p.flat || p.trip ? formatRate({ rate_hourly_cents: p.hourly, rate_flat_cents: p.flat, rate_trip_cents: p.trip }) : r.rate;
    update.run(p.hourly, p.flat, p.trip, p.notes || r.rate, shown, r.id); // the original wording is always kept in the notes
  }
}

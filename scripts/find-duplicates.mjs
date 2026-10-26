// Lists work orders that look like duplicates of an earlier one from the same number, using the same matcher the app
// uses for new texts. READ-ONLY. Run it on a COPY of a database, never the live file:
//   node scripts/find-duplicates.mjs path/to/copy-of-account.db
import Database from 'better-sqlite3';
import { findMatch } from '../server/dedupe.js';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/find-duplicates.mjs <copy of an account database>'); process.exit(1); }
const db = new Database(file, { readonly: true, fileMustExist: true });
const tickets = db.prepare('SELECT id, from_phone, status, category, resolved_at, created_at, updated_at FROM tickets ORDER BY id').all();
const messages = db.prepare("SELECT sender, body, created_at FROM messages WHERE ticket_id = ? AND kind = 'sms' ORDER BY id");

const seen = new Map(); // phone -> earlier tickets
let found = 0;
for (const t of tickets) {
  const mine = { ...t, messages: messages.all(t.id) };
  const first = mine.messages.find((m) => m.sender === 'tenant');
  const earlier = seen.get(t.from_phone) || [];
  if (first && earlier.length) {
    // pretend each earlier ticket was still open, judged as of the moment this one arrived
    const candidates = earlier.map((e) => ({ ...e, status: 'triaged', messages: e.messages.filter((m) => m.created_at <= first.created_at) }));
    const m = findMatch({ text: first.body, now: Date.parse(first.created_at), candidates });
    if (['merge', 'drop', 'reopen'].includes(m.action)) { found++; console.log(`#${t.id} (${t.from_phone}) looks like a duplicate of #${m.ticketId}: "${first.body.slice(0, 70)}"`); }
  }
  seen.set(t.from_phone, [...earlier, mine]);
}
console.log(found ? `\n${found} likely duplicate(s). Merge them in the app with "A duplicate? Merge into another work order."` : 'No likely duplicates found.');

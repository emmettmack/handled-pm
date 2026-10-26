// Decides whether a new text from a known phone number belongs on an existing work order. Pure logic (no database),
// so it can be tested exhaustively; intake.js loads the candidates and acts on the answer.
//
//   drop     the same message again, moments apart: a duplicate delivery
//   append   a short "thanks": add it to the conversation, no new work, no reopening
//   merge    same problem as an open work order: add it to that conversation
//   reopen   "it's leaking again" shortly after a work order closed: reopen it as a callback
//   new      anything else (optionally linked to an earlier work order)
import { quickCategory } from './mockAi.js';

export const EXACT_REPEAT_MINUTES = 10;
export const AMBIGUOUS_MERGE_MINUTES = 120;
export const REOPEN_GRACE_HOURS = 48;
export const ACK_RECENT_DAYS = 7;
const SIMILAR = 0.5;

const STOP = new Set('the and for you your are was but not with this that have has had its from they them then than into onto out our can could would should will just please hey hello hola por que los las una uno del con para mis sus esta este pero muy'.split(' '));
const ACK_WORDS = new Set('ok okay k kk thanks thank thx ty you so much a lot very cool great perfect got it sounds good will do appreciate gracias muchas vale entendido listo bien excelente perfecto ya'.split(' '));

export const STILL_BROKEN = /\b(again|still|came back|comes back|not fixed|isn'?t fixed|didn'?t (work|fix)|worse|otra vez|todav[ií]a|sigue|volvi[oó]|no (lo )?arreglaron)\b/iu;

const normalize = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const tokens = (text) => new Set(normalize(text).split(' ').filter((w) => w.length > 2 && !STOP.has(w)));

export function similarity(a, b) {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

export function isAcknowledgement(text) {
  const t = String(text || '').trim();
  if (/^[\p{Extended_Pictographic}\s]+$/u.test(t) && t) return true;
  const words = normalize(t).split(' ').filter(Boolean);
  return words.length > 0 && words.length <= 5 && words.every((w) => ACK_WORDS.has(w));
}

const isOpen = (c) => !['resolved', 'closed'].includes(c.status);
const tenantMessages = (c) => (c.messages || []).filter((m) => m.sender === 'tenant');
// when the tenant last wrote (not when the ticket was last touched: AI replies and status changes move updated_at)
const lastTenantAt = (c) => (tenantMessages(c).length ? Math.max(...tenantMessages(c).map((m) => Date.parse(m.created_at))) : Date.parse(c.updated_at) || 0);
const closedAt = (c) => Date.parse(c.resolved_at || c.updated_at) || 0;
const guess = (c) => (c.category && c.category !== 'other' ? c.category : quickCategory(tenantMessages(c)[0]?.body));
const bestSimilarity = (text, c) => Math.max(0, ...tenantMessages(c).map((m) => similarity(text, m.body)));
const newest = (list, by) => [...list].sort((a, b) => by(b) - by(a))[0];

/** candidates: this phone number's work orders, each with { id, status, category, resolved_at, updated_at, messages[] }. */
export function findMatch({ text, now = Date.now(), candidates = [] }) {
  const N = normalize(text);
  const minutes = (ms) => (now - ms) / 60000;

  // 1. the very same message again, moments apart (the phone company or Twilio delivering twice)
  for (const c of candidates) {
    if (tenantMessages(c).some((m) => normalize(m.body) === N && minutes(Date.parse(m.created_at)) <= EXACT_REPEAT_MINUTES)) return { action: 'drop', ticketId: c.id };
  }

  // 2. "thanks" belongs on the recent conversation, never on a new work order
  if (isAcknowledgement(text)) {
    const recent = candidates.filter((c) => isOpen(c) || minutes(closedAt(c)) <= ACK_RECENT_DAYS * 1440);
    if (recent.length) return { action: 'append', ticketId: newest(recent, lastTenantAt).id };
    return { action: 'new' };
  }

  const cat = quickCategory(text);
  const same = (c) => (cat !== 'other' && cat === guess(c)) || bestSimilarity(text, c) >= SIMILAR;

  // 3. open work orders
  const open = candidates.filter(isOpen);
  // they were asked a question, so this is probably the answer, unless it is clearly about something else
  const clearlyDifferent = (c) => cat !== 'other' && guess(c) !== 'other' && cat !== guess(c) && bestSimilarity(text, c) < SIMILAR;
  const waiting = open.filter((c) => c.status === 'needs_info' && !clearlyDifferent(c));
  if (waiting.length) return { action: 'merge', ticketId: newest(waiting, lastTenantAt).id };
  const sameOpen = open.filter(same);
  if (sameOpen.length) return { action: 'merge', ticketId: newest(sameOpen, lastTenantAt).id };
  const unclear = open.filter((c) => cat === 'other' || guess(c) === 'other'); // not enough to say it is a different problem
  if (unclear.length) {
    const c = newest(unclear, lastTenantAt);
    return minutes(lastTenantAt(c)) <= AMBIGUOUS_MERGE_MINUTES ? { action: 'merge', ticketId: c.id } : { action: 'new', possibleDuplicateOf: c.id };
  }

  // 4. work orders that closed recently
  const closed = candidates.filter((c) => !isOpen(c));
  if (closed.length) {
    const c = newest(closed, closedAt);
    const within = minutes(closedAt(c)) <= REOPEN_GRACE_HOURS * 60;
    const sameProblem = same(c);
    if (within && (sameProblem || (cat === 'other' && STILL_BROKEN.test(text)))) return { action: 'reopen', ticketId: c.id };
    if (within || sameProblem) return { action: 'new', relatedTo: c.id };
  }
  return { action: 'new' };
}

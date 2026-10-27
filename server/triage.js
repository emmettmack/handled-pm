// The AI flow: read -> classify -> (verify) -> (follow up) -> summarize -> pick vendor -> draft -> approval queue.
// The model proposes; this file enforces the hard rules (liability, verification, spend cap, 2-round cap).
import * as ai from './ai.js';
import { currentAccount } from './accounts.js';
import { isDemo } from './mode.js';
import { normalizeLanguage, languageName } from './languages.js';
import * as S from './store.js';
import { sendToTenant } from './outbound.js';
import { T, sanitizeTenantReply, violatesLiability, COMPENSATION_ASK } from './templates.js';
import { scoreVendor } from './mockAi.js';

export const MAX_FOLLOWUP_ROUNDS = 6;
const URG = { routine: 0, urgent: 1, emergency: 2 };
const CATS = ['plumbing', 'electrical', 'HVAC', 'appliance', 'lockout', 'other'];

// One job at a time per ticket, so a tenant reply can't race an in-flight triage.
const queues = new Map();
export function enqueue(ticketId, fn) {
  const id = `${currentAccount()}:${ticketId}`; // ticket ids repeat across accounts
  const next = (queues.get(id) || Promise.resolve()).then(fn).catch((e) => console.error(`[ticket ${id}]`, e));
  queues.set(id, next);
  next.then(() => { if (queues.get(id) === next) queues.delete(id); });
  return next;
}

/** Resolves when no ticket work is in flight (used by tests and by graceful shutdown). */
export async function whenIdle() {
  while (queues.size) await Promise.all([...queues.values()]);
}

function context(id) {
  const t = S.getTicket(id);
  const tenant = t.tenant_id ? S.db_tenant(t.tenant_id) : null;
  const unit = S.getUnit(t.unit_id);
  const transcript = S.ticketDetail(id).messages.filter((m) => m.kind === 'sms');
  const { images, unviewable } = S.mediaForModel(id);
  return { company: S.getCompany(), homeMode: S.isHomeMode(), prefs: S.getPrefs(), mediaCount: S.mediaCount(id), images, unviewable, ticket: t, tenant, unit, transcript, verified: !!(t.verified || t.identity_cleared) };
}

/** A tenant's later message, answered by the model with the whole conversation and photos in view (null without a live model). */
export async function replyToUpdate(id) {
  const ctx = context(id);
  const vendorDispatched = S.ticketDetail(id).dispatches.some((d) => d.kind === 'vendor' && ['approved', 'accepted'].includes(d.state));
  const r = await ai.reply({ ...ctx, vendorDispatched });
  return r && r.reply ? r : null;
}

function normalizeTriage(r, t) {
  const out = { ...r };
  out.language = normalizeLanguage(r.language);
  out.reply_english = String(r.reply_english || '');
  out.category = CATS.includes(r.category) ? r.category : 'other';
  out.urgency = r.urgency in URG ? r.urgency : 'routine';
  if (t.urgency === 'emergency') out.urgency = 'emergency'; // once an emergency, always one until a human says otherwise
  out.estimated_cost = Math.max(0, Math.round(Number(r.estimated_cost) || 0)) || null;
  out.next_steps = Array.isArray(r.next_steps) ? r.next_steps.map(String).slice(0, 5) : [];
  out.title = String(r.title || 'Maintenance request').slice(0, 80);
  out.reply_to_tenant = String(r.reply_to_tenant || '');
  return out;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, ' ').replace(/\s+/g, ' ').trim();
const normUnit = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Does the name/unit the texter gave match anyone on file? (Informational: phone mismatch still goes to a human.) */
function matchClaim(claim) {
  if (!claim?.name && !claim?.unit) return { found: null, note: 'The texter did not provide a name or unit number.' };
  const all = S.allTenantsWithUnits();
  const tokens = norm(claim.name).split(' ').filter(Boolean);
  const hit = all.find(
    (t) => tokens.length && tokens.every((tok) => norm(t.name).split(' ').includes(tok)) && (!claim.unit || normUnit(t.unit_number) === normUnit(claim.unit)),
  );
  if (hit) {
    return { found: hit, note: `The name and unit given (${claim.name}, Unit ${claim.unit || '?'}) match ${hit.name} in Unit ${hit.unit_number} at ${hit.property_name}, but the text came from a number that is NOT the one on file (${S.prettyPhone(hit.phone)}).` };
  }
  return { found: null, note: `The name and unit given (${claim.name || 'no name'}, ${claim.unit ? 'Unit ' + claim.unit : 'no unit'}) do not match any tenant on file.` };
}

export async function processTicket(id) {
  let t = S.getTicket(id);
  if (!t || S.CLOSED_STATUSES.includes(t.status)) return;
  const ctx = context(id);
  const r = normalizeTriage(
    await ai.triage({ ...ctx, rounds: t.followup_rounds, maxRounds: MAX_FOLLOWUP_ROUNDS }),
    t,
  );
  const lang = r.language;
  // A photo would help and none has been asked for or sent yet: ask once, with specifics, before wrapping up.
  const askedForPhoto = !!t.photo_asked || ctx.transcript.some((m) => m.sender !== 'tenant' && /\b(photos?|pictures?|pics?)\b/i.test(m.body));
  if (!r.needs_info && r.photos_helpful && r.photo_request && !ctx.images.length && !askedForPhoto && r.urgency !== 'emergency' && t.followup_rounds < MAX_FOLLOWUP_ROUNDS) {
    S.updateTicket(id, { photo_asked: 1 });
    r.needs_info = true;
    r.reply_to_tenant = String(r.photo_request);
    r.reply_english = String(r.photo_request_english || '');
  }
  const lastTenantMsg = [...ctx.transcript].reverse().find((m) => m.sender === 'tenant')?.body || '';

  // A real account without a live model must not show invented dollar figures: the sample AI's numbers are demo-only.
  const noEstimate = !isDemo() && ai.isMock();
  const estimate = noEstimate ? { value: null, source: null } : { value: r.estimated_cost, source: ai.isMock() ? 'sample_rules' : 'ai_model' };
  S.updateTicket(id, {
    language: lang, category: r.category, urgency: r.urgency, title: r.title, summary: r.summary,
    diagnosis: r.diagnosis, next_steps: r.next_steps, reasoning: r.urgency_reason,
    trade: S.TRADE_FOR_CATEGORY[r.category], access_notes: r.access_notes, cost_estimate: estimate.value, cost_estimate_source: estimate.source,
  });
  if (t.status === 'new') S.setStatus(id, 'triaged', `Read the text: ${r.category}, ${r.urgency}`);
  t = S.getTicket(id);

  if (!isDemo() && ai.isMock() && lang !== 'en' && lang !== 'es') {
    S.addFlag(id, 'language', `The tenant wrote in ${languageName(lang)}. Without a live AI model Macalisto can't read or answer in that language, so please follow up with them directly.`);
  }

  // ---- Emergency: flag + escalation placeholder (visual only in the demo) ----
  if (r.urgency === 'emergency' && !t.emergency_at) {
    S.updateTicket(id, { emergency_at: S.nowIso() });
    S.addNote(id, isDemo() ? 'EMERGENCY flagged. Escalation step: the live product would page the property manager by phone right now. (Demo only, no call is placed.)' : 'EMERGENCY flagged. The tenant was sent safety instructions. Please review and approve the dispatch right away.');
  }

  // ---- Compensation / blame: never answered by the AI, always flagged for the human ----
  const wantsComp = r.compensation_requested || COMPENSATION_ASK.test(lastTenantMsg);
  let compensationReply = false;
  if (wantsComp && S.addFlag(id, 'compensation', 'Tenant asked about compensation, a credit, or who is responsible. The assistant replied neutrally and did not commit to anything.')) {
    S.addNote(id, 'Tenant raised compensation or responsibility. Flagged for you; the assistant did not respond on the substance.');
    compensationReply = true;
  }
  // Tenants writing in a language other than English/Spanish are told once that we can translate, and which language is primary.
  const accountLang = normalizeLanguage(ctx.tenant?.language);
  const transcriptText = ctx.transcript.map((m) => m.body);
  const needsTranslateNote = r.other_language && !transcriptText.includes(T.translateNote('en')) && !transcriptText.includes(T.translateNote('es'));
  const withNote = (text) => (needsTranslateNote ? `${T.translateNote(accountLang)} ${text}` : text);
  const replyWithComp = (text) => {
    const parts = [needsTranslateNote && T.translateNote(accountLang), compensationReply && T.compensation(lang), text].filter(Boolean);
    const body = parts.join(' ');
    if (!body || !body.trim()) return;
    if (lang === 'en' || lang === 'es') return sendToTenant(t, sanitizeTenantReply(body, lang));
    // The money/fault filter reads English and Spanish only. For other languages the model also supplies an English copy
    // to check; if it's missing or promises money or fault, send the fixed neutral message instead (never guess).
    const safe = r.reply_english && !violatesLiability(r.reply_english);
    sendToTenant(t, safe ? body : T.liabilitySafe(lang));
  };

  // ---- Follow-up question (max 2 rounds) ----
  if (r.needs_info && r.urgency !== 'emergency' && t.followup_rounds < MAX_FOLLOWUP_ROUNDS) {
    S.updateTicket(id, { followup_rounds: t.followup_rounds + 1 });
    replyWithComp(r.reply_to_tenant);
    S.setStatus(id, 'needs_info', `Asked the tenant a follow-up question (round ${t.followup_rounds + 1} of ${MAX_FOLLOWUP_ROUNDS})`);
    return;
  }

  // ---- Who is texting: an unknown number is not turned away. The assistant helps with the problem first, then asks once for
  // name and address. Whatever they give is checked against the tenants on file and noted for the PM, who still approves
  // every dispatch. The exception is a lockout from someone who doesn't match anyone on file: that waits for the PM.
  const verified = !!(t.verified || t.identity_cleared);
  if (!verified && r.urgency !== 'emergency' && !(r.needs_info && t.followup_rounds < MAX_FOLLOWUP_ROUNDS)) {
    const given = r.identity_claim?.name && (r.identity_claim?.unit || r.identity_claim?.address);
    if (given) {
      const claim = matchClaim(r.identity_claim);
      if (claim.found) {
        S.updateTicket(id, { identity_cleared: 1, tenant_id: claim.found.id, unit_id: claim.found.unit_id });
        S.addNote(id, `${claim.note} Treated as that tenant, texting from a different number.`);
      } else if (r.category === 'lockout') {
        S.addFlag(id, 'identity', `${claim.note} This is a lockout, so nobody will be dispatched until you confirm who this is (for example by calling the number on file).`);
        sendToTenant(t, T.identityHold(lang));
        S.setStatus(id, 'triaged', 'Lockout from someone not on file: held for the property manager');
        return;
      } else {
        S.updateTicket(id, { identity_cleared: 1 });
        S.addNote(id, `${claim.note} Not on file, so check who this is when you approve the dispatch.`);
      }
    } else if (!t.verification_asked) {
      S.updateTicket(id, { verification_asked: 1 });
      replyWithComp(`${r.needs_info ? T.proceedAck(lang) : r.reply_to_tenant} ${T.askNameAddress(lang)}`.trim());
      S.setStatus(id, 'needs_info', 'Number not on file: asked for name and address');
      S.addNote(id, `This text came from ${S.prettyPhone(t.from_phone)}, which is not a tenant number on file. The assistant is helping with the problem and asked for their name and address.`);
      return;
    } else {
      const claim = matchClaim(r.identity_claim);
      S.addFlag(id, 'identity', `${claim.note} They were asked for name and address. Nobody will be dispatched until you confirm who this is.`);
      sendToTenant(t, T.identityHold(lang));
      S.setStatus(id, 'triaged', 'Name and address not given: held for the property manager');
      S.addNote(id, `Could not identify the texter. ${claim.note}`);
      return;
    }
  }

  // ---- Enough info: acknowledge, draft the dispatch ----
  replyWithComp(r.needs_info ? T.proceedAck(lang) : r.reply_to_tenant);
  S.setStatus(id, 'triaged', 'Enough detail to dispatch');
  await draftAndQueue(id);
}

/**
 * Pick a vendor and draft the dispatch for the PM's approval. If the estimate is over the property's owner
 * approval limit, the PM gets a flag to check with the owner; nothing is drafted to or sent to the owner automatically.
 */
export async function draftAndQueue(id, { excludeVendorIds = [], note = '' } = {}) {
  const t = S.getTicket(id);
  const ctx0 = context(id);
  const unit = ctx0.unit;
  const limit = unit?.approval_limit ?? 500;
  const overLimit = !ctx0.homeMode && (t.cost_estimate || 0) > limit; // no owner to check with when you are the owner

  // candidates: same trade (not excluded); fall back to handyman / general if the trade is exhausted
  const trade = t.trade || S.TRADE_FOR_CATEGORY[t.category];
  const pool = S.activeVendors().filter((v) => !excludeVendorIds.includes(v.id));
  let candidates = pool.filter((v) => v.trade === trade);
  let fellBack = false;
  if (!candidates.length) { candidates = pool.filter((v) => v.trade === 'general' || v.trade === 'handyman' || v.trade === 'other'); fellBack = true; }
  if (!candidates.length) {
    S.addFlag(id, 'no_vendor', `No ${trade} vendors left to try. Please call someone directly.`);
    S.setStatus(id, 'triaged', 'No vendor available');
    S.addNote(id, `No remaining ${trade} vendors on your list. Flagged for you.`);
    return;
  }

  const accessAllowed = !!(t.verified || t.identity_cleared);
  const d = await ai.draftDispatch({ ...ctx0, ticket: t, vendors: candidates, mode: 'vendor', note, accessAllowed });

  let vendor = candidates.find((v) => v.id === Number(d?.vendor_id));
  if (!vendor) { // model picked something invalid: fall back to deterministic scoring
    vendor = candidates.map((v) => ({ v, ...scoreVendor(v, { urgency: t.urgency, language: t.language, text: t.summary || '' }) })).sort((a, b) => b.s - a.s)[0].v;
  }
  const text = String(d?.text || '').trim() || (await import('./mockAi.js')).buildText({ ...ctx0, ticket: t, mode: 'vendor', accessAllowed }, vendor);
  const reasoning = String(d?.reasoning || '') + (fellBack ? ` No other ${trade} vendors were left, so this falls back to a ${vendor.trade}.` : '');

  S.db_insertDispatch({ ticket_id: id, vendor_id: vendor.id, kind: 'vendor', text, reasoning });
  S.updateTicket(id, { vendor_id: vendor.id });
  S.setStatus(id, 'dispatch_drafted', `Drafted dispatch to ${vendor.name}`);
  S.setStatus(id, 'awaiting_approval', 'Waiting for your approval');
  if (overLimit && S.addFlag(id, 'over_limit', `The estimate ($${t.cost_estimate?.toLocaleString()}) is over this property's $${limit.toLocaleString()} owner approval limit. Check with ${unit?.owner_name || 'the owner'} before you approve the dispatch.`)) {
    S.addNote(id, `Estimated cost $${t.cost_estimate?.toLocaleString()} is over this property's $${limit.toLocaleString()} owner approval limit. Flagged for you to check with the owner; nothing was sent to anyone.`);
  }
}

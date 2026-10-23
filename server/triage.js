// The AI flow: read -> classify -> (verify) -> (follow up) -> summarize -> pick vendor -> draft -> approval queue.
// The model proposes; this file enforces the hard rules (liability, verification, spend cap, 2-round cap).
import * as ai from './ai.js';
import { currentAccount } from './accounts.js';
import * as S from './store.js';
import { sendToTenant } from './outbound.js';
import { T, sanitizeTenantReply, COMPENSATION_ASK } from './templates.js';
import { scoreVendor } from './mockAi.js';

export const MAX_FOLLOWUP_ROUNDS = 2;
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

function context(id) {
  const t = S.getTicket(id);
  const tenant = t.tenant_id ? S.db_tenant(t.tenant_id) : null;
  const unit = S.getUnit(t.unit_id);
  const transcript = S.ticketDetail(id).messages.filter((m) => m.kind === 'sms');
  return { company: S.getCompany(), prefs: S.getPrefs(), mediaCount: S.mediaCount(id), ticket: t, tenant, unit, transcript, verified: !!(t.verified || t.identity_cleared) };
}

function normalizeTriage(r, t) {
  const out = { ...r };
  out.language = r.language === 'es' ? 'es' : 'en';
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
  const lastTenantMsg = [...ctx.transcript].reverse().find((m) => m.sender === 'tenant')?.body || '';

  S.updateTicket(id, {
    language: lang, category: r.category, urgency: r.urgency, title: r.title, summary: r.summary,
    diagnosis: r.diagnosis, next_steps: r.next_steps, reasoning: r.urgency_reason,
    trade: S.TRADE_FOR_CATEGORY[r.category], access_notes: r.access_notes, cost_estimate: r.estimated_cost,
  });
  if (t.status === 'new') S.setStatus(id, 'triaged', `Read the text: ${r.category}, ${r.urgency}`);
  t = S.getTicket(id);

  // ---- Emergency: flag + escalation placeholder (visual only in the demo) ----
  if (r.urgency === 'emergency' && !t.emergency_at) {
    S.updateTicket(id, { emergency_at: S.nowIso() });
    S.addNote(id, 'EMERGENCY flagged. Escalation step: the live product would page the property manager by phone right now. (Demo only, no call is placed.)');
  }

  // ---- Compensation / blame: never answered by the AI, always flagged for the human ----
  const wantsComp = r.compensation_requested || COMPENSATION_ASK.test(lastTenantMsg);
  let compensationReply = false;
  if (wantsComp && S.addFlag(id, 'compensation', 'Tenant asked about compensation, a credit, or who is responsible. The assistant replied neutrally and did not commit to anything.')) {
    S.addNote(id, 'Tenant raised compensation or responsibility. Flagged for you; the assistant did not respond on the substance.');
    compensationReply = true;
  }
  // Tenants writing in a language other than English/Spanish are told once that we can translate, and which language is primary.
  const accountLang = ctx.tenant?.language === 'es' ? 'es' : 'en';
  const transcriptText = ctx.transcript.map((m) => m.body);
  const needsTranslateNote = r.other_language && !transcriptText.includes(T.translateNote('en')) && !transcriptText.includes(T.translateNote('es'));
  const withNote = (text) => (needsTranslateNote ? `${T.translateNote(accountLang)} ${text}` : text);
  const replyWithComp = (text) => {
    const parts = [needsTranslateNote && T.translateNote(accountLang), compensationReply && T.compensation(lang), text].filter(Boolean);
    const body = parts.join(' ');
    if (body && body.trim()) sendToTenant(t, sanitizeTenantReply(body, lang));
  };

  // ---- Tenant verification (security): unknown number -> ask for name + unit -> else a human decides ----
  const verified = !!(t.verified || t.identity_cleared);
  if (!verified && r.urgency !== 'emergency') {
    if (!t.verification_asked) {
      S.updateTicket(id, { verification_asked: 1 });
      sendToTenant(t, withNote(compensationReply ? `${T.compensation(lang)} ${T.askIdentity(lang)}` : T.askIdentity(lang)));
      S.setStatus(id, 'needs_info', 'Number not on file: asked the texter for their name and unit');
      S.addNote(id, `This text came from ${S.prettyPhone(t.from_phone)}, which is not a tenant number on file. The assistant asked for name and unit and will not dispatch anyone until identity is confirmed.${r.category === 'lockout' ? ' Lockouts are treated as a security event.' : ''}`);
      return;
    }
    const claim = matchClaim(r.identity_claim);
    S.addFlag(id, 'identity', `${claim.note} Nobody will be dispatched until you confirm who this is (for example by calling the number on file).`);
    sendToTenant(t, T.identityHold(lang));
    S.setStatus(id, 'triaged', 'Identity could not be verified: held for the property manager');
    S.addNote(id, `Could not verify the texter. ${claim.note}`);
    return;
  }

  // ---- Follow-up question (max 2 rounds) ----
  if (r.needs_info && r.urgency !== 'emergency' && t.followup_rounds < MAX_FOLLOWUP_ROUNDS) {
    S.updateTicket(id, { followup_rounds: t.followup_rounds + 1 });
    replyWithComp(r.reply_to_tenant);
    S.setStatus(id, 'needs_info', `Asked the tenant a follow-up question (round ${t.followup_rounds + 1} of ${MAX_FOLLOWUP_ROUNDS})`);
    return;
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
  const overLimit = (t.cost_estimate || 0) > limit;

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

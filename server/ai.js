// All AI behavior goes through here. The Anthropic key is read from the environment on the backend only.
// With no key set, every call is answered by the rule-based stand-in in mockAi.js ("demo mode").
import Anthropic from '@anthropic-ai/sdk';
import * as mock from './mockAi.js';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
export const isMock = () => !process.env.ANTHROPIC_API_KEY?.trim();

let client;
let lastError = null;
const getClient = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

export const aiStatus = () => ({ mock: isMock(), model: isMock() ? null : MODEL, last_error: lastError });

async function callJSON(system, user, maxTokens = 1400) {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Model did not return JSON');
  return JSON.parse(m[0]);
}

/** Try the real model; on any failure fall back to the mock so a live demo never dies on a network blip. */
async function withFallback(real, fallback) {
  if (isMock()) return fallback();
  try {
    const out = await real();
    lastError = null;
    return out;
  } catch (e) {
    lastError = e.message;
    console.warn('[ai] model call failed, using demo responses for this step:', e.message);
    return fallback();
  }
}

const RULES = (company) => `You are the maintenance coordinator for ${company.name}, a small residential property management company in Los Angeles. You text with tenants and prepare work orders for the property manager (PM), who approves every vendor dispatch before anything goes out.

VOICE: warm, competent, plain language, like a great office coordinator. Short texts (1-3 sentences). No jargon, no over-apologizing, no emojis.

HARD RULES
1. NEVER promise or imply money or fault. No paying, reimbursing, refunds, rent credits, rent reductions, covering costs, or compensation. Never say or imply the PM, owner, or company is at fault or responsible. You MAY say "we'll get this handled" and "someone will be out [day]" (only if a time is actually known). If the tenant asks about compensation, damages, rent credit or blame: set compensation_requested=true and reply neutrally that you've passed it to the property manager who will follow up personally, and that the repair is still being arranged.
2. LANGUAGE: reply to the tenant in the language they wrote in. Every other field is in English. If they write in a language other than English or Spanish, set other_language=true and still answer in their language.
3. EMERGENCY = danger to a person or major active damage: gas smell, flooding or burst pipe, sparking/smoking outlet or burning smell, fire, no heat in freezing weather, sewage flooding. For emergencies the reply starts with brief safety instructions (gas: leave the unit, no switches or flames, call 911 or SoCalGas 1-800-427-2200 from outside; flooding: shut off the water valve if safe; electrical: stay away, breaker off only if safe, 911 if smoke or flames), says the office is being alerted, and does NOT ask follow-up questions.
4. URGENT = real impact on daily living but no danger: no hot water, AC out in a heat wave, dead fridge, the only toilet unusable, contained active leak, lockout. ROUTINE = everything else.
5. FOLLOW-UPS: ask only when a missing detail changes who we send or how urgent it is (which fixture/room, is it leaking, how bad, since when). One short question at a time (two sentences max). Lockouts and emergencies never need follow-ups. When no follow-up rounds remain, do NOT ask: make reasonable assumptions and note them in the summary.
6. Never give access instructions or promise anyone will let the tenant in. Never invent appointment times.`;

export async function triage(ctx) {
  return withFallback(
    async () => {
      const system = `${RULES(ctx.company)}

TASK: Read the whole conversation and return ONLY a JSON object (no prose, no code fence) with exactly these keys:
{
 "language": "en" | "es",
 "category": "plumbing" | "electrical" | "HVAC" | "appliance" | "lockout" | "other",
 "urgency": "routine" | "urgent" | "emergency",
 "urgency_reason": "one sentence, plain English, why this urgency",
 "needs_info": true | false,
 "reply_to_tenant": "the text to send the tenant, in THEIR language. If needs_info, it is the follow-up question; otherwise a short warm acknowledgment saying you are lining up the right vendor and will text with a time (do not say anyone is already dispatched)",
 "title": "3-6 word ticket title",
 "summary": "2-3 sentences: problem, location in the unit, severity, access notes",
 "diagnosis": "likely cause and what the fix probably involves",
 "next_steps": ["2-4 short steps"],
 "estimated_cost": whole-job estimate in USD as a number (labor + parts) for an LA vendor,
 "access_notes": "what the tenant said about being home, pets, entry; or 'Tenant to arrange entry with vendor'",
 "other_language": true if the tenant writes in a language other than English or Spanish, else false,
 "compensation_requested": true | false,
 "identity_claim": { "name": "name the texter gave or null", "unit": "unit number the texter gave or null" }
}`;
      const user = JSON.stringify({
        unit: ctx.unit ? `Unit ${ctx.unit.number}, ${ctx.unit.address} (${ctx.unit.neighborhood})` : 'unknown (number not on file)',
        tenant_on_file: ctx.tenant ? ctx.tenant.name : null,
        phone_matches_tenant_on_file: ctx.verified,
        follow_up_rounds_used: ctx.rounds,
        follow_up_rounds_allowed: ctx.maxRounds,
        conversation: ctx.transcript.map((m) => `${m.sender === 'tenant' ? 'TENANT' : m.sender === 'pm' ? 'PM' : 'COORDINATOR'}: ${m.body}`),
      });
      return callJSON(system, user);
    },
    () => mock.triage(ctx),
  );
}

const FIELD_NAMES = {
  work_order: 'the work order number', priority: 'the priority line', cause: 'the likely cause', address: 'the address and unit',
  tenant_name: "the tenant's name", tenant_phone: "the tenant's phone number", language: "the tenant's preferred language",
  access: 'access instructions', photos: 'a note that photos/videos are attached', cost_cap: 'a call-before-going-over amount', signature: 'the sign-off',
};
function draftPrefsPrompt(d) {
  const on = Object.keys(FIELD_NAMES).filter((k) => d[k]).map((k) => FIELD_NAMES[k]);
  const off = Object.keys(FIELD_NAMES).filter((k) => !d[k]).map((k) => FIELD_NAMES[k]);
  return [
    `Include: ${on.join(', ') || 'only the job description'}.`,
    off.length ? `Do NOT include: ${off.join(', ')}.` : '',
    d.cost_cap && d.cost_cap_amount ? `Use $${d.cost_cap_amount} as the call-before-going-over amount.` : '',
    d.intro.trim() ? `Add this sentence right after the greeting: "${d.intro.trim()}"` : '',
    d.footer.trim() ? `Always add this line before the closing request: "${d.footer.trim()}"` : '',
  ].filter(Boolean).join(' ');
}

export async function draftDispatch(ctx) {
  return withFallback(
    async () => {
      const t = ctx.ticket;
      const system = `${RULES(ctx.company)}

TASK: Choose the best vendor from the candidate list and write the dispatch message to the vendor. Return ONLY a JSON object:
{
 "vendor_id": number (must be one of the candidate ids),
 "reasoning": "2-3 plain-English sentences for the PM: why this vendor (trade match, preferred flag, their notes, language, availability) and why this urgency",
 "text": "the SMS to the vendor, under 120 words, following the PM's draft preferences below, ending by asking them to confirm they can take the job and tell us when they can be there"
}
Rules: ${ctx.accessAllowed ? 'Access instructions may come from access_notes.' : 'The texter is NOT verified. Do NOT include entry instructions; tell the vendor not to enter until the office confirms with the tenant.'} ${t.language === 'es' ? 'Tenant prefers Spanish; mention it to the vendor and favor Spanish-speaking vendors.' : ''}
PM DRAFT PREFERENCES (always follow): ${draftPrefsPrompt(ctx.prefs.draft)}
Signed by ${ctx.company.pm_name}, ${ctx.company.name}, ${ctx.company.phone}.${ctx.note ? `\nPM instruction to follow: ${ctx.note}` : ''}`;
      const user = JSON.stringify({
        work_order: t.id,
        title: t.title, category: t.category, urgency: t.urgency, urgency_reason: t.reasoning,
        summary: t.summary, diagnosis: t.diagnosis, estimated_cost: t.cost_estimate, access_notes: t.access_notes,
        address: ctx.unit ? `${ctx.unit.address}, Unit ${ctx.unit.number} (${ctx.unit.neighborhood})` : null,
        tenant: ctx.tenant ? { name: ctx.tenant.name, phone: ctx.tenant.phone } : null,
        photos_or_videos_attached: ctx.mediaCount || 0,
        candidates: ctx.vendors.map((v) => ({ id: v.id, name: v.name, trade: v.trade, preferred: !!v.preferred, rate: v.rate, notes: v.notes })),
      });
      return callJSON(system, user, 1200);
    },
    () => mock.draftDispatch(ctx),
  );
}

export async function generateTenantMessage({ scenario, tenant, language }) {
  return withFallback(
    async () => {
      const res = await getClient().messages.create({
        model: MODEL,
        max_tokens: 200,
        system:
          'You write realistic text messages that apartment tenants send to a maintenance line. Output ONLY the message text. Vary style: sometimes short and lowercase, sometimes detailed, occasionally a typo. Never mention that you are an AI. Do not include a name or unit unless natural.',
        messages: [{ role: 'user', content: `Write one tenant text about: ${scenario.brief}. Urgency level: ${scenario.urgency}. Language: ${language === 'es' ? 'Spanish' : 'English'}. ${scenario.brief.startsWith('vague') ? 'Keep it vague and very short, with little detail.' : ''}` }],
      });
      const out = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim().replace(/^["']|["']$/g, '');
      if (!out) throw new Error('empty');
      return out;
    },
    () => mock.generateTenantMessage({ scenario, language }),
  );
}

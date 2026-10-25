// Rule-based stand-in for the AI, used when ANTHROPIC_API_KEY is not set.
// Returns the same shapes as the real model calls in ai.js so the rest of the app is unaware.
import { SCENARIOS, pickScenario } from './scenarios.js';
import { unitName } from './labels.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (text, re) => re.test(text);
const fmtPhone = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };
const first = (n) => (n || '').split(' ')[0];

const SPANISH = /\b(hola|gracias|por favor|el |la |los |las |mi |no (tiene|hay|funciona|baja)|est[aá]|tengo|huelo|inodoro|llave|agua|aire acondicionado|refrigerador|d[eé]scompuesto|ayuda|necesito|puerta|cocina|ba[ñn]o)\b|[¿¡ñ]/i;

const EMERGENCY = [
  { re: /(smell|smells|smelling).{0,20}gas|gas (leak|smell)|olor a gas|huelo gas|fuga de gas/i, kind: 'gas', category: 'plumbing', title: 'Gas smell reported', reason: 'Tenant reports a gas smell. That is a danger to people in the building.' },
  { re: /burst|flood|pouring|water (is )?everywhere|reventó|inund|por todos lados/i, kind: 'water', category: 'plumbing', title: 'Burst pipe / flooding', reason: 'Active flooding can damage the unit and units below within minutes.' },
  { re: /spark|smoke|burning smell|on fire|\bfire\b|chispa|humo/i, kind: 'electrical', category: 'electrical', title: 'Sparking outlet / burning smell', reason: 'Sparking or burning smell is a fire risk.' },
  { re: /no heat.{0,60}(freez|cold|elderly|baby)|(freez|cold).{0,60}no heat|heater won't turn on.{0,40}freez/i, kind: 'heat', category: 'HVAC', title: 'No heat in freezing weather', reason: 'No heat in freezing weather is a health risk, especially for vulnerable residents.' },
];

const CATEGORIES = [
  ['lockout', /locked (myself )?out|lost (my )?keys?|lost my key|can'?t get (in|into)|keys? (inside|locked)|key stuck|lock (is )?(broken|jammed)|me qued[eé] afuera|perd[ií] (mis )?llaves|cerradura/i],
  ['appliance', /fridge|refrigerat|dishwasher|stove|oven|washer|dryer|microwave|disposal|range|freezer|lavaplatos|estufa|horno|lavadora|secadora|refrigerador/i],
  ['HVAC', /\bac\b|a\/c|air ?condition|heater|heating|furnace|thermostat|\bheat\b|aire acondicionado|calefacci/i],
  ['electrical', /outlet|breaker|switch|power|light|flicker|electric|wiring|enchufe|apagador|corriente|\bluz\b/i],
  ['plumbing', /faucet|sink|toilet|drain|leak|pipe|water|shower|tub|clog|flush|sewer|grifo|llave del|lavabo|fregadero|inodoro|tubo|fuga|drenaje|regadera|gotea/i],
];

const URGENT = /leak\w* under|water on the (floor|ground)|water (is )?(pooling|dripping)|no hot water|sin agua caliente|ceiling|techo|only (bathroom|toilet)|only one|clogged.{0,30}toilet|toilet.{0,30}(clog|won'?t flush|overflow)|inodoro.{0,40}tapado|tapado.{0,30}inodoro|fridge.{0,30}(stopped|not cool|warm)|refrigerat.{0,30}(stopped|not cool|warm)|refrigerador dej|stopped cooling|\b(9\d|10\d) degrees|heat wave|ac (completely )?died|locked out|lost (my )?keys|me qued[eé] afuera|sewage|baby|infant|beb[eé]|no power/i;

const FOLLOWUPS = {
  plumbing: ['Happy to help. Which sink or fixture is it, and is water leaking onto the floor or cabinet, or is it just not working right?', 'Con gusto le ayudo. ¿Qué lavabo o accesorio es, y está goteando agua al piso o al gabinete, o simplemente no funciona bien?'],
  electrical: ['Thanks for letting us know. Which room is it in, and is anything sparking, buzzing, or hot to the touch?', 'Gracias por avisarnos. ¿En qué cuarto está, y hay chispas, zumbidos o algo caliente al tacto?'],
  HVAC: ['Sorry to hear that. Is the unit blowing any air at all, and how warm is it inside right now? Any idea how long it has been like this?', 'Lamento escuchar eso. ¿La unidad sopla aire, y qué tan caliente está adentro ahorita? ¿Sabe desde cuándo está así?'],
  appliance: ['Thanks. Which appliance is it, and what is it doing (not turning on, leaking, making noise)?', 'Gracias. ¿Qué aparato es, y qué hace (no enciende, gotea, hace ruido)?'],
  other: ['Could you tell me a bit more? Where in the apartment is it, and when did you first notice it?', '¿Me puede dar un poco más de detalle? ¿En qué parte del apartamento está y cuándo lo notó?'],
};

const DIAGNOSIS = {
  plumbing: ['Likely a worn washer or cartridge, a partial clog, or a loose fitting. A plumber can usually fix this in one visit.', ['Plumber inspects fixture and supply lines', 'Repair or replace worn parts', 'Test for leaks before leaving']],
  electrical: ['Possible loose wiring, failed device, or tripped/failed breaker. Needs a licensed electrician to rule out a fire risk.', ['Electrician inspects the device and circuit', 'Repair or replace faulty part', 'Confirm circuit is safe']],
  HVAC: ['Could be a thermostat, capacitor, refrigerant, or filter issue. A technician should diagnose on site.', ['HVAC tech checks thermostat, filter, and compressor', 'Repair or quote replacement parts', 'Confirm cooling/heating restored']],
  appliance: ['Common causes are a clogged drain pump, failed control board, or thermostat. Diagnosis visit needed.', ['Technician diagnoses the appliance', 'Quote parts if needed', 'Repair and test cycle']],
  lockout: ['Tenant cannot get into the unit. Needs a locksmith, and the texter must be verified as the tenant first.', ['Verify tenant by phone on file', 'Locksmith opens door (no damage)', 'Offer to cut spare key']],
  other: ['Cause unclear from the text. A handyman visit should identify it and fix small items on the spot.', ['Handyman inspects the area', 'Fix on site or recommend a specialist']],
};

const EMERGENCY_REPLY = {
  gas: ['This sounds serious. Please leave the apartment right now and don\'t flip any switches or use flames. From outside, call 911 or SoCalGas at 1-800-427-2200. I\'m alerting the office and getting help on the way.', 'Esto es serio. Por favor salga del apartamento ahora mismo y no use interruptores ni fuego. Desde afuera llame al 911 o a SoCalGas al 1-800-427-2200. Estoy avisando a la oficina y enviando ayuda.'],
  water: ['If you can do it safely, shut off the water at the valve under the sink or behind the toilet, and move valuables away from the water. I\'m alerting the office right now and getting someone out.', 'Si es seguro, cierre la llave de paso debajo del fregadero o detrás del inodoro y aleje sus cosas del agua. Estoy avisando a la oficina y enviando a alguien ahora mismo.'],
  electrical: ['Please stay away from that outlet and don\'t plug anything in. If it\'s safe, switch off that room\'s breaker. If you see smoke or flames, leave and call 911. I\'m alerting the office and getting an electrician.', 'Por favor aléjese de ese enchufe. Si es seguro, apague el interruptor del cuarto. Si ve humo o llamas, salga y llame al 911. Estoy avisando a la oficina y buscando un electricista.'],
  heat: ['I\'m sorry you\'re cold. Please use blankets and keep warm in one room, and don\'t use the oven for heat. I\'m alerting the office and getting a technician out as soon as possible.', 'Lamento que tenga frío. Use cobijas y quédense en un solo cuarto, y no use el horno para calentar. Estoy avisando a la oficina y buscando un técnico lo antes posible.'],
};

// Languages other than English/Spanish: any non-Latin script, or a few very common words in other Latin-script languages.
const OTHER_LANGUAGE = /[\u0400-\u04FF\u0590-\u06FF\u0900-\u0DFF\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]|\b(bonjour|merci|fuite|évier|s'il vous plaît|olá|obrigad[oa]|vazamento|torneira|hallo|danke|wasserhahn|undicht|ciao|grazie|perdita|rubinetto|salamat|po\b|tubig|xin chào|cảm ơn)\b/i;
export const detectOtherLanguage = (text) => OTHER_LANGUAGE.test(text);

export function detectLanguage(text) {
  return SPANISH.test(text) ? 'es' : 'en';
}

function costFor(category, urgency, text) {
  if (/water heater|calentador|compressor|compresor|replace|reemplaz|sewer line|main line|ceiling|techo/i.test(text)) return 1400;
  const base = { plumbing: 180, electrical: 160, HVAC: 380, appliance: 250, lockout: 140, other: 120 }[category] ?? 150;
  return urgency === 'routine' ? base : Math.round(base * 1.4);
}

export async function triage(ctx) {
  await pause(500 + Math.random() * 600);
  const tenantText = ctx.transcript.filter((m) => m.sender === 'tenant').map((m) => m.body).join(' ');
  const lang = detectLanguage(tenantText);
  const li = lang === 'es' ? 1 : 0;

  // identity claim ("I'm Mike Johnson, unit 3B"): read from the tenant's latest message only
  const lastText = [...ctx.transcript].reverse().find((m) => m.sender === 'tenant')?.body || '';
  const name = lastText.match(/^\s*(?:(?:i'?m|i am|this is|my name is|soy|me llamo)\s+)?([A-Za-zÀ-ÿ'.-]+(?:\s+[A-Za-zÀ-ÿ'.-]+)?)\s*[,.\-–]?\s*(?:,?\s*(?:and\s+)?(?:i'?m\s+in\s+)?(?:unit|apt|apartment|#|apartamento))/i)?.[1] || null;
  const unit = lastText.match(/(?:unit|apt\.?|apartment|#|apartamento)\s*#?\s*([0-9]{1,3}[A-Za-z]?|[A-Za-z])\b/i)?.[1] || null;

  let category = 'other';
  for (const [c, re] of CATEGORIES) if (has(tenantText, re)) { category = c; break; }
  if (/water heater|hot water|agua caliente|calentador/i.test(tenantText)) category = 'plumbing';

  let urgency = 'routine';
  let reason = 'Inconvenient but no safety risk or active damage, so it can be scheduled normally.';
  let emergency = EMERGENCY.find((e) => has(tenantText, e.re));
  if (emergency) {
    urgency = 'emergency'; category = emergency.category; reason = emergency.reason;
  } else if (has(tenantText, URGENT) || category === 'lockout') {
    urgency = 'urgent';
    reason = category === 'lockout'
      ? 'Tenant is locked out, so it needs same-day attention. Also a security-sensitive request.'
      : 'This affects daily living (hot water, cooling, a working toilet, or an active leak), so it should be handled within a day.';
  }

  const words = tenantText.trim().split(/\s+/).length;
  const needsInfo = !emergency && category !== 'lockout' && ctx.rounds < ctx.maxRounds && ctx.rounds === 0 && words < 10;

  const [diag, steps] = DIAGNOSIS[category];
  const tradeWord = ({ plumbing: ['plumber', 'plomero'], electrical: ['electrician', 'electricista'], HVAC: ['HVAC technician', 'técnico de aire/calefacción'], appliance: ['appliance technician', 'técnico de electrodomésticos'], lockout: ['locksmith', 'cerrajero'], other: ['handyman', 'técnico de mantenimiento'] }[category])[li];
  const where = ctx.unit ? `${unitName(ctx.unit.number)}, ${ctx.unit.address}` : 'unit not yet confirmed';
  const sentence = tenantText.replace(/\s+/g, ' ').trim().slice(0, 220);
  const title = emergency?.title || ({
    plumbing: 'Plumbing issue', electrical: 'Electrical issue', HVAC: 'Heating / cooling issue',
    appliance: 'Appliance issue', lockout: 'Tenant locked out', other: 'Maintenance request',
  }[category]) + (/faucet|grifo|llave del/i.test(tenantText) ? ': faucet' : /toilet|inodoro/i.test(tenantText) ? ': toilet' : /sink|lavabo|fregadero/i.test(tenantText) ? ': sink' : /fridge|refriger/i.test(tenantText) ? ': refrigerator' : /dishwasher|lavaplatos/i.test(tenantText) ? ': dishwasher' : /water heater|hot water|agua caliente/i.test(tenantText) ? ': no hot water' : '');

  let reply;
  if (emergency) reply = EMERGENCY_REPLY[emergency.kind][li];
  else if (needsInfo) reply = FOLLOWUPS[category][li];
  else reply = lang === 'es'
    ? `Gracias${ctx.tenant ? ', ' + first(ctx.tenant.name) : ''}. Ya tengo lo que necesito y estoy buscando a un técnico (${tradeWord}). Le escribo en cuanto haya un horario. Si algo cambia, responda aquí.`
    : `Thanks${ctx.tenant ? ', ' + first(ctx.tenant.name) : ''}. I've got what I need and I'm lining up a ${tradeWord}. I'll text you as soon as there's a time. If anything changes, just reply here.`;

  return {
    language: lang, category, urgency, urgency_reason: reason, needs_info: needsInfo,
    reply_to_tenant: reply, title,
    summary: `${sentence ? `Tenant reports: "${sentence}"` : 'Tenant reported a problem.'} Location: ${where}. Severity: ${urgency}.${lang === 'es' ? ' Tenant writes in Spanish.' : ''}`,
    diagnosis: diag, next_steps: steps,
    estimated_cost: costFor(category, urgency, tenantText),
    access_notes: /home|work|not home|at work|6/i.test(tenantText) && /work/i.test(tenantText) ? 'Tenant is at work; will be home around 6pm.' : 'Tenant to be contacted by the vendor to arrange entry.',
    other_language: detectOtherLanguage(tenantText),
    compensation_requested: false, // code-level detector in triage.js handles this in both modes
    identity_claim: { name, unit },
  };
}

// ---- vendor scoring (also the deterministic fallback when the model picks badly) ----
export function scoreVendor(v, { urgency, language, text }) {
  let s = 0; const why = [];
  const notes = (v.notes || '').toLowerCase();
  if (v.preferred) { s += 3; why.push('on your preferred list'); }
  if (language === 'es' && /spanish|español/.test(notes)) { s += 2; why.push('speaks Spanish'); }
  if (urgency !== 'routine' && /24\/7|emergency|after.?hours|same.?day|fast/.test(notes)) { s += 2; why.push('fast / available after hours'); }
  if (urgency !== 'routine' && /slower|next.?day/.test(notes)) { s -= 1; }
  if (/clog|drain|sewer|rooter/i.test(text) && /drain|sewer|rooter/.test(notes)) { s += 3; why.push('strong on drain and sewer work'); }
  const rate = parseFloat(String(v.rate || '').replace(/[^0-9.]/g, '')) || 100;
  s += (200 - rate) / 400;
  return { s, why };
}

export async function draftDispatch(ctx) {
  await pause(500 + Math.random() * 500);
  const text = `${ctx.ticket.summary} ${ctx.ticket.title}`;
  const ranked = ctx.vendors
    .map((v) => ({ v, ...scoreVendor(v, { urgency: ctx.ticket.urgency, language: ctx.ticket.language, text }) }))
    .sort((a, b) => b.s - a.s);
  const pick = ranked[0];
  const v = pick.v;
  const reasoning = `Chose ${v.name} (${v.trade}): ${pick.why.length ? pick.why.join(', ') : 'best available match for this trade'}.${v.notes ? ` Your note: "${v.notes}"` : ''}${ctx.note ? ` You asked: "${ctx.note}".` : ''} Urgency is ${ctx.ticket.urgency}: ${ctx.ticket.reasoning || ''}`;
  return { vendor_id: v.id, reasoning, text: buildText(ctx, v), estimated_cost: ctx.ticket.cost_estimate };
}

export function buildText(ctx, v) {
  const t = ctx.ticket, u = ctx.unit, tenant = ctx.tenant, co = ctx.company;
  // renting out your own home: speak as the owner, not as a management company
  const intro = ctx.homeMode ? `this is ${co.pm_name}, the owner of ${u?.address || 'the house'}.` : `this is ${co.pm_name} at ${co.name}.`;
  const p = ctx.prefs.draft;
  const urgencyLine = t.urgency === 'emergency' ? 'EMERGENCY, please respond immediately' : t.urgency === 'urgent' ? 'URGENT, same/next-day if possible' : 'Routine, next available appointment';
  const access = ctx.accessAllowed
    ? `Access: ${t.access_notes || 'Call the tenant to arrange entry.'}${t.category === 'lockout' ? ' Tenant identity verified against the lease on file (phone number matches).' : ''}`
    : `Access: Do NOT enter the unit until our office confirms with the tenant. Call ${co.pm_name} at ${co.phone}.`;
  const who = [p.tenant_name && (tenant?.name || 'Unconfirmed'), p.tenant_phone && tenant && fmtPhone(tenant.phone)].filter(Boolean).join(' · ');
  const lines = [
    p.priority && `Priority: ${urgencyLine}`,
    `Job: ${t.summary}`,
    p.cause && `Likely cause: ${t.diagnosis}`,
    p.address && `Address: ${u?.address}, ${unitName(u?.number)}${u?.neighborhood ? ` (${u.neighborhood})` : ''}`,
    (who || (p.language && t.language === 'es')) && `Tenant: ${who}${p.language && t.language === 'es' ? `${who ? ' ' : ''}(prefers Spanish)` : ''}`.trim(),
    // an unverified texter is a safety rule, so access guidance is shown even if switched off
    (p.access || !ctx.accessAllowed) && access,
    p.photos && ctx.mediaCount > 0 && `Photos/videos: ${ctx.mediaCount} from the tenant ${ctx.mediaCount === 1 ? 'is' : 'are'} attached.`,
    p.footer.trim() && p.footer.trim(),
  ].filter(Boolean).join('\n');
  const ask = `Please confirm you can take this job and tell us when you can be there.${p.cost_cap ? ` Call us before going over $${p.cost_cap_amount || t.cost_estimate || 500}.` : ''}`;
  const sign = p.signature ? `\n\nThank you,\n${co.pm_name}, ${co.name} · ${co.phone}` : '';
  return `Hi ${v.name} team, ${intro}${p.work_order ? ` New work order #${t.id}.` : ''}${p.intro.trim() ? ` ${p.intro.trim()}` : ''}\n\n${lines}\n\n${ask}${sign}`;
}

export async function generateTenantMessage({ scenario, language }) {
  await pause(250);
  return language === 'es' && scenario.es ? scenario.es : scenario.en;
}

export { pickScenario, SCENARIOS };

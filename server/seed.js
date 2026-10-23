// Sample company, vendors, properties, tenants, and ten tickets in various states.
// Timestamps are relative to "now" so the demo always looks alive. Re-run via "Reset demo data" in the UI.
import { db } from './db.js';
import * as S from './store.js';
import { buildText } from './mockAi.js';

const COMPANY = {
  name: 'Sunset Property Management', pm_name: 'Elena Ruiz', phone: '(323) 555-0142',
  email: 'elena@sunsetpm.example', address: '1802 Sunset Blvd, Echo Park, Los Angeles, CA 90026',
  maintenance_line: '(323) 555-0100',
};

const VENDORS = [
  ['Rivera Plumbing', 'plumber', '(323) 555-0201', 'dispatch@riveraplumbing.example', '$95/hr', 1, 'Fast and reliable, 24/7 emergency line. Speaks Spanish. Prefers text messages.'],
  ['Bluebird Plumbing & Rooter', 'plumber', '(213) 555-0202', 'office@bluebirdrooter.example', '$85/hr', 0, 'Great on drain clogs and sewer lines. Slower scheduling, usually next-day.'],
  ['Bright Spark Electric', 'electrician', '(323) 555-0203', 'jobs@brightspark.example', '$110/hr', 1, 'Licensed, handles panel work. Weekdays only.'],
  ['Volt & Sons Electric', 'electrician', '(818) 555-0204', 'hello@voltandsons.example', '$100/hr', 0, 'Does evenings and weekends. Available after hours for emergencies (+$75 call-out).'],
  ['CoolAir Heating & AC', 'HVAC', '(323) 555-0205', 'service@coolairla.example', '$120/hr', 1, 'Services all brands. Ask for Danny. 24/7 during heat waves.'],
  ["Fix-It Frank Handyman", 'handyman', '(213) 555-0206', 'frank@fixitfrank.example', '$65/hr', 1, 'Small repairs, drywall, doors, caulking. Good for smell and mold checks.'],
  ['SafeKey Locksmith', 'locksmith', '(323) 555-0207', 'dispatch@safekey.example', '$140 flat call-out', 1, '24/7. Always confirm tenant identity with us before opening a door.'],
  ['Appliance Doctors LA', 'appliance', '(213) 555-0208', 'book@appliancedoctors.example', '$65 diagnostic + $90/hr', 1, 'Fridges, washers, dishwashers, ranges. Usually same or next day.'],
  ['Golden State Builders', 'general', '(818) 555-0209', 'bids@goldenstatebuilders.example', '$125/hr', 0, 'Larger jobs: ceilings, water damage, remodels. Sends written quotes within 24 hours.'],
];

// name, address, neighborhood, owner, owner email, owning company, units
const PROPERTIES = [
  ['Rosewood Gardens', '4521 Rosewood Ave, Los Angeles, CA 90004', 'Larchmont', 'Harold Feinberg', 'harold@feinbergholdings.example', 'Feinberg Holdings LLC', ['1A', '1B', '2A', '2B', '3A', '3B']],
  ['Lemoyne Bungalows', '1245 Lemoyne St, Los Angeles, CA 90026', 'Echo Park', 'Susan Park', 'susan.park@example.com', 'Park Family Trust', ['A', 'B', 'C', 'D']],
  ['Hyperion Terrace', '2830 Hyperion Ave, Glendale, CA 91206', 'Glendale', 'Daniel Okafor', 'dokafor@okaforproperties.example', 'Okafor Properties Inc.', ['201', '202', '203', '204', '205', '206']],
  ['Figueroa Flats', '5712 N Figueroa St, Pasadena, CA 91103', 'Pasadena', 'Gloria Mendoza', 'gloria@mendozarealty.example', 'Mendoza Realty Group', ['1', '2', '3', '4']],
];

// property index, unit, name, language
const TENANTS = [
  [0, '1A', 'Kevin Tran'], [0, '1B', 'Olivia Brooks'], [0, '2A', 'Marcus Johnson'], [0, '2B', 'Priya Nair'], [0, '3A', 'Tom Westbrook'], [0, '3B', 'Hannah Kim'],
  [1, 'A', 'Jasmine Carter'], [1, 'B', 'David Alvarez'], [1, 'C', 'Sofia Ricci'], [1, 'D', 'Ben Okonkwo'],
  [2, '201', 'Nora Fischer'], [2, '202', 'Chris Delaney'], [2, '203', 'Aaliyah Washington'], [2, '204', 'Grace Liu'], [2, '205', 'Jamal Reed'], [2, '206', 'Whitney Cho'],
  [3, '1', 'Rosa Hernandez', 'es'], [3, '2', 'Luis Ortega', 'es'], [3, '3', 'Megan Doyle'], [3, '4', 'Isaiah Brown'],
];

/** Small illustrated stand-ins for tenant photos/videos (so the demo needs no image files). */
const THEMES = {
  leak: ['#3b6df0', '#1b2a6b', '<ellipse cx="200" cy="215" rx="120" ry="22" fill="#9fc2ff" opacity=".55"/><path d="M200 70c28 44 46 70 46 96a46 46 0 0 1-92 0c0-26 18-52 46-96z" fill="#cfe3ff"/><rect x="150" y="30" width="100" height="26" rx="8" fill="#8fa3d9"/>'],
  drain: ['#5a5675', '#1f1b3a', '<ellipse cx="200" cy="160" rx="140" ry="60" fill="#d9d6ea"/><ellipse cx="200" cy="152" rx="110" ry="40" fill="#8f8aa8"/><circle cx="200" cy="150" r="12" fill="#2a2640"/>'],
  heater: ['#c9590a', '#4a1d05', '<rect x="140" y="40" width="120" height="190" rx="22" fill="#e8dccf"/><rect x="156" y="170" width="88" height="40" rx="8" fill="#a24b17" opacity=".7"/><circle cx="200" cy="90" r="14" fill="#a24b17"/>'],
  outlet: ['#7a7596', '#25213f', '<rect x="140" y="70" width="120" height="130" rx="16" fill="#efecf7"/><rect x="178" y="100" width="10" height="26" rx="3" fill="#2a2640"/><rect x="212" y="100" width="10" height="26" rx="3" fill="#2a2640"/><circle cx="200" cy="160" r="9" fill="#2a2640"/>'],
};
const art = (theme, kind) => {
  const [a, b, shapes] = THEMES[theme] || THEMES.drain;
  const play = kind === 'video' ? '<circle cx="200" cy="150" r="34" fill="#000" opacity=".5"/><path d="M190 132l30 18-30 18z" fill="#fff"/>' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/>${shapes}${play}</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
};

export function wipe() {
  for (const t of ['media', 'settings', 'status_history', 'messages', 'dispatches', 'tickets', 'tenants', 'units', 'properties', 'vendors', 'company']) {
    db.exec(`DELETE FROM ${t}`);
  }
  db.exec("DELETE FROM sqlite_sequence");
}

export function seed() {
  wipe();
  db.prepare('INSERT INTO company (id,name,pm_name,phone,email,address,maintenance_line) VALUES (1,?,?,?,?,?,?)').run(...Object.values(COMPANY));
  const insV = db.prepare('INSERT INTO vendors (name,trade,phone,email,rate,preferred,notes) VALUES (?,?,?,?,?,?,?)');
  VENDORS.forEach((v) => insV.run(...v));
  // One vendor reached through a person's own phone, to show company vs personal numbers
  db.prepare("UPDATE vendors SET personal_phone = '(323) 555-0291', primary_company = 0, primary_personal = 1 WHERE name LIKE 'Rivera%'").run();

  const unitIds = {}; const propIds = [];
  PROPERTIES.forEach(([name, address, hood, owner, email, owningCompany, units], pi) => {
    const pid = db.prepare('INSERT INTO properties (name,address,neighborhood,owner_name,owner_email,company,approval_limit) VALUES (?,?,?,?,?,?,500)').run(name, address, hood, owner, email, owningCompany).lastInsertRowid;
    propIds.push(pid);
    units.forEach((u) => { unitIds[`${pi}:${u}`] = db.prepare('INSERT INTO units (property_id, number) VALUES (?,?)').run(pid, u).lastInsertRowid; });
  });
  const tenants = {};
  TENANTS.forEach(([pi, unit, name, lang], i) => {
    const phone = `+1323555${String(101 + i).padStart(4, '0')}`;
    const id = db.prepare('INSERT INTO tenants (name,phone,unit_id,language) VALUES (?,?,?,?)').run(name, phone, unitIds[`${pi}:${unit}`], lang || 'en').lastInsertRowid;
    tenants[name] = { id, phone, unit_id: unitIds[`${pi}:${unit}`], language: lang || 'en' };
  });
  const vendor = (n) => db.prepare('SELECT * FROM vendors WHERE name LIKE ?').get(n + '%');
  const company = S.getCompany();

  function ticket(o) {
    const tn = o.tenant ? tenants[o.tenant] : null;
    const created = S.minsAgo(o.ago);
    const id = Number(db.prepare(
      `INSERT INTO tickets (tenant_id, unit_id, from_phone, channel, title, category, urgency, status, language, summary, diagnosis, next_steps,
        reasoning, trade, access_notes, cost_estimate, followup_rounds, verified, verification_asked, vendor_id,
        emergency_at, scheduled_for, flags, created_at, updated_at, resolved_at, internal_notes)
       VALUES (@tenant_id,@unit_id,@from_phone,'sim',@title,@category,@urgency,@status,@language,@summary,@diagnosis,@next_steps,
        @reasoning,@trade,@access_notes,@cost_estimate,@followup_rounds,@verified,@verification_asked,@vendor_id,
        @emergency_at,@scheduled_for,@flags,@created_at,@created_at,@resolved_at,@internal_notes)`,
    ).run({
      tenant_id: tn?.id ?? null, unit_id: tn?.unit_id ?? o.unit_id ?? null, from_phone: tn?.phone ?? o.phone,
      title: o.title, category: o.category, urgency: o.urgency, status: o.status, language: tn?.language || o.language || 'en',
      summary: o.summary ?? null, diagnosis: o.diagnosis ?? null, next_steps: JSON.stringify(o.steps || []), reasoning: o.reason ?? null,
      trade: o.trade ?? null, access_notes: o.access ?? null, cost_estimate: o.cost ?? null, followup_rounds: o.rounds || 0,
      verified: tn ? 1 : 0, verification_asked: o.verAsked ? 1 : 0, vendor_id: o.vendor ? vendor(o.vendor).id : null,
      emergency_at: o.urgency === 'emergency' ? created : null, scheduled_for: o.scheduled ?? null,
      flags: JSON.stringify(o.flags || []), created_at: created, resolved_at: o.resolvedAgo != null ? S.minsAgo(o.resolvedAgo) : null,
      internal_notes: o.internalNotes || '',
    }).lastInsertRowid);
    (o.msgs || []).forEach(([sender, body, ago, kind]) => S.addMessage(id, sender, body, { kind: kind || (sender === 'system' ? 'note' : 'sms'), at: S.minsAgo(ago) }));
    (o.history || []).forEach(([status, ago, note]) =>
      db.prepare('INSERT INTO status_history (ticket_id,status,note,created_at) VALUES (?,?,?,?)').run(id, status, note || null, S.minsAgo(ago)));
    for (const d of o.dispatches || []) {
      const v = vendor(d.vendor);
      const t = S.getTicket(id);
      const unit = S.getUnit(t.unit_id);
      const text = d.text || buildText({ company, ticket: t, unit, tenant: tn ? S.db_tenant(tn.id) : null, mode: 'vendor', accessAllowed: !!tn, prefs: S.getPrefs(), mediaCount: (o.media || []).length }, v);
      db.prepare('INSERT INTO dispatches (ticket_id,vendor_id,kind,text,reasoning,state,created_at,decided_at,response_due_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
        id, v.id, 'vendor', text, d.reasoning, d.state || 'pending', S.minsAgo(d.ago), d.decidedAgo != null ? S.minsAgo(d.decidedAgo) : null,
        d.dueIn != null ? S.minsFromNow(d.dueIn) : null);
    }
    (o.media || []).forEach(([kind, name, source, theme, ago]) => S.addMedia(id, { kind, name, source, url: art(theme, kind), at: S.minsAgo(ago) }));
    return id;
  }

  // 1. ACTIVE EMERGENCY: gas smell, draft waiting
  ticket({
    tenant: 'Priya Nair', ago: 14, title: 'Gas smell reported', category: 'plumbing', urgency: 'emergency', status: 'awaiting_approval', trade: 'plumber', vendor: 'Rivera', cost: 450,
    summary: 'Tenant smells strong gas near the kitchen stove. She has left the apartment and called SoCalGas. Severity: emergency, risk of fire/explosion. Access: tenant is outside the building.',
    diagnosis: 'Possible leak at the stove connector or a gas shutoff valve. SoCalGas will make the line safe; a plumber must repair and pressure-test the fitting.',
    steps: ['SoCalGas shuts off and checks the line', 'Plumber replaces connector or valve', 'Pressure-test before restoring gas'],
    reason: 'A gas smell is a danger to people in the building, so this is an emergency regardless of how it ends up.',
    access: 'Tenant is waiting outside. Meet at the front of the building.',
    msgs: [
      ['tenant', "I smell gas in my kitchen, it's really strong near the stove. Not sure what to do", 14],
      ['ai', "This sounds serious. Please leave the apartment right now and don't flip any switches or use flames. From outside, call 911 or SoCalGas at 1-800-427-2200. I'm alerting the office and getting help on the way.", 14],
      ['system', 'EMERGENCY flagged. Escalation step: the live product would page the property manager by phone right now. (Demo only, no call is placed.)', 14, 'note'],
      ['tenant', "ok I'm outside, called socalgas they said 30-45 min", 11],
      ['ai', "Thank you, I'm glad you're safe. Please stay outside until SoCalGas gives the all-clear. I'm lining up a plumber to repair the source and will keep you posted.", 11],
    ],
    history: [['new', 14, 'Text received'], ['triaged', 14, 'Read the text: plumbing, emergency'], ['dispatch_drafted', 13, 'Drafted dispatch to Rivera Plumbing'], ['awaiting_approval', 13, 'Waiting for your approval']],
    dispatches: [{ vendor: 'Rivera', ago: 13, reasoning: "Chose Rivera Plumbing: on your preferred list and your note says they have a 24/7 emergency line, which matters most for a gas leak. Urgency is emergency because a gas smell endangers everyone in the building, so I'd recommend approving this right away." }],
  });

  // 2. Awaiting approval (routine, vendor chosen on notes)
  ticket({
    tenant: 'Jamal Reed', ago: 55, title: 'Slow kitchen sink drain', category: 'plumbing', urgency: 'routine', status: 'awaiting_approval', trade: 'plumber', vendor: 'Bluebird', cost: 175,
    summary: 'Kitchen sink drains very slowly and water sits in the basin. Tenant already tried drain cleaner twice. Severity: routine, no active leak. Access: tenant works from home most days.',
    diagnosis: 'Likely a grease or food clog in the trap or branch line. Chemical cleaner hasn\'t cleared it, so it likely needs snaking.',
    steps: ['Plumber snakes the kitchen drain', 'Check trap and under-sink connections for leaks', 'Run water to confirm flow'],
    reason: 'No active leak and the tenant has other drains to use, so it can be scheduled normally.',
    access: 'Tenant works from home most days; call ahead.',
    media: [['photo', 'sink-standing-water.jpg', 'text', 'drain', 54], ['video', 'drain-gurgling.mp4', 'email', 'drain', 53]],
    msgs: [
      ['tenant', 'Kitchen sink draining really slow, water just sits there. Tried drano twice and nothing', 55],
      ['ai', "Thanks, Jamal. I've got what I need and I'm lining up a plumber. I'll text you as soon as there's a time. If anything changes, just reply here.", 54],
    ],
    history: [['new', 55, 'Text received'], ['triaged', 54, 'Read the text: plumbing, routine'], ['dispatch_drafted', 53, 'Drafted dispatch to Bluebird Plumbing & Rooter'], ['awaiting_approval', 53, 'Waiting for your approval']],
    dispatches: [{ vendor: 'Bluebird', ago: 53, reasoning: "Chose Bluebird Plumbing & Rooter over your preferred plumber: your note says they're great on drain clogs, and this is routine so their next-day scheduling is fine. Rivera is the backup if Bluebird doesn't reply." }],
  });

  // 3. Over the owner's spend limit -> flagged for the PM to check with the owner
  ticket({
    tenant: 'Sofia Ricci', ago: 130, title: 'Water heater failing', category: 'plumbing', urgency: 'urgent', status: 'awaiting_approval', trade: 'plumber', vendor: 'Rivera', cost: 1450,
    summary: 'No hot water for two days. The water heater is making popping noises and there is rust-colored water at the bottom of the tank. Severity: urgent. Access: tenant is home evenings.',
    diagnosis: 'Heater is likely at end of life (sediment and corrosion). Repair is unlikely to hold; replacement is the realistic fix.',
    steps: ['Plumber confirms the heater needs replacing', 'You check the cost with the owner', 'Install new 40-gallon unit and haul away old one'],
    reason: 'No hot water affects daily life but is not dangerous. Treated as urgent, so within about a day.',
    access: 'Tenant is home evenings after 5pm.',
    msgs: [
      ['tenant', "No hot water for two days now. The water heater in the closet is making a popping noise and there's rusty water at the bottom of it", 130],
      ['ai', "Thanks, Sofia. I've got what I need and I'm lining up a plumber. I'll text you as soon as there's a time. If anything changes, just reply here.", 129],
      ['system', "Estimated cost $1,450 is over this property's $500 owner approval limit. Flagged for you to check with the owner; nothing was sent to anyone.", 128, 'note'],
    ],
    history: [['new', 130, 'Text received'], ['triaged', 129, 'Read the text: plumbing, urgent'], ['dispatch_drafted', 128, 'Drafted dispatch to Rivera Plumbing'], ['awaiting_approval', 128, 'Waiting for your approval']],
    flags: [{ type: 'over_limit', reason: "The estimate ($1,450) is over this property's $500 owner approval limit. Check with Susan Park before you approve the dispatch.", resolved: false, at: S.minsAgo(128) }],
    media: [['photo', 'heater-rust.jpg', 'text', 'heater', 129], ['photo', 'heater-label.jpg', 'upload', 'heater', 129]],
    dispatches: [{ vendor: 'Rivera', ago: 128, reasoning: 'Rivera Plumbing is preferred and fast on urgent jobs. Urgency is urgent because there has been no hot water for two days. The estimate is over this property\'s limit, so check with the owner before approving.' }],
  });

  // 4. Needs info (round 1)
  ticket({
    tenant: 'Olivia Brooks', ago: 9, title: 'Sink problem (details needed)', category: 'plumbing', urgency: 'routine', status: 'needs_info', trade: 'plumber', rounds: 1, cost: 180,
    summary: 'Tenant says her sink is broken. No details yet on which sink, whether it leaks, or how bad. Severity: unknown, assumed routine.',
    diagnosis: 'Cannot tell yet from the text.', reason: 'No sign of flooding or danger in the message; waiting on details.',
    msgs: [
      ['tenant', 'my sink is broken', 9],
      ['ai', 'Happy to help. Which sink or fixture is it, and is water leaking onto the floor or cabinet, or is it just not working right?', 9],
    ],
    history: [['new', 9, 'Text received'], ['triaged', 9, 'Read the text: plumbing, routine'], ['needs_info', 9, 'Asked the tenant a follow-up question (round 1 of 2)']],
  });

  // 5. Needs info (round 2, mid-conversation)
  ticket({
    tenant: 'Megan Doyle', ago: 42, title: 'AC not cooling', category: 'HVAC', urgency: 'urgent', status: 'needs_info', trade: 'HVAC', rounds: 2, cost: 380,
    summary: 'AC is not cooling the unit. Tenant says it is warm inside but has not said whether air is blowing. Severity: urgent while it is hot out.',
    diagnosis: 'Could be a thermostat, filter, capacitor, or refrigerant problem; a technician should diagnose on site.',
    reason: 'It is hot out and no cooling affects daily living, but no one is in danger.',
    msgs: [
      ['tenant', "AC isn't working", 42],
      ['ai', 'Sorry to hear that. Is the unit blowing any air at all, and how warm is it inside right now? Any idea how long it has been like this?', 42],
      ['tenant', 'its warm. since yesterday i think', 31],
      ['ai', 'Thanks, that helps. One last thing: is the thermostat screen turned on, and is the filter very dirty? A quick look can save you a service call.', 31],
    ],
    history: [['new', 42, 'Text received'], ['triaged', 42, 'Read the text: HVAC, urgent'], ['needs_info', 42, 'Asked the tenant a follow-up question (round 1 of 2)'], ['triaged', 31, 'Tenant replied'], ['needs_info', 31, 'Asked the tenant a follow-up question (round 2 of 2)']],
  });

  // 6. Spanish ticket, already dispatched: 15-minute vendor timer running
  ticket({
    tenant: 'Rosa Hernandez', ago: 28, title: 'Toilet clogged (Spanish)', category: 'plumbing', urgency: 'urgent', status: 'dispatched', trade: 'plumber', vendor: 'Rivera', cost: 220,
    summary: 'Tenant reports the only toilet is clogged and will not flush. Severity: urgent, no other bathroom. Tenant writes in Spanish. Access: tenant is home.',
    diagnosis: 'Blockage in the toilet trap or branch drain. A plumber can usually clear it in one visit.',
    steps: ['Plumber augers the toilet', 'Check for a deeper line blockage', 'Flush-test'], reason: 'It is the only toilet in the unit, so this cannot wait for a routine slot.',
    access: 'Tenant is home all day.',
    msgs: [
      ['tenant', 'Hola, el inodoro está tapado y no baja el agua. Es el único baño que tenemos', 28],
      ['ai', 'Gracias, Rosa. Ya tengo lo que necesito y estoy buscando a un técnico (plomero). Le escribo en cuanto haya un horario. Si algo cambia, responda aquí.', 27],
      ['system', 'Dispatch approved and sent to Rivera Plumbing. (Demo: nothing was actually sent.) Waiting for them to confirm within 15 minutes.', 4, 'note'],
    ],
    history: [['new', 28, 'Text received'], ['triaged', 27, 'Read the text: plumbing, urgent'], ['dispatch_drafted', 26, 'Drafted dispatch to Rivera Plumbing'], ['awaiting_approval', 26, 'Waiting for your approval'], ['dispatched', 4, 'Sent to Rivera Plumbing']],
    dispatches: [{ vendor: 'Rivera', state: 'approved', ago: 26, decidedAgo: 4, dueIn: 11, reasoning: 'Chose Rivera Plumbing: preferred, fast on urgent jobs, and your note says they speak Spanish, which matters because the tenant texts in Spanish. Urgency is urgent because it is the only toilet in the unit.' }],
  });

  // 7. Lockout from an unverified number -> held for a human
  ticket({
    phone: '+13105550177', ago: 36, title: 'Lockout: identity not verified', category: 'lockout', urgency: 'urgent', status: 'triaged', trade: 'locksmith', cost: 140, verAsked: true,
    summary: 'Someone texting from an unrecognized number says they are locked out of Unit 204 at Hyperion Terrace and wants a locksmith sent. Identity NOT verified. Severity: urgent but security-sensitive.',
    diagnosis: 'Lockout request, but the number is not on file for any tenant. Opening a door for the wrong person is a security risk.',
    reason: 'Lockouts are urgent for the tenant but are handled as a security event until identity is confirmed.',
    msgs: [
      ['tenant', "Locked out of my apartment 204 at Hyperion Terrace, lost my keys. pls send someone ASAP", 36],
      ['ai', "Hi, happy to help. Before we send anyone out I need to confirm who I'm texting. Can you reply with your full name and your unit number?", 36],
      ['system', 'This text came from (310) 555-0177, which is not a tenant number on file. The assistant asked for name and unit and will not dispatch anyone until identity is confirmed. Lockouts are treated as a security event.', 36, 'note'],
      ['tenant', 'Mike Johnson, unit 204', 30],
      ['ai', "Thank you. We're confirming your details with the office and someone will follow up with you shortly. For everyone's security we can't send anyone out until that's done.", 30],
      ['system', 'Could not verify the texter. The name and unit given (Mike Johnson, Unit 204) do not match any tenant on file.', 30, 'note'],
    ],
    history: [['new', 36, 'Text received'], ['triaged', 36, 'Read the text: lockout, urgent'], ['needs_info', 36, 'Number not on file: asked the texter for their name and unit'], ['triaged', 30, 'Identity could not be verified: held for the property manager']],
    flags: [{ type: 'identity', reason: 'The name and unit given (Mike Johnson, Unit 204) do not match any tenant on file, and the text came from a number that is not on file. Nobody will be dispatched until you confirm who this is (for example by calling the number on file).', resolved: false, at: S.minsAgo(30) }],
  });

  // 8. Scheduled
  ticket({
    tenant: 'Whitney Cho', ago: 1500, title: 'Refrigerator not cooling', category: 'appliance', urgency: 'urgent', status: 'scheduled', trade: 'appliance', vendor: 'Appliance', cost: 260, scheduled: 'tomorrow between 9 and 11 AM',
    summary: 'Refrigerator stopped cooling and the freezer is thawing. Severity: urgent (food spoilage). Access: tenant works from home.',
    diagnosis: 'Common causes are a failed start relay, defrost heater, or evaporator fan. Diagnosis visit needed.', steps: ['Technician diagnoses the fridge', 'Quote parts if needed', 'Repair and verify temperatures'], reason: 'Food spoils quickly, so within a day.',
    msgs: [
      ['tenant', 'My refrigerator stopped cooling and the freezer is starting to thaw. Food is going to spoil.', 1500],
      ['ai', "Thanks, Whitney. I've got what I need and I'm lining up an appliance technician. I'll text you as soon as there's a time. If anything changes, just reply here.", 1499],
      ['system', 'Appliance Doctors LA replied YES (simulated): tomorrow between 9 and 11 AM.', 1400, 'note'],
      ['ai', "Good news: Appliance Doctors LA is scheduled for tomorrow between 9 and 11 AM. We'll let you know if anything changes.", 1400],
    ],
    history: [['new', 1500, 'Text received'], ['triaged', 1499], ['dispatch_drafted', 1498], ['awaiting_approval', 1498], ['dispatched', 1430, 'Sent to Appliance Doctors LA'], ['scheduled', 1400, 'Appliance Doctors LA confirmed']],
    dispatches: [{ vendor: 'Appliance', state: 'accepted', ago: 1498, decidedAgo: 1430, reasoning: 'Appliance Doctors LA is your only appliance vendor and your note says same or next day, which fits a fridge that is thawing.' }],
  });

  // 9 & 10. Resolved
  ticket({
    tenant: 'Jasmine Carter', ago: 3100, title: 'Dripping bathroom faucet', category: 'plumbing', urgency: 'routine', status: 'resolved', trade: 'plumber', vendor: 'Rivera', cost: 150, resolvedAgo: 2800,
    summary: 'Bathroom faucet drips constantly. Severity: routine.', diagnosis: 'Worn cartridge.', reason: 'No leak damage, routine.',
    msgs: [['tenant', 'The bathroom faucet has been dripping for days, can someone look?', 3100], ['ai', "Thanks, Jasmine. I'm lining up a plumber and will text you with a time.", 3099], ['ai', 'Your maintenance request is marked complete. If anything doesn\'t look right, just reply to this message.', 2800]],
    history: [['new', 3100], ['triaged', 3099], ['dispatch_drafted', 3098], ['awaiting_approval', 3098], ['dispatched', 3080], ['scheduled', 3070], ['in_progress', 2820], ['resolved', 2800, 'Work complete']],
    dispatches: [{ vendor: 'Rivera', state: 'accepted', ago: 3098, decidedAgo: 3080, reasoning: 'Preferred plumber, routine job.' }],
  });
  ticket({
    tenant: 'Marcus Johnson', ago: 2000, title: 'Dead outlet in bedroom', category: 'electrical', urgency: 'routine', status: 'resolved', trade: 'electrician', vendor: 'Bright', cost: 160, resolvedAgo: 1250,
    summary: 'Bedroom outlet has no power; nothing is sparking or hot. Severity: routine.', diagnosis: 'Likely a tripped GFCI or loose connection.', reason: 'No heat, sparks, or burning smell reported.',
    msgs: [['tenant', 'outlet by my bed stopped working, nothing else is affected', 2000], ['ai', "Thanks, Marcus. I'm lining up an electrician and will text you with a time.", 1999], ['ai', 'Your maintenance request is marked complete. If anything doesn\'t look right, just reply to this message.', 1250]],
    history: [['new', 2000], ['triaged', 1999], ['dispatch_drafted', 1998], ['awaiting_approval', 1998], ['dispatched', 1960], ['scheduled', 1950], ['in_progress', 1270], ['resolved', 1250, 'Work complete']],
    dispatches: [{ vendor: 'Bright', state: 'accepted', ago: 1998, decidedAgo: 1960, reasoning: 'Preferred electrician, weekday job.' }],
  });
}

// `npm run seed` resets the database from the command line.
if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
  console.log('Demo data reset.');
}

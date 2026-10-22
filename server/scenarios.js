// Scenario pool for the "simulate incoming text" button. The AI turns a scenario into a fresh
// message; mock mode uses the hand-written text directly.
export const SCENARIOS = [
  // routine
  { urgency: 'routine', brief: 'dripping bathroom faucet', en: "Hi, the bathroom faucet in my apartment has been dripping for a few days now. Can someone take a look when they get a chance?", es: 'Hola, la llave del baño gotea desde hace unos días. ¿Pueden venir a revisarla cuando puedan?' },
  { urgency: 'routine', brief: 'vague: sink is broken', en: 'my sink is broken' , es: 'mi lavabo está descompuesto' },
  { urgency: 'routine', brief: 'vague: AC not working well', en: "AC isn't working right" , es: 'el aire acondicionado no funciona bien' },
  { urgency: 'routine', brief: 'slow shower drain', en: 'Shower drain in the bathroom is really slow, water pools around my feet. Been like this about a week.', es: 'El drenaje de la regadera está muy lento, el agua se acumula. Lleva como una semana así.' },
  { urgency: 'routine', brief: 'dishwasher not draining', en: "The dishwasher in the kitchen isn't draining, there's water sitting at the bottom after every cycle.", es: 'El lavaplatos de la cocina no drena, queda agua en el fondo después de cada ciclo.' },
  { urgency: 'routine', brief: 'lost keys', en: "I lost my keys somewhere and I'm at work right now, but I'll be home around 6. Can someone help me get in tonight?" },
  { urgency: 'routine', brief: 'weird smell in hallway', en: "There's a weird musty smell coming from the hallway closet in my unit. Not sure what it is, started this week." },
  { urgency: 'routine', brief: 'closet door off track', en: "The sliding closet door in my bedroom came off its track and won't close. No rush." },
  { urgency: 'routine', brief: 'garbage disposal jammed', en: "Garbage disposal just hums when I turn it on, I think something got stuck in it." },
  { urgency: 'routine', brief: 'light flickering', en: "The light in my living room keeps flickering on and off. Bulb is new so not that." },
  { urgency: 'routine', brief: 'washer won\'t spin', en: "The washer in my unit won't spin, clothes come out soaking wet. Started yesterday.", es: 'La lavadora no gira, la ropa sale empapada. Empezó ayer.' },
  // urgent
  { urgency: 'urgent', brief: 'no hot water', en: "We have had no hot water since last night. Cold showers aren't fun with two kids, please help.", es: 'No tenemos agua caliente desde anoche. Tenemos niños pequeños, por favor ayuden.' },
  { urgency: 'urgent', brief: 'only toilet clogged', en: "The toilet is clogged and won't flush, plunger didn't help. It's the only bathroom we have.", es: 'El inodoro está tapado y no baja el agua, ya intenté con el destapador. Es el único baño que tenemos.' },
  { urgency: 'urgent', brief: 'fridge stopped cooling', en: "My refrigerator stopped cooling and the freezer is starting to thaw. Food is going to spoil.", es: 'El refrigerador dejó de enfriar y el congelador se está descongelando.' },
  { urgency: 'urgent', brief: 'AC dead in heat wave', en: "AC completely died and it's 95 degrees out. The apartment is unbearably hot, I have a baby at home." },
  { urgency: 'urgent', brief: 'water dripping from ceiling', en: "Water is slowly dripping from the ceiling in my bathroom, there's a brown stain spreading. Think it's from the unit above." },
  { urgency: 'urgent', brief: 'locked out', en: "I'm locked out of my apartment, left my keys inside. Please send someone ASAP." },
  // emergency
  { urgency: 'emergency', brief: 'smell gas', en: "I smell gas in my kitchen, it's really strong near the stove. Not sure what to do", es: 'Huelo gas en mi cocina, está muy fuerte cerca de la estufa. No sé qué hacer' },
  { urgency: 'emergency', brief: 'burst pipe flooding', en: "A pipe burst under my kitchen sink and water is pouring out everywhere, it's already flooding the floor!!", es: '¡Se reventó un tubo debajo del fregadero y el agua está saliendo por todos lados, ya se está inundando el piso!' },
  { urgency: 'emergency', brief: 'sparking outlet', en: "The outlet in my bedroom was sparking and now there's a burning smell. I unplugged everything." },
  { urgency: 'emergency', brief: 'no heat freezing night', en: "No heat at all and it's freezing tonight, the heater won't turn on. My elderly mother lives with me." },
];

export function pickScenario(wantSpanish = false) {
  const r = Math.random();
  const urgency = r < 0.72 ? 'routine' : r < 0.95 ? 'urgent' : 'emergency';
  let pool = SCENARIOS.filter((s) => s.urgency === urgency);
  if (wantSpanish) {
    const es = pool.filter((s) => s.es);
    if (es.length) pool = es;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

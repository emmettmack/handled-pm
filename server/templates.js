// Fixed, pre-reviewed tenant messages (English / Spanish). Used where the wording must be exact:
// identity checks, compensation replies, lifecycle updates, and the liability-safe fallback.
const es = (l) => l === 'es';

export const T = {
  askIdentity: (l) =>
    es(l)
      ? 'Hola, con gusto le ayudo. Antes de enviar a alguien necesito confirmar con quién hablo. ¿Me puede responder con su nombre completo y el número de su apartamento?'
      : "Hi, happy to help. Before we send anyone out I need to confirm who I'm texting. Can you reply with your full name and your unit number?",

  identityHold: (l) =>
    es(l)
      ? 'Gracias. Estamos confirmando sus datos con la oficina y alguien le contactará en breve. Por seguridad no enviaremos a nadie hasta entonces.'
      : "Thank you. We're confirming your details with the office and someone will follow up with you shortly. For everyone's security we can't send anyone out until that's done.",

  compensation: (l) =>
    es(l)
      ? 'Entiendo su preocupación. Ya le pasé su solicitud al administrador de la propiedad, quien se comunicará con usted personalmente. Mientras tanto, seguimos coordinando la reparación.'
      : "I understand. I've passed your request along to the property manager, who will follow up with you personally. In the meantime we're still working on getting the repair lined up.",

  proceedAck: (l) =>
    es(l)
      ? 'Gracias, ya tengo lo que necesito. Estoy buscando al técnico adecuado y le escribo en cuanto haya un horario.'
      : "Thanks, I have what I need. I'm lining up the right person and will text you as soon as there's a time.",

  updateAck: (l) =>
    es(l)
      ? 'Gracias por el aviso. Ya se lo pasé al equipo y lo tendremos en cuenta.'
      : "Thanks for the update. I've passed it along to the team.",

  liabilitySafe: (l) =>
    es(l)
      ? 'Gracias por avisarnos. Estamos coordinando esto y le mantendremos al tanto.'
      : "Thanks for letting us know. We're getting this coordinated and will keep you posted.",

  /** Sent once when a tenant writes in a language other than English or Spanish. `l` is the language on their account. */
  translateNote: (l) =>
    es(l)
      ? 'Puedo escribirle en cualquier idioma usando traducción, pero mi idioma principal es el español, el que eligió al crear su cuenta.'
      : "I can text with you in any language using translation, but my primary language is English, the one set on your account.",

  scheduled: (l, vendor, when) =>
    es(l)
      ? `Buenas noticias: ${vendor} ya está programado para ${when}. Si algo cambia le avisamos.`
      : `Good news: ${vendor} is scheduled for ${when}. We'll let you know if anything changes.`,

  resolved: (l) =>
    es(l)
      ? 'Su solicitud de mantenimiento está marcada como completada. Si algo no quedó bien, solo responda a este mensaje.'
      : "Your maintenance request is marked complete. If anything doesn't look right, just reply to this message.",

  closedNoVerify: (l) =>
    es(l)
      ? 'No pudimos confirmar su identidad por este medio. Por favor llame a la oficina para continuar.'
      : "We weren't able to confirm your details by text. Please call the office and we'll take it from there.",
};

/** Phrases the AI must never send a tenant (money promises, fault). Matching sentences are removed. */
const LIABILITY = [
  /\b(we|i)('ll| will|'re going to| are going to)?\s*(pay|cover|reimburse|refund|compensate|credit|waive|reduce)\b/i,
  /\b(rent|payment)\s+(credit|reduction|discount|refund|abatement)\b/i,
  /\b(reimburse|reimbursement|refund|compensat\w+|make it up to you)\b/i,
  /\b(our|my|the (landlord|owner|management|company)'s)\s+(fault|mistake|responsibility|negligence)\b/i,
  /\bwe('re| are)\s+(responsible|liable|at fault|to blame)\b/i,
  /\b(it'?s|that'?s|this is)\s+(on us|our (fault|bad|mistake))\b/i,
  /\b(pagaremos|cubriremos|reembols\w+|compensaci\w+|devolver\w* (el )?dinero|cr[eé]dito en (la )?renta|descuento en (la )?renta|nuestra culpa|somos responsables|es nuestra responsabilidad)\b/i,
];
export const violatesLiability = (s) => LIABILITY.some((re) => re.test(s));

/** Drops any sentence that promises money or admits fault; falls back to a neutral line if nothing is left. */
export function sanitizeTenantReply(text, lang) {
  const sentences = String(text || '').match(/[^.!?¿¡]+[.!?]*\s*/g) || [];
  const kept = sentences.filter((s) => !violatesLiability(s)).join('').trim();
  return kept || T.liabilitySafe(lang);
}

/** Detects a tenant asking for money, credits, or blame (so the human gets flagged). */
export const COMPENSATION_ASK =
  /\b(compensat\w+|reimburs\w+|refund|rent (credit|reduction|discount|break)|(reduce|lower|knock off|credit|waive) (my|the) rent|pay (me|for (my|the) (damage|hotel|stay|food|stuff|things))|(owe|owes) me|sue|lawyer|attorney|hotel (room|stay)|my (stuff|things|belongings|furniture|clothes) (is|are|got|were) (ruined|damaged|destroyed)|damages|reembols\w+|compensaci\w+|descuento en (la |mi )?renta|cr[eé]dito en (la |mi )?renta|abogado|me deben|pagar los da[ñn]os)\b/i;

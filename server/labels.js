// How a unit reads in messages and screens. A single home uses the unit name "Main", which reads as "Main house".
export const unitName = (number) => (/^main( house)?$/i.test(String(number ?? '').trim()) ? 'Main house' : `Unit ${number}`);

/**
 * The name vendors and owners see as the sender's business. Only a company name the user typed and confirmed counts,
 * and never anything that looks like a sign-in handle or email. Otherwise it's the person's own name, so a blank or
 * autofilled company field can't leak into a message.
 */
export function displayCompany(company) {
  const name = String(company?.name || '').trim();
  if (company?.name_confirmed && name && !/@/.test(name)) return name;
  return String(company?.pm_name || '').trim() || 'your property manager';
}

/** A problem with a company name the user typed, in plain language, or null. Used for managers (home owners don't need one). */
export function companyNameProblem(name, email) {
  const n = String(name || '').trim();
  if (n.length < 2) return 'Enter your company name. Vendors see it on every message.';
  if (n.length > 80) return 'That company name is too long (80 characters at most).';
  if (n.includes('@')) return 'That looks like an email address. Enter your company name instead.';
  if (n.toLowerCase() === 'my rentals') return 'Enter your real company name.';
  const handle = String(email || '').split('@')[0].toLowerCase();
  if (handle && n.toLowerCase() === handle) return 'That looks like your sign-in name. Enter your company name instead.';
  return null;
}

/** "this is Pat at Acme Rentals." or just "this is Pat." when there is no separate business name. */
export function senderLine(company) {
  const pm = String(company?.pm_name || '').trim() || 'your property manager';
  const biz = displayCompany(company);
  return biz === pm ? `this is ${pm}.` : `this is ${pm} at ${biz}.`;
}

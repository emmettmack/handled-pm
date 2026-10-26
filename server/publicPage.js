// Each account's public opt-in page: app.macalisto.com/t/<slug>. Public and server-rendered. It shows only the
// company name and the texting number; nothing else from the account is read.
import { runAs } from './accounts.js';
import { getCompany } from './store.js';
import { displayCompany } from './labels.js';
import { accountNumber, pageByAccount, accountForSlug, setPageSlug } from './registry.js';
import { DEFAULT_NUMBER, prettyNumber, renderOptinPage } from './optinPage.js';
import { currentAccount } from './accounts.js';

const RESERVED = new Set(['admin', 'api', 'text', 'www', 'app', 'macalisto', 'login', 'sign-in', 'sign-up']);
export const slugProblem = (s) => {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s)) return 'Use 3 to 40 lowercase letters, numbers or dashes.';
  if (/--/.test(s) || RESERVED.has(s)) return 'Pick a different link name.';
  return null;
};
export const slugify = (name) => String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');

const baseUrl = () => (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

/** For the signed-in account: its link, slug and number, creating a slug from the confirmed company name the first time. */
export function publicPageInfo() {
  const account = currentAccount();
  const c = getCompany();
  const company = c?.name_confirmed ? displayCompany(c) : null;
  let slug = pageByAccount(account);
  if (!slug && company) {
    const base = slugify(company);
    for (let i = 0; !slug && i < 20 && base.length >= 3; i++) {
      const cand = i ? `${base.slice(0, 36)}-${i + 1}` : base;
      if (slugProblem(cand) || accountForSlug(cand)) continue;
      setPageSlug(account, cand); slug = cand;
    }
  }
  const number = accountNumber(account);
  return {
    slug, company, number: prettyNumber(number || DEFAULT_NUMBER), usingDefaultNumber: !number,
    url: slug ? `${baseUrl()}/t/${slug}` : null, flyerUrl: slug ? `${baseUrl()}/t/${slug}?flyer=1` : null,
  };
}

export function updateSlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  const problem = slugProblem(s);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });
  const owner = accountForSlug(s);
  if (owner && owner !== currentAccount()) throw Object.assign(new Error('That link name is taken. Try another.'), { status: 409 });
  setPageSlug(currentAccount(), s);
  return publicPageInfo();
}

/** GET /t/:slug, no sign-in. */
export function servePublicPage(req, res) {
  const account = accountForSlug(req.params.slug);
  const info = account && runAs(account, () => { const c = getCompany(); return c?.name_confirmed ? { company: displayCompany(c) } : null; });
  if (!info) return res.status(404).type('text/plain').send('Page not found');
  res.set('Cache-Control', 'public, max-age=300').type('html')
    .send(renderOptinPage({ number: accountNumber(account) || DEFAULT_NUMBER, company: info.company, autoPrint: req.query.flyer === '1' }));
}

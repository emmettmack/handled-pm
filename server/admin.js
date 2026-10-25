// The admin API: for the person running Macalisto (not for landlords). Mounted under /api/admin and limited to the
// emails in ADMIN_EMAILS. It shows counts, setup state, usage and health for every account. It deliberately never
// returns tenant messages, tenant names or tenant phone numbers; the one exception is the per-account data export,
// which exists to answer a customer's own data request and is written to the audit log.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createClerkClient } from '@clerk/backend';
import { accountIds, accountFile, accountExists, closeAccount, rawDb, backupAll, DATA_DIR } from './db.js';
import { runAs, currentAccount, LOCAL_ACCOUNT } from './accounts.js';
import * as S from './store.js';
import * as R from './registry.js';
import { authEnabled } from './auth.js';
import { twilioConfigured, twilioNumber } from './sms.js';
import * as ai from './ai.js';

let clerkClient;
const clerk = () => (clerkClient ??= createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }));
const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });

// ---------- who is an admin ----------
const checked = new Map();
async function adminIdentity() {
  if (!authEnabled()) return process.env.NODE_ENV === 'production' ? null : { email: 'local-dev' };
  const id = currentAccount();
  const hit = checked.get(id);
  if (hit && Date.now() - hit.at < 5 * 60000) return hit.who;
  let who = null;
  try {
    const u = await clerk().users.getUser(id);
    const em = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId);
    const email = em?.emailAddress?.toLowerCase();
    if (email && em.verification?.status === 'verified' && adminEmails().includes(email)) who = { email };
  } catch { /* not an admin if Clerk can't vouch for them */ }
  checked.set(id, { who, at: Date.now() });
  return who;
}
export async function requireAdmin(req, res, next) {
  const who = await adminIdentity();
  if (!who) return res.status(403).json({ error: 'Admins only.' });
  req.admin = who;
  next();
}
export const adminMe = async (_req, res) => { const who = await adminIdentity(); res.json({ admin: !!who, email: who?.email || null }); };

// ---------- accounts ----------
async function allUsers() {
  if (!authEnabled()) return [];
  const out = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const r = await clerk().users.getUserList({ limit: 100, offset, orderBy: '-created_at' });
    const list = r.data ?? r;
    out.push(...list);
    if (list.length < 100) break;
  }
  return out.map((u) => ({
    id: u.id, banned: !!u.banned, createdAt: u.createdAt, lastSignInAt: u.lastSignInAt,
    name: [u.firstName, u.lastName].filter(Boolean).join(' '),
    email: u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress || u.emailAddresses[0]?.emailAddress || '',
  }));
}

function summary(id, user) {
  const base = { id, name: user?.name || '', email: user?.email || '', created: user?.createdAt || null, lastSignIn: user?.lastSignInAt || null, banned: !!user?.banned, hasUser: !!user || id === LOCAL_ACCOUNT };
  if (!accountExists(id)) return { ...base, opened: false, usage: {}, numbers: [] };
  return runAs(id, () => {
    const d = rawDb(id);
    const n = (sql) => d.prepare(sql).get().c;
    const setup = S.getSetup();
    return {
      ...base, opened: true, company: S.getCompany()?.name || '', mode: setup.mode, setupDone: setup.done,
      counts: {
        properties: n('SELECT COUNT(*) c FROM properties'), tenants: n('SELECT COUNT(*) c FROM tenants'), vendors: n('SELECT COUNT(*) c FROM vendors WHERE active = 1'),
        open: n("SELECT COUNT(*) c FROM tickets WHERE status NOT IN ('resolved','closed')"), total: n('SELECT COUNT(*) c FROM tickets'),
        awaiting: n("SELECT COUNT(DISTINCT ticket_id) c FROM dispatches WHERE state = 'pending'"),
        emergencies: n("SELECT COUNT(*) c FROM tickets WHERE urgency = 'emergency' AND status NOT IN ('resolved','closed')"),
      },
      lastActivity: d.prepare('SELECT MAX(updated_at) m FROM tickets').get().m || null,
      sizeKB: Math.round(fs.statSync(accountFile(id)).size / 1024),
      usage: R.metricsForAccount(id, 30),
      numbers: R.listNumbers().filter((x) => x.account_id === id).map((x) => x.number),
    };
  });
}

async function accountList() {
  const users = await allUsers();
  const byId = new Map(users.map((u) => [u.id, u]));
  const ids = new Set([...accountIds(), ...users.map((u) => u.id)]);
  if (authEnabled()) ids.delete(LOCAL_ACCOUNT); // the local development database isn't a customer
  return [...ids].map((id) => summary(id, byId.get(id)));
}

// ---------- system ----------
function dirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}
function systemInfo() {
  let disk = null;
  try { const s = fs.statfsSync(DATA_DIR); disk = { freeMB: Math.round((s.bavail * s.bsize) / 1048576), totalMB: Math.round((s.blocks * s.bsize) / 1048576) }; } catch { /* statfs unavailable */ }
  return {
    uptimeHours: Math.round(process.uptime() / 360) / 10,
    memoryMB: Math.round(process.memoryUsage().rss / 1048576),
    node: process.version,
    commit: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || null,
    dataMB: Math.round(dirSize(DATA_DIR) / 10485.76) / 100,
    disk,
    services: {
      sign_in: authEnabled(),
      texting: twilioConfigured(),
      texting_number: twilioNumber() || null,
      live_ai: !ai.aiStatus().mock,
      ai_model: ai.aiStatus().model,
      ai_last_error: ai.aiStatus().last_error,
      admin_emails: adminEmails().length,
    },
  };
}

// ---------- backups ----------
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP = 7;
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((n) => fs.statSync(path.join(BACKUP_DIR, n)).isDirectory()).sort().reverse()
    .map((name) => ({ name, files: fs.readdirSync(path.join(BACKUP_DIR, name)).length, sizeMB: Math.round(dirSize(path.join(BACKUP_DIR, name)) / 10485.76) / 100 }));
}
export async function runBackup() {
  const name = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(BACKUP_DIR, name);
  const done = await backupAll(dir);
  await R.backupRegistry(path.join(dir, 'registry.db'));
  for (const old of listBackups().slice(KEEP)) fs.rmSync(path.join(BACKUP_DIR, old.name), { recursive: true, force: true });
  return { name, accounts: done.length };
}
/** Daily backups, kept on the same disk as the data (so they protect against mistakes, not against losing the disk). */
export function startBackups() {
  const tick = () => { const last = listBackups()[0]; if (!last || Date.now() - Date.parse(last.name.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z/, 'T$1:$2:$3.$4Z')) > 23 * 3600000) runBackup().catch((e) => console.error('[backup]', e.message)); };
  setTimeout(tick, 60000);
  setInterval(tick, 3600000);
}

// ---------- the router ----------
const h = (fn) => async (req, res) => {
  try { const out = await fn(req, res); if (!res.headersSent) res.json(out ?? { ok: true }); } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
const COST = { sms: Number(process.env.COST_PER_SMS) || 0.012, ai: Number(process.env.COST_PER_AI_CALL) || 0.003, server: Number(process.env.COST_SERVER_MONTHLY) || 7 };
const who = (req) => req.admin?.email || 'admin';

export const router = express.Router();

router.get('/overview', h(async () => {
  const accounts = await accountList();
  const week = Date.now() - 7 * 86400000;
  const opened = accounts.filter((a) => a.opened);
  const sum = (f) => opened.reduce((s, a) => s + (f(a) || 0), 0);
  const usage = R.metricsTotals(30);
  const system = systemInfo();
  const backups = listBackups();
  const alerts = [];
  if (!system.services.texting) alerts.push({ level: 'warn', text: 'Texting (Twilio) is not connected, so no real texts are being sent or received.' });
  if (!system.services.live_ai) alerts.push({ level: 'info', text: 'Replies use the built-in sample AI. Add an Anthropic API key for live replies.' });
  if (system.services.ai_last_error) alerts.push({ level: 'warn', text: `The AI model last failed: ${system.services.ai_last_error}` });
  if (!backups.length) alerts.push({ level: 'warn', text: 'No backup has been made yet.' });
  else if (Date.now() - Date.parse(backups[0].name.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z/, 'T$1:$2:$3.$4Z')) > 36 * 3600000) alerts.push({ level: 'warn', text: 'The last backup is more than a day and a half old.' });
  if (system.disk && system.disk.freeMB < 200) alerts.push({ level: 'bad', text: `Disk space is low: ${system.disk.freeMB} MB free.` });
  const noNumber = opened.filter((a) => a.setupDone && !a.numbers.length).length;
  if (system.services.texting && noNumber) alerts.push({ level: 'info', text: `${noNumber} account(s) finished setup but have no texting number assigned (Texting tab).` });
  const emergencies = sum((a) => a.counts.emergencies);
  if (emergencies) alerts.push({ level: 'bad', text: `${emergencies} open emergency work order(s) across accounts.` });
  return {
    totals: {
      users: accounts.filter((a) => a.hasUser).length, opened: opened.length,
      neverOpened: accounts.filter((a) => !a.opened).length,
      newThisWeek: accounts.filter((a) => a.created && a.created > week).length,
      active7d: accounts.filter((a) => (a.lastSignIn && a.lastSignIn > week) || (a.lastActivity && Date.parse(a.lastActivity) > week)).length,
      setupDone: opened.filter((a) => a.setupDone).length,
      homeMode: opened.filter((a) => a.mode === 'home').length, managerMode: opened.filter((a) => a.mode === 'manager').length,
      properties: sum((a) => a.counts.properties), tenants: sum((a) => a.counts.tenants), vendors: sum((a) => a.counts.vendors),
      openOrders: sum((a) => a.counts.open), allOrders: sum((a) => a.counts.total), awaiting: sum((a) => a.counts.awaiting), emergencies,
      suspended: accounts.filter((a) => a.banned).length,
    },
    usage30d: usage,
    byDay: R.metricsByDay(14),
    cost30d: { sms: (usage.outbound_sms || 0) * COST.sms, ai: (usage.ai_calls || 0) * COST.ai, server: COST.server, rates: COST },
    alerts, system, backups: backups.length,
  };
}));

router.get('/accounts', h(async () => ({ accounts: await accountList() })));

router.get('/accounts/:id', h(async (req) => {
  const id = req.params.id;
  const user = (await allUsers()).find((u) => u.id === id);
  const s = summary(id, user);
  if (!s.opened) return { ...s, recent: [], vendors: [], propertiesList: [] };
  return runAs(id, () => {
    const d = rawDb(id);
    const co = S.getCompany();
    return {
      ...s, contact: { name: co?.pm_name, phone: co?.phone, email: co?.email }, // the customer's own business contact, not tenants'
      // work order titles only: no tenant names, phone numbers or message text
      recent: d.prepare('SELECT id, title, category, urgency, status, created_at FROM tickets ORDER BY id DESC LIMIT 15').all(),
      vendors: d.prepare('SELECT name, trade FROM vendors WHERE active = 1 ORDER BY name').all(),
      propertiesList: d.prepare('SELECT name, (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) units FROM properties p ORDER BY name').all(),
    };
  });
}));

router.post('/accounts/:id/suspend', h(async (req) => {
  if (!authEnabled()) throw fail('Sign-in service is not configured.');
  await clerk().users.banUser(req.params.id);
  R.logAudit(who(req), 'suspend', req.params.id);
}));
router.post('/accounts/:id/unsuspend', h(async (req) => {
  if (!authEnabled()) throw fail('Sign-in service is not configured.');
  await clerk().users.unbanUser(req.params.id);
  R.logAudit(who(req), 'unsuspend', req.params.id);
}));

// The customer's own data, for a data request (privacy law gives them the right to ask). Everything except photo/video contents.
router.get('/accounts/:id/export', async (req, res) => {
  try {
    const id = req.params.id;
    if (!accountExists(id)) throw fail('That account has no data.', 404);
    R.logAudit(who(req), 'export', id, 'full data export');
    const data = runAs(id, () => {
      const d = rawDb(id);
      const out = {};
      for (const t of ['company', 'vendors', 'properties', 'units', 'tenants', 'tickets', 'dispatches', 'messages', 'status_history', 'settings']) out[t] = d.prepare(`SELECT * FROM ${t}`).all();
      out.media = d.prepare('SELECT id, ticket_id, kind, name, source, created_at, LENGTH(url) AS bytes FROM media').all();
      return out;
    });
    res.setHeader('Content-Disposition', `attachment; filename="macalisto-${id}.json"`);
    res.json({ exportedAt: new Date().toISOString(), account: id, data });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.delete('/accounts/:id', h(async (req) => {
  const id = req.params.id;
  if (id === LOCAL_ACCOUNT) throw fail('The local account can’t be deleted here.');
  const user = (await allUsers()).find((u) => u.id === id);
  const expected = (user?.email || id).toLowerCase();
  if (String(req.body?.confirm || '').trim().toLowerCase() !== expected) throw fail(`Type ${expected} to confirm.`);
  if (id === currentAccount()) throw fail('You can’t delete your own account from here.');
  R.unassignAccount(id);
  closeAccount(id);
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(accountFile(id) + suffix, { force: true });
  if (user) await clerk().users.deleteUser(id);
  R.logAudit(who(req), 'delete_account', id, expected);
}));

// ---------- texting numbers ----------
router.get('/numbers', h(async () => ({ numbers: R.listNumbers(), configured: twilioConfigured(), line: twilioNumber() || null })));
router.post('/numbers', h(async (req) => {
  const { number, account_id: accountId, label } = req.body || {};
  if (!accountId || (!accountExists(accountId) && accountId !== LOCAL_ACCOUNT)) throw fail('Choose an account that has opened the app at least once.');
  const n = R.assignNumber(number, accountId, label);
  R.logAudit(who(req), 'assign_number', accountId, n);
  return { number: n };
}));
router.delete('/numbers/:number', h(async (req) => {
  const n = decodeURIComponent(req.params.number);
  R.unassignNumber(n);
  R.logAudit(who(req), 'unassign_number', '', n);
}));

// ---------- system, backups, audit, announcement ----------
router.get('/system', h(async () => systemInfo()));
router.get('/backups', h(async () => ({ backups: listBackups(), keep: KEEP })));
router.post('/backups', h(async (req) => { const r = await runBackup(); R.logAudit(who(req), 'backup', r.name, `${r.accounts} accounts`); return r; }));
router.get('/audit', h(async () => ({ audit: R.listAudit(150) })));
router.get('/announcement', h(async () => R.getKv('announcement', { text: '', level: 'info', active: false })));
router.put('/announcement', h(async (req) => {
  const a = { text: String(req.body?.text || '').slice(0, 300), level: ['info', 'warn'].includes(req.body?.level) ? req.body.level : 'info', active: !!req.body?.active };
  R.setKv('announcement', a);
  R.logAudit(who(req), 'announcement', '', a.active ? a.text : '(turned off)');
  return a;
}));

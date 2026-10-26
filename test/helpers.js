// Test harness. Every test file runs in its own process (node --test), so each file boots one real server
// against its own temporary data directory, with no Clerk, no Anthropic key, instant sample-AI replies, and a
// fake Twilio. Nothing here can reach a real phone, email address or API.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

/** A stand-in for api.twilio.com: records every text the app sends and serves a tiny image for media downloads. */
export function startFakeTwilio() {
  const sent = [];
  const state = { failWith: null }; // e.g. { code: 30034, message: '...' } makes the next sends fail like a carrier refusal
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/media/slow')) { setTimeout(() => { res.setHeader('content-type', 'image/jpeg'); res.end(Buffer.from('fake-image-bytes')); }, 1200); return; }
    if (req.url.startsWith('/media/')) { res.setHeader('content-type', 'image/jpeg'); return res.end(Buffer.from('fake-image-bytes')); }
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      sent.push({ url: req.url, auth: req.headers.authorization, ...Object.fromEntries(new URLSearchParams(body)) });
      res.setHeader('content-type', 'application/json');
      if (state.failWith) { res.statusCode = 400; return res.end(JSON.stringify(state.failWith)); }
      res.end(JSON.stringify({ sid: `SM${sent.length}` }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`,
    sent,
    state,
    close: () => new Promise((r) => server.close(r)),
  })));
}

/** Boot the real app. Call once per test file, before anything else imports server code. */
export async function boot({ real = true, twilio = false, env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macalisto-test-'));
  for (const k of ['ANTHROPIC_API_KEY', 'CLERK_SECRET_KEY', 'ADMIN_EMAILS']) delete process.env[k];
  Object.assign(process.env, { DATA_DIR: dir, DEMO_MODE: real ? '0' : '1', MOCK_AI_DELAY_MS: '0', NODE_ENV: 'test' }, env);

  let fake = null;
  if (twilio) {
    fake = await startFakeTwilio();
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'test-token', TWILIO_PHONE_NUMBER: '+15550001111', TWILIO_API_BASE: fake.url, TWILIO_ROUTES: JSON.stringify({ '+15550001111': 'local' }) });
  }

  const { app } = await import('../server/app.js');
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.PUBLIC_URL = base;

  const mods = {
    triage: await import('../server/triage.js'),
    store: await import('../server/store.js'),
    db: await import('../server/db.js'),
    accounts: await import('../server/accounts.js'),
    seed: await import('../server/seed.js'),
  };

  /** Call the JSON API as the (only) local account. */
  const api = async (method, p, body) => {
    const res = await fetch(`${base}/api${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  };

  /** POST an incoming text to the webhook exactly as Twilio would, signed with the test auth token. */
  const sms = async (params, { sign = true, signature } = {}) => {
    const p = { To: '+15550001111', MessageSid: `SM${crypto.randomUUID().replace(/-/g, '')}`, ...params };
    const url = `${base}/api/webhooks/sms`;
    const sig = signature ?? crypto.createHmac('sha1', process.env.TWILIO_AUTH_TOKEN).update(Object.keys(p).sort().reduce((s, k) => s + k + p[k], url)).digest('base64');
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(sign ? { 'x-twilio-signature': sig } : {}) }, body: new URLSearchParams(p) });
    return { status: res.status, text: await res.text(), sid: p.MessageSid };
  };

  const inbound = await import('../server/twilio.js');
  const whenIdle = async () => { await inbound.inboundIdle(); await mods.triage.whenIdle(); };
  const close = async () => { await new Promise((r) => server.close(r)); await fake?.close(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { api, sms, base, dir, fake, mods, whenIdle, close };
}

/** Run a function as the local account (for tests that poke the database directly). */
export const asLocal = (t, fn) => t.mods.accounts.runAs('local', fn);

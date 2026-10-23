# Macalisto: maintenance coordination for landlords and property managers

A sales demo of an AI maintenance line for anyone who rents out a home, from a single house to hundreds of doors.
Tenants text one number. The AI reads every message, triages it, asks follow-up questions when needed,
matches the job to the manager's own vendor list, and drafts the dispatch. **The manager only reviews and
approves. Nothing goes to a vendor or owner until a human taps Approve.**

> **This is a demo.** Tenant texts are simulated (no SMS provider is connected), and approving a
> dispatch does not send anything. See [Going live with Twilio](#going-live-with-twilio).

## Run it

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**.

`npm run dev` starts the API (port 3001) and the web app (port 5173) together. The database is created and filled
with sample data automatically on first launch (`data/handled.db`).

To run a single production-style server instead: `npm start`, then open http://localhost:3001.

## Where the Anthropic API key goes

```bash
cp .env.example .env
```

Open `.env` and paste your key after `ANTHROPIC_API_KEY=`, then restart `npm run dev`. The key is read only by the
backend (`server/ai.js`); it is never sent to the browser, and `.env` is gitignored. Ticket processing uses
Claude Haiku (`claude-haiku-5-5`). Override with `ANTHROPIC_MODEL` in `.env` if you want a different one.

## Mock mode (no key needed)

If `ANTHROPIC_API_KEY` is empty, the app still works end to end using rule-based sample responses
(`server/mockAi.js`). The header shows a yellow **Demo mode · sample AI replies** pill; with a key it shows a green
**AI live** pill with the model name. Mock mode understands the seeded scenarios and the "simulate" texts
(plumbing, electrical, heating/cooling, appliances, lockouts, English and Spanish, emergencies). It is meant to
make the UI demo reliably, not to match the real AI's range. If a live AI call fails mid-demo, that one step falls
back to the sample responses and the error is logged in the server console.

## Demo script

1. Open the dashboard. Note the red emergency banner (gas smell), the approval queue, and the stats.
2. **Ready for your OK**: open the gas-smell draft, read the "Why this vendor" box, click **Approve & send**.
3. Open **Olivia Brooks, "my sink is broken"** (needs info). Click one of the blue reply chips, or type as the tenant.
   Watch the AI re-triage, draft a dispatch, then approve it.
4. Click **Simulate incoming text** for a random new text (mostly routine, sometimes urgent, rarely an emergency).
   **Write your own** lets you pick the tenant and type anything, including Spanish, or an unrecognized number.
5. **Water heater failing** shows the spend cap: the estimate is over the owner's limit, so the draft is an owner
   approval request. Approve it, then use "Simulate: owner says yes" to get the vendor draft.
6. **Toilet clogged (Spanish)** has the vendor-response timer running. Use "Simulate: 15 min, no reply" to watch the
   AI draft a dispatch to the next-best plumber.
7. **Lockout: identity not verified** was held for a human because the number isn't on file.

Properties > **Reset demo data** puts everything back to the starting state with fresh timestamps.
Note: a text from a tenant who has a ticket waiting on their answer (Needs info) is treated as their reply to that
ticket, the same way a real SMS would be.

## How the hard rules are enforced

| Rule | Where |
| --- | --- |
| **Liability guardrail**: the AI never promises money, credits, or fault | Instructed in the prompt, and enforced in code: every tenant-facing AI reply is scanned and any offending sentence is removed (`server/templates.js`). Tenant requests for compensation are detected independently, answered with a fixed neutral message, and flagged for the manager. |
| **Tenant verification**: lockouts and access | The texter's number must match a tenant on file (`server/intake.js`, `server/triage.js`). If not, the AI asks for name and unit; if that doesn't verify, the ticket is held for the manager (nobody is dispatched). Even a matching name and unit is not accepted, because the phone number differs. Emergencies are not held, but the dispatch tells the vendor not to enter without office confirmation. |
| **Vendor re-dispatch**: 15 minute timer | `server/actions.js`. A scheduler checks every 5 seconds; a lapsed dispatch is marked "no response" and the next-best vendor is drafted (falls back to handyman/general if the trade is exhausted). |
| **Spend cap** | `draftAndQueue` in `server/triage.js`. Estimate over the property's limit produces an owner approval request instead of a vendor dispatch; the limit is editable under Properties. |
| **Spanish** | The AI replies in the tenant's language; vendor drafts and summaries stay in English and note the tenant's language preference. One Spanish ticket is seeded. |
| **Follow-up cap** | At most 2 follow-up rounds, then it proceeds with what it has. |

Design choice to know about: the AI's *replies to tenants* (follow-up questions, safety instructions, acknowledgments)
go out automatically, because waiting for approval would defeat the point of a maintenance line. Everything addressed
to a **vendor or owner** is a draft until approved. If you want tenant replies gated too, change `sendToTenant` in
`server/outbound.js` to store a draft instead.

## Going live with Twilio

All inbound texts, from any source, go through one function: `receiveInboundMessage({ channel, from, body })` in
`server/intake.js`. The demo's "simulate" buttons call it directly. To connect a real number:

1. Buy a Twilio number and set its "A message comes in" webhook to `POST https://your-host/api/webhooks/sms`.
   That route already exists in `server/index.js` and calls `receiveInboundMessage` with Twilio's `From` and `Body`.
2. Add Twilio request-signature validation to that route, and expose the server publicly (or use a tunnel in testing).
3. In `server/outbound.js`, call `twilio.messages.create(...)` inside `sendToTenant` (the comment shows where), keeping the
   `addMessage` line so the thread stays accurate. Do the same for vendor and owner messages inside
   `approveDispatch` in `server/actions.js`.
4. Add your Twilio credentials to `.env` (backend only).

Nothing else in the app changes: triage, the approval queue, and the timers don't know where a message came from.

## The public demo (GitHub Pages)

`site/` is the public site. Its "Live demo" tab opens `site/app/`, the real dashboard running entirely in the browser: the server's routes and logic run against an in-browser SQLite (sql.js), with the built-in sample AI replies. Each visitor gets a fresh copy of the sample data, nothing is shared or sent anywhere.

After changing anything in `client/` or `server/`, rebuild it and commit the output:

    npm run build:static

`render.yaml` is an optional blueprint for hosting the full Node server instead (needed only for live AI or real SMS).

## File map

```
package.json            scripts: dev, start, build, seed
.env.example            copy to .env; holds ANTHROPIC_API_KEY
server/
  index.js              Express app: all API routes, serves the built UI in production
  db.js                 SQLite connection and table definitions (better-sqlite3)
  store.js              Database helpers and the views the UI reads (ticket detail, queue, stats)
  seed.js               Sunset Property Management sample data (vendors, 20 units/tenants, 10 tickets)
  intake.js             THE intake layer: receiveInboundMessage(). Swap point for Twilio
  outbound.js           Outbound messages (demo: logged only). Swap point for Twilio
  triage.js             The AI flow and rule enforcement: classify, verify, follow-up, vendor match, draft, spend cap
  actions.js            Manager actions and timers: approve/edit/reject, owner OK, vendor timer and re-dispatch
  ai.js                 Anthropic calls (key read here only) with prompts; falls back to mock
  mockAi.js             Rule-based stand-in used when no key is set
  templates.js          Fixed English/Spanish tenant messages and the liability filter
  scenarios.js          Pool of simulated tenant texts
client/
  vite.config.js        Vite config (proxies /api to the server in dev)
  src/App.jsx           Shell, navigation, emergency banner, polling
  src/pages/Home.jsx    Stats, approval queue, attention list, pipeline
  src/pages/Ticket.jsx  Work order detail: conversation, summary, vendor, timer, history
  src/pages/Vendors.jsx Vendor list, add, edit, remove
  src/pages/Properties.jsx  Owner approval limits, demo reset
  src/components/       ApprovalCard, SimulateModal, Badges
  src/styles.css        All styling
data/                   SQLite file (created on first run, gitignored)
```

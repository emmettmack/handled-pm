# Macalisto remediation plan

Status: **draft for your approval. No feature code has been written.** Branch: `plan/phase-0`.

This plan covers the six Phase 1 bugs and features A to K from the PM review. It says what I found, how I'll build each item, the schema changes, the order, and where I think the review (or the brief) needs adjusting.

---

## 1. What I found

### Stack and how it fits together

| Piece | What it is today |
|---|---|
| Server | Node 24, Express 5, `better-sqlite3`. ESM. About 2,300 lines in `server/`. |
| Data | **One SQLite file per account** (`DATA_DIR/accounts/<clerk user id>.db`). `AsyncLocalStorage` (`server/accounts.js`) picks the file per request, so one account can't reach another's data. A small `registry.db` holds phone-number ownership, usage counters, audit log, announcement. |
| Auth | Clerk. `server/auth.js` verifies the session token and runs the request as that account. **Account id equals the Clerk user id, so one person = one account, no teams.** |
| SMS | `server/sms.js` (send, plain REST) and `server/twilio.js` (inbound webhook with signature check, vendor-reply detection, media download). Works against a fake Twilio in my tests. **Not connected to a real Twilio number** (see 4.5). |
| AI | `server/ai.js` calls the Anthropic SDK when `ANTHROPIC_API_KEY` is set, otherwise `server/mockAi.js` (rule-based canned replies). `server/triage.js` enforces the hard rules (liability filter, identity check, 2-round follow-up cap). **Hosted app currently has no key, so it runs on the mock.** |
| Client | React 19 + Vite. Hash routing. `client/src/pages/*`. |
| Hosting | Render web service `macalisto` (Starter, 1 GB disk) at `app.macalisto.com`. Marketing site and a **browser-only demo** on GitHub Pages at `macalisto.com`. |
| Jobs | `setInterval` loops (`actions.startScheduler`, `admin.startBackups`). No queue, no persistence of scheduled work. |

### Constraints that shape every feature

1. **The browser demo runs the same server code in WebAssembly** (`client/vite.static.config.js`, `client/src/demo/*`). Any server module the demo imports must stay browser-safe. Rule I'll follow: shared logic (`store`, `triage`, `actions`, `mockAi`, `routes`) stays portable. Anything Node-only (file storage, email, phone calls, signed-link portals, scheduler worker, crypto) lives in Node-only modules mounted from `index.js`, the way `admin.js` and `twilio.js` already are. The demo gets mock adapters or hides the feature.
2. **SQLite on one Render disk, one server instance.** Fine for now. Uploads (insurance PDFs, invoices, before/after photos) must not go into SQLite as base64 the way tenant photos do today. See F4.
3. **No tests, no CI, no migration framework.** Schema changes today are `ensureColumn(...)` calls, and the schema is **copied in two places** (`server/db.js` and `client/src/demo/schema.js`). That has to be fixed before the schema grows by a dozen tables.
4. **Disk space on your Mac is 98% full (4.2 GB free).** Browser test tooling (Playwright) needs a few hundred MB. See open questions.
5. **No email provider exists.** Owner approval links (D), insurance expiry warnings (F), entry notices (G) and "tenant can email" all need one. See SETUP_NEEDED.

---

## 2. Cross-cutting foundations (built once, used by everything)

These come first inside Phase 2 because features A to K all depend on them. Building them per-feature would mean doing the hard parts six times.

- **F1. Test harness.** Node's built-in `node:test` (no new dependency). An in-process test server with an injectable clock, a fake Twilio (records calls/texts), a fake email sender, a fake AI, and a temp `DATA_DIR` per test file. `npm test` runs everything. Optional browser smoke tests (see section 7).
- **F2. Migrations.** `server/migrations/NNN_name.js`, applied in order per account database and for `registry.db`, tracked in a `schema_version` table. Each migration is tested against fixture databases built from **historical schemas** (I'll snapshot the current one before changing anything). The browser demo's schema is generated from the same migrations at build time, deleting the copy in `client/src/demo/schema.js`.
- **F3. Jobs table and worker.** Replace ad-hoc `setInterval` with a persisted `jobs` table (`type`, `due_at`, `payload`, `attempts`, `locked_until`, `done_at`) and one worker that leases due jobs. Needed for escalation repeats (A), insurance expiry emails (F), preventive tasks (J), notice windows (G), and survives a restart. All handlers are idempotent. The clock is injectable for tests.
- **F4. File storage.** `storage.put/get/signedUrl` with a local-disk adapter (`DATA_DIR/files/<account>/<id>`, size and type limits) and an S3-compatible adapter stub. Tenant photos move out of SQLite in a migration (data URLs become files; the old `url` column keeps working until migrated).
- **F5. Signed links.** HMAC-signed, expiring, scoped tokens (`account`, `resource`, `scope`, `exp`, `nonce`) with a revocation table. Used by the vendor portal (B), tenant confirmation (B), owner approval (D) and entry notice acknowledgment (G). Public routes sit outside Clerk auth, rate limited, and never reveal anything beyond their one resource.
- **F6. Notifications.** One `notify({ to, channels: ['sms','email','call'], template, data })` with adapters (Twilio SMS, Twilio Voice, email provider) and a **delivery log** table (who, what, when, provider status). Mock adapters behind `NOTIFY_MODE=mock`. Honors tenant opt-out (STOP) and quiet-hours rules.
- **F7. Field encryption.** AES-256-GCM with `FIELD_ENCRYPTION_KEY` for lockbox/key codes (G). Key id stored with each value so the key can rotate.
- **F8. Accounts and memberships.** Registry tables `accounts`, `memberships(user_id, account_id, role)`, `invites`. Existing account ids (Clerk user ids) are preserved: the migration creates one account per existing database and an `owner` membership for that user. `authenticate` resolves the account from the membership instead of assuming user id = account id. **I'm putting the data model here in Phase 2 (not Phase K) because roles affect permission checks in every feature after it.** The team UI, assignment and reporting stay in K.

---

## 3. Phase 1: the six bugs

Branch `phase-1-bugs`. First commit is F1 + F2 (small), then the fixes, each with a failing test first.

### 3.1 Duplicate tickets

**Reproduced** (I'll commit the script as the first failing test in Phase 1): three identical lockout texts from `(310) 555-3156`:
- real-text channel (`sms`): merged to 1, but only because of a blunt rule (any open ticket from that number in the last 24 hours, whatever the problem was). A second, different problem would be glued onto the first.
- demo channel (`sim`): **2 tickets**. The merge rule only runs on `sms`.

**Other causes I found by reading the code**
- Twilio retries a webhook if it doesn't get a reply within about 15 seconds. `inboundSms` awaits photo downloads before replying, so a text with photos can be delivered twice and create two tickets. There is **no idempotency on `MessageSid`**.
- Merge looks at nothing but phone and recency; closed tickets are never considered; no "same issue" notion.

**Fix**
- New pure module `server/dedupe.js`: `findMatch({ phone, text, now, candidates })`.
  - Candidates: tickets from the same normalized phone (later, also household phones from H) that are **open**, or **resolved/closed within a grace window** (48 hours, a setting).
  - Same issue = same category from the classifier **and** lexical similarity of the text (token overlap, stopwords removed), or an exact repeat. A different category = new ticket.
  - Open ticket + same issue: **merge** (append to the conversation, bump `updated_at`, add a note "2 more messages").
  - Open ticket + ambiguous (category `other` or low similarity): merge if the last message was under 2 hours ago, else new ticket plus a "possible duplicate of #N" flag.
  - Closed within the grace window + same issue or "still broken / it came back" language: **reopen as a callback** (flag `callback`, status back to triaged). After the window: new ticket, linked "related to #N".
  - Exact same body from the same number within 10 minutes: dropped as a duplicate delivery.
- **Idempotency:** `inbound_messages(provider_sid UNIQUE, ...)`. A repeated `MessageSid` is acknowledged and ignored.
- **Webhook acknowledges immediately** with empty TwiML; processing (media download, AI) runs in the background through the existing per-ticket queue.
- Same matcher on every channel (`sms`, `sim`, later `email`).
- PM tool: **Merge work orders** (pick duplicates into one) for any that already exist. Plus a one-off script that finds likely duplicates in a database and prints them, run on a copy only.

**Tests:** same number same issue (merge); same number different issue (new); different number same issue (new, unless household); reply after close inside and outside the window (reopen / new); exact retry with the same `MessageSid` (one ticket); retry arriving while the first is still processing; photo-heavy text; concurrency (three simultaneous deliveries, one ticket).

### 3.2 Closed or unverified tickets show misleading data

**Where the $196 comes from:** `server/mockAi.js costFor()`. Lockouts have a base of $140, and anything urgent is multiplied by 1.4, which is $196. It is an invented number from the sample AI, written to `tickets.cost_estimate`, and the Ticket page shows it unconditionally, plus "Access: Tenant to be contacted by the vendor to arrange entry." even though nobody was verified or dispatched. With a live model the same field is the model's guess.

**Fix**
- Add `cost_estimate_source` (`ai_model`, `sample_rules`, `vendor_quote`, `invoice`). The UI shows the source next to the number: "AI estimate, not a quote" and the date.
- **In real (non-demo) accounts the sample-rules estimate is not shown at all.** Invented dollar figures belong only in the demo. Without a live AI key, a real account's estimate reads "No estimate yet."
- A pure `ticketView(ticket)` function decides which sections render:
  - Vendor, estimate and access sections show only if the texter was verified (`verified || identity_cleared`) **and** a dispatch was drafted or sent.
  - A ticket closed without verification shows "Closed. Not dispatched: the texter was never verified" in place of those fields.
  - The tenant line says "Unverified texter (310) 555-3156", never "tenant".
- AI summary text from before verification is relabeled "Unconfirmed".

**Tests:** view-model unit tests for each state (unverified/open, unverified/closed, verified/no dispatch, dispatched, resolved). A UI check that the Ticket page hides the fields.

### 3.3 Username in vendor drafts

**What I found:** `Setup.jsx` saves `name: me.name || co.name` for the company. There is no `autocomplete` attribute on the "Company name" box, so Chrome can autofill it with the saved username, and nothing stops a blank or username-like value from being saved. Then `buildText` writes `this is ${pm_name} at ${company.name}`. That matches your sample ("Emmett Mack at emack805"). I can't see your hosted database, so I'll confirm by checking the company row in a backup when you approve.

**Fix**
- New `displayCompany(company)` used everywhere drafts, owner links and vendor pages say who is writing: returns the company name only if it's confirmed (`name_confirmed = 1`, set when a user types and saves it) and not email-like; otherwise returns the person's name (home mode already says "the owner of …"). **Never** the Clerk username, email or local-part.
- Setup and Preferences require a company name for managers (home mode doesn't need one). Server validation: 2 to 80 characters, not an email, not a single token that equals the sign-in handle. `autoComplete="organization"` plus `data-lpignore` so password managers stop filling it.
- A banner in Preferences for existing accounts whose name isn't confirmed ("Add your company name. Vendors currently see only your name.").
- Migration: add `name_confirmed`; set to 0 for every existing account so the banner shows once.

**Tests:** draft text never contains the username/email local-part for blank, username-like and confirmed names; validation cases; migration on a fixture.

### 3.4 Vendor rate is free text

**Fix:** structured money, stored in cents.
- Columns on `vendors`: `rate_hourly_cents`, `rate_flat_cents`, `rate_trip_cents` (all nullable) plus `rate_notes` (free text). A vendor can have an hourly rate and a trip charge ("$65 diagnostic + $90/hr" becomes 6500 trip + 9000 hourly). Units are explicit in the UI: **Hourly**, **Flat job rate**, **Trip / diagnostic charge**.
- Validation: positive, at most 2 decimals, between $1 and $10,000. Server and client.
- Display everywhere through `formatRate(vendor)`: "$180 per hour", "$65 trip charge + $90 per hour", "$140 flat".
- **Migration** parses the old text where it can (`$95/hr`, `$140 flat call-out`, `$65 diagnostic + $90/hr`), keeps the original in `rate_notes` when unsure, and never deletes the old `rate` column until a later release.
- The vendor-scoring code uses the hourly rate when present.

**Tests:** parser fixtures from the real seed data, validation, formatting, migration.

### 3.5 Texting isn't connected (end-to-end audit)

Audit result, written up in full in `SETUP_NEEDED.md` (a Phase 1 deliverable):

1. No Twilio credentials or number on Render. Account has **$0.00 balance** and **no phone number**.
2. **No A2P registration** (US carriers block unregistered business texting). Requires privacy and terms pages and a consent line first. Those pages don't exist yet.
3. Webhook URL not set in Twilio: `https://app.macalisto.com/api/webhooks/sms`.
4. The number must be assigned to an account (Admin, Texting tab).
5. **Code gaps I'll close in Phase 1:** idempotency and immediate acknowledgment (3.1); **STOP/START/HELP keyword handling** and an opt-out table (carriers require it; outbound to an opted-out number is blocked); delivery-status callbacks so a failed text shows on the work order; per-number signature checking when several numbers exist.
6. **Email:** the goal says tenants "text or email." There is no inbound email at all. Needs an inbound-email service (parse webhook) and domain records at Squarespace. I'll build the inbound handler behind an adapter and document the account needed.
7. Anthropic key is not set, so replies come from the sample AI.

### 3.6 Tenant languages

**Supported set:** English `en`, Spanish `es`, Korean `ko`, Chinese Simplified `zh-Hans`, Chinese Traditional `zh-Hant`, Armenian `hy`, Tagalog `tl`, Vietnamese `vi`.

- One `languages.js` list (code, native name, script, direction) used by the tenant form, vendor form, templates, detection and tests. Tenant and vendor `language` columns accept these codes; existing `en`/`es` values stay valid.
- **AI replies to tenants** come back in the tenant's language: the triage prompt gets the language list and returns a code from it; the reply is written in that language.
- **Fixed templates** (identity check, compensation, scheduled, resolved, emergency safety instructions and so on) get translations for all eight languages. I'll draft them, and a **test fails if any template key is missing in any language**. **They need review by native speakers before launch**, especially the emergency safety text (SETUP_NEEDED).
- **Vendor drafts stay in the vendor's language** (`vendors.language`, default English): the draft prompt says "write to the vendor in <language>"; the tenant's language is passed as context only ("tenant prefers Korean").
- **Detection** in live mode is the model's job. Mock mode gets Unicode-range detection (Hangul, Armenian, Han with a Simplified/Traditional character heuristic, Vietnamese diacritics, Tagalog common words). Mock is for the demo and tests only.
- **Real accounts without an AI key:** non-English/Spanish texts get an English acknowledgement plus a flag for the PM instead of pretending the sample AI can handle them. Decision recorded in `DECISIONS.md`.

**Tests:** template completeness; detection fixtures per language; round trip (Korean in, Korean reply, English vendor draft; Spanish-speaking vendor gets Spanish draft).

---

## 4. Features A to K

For each: design, schema, outside needs, tests, risk.

### A. Emergency path (highest priority)

**Definition.** A true emergency is one of: active flooding, gas smell, no heat in freezing weather, fire or smoke, sewage backup, security breach, no water, electrical hazard. One list in code (`emergency.js`) used by the prompt, the mock and the tests. Each type has an owner-approved safety template in every language, written as fixed text and **not** generated by the model (see section 8).
- **Safety instructions** per type, sent instantly to the tenant: water (shut the valve, move valuables), gas (leave, no switches or flames, call the gas company from outside, call 911 if you feel unwell or hear or smell a lot), fire/smoke (get out, call 911), sewage, electrical, break-in (call 911), no heat, no water. **The code guarantees 911 is mentioned wherever life safety is involved and that no text tells anyone not to call 911** (output filter plus a test over every template and language).
- **On-call schedule:** `oncall_people` (name, phone, email, optional user link), `oncall_shifts` (person, start, end, tier primary/backup), weekly repeating pattern plus overrides, time zone aware. "Who is on call now" is a tested pure function.
- **Escalation engine** (on the jobs table, F3): on an emergency, immediately text and **call** the on-call person (Twilio Voice with a spoken message and "press 1 to acknowledge"; also reply ACK by text). If no acknowledgment, repeat every N minutes up to M times (settings), then roll to the backup, then keep trying the backup, then flag red on the dashboard. Acknowledgment stops the loop.
- **Optional auto-dispatch** to a designated emergency vendor, **off by default, turned on per property** in settings. Uses a fixed dispatch template, a spend cap, and still logs for the PM. This is the only path that sends to a vendor without an approval tap, and it is never used for owners.
- **Full log** table `emergency_events` (ticket, step, who, channel, time, provider status, answered by) shown on the ticket and in reports.

**Schema:** `oncall_people`, `oncall_shifts`, `emergency_events`, property columns (`auto_dispatch_enabled`, `emergency_vendor_id`, `emergency_spend_cap_cents`), account settings for repeat counts and intervals.
**Outside needs:** Twilio voice-capable number; call callbacks need a public URL (we have it). Test mode uses a fake Twilio.
**Tests:** classification fixtures with real-sounding texts per emergency type and per language, including near-misses ("my faucet drips"), "never discourage 911" over every template, on-call resolution across time zones and shift boundaries, escalation state machine (ack on first call, ack after repeat, no ack rolls to backup), auto-dispatch off/on, end-to-end from text to escalation.

### B. Vendor completion loop

- **Vendor portal** at a signed, expiring link texted/emailed with the dispatch (no login): accept or decline, propose a time, upload before/after photos, notes, mark complete, submit an invoice (amount + file). Mobile-first, plain language, in the vendor's language.
- Status updates automatically (dispatched, accepted, scheduled, in progress, completed). Decline triggers the PM flag and the "draft to another vendor" path.
- **Tenant confirmation:** after completion, text the tenant "Is it fixed? Reply YES or NO" (signed link too). **NO reopens the work order and flags `callback`**, linked to the vendor's performance record (F).
- **Schema:** `vendor_jobs` (ticket, vendor, token id, state, proposed_time, accepted_at, completed_at), `job_files` (kind before/after/invoice, storage key), `completions`, `confirmations`.
- **Needs:** file storage (F4), signed links (F5), notifications (F6).
- **Tests:** token expiry, tampering, wrong-resource access, replay, each state transition, file limits, decline path, tenant NO reopens, end to end vendor flow.
- **Risk:** public endpoints and uploads. Rate limits, content-type sniffing, size caps, no execution of uploaded files, tokens never logged.

### C. Money layer

- **Invoices** tied to work orders (`invoices`: amount, source portal/manual, file, status submitted/approved/disputed/paid), **estimate vs actual** shown on the ticket with variance.
- **Approve / dispute flow** with a reason and a message back to the vendor through the portal.
- **Who pays:** `payer` = owner, tenant chargeback, warranty, company. Lockouts and tenant-caused damage **suggest** tenant chargeback (never automatic).
- **Optional management markup** per property (percent or flat) applied to billable totals.
- **CSV export** for accounting import: one flat format (date, property, unit, work order, vendor, description, payer, amount, markup, total, GL category) plus a QuickBooks-friendly column layout. I'll document that I can't verify any specific accounting product's import template offline, and test against the layout of its public docs when we get there.
- **Money rules:** integer cents everywhere; currency formatting in one helper.
- **Tests:** arithmetic with markups and rounding, variance, state transitions, chargeback suggestions, CSV escaping and totals.

### D. Owner approval flow

- When an estimate passes the property's owner limit the PM sees **Request owner approval**. Only the click sends anything. It creates a signed owner link and sends it to the owner's email/phone on file.
- The owner page shows the job, estimate (with its source), photos and the PM's note, with **Approve / Decline / Comment**. The decision is logged with timestamp, IP, and the exact text shown (`owner_decisions`).
- Approval clears the `over_limit` flag; decline flags the ticket for the PM. **Macalisto still never contacts an owner unless the PM clicks the button**, enforced by a test that exercises every code path.
- **Needs:** email provider (F6), signed links (F5).
- **Tests:** link scope and expiry, one decision per request (or explicit revision), no send without the click, decision logging, end to end.

### E. PM platform import and sync

- **CSV import** for properties, units, tenants (with phones), vendors: upload, **column mapping** (remembered), **preview** with validation errors per row, **duplicate detection** (same address, same phone, same vendor name+phone) with skip / update / create choices, and an undo for the last import.
- **Units as real records in the UI:** replace the comma-separated field with a unit list editor (add, rename, remove-if-empty). The schema already has a `units` table; the work is UI and API.
- **Adapter interface** `PlatformAdapter { listProperties, listUnits, listTenants, listVendors, (later) pushWorkOrder }` with: Buildium, AppFolio, Yardi, Rent Manager, Propertyware.
- **Which one to implement fully:** I believe **Buildium** has the most accessible public REST API (documented, key-based, sandbox), and AppFolio's partner APIs and Yardi's interfaces need partner agreements. **I will verify this against current documentation at the start of that phase before choosing**, because API access terms change. Everything runs against a mock that replays recorded sample payloads; the real client activates with credentials. Each platform's requirements go in `SETUP_NEEDED.md`.
- **Tests:** CSV parser edge cases (quotes, BOMs, odd phone formats), mapping, duplicate rules, import undo, adapter contract tests run against the mock, sync idempotency.

### F. Vendor compliance and performance

- **Compliance record** per vendor: insurance certificate upload with expiry date, license number, W-9 on file, workers' comp, properties served, after-hours availability.
- **Warn before dispatch** when insurance is expired or missing; a 30-day-before-expiry email to the PM (job on F3), then again at 7 days and at expiry.
- **Performance** computed from events, not typed in: time to accept, time to complete, callbacks (from B), average cost vs estimate (from C).
- **AI vendor suggestion** gets these as inputs and **shows the reasoning** ("Rivera: preferred, 2h average accept time, 1 callback in 20 jobs, insurance valid until 3/2027"). Scoring is deterministic code the model explains, so the same inputs give the same ranking.
- **Tests:** expiry date math, warning triggers, metric calculations on event fixtures, ranking determinism, dispatch warning UX.

### G. Entry and legal notice

- **Fields:** permission to enter, pets, lockbox/key code (**encrypted, shown only to the dispatched vendor for that job** through the vendor portal), tenant availability windows.
- **California notice (Civil Code 1954):** for non-emergency entry, generate a written notice with date, approximate time window and purpose, **at least 24 hours before entry**. Scheduling inside that window is **blocked** unless the tenant gave documented permission for that entry or it is an emergency.
- **The template is an editable setting.** `SETUP_NEEDED.md` will say plainly that **a lawyer must review the wording and the delivery method.**
- **Delivery caveat I want you to know about:** my understanding is that statutory "written notice" may require personal delivery, delivery to a suitable person at the unit, or posting on the door (with mailing), and that electronic delivery generally needs the tenant's written consent. So I'll build a per-tenant "consented to electronic notices" field, send by email/text only when that consent exists, and otherwise produce a **printable notice** and a task to post or deliver it, with a delivery-proof record. This needs attorney confirmation, so I'll make it configurable, not hard-coded.
- **Tests:** 24-hour boundary (23h59m vs 24h), time zones and DST, emergencies bypass, permission bypass is logged, key-code encryption round trip and access control (only the job's vendor, only while the job is active).

### H. Better identity verification

- **Household members** per unit (roommates, partners, adult kids) with phones; their texts are recognized as that unit.
- **One-time code:** an unknown number names a unit; Macalisto texts a 6-digit code **to a phone on file for that unit**; entering it back verifies the texter. Codes are hashed, expire in 10 minutes, five attempts, rate limited per number and per unit; the code is never sent to the unknown number.
- **Lockouts stay strict:** a lockout from an unverified number is **never dispatched**, whatever else happens. Enforced in the dispatch function itself, with a test.
- **Tests:** code generation, expiry, attempt limits, brute-force, wrong-unit claims, household recognition, lockout invariant under every path.

### I. Unit history and recurring issues

- **Unit page:** work order history, appliances (type, brand, model, install date, warranty end) and notes.
- **Repeat detection:** deterministic count of same-category jobs per unit per 12 months; the AI adds the wording ("third water heater call this year; consider replacing"). Flag on the work order and a "suggest replace vs repair" line. **Warranty check** compares today to the appliance's warranty end and flags "may still be under warranty."
- **Tests:** counting windows, warranty dates, flag text, history ordering.

### J. Preventive maintenance and turnovers

- **Recurring tasks** per property or unit (filters, smoke/CO detectors, gutters, pest control, inspections) with an interval; the job worker creates **draft** work orders on schedule (drafts only, never auto-sent).
- **Turnover workflow:** on move-out, a checklist (paint, clean, carpet, repairs, rekey) with vendor, cost and status per item, and a target ready date with a progress view.
- **Tests:** schedule math (monthly/quarterly/annual, month ends, DST), idempotent generation (restart doesn't duplicate), turnover state machine.

### K. Teams and reporting

- **Roles:** owner/admin, manager, coordinator, maintenance tech, on the F8 membership model. Permission matrix as data with tests (a tech sees assigned jobs only; a coordinator can't change billing or limits; only owner/admin invites).
- **Assignment** of work orders, per-person notification preferences, hooked to the on-call schedule from A.
- **Reporting page:** average response and completion time, cost per door, open work orders by age, repeat issues by property, vendor performance; filters by date range and property; CSV/printable export.
- **Tests:** permission matrix, assignment/notification routing, metric math on fixtures, filters.

---

## 5. Build order and checkpoints

| Phase | Branch | Contents |
|---|---|---|
| 0 | `plan/phase-0` | This plan, `DECISIONS.md` |
| 1 | `phase-1-bugs` | Test harness (F1), migrations (F2), bugs 3.1 to 3.6, `SETUP_NEEDED.md`, `CHANGELOG.md` |
| 2 | `phase-2-foundations` | Jobs (F3), storage (F4), signed links (F5), notifications (F6), encryption (F7), accounts/memberships (F8) |
| 3 | `phase-3-emergency` | A |
| 4 | `phase-4-vendor-loop` | B |
| 5 | `phase-5-money-owner` | C + D |
| 6 | `phase-6-import` | E |
| 7 | `phase-7-vendor-compliance` | F |
| 8 | `phase-8-entry-identity` | H + G (a **security review** happens before G stores key codes) |
| 9 | `phase-9-history-pm` | I + J |
| 10 | `phase-10-teams-reports` | K |

**Why this order differs from yours slightly:** foundations before the emergency path, because A needs jobs, notifications and on-call people, and building those inside A would make A hard to test. H comes before G because G's permission and notice logic needs verified household members. K's data model moves into Phase 2 (F8) even though its screens stay last.

**At every phase end:** all tests green, the feature clicked through in the running app, migrations run on copies of existing data, `CHANGELOG.md` updated, then I stop and ask before merging or deploying.

---

## 6. Migrations and data safety

- Migrations are forward-only, idempotent and run per account on first open, plus once on `registry.db`. No migration drops or rewrites real data; columns are added and backfilled, old columns are kept for at least one release.
- Test fixtures: I'll snapshot the **current** schema as `test/fixtures/schema-v0.sqlite` and build later fixtures from it. Each migration has a test that opens a v0 file, migrates it, and checks the data is intact.
- **Your real data:** I can't see Render's disk. Before any deploy that includes a migration I'll ask you to press **Back up now** on the Admin page; I'll add a **Download backup** button in Phase 1 so you can keep a copy off the server. Migrations also take their own automatic pre-migration copy of each account file.
- Daily backups already exist (same disk). Off-site copies go in `SETUP_NEEDED.md` as a recommended step.

---

## 7. Testing strategy

- **Unit tests** (`node:test`): pure logic (dedupe, ticket view, emergency classification, on-call resolution, 24-hour notice math, money, scheduling, permissions).
- **API end-to-end tests:** start the real server in-process against a temp data directory, with fake Twilio, fake email, fake AI and an injectable clock; drive each flow over HTTP (including signed Twilio webhooks and public portal links).
- **Browser smoke tests:** I'll click through every new screen with the browser tools I already use, and, if you're OK with the disk space, add a small Playwright suite (about 10 flows) so these checks repeat automatically.
- **Live-model evals** (optional, off by default): a handful of real tenant texts per emergency type and language run against the real model when `ANTHROPIC_API_KEY` is set, to catch prompt regressions. The tests above never need a key.
- `npm test` runs everything and must pass before I call a phase done.

---

## 8. Where I think the review (or the brief) should change

1. **The model must not write life-safety instructions.** The brief says "never let the AI tell someone not to call 911." The reliable way is for the model to *classify* and for **fixed, reviewed templates** to be sent, with a code-level check that 911 appears where life safety is involved. I'll do it that way for all eight languages.
2. **California Civil Code 1954 and delivery method.** See G. I'm confident about the 24-hour principle and the emergency exception; I'm **not** certain a text message counts as written notice. I'll build it configurable and flagged for a lawyer, not baked in.
3. **"Fully implement whichever PM platform has the most accessible API."** I'd verify current API terms before choosing rather than assume. Likely Buildium, but that's my recollection.
4. **Emergency auto-dispatch is the one place Macalisto sends to a vendor with no PM tap.** I've kept it opt-in per property, spend-capped and fully logged. I'd also recommend it start off in all new accounts and that the first enablement shows a plain-language warning. It never applies to owners.
5. **Invented estimates.** The review calls the $196 misleading; it's worse than that: it's a made-up number. Real accounts will show "No estimate" unless a live model or a vendor quote exists.
6. **Uploads can't live in SQLite as base64.** Moving files out is required work, and the 1 GB Render disk is small. S3/R2 is recommended before vendors start uploading photos and PDFs (SETUP_NEEDED).
7. **Scope and honesty about size.** This is a lot of product: six bug fixes plus eleven features, each with tests. Done properly it's many working sessions, not one. That's why every phase ends with a stop and a merge/deploy decision from you.
8. **Security review gate.** You asked earlier to postpone the security review. Before Phase 8 stores key/lockbox codes and Phase 3 opens public phone and portal endpoints, I recommend running it (I'll flag the exact point).

---

## 9. What I need from you (none of it blocks Phase 1 except the first)

1. **Go-ahead on this plan**, and tell me anything you want reordered.
2. **May I push branches to GitHub** (not main, no deploys) so work is backed up and reviewable, or keep everything local until you say? Default: local only.
3. **Disk space:** your Mac is at 98%. May I install Playwright (a few hundred MB), or should I rely on the browser tools?
4. **Accounts** (details in `SETUP_NEEDED.md` when written): Twilio funding and number, an email provider, an Anthropic key, S3-compatible storage, eventually PM platform credentials.
5. A **backup** from the Admin page before the first deploy that includes a migration.

## 10. Risk register

| Risk | Mitigation |
|---|---|
| A migration damages real data | Forward-only migrations, pre-migration file copies, tests on historical fixtures, backup before deploy |
| Public portal links leak or get guessed | Long random scoped tokens, expiry, rate limits, no PII in URLs, revocation |
| Emergency escalation fails silently | Delivery log, repeat and roll-over, red banner on no ack, tests with a fake clock |
| AI mistakes in non-English languages | Fixed reviewed templates for anything safety-related; flag-for-PM when no live model |
| Legal text is wrong | Editable templates, attorney review noted, consent-based electronic delivery |
| Browser demo breaks as server grows | Keep shared modules portable; Node-only features in their own modules; build the demo in CI-style checks |
| Scope creep | One phase at a time with a stop for your decision |

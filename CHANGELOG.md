# Changelog

## Unreleased: Phase 1 (branch `phase-1-bugs`)

Not merged, not deployed. Tested: 48 automated tests pass, plus a browser click-through of the demo and a new real account.

### Fixed
- **Duplicate work orders.** Texts from the same number now merge into one work order when they are about the same problem; "thanks" no longer opens a work order; "it's leaking again" soon after a close reopens it as a callback; the same problem days later opens a new work order linked to the old one. Twilio retries and double deliveries are recognised by message id and handled once. The webhook now answers immediately and does the work afterwards, so slow photo downloads no longer trigger retries.
- **Misleading closed or unverified work orders.** Estimate, vendor and access details only show when the texter was verified and something was drafted or sent. Otherwise the page says why. Every estimate shows its source. Real accounts without a live AI no longer show invented estimates.
- **Account name in vendor drafts.** Drafts use a company name only after the user has typed and confirmed one; otherwise the person's own name. The company box no longer autofills, managers must enter a name, and existing accounts see a banner asking for it.
- **Vendor rates.** Three optional structured amounts (hourly, flat job, trip or diagnostic charge) with validation, instead of free text. Existing rates are converted where they can be read.
- **Languages.** English, Spanish, Korean, Chinese (Simplified and Traditional), Armenian, Tagalog and Vietnamese for tenants and vendors, with every fixed message translated (needs native-speaker review). Replies to tenants come back in their language; vendor drafts are written in the vendor's language.
- **Texting.** STOP, START and HELP handling; people who opted out are not texted; delivery reports from the carrier show up as notes on failed texts.

### Added
- Merge duplicate work orders by hand ("A duplicate? Merge into another work order").
- `scripts/find-duplicates.mjs`: lists likely duplicates in a copy of a database.
- Admin: download a backup as one file.
- Forward-only database migrations (6 so far) with a copy of the old file taken before each upgrade; the browser demo uses the same migrations.
- Test harness and tests (`npm test`).
- `SETUP_NEEDED.md`.

### Found and fixed during the test run
- The Traditional versus Simplified Chinese check treated two characters that are written the same in both scripts as Simplified-only, so some Traditional text was misread.
- The sample AI's "another language" check still counted Korean, Chinese, Vietnamese and Tagalog as unsupported, so those tenants were told "my primary language is English" instead of receiving the reply in their language.
- Converting old vendor rates first overwrote the original wording; it is now kept in the vendor's rate notes.
- Added tests for rates, company names, the work-order view, translations, language detection, STOP/HELP and delivery reports.

## Inbox and file storage
- PM inbox: every conversation newest first with an unread dot, a thread view, a reply box that sends from the account's own number, and a per-conversation switch that pauses or hands back the assistant (replying pauses it automatically).
- A refused text (for example carrier error 30034 while registration is in review) is saved in the thread, marked not delivered, and explained to the PM; nothing crashes.
- Photos and videos are stored as files under DATA_DIR/files, served by short-lived signed links, and included in backups. Existing photos in the database are moved once at startup (file written before the row changes).
- Migration 7 adds tickets.ai_paused, tickets.pm_read_at, messages.direction, media.file, media.mime.

## Identity flow
- Unknown numbers are no longer stopped with "confirm who I'm texting". The assistant helps first, then asks once for name and address; a match on file links the work order to that tenant; otherwise the PM is told and approves as usual. Lockouts from people not on file still wait for the PM.

## Real conversation
- Every tenant message is answered by the model with the full conversation and photos; later messages no longer get a fixed acknowledgement. Photos reach the model (up to 4). Follow-up cap raised to 4. Photos are saved before the text is processed.

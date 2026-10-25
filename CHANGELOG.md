# Changelog

## Unreleased: Phase 1 (branch `phase-1-bugs`)

Not merged, not deployed. See DECISIONS.md D-011: this phase has not been fully tested.

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

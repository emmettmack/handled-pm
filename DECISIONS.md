# Decisions

Product and technical decisions made while planning, each with the reason. Newer entries go on top. If you disagree with one, say so and I'll change it.

## Phase 0 (planning)

**D-001. In real accounts, never show an invented cost estimate.**
The sample AI's rule-based estimate (for example a lockout at $140 × 1.4 = $196) is made up. It stays in the demo only. A real account shows "No estimate yet" unless a live model produced one or a vendor quote or invoice exists, and every estimate shows its source.
*Why:* a property manager can mistake a made-up number for a quote and repeat it to an owner.

**D-002. Life-safety instructions are fixed, reviewed text, not model output.**
The model classifies the emergency; the tenant receives a pre-written template for that type and language. Code checks that 911 is mentioned where life safety is involved and that no template discourages calling it.
*Why:* a wrong or creative safety instruction from a model is a liability and a real danger. Fixed text can be reviewed by a native speaker and tested.

**D-003. Emergency auto-dispatch is opt-in per property, spend-capped, fully logged, and never applies to owners.**
It is the only path that sends to a vendor without an approval tap. It is off by default and the first enablement shows a plain-language warning.
*Why:* it breaks the core "nothing goes out without approval" rule, so it should be a deliberate, narrow exception the PM chooses.

**D-004. Merge duplicate texts by same-number, same-issue, within a time window; reopen on "still broken" shortly after close.**
Same number and same category merges. A different category is a new ticket. A message within 48 hours of a close that reads like the same problem reopens it as a callback; after that it is a new ticket linked to the old one. Exact repeats within 10 minutes are dropped. Twilio's `MessageSid` makes retries idempotent.
*Why:* a PM would rather see one work order with several messages than three copies, but would also never want two different problems glued together.

**D-005. Real accounts without a live AI key do not pretend to handle non-English/Spanish languages.**
They get an English acknowledgement and a flag for the PM.
*Why:* the sample AI cannot read or write Korean, Armenian and the others reliably, and a wrong reply to a tenant is worse than a short honest one.

**D-006. Vendor rates are stored as cents in three optional fields: hourly, flat, trip/diagnostic charge.**
*Why:* real vendor pricing mixes these ("$65 diagnostic + $90/hr"), and one field with one unit cannot hold that.

**D-007. The company name shown to vendors must be one the user typed and confirmed.**
Otherwise drafts use the person's name. The sign-in username or email is never used.
*Why:* a username in a message to a vendor looks careless and leaks an identifier.

**D-008. Account membership data model is built in Phase 2, with the team screens later.**
Roles affect permission checks in every feature after it. Existing account ids (Clerk user ids) are kept.
*Why:* retrofitting permissions after nine features exist is far more work and more error-prone.

**D-009. Entry notices follow a per-tenant consent to electronic delivery; otherwise a printable notice and a delivery task.**
The template and delivery rules are editable settings and flagged for attorney review.
*Why:* it is not clear that a text counts as written notice under California law, so the safe default is not to assume it.

**D-010. Files (photos, PDFs, invoices) move out of the database into file storage.**
Local disk first, with an S3-compatible adapter ready.
*Why:* base64 in SQLite does not scale to vendor uploads and bloats every backup.

# Decisions

Product and technical decisions made while planning, each with the reason. Newer entries go on top. If you disagree with one, say so and I'll change it.

## Identity flow (after first real texts)

**D-017. An unknown number is helped first, then asked for name and address; it is no longer stopped at the start.**
The assistant answers the problem normally. Once it understands the issue it asks once for the texter's full name and address (with unit). If the name and unit match a tenant on file, the work order is linked to that tenant even though the phone is different. If they don't match, the PM is told in a note and still approves every dispatch. A lockout from someone who doesn't match anyone on file still waits for the PM. If they never give a name and address, the work order is held for the PM as before.
*Why:* the owner wants any household member to be able to text from any phone, and the number is only handed out to tenants. The dispatch approval tap, not the identity check, is the safety net. The lockout exception stays because a locksmith opening the wrong door is the one case that can't be undone.
*Replaces:* the up-front "confirm who I'm texting" message (askIdentity), which is no longer sent. The new message (askNameAddress, 8 languages) needs native-speaker review like the others.

## Phase 1 (bugs)

**D-011. Phase 1 was first written without running the test suite (owner request), then tested and fixed.**
The owner asked to save credits and only make code changes, then asked for a full test run and browser click-through. That found and fixed three real bugs (see CHANGELOG). The suite is now 48 tests and all pass.
*Why:* it was an explicit instruction; the cost was that three bugs sat undetected until the test run.

**D-012. Replies in languages outside English and Spanish are checked through an English copy, and fail closed.**
The money-and-fault filter can only read English and Spanish. For every other language the model must also return an English translation of its reply; if that is missing, or it promises money or fault, the fixed neutral message in the tenant's language is sent instead.
*Why:* a promise of money in Korean must not reach a tenant just because the filter can't read Korean.

**D-013. STOP, START and HELP are honored by the app as well as by Twilio.**
Twilio blocks texts to someone who replied STOP; the app also records it, skips sending, and tells the PM why. HELP gets a reply that names the service and explains STOP.
*Why:* carriers require it, and the PM needs to see why a tenant isn't getting texts.

**D-014. Delivery reports carry the account in the callback URL.**
Twilio's signature covers the whole URL including the account id, so a report can only be applied to the account that sent the text.
*Why:* one callback address serves every account, and it must not be possible to write into someone else's data.

**D-015. The same message again within ten minutes is stored once.**
It is treated as a duplicate delivery, not as the tenant repeating themselves.
*Why:* a tenant who texts the same words twice in a few minutes is far more likely a double send than two messages the PM needs to read twice.

**D-016. Existing accounts start with the company name unconfirmed.**
Vendors see the person's name until the user confirms a company name; a banner under Preferences asks for it. The demo company is pre-confirmed.
*Why:* we cannot tell from the data whether an existing name was typed deliberately or autofilled.

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

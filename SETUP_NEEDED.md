# What you need to set up

Things that need an account, a payment, or a decision from you. Nothing here can be done by the code alone.

## 1. Make texting work for real (the audit)

Today texting is **not connected**. These are the exact gaps, in order.

| # | What | Status | What to do |
|---|---|---|---|
| 1 | Twilio account has money and a number | Balance was $0.00 and no number | Add funds, then **Phone Numbers, Buy a number** (local, with **SMS** and **MMS**). Voice is not needed yet. |
| 2 | Carrier registration (A2P 10DLC) | Not started | In Twilio: **Messaging, Regulatory Compliance**. Choose the **sole proprietor** path if you have no company yet. It needs a privacy policy and terms on macalisto.com (not written yet) and a consent line. Approval can take days to weeks. |
| 3 | Twilio settings on Render | Not set | In Render, open the macalisto service, then **Environment**, and add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_PHONE_NUMBER` (like `+18055550100`). Paste the token yourself. `PUBLIC_URL` is already set to `https://app.macalisto.com`. |
| 4 | Incoming-text address in Twilio | Not set | On the number, set **A message comes in** to `https://app.macalisto.com/api/webhooks/sms` (HTTP POST). Delivery reports are requested automatically per message. |
| 5 | Number assigned to an account | Not done | Sign in once, then **Admin, Texting**, and assign the number to your account. With only one account it routes there automatically. |
| 6 | Anthropic API key | Not set | Create one at console.anthropic.com and add it in Render as `ANTHROPIC_API_KEY`. Without it replies come from the sample AI, which cannot handle most languages or unusual requests. |
| 7 | Privacy policy, terms, text-consent line | Not written | I need the name and contact email to put on them. A lawyer should review them. |

**What the code now does that carriers expect:** answers Twilio immediately (no more duplicate deliveries), honors STOP, START and HELP, remembers who opted out and never texts them, records delivery failures on the work order, and verifies every incoming request's signature.

**Email.** Tenants texting is covered above. Tenants *emailing* the maintenance line is not built, because it needs an inbound-email service (for example Postmark or SendGrid inbound parse) and records at your domain registrar. I will build the receiving side behind a clean adapter when you pick a provider.

## 2. Language review

Every fixed tenant message was translated into Korean, Chinese (Simplified and Traditional), Armenian, Tagalog and Vietnamese by me, not by a person. **Before launch, have a native speaker of each read `server/templates.js`**, especially the identity check, the compensation reply and the HELP text. The emergency safety messages (Phase 3) will need the same review.

## 3. Before this branch goes live

- Press **Back up now** on the Admin page, then **Download** it, so you have a copy off the server. (Every database upgrade also leaves a copy of the old file next to it on the server.)
- Run `npm test` and click through the app. See DECISIONS.md D-011.
- Existing accounts will see a banner asking them to confirm a company name.

## Coming in later phases (not needed yet)

Email provider, S3-compatible file storage (Cloudflare R2 or similar), a voice-capable Twilio number for emergency calls, PM-platform credentials (Buildium and others), and an attorney's review of the California entry-notice wording.

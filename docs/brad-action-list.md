# Brad action list

Everything below requires account ownership, billing consent, a secret, or an identity check that Codex cannot safely complete for you.

## Critical path

1. Start a Microsoft 365 Business Standard one-month trial in the controlled account.
   - Microsoft requires a credit card.
   - The trial automatically becomes paid after 30 days unless cancelled.
   - Keep the included `YOURTENANT.onmicrosoft.com` domain; no custom domain is needed.
   - Create at least two licensed users: `alex@YOURTENANT.onmicrosoft.com` and `connor@YOURTENANT.onmicrosoft.com`.
2. Create a Supabase project.
   - Run every SQL file in `supabase/migrations` in filename order in the SQL editor.
   - Run `supabase/seed.sql`.
   - Create Connor in Supabase Authentication using the same email address as Connor's Microsoft mailbox, then run the membership SQL from `docs/cloud-setup.md` with Connor's auth UUID.
3. Create an OpenAI API project/key and set a small project spend limit.
4. Create a single-tenant Entra Web app registration in the new Microsoft tenant.
   - Add delegated `User.Read`, `Mail.Read`, `Mail.Send`, and `Files.Read.All` permissions.
   - Grant admin consent.
   - Add the deployed callback URL shown in `docs/cloud-setup.md`.
5. Import `wexasmacdonald-ctrl/tripine` into Vercel and add every variable from `.env.example`.
6. Sign into Tripine as Connor once so his authenticated email becomes a verified internal identity. Then click **Connect Microsoft 365** and complete OAuth specifically as Alex.

## Demo data

1. Create a SharePoint site named `Demo Company` and a document library named `Sales`.
2. Add synthetic files:
   - `ABC Quote v2.docx` — older price.
   - `ABC Quote v3.docx` — current price of $18,500 and installation excluded/pending.
   - `Acme Supplier Pricing.pdf` — an 8% component increase.
3. Create a controlled external contact/mailbox for Sarah, if possible.
4. Send these Outlook fixtures:
   - Connor → Alex: direct research request about ABC and Sarah's reply.
   - Sarah → Connor, CC Alex: revised quote request, with no assignment to Alex.
   - Connor reply-all: “Alex is CC'd. He'll prepare it and send it over.”
   - Connor → Alex: a forwarded supplier chain with pricing change.
   - Connor → Alex: a message with a harmless PDF attachment.

## Before the call/demo

1. Visit `/api/readiness` while signed in as Connor. Every Boolean should be `true` and `failedDeliveries` should be `0`.
2. Confirm the Vercel deployment has a successful GitHub Quality check.
3. Send one direct test email to Alex and verify it appears in Tripine activity.
4. Ask “What happened with ABC?” in a new web conversation.
5. Draft an email in **External actions**, approve it once, and confirm it appears once in Alex's Sent Items.
6. Set a calendar reminder to cancel the Microsoft trial before day 30 if you do not want it to convert to paid.

## Bring back to Codex

Do not paste secrets into chat. When these are complete, report only:

- Microsoft tenant created: yes/no
- Alex and Connor mailbox addresses
- Supabase migration/seed completed: yes/no
- Vercel deployment URL
- Entra app registration configured: yes/no
- `/api/readiness` output with secret values omitted

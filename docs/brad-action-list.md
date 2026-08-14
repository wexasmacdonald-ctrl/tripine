# Brad action list

Current pickup list for the controlled Tripine feasibility demo. Do not paste passwords, one-time passwords, client secrets, or API keys into chat.

## Completed

- Microsoft 365 Business Basic trial is active for `tripine.onmicrosoft.com`.
- Licensed users exist for `alex@tripine.onmicrosoft.com` and `connor@tripine.onmicrosoft.com`.
- The Supabase project, migrations, seed data, and owner membership exist.
- GitHub and Vercel are connected at `https://tripine.vercel.app`.
- Supabase, OpenAI, tenant, callback, encryption, job, internal-identity, and recipient-allowlist settings are configured in Vercel.
- A single-tenant Entra app registration named `Tripine AI Employee Demo` was started.

## Your next 10-minute block

1. In the open Connor creation result, securely save Connor's one-time password. Do not send it in chat.
2. Open the `Tripine AI Employee Demo` app registration in Entra and report only its **Application (client) ID**.
3. Under **Authentication**, add this Web redirect URI:
   - `https://tripine.vercel.app/api/oauth/microsoft/callback`
4. Under **API permissions**, add delegated Microsoft Graph permissions:
   - `User.Read`
   - `Mail.Read`
   - `Mail.Send`
   - `Files.Read.All`
5. Grant admin consent for MacDonald AI. This is a tenant-wide permission decision, so it remains a manual owner action.
6. Under **Certificates & secrets**, create a short-lived client secret and enter it directly in Vercel as `MICROSOFT_CLIENT_SECRET`. Do not paste it into chat.
7. Enter the client ID directly in Vercel as `MICROSOFT_CLIENT_ID`, then redeploy Production.

## Connect Alex

1. Sign into `https://tripine.vercel.app` with the existing Supabase demo login.
2. Click **Connect Microsoft 365**.
3. Complete Microsoft OAuth specifically as `alex@tripine.onmicrosoft.com`.
4. Visit `https://tripine.vercel.app/api/readiness` while signed in. Every Boolean should be `true`, `graphPermissionsGranted` should be `true`, and `failedDeliveries` should be `0`.

## Seed synthetic workplace data

1. Create a SharePoint site named `Demo Company` and a document library named `Sales`; grant Alex access.
2. Add:
   - `ABC Quote v2.docx` — older price.
   - `ABC Quote v3.docx` — current price of $18,500; installation excluded/pending.
   - `Acme Supplier Pricing.pdf` — an 8% component increase.
3. Use only controlled mailboxes. Send:
   - Connor → Alex: direct research request about ABC and Sarah's reply.
   - Controlled Sarah → Connor, CC Alex: revised quote request, with no assignment to Alex.
   - Connor reply-all: “Alex is CC'd. He'll prepare it and send it over.”
   - Connor → Alex: forwarded supplier chain with pricing change.
   - Connor → Alex: harmless PDF attachment.

## Before recording

1. Verify the direct email creates one inbound interaction and one reply from Alex.
2. Verify CC-only mail is recorded but receives no Alex reply.
3. Ask “What happened with ABC?” in a new web conversation.
4. Verify explicit delegation creates open work.
5. Approve one exact controlled-recipient email and confirm one message in Alex's Sent Items.
6. Record `/api/readiness`, the Outlook flow, cross-channel chat, open work, activity, and approval flow.
7. Set an owner-controlled reminder before September 12, 2026 to review or cancel the Microsoft trial if it should not convert to paid.

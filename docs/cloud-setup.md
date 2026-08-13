# Real-credential cloud setup

Do not commit secrets. Enter them only in Vercel and the relevant provider dashboards.

## 1. Microsoft 365 demo tenant

Create or use a controlled Microsoft 365 Business tenant and provision:

- `alex@YOUR_DOMAIN`: licensed Exchange Online mailbox, OneDrive, and access to the demo SharePoint site.
- `connor@YOUR_DOMAIN`: licensed mailbox used to email Alex and a matching Tripine login.
- An optional controlled external mailbox representing Sarah.

Create a SharePoint site with realistic synthetic ABC Manufacturing documents. Add quote versions and grant Alex normal user access. Seed Outlook threads between the controlled accounts.

## 2. Supabase

Create a project and run every SQL file in `supabase/migrations` in filename order, followed by `supabase/seed.sql`, in the SQL editor.

In Authentication, create Connor with email/password and copy his user UUID. In SQL, run:

```sql
with org as (select id from public.organizations where slug = 'demo-company'),
connor as (
  insert into public.parties (organization_id, kind, display_name, is_internal)
  select id, 'human', 'Connor', true from org
  returning id, organization_id
)
insert into public.organization_members (organization_id, user_id, party_id, role)
select organization_id, 'REPLACE_WITH_AUTH_USER_UUID'::uuid, id, 'owner' from connor;
```

Copy the project URL, publishable key, and a new `sb_secret_...` key. The secret key stays server-side and bypasses RLS; never use a `NEXT_PUBLIC_` name for it.

## 3. OpenAI

Create an API project with a small spend limit. Copy its API key. Tripine calls the Responses API with `store: false`; Supabase remains the application state store.

## 4. Microsoft Entra application

Create a Web app registration in the demo tenant. Use single-tenant access if this tenant alone will be tested.

Add the production redirect URI:

`https://YOUR_VERCEL_DOMAIN/api/connections/microsoft/callback`

Add delegated Microsoft Graph permissions:

- `User.Read`
- `Mail.Read`
- `Mail.Send`
- `Files.Read.All`

Grant tenant admin consent if required. Create a client secret and copy its value immediately.

## 5. Vercel

Import `wexasmacdonald-ctrl/tripine`. Add all variables from `.env.example` for Production:

- `NEXT_PUBLIC_APP_URL=https://YOUR_VERCEL_DOMAIN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-5.6-terra`
- `MICROSOFT_TENANT_ID` (the tenant GUID)
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_REDIRECT_URI=https://YOUR_VERCEL_DOMAIN/api/connections/microsoft/callback`
- `MICROSOFT_GRAPH_CLIENT_STATE` (at least 32 random characters)
- `INTERNAL_JOB_SECRET` (at least 32 random characters)
- `CRON_SECRET` (at least 32 random characters; Vercel attaches this to cron calls)
- `CREDENTIAL_ENCRYPTION_KEY` (exactly 32 random bytes encoded as base64)
- `DEMO_ORGANIZATION_SLUG=demo-company`
- `DEMO_AGENT_EMAIL=alex@YOUR_DOMAIN`

Generate safe values in PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Generate separate values for the encryption key and each request secret. Redeploy after saving variables.

## 6. Connect Alex

Open:

`https://YOUR_VERCEL_DOMAIN/api/connections/microsoft/start`

Sign in specifically as Alex and consent. Tripine rejects a different mailbox when `DEMO_AGENT_EMAIL` is configured. The callback encrypts the renewable credential, stores the service-owned connection, and creates an Inbox subscription.

Verify:

- `/api/health` reports `connected` mode.
- `connections` contains Alex with `status = connected`.
- `connection_credentials` contains ciphertext, never plaintext tokens.
- `graph_subscriptions` contains an active Inbox subscription.

## 7. End-to-end test

1. Email Alex from Connor with Alex in `To`: ask about ABC and Sarah's reply.
2. Confirm `inbound_deliveries` becomes `processed`.
3. Confirm one inbound interaction and `email.received` event appear.
4. Confirm Graph search finds controlled Outlook and SharePoint evidence.
5. Confirm Alex replies as Alex. This auto-reply is allowed only for a verified same-domain sender, direct `To`, and no attachment.
6. Sign into Tripine as Connor and ask, “What happened with ABC?” The answer should use the persisted email interaction and activity.
7. CC Alex without directly delegating. Confirm Alex records the message but does not reply.
8. Open `/api/readiness` while signed in as Connor and confirm every Boolean check is true with zero failed deliveries.
9. Use the External actions card to create an exact outbound email approval, approve it once, and confirm a single message appears in Alex's Sent Items.

If background processing fails, invoke `POST /api/internal/graph/process` with `Authorization: Bearer INTERNAL_JOB_SECRET` and inspect `inbound_deliveries.last_error`.

## Current safety boundary

External recipients, forwards, attachments, changed recipients, and commitment-bearing messages are not auto-sent. The workspace can create immutable text-email approvals and execute them once through Alex's mailbox. Attachment approvals, approval editing/versioning, reply-all approvals, and automated Sent Items reconciliation remain postponed.

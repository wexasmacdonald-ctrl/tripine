# Cloud setup

## 1. Deploy the web application

Import `wexasmacdonald-ctrl/tripine` into Vercel. The app deploys immediately in demo mode with no environment variables.

## 2. Create Supabase

Create a Supabase project, run `supabase/migrations/202608130001_initial_tripine.sql`, then run `supabase/seed.sql`. Create the Connor user in Supabase Auth and insert its `organization_members` row manually.

Add the project URL, publishable key, and service-role key to Vercel. The service-role key is server-only and must never use the `NEXT_PUBLIC_` prefix.

## 3. Add OpenAI

Create an API project with a low spend limit and add `OPENAI_API_KEY`. `OPENAI_MODEL` defaults to `gpt-5.4-nano`. Responses use `store: false`; Tripine remains the canonical state store.

## 4. Register Microsoft Entra application

Create a Web app registration. Add this redirect URI:

`https://YOUR_VERCEL_DOMAIN/api/connections/microsoft/callback`

Grant delegated permissions `User.Read`, `Mail.Read`, `Mail.Send`, and `Files.Read.All`. Add the client ID, tenant ID, client secret, and exact redirect URI to Vercel.

Create strong random values for `MICROSOFT_GRAPH_CLIENT_STATE` and `INTERNAL_JOB_SECRET`.

The webhook URL is:

`https://YOUR_VERCEL_DOMAIN/api/webhooks/microsoft/graph`

## 5. Activate live mailbox processing

The webhook validates Graph and persists notification envelopes. Before enabling real mailbox automation, add the encrypted token repository, create Alex's Graph subscription, and enable the delivery processor. The current callback verifies OAuth but intentionally does not persist plaintext credentials.

## Environment variables

Copy every variable from `.env.example` into Vercel. Redeploy after changing them.

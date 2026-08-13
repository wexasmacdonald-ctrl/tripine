# Tripine

Tripine is a feasibility demo for an AI employee named Alex. Alex participates in the organization through web chat and Outlook while sharing one identity, context, work state, permissions, and audit history.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. No credentials are required for deterministic demo mode.

## Verify

```bash
npm run lint
npm run build
```

## Cloud deployment

Import this repository into Vercel. See [docs/cloud-setup.md](docs/cloud-setup.md) for Supabase, OpenAI, and Microsoft Entra configuration.

## Current vertical slice

- Alex employee workspace with demo chat.
- Provider-neutral channel, interaction, connector, and capability contracts.
- Deterministic participation and outbound approval policy.
- Microsoft OAuth/PKCE and Graph client boundaries.
- Basic Graph webhook validation and durable Supabase delivery inbox.
- Tenant-scoped Supabase schema for parties, conversations, interactions, memory, tasks, commitments, events, and approvals.

Live Microsoft token persistence and background inbox processing remain deliberately disabled until encrypted credential storage is wired to a deployed Supabase project.

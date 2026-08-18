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
npm run test
npm run build
```

## Cloud deployment

Import this repository into Vercel. See [docs/cloud-setup.md](docs/cloud-setup.md) for Supabase, OpenAI, and Microsoft Entra configuration. Azure OpenAI remains an optional production deployment target.

## Current vertical slice

- Alex employee workspace with demo chat.
- Provider-neutral channel, interaction, connector, and capability contracts.
- Deterministic participation and outbound approval policy.
- Microsoft OAuth/PKCE and Graph client boundaries.
- Basic Graph webhook validation and durable Supabase delivery inbox.
- Encrypted Microsoft access/refresh-token persistence and refresh rotation.
- Automatic Outlook subscription creation and daily renewal.
- Live inbound Outlook processing, participant/thread resolution, Graph mail/file research, and narrow internal auto-replies.
- Supabase authentication and cross-channel retrieval of email history, tasks, commitments, and events.
- Live web-chat research across Alex's Outlook, OneDrive, and SharePoint access with bounded evidence and automatic audit events.
- Tenant-scoped Supabase schema for parties, conversations, interactions, memory, tasks, commitments, events, and approvals.
- Persistent web interactions, live work/activity panels, immutable external-email approvals, and exactly-once submission guards.
- Authenticated readiness diagnostics and scenario-focused Outlook/participation tests.
- Bounded extraction of actual PDF, DOCX, XLSX, and text evidence from SharePoint/OneDrive results.

Apply the migration and provide the cloud environment variables before connecting real accounts. Never place credentials in this repository.

The account-owned setup checklist is in [docs/brad-action-list.md](docs/brad-action-list.md), and the call flow is in [docs/demo-runbook.md](docs/demo-runbook.md).

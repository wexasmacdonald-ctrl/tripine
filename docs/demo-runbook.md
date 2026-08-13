# Connor and Alex demo runbook

## Story

Tripine is not an integration dashboard. Alex is a persistent employee identity who receives ordinary Outlook communication, uses workplace tools, remembers work, and remains the same participant in web chat.

## Five-minute flow

1. In Outlook, send Alex: “Alex, find the latest quote we sent ABC Manufacturing and tell me whether Sarah replied.”
2. Show Tripine activity: the inbound email and Alex's reply are recorded automatically.
3. Open a fresh Tripine web conversation and ask: “What happened with ABC?”
4. Show that Alex cites the prior interaction, open task, and commitment without pretending email and web chat are one thread.
5. Show a CC-only client message. Alex records it but remains silent.
6. Show Connor's explicit public delegation. The Work panel contains the resulting task and commitment.
7. Draft an external message to Sarah. Explain that approval binds the exact recipient, subject, and body. Approve it and show one copy in Alex's Sent Items.

## Recovery notes

- `/api/readiness`: authenticated owner-only configuration and subscription checks.
- `POST /api/internal/graph/process`: retry durable pending/failed deliveries with the internal bearer secret.
- A send marked `needs_reconciliation` must be checked in Alex's Sent Items before any retry.
- CC-only, forwarded, attachment-bearing, external, and recipient-changing email is never auto-sent.

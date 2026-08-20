# Connor, Alex, and Sarah demo runbook

## Story

Tripine is not an integration dashboard. Alex is a persistent employee identity who receives ordinary Outlook communication, uses workplace tools, remembers work, and remains the same participant in web chat.

## Demo identities

- Connor: `connor@tripine.onmicrosoft.com`
- Alex: `alex@tripine.onmicrosoft.com`
- Sarah Chen: `sarah@tripine.onmicrosoft.com`

Sarah is a license-free Exchange shared mailbox. Connor is its delegated member and can send controlled demo mail as Sarah. This gives the demo a separate client identity without consuming another Microsoft 365 license.

## Outlook-first five-minute flow

Do not begin in Tripine. The product experience is Connor working with Alex through normal email. Open the dashboard only after the employee behaviour has already been proven, and only if approval or audit evidence needs to be shown.

1. In Connor's Outlook, open Sarah's message about `ABC Manufacturing Quote v3` and show that Connor is in To and Alex is CC'd:
   - Sarah says the $18,500 total looks current.
   - Sarah asks whether installation is included and whether the September 30 validity date still applies.
   - Alex does not reply because he was included only for awareness.
2. Connor emails Alex directly in ordinary language: `Figure this out. Check the latest shared quote and tell me what we can verify.`
3. Stay in Outlook. Show Alex's reply in the same email conversation:
   - Total: $18,500 CAD
   - Valid through: September 30, 2026
   - Installation: not included
4. Connor forwards a separate supplier message to Alex with: `Take care of this and send me what you find.` Show that Alex separates Connor's instruction from the forwarded content.
5. Connor sends a new email asking: `What's happening with ABC, and what are we still waiting on?` Alex answers from the same organizational context without Connor naming Outlook or OneDrive.
6. Only after the Outlook story is complete, optionally open Tripine for no more than 30 seconds to show the exact approval payload and automatic event history.

## Expected cross-channel answer

- Sarah said the $18,500 CAD total looks current.
- She asked whether installation is included and whether the September 30 validity date still applies.
- The latest quote confirms $18,500 CAD, validity through September 30, 2026, and that installation is not included.
- Sarah asked for confirmation; she did not approve the quote.

## Recovery notes

- `/api/readiness`: authenticated owner-only configuration and subscription checks.
- `POST /api/internal/graph/process`: retry durable pending/failed deliveries with the internal bearer secret.
- `GET /api/internal/graph/renew`: renew due subscriptions and recreate subscriptions marked broken by Microsoft lifecycle events.
- `POST /api/internal/graph/renew`: securely rebuild the mailbox subscription when a callback must be reconciled.
- A send marked `needs_reconciliation` must be checked in Alex's Sent Items before any retry.
- CC-only, forwarded, attachment-bearing, external, and recipient-changing email is never auto-sent.

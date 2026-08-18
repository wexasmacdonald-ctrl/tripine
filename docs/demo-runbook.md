# Connor, Alex, and Sarah demo runbook

## Story

Tripine is not an integration dashboard. Alex is a persistent employee identity who receives ordinary Outlook communication, uses workplace tools, remembers work, and remains the same participant in web chat.

## Demo identities

- Connor: `connor@tripine.onmicrosoft.com`
- Alex: `alex@tripine.onmicrosoft.com`
- Sarah Chen: `sarah@tripine.onmicrosoft.com`

Sarah is a license-free Exchange shared mailbox. Connor is its delegated member and can send controlled demo mail as Sarah. This gives the demo a separate client identity without consuming another Microsoft 365 license.

## Validated five-minute flow

1. Show the shared OneDrive file `ABC Manufacturing Quote v3.txt`:
   - Total: $18,500 CAD
   - Valid through: September 30, 2026
   - Installation: not included
2. From Sarah, send Connor an email and CC Alex:
   - Subject: `RE: ABC Manufacturing Quote v3`
   - Sarah confirms that the $18,500 total looks current.
   - Sarah asks whether installation is included and whether the September 30 validity date still applies.
3. Show that Alex records the CC message but does not reply or assume an assignment.
4. Connor emails Alex directly: `Did Sarah reply about the ABC Manufacturing quote? Cross-check it against the latest quote.`
5. Alex searches Outlook and Microsoft files, then reports Sarah's exact questions and the matching quote terms.
6. Open Tripine web chat and ask: `What did Sarah say about ABC, and how does it compare with the latest quote? Re-verify both the email and file now.`
7. Show that the same Alex independently re-reads Sarah's email and the quote, gives the same answer, and records automatic email/file activity events.
8. Show Connor's explicit public delegation. The Work panel contains the resulting task and commitment.
9. Draft an external message to Sarah. Explain that approval binds the exact recipient, subject, body, and attachments. Approve it and show one copy in Alex's Sent Items.

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

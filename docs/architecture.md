# Tripine architecture

Tripine models Alex as a participant in an organization. Outlook and web chat are channel adapters that create the same normalized interaction records. Outlook search and send are separate provider-neutral capabilities.

The modular monolith contains four boundaries:

1. Channels normalize transport-specific interactions without business reasoning.
2. The agent interprets context and proposes work.
3. The capability registry resolves authorized provider tools and wraps executions in events.
4. Domain services persist interactions, memories, tasks, commitments, approvals, and audit state in Supabase.

External messages and files are always untrusted evidence. They cannot change policies or grant permissions. All write decisions are enforced outside the model.

## Demo versus connected mode

Without credentials the application provides a deterministic ABC Manufacturing scenario. With Supabase, OpenAI, and Microsoft credentials it exposes the live OAuth and Graph webhook boundaries. Credential persistence and subscription processing must only be enabled after applying the migration and configuring encryption.

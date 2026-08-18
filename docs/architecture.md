# Tripine architecture

Tripine models Alex as a participant in an organization. Outlook and web chat are channel adapters that create the same normalized interaction records. Outlook search and send are separate provider-neutral capabilities.

The modular monolith contains four boundaries:

1. Channels normalize transport-specific interactions without business reasoning.
2. The agent interprets context and proposes work.
3. The capability registry resolves authorized provider tools and wraps executions in events.
4. Domain services persist interactions, memories, tasks, commitments, approvals, and audit state in Supabase.

External messages and files are always untrusted evidence. They cannot change policies or grant permissions. All write decisions are enforced outside the model.

For live Microsoft research, search hits are treated as discovery evidence. Supported files are downloaded server-side through Graph with strict size, time, and character limits, then parsed as PDF, DOCX, XLSX, or text. Search and read actions create execution-layer events automatically.

Company mentions are linked to each channel-neutral conversation. A new web conversation that names a company retrieves related Outlook conversations through this structured entity context; later pronouns in the same web conversation reuse its active company context without merging unrelated channel threads.

## Demo versus connected mode

Without credentials the application provides a deterministic ABC Manufacturing scenario. With Supabase, Azure OpenAI, and Microsoft credentials it exposes the live OAuth and Graph webhook boundaries. The model gateway can also use direct OpenAI for development, but Azure takes precedence when configured. Credential persistence and subscription processing must only be enabled after applying the migration and configuring encryption.

-- Safe additive hardening for projects that applied the original feasibility migration.
create unique index if not exists interaction_attachment_external_idx
  on public.interaction_attachments (interaction_id, external_id);
create unique index if not exists task_source_interaction_idx
  on public.tasks (source_interaction_id);
create unique index if not exists commitment_source_interaction_idx
  on public.commitments (source_interaction_id);
create unique index if not exists event_interaction_action_idx
  on public.agent_events (agent_id, interaction_id, action);

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

grant select on public.organizations, public.organization_members, public.parties, public.party_identities,
  public.agents, public.companies, public.relationships, public.connections, public.conversations,
  public.channel_threads, public.interactions, public.interaction_participants, public.interaction_attachments,
  public.memory_records, public.tasks, public.commitments, public.agent_capability_policies,
  public.agent_events, public.approval_requests to authenticated;

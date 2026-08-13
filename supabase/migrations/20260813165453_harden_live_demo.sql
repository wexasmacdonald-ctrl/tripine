-- Safe additive hardening for projects that applied the original feasibility migration.
alter table public.party_identities add column if not exists metadata jsonb not null default '{}';

create table if not exists public.conversation_entity_context (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  source_interaction_id uuid references public.interactions(id) on delete set null,
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  last_mentioned_at timestamptz not null default now(),
  unique (conversation_id, company_id)
);
alter table public.conversation_entity_context enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_entity_context' and policyname = 'tenant_read') then
    create policy tenant_read on public.conversation_entity_context for select to authenticated using (private.is_org_member(organization_id));
  end if;
end $$;

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
grant select on public.conversation_entity_context to authenticated;

grant select on public.organizations, public.organization_members, public.parties, public.party_identities,
  public.agents, public.companies, public.relationships, public.connections, public.conversations,
  public.channel_threads, public.conversation_entity_context, public.interactions, public.interaction_participants, public.interaction_attachments,
  public.memory_records, public.tasks, public.commitments, public.agent_capability_policies,
  public.agent_events, public.approval_requests to authenticated;

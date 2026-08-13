create extension if not exists pgcrypto;

create type public.party_kind as enum ('human', 'agent', 'external_person');
create type public.channel_kind as enum ('web', 'email', 'teams');
create type public.policy_effect as enum ('allowed', 'requires_approval', 'denied');
create type public.work_status as enum ('open', 'waiting', 'completed', 'cancelled');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.party_kind not null,
  display_name text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  unique (party_id)
);

create table public.party_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,
  channel public.channel_kind not null,
  address text not null,
  provider_tenant_id text,
  provider_object_id text,
  verified boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (organization_id, channel, address)
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade unique,
  role text not null,
  instructions text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  relationship_type text,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_party_id uuid references public.parties(id) on delete cascade,
  target_party_id uuid references public.parties(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  relationship_type text not null,
  created_at timestamptz not null default now()
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_party_id uuid references public.parties(id) on delete cascade,
  provider text not null,
  auth_type text not null check (auth_type in ('oauth','api_key','service_account','database_credentials','local_bridge','other')),
  owner_type text not null check (owner_type in ('user','organization','service')),
  status text not null default 'pending' check (status in ('pending','connected','expired','revoked','error')),
  capabilities text[] not null default '{}',
  provider_tenant_id text,
  provider_account_id text,
  account_address text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index connections_provider_account_idx on public.connections (organization_id, provider, provider_account_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table public.connection_credentials (
  connection_id uuid primary key references public.connections(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null,
  updated_at timestamptz not null default now()
);
alter table public.connection_credentials enable row level security;
revoke all on public.connection_credentials from anon, authenticated;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  title text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.channel_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete set null,
  channel public.channel_kind not null,
  external_thread_id text,
  created_at timestamptz not null default now(),
  unique (connection_id, channel, external_thread_id)
);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  channel_thread_id uuid references public.channel_threads(id) on delete set null,
  channel public.channel_kind not null,
  direction text not null check (direction in ('inbound','outbound')),
  sender_party_id uuid references public.parties(id) on delete set null,
  subject text,
  content_text text not null,
  external_message_id text,
  internet_message_id text,
  reply_to_message_id text,
  participation jsonb not null default '{}',
  provenance jsonb not null default '{}',
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (channel_thread_id, external_message_id)
);

create table public.conversation_entity_context (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  source_interaction_id uuid references public.interactions(id) on delete set null,
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  last_mentioned_at timestamptz not null default now(),
  unique (conversation_id, company_id)
);

create table public.interaction_participants (
  interaction_id uuid not null references public.interactions(id) on delete cascade,
  party_id uuid references public.parties(id) on delete set null,
  address text not null,
  display_name text,
  recipient_role text check (recipient_role in ('sender','to','cc','bcc')),
  primary key (interaction_id, address, recipient_role)
);

create table public.interaction_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  interaction_id uuid not null references public.interactions(id) on delete cascade,
  external_id text,
  name text not null,
  content_type text not null,
  size_bytes bigint not null default 0,
  content_hash text,
  metadata jsonb not null default '{}'
);
create unique index interaction_attachment_external_idx on public.interaction_attachments (interaction_id, external_id);

create table public.memory_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  memory_type text not null check (memory_type in ('fact','relationship','decision','preference','active_context')),
  content text not null,
  related_company_id uuid references public.companies(id) on delete set null,
  source_interaction_id uuid references public.interactions(id) on delete set null,
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  superseded_by uuid references public.memory_records(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  description text not null,
  status public.work_status not null default 'open',
  assigned_by_party_id uuid references public.parties(id) on delete set null,
  assigned_to_party_id uuid references public.parties(id) on delete set null,
  source_interaction_id uuid references public.interactions(id) on delete set null,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  description text not null,
  status public.work_status not null default 'open',
  committed_by_party_id uuid references public.parties(id) on delete set null,
  expected_executor_party_id uuid references public.parties(id) on delete set null,
  external_party_aware boolean not null default false,
  source_interaction_id uuid not null references public.interactions(id) on delete restrict,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_capability_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  capability text not null,
  effect public.policy_effect not null,
  constraints jsonb not null default '{}',
  unique (agent_id, capability)
);

create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  interaction_id uuid references public.interactions(id) on delete set null,
  connection_id uuid references public.connections(id) on delete set null,
  action text not null,
  status text not null check (status in ('started','success','failure','pending_approval','needs_reconciliation')),
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  requested_by_party_id uuid references public.parties(id) on delete set null,
  action text not null,
  payload jsonb not null,
  payload_hash text not null,
  version integer not null default 1,
  status text not null default 'pending' check (status in ('pending','approved','cancelled','expired','executing','executed','needs_reconciliation','superseded')),
  idempotency_key uuid not null default gen_random_uuid() unique,
  expires_at timestamptz not null,
  decided_by_user_id uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.graph_subscriptions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  external_id text not null unique,
  resource text not null,
  expires_at timestamptz not null,
  status text not null default 'active',
  last_notification_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.inbound_deliveries (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  subscription_external_id text,
  provider_resource_id text,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','processed','failed')),
  attempt_count integer not null default 0,
  lease_until timestamptz,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, subscription_external_id, provider_resource_id)
);

create index interactions_org_time_idx on public.interactions (organization_id, occurred_at desc);
create index events_org_time_idx on public.agent_events (organization_id, created_at desc);
create index tasks_org_status_idx on public.tasks (organization_id, status);
create index commitments_org_status_idx on public.commitments (organization_id, status);
create index deliveries_pending_idx on public.inbound_deliveries (status, received_at) where status in ('pending','failed');
create unique index task_source_interaction_idx on public.tasks (source_interaction_id);
create unique index commitment_source_interaction_idx on public.commitments (source_interaction_id);
create unique index event_interaction_action_idx on public.agent_events (agent_id, interaction_id, action);

create or replace function private.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org and m.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['organizations','parties','organization_members','party_identities','agents','companies','relationships','connections','conversations','channel_threads','conversation_entity_context','interactions','interaction_participants','interaction_attachments','memory_records','tasks','commitments','agent_capability_policies','agent_events','approval_requests','graph_subscriptions','inbound_deliveries'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy org_read on public.organizations for select to authenticated using (private.is_org_member(id));
create policy org_member_read on public.organization_members for select to authenticated using (private.is_org_member(organization_id));

do $$ declare t text; begin
  foreach t in array array['parties','party_identities','agents','companies','relationships','connections','conversations','channel_threads','conversation_entity_context','interactions','interaction_attachments','memory_records','tasks','commitments','agent_capability_policies','agent_events','approval_requests'] loop
    execute format('create policy tenant_read on public.%I for select to authenticated using (private.is_org_member(organization_id))', t);
  end loop;
end $$;

create policy interaction_participant_read on public.interaction_participants for select to authenticated using (
  exists (select 1 from public.interactions i where i.id = interaction_id and private.is_org_member(i.organization_id))
);

-- Writes go through authenticated server services for the feasibility demo. The browser has no direct write policies.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on all tables in schema private from anon, authenticated;
grant select on public.organizations, public.organization_members, public.parties, public.party_identities,
  public.agents, public.companies, public.relationships, public.connections, public.conversations,
  public.channel_threads, public.conversation_entity_context, public.interactions, public.interaction_participants, public.interaction_attachments,
  public.memory_records, public.tasks, public.commitments, public.agent_capability_policies,
  public.agent_events, public.approval_requests to authenticated;

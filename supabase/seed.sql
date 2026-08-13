-- Run after creating a Supabase Auth user, replacing the UUID below.
-- This seed deliberately avoids hard-coding an auth user so it cannot create a broken membership.
insert into public.organizations (name, slug) values ('Demo Company', 'demo-company') on conflict (slug) do nothing;

with org as (select id from public.organizations where slug = 'demo-company'),
alex_party as (
  insert into public.parties (organization_id, kind, display_name, is_internal)
  select id, 'agent', 'Alex', true from org
  returning id, organization_id
)
insert into public.agents (organization_id, party_id, role, instructions)
select organization_id, id, 'AI employee', 'Work like a careful junior employee. Never bypass approval policy.' from alex_party;

insert into public.companies (organization_id, name, relationship_type)
select id, 'ABC Manufacturing', 'customer' from public.organizations where slug = 'demo-company'
on conflict (organization_id, name) do nothing;

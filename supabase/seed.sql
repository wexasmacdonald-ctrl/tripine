-- Run after creating a Supabase Auth user, replacing the UUID below.
-- This seed deliberately avoids hard-coding an auth user so it cannot create a broken membership.
insert into public.organizations (name, slug) values ('Demo Company', 'demo-company') on conflict (slug) do nothing;

with org as (select id from public.organizations where slug = 'demo-company')
insert into public.parties (organization_id, kind, display_name, is_internal)
select id, 'agent', 'Alex', true from org
where not exists (
  select 1 from public.parties p where p.organization_id = org.id and p.kind = 'agent' and p.display_name = 'Alex'
);

insert into public.agents (organization_id, party_id, role, instructions)
select p.organization_id, p.id, 'AI employee', 'Work like a careful junior employee. Never bypass approval policy.'
from public.parties p
join public.organizations o on o.id = p.organization_id and o.slug = 'demo-company'
where p.kind = 'agent' and p.display_name = 'Alex'
on conflict (party_id) do update set role = excluded.role, instructions = excluded.instructions;

insert into public.companies (organization_id, name, relationship_type)
select id, 'ABC Manufacturing', 'customer' from public.organizations where slug = 'demo-company'
on conflict (organization_id, name) do nothing;

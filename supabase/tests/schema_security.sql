begin;
select plan(11);

select has_table('public', 'organizations', 'organizations exists');
select has_table('public', 'conversation_entity_context', 'structured cross-channel entity context exists');
select has_table('public', 'approval_requests', 'approval requests exist');
select has_table('public', 'inbound_deliveries', 'durable webhook inbox exists');

select ok(
  not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ),
  'RLS is enabled on every public table'
);

select ok(not has_table_privilege('anon', 'public.organizations', 'SELECT'), 'anonymous role cannot read organizations');
select ok(has_table_privilege('authenticated', 'public.organizations', 'SELECT'), 'authenticated role can reach tenant tables before RLS filtering');
select ok(has_table_privilege('service_role', 'public.interactions', 'INSERT'), 'service role can persist interactions');
select ok(not has_table_privilege('authenticated', 'public.connection_credentials', 'SELECT'), 'authenticated users cannot read encrypted credentials');
select ok(has_function_privilege('authenticated', 'private.is_org_member(uuid)', 'EXECUTE'), 'authenticated role can evaluate tenant membership');
select is((select count(*) from public.organizations where slug = 'demo-company'), 1::bigint, 'demo organization is seeded exactly once');

select * from finish();
rollback;

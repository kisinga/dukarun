-- Every company starts with the platform's standard operational roles.
-- Existing company roles are deliberately left unchanged: a matching role name
-- may already have been customized by that company.

create or replace function public.seed_default_company_roles(p_company_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.roles (company_id, name, permissions)
  select p_company_id, template.name, template.permissions
  from public.roles template
  where template.company_id is null
    and template.is_template
    and template.name in ('Admin', 'Manager', 'Cashier', 'Stock Clerk')
  on conflict (company_id, name) do nothing
$$;

revoke execute on function public.seed_default_company_roles(uuid) from public, anon, authenticated;

-- Backfill imported and already-provisioned companies.
select public.seed_default_company_roles(id)
from public.companies;

-- Keep provisioning as the single account-creation path while sourcing its
-- defaults from the canonical platform templates.
do $migration$
declare
  v_definition text;
  v_anchor text := 'values (v_company_id, ''Cashier'', array[''SettleOrder'']);';
  v_replacement text := v_anchor || E'\n\n  perform public.seed_default_company_roles(v_company_id);';
begin
  select pg_get_functiondef('public.provision_company(text,text,text,text,text)'::regprocedure)
    into v_definition;

  if position('seed_default_company_roles(v_company_id)' in v_definition) = 0 then
    if position(v_anchor in v_definition) = 0 then
      raise exception 'Could not add default roles to provision_company';
    end if;
    execute replace(v_definition, v_anchor, v_replacement);
  end if;
end;
$migration$;


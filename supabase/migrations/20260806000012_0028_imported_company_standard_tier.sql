-- Imported companies should receive the Standard capability bundle. Their
-- subscription status and dates remain unchanged: tier controls capabilities
-- and quotas, while status controls whether the subscription is currently
-- usable.
--
-- etl_id_map is created by scripts/etl/migrate.mjs rather than by the schema,
-- so this migration must also be safe on installations that have never run an
-- import.

do $$
declare
  v_standard_tier_id uuid;
begin
  select id into v_standard_tier_id
  from public.subscription_tiers
  where code = 'standard' and is_active
  limit 1;

  if v_standard_tier_id is not null
     and to_regclass('public.etl_id_map') is not null then
    execute $sql$
      update public.companies c
      set subscription_tier_id = $1, updated_at = now()
      where c.subscription_tier_id is distinct from $1
        and exists (
          select 1 from public.etl_id_map m
          where m.old_type = 'channel'
            and m.new_id = c.id
            and m.company_id = c.id
        )
    $sql$ using v_standard_tier_id;
  end if;
end;
$$;

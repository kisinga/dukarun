-- pg_get_functiondef preserves PL/pgSQL body casing. Apply exact lowercase
-- replacements to target resolvers created by migration 0063.
do $$
declare v_name regprocedure;v_definition text;
begin
  foreach v_name in array array[
    'public.platform_campaign_preview(text,text,uuid,text,uuid[])'::regprocedure,
    'public.dispatch_platform_campaign(uuid)'::regprocedure
  ] loop
    select pg_get_functiondef(v_name) into v_definition;
    v_definition:=replace(v_definition,'order by m.created_at',
      'order by (m.user_id=c.primary_contact_user_id) desc,m.created_at');
    if v_name='public.dispatch_platform_campaign(uuid)'::regprocedure then
      v_definition:=replace(v_definition,
        'c.id=any(array(select jsonb_array_elements_text(v_campaign.audience_config->''company_ids''))::uuid[])',
        'public.jsonb_uuid_array_contains(v_campaign.audience_config->''company_ids'',c.id)');
    end if;
    execute v_definition;
  end loop;
end $$;

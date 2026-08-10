-- Link reminder deliveries to statement metrics and harden campaign validation.

alter table public.outbox add column customer_statement_link_id uuid
  references public.customer_statement_links(id) on delete set null;

create or replace function public.attach_statement_link_to_outbox()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_token text;
begin
  if new.source='reminder' and new.customer_statement_link_id is null then
    v_token:=substring(new.body from '/statement/([0-9a-fA-F]{64})');
    if v_token is not null then
      select id into new.customer_statement_link_id from public.customer_statement_links
      where token_hash=encode(extensions.digest(v_token,'sha256'),'hex') limit 1;
    end if;
  end if;
  return new;
end;
$$;
create trigger outbox_attach_statement_link before insert or update of source,body
  on public.outbox for each row execute function public.attach_statement_link_to_outbox();

create or replace function public.jsonb_uuid_array_contains(p_value jsonb,p_id uuid)
returns boolean language sql immutable set search_path='' as $$
  select case when jsonb_typeof(p_value)='array'
    then p_id::text in (select jsonb_array_elements_text(p_value)) else false end;
$$;
revoke execute on function public.jsonb_uuid_array_contains(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.jsonb_uuid_array_contains(jsonb,uuid) to service_role;

do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.dispatch_platform_campaign(uuid)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,
    'c.id = ANY ((ARRAY( SELECT jsonb_array_elements_text((v_campaign.audience_config -> ''company_ids''::text)) AS jsonb_array_elements_text))::uuid[])',
    'public.jsonb_uuid_array_contains(v_campaign.audience_config -> ''company_ids'',c.id)');
  execute v_definition;
end $$;

create or replace function public.validate_platform_campaign(
  p_name text,p_channel text,p_title text,p_body text,p_audience text,
  p_tier_id uuid,p_subscription_status text,p_company_ids uuid[],p_cta_label text,p_cta_link text
) returns void language plpgsql stable set search_path='' as $$
declare v_values jsonb:=jsonb_build_object('merchant_name','Sample Merchant','tier','Standard',
  'subscription_state','active','subscription_end_date','31 Dec 2026','message',p_body);
begin
  if char_length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'invalid_campaign_name'; end if;
  if p_channel not in ('in_app','sms','whatsapp') then raise exception 'invalid_channel'; end if;
  if char_length(trim(coalesce(p_title,''))) not between 1 and 120 then raise exception 'invalid_title'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'invalid_body'; end if;
  if p_audience not in ('all','tier','subscription_status','selected') then raise exception 'invalid_audience'; end if;
  if p_audience='tier' and p_tier_id is null then raise exception 'tier_required'; end if;
  if p_audience='subscription_status' and coalesce(p_subscription_status,'') not in ('trial','active','expired','cancelled') then raise exception 'subscription_status_required'; end if;
  if p_audience='selected' and coalesce(cardinality(p_company_ids),0)=0 then raise exception 'companies_required'; end if;
  if p_channel<>'in_app' and (p_cta_label is not null or p_cta_link is not null) then raise exception 'cta_in_app_only'; end if;
  if (p_cta_label is null)<>(p_cta_link is null) then raise exception 'cta_label_and_link_required'; end if;
  if p_cta_label is not null and char_length(trim(p_cta_label)) not between 1 and 40 then raise exception 'invalid_cta_label'; end if;
  if p_cta_link is not null and (char_length(p_cta_link)>500 or p_cta_link!~'^/[^/]' or p_cta_link~E'[\\\\[:cntrl:]]') then raise exception 'invalid_cta_link'; end if;
  perform public.render_message_template(p_title,v_values);
  perform public.render_message_template(p_body,v_values);
end;
$$;

create or replace function public.platform_external_communication_metrics(p_since timestamptz default now()-interval '30 days')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  select jsonb_build_object('provider_accepted',count(*) filter(where o.status='sent'),
    'failed',count(*) filter(where o.status='failed'),'pending',count(*) filter(where o.status='pending'),
    'documents_opened',count(*) filter(where coalesce(l.open_count,s.open_count)>0),
    'link_opens',coalesce(sum(l.open_count),0)+coalesce(sum(s.open_count),0)) into v_result
  from public.outbox o left join public.external_document_links l on l.id=o.external_document_link_id
  left join public.customer_statement_links s on s.id=o.customer_statement_link_id
  where o.created_at>=p_since and o.source in ('platform','reminder','manual_document');
  return v_result;
end;
$$;

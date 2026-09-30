-- Server custody is separate from sale completion. Requests, payments and
-- fulfillment instructions survive every validation failure and device loss.
create table public.offline_sale_contexts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid not null,
  location_id uuid not null references public.stock_locations(id),
  session_id uuid not null references public.cashier_sessions(id),
  device_key text not null check(length(device_key) between 1 and 200),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  check(expires_at=issued_at+interval '24 hours')
);
create index offline_context_session_idx on public.offline_sale_contexts(session_id);

create table public.offline_sale_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  location_id uuid not null references public.stock_locations(id),
  captured_by uuid not null,
  client_ref text not null check(length(client_ref) between 1 and 200),
  device_key text,
  context_id uuid references public.offline_sale_contexts(id),
  originating_session_id uuid references public.cashier_sessions(id),
  captured_at timestamptz,
  received_at timestamptz not null default clock_timestamp(),
  original_request jsonb not null check(jsonb_typeof(original_request)='object'),
  request_fingerprint text not null,
  status text not null default 'review' check(status in
    ('waiting','review','approval','failed','completed','cancelled')),
  blockers jsonb not null default '[]' check(jsonb_typeof(blockers)='array'),
  posted_order_id uuid references public.orders(id),
  updated_at timestamptz not null default clock_timestamp(),
  unique(company_id,client_ref),
  check((status='completed')=(posted_order_id is not null))
);
create index offline_request_session_obligation_idx
  on public.offline_sale_requests(originating_session_id,status);
create index offline_request_location_queue_idx
  on public.offline_sale_requests(company_id,location_id,received_at)
  where status not in ('completed','cancelled');

create table public.offline_sale_revisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.offline_sale_requests(id),
  company_id uuid not null references public.companies(id),
  execution_key text not null unique default ('offline-revision:'||gen_random_uuid()::text),
  confirmation_key uuid not null,
  payload jsonb not null,
  payload_fingerprint text not null,
  review_fingerprint text not null,
  destination_session_id uuid not null references public.cashier_sessions(id),
  created_by uuid not null,
  reason text not null check(length(btrim(reason)) between 3 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  cash_resolution jsonb,
  unique(request_id,id),
  unique(request_id,confirmation_key)
);
create table public.offline_sale_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.offline_sale_requests(id),
  company_id uuid not null references public.companies(id),
  actor_id uuid,
  action text not null,
  reason text,
  details jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
alter table public.offline_sale_requests add column active_revision_id uuid
  references public.offline_sale_revisions(id);
create table public.offline_cash_corrections (
  request_id uuid primary key references public.offline_sale_requests(id),
  company_id uuid not null references public.companies(id),
  revision_id uuid not null references public.offline_sale_revisions(id),
  closing_count_id uuid references public.cash_drawer_counts(id),
  order_id uuid not null references public.orders(id),
  included_amount bigint not null check(included_amount>=0),
  created_by uuid not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  check(included_amount=0 or closing_count_id is not null)
);

alter table public.orders
  add column offline_request_id uuid references public.offline_sale_requests(id),
  add column offline_revision_id uuid references public.offline_sale_revisions(id),
  add column posting_request_fingerprint text;
create unique index orders_one_completed_offline_sale
  on public.orders(offline_request_id)
  where offline_request_id is not null and (status='completed' or (status='voided' and posted_at is not null));

alter table public.offline_sale_contexts enable row level security;
alter table public.offline_sale_requests enable row level security;
alter table public.offline_sale_revisions enable row level security;
alter table public.offline_sale_events enable row level security;
alter table public.offline_cash_corrections enable row level security;
revoke all on public.offline_sale_contexts,public.offline_sale_requests,
  public.offline_sale_revisions,public.offline_sale_events,public.offline_cash_corrections
  from public,anon,authenticated;

create function public.offline_request_fingerprint(p_payload jsonb)
returns text language sql immutable set search_path='' as $$
  select encode(extensions.digest(p_payload::text,'sha256'),'hex')
$$;
revoke all on function public.offline_request_fingerprint(jsonb) from public,anon,authenticated;

create function public.guard_offline_capture_evidence()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'offline_evidence_immutable'; end if;
  if tg_table_name<>'offline_sale_requests' then raise exception 'offline_evidence_immutable'; end if;
  if (new.company_id,new.location_id,new.captured_by,new.client_ref,new.device_key,
      new.context_id,new.originating_session_id,new.captured_at,new.received_at,
      new.original_request,new.request_fingerprint)
    is distinct from
    (old.company_id,old.location_id,old.captured_by,old.client_ref,old.device_key,
      old.context_id,old.originating_session_id,old.captured_at,old.received_at,
      old.original_request,old.request_fingerprint)
    or (old.status in ('completed','cancelled') and
      (new.status,new.posted_order_id) is distinct from (old.status,old.posted_order_id))
  then raise exception 'offline_evidence_immutable'; end if;
  return new;
end;
$$;
create trigger offline_requests_immutable before update or delete on public.offline_sale_requests
  for each row execute function public.guard_offline_capture_evidence();
create trigger offline_contexts_immutable before update or delete on public.offline_sale_contexts
  for each row execute function public.guard_offline_capture_evidence();
create trigger offline_revisions_immutable before update or delete on public.offline_sale_revisions
  for each row execute function public.guard_offline_capture_evidence();
create trigger offline_events_immutable before update or delete on public.offline_sale_events
  for each row execute function public.guard_offline_capture_evidence();
create trigger offline_cash_corrections_immutable before update or delete on public.offline_cash_corrections
  for each row execute function public.guard_offline_capture_evidence();
revoke all on function public.guard_offline_capture_evidence() from public,anon,authenticated;

create function public.confirm_offline_sale_context(p_location_id uuid,p_device_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_session public.cashier_sessions%rowtype;
  v_context public.offline_sale_contexts%rowtype;v_now timestamptz;
begin
  if not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied'; end if;
  if length(btrim(coalesce(p_device_key,''))) not between 1 and 200 then
    raise exception 'device_key_required'; end if;
  select * into v_session from public.cashier_sessions where company_id=v_company
    and location_id=p_location_id and status='open' for share;
  if v_session.id is null then return jsonb_build_object('session',null,'context',null,
    'server_time',clock_timestamp()); end if;
  v_now:=clock_timestamp();
  -- Session visibility is shared by expenses and supplier payments. Only sale
  -- settlers receive a context that authorizes offline capture.
  if not public.current_user_has_permission('SettleOrder') then
    return jsonb_build_object('session',to_jsonb(v_session),'context',null,'server_time',v_now);
  end if;
  select * into v_context from public.offline_sale_contexts
    where company_id=v_company and user_id=auth.uid() and location_id=p_location_id
      and session_id=v_session.id and device_key=p_device_key and expires_at>v_now+interval '1 hour'
    order by issued_at desc limit 1;
  if v_context.id is null then
    insert into public.offline_sale_contexts(company_id,user_id,location_id,session_id,device_key,
      issued_at,expires_at) values(v_company,auth.uid(),p_location_id,v_session.id,p_device_key,
      v_now,v_now+interval '24 hours') returning * into v_context;
  end if;
  return jsonb_build_object('session',to_jsonb(v_session),'context',to_jsonb(v_context),
    'server_time',v_now);
end;
$$;
revoke all on function public.confirm_offline_sale_context(uuid,text) from public,anon;
grant execute on function public.confirm_offline_sale_context(uuid,text) to authenticated;

-- Additive catalogue evidence RPC; existing catalogue readers remain compatible.
create function public.offline_catalog_definitions(p_variant_ids uuid[])
returns table(variant_id uuid,stock_unit text,packs jsonb,catalogue_version jsonb,pack_versions jsonb)
language sql stable security definer set search_path='' as $$
  select v.id,v.stock_unit,public.catalog_packs_json(v.id),
    jsonb_build_object('product',p.updated_at,'variant',v.updated_at,'pack',null),
    coalesce((select jsonb_object_agg(k.id,k.updated_at) from public.variant_packs k
      where k.company_id=v.company_id and k.variant_id=v.id),'{}'::jsonb)
  from public.product_variants v join public.products p on p.id=v.product_id and p.company_id=v.company_id
  where v.company_id=public.current_company_id() and v.id=any(p_variant_ids)
$$;
revoke all on function public.offline_catalog_definitions(uuid[]) from public,anon;
grant execute on function public.offline_catalog_definitions(uuid[]) to authenticated;

-- Current state is read through stable IDs. Names and catalogue versions remain
-- evidence, but do not cause a semantic conflict on their own.
create function public.offline_line_current_state(p_company_id uuid,p_line jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.product_variants%rowtype;p public.products%rowtype;
  k public.variant_packs%rowtype;v_source text;v_price bigint;v_floor bigint;
begin
  select * into v from public.product_variants where company_id=p_company_id
    and id=(p_line->>'variant_id')::uuid for share;
  if v.id is null then return jsonb_build_object('available',false); end if;
  select * into p from public.products where id=v.product_id and company_id=p_company_id for share;
  v_source:=coalesce(p_line->>'price_source','retail');
  v_price:=case when v_source='wholesale' then v.wholesale_price else v.price end;
  v_floor:=v.wholesale_price;
  if nullif(p_line->>'pack_id','') is not null then
    select * into k from public.variant_packs where company_id=p_company_id
      and variant_id=v.id and id=(p_line->>'pack_id')::uuid for share;
    v_price:=k.sale_price;v_floor:=k.sale_price;
  end if;
  return jsonb_build_object('available',v.active and p.active and
    (nullif(p_line->>'pack_id','') is null or (k.active and k.sale_price is not null and v.kind='good')),
    'product_id',v.product_id,'variant_id',v.id,'pack_id',k.id,
    'product_name',p.name,'variant_name',v.name,'unit_name',coalesce(k.name,v.stock_unit),
    'stock_unit',v.stock_unit,'units_per_unit',coalesce(k.units_per_pack,1),
    'kind',v.kind,'allow_fractional',v.allow_fractional,'track_inventory',v.track_inventory,
    'expected_unit_price',v_price,'price_floor',v_floor,
    'catalogue_version',jsonb_build_object('product',p.updated_at,'variant',v.updated_at,'pack',k.updated_at));
end;
$$;
revoke all on function public.offline_line_current_state(uuid,jsonb) from public,anon,authenticated;

-- Review and final validation resolve the same tax configuration at a supplied server instant.
create function public.offline_tax_settings_at(p_company_id uuid,p_at timestamptz)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'show_vat_breakdown_on_prints',c.show_vat_breakdown_on_prints,
    'business_timezone',c.business_timezone,
    'activation',jsonb_build_object(
      'business_date',(p_at at time zone c.business_timezone)::date,
      'has_financial_activity_today',exists(select 1 from public.ledger_journal_entries e
        where e.company_id=c.id and e.finalized_at is not null
          and e.entry_date=(p_at at time zone c.business_timezone)::date)
        or exists(select 1 from public.orders o where o.company_id=c.id
          and o.status in('completed','voided')
          and (coalesce(o.tax_point_at,o.completed_at,o.updated_at) at time zone c.business_timezone)::date
            =(p_at at time zone c.business_timezone)::date),
      'earliest_effective_from',(p_at at time zone c.business_timezone)::date,
      'immediate_available',true, 'server_time',p_at),
    'active_profile',case when p.id is null then null else jsonb_build_object(
      'id',p.id,'jurisdiction_id',p.jurisdiction_id,'country_code',j.country_code,
      'jurisdiction_name',j.name,'vat_registered',p.vat_registered,
      'tax_registration_number',p.tax_registration_number,
      'default_tax_category_id',p.default_tax_category_id,'effective_from',p.effective_from,
      'effective_to',p.effective_to,'effective_from_at',p.effective_from_at,'effective_to_at',p.effective_to_at,'business_timezone',p.business_timezone) end,
    'scheduled_profiles',coalesce((select jsonb_agg(jsonb_build_object(
      'id',sp.id,'jurisdiction_id',sp.jurisdiction_id,'country_code',sj.country_code,
      'jurisdiction_name',sj.name,'vat_registered',sp.vat_registered,
      'tax_registration_number',sp.tax_registration_number,
      'default_tax_category_id',sp.default_tax_category_id,'effective_from',sp.effective_from,
      'effective_to',sp.effective_to,'effective_from_at',sp.effective_from_at,'effective_to_at',sp.effective_to_at,'business_timezone',sp.business_timezone)
      order by sp.effective_from_at)
      from public.company_tax_profiles sp
      join public.tax_jurisdictions sj on sj.id=sp.jurisdiction_id
      where sp.company_id=c.id
        and sp.effective_from_at>p_at),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object(
      'id',tc.id,'code',tc.code,'name',tc.name,'classification',tc.classification,
      'is_default',tc.is_default,'rate_bps',rv.rate_bps,
      'rate_effective_from',rv.effective_from,'rate_effective_to',rv.effective_to)
      order by tc.is_default desc,tc.name)
      from public.tax_categories tc left join lateral(
        select r.* from public.tax_rate_versions r where r.tax_category_id=tc.id
          and r.effective_from<=(p_at at time zone j.default_timezone)::date
          and (r.effective_to is null or r.effective_to>=(p_at at time zone j.default_timezone)::date)
        order by r.effective_from desc limit 1) rv on true
      where tc.jurisdiction_id=p.jurisdiction_id and tc.active
        and tc.effective_from<=(p_at at time zone j.default_timezone)::date
        and (tc.effective_to is null or tc.effective_to>=(p_at at time zone j.default_timezone)::date)),
      '[]'::jsonb),
    'jurisdictions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',tj.id,'country_code',tj.country_code,'name',tj.name,'currency_code',tj.currency_code,
      'default_timezone',tj.default_timezone,'status',tj.status) order by tj.name)
      from public.tax_jurisdictions tj where tj.status='published'),'[]'::jsonb)
  )
  from public.companies c
  left join lateral(select cp.* from public.company_tax_profiles cp where cp.company_id=c.id
    and cp.effective_from_at<=p_at and (cp.effective_to_at is null or cp.effective_to_at>p_at)
    order by cp.effective_from_at desc limit 1) p on true
  left join public.tax_jurisdictions j on j.id=p.jurisdiction_id
  where c.id=p_company_id
$$;
revoke all on function public.offline_tax_settings_at(uuid,timestamptz) from public,anon,authenticated;

create function public.offline_sale_assessment(p_request_id uuid,p_payload jsonb,
  p_destination_session_id uuid default null,p_posting_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.offline_sale_requests%rowtype;c public.offline_sale_contexts%rowtype;
  s public.cashier_sessions%rowtype;d public.cashier_sessions%rowtype;
  l jsonb;v_current jsonb;v_evidence jsonb;v_line jsonb;v_lines jsonb:='[]';
  v_blockers jsonb:='[]';v_codes jsonb;v_state jsonb:='[]';v_now timestamptz;
  v_index integer:=0;v_total bigint:=0;v_paid bigint:=0;v_stock numeric;v_quantity numeric;
  v_customer public.customers%rowtype;v_tax jsonb;v_semantic text[]:=array[
    'product_id','variant_id','pack_id','stock_unit','units_per_unit','kind','allow_fractional','track_inventory'];
begin
  select * into strict r from public.offline_sale_requests where id=p_request_id;
  select * into c from public.offline_sale_contexts where id=r.context_id;
  select * into s from public.cashier_sessions where id=r.originating_session_id for share;
  select * into d from public.cashier_sessions where id=coalesce(p_destination_session_id,s.id)
    and company_id=r.company_id and location_id=r.location_id for share;
  v_now:=coalesce(p_posting_at,clock_timestamp());
  if r.captured_at is null or r.captured_at>v_now or r.captured_at<=v_now-interval '24 hours' then
    v_blockers:=v_blockers||jsonb_build_object('code','capture_age_review'); end if;
  if c.id is null or c.user_id<>r.captured_by or c.company_id<>r.company_id
    or c.location_id<>r.location_id or c.session_id is distinct from r.originating_session_id
    or c.device_key is distinct from r.device_key or r.captured_at<c.issued_at
    or r.captured_at>=c.expires_at or v_now>=c.expires_at then
    v_blockers:=v_blockers||jsonb_build_object('code','offline_context_review'); end if;
  if s.id is null or s.status<>'open' or p_destination_session_id is distinct from s.id
    and p_destination_session_id is not null then
    v_blockers:=v_blockers||jsonb_build_object('code','session_crossover_required'); end if;
  if d.id is null or d.status<>'open' then
    v_blockers:=v_blockers||jsonb_build_object('code','open_destination_required'); end if;

  if jsonb_typeof(p_payload->'lines') is distinct from 'array'
    or jsonb_array_length(p_payload->'lines') not between 1 and 128 then
    v_blockers:=v_blockers||jsonb_build_object('code','invalid_sale_lines');
  else
    for l in select * from jsonb_array_elements(p_payload->'lines') loop
      v_codes:='[]';v_evidence:=l->'capture';v_current:=null;v_stock:=null;
      begin
        v_current:=public.offline_line_current_state(r.company_id,l);
        if not coalesce((v_current->>'available')::boolean,false) then
          v_codes:=v_codes||'"item_unavailable"'::jsonb; end if;
        if jsonb_typeof(v_evidence) is distinct from 'object' or not (v_evidence ?&
          (v_semantic||array['expected_unit_price','price_floor','catalogue_version']))
          or jsonb_typeof(v_evidence->'catalogue_version') is distinct from 'object' then
          v_codes:=v_codes||'"item_evidence_required"'::jsonb;
        else
          if exists(select 1 from unnest(v_semantic) k
            where v_evidence->k is distinct from v_current->k) then
            v_codes:=v_codes||'"item_structure_changed"'::jsonb; end if;
          if v_evidence->'expected_unit_price' is distinct from v_current->'expected_unit_price'
            or v_evidence->'price_floor' is distinct from v_current->'price_floor' then
            v_codes:=v_codes||'"item_price_changed"'::jsonb; end if;
        end if;
        if (l->>'units_per_unit')::numeric is distinct from (v_evidence->>'units_per_unit')::numeric then
          v_codes:=v_codes||'"item_structure_changed"'::jsonb; end if;
        if l?'custom_price' and l->'custom_price'<>'null'::jsonb
          and not public.current_user_has_permission('OverridePrice') then
          v_codes:=v_codes||'"price_override_permission_required"'::jsonb; end if;
        v_quantity:=(l->>'quantity')::numeric;
        if v_quantity is null or v_quantity<=0 or v_quantity<>round(v_quantity,3)
          or ((not coalesce((v_current->>'allow_fractional')::boolean,false)
            or nullif(l->>'pack_id','') is not null) and v_quantity<>trunc(v_quantity)) then
          v_codes:=v_codes||'"invalid_quantity"'::jsonb; end if;
        v_total:=v_total+round(v_quantity*coalesce((l->>'custom_price')::bigint,(l->>'unit_price')::bigint));
        -- Include the actual product treatment, not just the company's default rate.
        v_current:=v_current||jsonb_build_object('tax_treatment',(select to_jsonb(t)
          from public.resolve_configured_product_tax(r.company_id,(v_current->>'product_id')::uuid,
            round(v_quantity*coalesce((l->>'custom_price')::bigint,(l->>'unit_price')::bigint))::bigint,v_now,true) t));
        if coalesce((v_current->>'track_inventory')::boolean,false) then
          select coalesce(sum(b.remaining),0) into v_stock from public.inventory_batches b
            where b.company_id=r.company_id and b.stock_location_id=r.location_id
              and b.variant_id=(l->>'variant_id')::uuid and b.remaining>0;
          if v_stock < (select sum((x->>'quantity')::numeric *
            coalesce((x->>'units_per_unit')::numeric,1)) from jsonb_array_elements(p_payload->'lines') x
            where x->>'variant_id'=l->>'variant_id') then
            v_codes:=v_codes||'"insufficient_stock"'::jsonb; end if;
        else v_stock:=null; end if;
      exception when others then
        v_current:=coalesce(v_current,'{}');v_codes:=v_codes||jsonb_build_array('invalid_item_evidence');
      end;
      v_line:=jsonb_build_object('index',v_index,'captured',coalesce(r.original_request->'lines'->v_index,l),
        'current',v_current,'proposed',l,'available_stock',v_stock,
        'captured_base_quantity',(r.original_request->'lines'->v_index->>'quantity')::numeric *
          coalesce((r.original_request->'lines'->v_index->>'units_per_unit')::numeric,1),
        'proposed_base_quantity',(l->>'quantity')::numeric*coalesce((l->>'units_per_unit')::numeric,1),
        'reasons',v_codes);
      v_lines:=v_lines||jsonb_build_array(v_line);
      if jsonb_array_length(v_codes)>0 then v_blockers:=v_blockers||jsonb_build_object(
        'code','item_conflict','line',v_index,'reasons',v_codes); end if;
      v_state:=v_state||jsonb_build_array(v_current-array['product_name','variant_name','unit_name','catalogue_version']);
      v_index:=v_index+1;
    end loop;
  end if;
  if jsonb_typeof(p_payload->'payments') is distinct from 'array' then
    v_blockers:=v_blockers||jsonb_build_object('code','invalid_payments');
  else
    select coalesce(sum((p->>'amount')::bigint),0) into v_paid from jsonb_array_elements(p_payload->'payments') p;
    if jsonb_array_length(p_payload->'payments')=0 or
      (jsonb_array_length(p_payload->'payments')=1 and p_payload#>>'{payments,0,method}'='credit') then
      select * into v_customer from public.customers where company_id=r.company_id
        and id=nullif(p_payload->>'customer_id','')::uuid and deleted_at is null;
      if v_customer.id is null or not v_customer.is_credit_approved then
        v_blockers:=v_blockers||jsonb_build_object('code','credit_approval_required'); end if;
    elsif v_paid<>v_total then v_blockers:=v_blockers||jsonb_build_object('code','payment_mismatch'); end if;
  end if;
  if nullif(p_payload->>'customer_id','') is not null and not exists(
    select 1 from public.customers where company_id=r.company_id and id=(p_payload->>'customer_id')::uuid and deleted_at is null
  ) then v_blockers:=v_blockers||jsonb_build_object('code','customer_unavailable'); end if;
  if jsonb_typeof(p_payload->'payments')='array' and exists(
    select 1 from jsonb_array_elements(p_payload->'payments') pay
    left join public.payment_methods pm on pm.company_id=r.company_id and pm.code=pay->>'method'
    left join public.location_payment_methods lm on lm.payment_method_id=pm.id and lm.location_id=r.location_id
    where pay->>'method'<>'credit' and (pm.id is null or not pm.enabled or (lm.id is not null and not lm.enabled)
      or coalesce((pay->>'amount')::bigint,0)<=0
      or (pm.reconciliation_type='statement_match' and length(btrim(coalesce(pay->>'reference','')))=0))
  ) then v_blockers:=v_blockers||jsonb_build_object('code','payment_method_review'); end if;
  if p_payload->'fulfillment' is not null and p_payload->'fulfillment'<>'null'::jsonb then
    begin
      perform public.assert_fulfillment_location_ready(r.company_id,r.location_id);
    exception when others then
      v_blockers:=v_blockers||jsonb_build_object('code','fulfillment_unavailable','message',sqlerrm);
    end;
    if public.normalize_fulfillment_phone(p_payload#>>'{fulfillment,phone}') is null then
      v_blockers:=v_blockers||jsonb_build_object('code','fulfillment_phone_required'); end if;
    if p_payload#>>'{fulfillment,type}'='delivery'
      and length(btrim(coalesce(p_payload#>>'{fulfillment,address}','')))=0 then
      v_blockers:=v_blockers||jsonb_build_object('code','fulfillment_address_required'); end if;
    if p_payload#>>'{fulfillment,collection_kind}'='cod' then
      v_blockers:=v_blockers||jsonb_build_object('code','offline_cod_checkout_not_supported'); end if;
  end if;
  v_tax:=public.offline_tax_settings_at(r.company_id,v_now);
  return jsonb_build_object('request_id',r.id,'status',r.status,'captured_at',r.captured_at,
    'received_at',r.received_at,'server_time',v_now,'original_session',to_jsonb(s),
    'destination_session',to_jsonb(d),'original_closing_count',(select jsonb_build_object('id',dc.id,'declared_cash',dc.declared_cash)
      from public.cash_drawer_counts dc where dc.session_id=s.id and dc.count_type='closing' limit 1),'lines',v_lines,'payments',p_payload->'payments',
    'fulfillment',p_payload->'fulfillment','total',v_total,'paid',v_paid,
    'vat',v_tax,'blockers',v_blockers,'review_fingerprint',public.offline_request_fingerprint(
      jsonb_build_object('payload',p_payload,'items',v_state,'destination',d.id,'status',d.status,
        'vat_profile',v_tax->'active_profile','rates',v_tax->'categories')));
end;
$$;
revoke all on function public.offline_sale_assessment(uuid,jsonb,uuid,timestamptz) from public,anon,authenticated;

create function public.offline_sale_result(p_request_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('status',r.status,'review_id',r.id,'durable_custody',true,
    'order_id',r.posted_order_id,'blockers',r.blockers,'client_ref',r.client_ref)
  from public.offline_sale_requests r where r.id=p_request_id
$$;
revoke all on function public.offline_sale_result(uuid) from public,anon,authenticated;

create function public.submit_offline_sale(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();r public.offline_sale_requests%rowtype;
  c public.offline_sale_contexts%rowtype;v_location uuid;v_origin uuid;v_fingerprint text;
  v_ref text;v_order public.orders%rowtype;v_assessment jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>1048576 then
    raise exception 'invalid_offline_request'; end if;
  if p_request->'protocol_version' is distinct from '2'::jsonb then
    raise exception 'offline_client_update_required: old queued sales are no longer accepted; update the app'; end if;
  v_location:=nullif(p_request->>'location_id','')::uuid;
  if not public.current_user_can_access_location(v_location) then
    raise exception 'location_access_denied'; end if;
  v_ref:=nullif(btrim(p_request->>'client_ref'),'');
  if v_ref is null or length(v_ref)>200 then raise exception 'client_ref_required'; end if;
  v_fingerprint:=public.offline_request_fingerprint(p_request);
  perform pg_advisory_xact_lock(hashtextextended('sale:'||v_company::text||':'||v_ref,73));
  select * into r from public.offline_sale_requests where company_id=v_company and client_ref=v_ref for update;
  if r.id is not null then
    if r.request_fingerprint<>v_fingerprint then raise exception 'idempotency_conflict: original offline request is immutable'; end if;
    -- Only an approval already granted may resume. Review/waiting holds never
    -- retry posting implicitly, and no retry resets capture age or context.
    if r.status='approval' then return public.execute_offline_sale(r.id,r.active_revision_id); end if;
    return public.offline_sale_result(r.id);
  end if;
  select * into c from public.offline_sale_contexts
    where id=nullif(p_request->>'offline_context_id','')::uuid
      and company_id=v_company and location_id=v_location and user_id=auth.uid();
  select id into v_origin from public.cashier_sessions
    where id=nullif(p_request->>'originating_session_id','')::uuid
      and company_id=v_company and location_id=v_location for share;
  insert into public.offline_sale_requests(company_id,location_id,captured_by,client_ref,device_key,
    context_id,originating_session_id,captured_at,original_request,request_fingerprint)
  values(v_company,v_location,auth.uid(),v_ref,p_request->>'device_key',c.id,v_origin,
    nullif(p_request->>'occurred_at','')::timestamptz,p_request,v_fingerprint) returning * into r;
  insert into public.offline_sale_events(request_id,company_id,actor_id,action)
    values(r.id,v_company,auth.uid(),'custody_received');

  -- Lost online responses may predate custody. Return that sale without touching
  -- its stock, payment or tax treatment, before any present-day session checks.
  select * into v_order from public.orders where company_id=v_company
    and client_ref=v_ref and (status='completed' or (status='voided' and posted_at is not null)) for update;
  if v_order.id is not null then
    update public.offline_sale_requests set status='completed',posted_order_id=v_order.id where id=r.id;
    return public.offline_sale_result(r.id);
  end if;
  begin
    v_assessment:=public.offline_sale_assessment(r.id,p_request);
    update public.offline_sale_requests set blockers=v_assessment->'blockers',
      status=case when v_assessment->'blockers' @> '[{"code":"open_destination_required"}]'::jsonb
        then 'waiting' else 'review' end where id=r.id;
    if jsonb_array_length(v_assessment->'blockers')=0 then
      return public.execute_offline_sale(r.id,null);
    end if;
  exception when others then
    -- The subtransaction rolls back any attempted sale, never the custody row.
    update public.offline_sale_requests set status='failed',blockers=jsonb_build_array(
      jsonb_build_object('code','validation_failed','message',sqlerrm)) where id=r.id;
  end;
  return public.offline_sale_result(r.id);
end;
$$;
revoke all on function public.submit_offline_sale(jsonb) from public,anon;
grant execute on function public.submit_offline_sale(jsonb) to authenticated;

create function public.list_offline_sale_reviews()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'client_ref',r.client_ref,
    'location_id',r.location_id,'device_key',r.device_key,'originating_session_id',r.originating_session_id,
    'captured_at',r.captured_at,'received_at',r.received_at,'status',r.status,
    'payments',r.original_request->'payments','blockers',r.blockers,
    'order_id',r.posted_order_id) order by r.received_at),'[]'::jsonb)
  from public.offline_sale_requests r where r.company_id=public.current_company_id()
    and public.current_user_has_permission('SettleOrder')
    and public.current_user_can_access_location(r.location_id)
    and r.status not in ('completed','cancelled')
$$;
revoke all on function public.list_offline_sale_reviews() from public,anon;
grant execute on function public.list_offline_sale_reviews() to authenticated;

create function public.get_offline_sale_review(p_request_id uuid,p_destination_session_id uuid default null,
  p_proposed jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.offline_sale_requests%rowtype;v_result jsonb;v_payload jsonb;
begin
  select * into r from public.offline_sale_requests where id=p_request_id and company_id=public.current_company_id();
  if r.id is null or not public.current_user_has_permission('SettleOrder')
    or not public.current_user_can_access_location(r.location_id) then
    raise exception 'offline_review_not_found'; end if;
  if r.status in ('completed','cancelled') then return public.offline_sale_result(r.id); end if;
  v_payload:=coalesce(p_proposed,(select payload from public.offline_sale_revisions where id=r.active_revision_id),r.original_request);
  v_result:=public.offline_sale_assessment(r.id,v_payload,p_destination_session_id);
  return v_result||jsonb_build_object('original_request',r.original_request,
    'proposed_request',v_payload,'open_sessions',coalesce((
      select jsonb_agg(to_jsonb(s)) from public.cashier_sessions s where s.company_id=r.company_id
        and s.location_id=r.location_id and s.status='open'),'[]'::jsonb));
end;
$$;
revoke all on function public.get_offline_sale_review(uuid,uuid,jsonb) from public,anon;
grant execute on function public.get_offline_sale_review(uuid,uuid,jsonb) to authenticated;

-- Closure holds the same session row lock used by custody acknowledgement.
-- Device heartbeat updates and retirement never remove these obligations.
create function public.block_session_close_with_offline_sales()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='open' and new.status='closed' and exists(
    select 1 from public.offline_sale_requests r where r.company_id=old.company_id
      and r.location_id=old.location_id and r.status not in ('completed','cancelled')
      and (r.originating_session_id=old.id or r.originating_session_id is null or exists(
        select 1 from public.offline_sale_revisions v where v.id=r.active_revision_id
          and v.destination_session_id=old.id))) then
    raise exception 'unresolved_offline_sales: resolve pending sales before closing this session'; end if;
  return new;
end;
$$;
create trigger cashier_session_offline_obligations before update of status on public.cashier_sessions
  for each row execute function public.block_session_close_with_offline_sales();
revoke all on function public.block_session_close_with_offline_sales() from public,anon,authenticated;

create function public.execute_offline_sale(p_request_id uuid,p_revision_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.offline_sale_requests%rowtype;v public.offline_sale_revisions%rowtype;
  o public.orders%rowtype;v_payload jsonb;v_assessment jsonb;v_session uuid;v_customer uuid;
  v_key text;v_order_id uuid;v_result jsonb;v_fulfillment jsonb;v_approval uuid;v_external boolean;
  v_credit boolean;v_context public.posting_context;v_cash bigint;v_count public.cash_drawer_counts%rowtype;
begin
  select * into strict r from public.offline_sale_requests where id=p_request_id;
  perform pg_advisory_xact_lock(hashtextextended('sale:'||r.company_id::text||':'||r.client_ref,73));
  select * into r from public.offline_sale_requests where id=p_request_id for update;
  if r.status in ('completed','cancelled') then return public.offline_sale_result(r.id); end if;
  if p_revision_id is not null then
    select * into strict v from public.offline_sale_revisions where id=p_revision_id and request_id=r.id;
  end if;
  if r.active_revision_id is distinct from p_revision_id then
    raise exception 'offline_revision_superseded'; end if;
  if r.status='approval' and exists(select 1 from public.orders x where x.offline_request_id=r.id
    and x.offline_revision_id is not distinct from p_revision_id and x.status in ('draft','pending_payment')
    and exists(select 1 from public.approvals ap where ap.company_id=r.company_id and ap.status='pending'
      and ap.metadata->>'order_id'=x.id::text)) then
    return public.offline_sale_result(r.id); end if;
  v_payload:=coalesce(v.payload,r.original_request);
  v_session:=coalesce(v.destination_session_id,r.originating_session_id);
  v_key:=coalesce(v.execution_key,r.client_ref);
  v_assessment:=public.offline_sale_assessment(r.id,v_payload,v_session);
  if v.id is not null and v.review_fingerprint<>v_assessment->>'review_fingerprint' then
    update public.offline_sale_requests set status='review',blockers='[{"code":"review_changed"}]' where id=r.id;
    return public.offline_sale_result(r.id);
  end if;
  if exists(select 1 from jsonb_array_elements(v_assessment->'blockers') b
    where v.id is null or b->>'code' not in
      ('capture_age_review','offline_context_review','session_crossover_required')) then
    update public.offline_sale_requests set status='review',blockers=v_assessment->'blockers' where id=r.id;
    return public.offline_sale_result(r.id);
  end if;
  begin
    perform set_config('app.business_location_id',r.location_id::text,true);
    perform set_config('app.offline_request_id',r.id::text,true);
    perform set_config('app.offline_revision_id',coalesce(v.id::text,''),true);
    perform set_config('app.offline_destination_session_id',v_session::text,true);
    v_customer:=nullif(v_payload->>'customer_id','')::uuid;
    if v_payload->'fulfillment' is not null and v_payload->'fulfillment'<>'null'::jsonb then
      perform public.assert_fulfillment_location_ready(r.company_id,r.location_id);
      if coalesce(v_payload#>>'{fulfillment,collection_kind}','none')='cod' then
        raise exception 'offline_cod_checkout_not_supported'; end if;
      if public.normalize_fulfillment_phone(v_payload#>>'{fulfillment,phone}') is null then
        raise exception 'offline_fulfillment_recipient_phone_required'; end if;
      v_customer:=public.resolve_checkout_customer_core(r.company_id,
        coalesce(v_payload->'checkout_customer','{}'),false);
    end if;
    v_order_id:=public.prepare_sale_order_core(v_customer,
      v_payload->'lines',v_key,nullif(v_payload->>'draft_id','')::uuid);
    select * into o from public.orders where id=v_order_id;
    if o.status='completed' or (o.status='voided' and o.posted_at is not null) then
      update public.offline_sale_requests set status='completed',posted_order_id=o.id,blockers='[]' where id=r.id;
      return public.offline_sale_result(r.id);
    end if;
    select id into v_approval from public.approvals where company_id=r.company_id
      and type='below_wholesale' and status='pending' and metadata->>'order_id'=o.id::text limit 1;
    v_credit:=jsonb_array_length(v_payload->'payments')=0 or
      (jsonb_array_length(v_payload->'payments')=1 and v_payload#>>'{payments,0,method}'='credit');
    select exists(select 1 from jsonb_array_elements(v_payload->'payments') p
      left join public.payment_methods pm on pm.company_id=r.company_id and pm.code=p->>'method'
      left join public.location_payment_methods lpm on lpm.payment_method_id=pm.id and lpm.location_id=r.location_id
      where p->>'method'<>'credit' and (pm.id is null or
        not coalesce(lpm.is_cashier_controlled,pm.is_cashier_controlled))) into v_external;
    if v_approval is not null then
      -- The existing price-approval workflow validates an unchanged draft.
      -- Custody owns the paid request while that draft awaits its decision.
      v_result:=jsonb_build_object('status','approval_required','order_id',o.id,'approval_id',v_approval);
    elsif (v_credit and not public.current_user_has_permission('ApproveCustomerCredit')) or
      (v_external and not public.current_user_has_permission('ViewFinancials')) then
      -- Reuse the existing separate credit / external-tender approval process.
      perform public.hold_sale_order_core(o.id,'approval');
      v_result:=public.post_sale_at_location(r.location_id,v_customer,v_payload->'lines',
        v_payload->'payments',false,v_key,nullif(v_payload->>'draft_id','')::uuid,v.reason);
    else
      if v_external and v_customer is null then
        raise exception 'cashier_controlled_only: walk-in sales require cashier-controlled accounts'; end if;
      v_context:=row(r.company_id,r.location_id,auth.uid(),v_session,
        coalesce(r.captured_at,r.received_at),null,'offline',v.reason)::public.posting_context;
      perform public.complete_order_core(o.id,v_payload->'payments',v_context);
      v_result:=jsonb_build_object('status','completed','order_id',o.id);
    end if;
    if v_payload->'fulfillment' is not null and v_payload->'fulfillment'<>'null'::jsonb then
      v_fulfillment:=public.attach_order_fulfillment_core(v_result,v_customer,v_payload->'fulfillment',false);
    end if;
    select * into o from public.orders where id=o.id;
    if o.status='completed' then
      update public.offline_sale_requests set status='completed',posted_order_id=o.id,
        blockers='[]',updated_at=clock_timestamp() where id=r.id;
    elsif v_result->>'status'='approval_required' then
      update public.offline_sale_requests set status='approval',blockers=jsonb_build_array(
        jsonb_build_object('code','approval_required','approval_id',v_result->>'approval_id','order_id',o.id)) where id=r.id;
    else raise exception 'offline_posting_outcome_unknown'; end if;
    insert into public.offline_sale_events(request_id,company_id,actor_id,action,reason,details)
      values(r.id,r.company_id,auth.uid(),'posting_result',v.reason,v_result);
    perform public.emit_sale_cache_batches(o.id);
  exception when others then
    update public.offline_sale_requests set status='review',blockers=jsonb_build_array(
      jsonb_build_object('code','posting_blocked','message',sqlerrm)),updated_at=clock_timestamp() where id=r.id;
  end;
  perform set_config('app.offline_request_id','',true);
  perform set_config('app.offline_revision_id','',true);
  perform set_config('app.offline_destination_session_id','',true);
  return public.offline_sale_result(r.id);
end;
$$;
revoke all on function public.execute_offline_sale(uuid,uuid) from public,anon,authenticated;

create function public.confirm_offline_sale_review(p_request_id uuid,p_confirmation_key uuid,
  p_review_fingerprint text,p_destination_session_id uuid,p_reason text,
  p_proposed jsonb default null,p_confirm_crossover boolean default false,p_cash_resolution jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.offline_sale_requests%rowtype;v public.offline_sale_revisions%rowtype;
  v_payload jsonb;v_assessment jsonb;v_original_session public.cashier_sessions%rowtype;
  v_cash bigint;v_included bigint;v_count public.cash_drawer_counts%rowtype;
begin
  select * into r from public.offline_sale_requests where id=p_request_id and company_id=public.current_company_id();
  if r.id is null or not public.current_user_has_permission('SettleOrder')
    or not public.current_user_can_access_location(r.location_id) then raise exception 'offline_review_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sale:'||r.company_id::text||':'||r.client_ref,73));
  select * into r from public.offline_sale_requests where id=r.id for update;
  if r.status in ('completed','cancelled') then return public.offline_sale_result(r.id); end if;
  if p_confirmation_key is null or length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then
    raise exception 'review_reason_required'; end if;
  v_payload:=coalesce(p_proposed,r.original_request);
  if (v_payload-array['lines','payments','customer_id','checkout_customer','fulfillment','draft_id'])
    is distinct from (r.original_request-array['lines','payments','customer_id','checkout_customer','fulfillment','draft_id']) then
    raise exception 'offline_capture_context_immutable'; end if;
  select * into v from public.offline_sale_revisions where request_id=r.id and confirmation_key=p_confirmation_key;
  if v.id is not null then
    if v.payload is distinct from v_payload or v.destination_session_id is distinct from p_destination_session_id
      or v.cash_resolution is distinct from p_cash_resolution or v.review_fingerprint is distinct from p_review_fingerprint
    then raise exception 'idempotency_conflict: confirmation key reused'; end if;
    return public.execute_offline_sale(r.id,v.id);
  end if;
  select * into v_original_session from public.cashier_sessions where id=r.originating_session_id;
  if (v_original_session.id is null or v_original_session.status<>'open'
    or r.originating_session_id is distinct from p_destination_session_id) and not p_confirm_crossover then
    raise exception 'session_crossover_confirmation_required'; end if;

  -- Structural repairs and financial corrections keep their own permissions.
  if exists(select 1 from jsonb_array_elements(v_payload->'lines') with ordinality n(line,i)
    full join jsonb_array_elements(r.original_request->'lines') with ordinality o(line,i) using(i)
    where (n.line-array['unit_price','custom_price','expected_unit_price','override_reason','capture'])
      is distinct from (o.line-array['unit_price','custom_price','expected_unit_price','override_reason','capture'])
      or exists(select 1 from unnest(array['product_id','variant_id','pack_id','stock_unit','units_per_unit','kind','allow_fractional','track_inventory']) k
        where n.line->'capture'->k is distinct from o.line->'capture'->k))
    and not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required for structural corrections'; end if;
  if exists(select 1 from jsonb_array_elements(v_payload->'lines') with ordinality n(line,i)
    join jsonb_array_elements(r.original_request->'lines') with ordinality o(line,i) using(i)
    where (n.line->'expected_unit_price',n.line->'unit_price',n.line->'custom_price',n.line#>'{capture,price_floor}')
      is distinct from (o.line->'expected_unit_price',o.line->'unit_price',o.line->'custom_price',o.line#>'{capture,price_floor}'))
    and not public.current_user_has_permission('OverridePrice') then
    raise exception 'permission_denied: OverridePrice required'; end if;
  if v_payload->'payments' is distinct from r.original_request->'payments' then
    if not public.current_user_has_permission('ManageReconciliation') then
      raise exception 'permission_denied: ManageReconciliation required'; end if;
    if exists(select 1 from jsonb_array_elements(r.original_request->'payments') p
      where p->>'method'='mpesa' or p?'collection_allocation_id') then
      raise exception 'provider_payment_resolution_required: preserve received funds'; end if;
  end if;
  select coalesce(sum((p->>'amount')::bigint),0) into v_cash
    from jsonb_array_elements(r.original_request->'payments') p where p->>'method'='cash';
  if v_cash>0 and (v_original_session.id is null or v_original_session.status<>'open') then
    if not public.current_user_has_permission('ManageReconciliation') then
      raise exception 'permission_denied: ManageReconciliation required for late cash'; end if;
    if jsonb_typeof(p_cash_resolution) is distinct from 'object'
      or not (p_cash_resolution ?& array['included_amount','reason'])
      or length(btrim(coalesce(p_cash_resolution->>'reason','')))<3 then
      raise exception 'late_cash_resolution_required'; end if;
    v_included:=(p_cash_resolution->>'included_amount')::bigint;
    if v_included is null or v_included<0 or v_included>v_cash then raise exception 'invalid_late_cash_amount'; end if;
    if nullif(p_cash_resolution->>'closing_count_id','') is not null then
      select * into v_count from public.cash_drawer_counts where id=(p_cash_resolution->>'closing_count_id')::uuid
        and company_id=r.company_id and count_type='closing';
      if v_count.id is null or (r.originating_session_id is not null and v_count.session_id<>r.originating_session_id)
        or not exists(select 1 from public.cashier_sessions s where s.id=v_count.session_id and s.location_id=r.location_id)
      then raise exception 'invalid_original_closing_count'; end if;
    elsif v_included>0 then raise exception 'original_closing_count_required'; end if;
  elsif p_cash_resolution is not null then raise exception 'unexpected_cash_resolution'; end if;
  v_assessment:=public.offline_sale_assessment(r.id,v_payload,p_destination_session_id);
  if v_assessment->>'review_fingerprint' is distinct from p_review_fingerprint then
    return jsonb_build_object('status','review','review_id',r.id,'durable_custody',true,
      'blockers',jsonb_build_array(jsonb_build_object('code','review_changed'))); end if;
  if exists(select 1 from jsonb_array_elements(v_assessment->'blockers') b where b->>'code' not in
    ('capture_age_review','offline_context_review','session_crossover_required')) then
    update public.offline_sale_requests set status='review',blockers=v_assessment->'blockers' where id=r.id;
    return public.offline_sale_result(r.id);
  end if;
  insert into public.offline_sale_revisions(request_id,company_id,confirmation_key,payload,payload_fingerprint,
    review_fingerprint,destination_session_id,created_by,reason,cash_resolution)
  values(r.id,r.company_id,p_confirmation_key,v_payload,public.offline_request_fingerprint(v_payload),
    p_review_fingerprint,p_destination_session_id,auth.uid(),p_reason,p_cash_resolution) returning * into v;
  update public.offline_sale_requests set active_revision_id=v.id where id=r.id;
  insert into public.offline_sale_events(request_id,company_id,actor_id,action,reason,details)
    values(r.id,r.company_id,auth.uid(),'review_confirmed',p_reason,jsonb_build_object(
      'revision_id',v.id,'original_session_id',r.originating_session_id,
      'destination_session_id',p_destination_session_id,'crossover',p_confirm_crossover));
  return public.execute_offline_sale(r.id,v.id);
end;
$$;
revoke all on function public.confirm_offline_sale_review(uuid,uuid,text,uuid,text,jsonb,boolean,jsonb) from public,anon;
grant execute on function public.confirm_offline_sale_review(uuid,uuid,text,uuid,text,jsonb,boolean,jsonb) to authenticated;

create function public.cancel_offline_sale(p_request_id uuid,p_reason text,p_payment_resolution jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.offline_sale_requests%rowtype;v_paid bigint;v_cash bigint;v_count public.cash_drawer_counts%rowtype;
  v_included bigint;v_session uuid;v_context public.posting_context;v_order_id uuid;
begin
  select * into r from public.offline_sale_requests where id=p_request_id and company_id=public.current_company_id();
  if r.id is null or not public.current_user_has_permission('SettleOrder')
    or not public.current_user_can_access_location(r.location_id) then raise exception 'offline_review_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sale:'||r.company_id::text||':'||r.client_ref,73));
  select * into r from public.offline_sale_requests where id=r.id for update;
  if r.status in ('completed','cancelled') then return public.offline_sale_result(r.id); end if;
  if length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'resolution_reason_required'; end if;
  select coalesce(sum((p->>'amount')::bigint),0),
    coalesce(sum((p->>'amount')::bigint) filter(where p->>'method'='cash'),0)
    into v_paid,v_cash from jsonb_array_elements(r.original_request->'payments') p
    where p->>'method'<>'credit';
  if v_paid>0 then
    if not public.current_user_has_permission('ManageReconciliation') then
      raise exception 'permission_denied: ManageReconciliation required for paid-sale cancellation'; end if;
    if jsonb_typeof(p_payment_resolution) is distinct from 'object'
      or p_payment_resolution->>'action' is distinct from 'payment_returned'
      or length(btrim(coalesce(p_payment_resolution->>'reference','')))<3 then
      raise exception 'payment_resolution_required: record the payment return before cancellation'; end if;
    -- A verified provider receipt cannot be dismissed by a cashier declaration.
    if exists(select 1 from jsonb_array_elements(r.original_request->'payments') p
      join public.payment_collections c on c.company_id=r.company_id
        and c.provider_receipt=coalesce(p->>'mpesa_receipt',p->>'reference')
      where p->>'method'='mpesa' and c.provider_status<>'reversed'
        and c.classification is distinct from 'refunded') then
      raise exception 'provider_payment_resolution_required'; end if;
    v_included:=coalesce((p_payment_resolution->>'included_in_closing_count')::bigint,0);
    if v_included<0 or v_included>v_cash then raise exception 'invalid_late_cash_amount'; end if;
    if v_cash>0 and not (p_payment_resolution?'included_in_closing_count') then
      raise exception 'late_cash_resolution_required'; end if;
    if v_included>0 then
      select * into v_count from public.cash_drawer_counts where company_id=r.company_id
        and id=nullif(p_payment_resolution->>'closing_count_id','')::uuid and count_type='closing';
      if v_count.id is null or (r.originating_session_id is not null and v_count.session_id<>r.originating_session_id)
        or not exists(select 1 from public.cashier_sessions s where s.id=v_count.session_id and s.location_id=r.location_id)
      then raise exception 'invalid_original_closing_count'; end if;
      v_session:=public.require_open_cashier_session_at_location(r.company_id,r.location_id);
      v_context:=row(r.company_id,r.location_id,auth.uid(),v_session,clock_timestamp(),
        (clock_timestamp() at time zone (select business_timezone from public.companies where id=r.company_id))::date,
        'offline_review',p_reason)::public.posting_context;
      perform public.post_journal_entry_with_context(r.company_id,'OfflineCashCancellation',r.id::text,
        'Returned cash from cancelled offline sale',jsonb_build_array(
          jsonb_build_object('account_code','CASH_SHORT_OVER','debit',v_included,
            'meta',jsonb_build_object('offlineRequestId',r.id,'closingCountId',v_count.id)),
          jsonb_build_object('account_code','CASH_ON_HAND','credit',v_included,
            'meta',jsonb_build_object('offlineRequestId',r.id,'closingCountId',v_count.id))
        ),v_context);
    end if;
  end if;
  -- Retire unposted approval attempts through the existing unpaid-sale workflow.
  for v_order_id in select id from public.orders where offline_request_id=r.id and status in ('draft','pending_payment') loop
    update public.orders set status='voided',voided_at=clock_timestamp(),voided_by=auth.uid(),void_reason=p_reason
      where id=v_order_id and status='draft';
    perform public.void_approval_held_order(v_order_id,p_reason);
    update public.approvals set status='denied',decided_by=auth.uid(),decided_at=clock_timestamp(),
      decision_reason='Offline sale cancelled after payment resolution: '||p_reason
      where company_id=r.company_id and status='pending' and metadata->>'order_id'=v_order_id::text;
  end loop;
  insert into public.offline_sale_events(request_id,company_id,actor_id,action,reason,details)
    values(r.id,r.company_id,auth.uid(),'cancelled_after_resolution',p_reason,coalesce(p_payment_resolution,'{}'));
  update public.offline_sale_requests set status='cancelled',blockers='[]',updated_at=clock_timestamp() where id=r.id;
  return public.offline_sale_result(r.id);
end;
$$;
revoke all on function public.cancel_offline_sale(uuid,text,jsonb) from public,anon;
grant execute on function public.cancel_offline_sale(uuid,text,jsonb) to authenticated;

create function public.preserve_sale_capture_times()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.offline_request_id is not null and
    (new.customer_id,new.total,new.quantity_total,new.offline_request_id,new.offline_revision_id,new.sale_request_fingerprint)
    is distinct from
    (old.customer_id,old.total,old.quantity_total,old.offline_request_id,old.offline_revision_id,old.sale_request_fingerprint) then
    raise exception 'offline_order_immutable: use a review revision'; end if;
  if old.captured_at is not null and new.captured_at is distinct from old.captured_at then
    raise exception 'sale_capture_time_immutable'; end if;
  if (old.status='completed' or (old.status='voided' and old.posted_at is not null)) and
    (new.posted_at,new.completed_at,new.offline_request_id,new.offline_revision_id,new.posting_request_fingerprint)
    is distinct from (old.posted_at,old.completed_at,old.offline_request_id,old.offline_revision_id,old.posting_request_fingerprint) then
    raise exception 'sale_posting_evidence_immutable'; end if;
  return new;
end;
$$;
create trigger orders_preserve_capture_times before update on public.orders
  for each row execute function public.preserve_sale_capture_times();
revoke all on function public.preserve_sale_capture_times() from public,anon,authenticated;

create function public.validate_offline_order_posting(p_order_id uuid,p_session_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;r public.offline_sale_requests%rowtype;
  v public.offline_sale_revisions%rowtype;a jsonb;
begin
  select * into o from public.orders where id=p_order_id;
  if o.offline_request_id is null then return; end if;
  select * into strict r from public.offline_sale_requests where id=o.offline_request_id for update;
  if r.status in ('completed','cancelled') then raise exception 'offline_sale_already_resolved'; end if;
  select * into v from public.offline_sale_revisions where id=o.offline_revision_id and request_id=r.id;
  if r.active_revision_id is distinct from o.offline_revision_id then
    raise exception 'offline_revision_superseded'; end if;
  if p_session_id is distinct from coalesce(v.destination_session_id,r.originating_session_id) then
    raise exception 'offline_destination_session_changed'; end if;
  a:=public.offline_sale_assessment(r.id,coalesce(v.payload,r.original_request),p_session_id);
  if v.id is not null and v.review_fingerprint is distinct from a->>'review_fingerprint' then
    raise exception 'offline_review_changed: review the current catalogue and VAT treatment again'; end if;
  if exists(select 1 from jsonb_array_elements(a->'blockers') b where v.id is null or b->>'code' not in
    ('capture_age_review','offline_context_review','session_crossover_required')) then
    raise exception 'offline_review_required: %',a->'blockers'; end if;
end;
$$;
revoke all on function public.validate_offline_order_posting(uuid,uuid) from public,anon,authenticated;

create function public.finalize_offline_sale_custody()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.offline_sale_requests%rowtype;v public.offline_sale_revisions%rowtype;
  v_amount bigint;v_context public.posting_context;v_correction uuid;
begin
  if new.status='voided' and old.status='pending_payment' and new.posted_at is null
    and new.offline_request_id is not null then
    update public.offline_sale_requests set status='review',
      blockers='[{"code":"approval_attempt_voided","message":"The previous approval attempt was declined. Review a correction or resolve the payment."}]',
      updated_at=clock_timestamp()
      where id=new.offline_request_id and active_revision_id is not distinct from new.offline_revision_id
        and status not in ('completed','cancelled');
    return new;
  end if;
  if new.status<>'completed' or old.status='completed' or new.offline_request_id is null then return new; end if;
  select * into strict r from public.offline_sale_requests where id=new.offline_request_id for update;
  select * into v from public.offline_sale_revisions where id=new.offline_revision_id and request_id=r.id;
  if v.cash_resolution is not null then
    v_amount:=(v.cash_resolution->>'included_amount')::bigint;
    insert into public.offline_cash_corrections(request_id,company_id,revision_id,closing_count_id,
      order_id,included_amount,created_by,reason)
    values(r.id,r.company_id,v.id,nullif(v.cash_resolution->>'closing_count_id','')::uuid,
      new.id,v_amount,v.created_by,v.cash_resolution->>'reason');
    if v_amount>0 then
      v_context:=row(new.company_id,new.location_id,v.created_by,new.cashier_session_id,
        coalesce(r.captured_at,r.received_at),new.accounting_posting_date,'offline_review',v.reason)::public.posting_context;
      perform public.post_journal_entry_with_context(new.company_id,'OfflineCashReconciliation',r.id::text,
        'Previously counted cash for '||new.code,jsonb_build_array(
          jsonb_build_object('account_code','CASH_SHORT_OVER','debit',v_amount,'order_id',new.id,
            'meta',jsonb_build_object('offlineRequestId',r.id,'closingCountId',v.cash_resolution->>'closing_count_id')),
          jsonb_build_object('account_code','CASH_ON_HAND','credit',v_amount,'order_id',new.id,
            'meta',jsonb_build_object('offlineRequestId',r.id,'closingCountId',v.cash_resolution->>'closing_count_id'))
        ),v_context);
    end if;
  end if;
  update public.offline_sale_requests set status='completed',posted_order_id=new.id,
    blockers='[]',updated_at=clock_timestamp() where id=r.id;
  return new;
end;
$$;
create trigger orders_offline_custody after update of status on public.orders
  for each row execute function public.finalize_offline_sale_custody();
revoke all on function public.finalize_offline_sale_custody() from public,anon,authenticated;

-- An offline order is an immutable execution of its custody payload. Draft
-- editors must use a review revision instead of changing its commercial lines.
create function public.guard_offline_order_line()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_order uuid:=case when tg_op='DELETE' then old.order_id else new.order_id end;
begin
  if exists(select 1 from public.orders where id in (v_order,case when tg_op='UPDATE' then old.order_id else v_order end)
    and offline_request_id is not null) then
    if tg_op in ('INSERT','DELETE') then raise exception 'offline_order_immutable: use a review revision'; end if;
    if (new.order_id,new.variant_id,new.quantity,new.unit_price,new.custom_price,new.pack_id,
      new.units_per_unit,new.unit_name,new.stock_unit_name,new.price_floor,new.price_source,new.price_override_reason)
      is distinct from
      (old.order_id,old.variant_id,old.quantity,old.unit_price,old.custom_price,old.pack_id,
      old.units_per_unit,old.unit_name,old.stock_unit_name,old.price_floor,old.price_source,old.price_override_reason) then
      raise exception 'offline_order_immutable: use a review revision'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger order_lines_offline_immutable before insert or update or delete on public.order_lines
  for each row execute function public.guard_offline_order_line();
revoke all on function public.guard_offline_order_line() from public,anon,authenticated;

create function public.offline_approval_decision()
returns trigger language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
  if old.status<>'pending' or new.status not in ('denied','expired') then return new; end if;
  select * into o from public.orders where id=nullif(new.metadata->>'order_id','')::uuid
    and company_id=new.company_id and offline_request_id is not null;
  if o.id is null or o.posted_at is not null then return new; end if;
  update public.orders set status='voided',voided_at=clock_timestamp(),voided_by=auth.uid(),
    void_reason='Offline approval '||new.status||': '||coalesce(new.decision_reason,''),updated_at=clock_timestamp()
    where id=o.id and status in ('draft','pending_payment');
  update public.offline_sale_requests set status='review',updated_at=clock_timestamp(),
    blockers=jsonb_build_array(jsonb_build_object('code','approval_'||new.status,'message',new.decision_reason))
    where id=o.offline_request_id and active_revision_id is not distinct from o.offline_revision_id
      and status not in ('completed','cancelled');
  return new;
end;
$$;
create trigger approvals_offline_decision after update of status on public.approvals
  for each row execute function public.offline_approval_decision();
revoke all on function public.offline_approval_decision() from public,anon,authenticated;

-- Hard cutover: pre-contract queues are dropped by the client upgrade.
-- Stale tabs must never turn those requests into sales or recovery records.
create or replace function public.post_offline_sale_at_location(
  p_location_id uuid,p_customer_id uuid,p_lines jsonb,p_payments jsonb,p_client_ref text,
  p_occurred_at timestamptz,p_device_key text,p_pending_count integer default 1,p_draft_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  raise exception 'offline_client_update_required: old queued sales are no longer accepted; update the app';
end;
$$;
create or replace function public.post_offline_fulfillment_sale_at_location(
  p_location_id uuid,p_customer jsonb,p_lines jsonb,p_payments jsonb,p_fulfillment jsonb,
  p_client_ref text,p_occurred_at timestamptz,p_device_key text,p_pending_count integer default 1,p_draft_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  raise exception 'offline_client_update_required: old queued sales are no longer accepted; update the app';
end;
$$;


-- Server-held pre-cutover queues are retired, with their audit history retained.
update public.late_sale_reviews set status='rejected',reviewed_at=clock_timestamp(),
  review_reason='Hard cutover: pre-contract queued sale dropped'
where status='pending';
create or replace function public.review_late_sale(p_review_id uuid,p_approve boolean,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  raise exception 'offline_client_update_required: old queued sales are no longer accepted; update the app';
end;
$$;

-- Every sale needs a session; cash counting remains a separate preference.
create or replace function public.require_open_cashier_session_at_location(
  p_company_id uuid,p_location_id uuid
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_session_id uuid;
begin
  if p_location_id is null then raise exception 'business_location_required'; end if;
  select s.id into v_session_id from public.cashier_sessions s
  where s.company_id=p_company_id and s.location_id=p_location_id and s.status='open'
  for share;
  if v_session_id is null then
    raise exception 'cashier_session_required: open a session before recording this transaction';
  end if;
  return v_session_id;
end;
$$;

-- The original and every correction serialize on one logical sale reference.
create or replace function public.prepare_sale_order_core(
  p_customer_id uuid,
  p_lines jsonb,
  p_client_ref text default null,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_client_ref text := nullif(btrim(p_client_ref), '');
  v_order_id uuid;
  v_existing public.orders%rowtype;
  v_fingerprint text;
  v_root public.offline_sale_requests%rowtype;v_revision uuid;v_logical_ref text;
  v_previous_cache_suppression text := current_setting('app.cache_change_suppressed', true);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'location_id', nullif(current_setting('app.business_location_id', true), '')::uuid,
    'customer_id', p_customer_id,
    'lines', coalesce(p_lines, '[]'::jsonb),
    'draft_id', p_draft_id
  )::text, 'sha256'), 'hex');

  if v_client_ref is not null then
    select r.* into v_root from public.offline_sale_requests r
    where r.company_id=v_company_id and (r.client_ref=v_client_ref or exists(
      select 1 from public.offline_sale_revisions rv where rv.request_id=r.id and rv.execution_key=v_client_ref));
    v_logical_ref:=coalesce(v_root.client_ref,v_client_ref);
    perform pg_advisory_xact_lock(hashtextextended('sale:'||v_company_id::text||':'||v_logical_ref,73));
    -- A custody receipt or correction may have committed while this original
    -- attempt waited. Resolve the root again after acquiring the logical lock.
    select r.* into v_root from public.offline_sale_requests r
    where r.company_id=v_company_id and (r.client_ref=v_client_ref or exists(
      select 1 from public.offline_sale_revisions rv where rv.request_id=r.id and rv.execution_key=v_client_ref));
    if v_root.id is not null then
      select * into v_existing from public.orders where company_id=v_company_id
        and (offline_request_id=v_root.id or client_ref=v_root.client_ref)
        and (status='completed' or (status='voided' and posted_at is not null)) limit 1;
      if v_existing.id is not null then return v_existing.id; end if;
      if v_root.status='cancelled' then raise exception 'offline_sale_cancelled'; end if;
      if nullif(current_setting('app.offline_request_id',true),'') is distinct from v_root.id::text then
        raise exception 'offline_review_required: resume the durable review'; end if;
      select id into v_revision from public.offline_sale_revisions
        where request_id=v_root.id and execution_key=v_client_ref;
    end if;
    select * into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = v_client_ref;
    if v_existing.id is not null then
      if v_existing.status='voided' and v_existing.posted_at is null then
        raise exception 'sale_attempt_voided: create a reviewed correction'; end if;
      if v_existing.sale_request_fingerprint is not null
        and v_existing.sale_request_fingerprint <> v_fingerprint then
        raise exception 'idempotency_conflict: client_ref reused with different sale payload';
      end if;
      if v_root.id is not null then
        update public.orders set offline_request_id=v_root.id,offline_revision_id=v_revision,
          captured_at=coalesce(captured_at,v_root.captured_at),
          posting_request_fingerprint=coalesce((select payload_fingerprint from public.offline_sale_revisions where id=v_revision),v_root.request_fingerprint)
          where id=v_existing.id;
      end if;
      return v_existing.id;
    end if;
  end if;

  if p_draft_id is not null then
    -- Checkout creates a replacement order, so save_draft never sees the old ID.
    -- Lock and validate the source before replacing it. Keep this after the
    -- idempotency lookup: a successful retry no longer has a source draft.
    perform 1 from public.orders
    where id = p_draft_id and company_id = v_company_id and status = 'draft'
    for update;
    if not found then raise exception 'draft_not_found: %', p_draft_id; end if;
    if exists (
      select 1 from public.order_lines
      where order_id = p_draft_id and company_id = v_company_id and pack_id is not null
    ) and exists (
      select 1 from jsonb_array_elements(p_lines) line where not line ? 'units_per_unit'
    ) then
      raise exception 'pack_client_update_required: reopen the app before editing this sale';
    end if;
  end if;

  perform set_config('app.cache_change_suppressed', 'on', true);
  v_order_id := public.save_draft(p_customer_id, p_lines);

  begin
    update public.orders
    set client_ref = v_client_ref,
        sale_request_fingerprint = v_fingerprint,
        offline_request_id = v_root.id,
        offline_revision_id = v_revision,
        captured_at = v_root.captured_at,
        posting_request_fingerprint = coalesce((select payload_fingerprint from public.offline_sale_revisions where id=v_revision),v_root.request_fingerprint)
    where id = v_order_id;
  exception when unique_violation then
    delete from public.orders where id = v_order_id;
    select * into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = v_client_ref;
    if v_existing.sale_request_fingerprint is not null
      and v_existing.sale_request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_conflict: client_ref reused with different sale payload';
    end if;
    perform set_config(
      'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
    );
    return v_existing.id;
  end;

  if p_draft_id is not null then
    delete from public.approvals
    where company_id = v_company_id
      and type = 'below_wholesale'
      and metadata ->> 'order_id' = p_draft_id::text;
    delete from public.orders
    where id = p_draft_id
      and company_id = v_company_id
      and status in ('draft', 'expired');
  end if;

  perform set_config(
    'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
  );
  return v_order_id;
end;
$$;

-- One guarded completion path also protects approvals and provider callbacks.
create or replace function public.complete_order_core(
  p_order_id uuid,
  p_payments jsonb,
  p_context public.posting_context
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment_row record;
  v_customer record;
  v_ar_balance bigint;
  v_is_receivable boolean;
  v_is_cod boolean;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_fifo jsonb;
  v_line_cogs bigint;
  v_persisted_line_cogs bigint;
  v_total_cogs bigint := 0;
  v_quantity_total numeric := 0;
  v_all_allocations jsonb := '[]'::jsonb;
  v_pending_approval uuid;
  v_business_timezone text;
  v_entry_date date;
  v_actor uuid := (p_context).actor_id;
  v_posting_context public.posting_context;
  v_posted_at timestamptz;
  v_review public.offline_sale_revisions%rowtype;
  v_final_review jsonb;
begin
  if (p_context).company_id is null or (p_context).source not in (
    'interactive','approval','offline','offline_review','mpesa_provider','mpesa_reconciliation',
    'fulfillment_dispatch'
  ) then raise exception 'invalid_posting_context'; end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'invalid_payments';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = (p_context).company_id
  for update;
  if v_order is null then raise exception 'order_not_found: %', p_order_id; end if;
  -- Session closure locks this same row. Never swap a closed session for a newer one.
  perform 1 from public.cashier_sessions s where s.id=(p_context).cashier_session_id
    and s.company_id=v_order.company_id and s.location_id=v_order.location_id
    and s.status='open' for share;
  if not found then raise exception 'cashier_session_required: the specified session must be open'; end if;
  perform public.validate_offline_order_posting(p_order_id,(p_context).cashier_session_id);
  if v_order.status not in ('draft','pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;
  if exists (
    select 1
    from public.order_lines line
    where line.order_id = p_order_id
    limit 1 offset 128
  ) then
    raise exception 'sale_line_limit_exceeded: maximum 128 distinct lines per order';
  end if;

  select company.business_timezone into v_business_timezone
  from public.companies company where company.id = v_order.company_id;
  if (p_context).location_id is distinct from v_order.location_id then
    raise exception 'posting_context_location_mismatch';
  end if;
  select approval.id into v_pending_approval
  from public.approvals approval
  where approval.company_id = v_order.company_id
    and approval.type = 'below_wholesale'
    and approval.status = 'pending'
    and approval.metadata ->> 'order_id' = p_order_id::text
  limit 1;
  if v_pending_approval is not null then
    raise exception 'below_wholesale_approval_required: approval %', v_pending_approval;
  end if;

  v_is_receivable := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');
  v_is_cod := v_is_receivable and coalesce(v_order.receivable_kind = 'cod',false);
  v_is_credit := v_is_receivable and not coalesce(v_is_cod,false);
  update public.orders
  set receivable_kind = case when v_is_cod then 'cod' when v_is_credit then 'credit' end
  where id = p_order_id;
  if v_is_cod then
    if (p_context).source <> 'fulfillment_dispatch'
      or v_order.customer_id is null
      or not exists (
        select 1 from public.order_fulfillments fulfillment
        where fulfillment.order_id = p_order_id
          and fulfillment.company_id = v_order.company_id
          and fulfillment.collection_kind = 'cod'
          and fulfillment.fulfillment_type = 'delivery'
          and fulfillment.status = 'ready'
      )
    then raise exception 'invalid_cod_dispatch_context'; end if;
  elsif v_is_credit then
    if v_order.customer_id is null then raise exception 'credit_requires_customer'; end if;
    select * into v_customer
    from public.customers customer
    where customer.id = v_order.customer_id and customer.company_id = v_order.company_id;
    if v_customer is null or (
      coalesce(nullif(current_setting('app.sale_residual_credit_amount', true), '')::bigint,
        v_order.total) > 0
      and not v_customer.is_credit_approved
    ) then
      raise exception 'credit_not_approved: customer %', v_order.customer_id;
    end if;

    v_ar_balance := public.customer_credit_exposure(
      v_order.company_id, v_order.customer_id
    );

    if v_ar_balance + coalesce(
      nullif(current_setting('app.sale_residual_credit_amount', true), '')::bigint,
      v_order.total
    ) > v_customer.credit_limit and v_customer.credit_limit > 0 then
      if public.current_user_has_permission('ApproveCustomerCredit')
        or exists (
          select 1
          from public.company_memberships membership
          join public.roles role
            on role.id = membership.role_id and role.company_id = membership.company_id
          where membership.company_id = v_order.company_id
            and membership.user_id = v_actor
            and membership.authorization_status = 'approved'
            and 'ApproveCustomerCredit' = any(role.permissions)
        )
        or coalesce(current_setting('app.approved_credit_order_id', true), '') = p_order_id::text
      then
        insert into public.approvals(
          company_id, type, status, metadata, requested_by, decided_by,
          decided_at, decision_reason
        ) values(
          v_order.company_id, 'overdraft', 'approved', jsonb_build_object(
            'order_id', p_order_id, 'customerId', v_order.customer_id,
            'ar_balance', v_ar_balance, 'order_total', v_order.total,
            'credit_limit', v_customer.credit_limit
          ), auth.uid(), auth.uid(), now(), 'Overdraft authorized at checkout'
        );
      else
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_ar_balance, v_order.total, v_customer.credit_limit;
      end if;
    end if;
  else
    if exists (
      select 1 from jsonb_array_elements(p_payments) payment
      where payment ->> 'method' = 'credit'
    ) then
      raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
    end if;

    with inserted as (
      insert into public.payments(
        company_id, order_id, method_code, amount, reference, mpesa_receipt,
        collection_allocation_id, location_id, cashier_session_id, ledger_account_code
      )
      select
        v_order.company_id, p_order_id, payment.method, payment.amount,
        payment.reference, payment.mpesa_receipt, payment.collection_allocation_id,
        v_order.location_id,
        coalesce((p_context).cashier_session_id, v_order.cashier_session_id),
        public.resolve_tender_account(
          v_order.company_id, v_order.location_id, payment.method, payment.account_code
        )
      from jsonb_to_recordset(p_payments) as payment(
        method text,
        amount bigint,
        reference text,
        mpesa_receipt text,
        collection_allocation_id uuid,
        account_code text
      )
      returning amount
    )
    select coalesce(sum(amount), 0)::bigint into v_paid from inserted;
    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  for v_line in
    select line.*, variant.track_inventory
    from public.order_lines line
    join public.product_variants variant on variant.id = line.variant_id
    where line.order_id = p_order_id
    order by line.variant_id,line.id
  loop
    v_quantity_total := v_quantity_total + v_line.stock_quantity;
    v_line_cogs := 0;
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.variant_id, v_line.stock_quantity,
        'Sale', p_order_id::text
      );
      v_line_cogs := (v_fifo ->> 'total_cogs')::bigint;
      v_total_cogs := v_total_cogs + v_line_cogs;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
    update public.order_lines
    set cogs_total = v_line_cogs
    where id = v_line.id and company_id = v_order.company_id;
  end loop;

  select coalesce(sum(line.cogs_total), 0)::bigint
  into v_persisted_line_cogs
  from public.order_lines line
  where line.order_id = p_order_id and line.company_id = v_order.company_id;
  if v_persisted_line_cogs <> v_total_cogs then
    raise exception 'order_line_cogs_mismatch: lines % <> order %',
      v_persisted_line_cogs, v_total_cogs;
  end if;

  -- Stock and order locks are held. Serialize with VAT edits and choose one posting
  -- instant after any wait; an offline capture or provider receipt cannot backdate VAT.
  perform pg_advisory_xact_lock(hashtextextended(v_order.company_id::text,41));
  v_posted_at := clock_timestamp();
  if v_order.offline_revision_id is not null then
    select * into strict v_review from public.offline_sale_revisions where id=v_order.offline_revision_id;
    v_final_review:=public.offline_sale_assessment(v_review.request_id,v_review.payload,
      (p_context).cashier_session_id,v_posted_at);
    -- Stock was validated and consumed above. Only compare reviewed state here;
    -- a mismatch rolls the whole posting back, including stock and payments.
    if v_review.review_fingerprint is distinct from v_final_review->>'review_fingerprint' then
      raise exception 'offline_review_changed: review the current catalogue and VAT treatment again';
    end if;
  end if;
  v_entry_date := (v_posted_at at time zone v_business_timezone)::date;
  v_posting_context := row(
    (p_context).company_id, (p_context).location_id, (p_context).actor_id,
    (p_context).cashier_session_id, coalesce((p_context).occurred_at, v_posted_at),
    v_entry_date, (p_context).source, (p_context).late_reason
  )::public.posting_context;

  if v_is_receivable then
    perform public.post_journal_entry_with_context(
      v_order.company_id, case when v_is_cod then 'CodReceivable' else 'CreditSale' end,
      p_order_id::text,
      case when v_is_cod then 'COD receivable ' else 'Credit sale ' end || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total,
          'order_id', p_order_id, 'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'method', case when v_is_cod then 'cod' else 'credit' end
          )
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      ), v_posting_context
    );
  else
    for v_payment_row in select payment.* from public.payments payment
      where payment.order_id = p_order_id
    loop
      perform public.post_journal_entry_with_context(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount,
            'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        ), v_posting_context
      );
    end loop;
  end if;

  if v_total_cogs > 0 then
    perform public.post_journal_entry_with_context(
      v_order.company_id, 'InventorySaleCogs', p_order_id::text,
      'COGS for order ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'COGS', 'debit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'cogsAllocations', v_all_allocations
          )
        ),
        jsonb_build_object(
          'account_code', 'INVENTORY', 'credit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      ), v_posting_context
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      receivable_kind = case when v_is_cod then 'cod' when v_is_credit then 'credit' end,
      cashier_pending_at = null,
      completed_at = v_posted_at,
      posted_at = v_posted_at,
      captured_at = coalesce(captured_at, (p_context).occurred_at, created_at),
      accounting_posting_date = v_entry_date,
      posting_source = (p_context).source,
      late_posting_reason = (p_context).late_reason,
      cashier_session_id = coalesce(cashier_session_id, (p_context).cashier_session_id),
      quantity_total = v_quantity_total,
      cogs_total = v_total_cogs,
      updated_at = now()
  where id = p_order_id;
  return p_order_id;
end;
$$;

-- A racing original returns the winner, including a completed correction.
create or replace function public.post_sale(
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_park boolean default false,
  p_client_ref text default null,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_client_ref text := nullif(btrim(p_client_ref), '');
  v_order_id uuid;
  v_existing uuid;
  v_owner text;
begin
  if v_client_ref is not null then
    select id into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = v_client_ref;
    if v_existing is not null then
      v_order_id := public.prepare_sale_order_core(
        p_customer_id, p_lines, v_client_ref, p_draft_id
      );
      return v_order_id;
    end if;
  end if;

  v_order_id := public.prepare_sale_order_core(
    p_customer_id, p_lines, v_client_ref, p_draft_id
  );
  if exists(select 1 from public.orders where id=v_order_id and (status='completed' or (status='voided' and posted_at is not null))) then
    return v_order_id;
  end if;
  if p_park then
    v_owner := case
      when coalesce(current_setting('app.external_payment_hold', true), '') = 'on'
        then 'approval'
      else 'cashier'
    end;
    return public.hold_sale_order_core(v_order_id, v_owner);
  end if;
  return public.complete_order(v_order_id, p_payments, auth.uid());
end;
$$;


-- COD dispatch finalizes a sale and must bind an explicitly open location session.
create or replace function public.dispatch_fulfillment(
  p_fulfillment_id uuid,p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_f public.order_fulfillments%rowtype;v_order public.orders%rowtype;
  v_company public.companies%rowtype;v_context public.posting_context;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id for update;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id() then
    raise exception 'fulfillment_not_found'; end if;
  perform public.assert_fulfillment_execution_ready(v_f.id,'staff',null);
  if v_f.state_version<>p_expected_version then raise exception 'stale_fulfillment_version'; end if;
  if v_f.fulfillment_type<>'delivery' or v_f.status<>'ready' then
    raise exception 'delivery_not_ready_for_dispatch'; end if;
  if v_f.phone_normalized is null or nullif(btrim(coalesce(v_f.address_line,'')),'') is null
    or v_f.pin_hash is null then raise exception 'delivery_details_incomplete'; end if;
  select * into v_order from public.orders where id=v_f.order_id for update;
  if v_f.collection_kind='cod' then
    if v_order.customer_id is null or v_f.customer_id is null
      or v_order.customer_id is distinct from v_f.customer_id then
      raise exception 'cod_customer_required'; end if;
    if v_order.status in('draft','pending_payment') then
      update public.orders set receivable_kind='cod',updated_at=now() where id=v_order.id;
      select * into v_company from public.companies where id=v_order.company_id;
      v_context:=row(v_order.company_id,v_order.location_id,auth.uid(),
        public.require_open_cashier_session_at_location(v_order.company_id,v_order.location_id),clock_timestamp(),
        (now() at time zone v_company.business_timezone)::date,'fulfillment_dispatch',null)
        ::public.posting_context;
      perform public.complete_order_core(v_order.id,'[]'::jsonb,v_context);
    elsif v_order.status<>'completed' or v_order.receivable_kind<>'cod' then
      raise exception 'cod_order_not_dispatchable: %',v_order.status;
    end if;
  elsif v_order.status<>'completed' then
    raise exception 'order_not_completed';
  end if;
  return public.transition_fulfillment_core(v_f.id,'in_transit',p_expected_version,
    '{}'::jsonb,'staff',null);
end;
$$;

-- Session identity is mandatory even when physical cash counting is disabled.
create or replace function public.open_cashier_session_at_location(
  p_location_id uuid,
  p_declarations jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_session_id uuid;
  v_recon_id uuid;
  v_decl jsonb;
  v_declarations jsonb := coalesce(p_declarations, '[]'::jsonb);
  v_declared bigint;
  v_expected bigint;
  v_cash_declared bigint;
  v_cash_expected bigint;
  v_require_opening_count boolean;
begin
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('cashier-session:' || v_company_id::text, 0)
  );
  perform set_config('app.business_location_id', v_location_id::text, true);

  if exists (
    select 1 from public.cashier_sessions
    where company_id = v_company_id and location_id = v_location_id and status = 'open'
  ) then raise exception 'session_already_open'; end if;

  if not (select cash_control_enabled from public.companies where id=v_company_id) then
    insert into public.cashier_sessions(company_id,location_id,cashier_user_id)
      values(v_company_id,v_location_id,auth.uid()) returning id into v_session_id;
    return v_session_id;
  end if;

  select c.require_opening_count into v_require_opening_count
  from public.companies c where c.id = v_company_id;
  if not coalesce(v_require_opening_count, true) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'account_code', x.account_code,
      'declared', public.location_account_balance(v_company_id, v_location_id, x.account_code)
    ) order by x.account_code), '[]'::jsonb)
    into v_declarations
    from (
      select distinct coalesce(lpm.ledger_account_code, pm.ledger_account_code) as account_code
      from public.payment_methods pm
      join public.location_payment_methods lpm
        on lpm.payment_method_id = pm.id and lpm.location_id = v_location_id and lpm.enabled
      where pm.company_id = v_company_id and pm.enabled
        and coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled)
    ) x;
  end if;

  perform public.validate_cashier_declarations(v_company_id, v_location_id, v_declarations);

  insert into public.cashier_sessions(company_id, location_id, cashier_user_id)
  values(v_company_id, v_location_id, auth.uid()) returning id into v_session_id;
  insert into public.reconciliations(company_id, location_id, scope, scope_ref_id, status, created_by)
  values(v_company_id, v_location_id, 'cash-session', v_session_id::text || ':opening',
    'verified', auth.uid()) returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(v_declarations)
  loop
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.location_account_balance(v_company_id, v_location_id, v_decl ->> 'account_code');
    insert into public.reconciliation_accounts(reconciliation_id, account_code, declared, expected, variance)
    values(v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected);
    if v_decl ->> 'account_code' = 'CASH_ON_HAND' then
      v_cash_declared := v_declared;
      v_cash_expected := v_expected;
    end if;
    perform public.post_location_variance_adjustment(
      v_company_id, v_location_id, v_session_id, v_decl ->> 'account_code',
      v_declared, v_recon_id::text, 'Opening count variance'
    );
  end loop;

  if v_cash_declared is not null then
    insert into public.cash_drawer_counts(
      session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by
    ) values(
      v_session_id, v_company_id, 'opening', v_cash_declared, v_cash_expected,
      v_cash_declared - v_cash_expected, auth.uid()
    );
  end if;
  return v_session_id;
end;
$$;
create or replace function public.close_cashier_session(p_session_id uuid,p_declarations jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_session public.cashier_sessions%rowtype;
  v_recon_id uuid;v_decl jsonb;v_declared bigint;v_expected bigint;
  v_cash_declared bigint;v_cash_expected bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  select * into v_session from public.cashier_sessions
  where id=p_session_id and company_id=v_company_id and status='open' for update;
  if v_session.id is null then raise exception 'session_not_open: %',p_session_id; end if;
  if not public.current_user_can_access_location(v_session.location_id) then
    raise exception 'location_access_denied'; end if;
  if not (select cash_control_enabled from public.companies where id=v_company_id) then
    update public.cashier_sessions set status='closed',closed_at=clock_timestamp()
      where id=p_session_id;
    return p_session_id;
  end if;
  perform public.validate_cashier_declarations(v_company_id,v_session.location_id,
    coalesce(p_declarations,'null'::jsonb),p_session_id);
  insert into public.reconciliations(company_id,location_id,scope,scope_ref_id,status,created_by)
  values(v_company_id,v_session.location_id,'cash-session',p_session_id::text||':closing',
    'verified',auth.uid()) returning id into v_recon_id;
  for v_decl in select * from jsonb_array_elements(p_declarations) loop
    v_declared:=(v_decl->>'declared')::bigint;
    v_expected:=public.location_account_balance(
      v_company_id,v_session.location_id,v_decl->>'account_code');
    insert into public.reconciliation_accounts(
      reconciliation_id,account_code,declared,expected,variance
    ) values(v_recon_id,v_decl->>'account_code',v_declared,v_expected,v_declared-v_expected);
    if v_decl->>'account_code'='CASH_ON_HAND' then
      v_cash_declared:=v_declared;v_cash_expected:=v_expected;end if;
    perform public.post_location_variance_adjustment(v_company_id,v_session.location_id,
      p_session_id,v_decl->>'account_code',v_declared,v_recon_id::text,'Closing count variance');
  end loop;
  if v_cash_declared is not null then
    insert into public.cash_drawer_counts(
      session_id,company_id,count_type,declared_cash,expected_cash,variance,created_by
    ) values(p_session_id,v_company_id,'closing',v_cash_declared,v_cash_expected,
      v_cash_declared-v_cash_expected,auth.uid());
  end if;
  update public.cashier_sessions set status='closed',closed_at=now(),
    closing_declared=v_cash_declared where id=p_session_id;
  return p_session_id;
end;
$$;

-- Entitlement-aware communications: typed plan gates, durable campaigns,
-- per-channel quota reservations, due-date reminders, and public statements.

-- ---------------------------------------------------------------------------
-- Plan contract and company preferences
-- ---------------------------------------------------------------------------
alter table public.subscription_tiers
  add column storefront_available boolean not null default false,
  add column customer_campaigns_available boolean not null default false,
  add column payment_reminders_available boolean not null default false,
  add column whatsapp_per_period integer
    check (whatsapp_per_period is null or whatsapp_per_period >= 0);

update public.subscription_tiers
set storefront_available = true,
    customer_campaigns_available = true,
    payment_reminders_available = true,
    whatsapp_per_period = sms_per_period
where code = 'standard';

alter table public.companies
  add column payment_reminders_enabled boolean not null default false,
  add column payment_reminder_channel text not null default 'whatsapp'
    check (payment_reminder_channel in ('sms', 'whatsapp')),
  add column payment_reminder_sms_fallback boolean not null default true,
  add column customer_payment_instructions text,
  add column storefront_entitlement_grace_end timestamptz,
  add column sms_reserved_this_period integer not null default 0
    check (sms_reserved_this_period >= 0),
  add column whatsapp_reserved_this_period integer not null default 0
    check (whatsapp_reserved_this_period >= 0),
  add column whatsapp_used_this_period integer not null default 0
    check (whatsapp_used_this_period >= 0),
  add column communication_period_end timestamptz;

create or replace function public.next_monthly_anniversary(p_anchor timestamptz,p_after timestamptz default now())
returns timestamptz language plpgsql immutable set search_path = '' as $$
declare v_anchor timestamp:=p_anchor at time zone 'Africa/Nairobi';v_after timestamp:=p_after at time zone 'Africa/Nairobi';
  v_month timestamp:=date_trunc('month',v_after);v_candidate timestamp;v_last_day integer;
begin
  v_last_day:=extract(day from (v_month+interval '1 month'-interval '1 day'))::integer;
  v_candidate:=v_month+(least(extract(day from v_anchor)::integer,v_last_day)-1)*interval '1 day'+v_anchor::time;
  if v_candidate<=v_after then
    v_month:=v_month+interval '1 month';
    v_last_day:=extract(day from (v_month+interval '1 month'-interval '1 day'))::integer;
    v_candidate:=v_month+(least(extract(day from v_anchor)::integer,v_last_day)-1)*interval '1 day'+v_anchor::time;
  end if;
  return v_candidate at time zone 'Africa/Nairobi';
end;
$$;

update public.companies
set communication_period_end = public.next_monthly_anniversary(
  coalesce(subscription_started_at,trial_started_at,created_at),now()
);

-- Internal equivalent of assert_entitled() for service-role jobs that do not
-- have an authenticated tenant context. Keep this predicate deliberately
-- small and aligned with the subscription/trial/grace access boundary.
create or replace function public.company_subscription_accessible(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.companies c
    where c.id=p_company_id and c.status='approved' and (
      c.subscription_exempt_until>now()
      or (c.subscription_status='trial' and (c.trial_ends_at is null or c.trial_ends_at>now()))
      or c.subscription_status='active'
      or (c.subscription_status='expired' and c.subscription_grace_period_end>now())
    )
  )
$$;
revoke execute on function public.company_subscription_accessible(uuid) from public,anon,authenticated;
grant execute on function public.company_subscription_accessible(uuid) to service_role;

alter table public.customers
  add column sms_notifications_enabled boolean not null default true,
  add column whatsapp_notifications_enabled boolean not null default true;

update public.customers
set sms_notifications_enabled = notifications_enabled,
    whatsapp_notifications_enabled = notifications_enabled;

alter table public.orders add column credit_due_at date;

update public.orders o
set credit_due_at = coalesce(
  (select je.entry_date from public.ledger_journal_entries je
   where je.company_id=o.company_id and je.source_type='CreditSale'
     and je.source_id=o.id::text order by je.created_at limit 1),
  (o.completed_at at time zone 'Africa/Nairobi')::date,
  (o.created_at at time zone 'Africa/Nairobi')::date
) + coalesce(c.credit_terms_days, 7)
from public.customers c
where c.id = o.customer_id
  and o.is_credit_sale
  and o.credit_due_at is null;

create index orders_credit_due_idx
  on public.orders(company_id, credit_due_at)
  where is_credit_sale and status <> 'voided';

create or replace function public.snapshot_credit_due_date()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_terms integer;
begin
  if new.is_credit_sale and new.status='completed' and new.credit_due_at is null and new.customer_id is not null then
    select coalesce(credit_terms_days, 7) into v_terms
    from public.customers where id = new.customer_id and company_id = new.company_id;
    new.credit_due_at := (coalesce(new.completed_at, now()) at time zone 'Africa/Nairobi')::date
      + coalesce(v_terms, 7);
  end if;
  return new;
end;
$$;

create trigger orders_snapshot_credit_due
before insert or update of is_credit_sale, status, completed_at on public.orders
for each row execute function public.snapshot_credit_due_date();
revoke execute on function public.snapshot_credit_due_date() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Communications permission
-- ---------------------------------------------------------------------------
alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
  'ManageApprovals','OverridePrice','ManageStockAdjustments','ApproveCustomerCredit',
  'ManageCustomerCreditLimit','ManageCustomers','ManageCatalog','ManageCommunications',
  'ReverseOrder','OverrideCustomerBalance','SettleOrder','ManageSupplierCreditPurchases',
  'ViewFinancials','ManageReconciliation','CloseAccountingPeriod',
  'CreateInterAccountTransfer','ManageTeam','ViewAuditTrail','ViewStaffPerformance',
  'ManageCommissions'
]::text[]);

update public.roles
set permissions = array_append(permissions, 'ManageCommunications'), updated_at = now()
where lower(name) in ('admin', 'manager')
  and not ('ManageCommunications' = any(permissions));

-- Ensure provisioned Admin roles receive the new permission without copying the
-- complete evolving function body into this migration.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.provision_company_base(text,text,text,text,text)'::regprocedure)
    into v_definition;
  if position('''ManageCommunications''' in v_definition) = 0 then
    v_definition := replace(v_definition, '''ManageCatalog''',
      '''ManageCatalog'', ''ManageCommunications''');
    execute v_definition;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Durable templates and campaigns
-- ---------------------------------------------------------------------------
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  template_key text not null,
  name text not null,
  context text not null check (context in ('platform', 'customer', 'reminder')),
  sms_body text,
  whatsapp_body text,
  in_app_title text,
  in_app_body text,
  version integer not null default 1 check (version > 0),
  is_system boolean not null default false,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index message_templates_company_key_uidx
  on public.message_templates(coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), template_key);

create table public.message_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  scope text not null check (scope in ('platform', 'company')),
  name text not null,
  audience text not null,
  audience_config jsonb not null default '{}',
  channel text not null check (channel in ('sms', 'whatsapp', 'in_app')),
  body text not null,
  title text,
  template_id uuid references public.message_templates(id) on delete set null,
  template_version integer,
  status text not null default 'draft'
    check (status in ('draft','queued','sending','paused','completed','partial','failed','cancelled')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.message_campaigns(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  user_id uuid,
  recipient text,
  rendered_body text,
  status text not null default 'eligible'
    check (status in ('eligible','queued','sent','failed','skipped','cancelled')),
  skip_reason text,
  outbox_id uuid,
  created_at timestamptz not null default now(),
  unique(campaign_id, customer_id, user_id)
);

alter table public.message_templates enable row level security;
alter table public.message_campaigns enable row level security;
alter table public.campaign_recipients enable row level security;

create policy "company templates readable" on public.message_templates for select
  using (company_id is null or company_id = (select public.current_company_id()) or (select public.is_platform_admin()));
create policy "company campaigns readable" on public.message_campaigns for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));
create policy "company campaign recipients readable" on public.campaign_recipients for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.message_templates, public.message_campaigns, public.campaign_recipients to authenticated;
grant all on public.message_templates, public.message_campaigns, public.campaign_recipients to service_role;

insert into public.message_templates
  (template_key, name, context, sms_body, whatsapp_body, is_system)
values
  ('customer-broadcast', 'Customer broadcast', 'customer',
   'Hi {{customer_first_name}}, here is an update from {{store_name}}. Contact: {{store_contact}}',
   'Hi {{customer_first_name}},\n\nHere is an update from {{store_name}}.\n\nContact: {{store_contact}}', true),
  ('payment-due', 'Payment due today', 'reminder',
   'Hi {{customer_first_name}}, KES {{outstanding_balance}} is due today. Statement: {{statement_url}}',
   'Hi {{customer_first_name}}, your balance of KES {{outstanding_balance}} is due today.\n\nView statement: {{statement_url}}\n\n— {{store_name}}', true),
  ('payment-overdue-3', 'Payment 3 days overdue', 'reminder',
   'Hi {{customer_first_name}}, KES {{outstanding_balance}} is 3 days overdue. {{statement_url}}',
   'Hi {{customer_first_name}}, your balance of KES {{outstanding_balance}} is 3 days overdue.\n\nView statement: {{statement_url}}\n\n— {{store_name}}', true),
  ('payment-overdue-7', 'Payment 7 days overdue', 'reminder',
   'Payment reminder: KES {{outstanding_balance}} is 7 days overdue. {{statement_url}}',
   'Payment reminder\n\nHi {{customer_first_name}}, KES {{outstanding_balance}} is 7 days overdue. Please contact {{store_name}} or view: {{statement_url}}', true),
  ('payment-overdue-14', 'Payment 14 days overdue', 'reminder',
   'Urgent: KES {{outstanding_balance}} is 14 days overdue. {{statement_url}}',
   'Urgent payment reminder\n\nHi {{customer_first_name}}, KES {{outstanding_balance}} is 14 days overdue. View statement: {{statement_url}}', true);

insert into public.message_templates(
  template_key,name,context,sms_body,whatsapp_body,in_app_title,in_app_body,is_system
) values(
  'platform-update','Merchant platform update','platform',
  'Hi {{merchant_name}}, this is an update about your {{tier}} Dukarun account.',
  'Hi {{merchant_name}},\n\nThis is an update about your {{tier}} Dukarun account.\n\n— Dukarun',
  'Update for {{merchant_name}}','Your Dukarun subscription is currently {{subscription_state}}.',true
);

create table public.payment_reminder_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stage_days integer not null check (stage_days in (0,3,7,14)),
  enabled boolean not null default true,
  template_key text not null,
  unique(company_id, stage_days)
);
alter table public.payment_reminder_rules enable row level security;
create policy "reminder rules readable" on public.payment_reminder_rules for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.payment_reminder_rules to authenticated;
grant all on public.payment_reminder_rules to service_role;

insert into public.payment_reminder_rules(company_id, stage_days, template_key)
select c.id, s.days, s.key from public.companies c cross join (values
  (0, 'payment-due'), (3, 'payment-overdue-3'),
  (7, 'payment-overdue-7'), (14, 'payment-overdue-14')
) s(days, key) on conflict do nothing;

create or replace function public.seed_company_payment_reminder_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.payment_reminder_rules(company_id, stage_days, template_key)
  values
    (new.id, 0, 'payment-due'),
    (new.id, 3, 'payment-overdue-3'),
    (new.id, 7, 'payment-overdue-7'),
    (new.id, 14, 'payment-overdue-14')
  on conflict do nothing;
  return new;
end;
$$;
create trigger companies_seed_payment_reminder_rules
after insert on public.companies
for each row execute function public.seed_company_payment_reminder_rules();
revoke execute on function public.seed_company_payment_reminder_rules() from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Strict rendering and SMS billing units
-- ---------------------------------------------------------------------------
create or replace function public.render_message_template(p_body text, p_values jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare v_result text := coalesce(p_body, ''); v_match text[]; v_key text;
begin
  for v_match in select regexp_matches(v_result, '\{\{([a-z][a-z0-9_]*)\}\}', 'g') loop
    v_key := v_match[1];
    if not (p_values ? v_key) or p_values ->> v_key is null then
      raise exception 'missing_template_variable: %', v_key;
    end if;
    v_result := replace(v_result, '{{' || v_key || '}}', p_values ->> v_key);
  end loop;
  if v_result ~ '\{\{[^}]+\}\}' then raise exception 'invalid_template_variable'; end if;
  return v_result;
end;
$$;

create or replace function public.sms_segment_count(p_body text)
returns integer language plpgsql immutable set search_path = '' as $$
declare v_len integer; v_gsm boolean;
begin
  v_gsm := coalesce(p_body, '') !~ '[^@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&''()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà\^{}\\\[~\]|€]';
  v_len := char_length(coalesce(p_body, ''));
  if v_len = 0 then return 0; end if;
  if v_gsm then return case when v_len <= 160 then 1 else ceil(v_len / 153.0)::int end; end if;
  return case when v_len <= 70 then 1 else ceil(v_len / 67.0)::int end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quota-aware outbox
-- ---------------------------------------------------------------------------
alter table public.outbox
  add column campaign_id uuid references public.message_campaigns(id) on delete set null,
  add column campaign_recipient_id uuid references public.campaign_recipients(id) on delete set null,
  add column customer_id uuid references public.customers(id) on delete set null,
  add column source text not null default 'direct'
    check (source in ('direct','campaign','reminder','platform')),
  add column template_key text,
  add column template_version integer,
  add column quota_units integer not null default 0 check (quota_units >= 0),
  add column quota_state text not null default 'released'
    check (quota_state in ('reserved','used','released')),
  add column fallback_channel text check (fallback_channel in ('sms','whatsapp')),
  add column fallback_body text,
  add column fallback_for_outbox_id uuid references public.outbox(id) on delete set null,
  add column max_attempts integer not null default 5 check (max_attempts between 1 and 10);

create unique index outbox_fallback_for_uidx on public.outbox(fallback_for_outbox_id)
where fallback_for_outbox_id is not null;

alter table public.outbox drop constraint outbox_status_check;
alter table public.outbox add constraint outbox_status_check
  check (status in ('pending','sent','failed','cancelled'));

alter table public.campaign_recipients
  add constraint campaign_recipients_outbox_fkey foreign key(outbox_id) references public.outbox(id) on delete set null;

create table public.delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.outbox(id) on delete cascade,
  provider text not null,
  attempt_number integer not null,
  accepted boolean not null,
  response_status integer,
  error text,
  created_at timestamptz not null default now(),
  unique(outbox_id, attempt_number)
);
alter table public.delivery_attempts enable row level security;
create policy "delivery attempts readable" on public.delivery_attempts for select
  using (exists(select 1 from public.outbox o where o.id = outbox_id
    and (o.company_id = (select public.current_company_id()) or (select public.is_platform_admin()))));
grant select on public.delivery_attempts to authenticated;
grant all on public.delivery_attempts to service_role;

create or replace function public.reset_communication_period_locked(p_company_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_end timestamptz;v_anchor timestamptz;v_next timestamptz;
begin
  select communication_period_end,coalesce(subscription_started_at,trial_started_at,created_at)
  into v_end,v_anchor from public.companies
  where id = p_company_id for update;
  if not found then raise exception 'company_not_found: %', p_company_id; end if;
  if v_end is null or v_end <= now() then
    v_next:=public.next_monthly_anniversary(v_anchor,now());
    update public.companies set
      sms_used_this_period = 0, sms_reserved_this_period = 0,
      whatsapp_used_this_period = 0, whatsapp_reserved_this_period = 0,
      communication_period_end = v_next,
      sms_period_end = v_next
    where id = p_company_id;
  end if;
end;
$$;
revoke execute on function public.reset_communication_period_locked(uuid) from public, anon, authenticated;

create or replace function public.reserve_message_quota(
  p_company_id uuid, p_channel text, p_units integer
) returns void language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_used integer; v_reserved integer;
begin
  if p_units <= 0 then return; end if;
  perform public.reset_communication_period_locked(p_company_id);
  select case when p_channel='sms' then t.sms_per_period else t.whatsapp_per_period end,
         case when p_channel='sms' then c.sms_used_this_period else c.whatsapp_used_this_period end,
         case when p_channel='sms' then c.sms_reserved_this_period else c.whatsapp_reserved_this_period end
  into v_limit, v_used, v_reserved
  from public.companies c left join public.subscription_tiers t on t.id=c.subscription_tier_id
  where c.id=p_company_id;
  if p_channel not in ('sms','whatsapp') then return; end if;
  if v_limit is not null and coalesce(v_used,0)+coalesce(v_reserved,0)+p_units > v_limit then
    raise exception '%_limit_reached: % of % remaining', p_channel,
      greatest(v_limit-coalesce(v_used,0)-coalesce(v_reserved,0),0), v_limit;
  end if;
  if p_channel='sms' then update public.companies
    set sms_reserved_this_period=sms_reserved_this_period+p_units where id=p_company_id;
  else update public.companies
    set whatsapp_reserved_this_period=whatsapp_reserved_this_period+p_units where id=p_company_id;
  end if;
end;
$$;
revoke execute on function public.reserve_message_quota(uuid,text,integer) from public,anon,authenticated;

create or replace function public.finalize_message_quota(p_outbox_id uuid, p_accepted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row public.outbox%rowtype;
begin
  select * into v_row from public.outbox where id=p_outbox_id for update;
  if v_row.quota_state <> 'reserved' or v_row.quota_units=0 then return; end if;
  if v_row.channel='sms' then update public.companies set
    sms_reserved_this_period=greatest(0,sms_reserved_this_period-v_row.quota_units),
    sms_used_this_period=sms_used_this_period+case when p_accepted then v_row.quota_units else 0 end
    where id=v_row.company_id;
  elsif v_row.channel='whatsapp' then update public.companies set
    whatsapp_reserved_this_period=greatest(0,whatsapp_reserved_this_period-v_row.quota_units),
    whatsapp_used_this_period=whatsapp_used_this_period+case when p_accepted then v_row.quota_units else 0 end
    where id=v_row.company_id;
  end if;
  update public.outbox set quota_state=case when p_accepted then 'used' else 'released' end
  where id=p_outbox_id;
end;
$$;
revoke execute on function public.finalize_message_quota(uuid,boolean) from public,anon,authenticated;
grant execute on function public.finalize_message_quota(uuid,boolean) to service_role;

create or replace function public.queue_message(
  p_company_id uuid, p_channel text, p_recipient text, p_body text, p_subject text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_units integer; v_scheduled timestamptz:=now(); v_hour integer;
begin
  if p_channel not in ('sms','whatsapp','email') then raise exception 'invalid_channel'; end if;
  v_units := case when p_channel='sms' then public.sms_segment_count(p_body)
                  when p_channel='whatsapp' then 1 else 0 end;
  if p_channel in ('sms','whatsapp') then perform public.reserve_message_quota(p_company_id,p_channel,v_units); end if;
  if p_channel='whatsapp' then
    v_hour:=extract(hour from v_scheduled at time zone 'Africa/Nairobi')::int;
    if v_hour>=19 or v_hour<8 then v_scheduled:=((v_scheduled at time zone 'Africa/Nairobi')::date
      +case when v_hour>=19 then interval '1 day' else interval '0' end+interval '8 hours') at time zone 'Africa/Nairobi'; end if;
  end if;
  insert into public.outbox(company_id,channel,recipient,subject,body,scheduled_after,quota_units,quota_state)
  values(p_company_id,p_channel,p_recipient,p_subject,p_body,v_scheduled,v_units,
    case when v_units>0 then 'reserved' else 'released' end) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.queue_message(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.queue_message(uuid,text,text,text,text) to service_role;

create or replace function public.queue_sms_fallback(p_outbox_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_source public.outbox%rowtype;v_id uuid;
begin
  select * into v_source from public.outbox where id=p_outbox_id for update;
  if not found then raise exception 'outbox_not_found'; end if;
  if v_source.fallback_channel<>'sms' or nullif(v_source.fallback_body,'') is null then
    return null;
  end if;
  select id into v_id from public.outbox where fallback_for_outbox_id=p_outbox_id;
  if v_id is not null then return v_id; end if;
  if v_source.customer_id is not null and not exists(
    select 1 from public.customers c where c.id=v_source.customer_id
      and c.company_id=v_source.company_id and c.notifications_enabled
      and c.sms_notifications_enabled and c.phone is not null
  ) then
    return null;
  end if;
  v_id:=public.queue_message(v_source.company_id,'sms',v_source.recipient,v_source.fallback_body);
  update public.outbox set source=v_source.source,customer_id=v_source.customer_id,
    template_key=v_source.template_key,template_version=v_source.template_version,
    max_attempts=5,fallback_for_outbox_id=p_outbox_id
  where id=v_id;
  return v_id;
end;
$$;
revoke execute on function public.queue_sms_fallback(uuid) from public,anon,authenticated;
grant execute on function public.queue_sms_fallback(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Tenant campaign API
-- ---------------------------------------------------------------------------
create or replace function public.campaign_preview(
  p_channel text, p_body text, p_audience text default 'all', p_customer_ids uuid[] default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id(); v_total int; v_eligible int:=0; v_units int:=0;
  v_limit int; v_used int; v_reserved int; v_customer record;v_rendered text;
  v_store_name text;v_store_contact text;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommunications') then raise exception 'permission_denied: ManageCommunications required'; end if;
  if p_channel not in ('sms','whatsapp') then raise exception 'invalid_channel'; end if;
  perform public.assert_entitled(v_company,null);
  if not exists(select 1 from public.companies c join public.subscription_tiers t on t.id=c.subscription_tier_id
    where c.id=v_company and t.customer_campaigns_available) then raise exception 'feature_unavailable: customer campaigns'; end if;
  select name,coalesce(public_whatsapp_number,'') into v_store_name,v_store_contact
  from public.companies where id=v_company;
  select count(*) into v_total from public.customers c where c.company_id=v_company and not c.is_supplier
    and (p_customer_ids is null or c.id=any(p_customer_ids))
    and (p_audience='all' or (p_audience='credit_approved' and c.is_credit_approved)
      or (p_audience='overdue' and exists(select 1 from public.orders o where o.customer_id=c.id
        and o.company_id=v_company and o.is_credit_sale and o.status='completed'
        and o.credit_due_at<(now() at time zone 'Africa/Nairobi')::date
        and o.total>coalesce((select sum(p.amount) from public.payments p where p.order_id=o.id and p.status='settled'),0)))
      or (p_audience='selected' and p_customer_ids is not null));
  for v_customer in select c.* from public.customers c where c.company_id=v_company and not c.is_supplier
    and c.phone is not null and c.notifications_enabled
    and case when p_channel='sms' then c.sms_notifications_enabled else c.whatsapp_notifications_enabled end
    and (p_customer_ids is null or c.id=any(p_customer_ids))
    and (p_audience='all' or (p_audience='credit_approved' and c.is_credit_approved)
      or (p_audience='overdue' and exists(select 1 from public.orders o where o.customer_id=c.id
        and o.company_id=v_company and o.is_credit_sale and o.status='completed'
        and o.credit_due_at<(now() at time zone 'Africa/Nairobi')::date
        and o.total>coalesce((select sum(p.amount) from public.payments p where p.order_id=o.id and p.status='settled'),0)))
      or (p_audience='selected' and p_customer_ids is not null))
  loop
    v_rendered:=public.render_message_template(p_body,jsonb_build_object(
      'customer_first_name',v_customer.first_name,'store_name',v_store_name,'store_contact',v_store_contact));
    v_eligible:=v_eligible+1;
    v_units:=v_units+case when p_channel='sms' then public.sms_segment_count(v_rendered) else 1 end;
  end loop;
  select case when p_channel='sms' then t.sms_per_period else t.whatsapp_per_period end,
    case when p_channel='sms' then c.sms_used_this_period else c.whatsapp_used_this_period end,
    case when p_channel='sms' then c.sms_reserved_this_period else c.whatsapp_reserved_this_period end
  into v_limit,v_used,v_reserved from public.companies c join public.subscription_tiers t on t.id=c.subscription_tier_id where c.id=v_company;
  return jsonb_build_object('total',v_total,'eligible',v_eligible,'skipped',v_total-v_eligible,
    'units',v_units,'limit',v_limit,'used',v_used,'reserved',v_reserved,
    'remaining',case when v_limit is null then null else greatest(v_limit-v_used-v_reserved,0) end);
end;
$$;
revoke execute on function public.campaign_preview(text,text,text,uuid[]) from public,anon;
grant execute on function public.campaign_preview(text,text,text,uuid[]) to authenticated;

create or replace function public.create_message_campaign(
  p_name text, p_channel text, p_body text, p_audience text default 'all', p_customer_ids uuid[] default null,
  p_template_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id(); v_id uuid; v_template_version integer;
begin
  perform public.campaign_preview(p_channel,p_body,p_audience,p_customer_ids);
  if p_template_id is not null then
    select version into v_template_version from public.message_templates
    where id=p_template_id and active and (company_id=v_company or company_id is null);
    if not found then raise exception 'template_not_found'; end if;
  end if;
  insert into public.message_campaigns(company_id,scope,name,audience,audience_config,channel,body,template_id,template_version,created_by)
  values(v_company,'company',trim(p_name),p_audience,jsonb_build_object('customer_ids',p_customer_ids),p_channel,trim(p_body),p_template_id,v_template_version,auth.uid())
  returning id into v_id; return v_id;
end;
$$;
revoke execute on function public.create_message_campaign(text,text,text,text,uuid[],uuid) from public,anon;
grant execute on function public.create_message_campaign(text,text,text,text,uuid[],uuid) to authenticated;

create or replace function public.send_message_campaign(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id(); v_campaign public.message_campaigns%rowtype;
  v_customer record; v_recipient_id uuid; v_outbox uuid; v_count int:=0; v_ids uuid[];
  v_is_eligible boolean; v_rendered text; v_store_name text;v_store_contact text;
begin
  if not public.current_user_has_permission('ManageCommunications') then raise exception 'permission_denied: ManageCommunications required'; end if;
  select * into v_campaign from public.message_campaigns where id=p_campaign_id and company_id=v_company for update;
  if not found or v_campaign.status<>'draft' then raise exception 'campaign_not_sendable'; end if;
  if jsonb_typeof(v_campaign.audience_config->'customer_ids') = 'array' then
    select array(select jsonb_array_elements_text(v_campaign.audience_config->'customer_ids')::uuid) into v_ids;
  end if;
  perform public.campaign_preview(v_campaign.channel,v_campaign.body,v_campaign.audience,v_ids);
  select name,coalesce(public_whatsapp_number,'') into v_store_name,v_store_contact
  from public.companies where id=v_company;
  for v_customer in select c.* from public.customers c where c.company_id=v_company and not c.is_supplier
    and (v_ids is null or c.id=any(v_ids))
    and (v_campaign.audience='all' or (v_campaign.audience='credit_approved' and c.is_credit_approved)
      or (v_campaign.audience='overdue' and exists(select 1 from public.orders o where o.customer_id=c.id
        and o.company_id=v_company and o.is_credit_sale and o.status='completed'
        and o.credit_due_at<(now() at time zone 'Africa/Nairobi')::date
        and o.total>coalesce((select sum(p.amount) from public.payments p where p.order_id=o.id and p.status='settled'),0)))
      or (v_campaign.audience='selected' and v_ids is not null)) loop
    v_is_eligible := v_customer.phone is not null and v_customer.notifications_enabled and
      (case when v_campaign.channel='sms' then v_customer.sms_notifications_enabled
            else v_customer.whatsapp_notifications_enabled end);
    v_rendered:=public.render_message_template(v_campaign.body,jsonb_build_object(
      'customer_first_name',v_customer.first_name,'store_name',v_store_name,'store_contact',v_store_contact));
    insert into public.campaign_recipients(campaign_id,company_id,customer_id,recipient,rendered_body,status,skip_reason)
    values(v_campaign.id,v_company,v_customer.id,v_customer.phone,v_rendered,
      case when v_is_eligible then 'eligible' else 'skipped' end,
      case when v_customer.phone is null then 'missing_phone' when not v_customer.notifications_enabled then 'opted_out'
        when v_campaign.channel='sms' and not v_customer.sms_notifications_enabled then 'sms_opted_out'
        when v_campaign.channel='whatsapp' and not v_customer.whatsapp_notifications_enabled then 'whatsapp_opted_out' end)
    returning id into v_recipient_id;
    if v_is_eligible then
      v_outbox:=public.queue_message(v_company,v_campaign.channel,v_customer.phone,v_rendered);
      update public.outbox set campaign_id=v_campaign.id,campaign_recipient_id=v_recipient_id,customer_id=v_customer.id,source='campaign',
        template_key=(select template_key from public.message_templates where id=v_campaign.template_id),
        template_version=v_campaign.template_version where id=v_outbox;
      update public.campaign_recipients set outbox_id=v_outbox,status='queued' where id=v_recipient_id; v_count:=v_count+1;
    end if;
  end loop;
  update public.message_campaigns set status='queued',recipient_count=(select count(*) from public.campaign_recipients where campaign_id=p_campaign_id),
    skipped_count=(select count(*) from public.campaign_recipients where campaign_id=p_campaign_id and status='skipped'),sent_at=now() where id=p_campaign_id;
  return jsonb_build_object('campaign_id',p_campaign_id,'queued',v_count);
end;
$$;
revoke execute on function public.send_message_campaign(uuid) from public,anon;
grant execute on function public.send_message_campaign(uuid) to authenticated;

create or replace function public.set_campaign_status(p_campaign_id uuid,p_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id(); v_status text;v_current text;v_outbox record;
begin
  if not public.current_user_has_permission('ManageCommunications') and not public.is_platform_admin() then raise exception 'permission_denied'; end if;
  v_status:=case p_action when 'pause' then 'paused' when 'resume' then 'queued' when 'cancel' then 'cancelled' else null end;
  if v_status is null then raise exception 'invalid_action'; end if;
  select status into v_current from public.message_campaigns
  where id=p_campaign_id and (company_id=v_company or public.is_platform_admin()) for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if (p_action='pause' and v_current not in ('queued','sending'))
    or (p_action='resume' and v_current<>'paused')
    or (p_action='cancel' and v_current not in ('draft','queued','sending','paused','partial')) then
    raise exception 'invalid_campaign_transition: % -> %',v_current,v_status;
  end if;
  update public.message_campaigns set status=v_status where id=p_campaign_id;
  if p_action='cancel' then
    for v_outbox in select id,attempts,campaign_recipient_id from public.outbox
      where campaign_id=p_campaign_id and status='pending' for update
    loop
      perform public.finalize_message_quota(v_outbox.id,v_outbox.attempts>0);
      update public.outbox set status='cancelled',
        error=case when v_outbox.attempts>0 then 'cancelled_after_attempt_delivery_uncertain' else 'cancelled_before_attempt' end
      where id=v_outbox.id and status='pending';
      update public.campaign_recipients set status='cancelled'
      where id=v_outbox.campaign_recipient_id and status='queued';
    end loop;
    update public.campaign_recipients set status='cancelled'
    where campaign_id=p_campaign_id and status in ('eligible','queued');
  end if;
  return v_status;
end;
$$;
revoke execute on function public.set_campaign_status(uuid,text) from public,anon;
grant execute on function public.set_campaign_status(uuid,text) to authenticated;

create or replace function public.retry_failed_campaign_recipients(p_campaign_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id();v_row record;v_outbox uuid;v_count integer:=0;
begin
  if not public.current_user_has_permission('ManageCommunications') then raise exception 'permission_denied: ManageCommunications required'; end if;
  if not exists(select 1 from public.message_campaigns where id=p_campaign_id and company_id=v_company) then
    raise exception 'campaign_not_found';
  end if;
  for v_row in select cr.*,mc.channel,mc.template_id,mc.template_version
    from public.campaign_recipients cr join public.message_campaigns mc on mc.id=cr.campaign_id
    where cr.campaign_id=p_campaign_id and cr.company_id=v_company and cr.status='failed'
  loop
    v_outbox:=public.queue_message(v_company,v_row.channel,v_row.recipient,v_row.rendered_body);
    update public.outbox set campaign_id=p_campaign_id,campaign_recipient_id=v_row.id,
      customer_id=v_row.customer_id,source='campaign',
      template_key=(select template_key from public.message_templates where id=v_row.template_id),
      template_version=v_row.template_version where id=v_outbox;
    update public.campaign_recipients set status='queued',outbox_id=v_outbox where id=v_row.id;
    v_count:=v_count+1;
  end loop;
  if v_count>0 then update public.message_campaigns set status='queued',failed_count=greatest(failed_count-v_count,0)
    where id=p_campaign_id; end if;
  return v_count;
end;
$$;
revoke execute on function public.retry_failed_campaign_recipients(uuid) from public,anon;
grant execute on function public.retry_failed_campaign_recipients(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Secure public customer statements
-- ---------------------------------------------------------------------------
create table public.customer_statement_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.customer_statement_links enable row level security;
grant all on public.customer_statement_links to service_role;

create or replace function public.issue_customer_statement_link(p_company_id uuid,p_customer_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text; v_hash text;
begin
  if not exists(select 1 from public.customers where id=p_customer_id and company_id=p_company_id and notifications_enabled) then raise exception 'customer_unavailable'; end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex'); v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  update public.customer_statement_links set revoked_at=now() where customer_id=p_customer_id and revoked_at is null;
  insert into public.customer_statement_links(company_id,customer_id,token_hash,expires_at)
  values(p_company_id,p_customer_id,v_hash,now()+interval '14 days');
  return v_token;
end;
$$;
revoke execute on function public.issue_customer_statement_link(uuid,uuid) from public,anon,authenticated;

create or replace function public.public_customer_statement(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_link record; v_result jsonb;
begin
  select l.*,c.first_name,co.name store_name,co.logo_path,co.public_whatsapp_number,co.customer_payment_instructions
  into v_link from public.customer_statement_links l join public.customers c on c.id=l.customer_id
  join public.companies co on co.id=l.company_id
  where l.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and l.revoked_at is null and l.expires_at>now();
  if not found then return null; end if;
  with balances as (
    select o.code,(o.completed_at at time zone 'Africa/Nairobi')::date sale_date,o.credit_due_at,
      greatest(o.total-coalesce((select sum(p.amount) from public.payments p where p.order_id=o.id and p.status='settled'),0),0)::bigint balance
    from public.orders o where o.company_id=v_link.company_id and o.customer_id=v_link.customer_id
      and o.is_credit_sale and o.status='completed'
  ) select jsonb_build_object('store_name',v_link.store_name,'logo_path',v_link.logo_path,
    'whatsapp_number',v_link.public_whatsapp_number,'payment_instructions',v_link.customer_payment_instructions,
    'customer_first_name',v_link.first_name,'expires_at',v_link.expires_at,
    'outstanding_total',coalesce(sum(balance),0),
    'orders',coalesce(jsonb_agg(jsonb_build_object('code',code,'sale_date',sale_date,'due_date',credit_due_at,'balance',balance) order by credit_due_at) filter(where balance>0),'[]'::jsonb))
  into v_result from balances where balance>0;
  return v_result;
end;
$$;
revoke execute on function public.public_customer_statement(text) from public;
grant execute on function public.public_customer_statement(text) to anon,authenticated;

-- ---------------------------------------------------------------------------
-- Entitlement-aware storefront and downgrade grace
-- ---------------------------------------------------------------------------
create or replace function public.storefront_catalogue_visible(c public.companies)
returns boolean language sql stable set search_path = '' as $$
  select c.status='approved' and c.public_storefront_enabled
    and (coalesce((select t.storefront_available from public.subscription_tiers t where t.id=c.subscription_tier_id),false)
      or coalesce(c.storefront_entitlement_grace_end>now(),false))
    and coalesce((c.subscription_status in ('trial','active')
      or (c.subscription_status='expired' and c.subscription_grace_period_end>now())
      or c.subscription_exempt_until>now()),false)
$$;

create or replace view public.public_storefronts as
select c.id,c.name,c.public_slug slug,c.logo_path,c.public_whatsapp_number,
  public.storefront_catalogue_visible(c) catalogue_visible
from public.companies c where c.status='approved' and c.public_storefront_enabled;
grant select on public.public_storefronts to anon,authenticated;

create or replace function public.apply_storefront_tier_grace()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_old boolean; v_new boolean;
begin
  select coalesce(storefront_available,false) into v_old from public.subscription_tiers where id=old.subscription_tier_id;
  select coalesce(storefront_available,false) into v_new from public.subscription_tiers where id=new.subscription_tier_id;
  if coalesce(v_old,false) and not coalesce(v_new,false) and new.public_storefront_enabled then
    new.storefront_entitlement_grace_end:=now()+interval '7 days';
  elsif coalesce(v_new,false) then new.storefront_entitlement_grace_end:=null; end if;
  return new;
end;
$$;
create trigger companies_storefront_tier_grace before update of subscription_tier_id on public.companies
for each row execute function public.apply_storefront_tier_grace();
revoke execute on function public.apply_storefront_tier_grace() from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Entitlement response and settings mutation
-- ---------------------------------------------------------------------------
create or replace function public.current_entitlements()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id(); v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object('companyId',c.id,'status',c.subscription_status,'tierCode',t.code,'tierName',t.name,
    'features',jsonb_build_object('multipleLocations',coalesce(t.multiple_locations_enabled,false),
      'staffPerformance',coalesce(t.staff_performance_enabled,false),'commissions',coalesce(t.commissions_available,false),
      'storefront',coalesce(t.storefront_available,false),'customerCampaigns',coalesce(t.customer_campaigns_available,false),
      'paymentReminders',coalesce(t.payment_reminders_available,false)),
    'settings',jsonb_build_object('commissionsEnabled',c.commissions_enabled,'paymentRemindersEnabled',c.payment_reminders_enabled,
      'paymentReminderChannel',c.payment_reminder_channel,'paymentReminderSmsFallback',c.payment_reminder_sms_fallback),
    'limits',jsonb_strip_nulls(jsonb_build_object('maxTeamMembers',t.max_team_members,'maxProducts',t.max_products,
      'maxStockLocations',t.max_stock_locations,'maxOrdersPerMonth',t.max_orders_per_month,
      'smsPerPeriod',t.sms_per_period,'whatsappPerPeriod',t.whatsapp_per_period)),
    'usage',jsonb_build_object('stockLocations',(select count(*) from public.stock_locations l where l.company_id=c.id and l.is_active),
      'products',(select count(*) from public.product_variants v where v.company_id=c.id and v.active),
      'ordersThisMonth',(select count(*) from public.orders o where o.company_id=c.id and o.created_at>=date_trunc('month',now()) and o.status<>'voided'),
      'teamMembers',(select count(*) from public.company_memberships m where m.company_id=c.id and m.authorization_status='approved'),
      'sms',jsonb_build_object('used',c.sms_used_this_period,'reserved',c.sms_reserved_this_period,
        'remaining',case when t.sms_per_period is null then null else greatest(t.sms_per_period-c.sms_used_this_period-c.sms_reserved_this_period,0) end),
      'whatsapp',jsonb_build_object('used',c.whatsapp_used_this_period,'reserved',c.whatsapp_reserved_this_period,
        'remaining',case when t.whatsapp_per_period is null then null else greatest(t.whatsapp_per_period-c.whatsapp_used_this_period-c.whatsapp_reserved_this_period,0) end),
      'periodEnd',c.communication_period_end)) into v_result
  from public.companies c left join public.subscription_tiers t on t.id=c.subscription_tier_id where c.id=v_company;
  return v_result;
end;
$$;

create or replace function public.update_communication_settings(
  p_reminders_enabled boolean,p_channel text,p_sms_fallback boolean,p_payment_instructions text,
  p_rules jsonb default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id(); v_rule jsonb;
begin
  if not public.current_user_has_permission('ManageCommunications') then raise exception 'permission_denied: ManageCommunications required'; end if;
  if p_channel not in ('sms','whatsapp') then raise exception 'invalid_channel'; end if;
  if p_reminders_enabled then perform public.assert_entitled(v_company,null); end if;
  if p_reminders_enabled and not exists(select 1 from public.companies c join public.subscription_tiers t on t.id=c.subscription_tier_id
    where c.id=v_company and t.payment_reminders_available) then raise exception 'feature_unavailable: payment reminders'; end if;
  update public.companies set payment_reminders_enabled=p_reminders_enabled,payment_reminder_channel=p_channel,
    payment_reminder_sms_fallback=p_sms_fallback,customer_payment_instructions=nullif(trim(p_payment_instructions),'') where id=v_company;
  if p_rules is not null then for v_rule in select * from jsonb_array_elements(p_rules) loop
    insert into public.payment_reminder_rules(company_id,stage_days,enabled,template_key)
    values(v_company,(v_rule->>'stage_days')::int,(v_rule->>'enabled')::boolean,v_rule->>'template_key')
    on conflict(company_id,stage_days) do update set enabled=excluded.enabled,template_key=excluded.template_key;
  end loop; end if;
end;
$$;
revoke execute on function public.update_communication_settings(boolean,text,boolean,text,jsonb) from public,anon;
grant execute on function public.update_communication_settings(boolean,text,boolean,text,jsonb) to authenticated;

-- Company profile can edit payment instructions only through the guarded RPC.
grant update (payment_reminders_enabled,payment_reminder_channel,payment_reminder_sms_fallback,customer_payment_instructions)
  on public.companies to service_role;

-- Old reminder scan is replaced by an opt-in due-date scanner in a follow-up
-- function below; remove its schedule first so two scanners cannot run.
select cron.unschedule(jobid) from cron.job where jobname='credit-reminder-scan';

create or replace function public.credit_reminder_scan()
returns int language plpgsql security definer set search_path = '' as $$
declare v_row record;v_pending record;v_rule record;v_template record;v_token text;v_url text;
  v_body text;v_fallback_body text;v_outbox uuid;v_count int:=0;v_statement_origin text;
  v_missing_url_notified uuid[]:='{}';v_admin_user_id uuid;
begin
  select nullif(rtrim(decrypted_secret,'/'),'') into v_statement_origin
  from vault.decrypted_secrets where name='STOREFRONT_PUBLIC_URL' limit 1;

  -- A payment can settle the debt after a reminder was queued but before the
  -- worker sends it. Release that reservation and cancel the stale delivery.
  for v_pending in
    select o.id,o.attempts from public.outbox o
    where o.source='reminder' and o.status='pending'
      and not exists(
        select 1 from public.orders sale
        where sale.company_id=o.company_id and sale.customer_id=o.customer_id
          and sale.is_credit_sale and sale.status='completed'
          and sale.total>coalesce((select sum(p.amount) from public.payments p
            where p.order_id=sale.id and p.status='settled'),0)
      )
    for update
  loop
    perform public.finalize_message_quota(v_pending.id,v_pending.attempts>0);
    update public.outbox set status='cancelled',
      error=case when v_pending.attempts>0 then 'balance_settled_after_attempt_delivery_uncertain' else 'balance_settled' end
    where id=v_pending.id and status='pending';
  end loop;

  for v_row in
    select c.id company_id,cu.id customer_id,cu.first_name,cu.phone,c.name store_name,
      cu.notifications_enabled,cu.sms_notifications_enabled,cu.whatsapp_notifications_enabled,
      c.payment_reminder_channel,c.payment_reminder_sms_fallback,sum(a.balance)::bigint balance,
      min(a.credit_due_at) earliest_due_date,
      max((now() at time zone 'Africa/Nairobi')::date-a.credit_due_at)::int days_overdue
    from public.companies c join public.subscription_tiers t on t.id=c.subscription_tier_id
    join public.customers cu on cu.company_id=c.id
    join (select o.company_id,o.customer_id,o.credit_due_at,
      greatest(o.total-coalesce((select sum(p.amount) from public.payments p where p.order_id=o.id and p.status='settled'),0),0)::bigint balance
      from public.orders o where o.is_credit_sale and o.status='completed') a
      on a.company_id=c.id and a.customer_id=cu.id
    where c.payment_reminders_enabled and t.payment_reminders_available and a.balance>0
      and a.credit_due_at<=(now() at time zone 'Africa/Nairobi')::date
      and public.company_subscription_accessible(c.id)
    group by c.id,cu.id,cu.first_name,cu.phone,cu.notifications_enabled,cu.sms_notifications_enabled,
      cu.whatsapp_notifications_enabled,c.name,c.payment_reminder_channel,c.payment_reminder_sms_fallback
  loop
    select * into v_rule from public.payment_reminder_rules r where r.company_id=v_row.company_id
      and r.stage_days=v_row.days_overdue and r.enabled;
    if not found or exists(select 1 from public.credit_notification_checkpoints cp where cp.company_id=v_row.company_id
      and cp.customer_id=v_row.customer_id and cp.bucket='due_'||v_row.days_overdue) then continue; end if;
    if v_row.phone is null or not v_row.notifications_enabled
      or (v_row.payment_reminder_channel='sms' and not v_row.sms_notifications_enabled)
      or (v_row.payment_reminder_channel='whatsapp' and not v_row.whatsapp_notifications_enabled) then
      perform public.notify(v_row.company_id,'credit_reminder','Reminder not sent',
        case when v_row.phone is null then 'Customer has no phone number.' else 'Customer has opted out of this channel.' end,
        '/customers/'||v_row.customer_id::text);
      insert into public.credit_notification_checkpoints(company_id,customer_id,bucket)
      values(v_row.company_id,v_row.customer_id,'due_'||v_row.days_overdue) on conflict do nothing;
      continue;
    end if;
    if v_statement_origin is null then
      if not (v_row.company_id=any(v_missing_url_notified)) then
        select coalesce(
          (select m.user_id from public.company_memberships m join public.roles role on role.id=m.role_id
           where m.company_id=v_row.company_id and m.authorization_status='approved'
             and 'ManageTeam'=any(role.permissions) order by m.created_at limit 1),
          (select m.user_id from public.company_memberships m where m.company_id=v_row.company_id
           and m.authorization_status='approved' order by m.created_at limit 1))
        into v_admin_user_id;
        perform public.notify(v_row.company_id,'credit_reminder','Payment reminders are not configured',
          'STOREFRONT_PUBLIC_URL is missing. No reminder was sent.','/settings',v_admin_user_id);
        v_missing_url_notified:=array_append(v_missing_url_notified,v_row.company_id);
      end if;
      continue;
    end if;
    v_token:=public.issue_customer_statement_link(v_row.company_id,v_row.customer_id);
    v_url:=v_statement_origin||'/statement/'||v_token;
    select mt.* into v_template
    from public.message_templates mt where mt.template_key=v_rule.template_key
      and (mt.company_id=v_row.company_id or mt.company_id is null)
    order by mt.company_id nulls last limit 1;
    if not found then
      perform public.notify(v_row.company_id,'credit_reminder','Reminder not sent',
        'Reminder template is missing.','/messaging');
      continue;
    end if;
    v_body:=public.render_message_template(
      case when v_row.payment_reminder_channel='sms' then v_template.sms_body else v_template.whatsapp_body end,
      jsonb_build_object('customer_first_name',v_row.first_name,'outstanding_balance',to_char(v_row.balance,'FM999G999G999'),
        'statement_url',v_url,'store_name',v_row.store_name,'days_overdue',v_row.days_overdue,
        'due_date',to_char(v_row.earliest_due_date,'DD Mon YYYY')));
    v_fallback_body:=case when v_row.payment_reminder_channel='whatsapp' and v_row.payment_reminder_sms_fallback then
      public.render_message_template(v_template.sms_body,
        jsonb_build_object('customer_first_name',v_row.first_name,'outstanding_balance',to_char(v_row.balance,'FM999G999G999'),
          'statement_url',v_url,'store_name',v_row.store_name,'days_overdue',v_row.days_overdue,
          'due_date',to_char(v_row.earliest_due_date,'DD Mon YYYY'))) end;
    begin
      v_outbox:=public.queue_message(v_row.company_id,v_row.payment_reminder_channel,v_row.phone,v_body);
      update public.outbox set source='reminder',customer_id=v_row.customer_id,template_key=v_rule.template_key,
        template_version=v_template.version,fallback_body=v_fallback_body,
        fallback_channel=case when v_row.payment_reminder_channel='whatsapp' and v_row.payment_reminder_sms_fallback then 'sms' end,
        max_attempts=case when v_row.payment_reminder_channel='whatsapp' then 2 else 5 end where id=v_outbox;
      insert into public.credit_notification_checkpoints(company_id,customer_id,bucket)
      values(v_row.company_id,v_row.customer_id,'due_'||v_row.days_overdue) on conflict do nothing;
      v_count:=v_count+1;
    exception when others then
      perform public.notify(v_row.company_id,'credit_reminder','Reminder not sent',sqlerrm,'/messaging');
    end;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.credit_reminder_scan() from public,anon,authenticated;
grant execute on function public.credit_reminder_scan() to service_role;
select cron.schedule('credit-reminder-scan','22 6 * * *',$$select public.credit_reminder_scan()$$);

-- Auth hook uses these Vault secrets for parallel OTP delivery. The actual hook
-- replacement is kept here so production and fresh local databases behave alike.
create table public.auth_otp_delivery_requests (
  id uuid primary key default gen_random_uuid(), phone_hash text not null, phone_suffix text not null,
  sms_request_id bigint, whatsapp_request_id bigint,
  sms_status text check (sms_status in ('queued','accepted','failed')),
  whatsapp_status text check (whatsapp_status in ('queued','accepted','failed')),
  created_at timestamptz not null default now(), checked_at timestamptz
);
alter table public.auth_otp_delivery_requests enable row level security;
grant all on public.auth_otp_delivery_requests to service_role;

create or replace function public.record_auth_otp_delivery_request(
  p_phone_hash text,p_phone_suffix text,p_sms_request_id bigint,p_whatsapp_request_id bigint,
  p_sms_status text,p_whatsapp_status text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_sms_status not in ('queued','accepted','failed')
    or p_whatsapp_status not in ('queued','accepted','failed') then
    raise exception 'invalid_transport_status';
  end if;
  insert into public.auth_otp_delivery_requests(
    phone_hash,phone_suffix,sms_request_id,whatsapp_request_id,sms_status,whatsapp_status
  ) values(
    p_phone_hash,p_phone_suffix,p_sms_request_id,p_whatsapp_request_id,p_sms_status,p_whatsapp_status
  );
end;
$$;
revoke execute on function public.record_auth_otp_delivery_request(text,text,bigint,bigint,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_auth_otp_delivery_request(text,text,bigint,bigint,text,text)
  to supabase_auth_admin;

create or replace function public.send_sms_hook(event jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare v_phone text:=event#>>'{user,phone}'; v_otp text:=event#>>'{sms,otp}'; v_mobile text;
  v_sms_key text;v_partner text;v_shortcode text;v_wa_url text;v_wa_key text;v_wa_session text;
  v_sms_request bigint;v_wa_request bigint;
begin
  select max(case when name='TEXTSMS_API_KEY' then decrypted_secret end),max(case when name='TEXTSMS_PARTNER_ID' then decrypted_secret end),
    max(case when name='TEXTSMS_SHORTCODE' then decrypted_secret end),max(case when name='OPENWA_BASE_URL' then decrypted_secret end),
    max(case when name='OPENWA_API_KEY' then decrypted_secret end),max(case when name='OPENWA_SESSION' then decrypted_secret end)
  into v_sms_key,v_partner,v_shortcode,v_wa_url,v_wa_key,v_wa_session from vault.decrypted_secrets
  where name in ('TEXTSMS_API_KEY','TEXTSMS_PARTNER_ID','TEXTSMS_SHORTCODE','OPENWA_BASE_URL','OPENWA_API_KEY','OPENWA_SESSION');
  v_mobile:=ltrim(v_phone,'+');
  if v_sms_key is not null and v_sms_key<>'dev-disabled' and v_partner is not null and v_shortcode is not null then
    begin
      select net.http_post(url:='https://sms.textsms.co.ke/api/services/sendotp/',body:=jsonb_build_object('apikey',v_sms_key,'partnerID',v_partner,
        'shortcode',v_shortcode,'mobile',v_mobile,'message','Your Dukarun verification code is: '||v_otp),
        headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=5000) into v_sms_request;
    exception when others then v_sms_request:=null; end;
  end if;
  if v_wa_url is not null and v_wa_key is not null then
    begin
      select net.http_post(url:=rtrim(v_wa_url,'/')||'/api/sessions/'||coalesce(nullif(v_wa_session,''),'default')||'/messages/send-text',
        body:=jsonb_build_object('chatId',v_mobile||'@s.whatsapp.net','text','Your Dukarun verification code is: '||v_otp||'. Never share this code.'),
        headers:=jsonb_build_object('Content-Type','application/json','X-API-Key',v_wa_key),timeout_milliseconds:=5000) into v_wa_request;
    exception when others then v_wa_request:=null; end;
  end if;
  perform public.record_auth_otp_delivery_request(
    encode(extensions.digest(v_phone,'sha256'),'hex'),right(v_mobile,4),v_sms_request,v_wa_request,
    case when v_sms_request is not null then 'queued' else 'failed' end,
    case when v_wa_request is not null then 'queued' else 'failed' end);
  return event;
exception when others then return event;
end;
$$;
revoke execute on function public.send_sms_hook(jsonb) from public,anon,authenticated;
grant execute on function public.send_sms_hook(jsonb) to supabase_auth_admin;

create or replace function public.refresh_auth_otp_delivery_status()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.auth_otp_delivery_requests d set
    sms_status=case when d.sms_request_id is null then d.sms_status
      when sr.id is null then d.sms_status
      when sr.timed_out or sr.error_msg is not null or sr.status_code not between 200 and 299 then 'failed'
      else 'accepted' end,
    whatsapp_status=case when d.whatsapp_request_id is null then d.whatsapp_status
      when wr.id is null then d.whatsapp_status
      when wr.timed_out or wr.error_msg is not null or wr.status_code not between 200 and 299 then 'failed'
      else 'accepted' end,
    checked_at=now()
  from net._http_response sr, net._http_response wr
  where d.created_at>now()-interval '1 day'
    and sr.id=coalesce(d.sms_request_id,d.whatsapp_request_id)
    and wr.id=coalesce(d.whatsapp_request_id,d.sms_request_id)
    and (d.sms_status='queued' or d.whatsapp_status='queued');
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke execute on function public.refresh_auth_otp_delivery_status() from public,anon,authenticated;
grant execute on function public.refresh_auth_otp_delivery_status() to service_role;
select cron.schedule('auth-otp-delivery-status','* * * * *',$$select public.refresh_auth_otp_delivery_status()$$);

-- ---------------------------------------------------------------------------
-- Remaining management APIs
-- ---------------------------------------------------------------------------
create or replace function public.update_customer_communication_preferences(
  p_customer_id uuid, p_enabled boolean, p_sms_enabled boolean, p_whatsapp_enabled boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id();v_outbox record;
begin
  if not public.current_user_has_permission('ManageCustomers') then
    raise exception 'permission_denied: ManageCustomers required';
  end if;
  update public.customers set notifications_enabled=p_enabled,
    sms_notifications_enabled=p_sms_enabled,
    whatsapp_notifications_enabled=p_whatsapp_enabled,
    updated_at=now()
  where id=p_customer_id and company_id=v_company and not is_supplier;
  if not found then raise exception 'customer_not_found'; end if;
  if not p_enabled then
    update public.customer_statement_links set revoked_at=now()
    where customer_id=p_customer_id and revoked_at is null;
  end if;
  for v_outbox in select id,attempts,campaign_recipient_id from public.outbox
    where customer_id=p_customer_id and company_id=v_company and status='pending'
      and (not p_enabled or (channel='sms' and not p_sms_enabled)
        or (channel='whatsapp' and not p_whatsapp_enabled))
    for update
  loop
    perform public.finalize_message_quota(v_outbox.id,v_outbox.attempts>0);
    update public.outbox set status='cancelled',
      error=case when v_outbox.attempts>0 then 'consent_revoked_after_attempt_delivery_uncertain' else 'consent_revoked' end
    where id=v_outbox.id and status='pending';
    update public.campaign_recipients set status='cancelled'
    where id=v_outbox.campaign_recipient_id and status='queued';
  end loop;
end;
$$;
revoke execute on function public.update_customer_communication_preferences(uuid,boolean,boolean,boolean) from public,anon;
grant execute on function public.update_customer_communication_preferences(uuid,boolean,boolean,boolean) to authenticated;

create or replace function public.upsert_message_template(
  p_template_key text,p_name text,p_context text,p_sms_body text,p_whatsapp_body text,p_template_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id();v_id uuid;
begin
  if not public.current_user_has_permission('ManageCommunications') then raise exception 'permission_denied: ManageCommunications required'; end if;
  if p_context not in ('customer','reminder') then raise exception 'invalid_context'; end if;
  perform public.render_message_template(coalesce(p_sms_body,''),jsonb_build_object(
    'message','Preview','customer_first_name','Jane','store_name','Sample Store',
    'store_contact','+254700000000',
    'outstanding_balance','1,000','statement_url','https://example.test','days_overdue','3','due_date','31 Dec 2026'));
  perform public.render_message_template(coalesce(p_whatsapp_body,''),jsonb_build_object(
    'message','Preview','customer_first_name','Jane','store_name','Sample Store',
    'store_contact','+254700000000',
    'outstanding_balance','1,000','statement_url','https://example.test','days_overdue','3','due_date','31 Dec 2026'));
  if p_template_id is null then
    insert into public.message_templates(company_id,template_key,name,context,sms_body,whatsapp_body,created_by)
    values(v_company,p_template_key,p_name,p_context,nullif(p_sms_body,''),nullif(p_whatsapp_body,''),auth.uid()) returning id into v_id;
  else
    update public.message_templates set name=p_name,sms_body=nullif(p_sms_body,''),whatsapp_body=nullif(p_whatsapp_body,''),
      version=version+1,updated_at=now() where id=p_template_id and company_id=v_company returning id into v_id;
  end if;
  if v_id is null then raise exception 'template_not_found'; end if; return v_id;
end;
$$;
revoke execute on function public.upsert_message_template(text,text,text,text,text,uuid) from public,anon;
grant execute on function public.upsert_message_template(text,text,text,text,text,uuid) to authenticated;

create or replace function public.reset_message_template(p_template_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id();v_deleted integer;
begin
  if not public.current_user_has_permission('ManageCommunications') then raise exception 'permission_denied: ManageCommunications required'; end if;
  delete from public.message_templates where company_id=v_company and template_key=p_template_key;
  get diagnostics v_deleted=row_count;
  return v_deleted>0;
end;
$$;
revoke execute on function public.reset_message_template(text) from public,anon;
grant execute on function public.reset_message_template(text) to authenticated;

create or replace function public.test_message_template(p_template_id uuid,p_channel text,p_recipient text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id();v_template public.message_templates%rowtype;
  v_body text;v_outbox uuid;v_store record;
begin
  if not public.current_user_has_permission('ManageCommunications') then raise exception 'permission_denied: ManageCommunications required'; end if;
  if p_channel not in ('sms','whatsapp') then raise exception 'invalid_channel'; end if;
  select * into v_template from public.message_templates where id=p_template_id and active
    and (company_id=v_company or company_id is null);
  if not found then raise exception 'template_not_found'; end if;
  select name,coalesce(public_whatsapp_number,'') contact into v_store from public.companies where id=v_company;
  v_body:=public.render_message_template(
    case when p_channel='sms' then v_template.sms_body else v_template.whatsapp_body end,
    jsonb_build_object('customer_first_name','Test customer','store_name',v_store.name,'store_contact',v_store.contact,
      'outstanding_balance','1,000','due_date','31 Dec 2026','days_overdue','3','statement_url','https://example.test/statement'));
  v_outbox:=public.queue_message(v_company,p_channel,p_recipient,v_body);
  update public.outbox set source='direct',template_key=v_template.template_key,template_version=v_template.version where id=v_outbox;
  return v_outbox;
end;
$$;
revoke execute on function public.test_message_template(uuid,text,text) from public,anon;
grant execute on function public.test_message_template(uuid,text,text) to authenticated;

create or replace function public.platform_update_tier_communications(
  p_tier_id uuid,p_storefront_available boolean,p_customer_campaigns_available boolean,
  p_payment_reminders_available boolean,p_whatsapp_per_period integer default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_previous_storefront boolean;
begin
  perform public.assert_platform_admin();
  select storefront_available into v_previous_storefront
  from public.subscription_tiers where id=p_tier_id for update;
  if not found then raise exception 'tier_not_found'; end if;
  update public.subscription_tiers set storefront_available=p_storefront_available,
    customer_campaigns_available=p_customer_campaigns_available,
    payment_reminders_available=p_payment_reminders_available,
    whatsapp_per_period=p_whatsapp_per_period,updated_at=now() where id=p_tier_id;
  if v_previous_storefront and not p_storefront_available then
    update public.companies set storefront_entitlement_grace_end=now()+interval '7 days'
    where subscription_tier_id=p_tier_id and public_storefront_enabled;
  elsif not v_previous_storefront and p_storefront_available then
    update public.companies set storefront_entitlement_grace_end=null
    where subscription_tier_id=p_tier_id;
  end if;
end;
$$;
revoke execute on function public.platform_update_tier_communications(uuid,boolean,boolean,boolean,integer) from public,anon;
grant execute on function public.platform_update_tier_communications(uuid,boolean,boolean,boolean,integer) to authenticated,service_role;

create or replace function public.platform_save_tier(
  p_code text,p_name text,p_price_monthly bigint,p_price_yearly bigint,
  p_multiple_locations_enabled boolean,p_staff_performance_enabled boolean,
  p_commissions_available boolean,p_storefront_available boolean,
  p_customer_campaigns_available boolean,p_payment_reminders_available boolean,
  p_max_team_members integer default null,p_max_products integer default null,
  p_max_stock_locations integer default null,p_max_orders_per_month integer default null,
  p_sms_per_period integer default null,p_whatsapp_per_period integer default null,
  p_tier_id uuid default null,p_is_active boolean default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;v_previous_storefront boolean;
begin
  perform public.assert_platform_admin();
  if not p_multiple_locations_enabled and coalesce(p_max_stock_locations,1)>1 then
    raise exception 'invalid_tier: multiple locations must be enabled when location limit exceeds one';
  end if;
  if p_tier_id is not null then
    select storefront_available into v_previous_storefront
    from public.subscription_tiers where id=p_tier_id for update;
    if not found then raise exception 'tier_not_found: %',p_tier_id; end if;
    update public.subscription_tiers set name=p_name,price_monthly=p_price_monthly,
      price_yearly=p_price_yearly,multiple_locations_enabled=p_multiple_locations_enabled,
      staff_performance_enabled=p_staff_performance_enabled,
      commissions_available=p_commissions_available,max_team_members=p_max_team_members,
      max_products=p_max_products,max_stock_locations=p_max_stock_locations,
      max_orders_per_month=p_max_orders_per_month,sms_per_period=p_sms_per_period,
      storefront_available=p_storefront_available,
      customer_campaigns_available=p_customer_campaigns_available,
      payment_reminders_available=p_payment_reminders_available,
      whatsapp_per_period=p_whatsapp_per_period,is_active=coalesce(p_is_active,is_active),updated_at=now()
    where id=p_tier_id returning id into v_id;
    if v_previous_storefront and not p_storefront_available then
      update public.companies set storefront_entitlement_grace_end=now()+interval '7 days'
      where subscription_tier_id=v_id and public_storefront_enabled;
    elsif not v_previous_storefront and p_storefront_available then
      update public.companies set storefront_entitlement_grace_end=null
      where subscription_tier_id=v_id;
    end if;
  else
    insert into public.subscription_tiers(
      code,name,price_monthly,price_yearly,multiple_locations_enabled,
      staff_performance_enabled,commissions_available,max_team_members,max_products,
      max_stock_locations,max_orders_per_month,sms_per_period,storefront_available,
      customer_campaigns_available,payment_reminders_available,whatsapp_per_period,is_active
    ) values(
      p_code,p_name,p_price_monthly,p_price_yearly,p_multiple_locations_enabled,
      p_staff_performance_enabled,p_commissions_available,p_max_team_members,p_max_products,
      p_max_stock_locations,p_max_orders_per_month,p_sms_per_period,p_storefront_available,
      p_customer_campaigns_available,p_payment_reminders_available,p_whatsapp_per_period,
      coalesce(p_is_active,true)
    ) returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.platform_save_tier(
  text,text,bigint,bigint,boolean,boolean,boolean,boolean,boolean,boolean,
  integer,integer,integer,integer,integer,integer,uuid,boolean
) from public,anon;
grant execute on function public.platform_save_tier(
  text,text,bigint,bigint,boolean,boolean,boolean,boolean,boolean,boolean,
  integer,integer,integer,integer,integer,integer,uuid,boolean
) to authenticated,service_role;

-- Legacy typed tier RPC: preserve its contract while routing the write through
-- the atomic save path and retaining current communication fields.
create or replace function public.platform_upsert_tier(
  p_code text,p_name text,p_price_monthly bigint,p_price_yearly bigint,
  p_multiple_locations_enabled boolean,p_staff_performance_enabled boolean,
  p_commissions_available boolean,p_max_team_members integer default null,
  p_max_products integer default null,p_max_stock_locations integer default null,
  p_max_orders_per_month integer default null,p_sms_per_period integer default null,
  p_tier_id uuid default null,p_is_active boolean default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_storefront boolean:=false;v_campaigns boolean:=false;v_reminders boolean:=false;
  v_whatsapp integer;
begin
  perform public.assert_platform_admin();
  if p_tier_id is not null then
    select storefront_available,customer_campaigns_available,payment_reminders_available,whatsapp_per_period
    into v_storefront,v_campaigns,v_reminders,v_whatsapp
    from public.subscription_tiers where id=p_tier_id;
  end if;
  return public.platform_save_tier(
    p_code,p_name,p_price_monthly,p_price_yearly,p_multiple_locations_enabled,
    p_staff_performance_enabled,p_commissions_available,coalesce(v_storefront,false),
    coalesce(v_campaigns,false),coalesce(v_reminders,false),p_max_team_members,p_max_products,
    p_max_stock_locations,p_max_orders_per_month,p_sms_per_period,v_whatsapp,p_tier_id,p_is_active
  );
end;
$$;
revoke execute on function public.platform_upsert_tier(
  text,text,bigint,bigint,boolean,boolean,boolean,
  integer,integer,integer,integer,integer,uuid,boolean
) from public,anon;
grant execute on function public.platform_upsert_tier(
  text,text,bigint,bigint,boolean,boolean,boolean,
  integer,integer,integer,integer,integer,uuid,boolean
) to authenticated,service_role;

create or replace function public.platform_upsert_message_template(
  p_template_id uuid,p_name text,p_sms_body text,p_whatsapp_body text,p_in_app_title text,p_in_app_body text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;v_values jsonb:=jsonb_build_object('merchant_name','Sample Merchant','tier','Standard',
  'subscription_state','active','subscription_end_date','31 Dec 2026','message','Your update');
begin
  perform public.assert_platform_admin();
  perform public.render_message_template(coalesce(p_sms_body,''),v_values);
  perform public.render_message_template(coalesce(p_whatsapp_body,''),v_values);
  perform public.render_message_template(coalesce(p_in_app_title,''),v_values);
  perform public.render_message_template(coalesce(p_in_app_body,''),v_values);
  update public.message_templates set name=trim(p_name),sms_body=nullif(p_sms_body,''),
    whatsapp_body=nullif(p_whatsapp_body,''),in_app_title=nullif(p_in_app_title,''),
    in_app_body=nullif(p_in_app_body,''),version=version+1,updated_at=now()
  where id=p_template_id and company_id is null and context='platform' returning id into v_id;
  if v_id is null then raise exception 'template_not_found'; end if;
  return v_id;
end;
$$;
revoke execute on function public.platform_upsert_message_template(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.platform_upsert_message_template(uuid,text,text,text,text,text) to authenticated,service_role;

create or replace function public.platform_campaign_preview(
  p_channel text,p_audience text default 'all',p_tier_id uuid default null,
  p_subscription_status text default null,p_company_ids uuid[] default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_total int;v_contactable int;
begin
  perform public.assert_platform_admin();
  if p_channel not in ('in_app','sms','whatsapp') then raise exception 'invalid_channel'; end if;
  with targets as (
    select c.id,coalesce(
      (select jsonb_build_object('user_id',u.id,'phone',u.phone) from public.company_memberships m join public.roles r on r.id=m.role_id
        join auth.users u on u.id=m.user_id where m.company_id=c.id and m.authorization_status='approved'
        and 'ManageTeam'=any(r.permissions) order by m.created_at limit 1),
      (select jsonb_build_object('user_id',u.id,'phone',u.phone) from public.company_memberships m join auth.users u on u.id=m.user_id
       where m.company_id=c.id and m.authorization_status='approved' order by m.created_at limit 1)) admin
    from public.companies c where c.status='approved'
      and (p_audience='all' or (p_audience='tier' and c.subscription_tier_id=p_tier_id)
        or (p_audience='subscription_status' and c.subscription_status=p_subscription_status)
        or (p_audience='selected' and c.id=any(p_company_ids)))
  ) select count(*),count(*) filter(where admin is not null
    and (p_channel='in_app' or admin->>'phone' is not null))
  into v_total,v_contactable from targets;
  return jsonb_build_object('total',v_total,'eligible',v_contactable,'skipped',v_total-v_contactable);
end;
$$;
revoke execute on function public.platform_campaign_preview(text,text,uuid,text,uuid[]) from public,anon;
grant execute on function public.platform_campaign_preview(text,text,uuid,text,uuid[]) to authenticated,service_role;

create or replace function public.platform_send_campaign(
  p_name text,p_channel text,p_title text,p_body text,p_audience text default 'all',
  p_tier_id uuid default null,p_subscription_status text default null,p_company_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_campaign uuid;v_target record;v_recipient_id uuid;v_outbox uuid;v_count int:=0;v_skipped int:=0;v_scheduled timestamptz;
  v_values jsonb;v_rendered_title text;v_rendered_body text;
begin
  perform public.assert_platform_admin();
  perform public.platform_campaign_preview(p_channel,p_audience,p_tier_id,p_subscription_status,p_company_ids);
  insert into public.message_campaigns(scope,name,audience,audience_config,channel,title,body,status,created_by,sent_at)
  values('platform',p_name,p_audience,jsonb_build_object('tier_id',p_tier_id,'subscription_status',p_subscription_status,'company_ids',p_company_ids),
    p_channel,p_title,p_body,'queued',auth.uid(),now()) returning id into v_campaign;
  for v_target in
    select c.id company_id,c.name,t.name tier_name,c.subscription_status,c.subscription_expires_at,
      coalesce((select jsonb_build_object('user_id',u.id,'phone',u.phone) from public.company_memberships m join public.roles r on r.id=m.role_id
        join auth.users u on u.id=m.user_id where m.company_id=c.id and m.authorization_status='approved'
        and 'ManageTeam'=any(r.permissions) order by m.created_at limit 1),
        (select jsonb_build_object('user_id',u.id,'phone',u.phone) from public.company_memberships m join auth.users u on u.id=m.user_id
         where m.company_id=c.id and m.authorization_status='approved' order by m.created_at limit 1)) admin
    from public.companies c left join public.subscription_tiers t on t.id=c.subscription_tier_id where c.status='approved'
      and (p_audience='all' or (p_audience='tier' and c.subscription_tier_id=p_tier_id)
        or (p_audience='subscription_status' and c.subscription_status=p_subscription_status)
        or (p_audience='selected' and c.id=any(p_company_ids)))
  loop
    v_values:=jsonb_build_object('merchant_name',v_target.name,'tier',coalesce(v_target.tier_name,'No tier'),
      'subscription_state',coalesce(v_target.subscription_status,'pending'),
      'subscription_end_date',coalesce(to_char(v_target.subscription_expires_at at time zone 'Africa/Nairobi','DD Mon YYYY'),'Not set'),
      'message',p_body);
    v_rendered_title:=public.render_message_template(p_title,v_values);
    v_rendered_body:=public.render_message_template(p_body,v_values);
    if v_target.admin is null then
      insert into public.campaign_recipients(campaign_id,company_id,rendered_body,status,skip_reason)
      values(v_campaign,v_target.company_id,v_rendered_body,'skipped','missing_admin');v_skipped:=v_skipped+1;
    elsif p_channel='in_app' then
      perform public.notify(v_target.company_id,'system',v_rendered_title,v_rendered_body,'/notifications',
        (v_target.admin->>'user_id')::uuid);
      insert into public.campaign_recipients(campaign_id,company_id,user_id,rendered_body,status)
      values(v_campaign,v_target.company_id,(v_target.admin->>'user_id')::uuid,v_rendered_body,'sent');v_count:=v_count+1;
    elsif v_target.admin->>'phone' is not null then
      insert into public.campaign_recipients(campaign_id,company_id,user_id,recipient,rendered_body,status)
      values(v_campaign,v_target.company_id,(v_target.admin->>'user_id')::uuid,v_target.admin->>'phone',v_rendered_body,'queued') returning id into v_recipient_id;
      v_scheduled:=now();
      if p_channel='whatsapp' and extract(hour from v_scheduled at time zone 'Africa/Nairobi')::int not between 8 and 18 then
        v_scheduled:=((v_scheduled at time zone 'Africa/Nairobi')::date+
          case when extract(hour from v_scheduled at time zone 'Africa/Nairobi')::int>=19 then interval '1 day' else interval '0' end+interval '8 hours') at time zone 'Africa/Nairobi';
      end if;
      insert into public.outbox(company_id,channel,recipient,subject,body,scheduled_after,campaign_id,campaign_recipient_id,source,quota_state)
      values(v_target.company_id,p_channel,v_target.admin->>'phone',v_rendered_title,v_rendered_body,v_scheduled,v_campaign,v_recipient_id,'platform','released') returning id into v_outbox;
      update public.campaign_recipients set outbox_id=v_outbox where id=v_recipient_id;v_count:=v_count+1;
    else
      insert into public.campaign_recipients(campaign_id,company_id,user_id,rendered_body,status,skip_reason)
      values(v_campaign,v_target.company_id,(v_target.admin->>'user_id')::uuid,v_rendered_body,'skipped','missing_phone');v_skipped:=v_skipped+1;
    end if;
  end loop;
  update public.message_campaigns set recipient_count=v_count+v_skipped,skipped_count=v_skipped,
    sent_count=case when p_channel='in_app' then v_count else 0 end,
    status=case when p_channel='in_app' then 'completed' else 'queued' end where id=v_campaign;
  return jsonb_build_object('campaign_id',v_campaign,'queued',v_count,'skipped',v_skipped);
end;
$$;
revoke execute on function public.platform_send_campaign(text,text,text,text,text,uuid,text,uuid[]) from public,anon;
grant execute on function public.platform_send_campaign(text,text,text,text,text,uuid,text,uuid[]) to authenticated,service_role;

-- Compatibility wrapper: the old Operations broadcast now creates the same
-- durable platform campaign and recipient history as the Communications page.
create or replace function public.platform_broadcast(p_title text,p_body text,p_link text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  perform p_link; -- retained only for the legacy RPC signature
  v_result:=public.platform_send_campaign('Operations broadcast','in_app',p_title,p_body,'all');
  return coalesce((v_result->>'queued')::integer,0);
end;
$$;
revoke execute on function public.platform_broadcast(text,text,text) from public,anon;
grant execute on function public.platform_broadcast(text,text,text) to authenticated,service_role;

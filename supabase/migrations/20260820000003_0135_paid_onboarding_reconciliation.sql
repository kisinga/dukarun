-- Reconcile databases that recorded 0134 before its review fixes landed.
-- Keep this migration idempotent so fresh databases can apply it after the
-- final 0134 without changing behavior.

create table if not exists public.initial_subscription_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tier_id uuid not null references public.subscription_tiers(id),
  payment_reference text not null unique,
  amount bigint not null check (amount > 0),
  testing_access_months integer not null check (testing_access_months between 1 and 3),
  status text not null default 'pending' check (status in ('pending','failed','succeeded')),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists initial_subscription_payment_one_pending_company_idx
  on public.initial_subscription_payment_attempts(company_id) where status='pending';
create index if not exists initial_subscription_payment_attempts_company_time_idx
  on public.initial_subscription_payment_attempts(company_id,created_at desc);
create index if not exists platform_sales_commissions_created_idx
  on public.platform_sales_commissions(created_at desc,id desc);

alter table public.initial_subscription_payment_attempts enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='initial_subscription_payment_attempts'
      and policyname='platform admins read initial subscription payment attempts'
  ) then
    create policy "platform admins read initial subscription payment attempts"
      on public.initial_subscription_payment_attempts for select to authenticated
      using ((select public.is_platform_admin()));
  end if;
end;
$$;
grant select on public.initial_subscription_payment_attempts to authenticated;
grant all on public.initial_subscription_payment_attempts to service_role;

create or replace function public.enforce_new_customer_tier_billable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.platform_billing_settings
    where singleton and new_customer_tier_id = old.id
  ) then
    if old.is_active and not new.is_active then
      raise exception 'cannot_deactivate_new_customer_tier';
    end if;
    if new.price_monthly <= 0 then
      raise exception 'new_customer_tier_must_remain_billable';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_new_customer_tier on public.subscription_tiers;
create trigger protect_new_customer_tier
before update of is_active,price_monthly on public.subscription_tiers
for each row execute function public.enforce_new_customer_tier_billable();

create or replace function public.reserve_initial_subscription_payment(
  p_company_id uuid,
  p_tier_id uuid,
  p_reference text,
  p_amount bigint,
  p_testing_access_months integer
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company public.companies%rowtype;
  v_expected_tier uuid;
  v_expected_amount bigint;
  v_expected_months integer;
  v_attempt_id uuid;
begin
  select * into v_company from public.companies where id=p_company_id for update;
  if v_company.id is null then raise exception 'company_not_found: %',p_company_id; end if;
  if v_company.status<>'approved' then raise exception 'company_not_approved'; end if;
  if v_company.subscription_status is not null or v_company.last_payment_reference is not null
     or exists(select 1 from public.initial_subscription_purchases where company_id=p_company_id) then
    raise exception 'initial_purchase_not_eligible';
  end if;
  if exists(
    select 1 from public.initial_subscription_payment_attempts
    where company_id=p_company_id and status='pending'
  ) then raise exception 'initial_purchase_payment_pending'; end if;

  select s.new_customer_tier_id,t.price_monthly,s.testing_access_months
  into v_expected_tier,v_expected_amount,v_expected_months
  from public.platform_billing_settings s
  join public.subscription_tiers t on t.id=s.new_customer_tier_id
  where s.singleton and t.is_active and t.price_monthly>0;
  if v_expected_tier is null then raise exception 'paid_onboarding_not_configured'; end if;
  if p_tier_id is distinct from v_expected_tier
     or p_amount is distinct from v_expected_amount
     or p_testing_access_months is distinct from v_expected_months then
    raise exception 'initial_purchase_quote_changed';
  end if;
  if nullif(trim(coalesce(p_reference,'')),'') is null then
    raise exception 'initial_purchase_reference_required';
  end if;

  insert into public.initial_subscription_payment_attempts(
    company_id,tier_id,payment_reference,amount,testing_access_months
  ) values(p_company_id,p_tier_id,trim(p_reference),p_amount,p_testing_access_months)
  returning id into v_attempt_id;
  return v_attempt_id;
exception when unique_violation then
  raise exception 'initial_purchase_payment_pending';
end;
$$;
revoke execute on function public.reserve_initial_subscription_payment(uuid,uuid,text,bigint,integer)
  from public,anon,authenticated;
grant execute on function public.reserve_initial_subscription_payment(uuid,uuid,text,bigint,integer)
  to service_role;

create or replace function public.activate_initial_subscription_purchase(
  p_company_id uuid,
  p_tier_id uuid,
  p_reference text,
  p_amount bigint,
  p_unit_price bigint,
  p_testing_access_months integer,
  p_paid_at timestamptz
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company public.companies%rowtype;v_settings public.platform_billing_settings%rowtype;
  v_existing public.initial_subscription_purchases%rowtype;v_now timestamptz:=now();
  v_attempt public.initial_subscription_payment_attempts%rowtype;
begin
  select * into v_company from public.companies where id=p_company_id for update;
  if v_company.id is null then raise exception 'company_not_found: %',p_company_id; end if;
  select * into v_existing from public.initial_subscription_purchases
  where payment_reference=p_reference;
  if v_existing.id is not null then
    if v_existing.company_id=p_company_id
       and v_existing.tier_id=p_tier_id
       and v_existing.amount=p_amount
       and v_existing.testing_access_months=p_testing_access_months
       and v_existing.purchased_at=p_paid_at then
      return p_company_id;
    end if;
    raise exception 'initial_purchase_reference_conflict';
  end if;
  if exists(select 1 from public.initial_subscription_purchases where company_id=p_company_id) then
    raise exception 'initial_purchase_already_completed';
  end if;
  if v_company.status<>'approved' then raise exception 'company_not_approved'; end if;
  if v_company.subscription_status is not null or v_company.last_payment_reference is not null then
    raise exception 'initial_purchase_not_eligible';
  end if;
  select * into v_settings from public.platform_billing_settings where singleton;
  if not exists(select 1 from public.subscription_tiers where id=p_tier_id) then
    raise exception 'initial_purchase_tier_not_found';
  end if;
  if p_testing_access_months is null or p_testing_access_months not between 1 and 3 then
    raise exception 'initial_purchase_duration_invalid';
  end if;
  if p_paid_at is null then raise exception 'initial_purchase_paid_at_required'; end if;
  if nullif(trim(coalesce(p_reference,'')),'') is null
     or p_unit_price is null or p_amount is null
     or p_unit_price<=0 or p_amount<>p_unit_price then
    raise exception 'initial_purchase_amount_mismatch';
  end if;
  select * into v_attempt from public.initial_subscription_payment_attempts
  where payment_reference=p_reference;
  if v_attempt.id is null then raise exception 'initial_purchase_attempt_not_found'; end if;
  if v_attempt.company_id is distinct from p_company_id
     or v_attempt.tier_id is distinct from p_tier_id
     or v_attempt.amount is distinct from p_amount
     or v_attempt.testing_access_months is distinct from p_testing_access_months then
    raise exception 'initial_purchase_attempt_conflict';
  end if;
  insert into public.initial_subscription_purchases(
    company_id,tier_id,testing_access_months,amount,payment_reference,purchased_at
  ) values(p_company_id,p_tier_id,p_testing_access_months,p_amount,p_reference,p_paid_at);
  update public.companies set subscription_tier_id=p_tier_id,subscription_status='active',
    subscription_started_at=p_paid_at,
    subscription_expires_at=p_paid_at+make_interval(months=>p_testing_access_months),
    subscription_grace_period_end=null,billing_cycle='monthly',last_payment_date=p_paid_at,
    last_payment_amount=p_amount,last_payment_reference=p_reference,updated_at=v_now
  where id=p_company_id;
  update public.initial_subscription_payment_attempts
  set status='succeeded',failure_reason=null,updated_at=v_now
  where payment_reference=p_reference;
  update public.initial_subscription_payment_attempts
  set status='failed',failure_reason='superseded_by_completed_purchase',updated_at=v_now
  where company_id=p_company_id and payment_reference<>p_reference and status='pending';
  if v_settings.sales_commissions_enabled then
    insert into public.platform_sales_commissions(
      salesperson_id,company_id,payment_reference,collected_amount,rate_bps,commission_amount
    )
    select a.salesperson_id,p_company_id,p_reference,p_amount,v_settings.sales_commission_rate_bps,
      round(p_amount::numeric*v_settings.sales_commission_rate_bps/10000)::bigint
    from public.company_sales_attributions a where a.company_id=p_company_id
    on conflict(company_id) do nothing;
  end if;
  return p_company_id;
end;
$$;
revoke execute on function public.activate_initial_subscription_purchase(uuid,uuid,text,bigint,bigint,integer,timestamptz)
  from public,anon,authenticated;
grant execute on function public.activate_initial_subscription_purchase(uuid,uuid,text,bigint,bigint,integer,timestamptz)
  to service_role;

drop function if exists public.platform_sales_snapshot();
create or replace function public.platform_sales_snapshot(
  p_commission_limit integer default 100,
  p_commission_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  if p_commission_limit not between 1 and 200 or p_commission_offset < 0 then
    raise exception 'invalid_sales_snapshot_page';
  end if;
  with attribution_metrics as (
    select a.salesperson_id,count(*) registrations,
      count(*) filter(where co.status='approved') approvals,
      count(i.company_id) first_payments,coalesce(sum(i.amount),0) first_payment_revenue
    from public.company_sales_attributions a
    join public.companies co on co.id=a.company_id
    left join public.initial_subscription_purchases i on i.company_id=a.company_id
    group by a.salesperson_id
  ), commission_metrics as (
    select c.salesperson_id,
      coalesce(sum(c.commission_amount) filter(where c.status in('pending','approved')),0) pending_commission,
      coalesce(sum(c.commission_amount) filter(where c.status='paid'),0) paid_commission
    from public.platform_sales_commissions c group by c.salesperson_id
  ), salesperson_rows as (
    select p.id,p.name,p.phone,p.invitation_code,p.active,p.created_at,
      coalesce(a.registrations,0) registrations,coalesce(a.approvals,0) approvals,
      coalesce(a.first_payments,0) first_payments,
      coalesce(a.first_payment_revenue,0) first_payment_revenue,
      coalesce(c.pending_commission,0) pending_commission,
      coalesce(c.paid_commission,0) paid_commission
    from public.platform_salespeople p
    left join attribution_metrics a on a.salesperson_id=p.id
    left join commission_metrics c on c.salesperson_id=p.id
  ), totals as (
    select coalesce(sum(registrations),0) registrations,coalesce(sum(approvals),0) approvals,
      coalesce(sum(first_payments),0) first_payments,
      coalesce(sum(first_payment_revenue),0) first_payment_revenue,
      coalesce(sum(pending_commission),0) pending_commission,
      coalesce(sum(paid_commission),0) paid_commission from salesperson_rows
  ), commission_page as (
    select c.id,c.salesperson_id,p.name salesperson_name,c.company_id,co.name company_name,
      c.payment_reference,c.collected_amount,c.rate_bps,c.commission_amount,c.status,
      c.payout_reference,c.reversal_reason,c.created_at,c.approved_at,c.paid_at,c.reversed_at
    from public.platform_sales_commissions c
    join public.platform_salespeople p on p.id=c.salesperson_id
    join public.companies co on co.id=c.company_id
    order by c.created_at desc,c.id desc limit p_commission_limit offset p_commission_offset
  )
  select jsonb_build_object(
    'settings',jsonb_build_object('enabled',s.sales_commissions_enabled,'rate_bps',s.sales_commission_rate_bps),
    'totals',(select to_jsonb(t) from totals t),
    'salespeople',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'phone',p.phone,'invitation_code',p.invitation_code,
      'active',p.active,'created_at',p.created_at,'registrations',p.registrations,
      'approvals',p.approvals,'first_payments',p.first_payments,
      'first_payment_revenue',p.first_payment_revenue,
      'pending_commission',p.pending_commission,'paid_commission',p.paid_commission
    ) order by p.created_at desc) from salesperson_rows p),'[]'::jsonb),
    'commission_total',(select count(*) from public.platform_sales_commissions),
    'commissions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'salesperson_id',c.salesperson_id,'salesperson_name',c.salesperson_name,
      'company_id',c.company_id,'company_name',c.company_name,'payment_reference',c.payment_reference,
      'collected_amount',c.collected_amount,'rate_bps',c.rate_bps,
      'commission_amount',c.commission_amount,'status',c.status,
      'payout_reference',c.payout_reference,'reversal_reason',c.reversal_reason,
      'created_at',c.created_at,'approved_at',c.approved_at,'paid_at',c.paid_at,'reversed_at',c.reversed_at
    ) order by c.created_at desc,c.id desc) from commission_page c),'[]'::jsonb)
  ) into v_result from public.platform_billing_settings s where s.singleton;
  return v_result;
end;
$$;
revoke execute on function public.platform_sales_snapshot(integer,integer) from public,anon;
grant execute on function public.platform_sales_snapshot(integer,integer) to authenticated,service_role;

create or replace function public.platform_stats()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_month_start timestamptz:=date_trunc('month',now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
begin
  perform public.assert_platform_admin();
  return jsonb_build_object(
    'companies_total',(select count(*) from public.companies),
    'companies_approved',(select count(*) from public.companies where status='approved'),
    'companies_pending',(select count(*) from public.companies where status='unapproved'),
    'subscriptions_active',(select count(*) from public.companies where status='approved'
      and subscription_status='active' and (subscription_exempt_until>now() or subscription_expires_at>now())),
    'subscriptions_expired',(select count(*) from public.companies where subscription_status='expired'),
    'users_total',(select count(*) from auth.users),
    'monthly_active_users',(select count(*) from auth.users where last_sign_in_at>=v_month_start),
    'orders_today',(select count(*) from public.orders where (created_at at time zone 'Africa/Nairobi')::date=(now() at time zone 'Africa/Nairobi')::date and status='completed'),
    'revenue_today',(select coalesce(sum(total),0) from public.orders where (created_at at time zone 'Africa/Nairobi')::date=(now() at time zone 'Africa/Nairobi')::date and status='completed'),
    'mrr_estimate',(select coalesce(sum(case when c.billing_cycle='yearly' then t.price_yearly/12 else t.price_monthly end),0)
      from public.companies c join public.subscription_tiers t on t.id=c.subscription_tier_id
      where c.status='approved' and c.subscription_status='active'
        and c.subscription_expires_at>now() and c.last_payment_reference is not null),
    'pos_devices_total',(select count(*) from public.pos_devices where retired_at is null),
    'pos_devices_recent_30d',(select count(*) from public.pos_devices where retired_at is null and last_seen_at>=now()-interval '30 days'),
    'pos_devices_active_24h',(select count(*) from public.pos_devices where retired_at is null and last_seen_at>=now()-interval '24 hours'),
    'pos_devices_stale_30d',(select count(*) from public.pos_devices where retired_at is null and last_seen_at<now()-interval '24 hours' and last_seen_at>=now()-interval '30 days'),
    'pos_devices_dormant_30d',(select count(*) from public.pos_devices where retired_at is null and last_seen_at<now()-interval '30 days'),
    'pos_devices_with_last_reported_pending',(select count(*) from public.pos_devices where retired_at is null and pending_count>0),
    'offline_sales_last_reported_pending',(select coalesce(sum(pending_count),0) from public.pos_devices where retired_at is null),
    'companies_with_active_pos_30d',(select count(distinct company_id) from public.pos_devices where retired_at is null and last_seen_at>=now()-interval '30 days')
  );
end;
$$;

notify pgrst, 'reload schema';

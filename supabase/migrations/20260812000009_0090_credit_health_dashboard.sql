-- Replace the duplicate credit directory with a bounded, permission-gated
-- decision read model: document aging, credit utilization/concentration,
-- action queues and a ledger-derived AR/AP trend.

alter table public.purchases
  add column credit_due_at date;

update public.purchases p
set credit_due_at = p.purchase_date + coalesce(c.supplier_credit_terms_days, 0)
from public.customers c
where p.supplier_id = c.id
  and p.company_id = c.company_id
  and p.is_credit
  and p.credit_due_at is null;

create index purchases_credit_due_idx
  on public.purchases(company_id, credit_due_at)
  where is_credit;

create or replace function public.snapshot_supplier_credit_due_date()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_terms integer;
begin
  if new.is_credit and new.credit_due_at is null then
    select coalesce(c.supplier_credit_terms_days, 0)
    into v_terms
    from public.customers c
    where c.id = new.supplier_id and c.company_id = new.company_id;

    new.credit_due_at := coalesce(new.purchase_date, current_date) + coalesce(v_terms, 0);
  end if;
  return new;
end;
$$;

create trigger purchases_snapshot_credit_due
before insert or update of is_credit, purchase_date, supplier_id on public.purchases
for each row execute function public.snapshot_supplier_credit_due_date();

revoke execute on function public.snapshot_supplier_credit_due_date()
  from public, anon, authenticated;
grant execute on function public.snapshot_supplier_credit_due_date() to service_role;

create or replace function public.credit_health_dashboard(p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_days integer := least(greatest(coalesce(p_days, 90), 30), 365);
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;

  with
  ar_party_balances as (
    select
      c.id party_id,
      concat_ws(' ', c.first_name, c.last_name) party_name,
      c.credit_limit,
      c.is_credit_approved,
      coalesce(sum(l.debit) - sum(l.credit), 0)::bigint balance
    from public.customers c
    left join (
      select l.* from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      where a.code = 'ACCOUNTS_RECEIVABLE'
    ) l on l.company_id = c.company_id and l.meta ->> 'customerId' = c.id::text
    where c.company_id = v_company_id and not c.is_supplier
    group by c.id, c.first_name, c.last_name, c.credit_limit, c.is_credit_approved
  ),
  ap_party_balances as (
    select
      c.id party_id,
      concat_ws(' ', c.first_name, c.last_name) party_name,
      c.supplier_credit_limit credit_limit,
      coalesce(sum(l.credit) - sum(l.debit), 0)::bigint balance
    from public.customers c
    left join (
      select l.* from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      where a.code = 'ACCOUNTS_PAYABLE'
    ) l on l.company_id = c.company_id and l.meta ->> 'supplierId' = c.id::text
    where c.company_id = v_company_id and c.is_supplier
    group by c.id, c.first_name, c.last_name, c.supplier_credit_limit
  ),
  ar_documents as (
    select
      o.customer_id party_id,
      o.id document_id,
      o.code reference,
      coalesce(o.credit_due_at, min(e.entry_date)) due_date,
      (sum(l.debit) - sum(l.credit))::bigint balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id and a.code = 'ACCOUNTS_RECEIVABLE'
    join public.ledger_journal_entries e on e.id = l.entry_id and e.finalized_at is not null
    join public.orders o on o.id = l.order_id and o.company_id = l.company_id
    where l.company_id = v_company_id and l.order_id is not null
    group by o.customer_id, o.id, o.code, o.credit_due_at
    having sum(l.debit) - sum(l.credit) > 0
  ),
  ap_documents as (
    select
      p.supplier_id party_id,
      p.id document_id,
      coalesce(p.reference, 'Purchase ' || left(p.id::text, 8)) reference,
      coalesce(p.credit_due_at, p.purchase_date) due_date,
      (sum(l.credit) - sum(l.debit))::bigint balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id and a.code = 'ACCOUNTS_PAYABLE'
    join public.ledger_journal_entries e on e.id = l.entry_id and e.finalized_at is not null
    join public.purchases p
      on p.id::text = l.meta ->> 'purchaseId' and p.company_id = l.company_id
    where l.company_id = v_company_id and l.meta ? 'purchaseId'
    group by p.supplier_id, p.id, p.reference, p.credit_due_at, p.purchase_date
    having sum(l.credit) - sum(l.debit) > 0
  ),
  totals as (
    select
      coalesce((select sum(greatest(balance, 0)) from ar_party_balances), 0)::bigint receivables,
      coalesce((select sum(greatest(balance, 0)) from ap_party_balances), 0)::bigint payables,
      coalesce((select sum(balance) from ar_documents where due_date < v_today), 0)::bigint overdue_receivables,
      coalesce((select sum(balance) from ar_documents where due_date < v_today - 60), 0)::bigint severe_receivables,
      coalesce((select sum(balance) from ap_documents where due_date <= v_today + 7), 0)::bigint payables_due_soon,
      (select count(*)::integer from ar_party_balances
        where credit_limit > 0 and balance > credit_limit) over_limit_parties,
      coalesce((select sum(balance) from ar_documents), 0)::bigint scheduled_ar,
      coalesce((select sum(balance) from ap_documents), 0)::bigint scheduled_ap
  ),
  document_aging as (
    select 'receivables'::text side,
      case
        when due_date >= v_today then 'current'
        when v_today - due_date <= 30 then '1-30'
        when v_today - due_date <= 60 then '31-60'
        else '60+'
      end bucket,
      sum(balance)::bigint amount,
      count(*)::integer documents
    from ar_documents group by 1, 2
    union all
    select 'payables'::text side,
      case
        when due_date >= v_today then 'current'
        when v_today - due_date <= 30 then '1-30'
        when v_today - due_date <= 60 then '31-60'
        else '60+'
      end bucket,
      sum(balance)::bigint amount,
      count(*)::integer documents
    from ap_documents group by 1, 2
  ),
  aging_seed(side, bucket, bucket_order) as (
    values
      ('receivables'::text, 'current'::text, 1),
      ('receivables', '1-30', 2),
      ('receivables', '31-60', 3),
      ('receivables', '60+', 4),
      ('receivables', 'unscheduled', 5),
      ('payables', 'current', 1),
      ('payables', '1-30', 2),
      ('payables', '31-60', 3),
      ('payables', '60+', 4),
      ('payables', 'unscheduled', 5)
  ),
  aging as (
    select s.side, s.bucket, s.bucket_order,
      case
        when s.bucket = 'unscheduled' and s.side = 'receivables'
          then greatest(t.receivables - t.scheduled_ar, 0)
        when s.bucket = 'unscheduled' and s.side = 'payables'
          then greatest(t.payables - t.scheduled_ap, 0)
        else coalesce(d.amount, 0)
      end::bigint amount,
      coalesce(d.documents, 0)::integer documents
    from aging_seed s cross join totals t
    left join document_aging d on d.side = s.side and d.bucket = s.bucket
  ),
  utilization_raw as (
    select
      case
        when balance > credit_limit then 'over_limit'
        when balance * 100 < credit_limit * 50 then 'under_50'
        when balance * 100 < credit_limit * 80 then '50_80'
        else '80_100'
      end bucket,
      count(*)::integer parties,
      sum(greatest(balance, 0))::bigint amount
    from ar_party_balances
    where credit_limit > 0 and (is_credit_approved or balance > 0)
    group by 1
  ),
  utilization_seed(bucket, bucket_order) as (
    values ('under_50'::text, 1), ('50_80', 2), ('80_100', 3), ('over_limit', 4)
  ),
  utilization as (
    select s.bucket, s.bucket_order, coalesce(u.parties, 0)::integer parties,
      coalesce(u.amount, 0)::bigint amount
    from utilization_seed s left join utilization_raw u using (bucket)
  ),
  concentration_ranked as (
    select party_id, party_name, greatest(balance, 0)::bigint amount,
      row_number() over(order by greatest(balance, 0) desc, party_name) rank
    from ar_party_balances where balance > 0
  ),
  concentration as (
    select r.party_id, r.party_name, r.amount, r.rank,
      case when t.receivables > 0 then round(r.amount * 100.0 / t.receivables, 1) else 0 end share
    from concentration_ranked r cross join totals t where r.rank <= 5
  ),
  ar_document_summary as (
    select party_id, min(due_date) oldest_due_date,
      max(greatest(v_today - due_date, 0))::integer days_overdue,
      sum(balance) filter(where due_date < v_today)::bigint overdue_amount
    from ar_documents group by party_id
  ),
  collect_candidates as (
    select b.party_id, b.party_name, greatest(b.balance, 0)::bigint outstanding,
      b.credit_limit, s.oldest_due_date, coalesce(s.days_overdue, 0) days_overdue,
      coalesce(s.overdue_amount, 0)::bigint overdue_amount,
      case
        when not b.is_credit_approved then 'Credit frozen'
        when b.credit_limit > 0 and b.balance > b.credit_limit then 'Over limit'
        when coalesce(s.days_overdue, 0) > 60 then '60+ days overdue'
        else 'Overdue'
      end reason
    from ar_party_balances b left join ar_document_summary s using (party_id)
    where b.balance > 0 and (
      not b.is_credit_approved
      or (b.credit_limit > 0 and b.balance > b.credit_limit)
      or coalesce(s.days_overdue, 0) > 0
    )
    order by coalesce(s.days_overdue, 0) desc, b.balance desc, b.party_name
    limit 8
  ),
  ap_document_summary as (
    select party_id, min(due_date) next_due_date,
      max(greatest(v_today - due_date, 0))::integer days_overdue,
      sum(balance) filter(where due_date <= v_today + 30)::bigint due_amount
    from ap_documents group by party_id
  ),
  pay_candidates as (
    select b.party_id, b.party_name, greatest(b.balance, 0)::bigint outstanding,
      coalesce(s.due_amount, 0)::bigint due_amount, s.next_due_date,
      coalesce(s.days_overdue, 0) days_overdue
    from ap_party_balances b left join ap_document_summary s using (party_id)
    where b.balance > 0 and (s.next_due_date <= v_today + 30 or s.next_due_date is null)
    order by s.next_due_date nulls last, b.balance desc, b.party_name
    limit 8
  ),
  trend_start as (
    select v_today - (v_days - 1) start_date
  ),
  daily_movements as (
    select e.entry_date trend_day,
      sum(case when a.code = 'ACCOUNTS_RECEIVABLE' then l.debit - l.credit else 0 end)::bigint ar_delta,
      sum(case when a.code = 'ACCOUNTS_PAYABLE' then l.credit - l.debit else 0 end)::bigint ap_delta
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id and e.finalized_at is not null
    cross join trend_start s
    where l.company_id = v_company_id
      and a.code in ('ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE')
      and e.entry_date >= s.start_date
      and e.entry_date <= v_today
    group by e.entry_date
  ),
  opening as (
    select
      coalesce(sum(case when a.code = 'ACCOUNTS_RECEIVABLE' then l.debit - l.credit else 0 end), 0)::bigint ar,
      coalesce(sum(case when a.code = 'ACCOUNTS_PAYABLE' then l.credit - l.debit else 0 end), 0)::bigint ap
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id and e.finalized_at is not null
    cross join trend_start s
    where l.company_id = v_company_id
      and a.code in ('ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE')
      and e.entry_date < s.start_date
  ),
  trend_days as (
    select generate_series(s.start_date, v_today, interval '1 day')::date trend_day
    from trend_start s
  ),
  trend as (
    select d.trend_day,
      greatest(o.ar + sum(coalesce(m.ar_delta, 0)) over(order by d.trend_day), 0)::bigint receivables,
      greatest(o.ap + sum(coalesce(m.ap_delta, 0)) over(order by d.trend_day), 0)::bigint payables
    from trend_days d cross join opening o left join daily_movements m using (trend_day)
  )
  select jsonb_build_object(
    'generated_at', now(),
    'metrics', jsonb_build_object(
      'receivables', t.receivables,
      'payables', t.payables,
      'overdue_receivables', t.overdue_receivables,
      'severe_receivables', t.severe_receivables,
      'payables_due_soon', t.payables_due_soon,
      'over_limit_parties', t.over_limit_parties,
      'top_five_concentration', coalesce((select sum(share) from concentration), 0)
    ),
    'aging', coalesce((select jsonb_agg(jsonb_build_object(
      'side', side, 'bucket', bucket, 'amount', amount, 'documents', documents
    ) order by side, bucket_order) from aging), '[]'::jsonb),
    'utilization', coalesce((select jsonb_agg(jsonb_build_object(
      'bucket', bucket, 'parties', parties, 'amount', amount
    ) order by bucket_order) from utilization), '[]'::jsonb),
    'concentration', coalesce((select jsonb_agg(jsonb_build_object(
      'party_id', party_id, 'party_name', party_name, 'amount', amount, 'share', share
    ) order by rank) from concentration), '[]'::jsonb),
    'collect_now', coalesce((select jsonb_agg(to_jsonb(c) order by c.days_overdue desc, c.outstanding desc)
      from collect_candidates c), '[]'::jsonb),
    'pay_soon', coalesce((select jsonb_agg(to_jsonb(p) order by p.next_due_date nulls last, p.outstanding desc)
      from pay_candidates p), '[]'::jsonb),
    'trend', coalesce((select jsonb_agg(jsonb_build_object(
      'day', trend_day, 'receivables', receivables, 'payables', payables
    ) order by trend_day) from trend), '[]'::jsonb)
  ) into v_result
  from totals t;

  return v_result;
end;
$$;

revoke execute on function public.credit_health_dashboard(integer) from public, anon;
grant execute on function public.credit_health_dashboard(integer) to authenticated;

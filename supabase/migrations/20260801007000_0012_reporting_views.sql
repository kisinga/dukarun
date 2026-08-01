-- 0012_reporting_views.sql
-- Small additions to support the money screens: AR/AP balance views,
-- customer credit management RPC, supplier flag on create_customer.

-- ---------------------------------------------------------------------------
-- Balance views (RLS-scoped reads; balances derived from journal lines).
-- ---------------------------------------------------------------------------
create view public.customer_ar_balances
with (security_invoker = true) as
select
  c.id as customer_id,
  c.company_id,
  coalesce(sum(l.debit) - sum(l.credit), 0)::bigint as balance
from public.customers c
left join (
  select l.* from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code = 'ACCOUNTS_RECEIVABLE'
) l on l.company_id = c.company_id and l.meta ->> 'customerId' = c.id::text
group by c.id, c.company_id;

create view public.supplier_ap_balances
with (security_invoker = true) as
select
  c.id as supplier_id,
  c.company_id,
  coalesce(sum(l.credit) - sum(l.debit), 0)::bigint as balance
from public.customers c
left join (
  select l.* from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code = 'ACCOUNTS_PAYABLE'
) l on l.company_id = c.company_id and l.meta ->> 'supplierId' = c.id::text
where c.is_supplier
group by c.id, c.company_id;

grant select on public.customer_ar_balances to authenticated;
grant select on public.supplier_ap_balances to authenticated;

-- ---------------------------------------------------------------------------
-- update_customer_credit: credit management (limit, approval, terms).
-- ---------------------------------------------------------------------------
create or replace function public.update_customer_credit(
  p_customer_id uuid,
  p_credit_limit bigint,
  p_is_approved boolean,
  p_terms_days integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageCustomerCreditLimit') then
    raise exception 'permission_denied: ManageCustomerCreditLimit required';
  end if;

  if p_credit_limit is null or p_credit_limit < 0 then
    raise exception 'invalid_credit_limit';
  end if;

  update public.customers
  set credit_limit = p_credit_limit,
      is_credit_approved = p_is_approved,
      credit_approved_by = case when p_is_approved then auth.uid() else credit_approved_by end,
      credit_terms_days = coalesce(p_terms_days, credit_terms_days),
      updated_at = now()
  where id = p_customer_id and company_id = v_company_id;

  if not found then
    raise exception 'customer_not_found: %', p_customer_id;
  end if;

  return p_customer_id;
end;
$$;

revoke execute on function public.update_customer_credit(uuid, bigint, boolean, integer) from anon, public;
grant execute on function public.update_customer_credit(uuid, bigint, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- create_customer: supplier flag. Drop first to avoid overload ambiguity.
-- ---------------------------------------------------------------------------
drop function public.create_customer(text, text, text, text);

create or replace function public.create_customer(
  p_first_name text,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null,
  p_is_supplier boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  insert into public.customers (company_id, first_name, last_name, phone, email, is_supplier)
  values (
    v_company_id,
    trim(p_first_name),
    nullif(trim(coalesce(p_last_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    p_is_supplier
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_customer(text, text, text, text, boolean) from anon, public;
grant execute on function public.create_customer(text, text, text, text, boolean) to authenticated;

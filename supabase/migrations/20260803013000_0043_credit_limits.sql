-- Permission-gated supplier credit policy management.

alter table public.customers
  add constraint customers_credit_limits_nonnegative
    check (credit_limit >= 0 and supplier_credit_limit >= 0),
  add constraint customers_credit_terms_nonnegative
    check ((credit_terms_days is null or credit_terms_days >= 0)
      and (supplier_credit_terms_days is null or supplier_credit_terms_days >= 0));

create or replace function public.update_supplier_credit(
  p_supplier_id uuid,
  p_credit_limit bigint,
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

  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required';
  end if;

  if p_credit_limit is null or p_credit_limit < 0 then
    raise exception 'invalid_supplier_credit_limit';
  end if;

  if p_terms_days is not null and p_terms_days < 0 then
    raise exception 'invalid_supplier_credit_terms';
  end if;

  update public.customers
  set supplier_credit_limit = p_credit_limit,
      supplier_credit_terms_days = p_terms_days,
      updated_at = now()
  where id = p_supplier_id
    and company_id = v_company_id
    and is_supplier;

  if not found then
    raise exception 'supplier_not_found: %', p_supplier_id;
  end if;

  return p_supplier_id;
end;
$$;

revoke execute on function public.update_supplier_credit(uuid, bigint, integer) from anon, public;
grant execute on function public.update_supplier_credit(uuid, bigint, integer) to authenticated;

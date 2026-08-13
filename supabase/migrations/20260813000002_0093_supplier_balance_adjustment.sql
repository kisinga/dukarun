-- Supplier balance adjustments are manual AP corrections. Keep reductions from
-- creating an implicit supplier advance and require an auditable explanation.
create or replace function public.post_supplier_balance_adjustment(
  p_supplier_id uuid,
  p_amount bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_balance bigint;
  v_reason text := nullif(btrim(p_reason), '');
  v_lines jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required';
  end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid_amount'; end if;
  if v_reason is null then raise exception 'invalid_reason'; end if;

  -- This row lock serializes the balance check with purchases, payments, and
  -- other supplier adjustments, whose AP journal lines lock the same row.
  perform 1
  from public.customers c
  where c.id=p_supplier_id and c.company_id=v_company_id
    and c.is_supplier and c.deleted_at is null
  for update;
  if not found then raise exception 'supplier_not_found'; end if;

  select coalesce(sum(jl.credit)-sum(jl.debit),0)::bigint into v_balance
  from public.ledger_journal_lines jl
  join public.ledger_accounts a
    on a.id=jl.account_id and a.company_id=jl.company_id
  where jl.company_id=v_company_id
    and a.code='ACCOUNTS_PAYABLE'
    and jl.meta->>'supplierId'=p_supplier_id::text;

  if p_amount < 0 and -p_amount > greatest(v_balance,0) then
    raise exception 'adjustment_exceeds_supplier_balance: reduction % exceeds balance %',
      -p_amount, greatest(v_balance,0);
  end if;

  if p_amount > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','BALANCE_ADJUSTMENT','debit',p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'reason',v_reason)),
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','credit',p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'reason',v_reason))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','debit',-p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'reason',v_reason)),
      jsonb_build_object('account_code','BALANCE_ADJUSTMENT','credit',-p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'reason',v_reason))
    );
  end if;

  return public.post_journal_entry(
    v_company_id, 'SupplierBalanceAdjustment', 'supplier-balance-adj-' || gen_random_uuid(),
    v_reason, v_lines
  );
end;
$$;

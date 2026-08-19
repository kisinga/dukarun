-- Claimable purchases store batches at net cost. Reverse the net inventory
-- movement while the original gross journal and VAT reclassification reverse
-- through their own balanced entries.

create or replace function public.reverse_credit_purchase(p_purchase_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_purchase public.purchases%rowtype;
  v_entry public.ledger_journal_entries%rowtype;v_line record;v_purchase_line record;
  v_lines jsonb:='[]'::jsonb;v_reversal_id uuid;v_net_unit_cost bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases')
    or not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: purchase reversal requires purchase and reversal access'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select * into v_purchase from public.purchases
  where id=p_purchase_id and company_id=v_company_id for update;
  if v_purchase.id is null then raise exception 'purchase_not_found'; end if;
  if not v_purchase.is_credit then raise exception 'only_credit_purchase_reversal_supported'; end if;
  if v_purchase.status='reversed' then
    select e.id into v_reversal_id from public.ledger_journal_entries e
    where e.company_id=v_company_id and e.source_type='PurchaseReversal'
      and e.source_id=v_purchase.id::text||'-reversal';
    if v_reversal_id is null then raise exception 'purchase_reversal_journal_not_found'; end if;
    return v_reversal_id;
  end if;
  if exists(select 1 from public.purchase_payments pp
    where pp.purchase_id=v_purchase.id and pp.status='settled') then
    raise exception 'purchase_has_payments: reverse its payments first'; end if;
  if exists(select 1 from public.purchase_expenses pe
    where pe.purchase_id=v_purchase.id and pe.settlement='separate') then
    raise exception 'purchase_has_separate_expenses: reverse those expenses first'; end if;
  perform 1 from public.purchase_lines pl join public.inventory_batches b
    on b.id=pl.inventory_batch_id where pl.purchase_id=v_purchase.id
    order by b.id for update of b;
  if exists(
    select 1 from public.purchase_lines pl join public.inventory_batches b
      on b.id=pl.inventory_batch_id
    where pl.purchase_id=v_purchase.id
      and (b.remaining<>pl.quantity or b.remaining_cost<>pl.net_total)
  ) then raise exception 'purchase_stock_already_moved'; end if;

  perform public.assert_supplier_account_consistent(v_company_id,v_purchase.supplier_id);
  perform set_config('app.business_location_id',v_purchase.stock_location_id::text,true);
  perform public.require_open_cashier_session(v_company_id);
  select * into v_entry from public.ledger_journal_entries e
  where e.company_id=v_company_id and e.source_type='InventoryPurchase'
    and e.source_id=v_purchase.id::text;
  if v_entry.id is null then raise exception 'purchase_journal_not_found'; end if;
  for v_line in select l.*,a.code account_code from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id=l.account_id where l.entry_id=v_entry.id
  loop
    v_lines:=v_lines||jsonb_build_object('account_code',v_line.account_code,
      'debit',v_line.credit,'credit',v_line.debit,
      'meta',v_line.meta||jsonb_build_object('reason',btrim(p_reason),
        'reversalOfPurchaseId',v_purchase.id,'locationId',v_purchase.stock_location_id));
  end loop;
  for v_purchase_line in
    select pl.*,b.stock_location_id from public.purchase_lines pl
    join public.inventory_batches b on b.id=pl.inventory_batch_id
    where pl.purchase_id=v_purchase.id order by b.id
  loop
    v_net_unit_cost:=round(v_purchase_line.net_total/v_purchase_line.quantity);
    update public.inventory_batches set remaining=0,remaining_cost=0
    where id=v_purchase_line.inventory_batch_id;
    insert into public.inventory_movements(
      company_id,variant_id,batch_id,stock_location_id,type,quantity,unit_cost,total_cost,
      source_type,source_id,meta
    ) values(
      v_company_id,v_purchase_line.variant_id,v_purchase_line.inventory_batch_id,
      v_purchase_line.stock_location_id,'reversal',-v_purchase_line.quantity,
      v_net_unit_cost,-v_purchase_line.net_total,'PurchaseReversal',v_purchase.id::text,
      jsonb_build_object('reason',btrim(p_reason),'grossCost',v_purchase_line.gross_total,
        'inputVat',v_purchase_line.tax_total)
    );
  end loop;
  update public.purchases set status='reversed',reversed_by=auth.uid(),reversed_at=now(),
    reversal_reason=btrim(p_reason) where id=v_purchase.id;
  v_reversal_id:=public.post_reversal_entry(v_company_id,'PurchaseReversal',
    v_purchase.id::text||'-reversal','Purchase reversed: '||btrim(p_reason),v_lines,v_entry.id);
  perform public.assert_supplier_account_consistent(v_company_id,v_purchase.supplier_id);
  return v_reversal_id;
end;
$$;

-- Party control accounts must agree with their source documents at every
-- commit, including service-role imports and maintenance transactions.
-- Repairs can still update both sides atomically because these checks remain
-- deferred; the generic business-limit bypass must never disable accounting
-- integrity.

create or replace function public.enforce_party_account_consistency()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_old_company_id uuid; v_new_company_id uuid;
  v_old_supplier_id uuid; v_new_supplier_id uuid;
  v_old_customer_id uuid; v_new_customer_id uuid;
begin
  if tg_table_name='ledger_journal_lines' then
    if tg_op<>'DELETE' then
      v_new_company_id:=new.company_id; v_new_supplier_id:=new.supplier_id; v_new_customer_id:=new.customer_id;
    end if;
    if tg_op<>'INSERT' then
      v_old_company_id:=old.company_id; v_old_supplier_id:=old.supplier_id; v_old_customer_id:=old.customer_id;
    end if;
  elsif tg_table_name='purchase_payments' then
    if tg_op<>'DELETE' then select p.company_id,p.supplier_id into v_new_company_id,v_new_supplier_id
      from public.purchases p where p.id=new.purchase_id; end if;
    if tg_op<>'INSERT' then select p.company_id,p.supplier_id into v_old_company_id,v_old_supplier_id
      from public.purchases p where p.id=old.purchase_id; end if;
  elsif tg_table_name='purchases' then
    if tg_op<>'DELETE' then v_new_company_id:=new.company_id; v_new_supplier_id:=new.supplier_id; end if;
    if tg_op<>'INSERT' then v_old_company_id:=old.company_id; v_old_supplier_id:=old.supplier_id; end if;
  elsif tg_table_name='payments' then
    if tg_op<>'DELETE' then select o.company_id,o.customer_id into v_new_company_id,v_new_customer_id
      from public.orders o where o.id=new.order_id; end if;
    if tg_op<>'INSERT' then select o.company_id,o.customer_id into v_old_company_id,v_old_customer_id
      from public.orders o where o.id=old.order_id; end if;
  elsif tg_table_name='orders' then
    if tg_op<>'DELETE' then v_new_company_id:=new.company_id; v_new_customer_id:=new.customer_id; end if;
    if tg_op<>'INSERT' then v_old_company_id:=old.company_id; v_old_customer_id:=old.customer_id; end if;
  end if;

  if v_old_supplier_id is not null then perform public.assert_supplier_account_consistent(v_old_company_id,v_old_supplier_id); end if;
  if v_new_supplier_id is not null and (v_new_company_id,v_new_supplier_id) is distinct from (v_old_company_id,v_old_supplier_id)
    then perform public.assert_supplier_account_consistent(v_new_company_id,v_new_supplier_id); end if;
  if v_old_customer_id is not null then perform public.assert_customer_account_consistent(v_old_company_id,v_old_customer_id); end if;
  if v_new_customer_id is not null and (v_new_company_id,v_new_customer_id) is distinct from (v_old_company_id,v_old_customer_id)
    then perform public.assert_customer_account_consistent(v_new_company_id,v_new_customer_id); end if;
  return null;
end;
$$;

create or replace function public.enforce_purchase_not_overallocated()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_purchase_id uuid:=coalesce(new.purchase_id,old.purchase_id); v_total bigint; v_paid bigint;
begin
  select total_cost into v_total from public.purchases where id=v_purchase_id;
  if v_total is null then return null; end if;
  select coalesce(sum(amount) filter(where status='settled'),0)::bigint into v_paid
  from public.purchase_payments where purchase_id=v_purchase_id;
  if v_paid>v_total then
    raise exception 'purchase_overallocated: payments % exceed total %',v_paid,v_total;
  end if;
  return null;
end;
$$;

revoke execute on function public.enforce_party_account_consistency(),
  public.enforce_purchase_not_overallocated() from public,anon,authenticated;
grant execute on function public.enforce_party_account_consistency(),
  public.enforce_purchase_not_overallocated() to service_role;

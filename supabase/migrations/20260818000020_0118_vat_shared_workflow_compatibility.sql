-- Shared approval branches are consolidated in the canonical approve_request
-- definition in 0114. No function-source rewriting is used here.

-- Historically post_full_refund.resource_id identified the refund journal
-- entry. Keep that public result contract while the refund row remains linked
-- through the journal source_id.
create or replace function public.execute_full_credit_note(
  p_order_id uuid,p_method_code text,p_reason text,p_stock_outcome text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_order public.orders%rowtype;
  v_account_code text;v_refund_id uuid;v_entry_id uuid;v_collected bigint;v_cash_refund bigint;
  v_receivable_credit bigint;v_lines jsonb;v_timezone text;v_entry_date date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
  if p_stock_outcome not in ('return_to_stock','write_off') then
    raise exception 'stock_outcome_required'; end if;
  select * into v_order from public.orders
  where id=p_order_id and company_id=v_company_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.status<>'completed' then
    raise exception 'invalid_order_state: only completed sales can be credited'; end if;
  if exists(select 1 from public.refunds r where r.company_id=v_company_id and r.order_id=p_order_id) then
    raise exception 'sale_already_refunded'; end if;
  select coalesce(sum(p.amount),0)::bigint into v_collected from public.payments p
  where p.company_id=v_company_id and p.order_id=p_order_id and p.status='settled';
  v_cash_refund:=least(v_order.gross_total,v_collected);
  v_receivable_credit:=v_order.gross_total-v_cash_refund;
  if v_cash_refund>0 then
    v_account_code:=public.resolve_tender_account(
      v_company_id,v_order.location_id,p_method_code,null);
  end if;
  perform set_config('app.refund_stock_outcome',p_stock_outcome,true);
  insert into public.refunds(
    company_id,order_id,amount,method_code,reason,created_by,ledger_account_code
  ) values(
    v_company_id,p_order_id,v_order.gross_total,p_method_code,btrim(p_reason),auth.uid(),
    v_account_code
  )
  returning id into v_refund_id;
  v_lines:=jsonb_build_array(jsonb_build_object(
    'account_code','SALES_RETURNS','debit',v_order.gross_total,'order_id',p_order_id,
    'meta',jsonb_build_object('orderCode',v_order.code,'customerId',v_order.customer_id,
      'refundId',v_refund_id)));
  if v_cash_refund>0 then
    v_lines:=v_lines||jsonb_build_object('account_code',v_account_code,'credit',v_cash_refund,
      'order_id',p_order_id,'meta',jsonb_build_object('orderCode',v_order.code,
        'customerId',v_order.customer_id,'method',p_method_code,'refundId',v_refund_id));
  end if;
  if v_receivable_credit>0 then
    v_lines:=v_lines||jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE',
      'credit',v_receivable_credit,'order_id',p_order_id,'meta',jsonb_build_object(
        'orderCode',v_order.code,'customerId',v_order.customer_id,'refundId',v_refund_id));
  end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  v_entry_date:=(now() at time zone v_timezone)::date;
  v_entry_id:=public.post_journal_entry(v_company_id,'Refund',v_refund_id::text,
    'Full credit note for order '||v_order.code,v_lines,v_entry_date);
  return v_entry_id;
end;
$$;

revoke execute on function public.execute_full_credit_note(uuid,text,text,text)
from public,anon,authenticated;
grant execute on function public.execute_full_credit_note(uuid,text,text,text) to service_role;

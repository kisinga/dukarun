-- Record an optional initial supplier payment in the same transaction as receiving stock.
-- A zero payment is a credit purchase, a full payment is paid now, and anything
-- between those values is a part-paid credit purchase.

create or replace function public.record_purchase_with_payment(
  p_supplier_id uuid,
  p_lines jsonb,
  p_payment_amount bigint,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',
  p_notes text default null,
  p_purchase_date date default current_date,
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_line jsonb;
  v_total bigint := 0;
  v_purchase_id uuid;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'purchase_lines_required';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if nullif(v_line ->> 'quantity', '')::numeric is null
      or (v_line ->> 'quantity')::numeric <= 0
      or nullif(v_line ->> 'unit_cost', '')::bigint is null
      or (v_line ->> 'unit_cost')::bigint < 0 then
      raise exception 'invalid_purchase_line';
    end if;
    v_total := v_total + round(
      (v_line ->> 'quantity')::numeric * (v_line ->> 'unit_cost')::bigint
    );
  end loop;

  if v_total <= 0 then raise exception 'invalid_amount'; end if;
  if p_payment_amount is null or p_payment_amount < 0 then
    raise exception 'invalid_initial_payment';
  end if;
  if p_payment_amount > v_total then raise exception 'ap_overpayment'; end if;

  if p_payment_amount = v_total then
    v_purchase_id := public.record_purchase_with_prices(
      p_supplier_id, p_lines, false, p_reference, p_account_code, p_notes,
      p_purchase_date, p_stock_location_id
    );
  else
    v_purchase_id := public.record_purchase_with_prices(
      p_supplier_id, p_lines, true, p_reference, p_account_code, p_notes,
      p_purchase_date, p_stock_location_id
    );
    if p_payment_amount > 0 then
      perform public.pay_purchase(v_purchase_id, p_payment_amount, p_account_code);
    end if;
  end if;

  return v_purchase_id;
end;
$$;

create or replace function public.confirm_purchase_draft_with_payment(
  p_draft_id uuid,
  p_payment_amount bigint,
  p_account_code text default 'CASH_ON_HAND',
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_company_id();
  v_draft public.purchase_drafts%rowtype;
  v_purchase_id uuid;
begin
  select * into v_draft
  from public.purchase_drafts
  where id = p_draft_id and company_id = v_company_id and status = 'draft'
  for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;

  v_purchase_id := public.record_purchase_with_payment(
    v_draft.supplier_id, v_draft.lines, p_payment_amount, v_draft.reference,
    p_account_code, v_draft.notes, v_draft.purchase_date, p_stock_location_id
  );
  update public.purchase_drafts
  set status = 'confirmed', posted_purchase_id = v_purchase_id, updated_at = now()
  where id = p_draft_id;
  return v_purchase_id;
end;
$$;

revoke execute on function public.record_purchase_with_payment(uuid,jsonb,bigint,text,text,text,date,uuid)
  from anon, public;
grant execute on function public.record_purchase_with_payment(uuid,jsonb,bigint,text,text,text,date,uuid)
  to authenticated;
revoke execute on function public.confirm_purchase_draft_with_payment(uuid,bigint,text,uuid)
  from anon, public;
grant execute on function public.confirm_purchase_draft_with_payment(uuid,bigint,text,uuid)
  to authenticated;

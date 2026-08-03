-- Purchase decision support and reversible supplier lifecycle.

alter table public.customers
  add column if not exists supplier_active boolean not null default true;

create or replace view public.supplier_variant_performance
with (security_invoker = true) as
select
  pl.company_id,
  p.supplier_id,
  pl.variant_id,
  count(distinct pl.purchase_id)::bigint as purchase_count,
  sum(pl.quantity)::numeric as total_quantity,
  sum(pl.line_total)::bigint as total_spend,
  round(sum(pl.line_total)::numeric / nullif(sum(pl.quantity), 0))::bigint as average_unit_cost,
  min(pl.unit_cost)::bigint as lowest_unit_cost,
  max(pl.unit_cost)::bigint as highest_unit_cost,
  (array_agg(pl.unit_cost order by p.purchase_date desc, p.created_at desc, pl.created_at desc))[1]::bigint
    as last_unit_cost,
  max(p.purchase_date) as last_purchase_date
from public.purchase_lines pl
join public.purchases p on p.id = pl.purchase_id and p.company_id = pl.company_id
group by pl.company_id, p.supplier_id, pl.variant_id;

grant select on public.supplier_variant_performance to authenticated;

create or replace function public.require_active_purchase_supplier()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.customers
    where id = new.supplier_id and company_id = new.company_id
      and is_supplier and supplier_active
  ) then
    raise exception 'supplier_archived_or_not_found';
  end if;
  return new;
end;
$$;

create trigger purchases_active_supplier
before insert or update of supplier_id on public.purchases
for each row execute function public.require_active_purchase_supplier();

create trigger purchase_drafts_active_supplier
before insert or update of supplier_id on public.purchase_drafts
for each row execute function public.require_active_purchase_supplier();

create or replace function public.record_purchase_with_prices(
  p_supplier_id uuid,
  p_lines jsonb,
  p_is_credit boolean,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',
  p_notes text default null,
  p_purchase_date date default current_date,
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_company_id();
  v_purchase_id uuid;
  v_line jsonb;
  v_variant public.product_variants%rowtype;
  v_wholesale bigint;
  v_retail bigint;
begin
  if not exists (
    select 1 from public.customers
    where id = p_supplier_id and company_id = v_company_id and is_supplier and supplier_active
  ) then
    raise exception 'supplier_archived_or_not_found';
  end if;

  -- Validate all requested catalog updates before creating any purchase state.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line ? 'new_wholesale_price' or v_line ? 'new_retail_price' then
      select * into v_variant from public.product_variants
      where id = (v_line ->> 'variant_id')::uuid and company_id = v_company_id;
      if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
      v_wholesale := coalesce(nullif(v_line ->> 'new_wholesale_price', '')::bigint,
        v_variant.wholesale_price, 0);
      v_retail := coalesce(nullif(v_line ->> 'new_retail_price', '')::bigint, v_variant.price);
      if v_wholesale < 0 or v_retail < 0 then raise exception 'invalid_price'; end if;
      if v_retail < v_wholesale then raise exception 'retail_price_below_wholesale'; end if;
    end if;
  end loop;

  v_purchase_id := public.record_purchase(p_supplier_id, p_lines, p_is_credit, p_reference,
    p_account_code, p_notes, p_purchase_date, p_stock_location_id);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line ? 'new_wholesale_price' or v_line ? 'new_retail_price' then
      update public.product_variants set
        wholesale_price = case when v_line ? 'new_wholesale_price'
          then (v_line ->> 'new_wholesale_price')::bigint else wholesale_price end,
        price = case when v_line ? 'new_retail_price'
          then (v_line ->> 'new_retail_price')::bigint else price end,
        updated_at = now()
      where id = (v_line ->> 'variant_id')::uuid and company_id = v_company_id;
    end if;
  end loop;
  return v_purchase_id;
end;
$$;

revoke execute on function public.record_purchase_with_prices(uuid,jsonb,boolean,text,text,text,date,uuid)
  from anon, public;
grant execute on function public.record_purchase_with_prices(uuid,jsonb,boolean,text,text,text,date,uuid)
  to authenticated;

create or replace function public.confirm_purchase_draft(
  p_draft_id uuid, p_is_credit boolean, p_account_code text default 'CASH_ON_HAND',
  p_stock_location_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := public.current_company_id(); v_draft public.purchase_drafts%rowtype;
  v_purchase_id uuid;
begin
  select * into v_draft from public.purchase_drafts where id=p_draft_id
    and company_id=v_company_id and status='draft' for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;
  v_purchase_id := public.record_purchase_with_prices(v_draft.supplier_id,v_draft.lines,p_is_credit,
    v_draft.reference,p_account_code,v_draft.notes,v_draft.purchase_date,p_stock_location_id);
  update public.purchase_drafts set status='confirmed',posted_purchase_id=v_purchase_id,updated_at=now()
    where id=p_draft_id;
  return v_purchase_id;
end;
$$;

create or replace function public.set_supplier_active(p_supplier_id uuid, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := public.current_company_id(); v_id uuid; v_balance bigint;
begin
  if not p_active then
    select coalesce(sum(l.credit)-sum(l.debit),0) into v_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=v_company_id and a.code='ACCOUNTS_PAYABLE'
      and l.meta ->> 'supplierId'=p_supplier_id::text;
    if v_balance <> 0 then raise exception 'supplier_has_outstanding_balance'; end if;
    if exists(select 1 from public.purchase_drafts where company_id=v_company_id
      and supplier_id=p_supplier_id and status='draft')
      then raise exception 'supplier_has_open_drafts'; end if;
  end if;
  update public.customers set supplier_active=p_active,updated_at=now()
  where id=p_supplier_id and company_id=v_company_id and is_supplier returning id into v_id;
  if v_id is null then raise exception 'supplier_not_found'; end if;
  return v_id;
end;
$$;

revoke execute on function public.set_supplier_active(uuid,boolean) from anon, public;
grant execute on function public.set_supplier_active(uuid,boolean) to authenticated;

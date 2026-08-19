-- Keep legacy and non-claiming purchase paths gross-inclusive. The purchase
-- column is named goods_subtotal; goods_total has never existed.

create or replace function public.default_purchase_tax_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.claim_input_vat = false then
    new.gross_total := new.total_cost;
    new.net_total := new.total_cost;
    new.goods_net_total := new.goods_subtotal;
    new.input_tax_total := 0;
    new.tax_snapshot_status := 'final';
  end if;
  return new;
end;
$$;

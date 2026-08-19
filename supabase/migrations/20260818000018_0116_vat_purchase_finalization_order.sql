-- The mature purchase RPC inserts a non-claimable final snapshot before the VAT
-- wrapper extracts evidenced input VAT. Permit exactly that one-way transition;
-- all later fiscal mutations remain blocked.

create or replace function public.prevent_final_purchase_tax_mutation()
returns trigger language plpgsql set search_path='' as $$
declare v_finalizing_claim boolean:=false;
begin
  if tg_op='DELETE' then
    if old.tax_snapshot_status='final' then raise exception 'final_tax_snapshot_immutable'; end if;
    return old;
  end if;
  v_finalizing_claim:=old.tax_snapshot_status='final'
    and not old.claim_input_vat and old.input_tax_total=0
    and new.claim_input_vat and new.tax_snapshot_status='final'
    and nullif(btrim(new.supplier_tax_pin),'') is not null
    and nullif(btrim(new.tax_invoice_number),'') is not null
    and new.tax_invoice_date is not null and new.tax_point_at is not null;
  if old.tax_snapshot_status='final' and not v_finalizing_claim and (
    new.gross_total is distinct from old.gross_total
    or new.net_total is distinct from old.net_total
    or new.goods_net_total is distinct from old.goods_net_total
    or new.input_tax_total is distinct from old.input_tax_total
    or new.claim_input_vat is distinct from old.claim_input_vat
    or new.supplier_tax_pin is distinct from old.supplier_tax_pin
    or new.tax_invoice_number is distinct from old.tax_invoice_number
    or new.tax_invoice_date is distinct from old.tax_invoice_date
    or new.tax_point_at is distinct from old.tax_point_at
    or new.tax_profile_id is distinct from old.tax_profile_id
    or new.tax_snapshot_status is distinct from old.tax_snapshot_status
  ) then raise exception 'final_tax_snapshot_immutable'; end if;
  return new;
end;
$$;
create or replace function public.prevent_final_purchase_line_tax_mutation()
returns trigger language plpgsql set search_path='' as $$
declare v_purchase public.purchases%rowtype;v_finalizing_claim boolean:=false;
begin
  select p.* into v_purchase from public.purchases p where p.id=old.purchase_id;
  if tg_op='DELETE' then
    if v_purchase.tax_snapshot_status='final' then raise exception 'final_tax_snapshot_immutable'; end if;
    return old;
  end if;
  v_finalizing_claim:=v_purchase.tax_snapshot_status='final'
    and not v_purchase.claim_input_vat
    and old.tax_category_id is null and old.tax_rate_version_id is null
    and old.tax_total=0 and old.tax_rate_bps=0
    and old.tax_classification in ('not_claimed','legacy_unclassified');
  if v_purchase.tax_snapshot_status='final' and not v_finalizing_claim and (
    new.tax_category_id is distinct from old.tax_category_id
    or new.tax_rate_version_id is distinct from old.tax_rate_version_id
    or new.tax_category_code is distinct from old.tax_category_code
    or new.tax_classification is distinct from old.tax_classification
    or new.tax_rate_bps is distinct from old.tax_rate_bps
    or new.gross_total is distinct from old.gross_total
    or new.net_total is distinct from old.net_total
    or new.tax_total is distinct from old.tax_total
  ) then raise exception 'final_tax_snapshot_immutable'; end if;
  return new;
end;
$$;

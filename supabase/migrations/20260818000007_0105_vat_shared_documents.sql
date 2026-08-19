-- Freeze the shop print preference and authoritative tax snapshot into newly
-- shared customer documents. Existing links remain immutable historical copies.

create or replace function public.snapshot_external_document_vat()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_order public.orders%rowtype;v_show boolean:=false;v_registered boolean:=false;
  v_pin text;v_document_number text;v_estimate jsonb;v_breakdown jsonb:='[]'::jsonb;
  v_gross bigint:=0;v_net bigint:=0;v_tax bigint:=0;
begin
  if new.document_type not in ('receipt','invoice','proforma') then return new; end if;
  select * into v_order from public.orders where id=new.subject_id and company_id=new.company_id;
  if v_order.id is null then return new; end if;
  select show_vat_breakdown_on_prints into v_show from public.companies where id=new.company_id;
  if v_order.tax_profile_id is not null then
    select vat_registered,tax_registration_number into v_registered,v_pin
      from public.company_tax_profiles where id=v_order.tax_profile_id;
  else
    select vat_registered,tax_registration_number into v_registered,v_pin
      from public.company_tax_profiles where company_id=new.company_id and effective_from<=current_date
        and (effective_to is null or effective_to>=current_date) order by effective_from desc limit 1;
  end if;
  if v_order.tax_snapshot_status='final' then
    v_gross:=v_order.gross_total;v_net:=v_order.net_total;v_tax:=v_order.tax_total;
    select td.document_number into v_document_number from public.tax_documents td
      where td.id=v_order.tax_document_id;
    select coalesce(jsonb_agg(x order by x->>'code'),'[]'::jsonb) into v_breakdown from (
      select jsonb_build_object('code',l.tax_category_code,'classification',l.tax_classification,
        'rate_bps',l.tax_rate_bps,'gross',sum(l.gross_total),'net',sum(l.net_total),
        'tax',sum(l.tax_total)) x from public.order_lines l where l.order_id=v_order.id
      group by l.tax_category_code,l.tax_classification,l.tax_rate_bps) q;
  else
    v_estimate:=public.estimate_order_tax(v_order.id);
    v_gross:=coalesce((v_estimate->>'gross_total')::bigint,v_order.total);
    v_net:=coalesce((v_estimate->>'net_total')::bigint,v_order.total);
    v_tax:=coalesce((v_estimate->>'tax_total')::bigint,0);
    select coalesce(jsonb_agg(x order by x->>'code'),'[]'::jsonb) into v_breakdown from (
      select jsonb_build_object('code',line->>'tax_category_code',
        'classification',line->>'tax_classification','rate_bps',(line->>'tax_rate_bps')::integer,
        'gross',sum((line->>'gross_total')::bigint),'net',sum((line->>'net_total')::bigint),
        'tax',sum((line->>'tax_total')::bigint)) x
      from jsonb_array_elements(coalesce(v_estimate->'lines','[]'::jsonb)) line
      group by line->>'tax_category_code',line->>'tax_classification',line->>'tax_rate_bps') q;
  end if;
  new.snapshot:=new.snapshot||jsonb_build_object('show_vat_breakdown',v_show,
    'vat_registered',coalesce(v_registered,false),'tax_registration_number',v_pin,
    'tax_document_number',v_document_number,'gross_total',v_gross,'net_total',v_net,
    'tax_total',v_tax,'tax_breakdown',v_breakdown);
  return new;
end;
$$;

create trigger external_document_links_snapshot_vat before insert on public.external_document_links
for each row execute function public.snapshot_external_document_vat();

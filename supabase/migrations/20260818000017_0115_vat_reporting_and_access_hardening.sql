-- VAT reporting and access hardening: current-period reversals remain visible,
-- all VAT journals use company/profile business dates, and closing packs stay
-- behind the finance permission boundary.

create or replace function public.reverse_purchase_vat_on_status_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_goods_tax bigint;v_expense_tax bigint;v_lines jsonb:='[]'::jsonb;
  v_timezone text;v_entry_date date;
begin
  if old.status='posted' and new.status<>'posted' and old.input_tax_total>0 then
    select coalesce(sum(pl.tax_total),0) into v_goods_tax
    from public.purchase_lines pl where pl.purchase_id=new.id;
    select coalesce(sum(pe.tax_total),0) into v_expense_tax
    from public.purchase_expenses pe
    where pe.purchase_id=new.id and pe.settlement='supplier_bill';
    if v_goods_tax>0 then v_lines:=v_lines||jsonb_build_object(
      'account_code','INVENTORY','debit',v_goods_tax,
      'meta',jsonb_build_object('purchaseId',new.id)); end if;
    if v_expense_tax>0 then v_lines:=v_lines||jsonb_build_object(
      'account_code','EXPENSES','debit',v_expense_tax,
      'meta',jsonb_build_object('purchaseId',new.id)); end if;
    v_lines:=v_lines||jsonb_build_object('account_code','TAX_PAYABLE','credit',
      old.input_tax_total,'meta',jsonb_build_object('purchaseId',new.id,'inputVatReversal',true));
    select c.business_timezone into v_timezone from public.companies c where c.id=new.company_id;
    v_entry_date:=(now() at time zone v_timezone)::date;
    perform public.post_journal_entry(new.company_id,'PurchaseVatReversal',new.id::text,
      'Input VAT reversal for purchase '||coalesce(new.reference,new.id::text),v_lines,v_entry_date);
  end if;
  return new;
end;
$$;

create or replace function public.post_order_vat_reclassification()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_entry_date date;v_timezone text;v_context public.posting_context;
begin
  select coalesce(cp.business_timezone,c.business_timezone) into v_timezone
  from public.companies c
  left join public.company_tax_profiles cp on cp.id=coalesce(new.tax_profile_id,old.tax_profile_id)
  where c.id=new.company_id;
  if old.status<>'completed' and new.status='completed' and new.tax_total>0 then
    v_entry_date:=coalesce(new.accounting_posting_date,
      (new.tax_point_at at time zone v_timezone)::date);
    v_context:=row(new.company_id,new.location_id,coalesce(new.completed_by,new.created_by),
      new.cashier_session_id,new.tax_point_at,v_entry_date,
      coalesce(new.posting_source,'interactive'),new.late_posting_reason)::public.posting_context;
    perform public.post_journal_entry_with_context(new.company_id,'VatSaleReclass',new.id::text,
      'VAT extracted from inclusive sale '||new.code,jsonb_build_array(
        jsonb_build_object('account_code','SALES','debit',new.tax_total,'order_id',new.id,
          'meta',jsonb_build_object('orderCode',new.code,'taxDocumentId',new.tax_document_id)),
        jsonb_build_object('account_code','TAX_PAYABLE','credit',new.tax_total,'order_id',new.id,
          'meta',jsonb_build_object('orderCode',new.code,'taxDocumentId',new.tax_document_id))
      ),v_context);
  elsif old.status='completed' and new.status='voided' then
    if exists(select 1 from public.refunds r where r.company_id=new.company_id and r.order_id=new.id) then
      raise exception 'credited_sale_cannot_be_voided';
    end if;
    if old.tax_total>0 then
      v_entry_date:=(now() at time zone v_timezone)::date;
      perform public.post_journal_entry(new.company_id,'VatSaleVoid',new.id::text,
        'VAT reversal for voided sale '||new.code,jsonb_build_array(
          jsonb_build_object('account_code','TAX_PAYABLE','debit',old.tax_total,'order_id',new.id),
          jsonb_build_object('account_code','SALES','credit',old.tax_total,'order_id',new.id)
        ),v_entry_date);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.post_refund_tax_and_inventory()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_movement record;v_cogs bigint:=0;v_timezone text;v_entry_date date;
begin
  select c.business_timezone into v_timezone from public.companies c where c.id=new.company_id;
  v_entry_date:=(now() at time zone v_timezone)::date;
  if new.tax_total>0 then
    perform public.post_journal_entry(new.company_id,'VatRefundReclass',new.id::text,
      'VAT credit note for sale refund',jsonb_build_array(
        jsonb_build_object('account_code','TAX_PAYABLE','debit',new.tax_total,'order_id',new.order_id,
          'meta',jsonb_build_object('refundId',new.id,'taxDocumentId',new.tax_document_id)),
        jsonb_build_object('account_code','SALES_RETURNS','credit',new.tax_total,'order_id',new.order_id,
          'meta',jsonb_build_object('refundId',new.id,'taxDocumentId',new.tax_document_id))
      ),v_entry_date);
  end if;
  if new.stock_outcome='return_to_stock' then
    for v_movement in select * from public.inventory_movements im
      where im.company_id=new.company_id and im.source_type='Sale'
        and im.source_id=new.order_id::text and im.quantity<0
    loop
      update public.inventory_batches set remaining=remaining+abs(v_movement.quantity),
        remaining_cost=remaining_cost+coalesce(v_movement.total_cost,0)
      where id=v_movement.batch_id;
      insert into public.inventory_movements(
        company_id,variant_id,batch_id,stock_location_id,type,quantity,unit_cost,total_cost,
        source_type,source_id,meta
      ) values(
        new.company_id,v_movement.variant_id,v_movement.batch_id,v_movement.stock_location_id,
        'reversal',abs(v_movement.quantity),v_movement.unit_cost,v_movement.total_cost,
        'RefundRestock',new.id::text,jsonb_build_object('orderId',new.order_id,'refundId',new.id)
      );
      v_cogs:=v_cogs+coalesce(v_movement.total_cost,0);
    end loop;
    if v_cogs>0 then
      perform public.post_journal_entry(new.company_id,'RefundRestock',new.id::text,
        'Stock returned from refunded sale',jsonb_build_array(
          jsonb_build_object('account_code','INVENTORY','debit',v_cogs,'order_id',new.order_id,
            'meta',jsonb_build_object('refundId',new.id)),
          jsonb_build_object('account_code','COGS','credit',v_cogs,'order_id',new.order_id,
            'meta',jsonb_build_object('refundId',new.id))
        ),v_entry_date);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.vat_late_transaction_schedule(
  p_company_id uuid,p_start_date date,p_end_date date,p_timezone text
)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at,x.id),'[]'::jsonb)
  from (
    select l.id,'offline'::text source,l.occurred_at,
      (l.occurred_at at time zone p_timezone)::date original_business_date,
      o.accounting_posting_date posting_date,l.reviewed_at,l.posted_order_id,
      null::uuid customer_receipt_id,l.status,o.gross_total,o.net_total,o.tax_total,
      l.status='approved' prior_period_correction
    from public.late_sale_reviews l
    left join public.orders o on o.id=l.posted_order_id and o.company_id=l.company_id
    where l.company_id=p_company_id and (
      (l.status='approved' and coalesce(o.accounting_posting_date,
        (l.reviewed_at at time zone p_timezone)::date) between p_start_date and p_end_date)
      or (l.status='pending' and (l.occurred_at at time zone p_timezone)::date
        between p_start_date and p_end_date)
    )
  ) x
$$;
revoke execute on function public.vat_late_transaction_schedule(uuid,date,date,text)
  from public,anon,authenticated;

create or replace function public.vat_report(p_start_date date,p_end_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_timezone text;
  v_sales_gross bigint:=0;v_sales_net bigint:=0;v_output_vat bigint:=0;
  v_credit_note_vat bigint:=0;v_void_vat bigint:=0;
  v_purchase_input bigint:=0;v_expense_input bigint:=0;v_input_reversals bigint:=0;
  v_by_category jsonb:='[]'::jsonb;v_late_transactions jsonb:='[]'::jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'invalid_report_range'; end if;
  if not public.current_user_has_permission('ViewFinancials')
    and not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: ViewFinancials required'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;

  select coalesce(sum(o.gross_total),0),coalesce(sum(o.net_total),0),coalesce(sum(o.tax_total),0)
  into v_sales_gross,v_sales_net,v_output_vat
  from public.orders o
  where o.company_id=v_company_id and o.status in ('completed','voided')
    and o.tax_snapshot_status in ('final','legacy_unclassified')
    and public.order_vat_reporting_date(o.id,o.tax_point_at,v_timezone)
      between p_start_date and p_end_date;

  select coalesce(sum(r.tax_total),0) into v_credit_note_vat
  from public.refunds r where r.company_id=v_company_id
    and (r.created_at at time zone v_timezone)::date between p_start_date and p_end_date;

  select coalesce(sum(o.tax_total),0) into v_void_vat
  from public.ledger_journal_entries e join public.orders o
    on o.id=e.source_id::uuid and o.company_id=e.company_id
  where e.company_id=v_company_id and e.source_type='VatSaleVoid'
    and e.entry_date between p_start_date and p_end_date;

  select coalesce(sum(p.input_tax_total),0) into v_purchase_input
  from public.purchases p
  join public.companies c on c.id=p.company_id
  left join public.company_tax_profiles cp on cp.id=p.tax_profile_id
  where p.company_id=v_company_id and p.tax_snapshot_status='final'
    and (p.tax_point_at at time zone coalesce(cp.business_timezone,c.business_timezone))::date
      between p_start_date and p_end_date;

  select coalesce(sum(d.input_tax_total),0) into v_expense_input
  from public.expense_documents d
  join public.companies c on c.id=d.company_id
  left join public.company_tax_profiles cp on cp.id=d.tax_profile_id
  where d.company_id=v_company_id
    and (d.tax_point_at at time zone coalesce(cp.business_timezone,c.business_timezone))::date
      between p_start_date and p_end_date;

  select coalesce(sum(p.input_tax_total),0) into v_input_reversals
  from public.ledger_journal_entries e join public.purchases p
    on p.id=e.source_id::uuid and p.company_id=e.company_id
  where e.company_id=v_company_id and e.source_type='PurchaseVatReversal'
    and e.entry_date between p_start_date and p_end_date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code',x.code,'classification',x.classification,'rate_bps',x.rate_bps,
    'gross',x.gross,'net',x.net,'tax',x.tax
  ) order by x.code,x.rate_bps),'[]'::jsonb) into v_by_category
  from (
    select a.code,a.classification,a.rate_bps,sum(a.gross)::bigint gross,
      sum(a.net)::bigint net,sum(a.tax)::bigint tax
    from (
      select l.tax_category_code code,l.tax_classification classification,l.tax_rate_bps rate_bps,
        l.gross_total gross,l.net_total net,l.tax_total tax
      from public.order_lines l join public.orders o on o.id=l.order_id
      where o.company_id=v_company_id and o.status in ('completed','voided')
        and o.tax_snapshot_status in ('final','legacy_unclassified')
        and l.tax_category_code is not null
        and public.order_vat_reporting_date(o.id,o.tax_point_at,v_timezone)
          between p_start_date and p_end_date
      union all
      select dl.tax_category_code,dl.tax_classification,dl.tax_rate_bps,
        -dl.gross_total,-dl.net_total,-dl.tax_total
      from public.refunds r join public.tax_document_lines dl on dl.tax_document_id=r.tax_document_id
      where r.company_id=v_company_id
        and (r.created_at at time zone v_timezone)::date between p_start_date and p_end_date
      union all
      select l.tax_category_code,l.tax_classification,l.tax_rate_bps,
        -l.gross_total,-l.net_total,-l.tax_total
      from public.ledger_journal_entries e join public.orders o
        on o.id=e.source_id::uuid and o.company_id=e.company_id
      join public.order_lines l on l.order_id=o.id
      where e.company_id=v_company_id and e.source_type='VatSaleVoid'
        and e.entry_date between p_start_date and p_end_date
    ) a
    group by a.code,a.classification,a.rate_bps
  ) x;

  v_late_transactions:=public.vat_late_transaction_schedule(
    v_company_id,p_start_date,p_end_date,v_timezone);

  return jsonb_build_object(
    'start_date',p_start_date,'end_date',p_end_date,
    'sales',jsonb_build_object('gross',v_sales_gross,'net',v_sales_net,
      'output_vat',v_output_vat,'output_vat_net',v_output_vat-v_credit_note_vat-v_void_vat),
    'by_category',v_by_category,
    'input_vat',v_purchase_input+v_expense_input-v_input_reversals,
    'input_vat_claimed',v_purchase_input+v_expense_input,
    'input_vat_reversals',v_input_reversals,
    'credit_note_vat',v_credit_note_vat,'void_vat',v_void_vat,
    'late_transactions',v_late_transactions,
    'net_vat_payable',v_output_vat-v_credit_note_vat-v_void_vat
      -(v_purchase_input+v_expense_input-v_input_reversals)
  );
end;
$$;

drop policy if exists "daily closes readable" on public.daily_business_closes;
create policy "daily closes readable" on public.daily_business_closes for select using (
  (select public.is_platform_admin()) or (
    company_id=(select public.current_company_id()) and (
      public.current_user_has_permission('ManageReconciliation')
      or public.current_user_has_permission('CloseAccountingPeriod')
      or public.current_user_has_permission('ViewFinancials')
    )
  )
);

drop policy if exists "closing packs readable" on public.period_closing_packs;
create policy "closing packs readable" on public.period_closing_packs for select using (
  (select public.is_platform_admin()) or (
    company_id=(select public.current_company_id()) and (
      public.current_user_has_permission('ViewFinancials')
      or public.current_user_has_permission('CloseAccountingPeriod')
    )
  )
);

create or replace function public.daily_close_status(p_business_date date default current_date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation')
    and not public.current_user_has_permission('CloseAccountingPeriod')
    and not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: financial access required'; end if;
  select jsonb_build_object('business_date',p_business_date,
    'sales',jsonb_build_object('count',count(distinct o.id),'gross',coalesce(sum(o.gross_total),0),
      'net',coalesce(sum(o.net_total),0),'vat',coalesce(sum(o.tax_total),0)),
    'payments',coalesce((select jsonb_agg(x order by x->>'method') from (
      select jsonb_build_object('method',p.method_code,'amount',sum(p.amount)) x
      from public.payments p join public.orders po on po.id=p.order_id
      where p.company_id=v_company_id and p.status='settled'
        and (po.completed_at at time zone c.business_timezone)::date=p_business_date
      group by p.method_code) q),'[]'::jsonb),
    'open_sessions',(select count(*) from public.cashier_sessions s
      where s.company_id=v_company_id and s.status='open'),
    'pending_offline',(select coalesce(sum(d.pending_count),0) from public.pos_devices d
      where d.company_id=v_company_id and d.retired_at is null),
    'pending_late_sales',(select count(*) from public.late_sale_reviews l
      where l.company_id=v_company_id and l.status='pending'),
    'signoff',(select to_jsonb(dc) from public.daily_business_closes dc
      where dc.company_id=v_company_id and dc.business_date=p_business_date)) into v_result
  from public.companies c left join public.orders o on o.company_id=c.id and o.status='completed'
    and (o.completed_at at time zone c.business_timezone)::date=p_business_date
  where c.id=v_company_id group by c.id,c.business_timezone;
  return v_result;
end;
$$;

create or replace function public.closed_period_pack(p_period_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_snapshot jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials')
    and not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: ViewFinancials required'; end if;
  select p.snapshot into v_snapshot from public.period_closing_packs p
  where p.accounting_period_id=p_period_id and p.company_id=v_company_id;
  return v_snapshot;
end;
$$;

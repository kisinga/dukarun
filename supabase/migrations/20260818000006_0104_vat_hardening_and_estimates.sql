-- VAT v1 hardening: draft estimates, reporting dates for reviewed offline sales,
-- richer period readiness, and gross/non-claim defaults for every purchase path.

create or replace function public.estimate_order_tax(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_order public.orders%rowtype;
  v_line record;v_tax record;v_lines jsonb:='[]'::jsonb;
  v_gross bigint:=0;v_net bigint:=0;v_tax_total bigint:=0;v_registered boolean:=false;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select * into v_order from public.orders where id=p_order_id and company_id=v_company_id;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.status not in ('draft','pending_payment') then raise exception 'estimate_only_for_open_order'; end if;
  for v_line in select l.*,v.product_id from public.order_lines l
    join public.product_variants v on v.id=l.variant_id
    where l.order_id=p_order_id order by l.created_at,l.id
  loop
    select * into v_tax from public.resolve_inclusive_tax(v_company_id,v_line.product_id,
      v_line.line_total,now());
    v_gross:=v_gross+v_tax.gross_total;v_net:=v_net+v_tax.net_total;
    v_tax_total:=v_tax_total+v_tax.tax_total;v_registered:=v_registered or v_tax.vat_registered;
    v_lines:=v_lines||jsonb_build_object('line_id',v_line.id,'gross_total',v_tax.gross_total,
      'net_total',v_tax.net_total,'tax_total',v_tax.tax_total,
      'tax_category_code',v_tax.tax_category_code,'tax_classification',v_tax.tax_classification,
      'tax_rate_bps',v_tax.tax_rate_bps);
  end loop;
  return jsonb_build_object('status','estimate','vat_registered',v_registered,
    'gross_total',v_gross,'net_total',v_net,'tax_total',v_tax_total,'lines',v_lines);
end;
$$;

grant execute on function public.estimate_order_tax(uuid) to authenticated;

create or replace function public.order_vat_reporting_date(
  p_order_id uuid,p_tax_point timestamptz,p_timezone text
)
returns date language sql stable security definer set search_path='' as $$
  -- VAT belongs to the immutable transaction tax point. The accounting posting
  -- date of an approved late transaction is reported separately in its
  -- correction schedule and must never move the supply into another VAT range.
  select (p_tax_point at time zone p_timezone)::date
$$;

create or replace function public.vat_report(p_start_date date,p_end_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_timezone text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'invalid_report_range'; end if;
  if not public.current_user_has_permission('ViewFinancials')
    and not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: ViewFinancials required'; end if;
  select business_timezone into v_timezone from public.companies where id=v_company_id;
  return jsonb_build_object('start_date',p_start_date,'end_date',p_end_date,
    'sales',jsonb_build_object(
      'gross',coalesce((select sum(o.gross_total) from public.orders o where o.company_id=v_company_id
        and o.status='completed' and public.order_vat_reporting_date(o.id,o.tax_point_at,v_timezone)
          between p_start_date and p_end_date),0),
      'net',coalesce((select sum(o.net_total) from public.orders o where o.company_id=v_company_id
        and o.status='completed' and public.order_vat_reporting_date(o.id,o.tax_point_at,v_timezone)
          between p_start_date and p_end_date),0),
      'output_vat',coalesce((select sum(o.tax_total) from public.orders o where o.company_id=v_company_id
        and o.status='completed' and public.order_vat_reporting_date(o.id,o.tax_point_at,v_timezone)
          between p_start_date and p_end_date),0)),
    'by_category',coalesce((select jsonb_agg(x order by x->>'code') from (
      select jsonb_build_object('code',l.tax_category_code,'classification',l.tax_classification,
        'rate_bps',l.tax_rate_bps,'gross',sum(l.gross_total),'net',sum(l.net_total),'tax',sum(l.tax_total)) x
      from public.order_lines l join public.orders o on o.id=l.order_id where o.company_id=v_company_id
        and o.status='completed' and public.order_vat_reporting_date(o.id,o.tax_point_at,v_timezone)
          between p_start_date and p_end_date
      group by l.tax_category_code,l.tax_classification,l.tax_rate_bps) q),'[]'::jsonb),
    'input_vat',coalesce((select sum(input_tax_total) from public.purchases where company_id=v_company_id
      and status='posted' and purchase_date between p_start_date and p_end_date),0)
      +coalesce((select sum(input_tax_total) from public.expense_documents where company_id=v_company_id
        and expense_date between p_start_date and p_end_date),0),
    'credit_note_vat',coalesce((select sum(tax_total) from public.refunds where company_id=v_company_id
      and (created_at at time zone v_timezone)::date between p_start_date and p_end_date),0),
    'late_transactions',coalesce((select jsonb_agg(jsonb_build_object('id',id,
      'occurred_at',occurred_at,'reviewed_at',reviewed_at,'posted_order_id',posted_order_id,
      'status',status,'prior_period_correction',status='approved') order by occurred_at)
      from public.late_sale_reviews where company_id=v_company_id and
        ((status='approved' and (reviewed_at at time zone v_timezone)::date between p_start_date and p_end_date)
          or (status='pending' and (occurred_at at time zone v_timezone)::date between p_start_date and p_end_date))),
      '[]'::jsonb),
    'net_vat_payable',
      coalesce((select sum(o.tax_total) from public.orders o where o.company_id=v_company_id
        and o.status='completed' and public.order_vat_reporting_date(o.id,o.tax_point_at,v_timezone)
          between p_start_date and p_end_date),0)
      -coalesce((select sum(tax_total) from public.refunds where company_id=v_company_id
        and (created_at at time zone v_timezone)::date between p_start_date and p_end_date),0)
      -coalesce((select sum(input_tax_total) from public.purchases where company_id=v_company_id
        and status='posted' and purchase_date between p_start_date and p_end_date),0)
      -coalesce((select sum(input_tax_total) from public.expense_documents where company_id=v_company_id
        and expense_date between p_start_date and p_end_date),0));
end;
$$;

create or replace function public.period_close_readiness(p_end_date date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_period public.accounting_periods%rowtype;v_end date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  select * into v_period from public.accounting_periods where company_id=v_company_id and status='open';
  if v_period.id is null then raise exception 'open_period_not_found'; end if;
  v_end:=coalesce(p_end_date,v_period.end_date);
  if v_end<v_period.start_date or v_end>v_period.end_date or v_end>current_date then
    raise exception 'invalid_period_end'; end if;
  return jsonb_build_object('period_id',v_period.id,'start_date',v_period.start_date,'end_date',v_end,
    'blockers',jsonb_strip_nulls(jsonb_build_object(
      'open_sessions',(select nullif(count(*),0) from public.cashier_sessions where company_id=v_company_id and status='open'),
      'pending_offline',(select nullif(coalesce(sum(pending_count),0),0) from public.pos_devices
        where company_id=v_company_id and retired_at is null),
      'pending_late_sales',(select nullif(count(*),0) from public.late_sale_reviews
        where company_id=v_company_id and status='pending'),
      'unsigned_active_days',(select nullif(count(*),0) from (select distinct e.entry_date
        from public.ledger_journal_entries e where e.company_id=v_company_id and e.finalized_at is not null
          and e.entry_date between v_period.start_date and v_end except select d.business_date
        from public.daily_business_closes d where d.company_id=v_company_id and d.status='signed_off') q),
      'unbalanced_entries',(select nullif(count(*),0) from (select e.id from public.ledger_journal_entries e
        join public.ledger_journal_lines l on l.entry_id=e.id where e.company_id=v_company_id
          and e.finalized_at is not null and e.entry_date between v_period.start_date and v_end
        group by e.id having sum(l.debit)<>sum(l.credit)) q),
      'pending_tax_snapshots',(select nullif(count(*),0) from public.orders o where o.company_id=v_company_id
        and o.status='completed' and o.tax_snapshot_status='pending'
        and o.completed_at::date between v_period.start_date and v_end),
      'mpesa_provider_event_backlog',(select nullif(count(*),0) from public.mpesa_provider_events e
        where e.company_id=v_company_id and e.status in('queued','processing','retry','manual_review')),
      'mpesa_unresolved_intents',(select nullif(count(*),0) from public.mpesa_payment_intents i
        where i.company_id=v_company_id and i.status in(
          'created','requesting','pending','funds_received','awaiting_cash','manual_review')),
      'mpesa_verified_unallocated',(select nullif(count(*),0) from public.payment_collections c
        where c.company_id=v_company_id and c.provider='mpesa' and c.provider_status='received'
          and c.verification_status in('provider_notified','provider_verified')
          and c.allocation_status<>'allocated'
          and (c.classification is null or c.classification='surplus')),
      'mpesa_pending_reversals',(select nullif(count(*),0) from public.payment_collection_reversals r
        where r.company_id=v_company_id and r.status<>'completed'),
      'mpesa_accounting_post_failures',(select nullif(count(*),0) from public.mpesa_payment_intents i
        where i.company_id=v_company_id and i.status='manual_review'
          and i.review_reason='accounting_post_failed'),
      'mpesa_late_posting_reviews',(select nullif(count(*),0) from public.mpesa_late_posting_reviews r
        where r.company_id=v_company_id and r.status='pending'),
      'unreconciled_accounts',(select nullif(count(*),0) from (
        select distinct coalesce(lpm.ledger_account_code,pm.ledger_account_code) account_code,
          case when coalesce(lpm.is_cashier_controlled,pm.is_cashier_controlled) then lpm.location_id end location_id,
          case when coalesce(lpm.is_cashier_controlled,pm.is_cashier_controlled) then 'location' else 'company' end balance_scope
        from public.payment_methods pm join public.location_payment_methods lpm
          on lpm.payment_method_id=pm.id and lpm.company_id=pm.company_id
        join public.stock_locations sl on sl.id=lpm.location_id and sl.is_active
        join public.ledger_accounts a on a.company_id=pm.company_id
          and a.code=coalesce(lpm.ledger_account_code,pm.ledger_account_code)
        where pm.company_id=v_company_id and pm.enabled and lpm.enabled
          and coalesce(lpm.requires_reconciliation,pm.requires_reconciliation)
          and a.is_active and not a.is_parent and a.type='asset' and a.allow_manual_posting) req
        where not exists(select 1 from public.reconciliations r
          join public.reconciliation_accounts ra on ra.reconciliation_id=r.id
          where r.company_id=v_company_id and r.status='verified'
            and r.created_at>coalesce((select updated_at from public.period_locks where company_id=v_company_id),'-infinity'::timestamptz)
            and ra.account_code=req.account_code and ra.balance_scope=req.balance_scope
            and (req.location_id is null or r.location_id=req.location_id))))),
    'warnings',jsonb_strip_nulls(jsonb_build_object(
      'stale_devices',(select nullif(count(*),0) from public.pos_devices where company_id=v_company_id
        and retired_at is null and last_seen_at<now()-interval '24 hours'),
      'unposted_purchase_drafts',(select nullif(count(*),0) from public.purchase_drafts
        where company_id=v_company_id and status='draft'))),
    'vat',public.vat_report(v_period.start_date,v_end));
end;
$$;

create or replace function public.default_purchase_tax_snapshot()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.claim_input_vat=false then
    new.gross_total:=new.total_cost;new.net_total:=new.total_cost;new.goods_net_total:=new.goods_total;
    new.input_tax_total:=0;new.tax_snapshot_status:='final';
  end if;return new;
end;
$$;
create trigger purchases_default_tax_snapshot before insert or update of total_cost,claim_input_vat on public.purchases
for each row execute function public.default_purchase_tax_snapshot();

create or replace function public.default_purchase_line_tax_snapshot()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.tax_category_id is null and new.tax_rate_version_id is null then
    new.gross_total:=new.line_total;new.net_total:=new.line_total;new.tax_total:=0;
    new.tax_rate_bps:=0;new.tax_category_code:='NOT_CLAIMED';new.tax_classification:='not_claimed';
  end if;return new;
end;
$$;
create trigger purchase_lines_default_tax_snapshot before insert or update of line_total on public.purchase_lines
for each row execute function public.default_purchase_line_tax_snapshot();

create or replace function public.default_purchase_expense_tax_snapshot()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.tax_category_id is null and new.tax_rate_version_id is null then
    new.gross_total:=new.amount;new.net_total:=new.amount;new.tax_total:=0;
    new.tax_rate_bps:=0;new.tax_category_code:='NOT_CLAIMED';new.tax_classification:='not_claimed';
  end if;return new;
end;
$$;
create trigger purchase_expenses_default_tax_snapshot before insert or update of amount on public.purchase_expenses
for each row execute function public.default_purchase_expense_tax_snapshot();

create or replace function public.prevent_tax_category_identity_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.tax_rate_versions where tax_category_id=old.id) and
    (new.jurisdiction_id is distinct from old.jurisdiction_id or new.code is distinct from old.code
      or new.classification is distinct from old.classification) then
    raise exception 'published_tax_category_identity_immutable';
  end if;return new;
end;
$$;
create trigger tax_categories_identity_immutable before update on public.tax_categories
for each row execute function public.prevent_tax_category_identity_mutation();

create or replace function public.prevent_period_pack_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'period_closing_pack_immutable'; end;
$$;
create trigger period_closing_packs_immutable before update or delete on public.period_closing_packs
for each row execute function public.prevent_period_pack_mutation();

revoke execute on function public.post_refund(uuid,bigint,text,text) from authenticated;

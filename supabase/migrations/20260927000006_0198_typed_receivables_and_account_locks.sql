-- Typed AR party identity is authoritative for every customer balance reader.
-- JSON customer metadata remains descriptive for AR, not a second linkage.
-- Financial history and existing function/view privileges are preserved.
begin;

create or replace view public.customer_ar_balances with (security_invoker=true) as
select c.id customer_id,c.company_id,coalesce(sum(l.debit-l.credit),0)::bigint balance
from public.customers c
left join (
  select l.* from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id=l.account_id and a.company_id=l.company_id
  where a.code='ACCOUNTS_RECEIVABLE'
) l on l.company_id=c.company_id and l.customer_id=c.id
group by c.id,c.company_id;

create or replace view public.customer_account_balances with (security_invoker=true) as
with deposits as (
  select l.company_id,l.meta->>'customerId' customer_id,
    coalesce(sum(l.credit-l.debit),0)::bigint downpayment_balance
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id=l.account_id and a.company_id=l.company_id
  where a.code='CUSTOMER_DEPOSITS'
  group by l.company_id,l.meta->>'customerId'
)
select c.company_id,c.id customer_id,coalesce(ar.balance,0)::bigint receivable_balance,
  coalesce(deposits.downpayment_balance,0)::bigint downpayment_balance,
  (coalesce(ar.balance,0)-coalesce(deposits.downpayment_balance,0))::bigint net_balance
from public.customers c
left join public.customer_ar_balances ar on ar.company_id=c.company_id and ar.customer_id=c.id
left join deposits on deposits.company_id=c.company_id and deposits.customer_id=c.id::text
where not c.is_supplier and c.deleted_at is null;

create or replace view public.customer_credit_aging with (security_invoker = true) as
with ar_lines as (
  select
    l.company_id,
    l.customer_id,
    l.order_id,
    e.id as entry_id,
    e.entry_date,
    (l.debit - l.credit)::numeric as signed_balance,
    o.receivable_kind
  from public.ledger_journal_lines l
  join public.ledger_accounts a
    on a.id = l.account_id and a.company_id = l.company_id
  join public.ledger_journal_entries e on e.id = l.entry_id
  left join public.orders o
    on o.id = l.order_id and o.company_id = l.company_id
  where a.code = 'ACCOUNTS_RECEIVABLE'
    and l.customer_id is not null
), items as (
  select
    company_id,
    customer_id,
    'order:' || order_id::text as item_key,
    min(entry_date) as item_date,
    sum(signed_balance) as balance
  from ar_lines
  where order_id is not null and receivable_kind = 'credit'
  group by company_id, customer_id, order_id

  union all

  select
    company_id,
    customer_id,
    'entry:' || entry_id::text as item_key,
    entry_date as item_date,
    sum(signed_balance) as balance
  from ar_lines
  where order_id is null
  group by company_id, customer_id, entry_id, entry_date
), pools as (
  select
    company_id,
    customer_id,
    coalesce(sum(-balance) filter (where balance < 0), 0::numeric) as credit_pool
  from items
  group by company_id, customer_id
), ranked as (
  select
    i.*,
    p.credit_pool,
    coalesce(
      sum(i.balance) over (
        partition by i.company_id, i.customer_id
        order by i.item_date, i.item_key
        rows between unbounded preceding and 1 preceding
      ),
      0::numeric
    ) as positive_before
  from items i
  join pools p using (company_id, customer_id)
  where i.balance > 0
), remaining as (
  select
    company_id,
    customer_id,
    item_date,
    greatest(
      balance - greatest(credit_pool - positive_before, 0::numeric),
      0::numeric
    ) as balance
  from ranked
), aged as (
  select
    company_id,
    customer_id,
    sum(balance)::bigint as balance,
    min(item_date) as oldest_unpaid_date
  from remaining
  where balance > 0
  group by company_id, customer_id
)
select
  aged.company_id,
  aged.customer_id,
  aged.balance,
  aged.oldest_unpaid_date,
  (business.today - aged.oldest_unpaid_date)::integer as days_outstanding,
  case
    when business.today - aged.oldest_unpaid_date <= 7 then 'current'
    when business.today - aged.oldest_unpaid_date <= 30 then '8-30'
    when business.today - aged.oldest_unpaid_date <= 60 then '31-60'
    else '60+'
  end as bucket
from aged
join public.companies company on company.id = aged.company_id
cross join lateral (
  select (now() at time zone company.business_timezone)::date as today
) business;

-- Statements, message previews, and dashboard totals use the same typed AR owner.
CREATE OR REPLACE FUNCTION public.customer_statement(p_customer_id uuid, p_before_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25)
 RETURNS TABLE(id uuid, date timestamp with time zone, reference text, description text, debit bigint, credit bigint, balance bigint, activity_kind text, receipt_id uuid, details jsonb, has_more boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_company_id uuid:=public.current_company_id();v_limit integer:=least(greatest(coalesce(p_limit,25),1),100);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then raise exception 'permission_denied: ViewFinancials required'; end if;
  if (p_before_date is null)<>(p_before_id is null) then raise exception 'invalid_statement_cursor'; end if;
  return query
  with entries as materialized (
    select je.id,je.posted_at occurred_at,
      case
        when je.source_type in ('CustomerReceipt','CustomerReceiptReversal') then coalesce(r.reference,je.source_id)
        when je.source_type in ('Payment','PaymentAllocation','PaymentReversal')
          then coalesce(max(p.reference),max(jl.meta->>'orderCode'),je.source_id)
        else coalesce(max(jl.meta->>'orderCode'),je.source_id) end entry_reference,
      case je.source_type when 'CreditSale' then 'Credit sale' when 'CustomerReceipt' then 'Payment received'
        when 'CustomerReceiptReversal' then 'Payment reversed' when 'CustomerDepositRefund' then 'Downpayment refunded'
        when 'Payment' then 'Payment received' when 'PaymentAllocation' then 'Payment received'
        when 'PaymentReversal' then 'Reversed payment' when 'OrderReversal' then 'Voided sale'
        when 'BalanceAdjustment' then coalesce(je.memo,'Balance adjustment')
        else coalesce(je.memo,initcap(regexp_replace(je.source_type,'([a-z])([A-Z])','\1 \2','g'))) end entry_description,
      sum(jl.debit)::bigint entry_debit,sum(jl.credit)::bigint entry_credit,
      lower(regexp_replace(je.source_type,'([a-z])([A-Z])','\1_\2','g')) activity_kind,
      r.id receipt_id,
      case when r.id is null then '{}'::jsonb else public.customer_receipt_result(r.id) end details
    from public.ledger_journal_entries je join public.ledger_journal_lines jl on jl.entry_id=je.id
    join public.ledger_accounts la on la.id=jl.account_id
    left join public.customer_receipts r on r.company_id=je.company_id and
      ((je.source_type='CustomerReceipt' and je.source_id=r.id::text) or
       (je.source_type='CustomerReceiptReversal' and je.source_id=r.id::text||'-reversal'))
    left join public.payments p on p.company_id=je.company_id
      and je.source_type in ('Payment','PaymentAllocation','PaymentReversal')
      and p.id::text=regexp_replace(je.source_id,'-reversal$','')
    where je.company_id=v_company_id and la.code in ('ACCOUNTS_RECEIVABLE','CUSTOMER_DEPOSITS')
      and ((la.code='ACCOUNTS_RECEIVABLE' and jl.customer_id=p_customer_id)
        or (la.code='CUSTOMER_DEPOSITS' and jl.meta @> jsonb_build_object('customerId',p_customer_id)))
    group by je.id,r.id,r.reference
    having sum(jl.debit-jl.credit)<>0
  ), page_source as materialized (
    select e.* from entries e where p_before_date is null or (e.occurred_at,e.id)<(p_before_date,p_before_id)
    order by e.occurred_at desc,e.id desc limit v_limit+1
  ), numbered as (
    select p.*,row_number() over(order by p.occurred_at desc,p.id desc) row_no,
      count(*) over()>v_limit page_has_more from page_source p
  ), visible as (select * from numbered where row_no<=v_limit), newest as (
    select v.occurred_at,v.id from visible v order by v.occurred_at desc,v.id desc limit 1
  ), anchor as (
    select coalesce(sum(e.entry_debit-e.entry_credit),0)::bigint opening_balance
    from entries e cross join newest n where (e.occurred_at,e.id)<=(n.occurred_at,n.id)
  )
  select v.id,v.occurred_at,v.entry_reference,v.entry_description,v.entry_debit,v.entry_credit,
    (a.opening_balance-coalesce(sum(v.entry_debit-v.entry_credit) over(order by v.occurred_at desc,v.id desc
      rows between unbounded preceding and 1 preceding),0))::bigint,
    v.activity_kind,v.receipt_id,v.details,v.page_has_more
  from visible v cross join anchor a order by v.occurred_at desc,v.id desc;
end; $function$;

CREATE OR REPLACE FUNCTION public.public_customer_statement(p_token text, p_before_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_link record;v_result jsonb;v_id uuid;
  v_limit integer:=least(greatest(coalesce(p_limit,25),1),100);
  v_generated_at timestamptz:=clock_timestamp();
begin
  if (p_before_date is null)<>(p_before_id is null) then raise exception 'invalid_statement_cursor'; end if;
  if p_before_date is null then
    update public.customer_statement_links set open_count=open_count+1,
      first_opened_at=coalesce(first_opened_at,now()),last_opened_at=now()
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      and revoked_at is null and expires_at>now() returning id into v_id;
  else
    select id into v_id from public.customer_statement_links
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      and revoked_at is null and expires_at>now();
  end if;
  if v_id is null then return null; end if;
  select l.*,c.first_name,co.name store_name,co.logo_path,co.public_whatsapp_number,
    co.business_timezone,
    co.customer_payment_instructions into v_link
  from public.customer_statement_links l join public.customers c on c.id=l.customer_id
  join public.companies co on co.id=l.company_id where l.id=v_id;
  with account_total as materialized (
    select coalesce(sum(jl.debit-jl.credit),0)::bigint net
    from public.ledger_journal_entries je
    join public.ledger_journal_lines jl on jl.entry_id=je.id
    join public.ledger_accounts a on a.id=jl.account_id
    where je.company_id=v_link.company_id
      and a.code in ('ACCOUNTS_RECEIVABLE','CUSTOMER_DEPOSITS')
      and ((a.code='ACCOUNTS_RECEIVABLE' and jl.customer_id=v_link.customer_id)
        or (a.code='CUSTOMER_DEPOSITS' and jl.meta @> jsonb_build_object('customerId',v_link.customer_id)))
  ), order_receivables as materialized (
    select jl.order_id,sum(jl.debit-jl.credit)::bigint balance
    from public.ledger_journal_lines jl
    join public.ledger_accounts a on a.id=jl.account_id
    where jl.company_id=v_link.company_id and jl.order_id is not null
      and a.code='ACCOUNTS_RECEIVABLE'
      and jl.customer_id=v_link.customer_id
    group by jl.order_id
  ), balances as (
    select o.code,(o.completed_at at time zone v_link.business_timezone)::date sale_date,
      o.credit_due_at,
      greatest(coalesce(ar.balance,0),0)::bigint balance
    from public.orders o
    left join order_receivables ar on ar.order_id=o.id
    where o.company_id=v_link.company_id and o.customer_id=v_link.customer_id
      and o.receivable_kind in ('credit','cod') and o.status='completed'
  ), entries as materialized (
    select je.id,je.posted_at occurred_at,
      case when je.source_type in ('CustomerReceipt','CustomerReceiptReversal')
          then coalesce(max(r.reference),je.source_id)
        when je.source_type in ('Payment','PaymentAllocation','PaymentReversal')
          then coalesce(max(p.reference),max(jl.meta->>'orderCode'),je.source_id)
        else coalesce(max(jl.meta->>'orderCode'),je.source_id) end reference,
      case je.source_type when 'CreditSale' then 'Credit sale'
        when 'CustomerReceipt' then 'Payment received'
        when 'CustomerReceiptReversal' then 'Payment reversed'
        when 'CustomerDepositRefund' then 'Downpayment refunded'
        when 'Payment' then 'Payment received' when 'PaymentAllocation' then 'Payment received'
        when 'PaymentReversal' then 'Reversed payment' when 'OrderReversal' then 'Voided sale'
        when 'BalanceAdjustment' then coalesce(je.memo,'Balance adjustment')
        else coalesce(je.memo,initcap(regexp_replace(je.source_type,'([a-z])([A-Z])','\1 \2','g'))) end description,
      sum(jl.debit)::bigint debit,sum(jl.credit)::bigint credit,
      lower(regexp_replace(je.source_type,'([a-z])([A-Z])','\1_\2','g')) kind
    from public.ledger_journal_entries je join public.ledger_journal_lines jl on jl.entry_id=je.id
    join public.ledger_accounts a on a.id=jl.account_id
    left join public.customer_receipts r on r.company_id=je.company_id and
      ((je.source_type='CustomerReceipt' and je.source_id=r.id::text) or
       (je.source_type='CustomerReceiptReversal' and je.source_id=r.id::text||'-reversal'))
    left join public.payments p on p.company_id=je.company_id
      and je.source_type in ('Payment','PaymentAllocation','PaymentReversal')
      and p.id::text=regexp_replace(je.source_id,'-reversal$','')
    where je.company_id=v_link.company_id and a.code in ('ACCOUNTS_RECEIVABLE','CUSTOMER_DEPOSITS')
      and ((a.code='ACCOUNTS_RECEIVABLE' and jl.customer_id=v_link.customer_id)
        or (a.code='CUSTOMER_DEPOSITS' and jl.meta @> jsonb_build_object('customerId',v_link.customer_id)))
    group by je.id having sum(jl.debit-jl.credit)<>0
  ), page_source as materialized (
    select e.* from entries e where p_before_date is null
      or (e.occurred_at,e.id)<(p_before_date,p_before_id)
    order by e.occurred_at desc,e.id desc limit v_limit+1
  ), numbered as (
    select p.*,row_number() over(order by p.occurred_at desc,p.id desc) row_no,
      count(*) over()>v_limit page_has_more from page_source p
  ), visible as (
    select * from numbered where row_no<=v_limit
  ), newest as (
    select occurred_at,id from visible order by occurred_at desc,id desc limit 1
  ), anchor as (
    select coalesce(sum(e.debit-e.credit),0)::bigint opening_balance
    from entries e cross join newest n where (e.occurred_at,e.id)<=(n.occurred_at,n.id)
  ), activities as (
    select v.id,v.occurred_at,v.kind,v.reference,v.description,v.debit,v.credit,
      (a.opening_balance-coalesce(sum(v.debit-v.credit) over(order by v.occurred_at desc,v.id desc
        rows between unbounded preceding and 1 preceding),0))::bigint balance,v.page_has_more
    from visible v cross join anchor a order by v.occurred_at desc,v.id desc
  )
  select jsonb_build_object('store_name',v_link.store_name,'logo_path',v_link.logo_path,
    'whatsapp_number',v_link.public_whatsapp_number,'payment_instructions',v_link.customer_payment_instructions,
    'customer_first_name',v_link.first_name,'generated_at',v_generated_at,'expires_at',v_link.expires_at,
    'account_balance',account_total.net,'amount_due',greatest(account_total.net,0),
    'downpayment_available',greatest(-account_total.net,0),
    'outstanding_total',greatest(account_total.net,0),
    'orders',coalesce((select jsonb_agg(jsonb_build_object('code',code,'sale_date',sale_date,
      'due_date',credit_due_at,'balance',balance) order by credit_due_at) from balances where balance>0),'[]'::jsonb),
    'activities',coalesce((select jsonb_agg(jsonb_build_object('id',id,'date',occurred_at,
      'kind',kind,'description',description,'reference',reference,'debit',debit,'credit',credit,
      'balance',balance,'amount',abs(debit-credit),
      'direction',case when debit-credit>0 then 'charge' else 'payment' end)
      order by occurred_at desc,id desc) from activities),'[]'::jsonb),
    'activity_has_more',coalesce((select bool_or(page_has_more) from activities),false))
  into v_result from account_total;
  return v_result;
end; $function$;

CREATE OR REPLACE FUNCTION public.customer_statement_message_context(p_customer_id uuid, p_channel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid:=public.current_company_id();v_company public.companies%rowtype;
  v_customer public.customers%rowtype;v_net bigint:=0;v_activity_count integer:=0;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials')
    or not public.current_user_has_permission('ManageCommunications') then
    raise exception 'permission_denied: ViewFinancials and ManageCommunications required';
  end if;
  if p_channel not in ('sms','whatsapp') then raise exception 'invalid_channel'; end if;
  if not public.external_messaging_allowed(v_company_id,false) then
    raise exception 'external_messaging_disabled'; end if;
  select * into v_company from public.companies where id=v_company_id;
  select * into v_customer from public.customers
  where id=p_customer_id and company_id=v_company_id and not is_supplier;
  if not found then raise exception 'customer_not_found'; end if;
  if nullif(trim(v_customer.phone),'') is null then raise exception 'recipient_has_no_phone'; end if;
  if not v_customer.notifications_enabled
    or (p_channel='sms' and not v_customer.sms_notifications_enabled)
    or (p_channel='whatsapp' and not v_customer.whatsapp_notifications_enabled) then
    raise exception 'recipient_opted_out';
  end if;
  select count(*)::integer,coalesce(sum(jl.debit-jl.credit),0)::bigint
  into v_activity_count,v_net
  from public.ledger_journal_entries je
  join public.ledger_journal_lines jl on jl.entry_id=je.id
  join public.ledger_accounts a on a.id=jl.account_id
  where je.company_id=v_company_id and a.code in ('ACCOUNTS_RECEIVABLE','CUSTOMER_DEPOSITS')
    and ((a.code='ACCOUNTS_RECEIVABLE' and jl.customer_id=p_customer_id)
        or (a.code='CUSTOMER_DEPOSITS' and jl.meta @> jsonb_build_object('customerId',p_customer_id)));
  if v_activity_count=0 then raise exception 'statement_has_no_activity'; end if;
  return jsonb_build_object(
    'company_id',v_company_id,'company_name',v_company.name,'customer_id',v_customer.id,
    'party_name',trim(v_customer.first_name||' '||coalesce(v_customer.last_name,'')),
    'recipient',v_customer.phone,'channel',p_channel,'account_balance',v_net,
    'account_summary',case when v_net>0 then 'Balance due: KES '||to_char(v_net,'FM999G999G999')
      when v_net<0 then 'Downpayment available: KES '||to_char(abs(v_net),'FM999G999G999')
      else 'Account settled.' end);
end; $function$;

CREATE OR REPLACE FUNCTION public.credit_health_dashboard(p_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_days integer := least(greatest(coalesce(p_days, 90), 30), 365);
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;

  with
  ar_party_balances as (
    select
      c.id party_id,
      concat_ws(' ', c.first_name, c.last_name) party_name,
      c.credit_limit,
      c.is_credit_approved,
      coalesce(sum(l.debit) - sum(l.credit), 0)::bigint balance
    from public.customers c
    left join (
      select l.* from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      where a.code = 'ACCOUNTS_RECEIVABLE'
    ) l on l.company_id = c.company_id and l.customer_id = c.id
    where c.company_id = v_company_id and not c.is_supplier
    group by c.id, c.first_name, c.last_name, c.credit_limit, c.is_credit_approved
  ),
  ap_party_balances as (
    select
      c.id party_id,
      concat_ws(' ', c.first_name, c.last_name) party_name,
      c.supplier_credit_limit credit_limit,
      coalesce(sum(l.credit) - sum(l.debit), 0)::bigint balance
    from public.customers c
    left join (
      select l.* from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      where a.code = 'ACCOUNTS_PAYABLE'
    ) l on l.company_id = c.company_id and l.meta ->> 'supplierId' = c.id::text
    where c.company_id = v_company_id and c.is_supplier
    group by c.id, c.first_name, c.last_name, c.supplier_credit_limit
  ),
  ar_documents as (
    select
      o.customer_id party_id,
      o.id document_id,
      o.code reference,
      coalesce(o.credit_due_at, min(e.entry_date)) due_date,
      (sum(l.debit) - sum(l.credit))::bigint balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id and a.code = 'ACCOUNTS_RECEIVABLE'
    join public.ledger_journal_entries e on e.id = l.entry_id and e.finalized_at is not null
    join public.orders o on o.id = l.order_id and o.company_id = l.company_id
    where l.company_id = v_company_id and l.order_id is not null
    group by o.customer_id, o.id, o.code, o.credit_due_at
    having sum(l.debit) - sum(l.credit) > 0
  ),
  ap_documents as (
    select
      p.supplier_id party_id,
      p.id document_id,
      coalesce(p.reference, 'Purchase ' || left(p.id::text, 8)) reference,
      coalesce(p.credit_due_at, p.purchase_date) due_date,
      (sum(l.credit) - sum(l.debit))::bigint balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id and a.code = 'ACCOUNTS_PAYABLE'
    join public.ledger_journal_entries e on e.id = l.entry_id and e.finalized_at is not null
    join public.purchases p
      on p.id::text = l.meta ->> 'purchaseId' and p.company_id = l.company_id
    where l.company_id = v_company_id and l.meta ? 'purchaseId'
    group by p.supplier_id, p.id, p.reference, p.credit_due_at, p.purchase_date
    having sum(l.credit) - sum(l.debit) > 0
  ),
  totals as (
    select
      coalesce((select sum(greatest(balance, 0)) from ar_party_balances), 0)::bigint receivables,
      coalesce((select sum(greatest(balance, 0)) from ap_party_balances), 0)::bigint payables,
      coalesce((select sum(balance) from ar_documents where due_date < v_today), 0)::bigint overdue_receivables,
      coalesce((select sum(balance) from ar_documents where due_date < v_today - 60), 0)::bigint severe_receivables,
      coalesce((select sum(balance) from ap_documents where due_date <= v_today + 7), 0)::bigint payables_due_soon,
      (select count(*)::integer from ar_party_balances
        where credit_limit > 0 and balance > credit_limit) over_limit_parties,
      coalesce((select sum(balance) from ar_documents), 0)::bigint scheduled_ar,
      coalesce((select sum(balance) from ap_documents), 0)::bigint scheduled_ap
  ),
  document_aging as (
    select 'receivables'::text side,
      case
        when due_date >= v_today then 'current'
        when v_today - due_date <= 30 then '1-30'
        when v_today - due_date <= 60 then '31-60'
        else '60+'
      end bucket,
      sum(balance)::bigint amount,
      count(*)::integer documents
    from ar_documents group by 1, 2
    union all
    select 'payables'::text side,
      case
        when due_date >= v_today then 'current'
        when v_today - due_date <= 30 then '1-30'
        when v_today - due_date <= 60 then '31-60'
        else '60+'
      end bucket,
      sum(balance)::bigint amount,
      count(*)::integer documents
    from ap_documents group by 1, 2
  ),
  aging_seed(side, bucket, bucket_order) as (
    values
      ('receivables'::text, 'current'::text, 1),
      ('receivables', '1-30', 2),
      ('receivables', '31-60', 3),
      ('receivables', '60+', 4),
      ('receivables', 'unscheduled', 5),
      ('payables', 'current', 1),
      ('payables', '1-30', 2),
      ('payables', '31-60', 3),
      ('payables', '60+', 4),
      ('payables', 'unscheduled', 5)
  ),
  aging as (
    select s.side, s.bucket, s.bucket_order,
      case
        when s.bucket = 'unscheduled' and s.side = 'receivables'
          then greatest(t.receivables - t.scheduled_ar, 0)
        when s.bucket = 'unscheduled' and s.side = 'payables'
          then greatest(t.payables - t.scheduled_ap, 0)
        else coalesce(d.amount, 0)
      end::bigint amount,
      coalesce(d.documents, 0)::integer documents
    from aging_seed s cross join totals t
    left join document_aging d on d.side = s.side and d.bucket = s.bucket
  ),
  utilization_raw as (
    select
      case
        when balance > credit_limit then 'over_limit'
        when balance * 100 < credit_limit * 50 then 'under_50'
        when balance * 100 < credit_limit * 80 then '50_80'
        else '80_100'
      end bucket,
      count(*)::integer parties,
      sum(greatest(balance, 0))::bigint amount
    from ar_party_balances
    where credit_limit > 0 and (is_credit_approved or balance > 0)
    group by 1
  ),
  utilization_seed(bucket, bucket_order) as (
    values ('under_50'::text, 1), ('50_80', 2), ('80_100', 3), ('over_limit', 4)
  ),
  utilization as (
    select s.bucket, s.bucket_order, coalesce(u.parties, 0)::integer parties,
      coalesce(u.amount, 0)::bigint amount
    from utilization_seed s left join utilization_raw u using (bucket)
  ),
  concentration_ranked as (
    select party_id, party_name, greatest(balance, 0)::bigint amount,
      row_number() over(order by greatest(balance, 0) desc, party_name) rank
    from ar_party_balances where balance > 0
  ),
  concentration as (
    select r.party_id, r.party_name, r.amount, r.rank,
      case when t.receivables > 0 then round(r.amount * 100.0 / t.receivables, 1) else 0 end share
    from concentration_ranked r cross join totals t where r.rank <= 5
  ),
  ar_document_summary as (
    select party_id, min(due_date) oldest_due_date,
      max(greatest(v_today - due_date, 0))::integer days_overdue,
      sum(balance) filter(where due_date < v_today)::bigint overdue_amount
    from ar_documents group by party_id
  ),
  collect_candidates as (
    select b.party_id, b.party_name, greatest(b.balance, 0)::bigint outstanding,
      b.credit_limit, s.oldest_due_date, coalesce(s.days_overdue, 0) days_overdue,
      coalesce(s.overdue_amount, 0)::bigint overdue_amount,
      case
        when not b.is_credit_approved then 'Credit frozen'
        when b.credit_limit > 0 and b.balance > b.credit_limit then 'Over limit'
        when coalesce(s.days_overdue, 0) > 60 then '60+ days overdue'
        else 'Overdue'
      end reason
    from ar_party_balances b left join ar_document_summary s using (party_id)
    where b.balance > 0 and (
      not b.is_credit_approved
      or (b.credit_limit > 0 and b.balance > b.credit_limit)
      or coalesce(s.days_overdue, 0) > 0
    )
    order by coalesce(s.days_overdue, 0) desc, b.balance desc, b.party_name
    limit 8
  ),
  ap_document_summary as (
    select party_id, min(due_date) next_due_date,
      max(greatest(v_today - due_date, 0))::integer days_overdue,
      sum(balance) filter(where due_date <= v_today + 30)::bigint due_amount
    from ap_documents group by party_id
  ),
  pay_candidates as (
    select b.party_id, b.party_name, greatest(b.balance, 0)::bigint outstanding,
      coalesce(s.due_amount, 0)::bigint due_amount, s.next_due_date,
      coalesce(s.days_overdue, 0) days_overdue
    from ap_party_balances b left join ap_document_summary s using (party_id)
    where b.balance > 0 and (s.next_due_date <= v_today + 30 or s.next_due_date is null)
    order by s.next_due_date nulls last, b.balance desc, b.party_name
    limit 8
  ),
  trend_start as (
    select v_today - (v_days - 1) start_date
  ),
  daily_movements as (
    select e.entry_date trend_day,
      sum(case when a.code = 'ACCOUNTS_RECEIVABLE' then l.debit - l.credit else 0 end)::bigint ar_delta,
      sum(case when a.code = 'ACCOUNTS_PAYABLE' then l.credit - l.debit else 0 end)::bigint ap_delta
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id and e.finalized_at is not null
    cross join trend_start s
    where l.company_id = v_company_id
      and a.code in ('ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE')
      and e.entry_date >= s.start_date
      and e.entry_date <= v_today
    group by e.entry_date
  ),
  opening as (
    select
      coalesce(sum(case when a.code = 'ACCOUNTS_RECEIVABLE' then l.debit - l.credit else 0 end), 0)::bigint ar,
      coalesce(sum(case when a.code = 'ACCOUNTS_PAYABLE' then l.credit - l.debit else 0 end), 0)::bigint ap
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id and e.finalized_at is not null
    cross join trend_start s
    where l.company_id = v_company_id
      and a.code in ('ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE')
      and e.entry_date < s.start_date
  ),
  trend_days as (
    select generate_series(s.start_date, v_today, interval '1 day')::date trend_day
    from trend_start s
  ),
  trend as (
    select d.trend_day,
      greatest(o.ar + sum(coalesce(m.ar_delta, 0)) over(order by d.trend_day), 0)::bigint receivables,
      greatest(o.ap + sum(coalesce(m.ap_delta, 0)) over(order by d.trend_day), 0)::bigint payables
    from trend_days d cross join opening o left join daily_movements m using (trend_day)
  )
  select jsonb_build_object(
    'generated_at', now(),
    'metrics', jsonb_build_object(
      'receivables', t.receivables,
      'payables', t.payables,
      'overdue_receivables', t.overdue_receivables,
      'severe_receivables', t.severe_receivables,
      'payables_due_soon', t.payables_due_soon,
      'over_limit_parties', t.over_limit_parties,
      'top_five_concentration', coalesce((select sum(share) from concentration), 0)
    ),
    'aging', coalesce((select jsonb_agg(jsonb_build_object(
      'side', side, 'bucket', bucket, 'amount', amount, 'documents', documents
    ) order by side, bucket_order) from aging), '[]'::jsonb),
    'utilization', coalesce((select jsonb_agg(jsonb_build_object(
      'bucket', bucket, 'parties', parties, 'amount', amount
    ) order by bucket_order) from utilization), '[]'::jsonb),
    'concentration', coalesce((select jsonb_agg(jsonb_build_object(
      'party_id', party_id, 'party_name', party_name, 'amount', amount, 'share', share
    ) order by rank) from concentration), '[]'::jsonb),
    'collect_now', coalesce((select jsonb_agg(to_jsonb(c) order by c.days_overdue desc, c.outstanding desc)
      from collect_candidates c), '[]'::jsonb),
    'pay_soon', coalesce((select jsonb_agg(to_jsonb(p) order by p.next_due_date nulls last, p.outstanding desc)
      from pay_candidates p), '[]'::jsonb),
    'trend', coalesce((select jsonb_agg(jsonb_build_object(
      'day', trend_day, 'receivables', receivables, 'payables', payables
    ) order by trend_day) from trend), '[]'::jsonb)
  ) into v_result
  from totals t;

  return v_result;
end;
$function$;

-- Credit limits cannot be bypassed by omitting descriptive JSON metadata.
CREATE OR REPLACE FUNCTION public.enforce_credit_serialization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account_code text;v_source_type text;v_source_id text;v_party_id uuid;
  v_party record;v_balance bigint;v_order_balance bigint;
  v_order_debits bigint;v_order_credits bigint;v_residual bigint;
begin
  if current_setting('app.bypass_business_limits',true)='on' then return new; end if;
  select a.code into v_account_code from public.ledger_accounts a
  where a.id=new.account_id and a.company_id=new.company_id;
  if v_account_code not in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE') then return new; end if;
  select e.source_type,e.source_id into v_source_type,v_source_id
  from public.ledger_journal_entries e where e.id=new.entry_id;

  if v_account_code='ACCOUNTS_RECEIVABLE' then
    v_party_id:=new.customer_id;
    if v_party_id is null then return new; end if;
    select * into v_party from public.customers c where c.id=v_party_id
      and c.company_id=new.company_id and not c.is_supplier for update;
    if v_party is null then raise exception 'customer_not_found'; end if;
    if v_source_type='CodReceivable' and new.debit>0 then
      if not exists(
        select 1 from public.orders o
        join public.order_fulfillments f on f.order_id=o.id and f.company_id=o.company_id
        where o.id=new.order_id and o.company_id=new.company_id
          and o.receivable_kind='cod' and f.collection_kind='cod'
          and f.status='ready' and v_source_id=o.id::text
      ) then raise exception 'invalid_cod_receivable_posting'; end if;
    elsif v_source_type='CreditSale' and new.debit>0 then
      if not exists(select 1 from public.orders o where o.id=new.order_id
        and o.company_id=new.company_id and o.receivable_kind='credit')
      then raise exception 'invalid_credit_receivable_posting'; end if;
      v_residual:=coalesce(nullif(current_setting('app.sale_residual_credit_amount',true),'')::bigint,
        new.debit);
      if v_residual>0 and not v_party.is_credit_approved then
        raise exception 'credit_not_approved: customer %',v_party_id; end if;
      v_balance:=public.customer_credit_exposure(new.company_id,v_party_id);
      if v_party.credit_limit>0 and v_balance+v_residual>v_party.credit_limit
        and not exists(select 1 from public.approvals ap where ap.company_id=new.company_id
          and ap.type='overdraft' and (ap.status='approved' or (ap.status='pending'
            and coalesce(current_setting('app.approved_credit_order_id',true),'')=v_source_id))
          and ap.metadata->>'order_id'=v_source_id) then
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_balance,new.debit,v_party.credit_limit;
      end if;
    elsif v_source_type in('PaymentAllocation','Payment') and new.credit>0 then
      select coalesce(sum(l.debit),0)::bigint,coalesce(sum(l.credit),0)::bigint
      into v_order_debits,v_order_credits from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id=l.account_id
      where l.company_id=new.company_id and a.code='ACCOUNTS_RECEIVABLE'
        and l.order_id=new.order_id;
      v_order_balance:=v_order_debits-v_order_credits;
      if new.credit>v_order_balance then
        raise exception 'ar_overpayment: order % AR credits % exceed debits %',
          new.order_id,v_order_credits+new.credit,v_order_debits;
      end if;
    end if;
  else
    v_party_id:=nullif(new.meta->>'supplierId','')::uuid;
    if v_party_id is null then return new; end if;
    select * into v_party from public.customers c where c.id=v_party_id
      and c.company_id=new.company_id and c.is_supplier for update;
    if v_party is null then raise exception 'supplier_not_found'; end if;
    select coalesce(sum(l.credit)-sum(l.debit),0)::bigint into v_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=new.company_id and a.code='ACCOUNTS_PAYABLE'
      and l.meta->>'supplierId'=v_party_id::text;
    if v_source_type='InventoryPurchase' and new.credit>0 then
      v_residual:=new.credit
        -coalesce(nullif(new.meta->>'projectedInitialPayment','')::bigint,0)
        -coalesce(nullif(new.meta->>'projectedAdvance','')::bigint,0);
      if v_party.supplier_credit_limit>0
        and v_balance+greatest(v_residual,0)>v_party.supplier_credit_limit then
        raise exception 'supplier_credit_limit_exceeded: balance % + % > limit %',
          v_balance,greatest(v_residual,0),v_party.supplier_credit_limit;
      end if;
    elsif v_source_type='SupplierPayment' and new.debit>0 and new.debit>v_balance then
      raise exception 'ap_overpayment: supplier balance is %',v_balance;
    end if;
  end if;
  return new;
end;
$function$;

-- Lock the account/customer before orders, applications, payments, or their FK locks.
CREATE OR REPLACE FUNCTION public.post_payment_allocation(p_order_id uuid, p_amount bigint, p_method_code text, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_order record;
  v_account_code text;
  v_payment_id uuid;
  v_ar_debits bigint;
  v_ar_credits bigint;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  perform public.lock_receivable_order_customer(p_order_id);
  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  select coalesce(pm.ledger_account_code, 'CLEARING_GENERIC') into v_account_code
  from public.payment_methods pm
  where pm.company_id = v_company_id and pm.code = p_method_code;

  insert into public.payments (company_id, order_id, method_code, amount, reference)
  values (v_company_id, p_order_id, p_method_code, p_amount, p_reference)
  returning id into v_payment_id;

  perform public.post_journal_entry(
    v_company_id, 'PaymentAllocation', v_payment_id::text,
    'Credit repayment for order ' || v_order.code,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', coalesce(v_account_code, 'CLEARING_GENERIC'), 'debit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object(
          'orderCode', v_order.code, 'customerId', v_order.customer_id,
          'method', p_method_code, 'reference', p_reference
        )
      ),
      jsonb_build_object(
        'account_code', 'ACCOUNTS_RECEIVABLE', 'credit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      )
    )
  );

  -- Per-order AR invariant (same transaction, so this allocation is visible).
  select coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
    into v_ar_debits, v_ar_credits
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where l.company_id = v_company_id
    and a.code = 'ACCOUNTS_RECEIVABLE'
    and l.order_id = p_order_id;

  if v_ar_debits = 0 then
    raise exception 'ar_allocation_without_debt: order % has no AR balance', p_order_id;
  end if;

  if v_ar_credits > v_ar_debits then
    raise exception 'ar_overpayment: order % AR credits % exceed debits %', p_order_id, v_ar_credits, v_ar_debits;
  end if;

  return v_payment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_customer_deposit(p_order_id uuid, p_amount bigint, p_client_ref text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid:=public.current_company_id(); v_order public.orders%rowtype; v_id uuid;
  v_due bigint; v_remaining bigint:=p_amount; v_available bigint; v_take bigint; v_source record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if p_client_ref is not null then
    select id into v_id from public.customer_deposit_applications
    where company_id=v_company_id and client_ref=p_client_ref;
    if v_id is not null then return v_id; end if;
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  perform public.lock_receivable_order_customer(p_order_id);
  -- Recheck idempotency after waiting for another application on this account.
  if p_client_ref is not null then
    select id into v_id from public.customer_deposit_applications
    where company_id=v_company_id and client_ref=p_client_ref;
    if v_id is not null then return v_id; end if;
  end if;
  select * into v_order from public.orders
  where id=p_order_id and company_id=v_company_id for update;
  if v_order.id is null or v_order.status<>'completed' or v_order.customer_id is null then
    raise exception 'settleable_customer_order_not_found'; end if;
  v_due:=public.order_open_balance_core(p_order_id);
  if p_amount>v_due then raise exception 'ar_overpayment: % exceeds outstanding %',p_amount,v_due; end if;
  perform 1 from public.customer_deposits d
  where d.company_id=v_company_id and d.customer_id=v_order.customer_id and d.status='active'
  order by d.created_at,d.id for update;
  select coalesce(sum(b.available),0)::bigint into v_available
  from public.customer_deposit_source_balances b
  where b.company_id=v_company_id and b.customer_id=v_order.customer_id;
  if p_amount>v_available then raise exception 'insufficient_customer_deposit: % available',v_available; end if;
  insert into public.customer_deposit_applications(company_id,customer_id,order_id,amount,client_ref,created_by)
  values(v_company_id,v_order.customer_id,p_order_id,p_amount,nullif(btrim(p_client_ref),''),auth.uid()) returning id into v_id;
  for v_source in
    select b.* from public.customer_deposit_source_balances b
    where b.company_id=v_company_id and b.customer_id=v_order.customer_id and b.available>0
    order by b.created_at,b.id
  loop
    exit when v_remaining=0; v_take:=least(v_remaining,v_source.available); v_remaining:=v_remaining-v_take;
    insert into public.customer_deposit_allocations(company_id,application_id,deposit_id,amount)
    values(v_company_id,v_id,v_source.id,v_take);
  end loop;
  insert into public.payments(company_id,order_id,method_code,amount,status,location_id,
    settlement_kind,customer_deposit_application_id)
  values(v_company_id,p_order_id,'customer_deposit',p_amount,'settled',v_order.location_id,
    'customer_deposit',v_id);
  perform public.post_journal_entry(v_company_id,'CustomerDepositApplication',v_id::text,
    'Apply customer deposit to '||v_order.code,jsonb_build_array(
      jsonb_build_object('account_code','CUSTOMER_DEPOSITS','debit',p_amount,'order_id',p_order_id,
        'meta',jsonb_build_object('customerId',v_order.customer_id,'orderCode',v_order.code)),
      jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',p_amount,'order_id',p_order_id,
        'meta',jsonb_build_object('customerId',v_order.customer_id,'orderCode',v_order.code))));
  return v_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.execute_payment_reversal(p_payment_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_payment public.payments%rowtype;
  v_entry record;
  v_existing uuid;
  v_reversal_id uuid;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_line record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  perform public.lock_receivable_order_customer(p.order_id)
  from public.payments p where p.id=p_payment_id and p.company_id=v_company_id;
  select * into v_payment from public.payments
  where id = p_payment_id and company_id = v_company_id for update;
  if v_payment.id is null then raise exception 'payment_not_found: %', p_payment_id; end if;

  select id into v_existing from public.ledger_journal_entries
  where company_id = v_company_id and source_type = 'PaymentReversal'
    and source_id = p_payment_id::text || '-reversal';
  if v_existing is not null then
    update public.payments set status = 'cancelled'
    where id = p_payment_id and company_id = v_company_id;
    return v_existing;
  end if;
  if v_payment.status <> 'settled' then raise exception 'payment_not_settled'; end if;

  select * into v_entry from public.ledger_journal_entries
  where company_id = v_company_id
    and source_type in ('Payment', 'PaymentAllocation')
    and source_id = p_payment_id::text;
  if v_entry is null then raise exception 'original_entry_not_found: %', p_payment_id; end if;

  for v_line in
    select l.*, a.code as account_code
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = v_entry.id
  loop
    v_reversal_lines := v_reversal_lines || jsonb_build_object(
      'account_code', v_line.account_code,
      'debit', v_line.credit,
      'credit', v_line.debit,
      'order_id', v_line.order_id,
      'meta', v_line.meta
    );
  end loop;

  v_reversal_id := public.post_reversal_entry(
    v_company_id, 'PaymentReversal', p_payment_id::text || '-reversal',
    'Payment reversal ' || p_payment_id::text || ': ' || p_reason,
    v_reversal_lines, v_entry.id
  );
  update public.payments set status = 'cancelled'
  where id = p_payment_id and company_id = v_company_id;
  return v_reversal_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_customer_deposit_application(p_application_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company_id uuid:=public.current_company_id(); v_app public.customer_deposit_applications%rowtype;
  v_order public.orders%rowtype;
begin
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  perform public.lock_receivable_order_customer(a.order_id)
  from public.customer_deposit_applications a
  where a.id=p_application_id and a.company_id=v_company_id;
  select * into v_app from public.customer_deposit_applications
  where id=p_application_id and company_id=v_company_id for update;
  if v_app.id is null then raise exception 'customer_deposit_application_not_found'; end if;
  if v_app.status='reversed' then return v_app.id; end if;
  select * into v_order from public.orders where id=v_app.order_id and company_id=v_company_id for update;
  if v_order.status='voided' then raise exception 'application_already_restored_by_void'; end if;
  update public.customer_deposit_applications set status='reversed',reversed_by=auth.uid(),
    reversed_at=now(),reversal_reason=btrim(p_reason) where id=v_app.id;
  update public.payments set status='cancelled'
  where customer_deposit_application_id=v_app.id and status='settled';
  perform public.post_journal_entry(v_company_id,'CustomerDepositApplicationReversal',v_app.id::text,
    'Reverse customer deposit application: '||btrim(p_reason),jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','debit',v_app.amount,'order_id',v_app.order_id,
        'meta',jsonb_build_object('customerId',v_app.customer_id,'reason',btrim(p_reason))),
      jsonb_build_object('account_code','CUSTOMER_DEPOSITS','credit',v_app.amount,'order_id',v_app.order_id,
        'meta',jsonb_build_object('customerId',v_app.customer_id,'reason',btrim(p_reason)))));
  return v_app.id;
end; $function$;

-- Nested checkout and approval entry points must acquire that lock before their own order/payment locks.
CREATE OR REPLACE FUNCTION public.complete_order_with_prepayment_core(p_order_id uuid, p_payments jsonb, p_deposit_amount bigint, p_credit_amount bigint, p_client_ref text, p_context posting_context)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid:=(p_context).company_id;v_order public.orders%rowtype;v_payment jsonb;
  v_tender_total bigint:=0;v_amount bigint;v_payment_id uuid;v_account_code text;
  v_method record;
begin
  if v_company_id is null or (p_context).source not in('interactive','approval') then
    raise exception 'invalid_posting_context'; end if;
  if coalesce(p_deposit_amount,0)<0 or coalesce(p_credit_amount,0)<0 then
    raise exception 'invalid_settlement_amount'; end if;
  perform public.lock_receivable_order_customer(p_order_id);
  select * into v_order from public.orders
  where id=p_order_id and company_id=v_company_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.status='completed' then return v_order.id; end if;
  if v_order.location_id is distinct from (p_context).location_id then
    raise exception 'posting_context_location_mismatch'; end if;
  if v_order.status not in('draft','pending_payment') or v_order.customer_id is null then
    raise exception 'identified_customer_required_for_mixed_settlement'; end if;
  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    if v_payment->>'method'='credit' then raise exception 'credit_is_not_a_tender'; end if;
    v_amount:=coalesce((v_payment->>'amount')::bigint,0);
    if v_amount<=0 then raise exception 'invalid_tender_amount'; end if;
    v_tender_total:=v_tender_total+v_amount;
  end loop;
  if v_tender_total+coalesce(p_deposit_amount,0)+coalesce(p_credit_amount,0)<>v_order.total then
    raise exception 'payment_mismatch: tender % + deposit % + credit % <> order total %',
      v_tender_total,p_deposit_amount,p_credit_amount,v_order.total;
  end if;
  if coalesce(p_deposit_amount,0)>public.customer_deposit_available(v_order.customer_id) then
    raise exception 'insufficient_customer_deposit'; end if;
  perform set_config('app.sale_residual_credit_amount',coalesce(p_credit_amount,0)::text,true);
  perform public.complete_order_core(p_order_id,'[]'::jsonb,p_context);
  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    v_amount:=(v_payment->>'amount')::bigint;
    select * into v_method from public.available_payment_methods(v_order.location_id) m
    where m.code=v_payment->>'method';
    if v_method is null then raise exception 'payment_method_not_available: %',v_payment->>'method'; end if;
    if not v_method.is_cashier_controlled and (p_context).source<>'approval'
      and not public.current_user_has_permission('ViewFinancials') then
      raise exception 'approval_required: external_account_payment'; end if;
    v_account_code:=public.resolve_tender_account(v_company_id,v_order.location_id,
      v_payment->>'method',v_payment->>'account_code');
    if v_payment->>'method'='bank' and nullif(btrim(v_payment->>'reference'),'') is null then
      raise exception 'reconciliation_reference_required: bank'; end if;
    insert into public.payments(
      company_id,order_id,method_code,amount,reference,mpesa_receipt,status,location_id,
      settlement_kind,ledger_account_code,cashier_session_id
    ) values(
      v_company_id,p_order_id,v_payment->>'method',v_amount,
      nullif(btrim(v_payment->>'reference'),''),nullif(btrim(v_payment->>'mpesa_receipt'),''),
      'settled',v_order.location_id,'tender',v_account_code,(p_context).cashier_session_id
    ) returning id into v_payment_id;
    perform public.post_journal_entry_with_context(v_company_id,'MixedSaleTender',v_payment_id::text,
      'Tender applied to sale '||v_order.code,jsonb_build_array(
        jsonb_build_object('account_code',v_account_code,'debit',v_amount,'order_id',p_order_id,
          'meta',jsonb_build_object('customerId',v_order.customer_id,'orderCode',v_order.code,
            'method',v_payment->>'method','reference',v_payment->>'reference')),
        jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',v_amount,
          'order_id',p_order_id,'meta',jsonb_build_object('customerId',v_order.customer_id,
            'orderCode',v_order.code))),p_context);
  end loop;
  if coalesce(p_deposit_amount,0)>0 then
    -- Customer-deposit allocation remains its own idempotent domain action.
    perform set_config('app.business_location_id',v_order.location_id::text,true);
    perform public.apply_customer_deposit(p_order_id,p_deposit_amount,
      case when p_client_ref is null then null else p_client_ref||':deposit' end);
  end if;
  return p_order_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_sale_at_location(p_location_id uuid, p_customer_id uuid, p_lines jsonb, p_payments jsonb, p_park boolean DEFAULT false, p_client_ref text DEFAULT NULL::text, p_draft_id uuid DEFAULT NULL::uuid, p_approval_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid:=public.current_company_id();
  v_location_id uuid:=public.resolve_business_location(p_location_id);
  v_external_tenders jsonb;
  v_order_id uuid;
  v_approval_id uuid;
  v_existing_approval public.approvals%rowtype;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_ar_balance bigint;
  v_valid boolean;
  v_is_credit boolean:=not p_park and (
    jsonb_array_length(coalesce(p_payments,'[]'))=0 or
    (jsonb_array_length(coalesce(p_payments,'[]'))=1 and p_payments->0->>'method'='credit'));
  v_reason text:=coalesce(nullif(btrim(p_approval_reason),''),
    'Credit limit exceeded during legacy checkout');
begin
  perform set_config('app.business_location_id',v_location_id::text,true);
  if p_customer_id is not null then
    perform public.lock_customer_account(v_company_id,p_customer_id);
    perform 1 from public.customers where id=p_customer_id and company_id=v_company_id for update;
  end if;

  if not p_park then
    select jsonb_agg(jsonb_build_object('method',t.method,'amount',t.amount,'reference',t.reference))
    into v_external_tenders
    from (select p->>'method' method,(p->>'amount')::bigint amount,p->>'reference' reference
      from jsonb_array_elements(coalesce(p_payments,'[]')) p) t
    left join public.payment_methods pm on pm.company_id=v_company_id and pm.code=t.method
    left join public.location_payment_methods lpm
      on lpm.payment_method_id=pm.id and lpm.location_id=v_location_id
    where t.method<>'credit' and (pm.id is null
      or not coalesce(lpm.is_cashier_controlled,pm.is_cashier_controlled));
  end if;

  if v_external_tenders is not null and p_customer_id is null then
    raise exception 'cashier_controlled_only: walk-in sales require cashier-controlled accounts';
  end if;
  if v_external_tenders is not null and not public.current_user_has_permission('ViewFinancials') then
    perform set_config('app.external_payment_hold','on',true);
    v_order_id:=public.post_sale(p_customer_id,p_lines,'[]',true,p_client_ref,p_draft_id);
    update public.orders set cashier_pending_at=null where id=v_order_id and company_id=v_company_id;
    select * into v_order from public.orders where id=v_order_id and company_id=v_company_id for update;
    select v_order.status='pending_payment' and v_order.customer_id is not null
      and jsonb_typeof(v_external_tenders)='array'
      and jsonb_array_length(v_external_tenders)>0
      and (select coalesce(sum((t->>'amount')::bigint),0)
        from jsonb_array_elements(v_external_tenders) t)=v_order.total
      and not exists(
        select 1 from jsonb_array_elements(v_external_tenders) t
        left join public.payment_methods pm on pm.company_id=v_company_id and pm.code=t->>'method'
        left join public.location_payment_methods lpm
          on lpm.payment_method_id=pm.id and lpm.location_id=v_order.location_id
        where coalesce((t->>'amount')::bigint,0)<=0 or pm.id is null or not pm.enabled
          or (lpm.id is not null and not lpm.enabled)
          or (coalesce(pm.reconciliation_type,'')='statement_match'
            and btrim(coalesce(t->>'reference',''))='')
      ) into v_valid;
    if not coalesce(v_valid,false) then raise exception 'invalid_external_tenders'; end if;
    select * into v_existing_approval from public.approvals where company_id=v_company_id
      and type='external_account_payment' and status='pending'
      and metadata->>'order_id'=v_order_id::text
    order by created_at desc limit 1;
    if v_existing_approval.id is null then
      insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
      values(v_company_id,'external_account_payment','order',v_order_id,
        jsonb_build_object('order_id',v_order_id,'tenders',v_external_tenders),auth.uid())
      returning id into v_approval_id;
    else v_approval_id:=v_existing_approval.id; end if;
    return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
      'order_id',v_order_id,'subject_id',v_order_id);
  end if;

  -- A non-authorizing cashier's credit sale is parked first so all prices and
  -- totals come from the server. It completes immediately when still in limit.
  if v_is_credit and not public.current_user_has_permission('ApproveCustomerCredit') then
    if not public.current_user_has_permission('SettleOrder') then
      raise exception 'permission_denied: SettleOrder required';
    end if;
    perform set_config('app.external_payment_hold','on',true);
    v_order_id:=public.post_sale(p_customer_id,p_lines,'[]',true,p_client_ref,p_draft_id);
    update public.orders set cashier_pending_at=null where id=v_order_id and company_id=v_company_id;
    select * into v_order from public.orders where id=v_order_id and company_id=v_company_id for update;
    if v_order.status='completed' then
      return jsonb_build_object('status','completed','order_id',v_order_id,'subject_id',v_order_id);
    end if;
    if v_order.status<>'pending_payment' then
      raise exception 'invalid_order_state: % is %',v_order_id,v_order.status;
    end if;
    select * into v_existing_approval from public.approvals where company_id=v_company_id
      and type='overdraft' and status='pending' and metadata->>'order_id'=v_order_id::text
    order by created_at desc limit 1;
    if v_existing_approval.id is not null then
      return jsonb_build_object('status','approval_required','approval_id',v_existing_approval.id,
        'order_id',v_order_id,'subject_id',v_order_id);
    end if;
    if exists(select 1 from public.approvals where company_id=v_company_id
      and type='below_wholesale' and status='pending' and metadata->>'order_id'=v_order_id::text) then
      raise exception 'approval_conflict: resolve the price exception before requesting credit';
    end if;
    select * into v_customer from public.customers
      where id=v_order.customer_id and company_id=v_company_id for update;
    if v_customer.id is null or not v_customer.is_credit_approved then
      raise exception 'credit_not_approved: customer %',v_order.customer_id;
    end if;
    select coalesce(sum(l.debit)-sum(l.credit),0)::bigint into v_ar_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=v_company_id and a.code='ACCOUNTS_RECEIVABLE'
      and l.customer_id=v_customer.id;
    if v_customer.credit_limit>0 and v_ar_balance+v_order.total>v_customer.credit_limit then
      insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
      values(v_company_id,'overdraft','order',v_order_id,jsonb_build_object(
        'order_id',v_order_id,'customer_id',v_customer.id,'ar_balance',v_ar_balance,
        'order_total',v_order.total,'credit_limit',v_customer.credit_limit,
        'projected_balance',v_ar_balance+v_order.total,'reason',v_reason),auth.uid())
      on conflict(company_id,type,subject_id) where status='pending' and subject_id is not null
      do nothing returning id into v_approval_id;
      if v_approval_id is null then select id into v_approval_id from public.approvals
        where company_id=v_company_id and type='overdraft' and subject_id=v_order_id
          and status='pending'; end if;
      return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
        'order_id',v_order_id,'subject_id',v_order_id);
    end if;
    perform public.complete_order(v_order_id,'[]',auth.uid());
    return jsonb_build_object('status','completed','order_id',v_order_id,'subject_id',v_order_id);
  end if;

  v_order_id:=public.post_sale(p_customer_id,p_lines,p_payments,p_park,p_client_ref,p_draft_id);
  return jsonb_build_object('status',case when p_park then 'parked' else 'completed' end,
    'order_id',v_order_id,'subject_id',v_order_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_sale_with_prepayment_at_location(p_location_id uuid, p_customer_id uuid, p_lines jsonb, p_payments jsonb, p_deposit_amount bigint, p_credit_amount bigint, p_client_ref text DEFAULT NULL::text, p_draft_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_payment jsonb;
  v_tender_total bigint := 0;
  v_amount bigint;
  v_external_tenders jsonb;
  v_external_approval_id uuid;
  v_overdraft_approval_id uuid;
  v_ar_balance bigint;
  v_metadata jsonb;
  v_overdraft_metadata jsonb;
  v_needs_external boolean;
  v_needs_overdraft boolean;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  if p_customer_id is null then
    raise exception 'identified_customer_required_for_mixed_settlement';
  end if;
  if coalesce(p_deposit_amount, 0) < 0 or coalesce(p_credit_amount, 0) < 0 then
    raise exception 'invalid_settlement_amount';
  end if;
  v_location_id := public.resolve_business_location(p_location_id);
  perform set_config('app.business_location_id', v_location_id::text, true);
  perform public.lock_customer_account(v_company_id,p_customer_id);
  perform 1 from public.customers where id=p_customer_id and company_id=v_company_id for update;
  v_order_id := public.prepare_sale_order_core(
    p_customer_id, p_lines, p_client_ref, p_draft_id
  );
  select * into v_order
  from public.orders
  where id = v_order_id and company_id = v_company_id
  for update;
  if v_order.status = 'completed' then
    return jsonb_build_object(
      'status', 'completed', 'order_id', v_order_id, 'subject_id', v_order_id
    );
  end if;
  if v_order.status not in ('draft', 'pending_payment')
    or (v_order.status = 'pending_payment' and v_order.pending_owner <> 'approval') then
    raise exception 'invalid_order_state: % is %/%',
      v_order_id, v_order.status, coalesce(v_order.pending_owner, 'unowned');
  end if;

  for v_payment in
    select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb))
  loop
    if v_payment ->> 'method' = 'credit' then raise exception 'credit_is_not_a_tender'; end if;
    v_amount := coalesce((v_payment ->> 'amount')::bigint, 0);
    if v_amount <= 0 then raise exception 'invalid_tender_amount'; end if;
    v_tender_total := v_tender_total + v_amount;
    perform public.prepayment_tender_account(
      v_location_id, v_payment ->> 'method', v_payment ->> 'reference'
    );
  end loop;
  if v_tender_total + coalesce(p_deposit_amount, 0) + coalesce(p_credit_amount, 0)
    <> v_order.total then
    raise exception 'payment_mismatch: tender % + deposit % + credit % <> order total %',
      v_tender_total, p_deposit_amount, p_credit_amount, v_order.total;
  end if;
  if coalesce(p_deposit_amount, 0) > public.customer_deposit_available(p_customer_id) then
    raise exception 'insufficient_customer_deposit';
  end if;
  select * into v_customer
  from public.customers
  where id = p_customer_id
    and company_id = v_company_id
    and not is_supplier
    and deleted_at is null
  for update;
  if v_customer.id is null then raise exception 'customer_not_found'; end if;
  if coalesce(p_credit_amount, 0) > 0 and not v_customer.is_credit_approved then
    raise exception 'credit_not_approved: customer %', p_customer_id;
  end if;

  select jsonb_agg(t.value) into v_external_tenders
  from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) t(value)
  join public.available_payment_methods(v_location_id) m
    on m.code = t.value ->> 'method'
  where not m.is_cashier_controlled;
  v_needs_external := v_external_tenders is not null
    and not public.current_user_has_permission('ViewFinancials');

  select coalesce(sum(l.debit) - sum(l.credit), 0)::bigint into v_ar_balance
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where l.company_id = v_company_id
    and a.code = 'ACCOUNTS_RECEIVABLE'
    and l.customer_id = p_customer_id;
  v_needs_overdraft := coalesce(p_credit_amount, 0) > 0
    and v_customer.credit_limit > 0
    and v_ar_balance + p_credit_amount > v_customer.credit_limit
    and not public.current_user_has_permission('ApproveCustomerCredit');

  v_metadata := jsonb_build_object(
    'order_id', v_order_id,
    'tenders', coalesce(p_payments, '[]'::jsonb),
    'prepayment_settlement', true,
    'deposit_amount', coalesce(p_deposit_amount, 0),
    'credit_amount', coalesce(p_credit_amount, 0),
    'client_ref', p_client_ref
  );
  if v_needs_external then
    insert into public.approvals(
      company_id, type, subject_type, subject_id, metadata, requested_by
    ) values(
      v_company_id, 'external_account_payment', 'order', v_order_id, v_metadata, auth.uid()
    )
    on conflict(company_id, type, subject_id)
      where status = 'pending' and subject_id is not null
    do nothing
    returning id into v_external_approval_id;
    if v_external_approval_id is null then
      select id into v_external_approval_id
      from public.approvals
      where company_id = v_company_id
        and type = 'external_account_payment'
        and subject_id = v_order_id
        and status = 'pending';
    end if;
  end if;
  if v_needs_overdraft then
    v_overdraft_metadata := v_metadata || jsonb_build_object(
      'customer_id', p_customer_id,
      'ar_balance', v_ar_balance,
      'order_total', v_order.total,
      'credit_amount', p_credit_amount,
      'credit_limit', v_customer.credit_limit,
      'projected_balance', v_ar_balance + p_credit_amount,
      'reason', 'Residual credit exceeds customer limit'
    );
    insert into public.approvals(
      company_id, type, subject_type, subject_id, metadata, requested_by
    ) values(
      v_company_id, 'overdraft', 'order', v_order_id, v_overdraft_metadata, auth.uid()
    )
    on conflict(company_id, type, subject_id)
      where status = 'pending' and subject_id is not null
    do nothing
    returning id into v_overdraft_approval_id;
    if v_overdraft_approval_id is null then
      select id into v_overdraft_approval_id
      from public.approvals
      where company_id = v_company_id
        and type = 'overdraft'
        and subject_id = v_order_id
        and status = 'pending';
    end if;
  end if;

  if v_needs_external or v_needs_overdraft then
    perform public.hold_sale_order_core(v_order_id, 'approval');
    return jsonb_build_object(
      'status', 'approval_required',
      'approval_id', coalesce(v_external_approval_id, v_overdraft_approval_id),
      'approval_ids', to_jsonb(array_remove(
        array[v_external_approval_id, v_overdraft_approval_id], null
      )),
      'order_id', v_order_id,
      'subject_id', v_order_id
    );
  end if;
  if v_order.status <> 'draft'
    and not (
      v_order.status = 'pending_payment'
      and v_order.pending_owner = 'approval'
      and coalesce(current_setting('app.external_payment_hold', true), '') = 'on'
      and not exists (
        select 1
        from public.approvals a
        where a.company_id = v_company_id
          and a.subject_id = v_order_id
          and a.status = 'pending'
          and a.type in ('external_account_payment', 'overdraft')
      )
    ) then
    raise exception 'approval_pending: order % is held for approval', v_order_id;
  end if;
  perform public.complete_order_with_prepayment(
    v_order_id, p_payments, coalesce(p_deposit_amount, 0),
    coalesce(p_credit_amount, 0), p_client_ref
  );
  return jsonb_build_object(
    'status', 'completed', 'order_id', v_order_id, 'subject_id', v_order_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_request(p_approval_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid:=public.current_company_id();v_approval public.approvals%rowtype;
  v_order public.orders%rowtype;v_customer public.customers%rowtype;v_payment_status text;
  v_resource_id uuid;v_error text;v_valid boolean;v_available bigint;v_deposit_amount bigint;
  v_credit_amount bigint;v_current_ar bigint;v_customer_id uuid;v_context public.posting_context;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select * into v_approval from public.approvals
  where id=p_approval_id and company_id=v_company_id for update;
  if v_approval.id is null then raise exception 'approval_not_found: %',p_approval_id; end if;
  perform public.assert_approval_authority(v_approval.type);
  if v_approval.status<>'pending' then raise exception 'approval_not_found: %',p_approval_id; end if;
  if v_approval.requested_by=auth.uid() then raise exception 'self_approval_denied'; end if;
  if v_approval.due_at is not null and v_approval.due_at<=now() then
    perform public.expire_approval_request(p_approval_id,'Approval request expired',
      v_approval.type in ('external_account_payment','overdraft'));
    return p_approval_id;
  end if;

  if v_approval.type='order_reversal' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    if v_order.status is distinct from 'completed' then
      perform public.expire_approval_request(p_approval_id,
        'Sale is no longer eligible for reversal',false);return p_approval_id;
    end if;
    v_resource_id:=public.do_void(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved reversal'));

  elsif v_approval.type='sale_refund' then
    perform public.lock_receivable_order_customer(v_approval.subject_id);
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    if v_order.status is distinct from 'completed'
      or coalesce((v_approval.metadata->>'full_refund')::boolean,false) is not true
      or (v_approval.metadata->>'amount')::bigint is distinct from v_order.gross_total
      or exists(select 1 from public.refunds r where r.company_id=v_company_id
        and r.order_id=v_approval.subject_id) then
      perform public.expire_approval_request(p_approval_id,
        'Credit note is no longer valid',false);return p_approval_id;
    end if;
    v_resource_id:=public.execute_full_credit_note(v_approval.subject_id,
      v_approval.metadata->>'method_code',
      coalesce(v_approval.metadata->>'reason','Approved credit note'),
      v_approval.metadata->>'stock_outcome');

  elsif v_approval.type='payment_reversal' then
    perform public.lock_receivable_order_customer(p.order_id)
    from public.payments p where p.id=v_approval.subject_id and p.company_id=v_company_id;
    select status into v_payment_status from public.payments
      where id=v_approval.subject_id and company_id=v_company_id for update;
    if v_payment_status is distinct from 'settled' or exists(select 1
      from public.ledger_journal_entries where company_id=v_company_id
        and source_type='PaymentReversal'
        and source_id=v_approval.subject_id::text||'-reversal') then
      perform public.expire_approval_request(p_approval_id,
        'Payment is no longer eligible for reversal',false);return p_approval_id;
    end if;
    v_resource_id:=public.execute_payment_reversal(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved payment reversal'));

  elsif v_approval.type='customer_deposit_refund' then
    v_resource_id:=public.refund_customer_deposit(v_approval.subject_id,
      (v_approval.metadata->>'amount')::bigint,
      coalesce(v_approval.metadata->>'reason','Approved customer deposit refund'),
      nullif(v_approval.metadata->>'method_code',''),nullif(v_approval.metadata->>'reference',''),
      nullif(v_approval.metadata->>'client_ref',''),
      nullif(v_approval.metadata->>'location_id','')::uuid);

  elsif v_approval.type='customer_receipt_reversal' then
    v_resource_id:=public.execute_customer_receipt_reversal(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved customer receipt reversal'));

  elsif v_approval.type='below_wholesale' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select v_order.status='draft'
      and jsonb_typeof(v_approval.metadata->'lines')='array'
      and jsonb_array_length(v_approval.metadata->'lines')>0
      and not exists(
        select 1 from jsonb_array_elements(v_approval.metadata->'lines') requested
        left join public.order_lines l on l.order_id=v_order.id
          and l.variant_id=(requested->>'variant_id')::uuid
        left join public.product_variants pv on pv.id=l.variant_id and pv.company_id=v_company_id
        where l.id is null or l.custom_price is distinct from (requested->>'custom_price')::bigint
          or pv.wholesale_price is null
          or (requested->>'custom_price')::bigint>=pv.wholesale_price
      ) into v_valid;
    if not coalesce(v_valid,false) then
      perform public.expire_approval_request(p_approval_id,
        'Draft pricing changed and must be reviewed again',false);return p_approval_id;
    end if;
    v_resource_id:=v_order.id;

  elsif v_approval.type='external_account_payment'
    and v_approval.subject_type='customer_receipt' then
    perform set_config('app.approved_customer_receipt_id',v_approval.subject_id::text,true);
    begin
      v_resource_id:=public.execute_customer_receipt(v_approval.subject_id);
    exception when raise_exception then
      get stacked diagnostics v_error=message_text;
      perform public.expire_approval_request(p_approval_id,
        'Customer receipt could not post: '||v_error,false);return p_approval_id;
    end;

  elsif v_approval.type='external_account_payment' then
    perform public.lock_receivable_order_customer(v_approval.subject_id);
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select v_order.status='pending_payment' and v_order.customer_id is not null
      and jsonb_typeof(v_approval.metadata->'tenders')='array'
      and jsonb_array_length(v_approval.metadata->'tenders')>0
      and ((not coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false)
          and (select coalesce(sum((t->>'amount')::bigint),0)
            from jsonb_array_elements(v_approval.metadata->'tenders') t)=v_order.total)
        or (coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false)
          and (select coalesce(sum((t->>'amount')::bigint),0)
            from jsonb_array_elements(v_approval.metadata->'tenders') t)
            +coalesce((v_approval.metadata->>'deposit_amount')::bigint,0)
            +coalesce((v_approval.metadata->>'credit_amount')::bigint,0)=v_order.total))
      and not exists(
        select 1 from jsonb_array_elements(v_approval.metadata->'tenders') t
        left join public.payment_methods pm on pm.company_id=v_company_id and pm.code=t->>'method'
        left join public.location_payment_methods lpm
          on lpm.payment_method_id=pm.id and lpm.location_id=v_order.location_id
        where coalesce((t->>'amount')::bigint,0)<=0 or pm.id is null or not pm.enabled
          or (lpm.id is not null and not lpm.enabled)
          or (coalesce(pm.reconciliation_type,'')='statement_match'
            and btrim(coalesce(t->>'reference',''))='')
      ) into v_valid;
    if not coalesce(v_valid,false) then
      perform public.expire_approval_request(p_approval_id,
        'Direct account payment is no longer valid',true);return p_approval_id;
    end if;
    begin
      if coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false) then
        if exists(select 1 from public.approvals a where a.company_id=v_company_id
          and a.subject_id=v_order.id and a.type='overdraft' and a.status='pending') then
          v_resource_id:=v_order.id;
        else
          perform set_config('app.approved_prepayment_order_id',v_order.id::text,true);
          if exists(select 1 from public.approvals a where a.company_id=v_company_id
            and a.subject_id=v_order.id and a.type='overdraft' and a.status='approved') then
            perform set_config('app.approved_credit_order_id',v_order.id::text,true);end if;
          v_context:=public.order_posting_context(v_order.id,'approval');
          perform public.complete_order_with_prepayment_core(v_order.id,v_approval.metadata->'tenders',
            coalesce((v_approval.metadata->>'deposit_amount')::bigint,0),
            coalesce((v_approval.metadata->>'credit_amount')::bigint,0),
            nullif(v_approval.metadata->>'client_ref',''),v_context);
        end if;
      else
        v_context:=public.order_posting_context(v_order.id,'approval');
        perform public.complete_order_core(v_order.id,v_approval.metadata->'tenders',v_context);
      end if;
    exception when raise_exception then
      get stacked diagnostics v_error=message_text;
      perform public.expire_approval_request(p_approval_id,
        'Direct account payment could not complete: '||v_error,true);return p_approval_id;
    end;
    v_resource_id:=v_order.id;

  elsif v_approval.type='overdraft'
    and coalesce((v_approval.metadata->>'automatic_customer_account')::boolean,false) then
    perform public.lock_receivable_order_customer(v_approval.subject_id);
    select customer_id into v_customer_id from public.orders where id=v_approval.subject_id
      and company_id=v_company_id;
    if v_customer_id is not null then
      perform public.lock_customer_account(v_company_id,v_customer_id);end if;
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select * into v_customer from public.customers where id=v_order.customer_id
      and company_id=v_company_id and deleted_at is null for update;
    if v_order.status is distinct from 'pending_payment' or v_customer.id is null
      or not v_customer.is_credit_approved then
      perform public.expire_approval_request(p_approval_id,'Credit sale is no longer valid',true);
      return p_approval_id;end if;
    v_available:=public.customer_deposit_available(v_customer.id);
    v_deposit_amount:=least(v_available,v_order.total);v_credit_amount:=v_order.total-v_deposit_amount;
    if v_credit_amount>coalesce((v_approval.metadata->>'reviewed_credit_amount')::bigint,0) then
      select coalesce(sum(l.debit)-sum(l.credit),0)::bigint into v_current_ar
      from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
      where l.company_id=v_company_id and a.code='ACCOUNTS_RECEIVABLE'
        and l.customer_id=v_customer.id;
      update public.approvals set status='expired',decided_at=now(),decided_by=auth.uid(),
        decision_reason='Downpayment availability changed; credit exposure must be reviewed again'
      where id=p_approval_id;
      perform public.notify_approval_requester(p_approval_id);
      insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
      values(v_company_id,'overdraft','order',v_order.id,v_approval.metadata||jsonb_build_object(
        'deposit_amount',v_deposit_amount,'credit_amount',v_credit_amount,
        'reviewed_deposit_amount',v_deposit_amount,'reviewed_credit_amount',v_credit_amount,
        'ar_balance',v_current_ar,'projected_balance',v_current_ar+v_credit_amount,
        'reason','Downpayment changed; review the updated residual credit'),v_approval.requested_by);
      return p_approval_id;
    end if;
    perform set_config('app.approved_credit_order_id',v_order.id::text,true);
    perform set_config('app.approved_prepayment_order_id',v_order.id::text,true);
    v_context:=public.order_posting_context(v_order.id,'approval');
    perform public.complete_order_with_prepayment_core(v_order.id,'[]'::jsonb,v_deposit_amount,
      v_credit_amount,nullif(v_approval.metadata->>'client_ref',''),v_context);
    v_resource_id:=v_order.id;

  elsif v_approval.type='overdraft' then
    perform public.lock_receivable_order_customer(v_approval.subject_id);
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select * into v_customer from public.customers where id=v_order.customer_id
      and company_id=v_company_id and deleted_at is null for update;
    if v_order.status is distinct from 'pending_payment' or v_customer.id is null
      or not v_customer.is_credit_approved then
      perform public.expire_approval_request(p_approval_id,
        'Credit sale is no longer valid',true);return p_approval_id;
    end if;
    perform set_config('app.approved_credit_order_id',v_order.id::text,true);
    begin
      if coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false) then
        if exists(select 1 from public.approvals a where a.company_id=v_company_id
          and a.subject_id=v_order.id and a.type='external_account_payment' and a.status='pending') then
          v_resource_id:=v_order.id;
        else
          perform set_config('app.approved_prepayment_order_id',v_order.id::text,true);
          perform set_config('app.approved_credit_order_id',v_order.id::text,true);
          v_context:=public.order_posting_context(v_order.id,'approval');
          perform public.complete_order_with_prepayment_core(v_order.id,v_approval.metadata->'tenders',
            coalesce((v_approval.metadata->>'deposit_amount')::bigint,0),
            coalesce((v_approval.metadata->>'credit_amount')::bigint,0),
            nullif(v_approval.metadata->>'client_ref',''),v_context);
        end if;
      else
        v_context:=public.order_posting_context(v_order.id,'approval');
        perform public.complete_order_core(v_order.id,'[]',v_context);
      end if;
    exception when raise_exception then
      get stacked diagnostics v_error=message_text;
      perform public.expire_approval_request(p_approval_id,
        'Credit sale could not complete: '||v_error,true);return p_approval_id;
    end;
    v_resource_id:=v_order.id;

  elsif v_approval.type='customer_credit' then
    select * into v_customer from public.customers where id=v_approval.subject_id
      and company_id=v_company_id and deleted_at is null for update;
    if v_customer.id is null
      or v_customer.credit_limit is distinct from
        (v_approval.metadata->'previous'->>'credit_limit')::bigint
      or v_customer.is_credit_approved is distinct from
        (v_approval.metadata->'previous'->>'is_credit_approved')::boolean
      or coalesce(v_customer.credit_terms_days,0) is distinct from
        (v_approval.metadata->'previous'->>'credit_terms_days')::integer then
      perform public.expire_approval_request(p_approval_id,
        'Customer credit policy changed after this request',false);return p_approval_id;
    end if;
    perform public.update_customer_credit(v_customer.id,
      (v_approval.metadata->'proposed'->>'credit_limit')::bigint,
      (v_approval.metadata->'proposed'->>'is_credit_approved')::boolean,
      (v_approval.metadata->'proposed'->>'credit_terms_days')::integer);
    v_resource_id:=v_customer.id;
  end if;

  update public.approvals set status='approved',decided_by=auth.uid(),decided_at=now(),
    decision_reason=p_reason,result=case when v_resource_id is null then null
      else jsonb_build_object('resource_id',v_resource_id,'subject_id',v_approval.subject_id) end
  where id=p_approval_id;
  perform public.notify_approval_requester(p_approval_id);
  return p_approval_id;
end;
$function$;

commit;

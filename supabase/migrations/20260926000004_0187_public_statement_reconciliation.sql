-- Keep public customer statements aligned with the accounting ledger.
-- Invoice balances come from per-order accounts receivable activity, and
-- customer receipts retain their actual external reference.

create or replace function public.public_customer_statement(
  p_token text,p_before_date timestamptz default null,p_before_id uuid default null,
  p_limit integer default 25
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
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
      and jl.meta @> jsonb_build_object('customerId',v_link.customer_id)
  ), order_receivables as materialized (
    select jl.order_id,sum(jl.debit-jl.credit)::bigint balance
    from public.ledger_journal_lines jl
    join public.ledger_accounts a on a.id=jl.account_id
    where jl.company_id=v_link.company_id and jl.order_id is not null
      and a.code='ACCOUNTS_RECEIVABLE'
      and jl.meta @> jsonb_build_object('customerId',v_link.customer_id)
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
      and jl.meta @> jsonb_build_object('customerId',v_link.customer_id)
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
end; $$;

revoke execute on function public.public_customer_statement(text,timestamptz,uuid,integer) from public;
grant execute on function public.public_customer_statement(text,timestamptz,uuid,integer)
  to anon,authenticated;

comment on function public.public_customer_statement(text,timestamptz,uuid,integer) is
  'Returns a live, cursor-paged customer account statement reconciled to the ledger and records initial valid opens.';

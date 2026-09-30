-- Deploy before the dependent web/storefront releases. Existing shops receive an invitation;
-- only companies created after this migration receive the automatic first-use offer.
alter table public.companies
  add column website_url text,
  add column shop_setup jsonb not null default '{}'::jsonb,
  add column document_designs jsonb not null default '{}'::jsonb;
alter table public.companies alter column shop_setup set default '{"auto_offer":true}'::jsonb;
alter table public.companies add constraint companies_website_url_valid check (
  website_url is null or (length(website_url) <= 2048 and website_url ~ '^https?://[^[:space:]/]+[^[:space:]]*$')
);
grant update (website_url) on public.companies to authenticated;

create function public.save_document_design(p_document_type text, p_design jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.current_user_has_permission('ManageCompanySettings') then
    raise exception 'permission_denied: ManageCompanySettings required';
  end if;
  if p_document_type is null or p_document_type not in ('receipt','invoice','proforma','purchase-order','statement','cashier-slip') then
    raise exception 'invalid_document_type';
  end if;
  if p_design is null or jsonb_typeof(p_design) <> 'object'
    or not (p_design ?& array['version','layout','message','custom'])
    or p_design - array['version','layout','message','custom'] <> '{}'::jsonb
    or p_design->'version' <> '1'::jsonb
    or p_design->>'layout' not in ('classic','compact','modern')
    or jsonb_typeof(p_design->'message') <> 'string' or length(p_design->>'message') > 1000
    or jsonb_typeof(p_design->'custom') <> 'object'
    or not ((p_design->'custom') ?& array['label','value','display'])
    or (p_design->'custom') - array['label','value','display','qr'] <> '{}'::jsonb
    or jsonb_typeof(p_design#>'{custom,label}') <> 'string' or length(p_design#>>'{custom,label}') > 60
    or jsonb_typeof(p_design#>'{custom,value}') <> 'string' or length(p_design#>>'{custom,value}') > 300
    or p_design#>>'{custom,display}' not in ('text','qr','both')
    or jsonb_typeof(p_design->'layout') <> 'string' or jsonb_typeof(p_design#>'{custom,display}') <> 'string'
  then raise exception 'invalid_document_design'; end if;
  if p_design#>>'{custom,display}' <> 'text' and length(btrim(p_design#>>'{custom,value}')) > 0 then
    if jsonb_typeof(p_design#>'{custom,qr}') is distinct from 'object'
      or jsonb_typeof(p_design#>'{custom,qr,size}') is distinct from 'number'
      or jsonb_typeof(p_design#>'{custom,qr,bits}') is distinct from 'string'
      then raise exception 'invalid_document_qr'; end if;
    if (p_design#>>'{custom,qr,size}')::numeric <> trunc((p_design#>>'{custom,qr,size}')::numeric)
      or (p_design#>>'{custom,qr,size}')::numeric not between 21 and 101 then raise exception 'invalid_document_qr'; end if;
    if ((p_design#>>'{custom,qr,size}')::integer - 21) % 4 <> 0
      or length(p_design#>>'{custom,qr,bits}') <> power((p_design#>>'{custom,qr,size}')::integer,2)
      or p_design#>>'{custom,qr,bits}' !~ '^[01]+$'
      or (p_design#>'{custom,qr}') - array['size','bits'] <> '{}'::jsonb then raise exception 'invalid_document_qr'; end if;
  elsif (p_design->'custom') ? 'qr' then
    raise exception 'unexpected_document_qr';
  end if;
  -- UPDATE locks the company row and evaluates jsonb_set against the latest committed row.
  update public.companies set document_designs = jsonb_set(document_designs,array[p_document_type],p_design,true)
    where id = public.current_company_id() returning document_designs->p_document_type into v_result;
  if not found then raise exception 'company_not_found'; end if;
  return v_result;
end; $$;

create function public.save_shop_setup(p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.current_user_has_permission('ManageCompanySettings') then
    raise exception 'permission_denied: ManageCompanySettings required';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_setup_state'; end if;
  if exists(select 1 from jsonb_each(p_patch) e where e.key not in
    ('offered','deferred','identity_reviewed','address_deferred','documents_reviewed') or jsonb_typeof(e.value) <> 'boolean')
    then raise exception 'invalid_setup_state'; end if;
  update public.companies set shop_setup = shop_setup || p_patch
    where id = public.current_company_id() returning shop_setup into v_result;
  if not found then raise exception 'company_not_found'; end if;
  return v_result;
end; $$;

create function public.shop_address_availability(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_taken boolean; v_alternative text; v_suffix integer := 2;
begin
  if not public.current_user_has_permission('ManageCompanySettings') then
    raise exception 'permission_denied: ManageCompanySettings required';
  end if;
  if p_slug is null or length(p_slug) not between 1 and 63 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_shop_address';
  end if;
  select exists(select 1 from public.companies where public_slug = p_slug and id <> public.current_company_id()) into v_taken;
  v_alternative := p_slug;
  while exists(select 1 from public.companies where public_slug = v_alternative and id <> public.current_company_id()) loop
    v_alternative := rtrim(left(p_slug, 55),'-') || '-' || v_suffix::text;
    v_suffix := v_suffix + 1;
  end loop;
  return jsonb_build_object('available',not v_taken,'suggestion',v_alternative);
end; $$;

revoke all on function public.save_document_design(text,jsonb), public.save_shop_setup(jsonb), public.shop_address_availability(text) from public, anon;
grant execute on function public.save_document_design(text,jsonb), public.save_shop_setup(jsonb), public.shop_address_availability(text) to authenticated;

-- Capture only this document's public identity and chosen design. No setup metadata or
-- other document designs enter bearer-link responses. Existing token checks stay intact.
create function public.snapshot_external_document_design()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_company public.companies%rowtype; v_kind text;
begin
  select * into strict v_company from public.companies where id = new.company_id;
  v_kind := replace(new.document_type,'_','-');
  new.snapshot := new.snapshot || jsonb_build_object(
    'document_design',v_company.document_designs->v_kind,
    'company_email',v_company.email,'company_website',v_company.website_url);
  return new;
end; $$;
revoke all on function public.snapshot_external_document_design() from public, anon, authenticated;
create trigger external_document_links_snapshot_design before insert on public.external_document_links
  for each row execute function public.snapshot_external_document_design();

-- Statements retain the live ledger/cursor implementation from migration 0198.
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
    co.business_timezone,co.address,co.email,co.website_url,co.document_designs,
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
    'company_address',v_link.address,'company_email',v_link.email,'company_website',v_link.website_url,
    'document_design',v_link.document_designs->'statement',
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

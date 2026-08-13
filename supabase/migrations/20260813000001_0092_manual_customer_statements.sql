-- Merchant-triggered customer account statements with seven-day bearer links.

alter table public.customer_statement_links
  add column created_by uuid,
  add column link_source text not null default 'reminder'
    check (link_source in ('reminder','manual'));

update public.customer_statement_links
set expires_at=least(expires_at,created_at+interval '7 days')
where revoked_at is null;

alter table public.outbox drop constraint if exists outbox_source_check;
alter table public.outbox add constraint outbox_source_check check (
  source in (
    'direct','campaign','reminder','platform','manual_document',
    'manual_document_copy','manual_statement','cashier_session'
  )
);

insert into public.message_templates(
  template_key,name,context,sms_body,whatsapp_body,is_system
) values(
  'manual-customer-statement','Customer statement delivery','customer',
  '{{company_name}} account statement for {{party_name}}. {{account_summary}} View: {{statement_url}} (expires in 7 days)',
  E'*Account statement*\n\n{{company_name}}\n{{party_name}}\n{{account_summary}}\n\nView statement: {{statement_url}}\n\nThis link expires in 7 days.',
  true
) on conflict do nothing;

drop function public.issue_customer_statement_link(uuid,uuid);
create function public.issue_customer_statement_link(
  p_company_id uuid,
  p_customer_id uuid,
  p_source text default 'reminder',
  p_created_by uuid default null
) returns text language plpgsql security definer set search_path='' as $$
declare v_token text;v_hash text;
begin
  if p_source not in ('reminder','manual') then raise exception 'invalid_statement_source'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id and company_id=p_company_id
    and not is_supplier and notifications_enabled) then raise exception 'customer_unavailable'; end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  update public.customer_statement_links set revoked_at=now()
  where company_id=p_company_id and customer_id=p_customer_id and revoked_at is null;
  insert into public.customer_statement_links(
    company_id,customer_id,token_hash,expires_at,created_by,link_source
  ) values(p_company_id,p_customer_id,v_hash,now()+interval '7 days',p_created_by,p_source);
  return v_token;
end; $$;
revoke execute on function public.issue_customer_statement_link(uuid,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.issue_customer_statement_link(uuid,uuid,text,uuid) to service_role;

create or replace function public.customer_statement_message_context(
  p_customer_id uuid,p_channel text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
    and jl.meta @> jsonb_build_object('customerId',p_customer_id);
  if v_activity_count=0 then raise exception 'statement_has_no_activity'; end if;
  return jsonb_build_object(
    'company_id',v_company_id,'company_name',v_company.name,'customer_id',v_customer.id,
    'party_name',trim(v_customer.first_name||' '||coalesce(v_customer.last_name,'')),
    'recipient',v_customer.phone,'channel',p_channel,'account_balance',v_net,
    'account_summary',case when v_net>0 then 'Balance due: KES '||to_char(v_net,'FM999G999G999')
      when v_net<0 then 'Downpayment available: KES '||to_char(abs(v_net),'FM999G999G999')
      else 'Account settled.' end);
end; $$;
revoke execute on function public.customer_statement_message_context(uuid,text)
  from public,anon,authenticated;
grant execute on function public.customer_statement_message_context(uuid,text) to service_role;

create or replace function public.render_customer_statement_message(p_context jsonb,p_url text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_template public.message_templates%rowtype;v_body text;
begin
  select * into v_template from public.message_templates
  where company_id is null and template_key='manual-customer-statement' and active limit 1;
  if not found then raise exception 'statement_template_unavailable'; end if;
  v_body:=public.render_message_template(
    case when p_context->>'channel'='whatsapp' then v_template.whatsapp_body else v_template.sms_body end,
    jsonb_build_object('company_name',p_context->>'company_name','party_name',p_context->>'party_name',
      'account_summary',p_context->>'account_summary','statement_url',p_url));
  return jsonb_build_object('body',v_body,'template_key',v_template.template_key,
    'template_version',v_template.version);
end; $$;
revoke execute on function public.render_customer_statement_message(jsonb,text)
  from public,anon,authenticated;
grant execute on function public.render_customer_statement_message(jsonb,text) to service_role;

create or replace function public.preview_customer_statement(p_customer_id uuid,p_channel text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb;v_message jsonb;
begin
  v_context:=public.customer_statement_message_context(p_customer_id,p_channel);
  v_message:=public.render_customer_statement_message(v_context,'[secure statement link]');
  return v_context||jsonb_build_object('body',v_message->>'body','expires_in_days',7);
end; $$;
revoke execute on function public.preview_customer_statement(uuid,text) from public,anon;
grant execute on function public.preview_customer_statement(uuid,text) to authenticated;

create or replace function public.send_customer_statement(
  p_customer_id uuid,p_channel text,p_bypass_quiet_hours boolean default false
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb;v_message jsonb;v_token text;v_url text;v_origin text;
  v_link_id uuid;v_outbox_id uuid;
begin
  v_context:=public.customer_statement_message_context(p_customer_id,p_channel);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    (v_context->>'company_id')||':manual_statement:'||p_customer_id::text,0));
  if exists(select 1 from public.outbox o
    where o.company_id=(v_context->>'company_id')::uuid and o.customer_id=p_customer_id
      and o.source='manual_statement' and o.status in ('pending','sent')
      and o.created_at>now()-interval '1 minute') then
    raise exception 'statement_send_cooldown';
  end if;
  select nullif(rtrim(decrypted_secret,'/'),'') into v_origin
  from vault.decrypted_secrets where name='STOREFRONT_PUBLIC_URL' limit 1;
  if v_origin is null then raise exception 'storefront_public_url_missing'; end if;
  v_token:=public.issue_customer_statement_link(
    (v_context->>'company_id')::uuid,p_customer_id,'manual',auth.uid());
  v_url:=v_origin||'/statement/'||v_token;
  select id into v_link_id from public.customer_statement_links
  where company_id=(v_context->>'company_id')::uuid
    and token_hash=encode(extensions.digest(v_token,'sha256'),'hex');
  v_message:=public.render_customer_statement_message(v_context,v_url);
  v_outbox_id:=public.queue_manual_document_message(
    (v_context->>'company_id')::uuid,p_channel,v_context->>'recipient',v_message->>'body',
    null,p_bypass_quiet_hours);
  update public.outbox set source='manual_statement',customer_id=p_customer_id,
    template_key=v_message->>'template_key',template_version=(v_message->>'template_version')::integer,
    customer_statement_link_id=v_link_id,max_attempts=case when p_channel='whatsapp' then 2 else 5 end
  where id=v_outbox_id;
  return jsonb_build_object('queued',true,'outbox_id',v_outbox_id,'recipient',v_context->>'recipient',
    'body',v_message->>'body','expires_at',(select expires_at from public.customer_statement_links where id=v_link_id));
end; $$;
revoke execute on function public.send_customer_statement(uuid,text,boolean) from public,anon;
grant execute on function public.send_customer_statement(uuid,text,boolean) to authenticated;

comment on function public.send_customer_statement(uuid,text,boolean) is
  'Queues a fixed customer-level account statement with a seven-day bearer link.';

create or replace function public.prepare_controlled_outbox_delivery(p_outbox_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_row public.outbox%rowtype;v_allowed boolean;
begin
  select * into v_row from public.outbox where id=p_outbox_id for update;
  if not found or v_row.status<>'pending' then return false; end if;
  if v_row.source not in ('reminder','manual_document','manual_document_copy','manual_statement') then
    return true;
  end if;
  v_allowed:=public.external_messaging_allowed(v_row.company_id,v_row.source='reminder');
  if v_allowed then return true; end if;
  perform public.finalize_message_quota(v_row.id,false);
  update public.outbox set status='cancelled',error='external_messaging_disabled' where id=v_row.id;
  return false;
end; $$;
revoke execute on function public.prepare_controlled_outbox_delivery(uuid)
  from public,anon,authenticated;
grant execute on function public.prepare_controlled_outbox_delivery(uuid) to service_role;

drop function public.public_customer_statement(text);
create function public.public_customer_statement(
  p_token text,p_before_date timestamptz default null,p_before_id uuid default null,
  p_limit integer default 25
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_link record;v_result jsonb;v_id uuid;v_amount_due bigint:=0;v_downpayment bigint:=0;
  v_net bigint:=0;v_limit integer:=least(greatest(coalesce(p_limit,25),1),100);
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
    co.customer_payment_instructions into v_link
  from public.customer_statement_links l join public.customers c on c.id=l.customer_id
  join public.companies co on co.id=l.company_id where l.id=v_id;
  select coalesce(sum(jl.debit-jl.credit),0)::bigint into v_net
  from public.ledger_journal_entries je join public.ledger_journal_lines jl on jl.entry_id=je.id
  join public.ledger_accounts a on a.id=jl.account_id
  where je.company_id=v_link.company_id and a.code in ('ACCOUNTS_RECEIVABLE','CUSTOMER_DEPOSITS')
    and jl.meta @> jsonb_build_object('customerId',v_link.customer_id);
  v_amount_due:=greatest(v_net,0);v_downpayment:=greatest(-v_net,0);
  with balances as (
    select o.code,(o.completed_at at time zone 'Africa/Nairobi')::date sale_date,o.credit_due_at,
      greatest(o.total-coalesce((select sum(p.amount) from public.payments p
        where p.order_id=o.id and p.status='settled'),0),0)::bigint balance
    from public.orders o where o.company_id=v_link.company_id and o.customer_id=v_link.customer_id
      and o.is_credit_sale and o.status='completed'
  ), entries as materialized (
    select je.id,je.posted_at occurred_at,
      case when je.source_type in ('Payment','PaymentAllocation','PaymentReversal')
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
    'customer_first_name',v_link.first_name,'expires_at',v_link.expires_at,
    'account_balance',v_net,'amount_due',v_amount_due,'downpayment_available',v_downpayment,
    'outstanding_total',v_amount_due,
    'orders',coalesce((select jsonb_agg(jsonb_build_object('code',code,'sale_date',sale_date,
      'due_date',credit_due_at,'balance',balance) order by credit_due_at) from balances where balance>0),'[]'::jsonb),
    'activities',coalesce((select jsonb_agg(jsonb_build_object('id',id,'date',occurred_at,
      'kind',kind,'description',description,'reference',reference,'debit',debit,'credit',credit,
      'balance',balance,'amount',abs(debit-credit),
      'direction',case when debit-credit>0 then 'charge' else 'payment' end)
      order by occurred_at desc,id desc) from activities),'[]'::jsonb),
    'activity_has_more',coalesce((select bool_or(page_has_more) from activities),false)) into v_result;
  return v_result;
end; $$;
revoke execute on function public.public_customer_statement(text,timestamptz,uuid,integer) from public;
grant execute on function public.public_customer_statement(text,timestamptz,uuid,integer)
  to anon,authenticated;

comment on function public.public_customer_statement(text,timestamptz,uuid,integer) is
  'Returns one cursor-paged customer account statement and records initial valid opens.';

-- Financial security follow-ups:
--   * journal-backed location money balances and strict cashier declarations
--   * supplier adjustment authorization
--   * company-serialized period closes
--   * payload-safe journal idempotency
--   * complete cashier source attribution

alter table public.ledger_journal_entries
  add column payload_hash text;

alter table public.ledger_journal_lines
  add column location_id uuid references public.stock_locations(id);

create index ledger_journal_lines_company_location_account_idx
  on public.ledger_journal_lines(company_id, location_id, account_id);

create or replace function public.journal_payload_hash(
  p_entry_date date,
  p_memo text,
  p_lines jsonb
)
returns text
language sql
immutable
set search_path=''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'entry_date', p_entry_date,
          'memo', p_memo,
          'lines', coalesce((
            select jsonb_agg(n.line order by n.line::text)
            from (
              select jsonb_build_object(
                'account_code', l ->> 'account_code',
                'debit', coalesce((l ->> 'debit')::bigint, 0),
                'credit', coalesce((l ->> 'credit')::bigint, 0),
                'order_id', nullif(l ->> 'order_id', '')::uuid::text,
                -- Session tagging is posting metadata, not caller payload.
                'meta', (case
                  when jsonb_typeof(l -> 'meta') = 'object' then l -> 'meta'
                  else '{}'::jsonb
                end) - 'openSessionId'
              ) as line
              from jsonb_array_elements(p_lines) l
            ) n
          ), '[]'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

revoke execute on function public.journal_payload_hash(date,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.journal_payload_hash(date,text,jsonb) to service_role;

-- Attribute history using persisted evidence first. Legacy untagged activity
-- belongs to the default location so company totals remain unchanged.
select set_config('app.allow_ledger_mutation', 'on', true);

update public.ledger_journal_lines jl
set location_id = coalesce(
  (
    select s.location_id
    from public.cashier_sessions s
    where s.company_id = jl.company_id
      and s.id = case
        when coalesce(jl.meta ->> 'openSessionId', '') ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then (jl.meta ->> 'openSessionId')::uuid
      end
  ),
  (
    select o.location_id
    from public.orders o
    where o.company_id = jl.company_id and o.id = jl.order_id
  ),
  (
    select l.id
    from public.stock_locations l
    where l.company_id = jl.company_id
      and l.id = case
        when coalesce(jl.meta ->> 'locationId', '') ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then (jl.meta ->> 'locationId')::uuid
      end
  ),
  (
    select l.id
    from public.stock_locations l
    where l.company_id = jl.company_id
    order by l.is_default desc, l.created_at, l.id
    limit 1
  )
)
where jl.location_id is null;

update public.ledger_journal_entries e
set payload_hash = public.journal_payload_hash(
  e.entry_date,
  e.memo,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'account_code', a.code,
      'debit', jl.debit,
      'credit', jl.credit,
      'order_id', jl.order_id,
      'meta', jl.meta
    )), '[]'::jsonb)
    from public.ledger_journal_lines jl
    join public.ledger_accounts a on a.id = jl.account_id
    where jl.entry_id = e.id
  )
);

select set_config('app.allow_ledger_mutation', 'off', true);

create or replace function public.assign_journal_line_location()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_location_id uuid := new.location_id;
  v_setting text;
  v_is_cashier_account boolean;
begin
  if v_location_id is null
     and coalesce(new.meta ->> 'locationId', '') ~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    v_location_id := (new.meta ->> 'locationId')::uuid;
  end if;

  if v_location_id is null
     and coalesce(new.meta ->> 'openSessionId', '') ~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    select s.location_id into v_location_id
    from public.cashier_sessions s
    where s.id = (new.meta ->> 'openSessionId')::uuid
      and s.company_id = new.company_id;
  end if;

  if v_location_id is null and new.order_id is not null then
    select o.location_id into v_location_id
    from public.orders o
    where o.id = new.order_id and o.company_id = new.company_id;
  end if;

  if v_location_id is null then
    v_setting := nullif(current_setting('app.business_location_id', true), '');
    if coalesce(v_setting, '') ~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      v_location_id := v_setting::uuid;
    end if;
  end if;

  if v_location_id is null then
    select (array_agg(l.id order by l.id))[1] into v_location_id
    from public.stock_locations l
    where l.company_id = new.company_id and l.is_active
    having count(*) = 1;
  end if;

  if v_location_id is not null and not exists (
    select 1 from public.stock_locations l
    where l.id = v_location_id and l.company_id = new.company_id and l.is_active
  ) then
    raise exception 'invalid_business_location';
  end if;

  select exists (
    select 1
    from public.ledger_accounts a
    join public.payment_methods pm on pm.company_id = a.company_id and pm.enabled
    join public.location_payment_methods lpm
      on lpm.payment_method_id = pm.id and lpm.company_id = pm.company_id and lpm.enabled
    where a.id = new.account_id
      and coalesce(lpm.ledger_account_code, pm.ledger_account_code) = a.code
      and coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled)
  ) into v_is_cashier_account;

  if v_is_cashier_account and v_location_id is null then
    raise exception 'business_location_required: cashier-controlled journal line is ambiguous';
  end if;

  new.location_id := v_location_id;
  return new;
end;
$$;

drop trigger if exists zz_ledger_lines_assign_location on public.ledger_journal_lines;
create trigger zz_ledger_lines_assign_location
  before insert on public.ledger_journal_lines
  for each row execute function public.assign_journal_line_location();

revoke execute on function public.assign_journal_line_location()
  from public, anon, authenticated;
grant execute on function public.assign_journal_line_location() to service_role;

create or replace function public.location_account_balance(
  p_company_id uuid,
  p_location_id uuid,
  p_code text
)
returns bigint
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(sum(jl.debit) - sum(jl.credit), 0)::bigint
  from public.ledger_journal_lines jl
  join public.ledger_accounts a on a.id = jl.account_id
  where jl.company_id = p_company_id
    and jl.location_id = p_location_id
    and a.code = p_code
$$;

revoke execute on function public.location_account_balance(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.location_account_balance(uuid,uuid,text) to service_role;

create or replace function public.validate_cashier_declarations(
  p_company_id uuid,
  p_location_id uuid,
  p_declarations jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_account_code text;
begin
  if jsonb_typeof(p_declarations) is distinct from 'array' then
    raise exception 'invalid_declarations: expected an array';
  end if;

  perform 1 from public.stock_locations l
  where l.id = p_location_id and l.company_id = p_company_id and l.is_active
  for share;
  if not found then
    raise exception 'invalid_business_location';
  end if;

  -- Keep the expected set stable until the opening/closing transaction ends.
  perform 1
  from public.payment_methods pm
  join public.location_payment_methods lpm
    on lpm.payment_method_id=pm.id and lpm.company_id=pm.company_id
  where pm.company_id=p_company_id and lpm.location_id=p_location_id
  order by pm.id,lpm.id
  for share of pm,lpm;

  if exists (
    select 1
    from jsonb_array_elements(p_declarations) d
    where jsonb_typeof(d) <> 'object'
       or nullif(btrim(d ->> 'account_code'), '') is null
       or coalesce(d ->> 'declared', '') !~ '^[0-9]+$'
  ) then
    raise exception 'invalid_declaration: account_code and nonnegative integer declared are required';
  end if;

  select d ->> 'account_code' into v_account_code
  from jsonb_array_elements(p_declarations) d
  group by d ->> 'account_code'
  having count(*) > 1
  order by d ->> 'account_code'
  limit 1;
  if v_account_code is not null then
    raise exception 'duplicate_declaration: %', v_account_code;
  end if;

  with expected as (
    select distinct coalesce(lpm.ledger_account_code, pm.ledger_account_code) as account_code
    from public.payment_methods pm
    join public.location_payment_methods lpm
      on lpm.payment_method_id = pm.id
     and lpm.company_id = pm.company_id
     and lpm.location_id = p_location_id
    where pm.company_id = p_company_id
      and pm.enabled and lpm.enabled
      and coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled)
  ), declared as (
    select d ->> 'account_code' as account_code
    from jsonb_array_elements(p_declarations) d
  )
  select e.account_code into v_account_code
  from expected e
  where not exists (select 1 from declared d where d.account_code = e.account_code)
  order by e.account_code
  limit 1;
  if v_account_code is not null then
    raise exception 'missing_declaration: %', v_account_code;
  end if;

  with expected as (
    select distinct coalesce(lpm.ledger_account_code, pm.ledger_account_code) as account_code
    from public.payment_methods pm
    join public.location_payment_methods lpm
      on lpm.payment_method_id = pm.id
     and lpm.company_id = pm.company_id
     and lpm.location_id = p_location_id
    where pm.company_id = p_company_id
      and pm.enabled and lpm.enabled
      and coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled)
  ), declared as (
    select d ->> 'account_code' as account_code
    from jsonb_array_elements(p_declarations) d
  )
  select d.account_code into v_account_code
  from declared d
  where not exists (select 1 from expected e where e.account_code = d.account_code)
  order by d.account_code
  limit 1;
  if v_account_code is not null then
    raise exception 'unexpected_declaration: %', v_account_code;
  end if;
end;
$$;

revoke execute on function public.validate_cashier_declarations(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.validate_cashier_declarations(uuid,uuid,jsonb) to service_role;

-- A location-less money operation is safe only while there is exactly one
-- possible open till. This preserves legacy one-location calls and prevents
-- arbitrary attribution when locations operate concurrently.
create or replace function public.require_open_cashier_session(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session_id uuid;
  v_location_id uuid;
  v_cash_control_enabled boolean;
  v_open_count integer;
begin
  begin
    v_location_id := nullif(current_setting('app.business_location_id', true), '')::uuid;
  exception when invalid_text_representation then
    v_location_id := null;
  end;

  select c.cash_control_enabled into v_cash_control_enabled
  from public.companies c where c.id = p_company_id;
  if not coalesce(v_cash_control_enabled, false) then return null; end if;

  if v_location_id is null then
    -- Prevent a new location session from appearing after the ambiguity check
    -- but before the caller's journal lines are tagged.
    perform pg_advisory_xact_lock_shared(
      hashtextextended('cashier-session:' || p_company_id::text, 0)
    );
    select count(*), (array_agg(s.id order by s.id))[1] into v_open_count, v_session_id
    from public.cashier_sessions s
    where s.company_id = p_company_id and s.status = 'open';
    if v_open_count > 1 then
      raise exception 'business_location_required: multiple cashier sessions are open';
    end if;
  else
    select s.id into v_session_id
    from public.cashier_sessions s
    where s.company_id = p_company_id
      and s.location_id = v_location_id
      and s.status = 'open'
    for key share;
  end if;

  if v_session_id is null then
    raise exception 'cashier_session_required: open a session before recording this transaction';
  end if;

  if v_location_id is null then
    perform 1 from public.cashier_sessions s where s.id = v_session_id for key share;
  end if;
  return v_session_id;
end;
$$;

create or replace function public.post_location_variance_adjustment(
  p_company_id uuid,
  p_location_id uuid,
  p_session_id uuid,
  p_account_code text,
  p_declared bigint,
  p_count_id text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_expected bigint;
  v_variance bigint;
  v_lines jsonb;
begin
  v_expected := public.location_account_balance(p_company_id, p_location_id, p_account_code);
  v_variance := p_declared - v_expected;
  if v_variance = 0 then return null; end if;

  if v_variance < 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','CASH_SHORT_OVER','debit',-v_variance,
        'meta',jsonb_build_object('openSessionId',p_session_id,'locationId',p_location_id,'varianceReason',p_reason)),
      jsonb_build_object('account_code',p_account_code,'credit',-v_variance,
        'meta',jsonb_build_object('openSessionId',p_session_id,'locationId',p_location_id,'varianceReason',p_reason))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code',p_account_code,'debit',v_variance,
        'meta',jsonb_build_object('openSessionId',p_session_id,'locationId',p_location_id,'varianceReason',p_reason)),
      jsonb_build_object('account_code','CASH_SHORT_OVER','credit',v_variance,
        'meta',jsonb_build_object('openSessionId',p_session_id,'locationId',p_location_id,'varianceReason',p_reason))
    );
  end if;

  return public.post_journal_entry(
    p_company_id, 'VarianceAdjustment',
    p_session_id::text || '-' || p_account_code || '-' || p_count_id,
    coalesce(p_reason, 'Cash variance ' || p_account_code), v_lines
  );
end;
$$;

revoke execute on function public.post_location_variance_adjustment(uuid,uuid,uuid,text,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.post_location_variance_adjustment(uuid,uuid,uuid,text,bigint,text,text)
  to service_role;

create or replace function public.open_cashier_session_at_location(
  p_location_id uuid,
  p_declarations jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_session_id uuid;
  v_recon_id uuid;
  v_decl jsonb;
  v_declarations jsonb := coalesce(p_declarations, '[]'::jsonb);
  v_declared bigint;
  v_expected bigint;
  v_cash_declared bigint;
  v_cash_expected bigint;
  v_require_opening_count boolean;
begin
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('cashier-session:' || v_company_id::text, 0)
  );
  perform set_config('app.business_location_id', v_location_id::text, true);

  if exists (
    select 1 from public.cashier_sessions
    where company_id = v_company_id and location_id = v_location_id and status = 'open'
  ) then raise exception 'session_already_open'; end if;

  select c.require_opening_count into v_require_opening_count
  from public.companies c where c.id = v_company_id;
  if not coalesce(v_require_opening_count, true) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'account_code', x.account_code,
      'declared', public.location_account_balance(v_company_id, v_location_id, x.account_code)
    ) order by x.account_code), '[]'::jsonb)
    into v_declarations
    from (
      select distinct coalesce(lpm.ledger_account_code, pm.ledger_account_code) as account_code
      from public.payment_methods pm
      join public.location_payment_methods lpm
        on lpm.payment_method_id = pm.id and lpm.location_id = v_location_id and lpm.enabled
      where pm.company_id = v_company_id and pm.enabled
        and coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled)
    ) x;
  end if;

  perform public.validate_cashier_declarations(v_company_id, v_location_id, v_declarations);

  insert into public.cashier_sessions(company_id, location_id, cashier_user_id)
  values(v_company_id, v_location_id, auth.uid()) returning id into v_session_id;
  insert into public.reconciliations(company_id, location_id, scope, scope_ref_id, status, created_by)
  values(v_company_id, v_location_id, 'cash-session', v_session_id::text || ':opening',
    'verified', auth.uid()) returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(v_declarations)
  loop
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.location_account_balance(v_company_id, v_location_id, v_decl ->> 'account_code');
    insert into public.reconciliation_accounts(reconciliation_id, account_code, declared, expected, variance)
    values(v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected);
    if v_decl ->> 'account_code' = 'CASH_ON_HAND' then
      v_cash_declared := v_declared;
      v_cash_expected := v_expected;
    end if;
    perform public.post_location_variance_adjustment(
      v_company_id, v_location_id, v_session_id, v_decl ->> 'account_code',
      v_declared, v_recon_id::text, 'Opening count variance'
    );
  end loop;

  if v_cash_declared is not null then
    insert into public.cash_drawer_counts(
      session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by
    ) values(
      v_session_id, v_company_id, 'opening', v_cash_declared, v_cash_expected,
      v_cash_declared - v_cash_expected, auth.uid()
    );
  end if;
  return v_session_id;
end;
$$;

create or replace function public.close_cashier_session(p_session_id uuid, p_declarations jsonb)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_session public.cashier_sessions%rowtype;
  v_recon_id uuid;
  v_decl jsonb;
  v_declared bigint;
  v_expected bigint;
  v_cash_declared bigint;
  v_cash_expected bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  select * into v_session
  from public.cashier_sessions
  where id = p_session_id and company_id = v_company_id and status = 'open'
  for update;
  if v_session.id is null then raise exception 'session_not_open: %', p_session_id; end if;
  if not public.current_user_can_access_location(v_session.location_id) then
    raise exception 'location_access_denied';
  end if;

  perform set_config('app.business_location_id', v_session.location_id::text, true);
  perform public.validate_cashier_declarations(
    v_company_id, v_session.location_id, coalesce(p_declarations, 'null'::jsonb)
  );

  insert into public.reconciliations(company_id, location_id, scope, scope_ref_id, status, created_by)
  values(v_company_id, v_session.location_id, 'cash-session', p_session_id::text || ':closing',
    'verified', auth.uid()) returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(p_declarations)
  loop
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.location_account_balance(
      v_company_id, v_session.location_id, v_decl ->> 'account_code'
    );
    insert into public.reconciliation_accounts(reconciliation_id, account_code, declared, expected, variance)
    values(v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected);
    if v_decl ->> 'account_code' = 'CASH_ON_HAND' then
      v_cash_declared := v_declared;
      v_cash_expected := v_expected;
    end if;
    perform public.post_location_variance_adjustment(
      v_company_id, v_session.location_id, p_session_id, v_decl ->> 'account_code',
      v_declared, v_recon_id::text, 'Closing count variance'
    );
  end loop;

  if v_cash_declared is not null then
    insert into public.cash_drawer_counts(
      session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by
    ) values(
      p_session_id, v_company_id, 'closing', v_cash_declared, v_cash_expected,
      v_cash_declared - v_cash_expected, auth.uid()
    );
  end if;

  update public.cashier_sessions
  set status='closed', closed_at=now(), closing_declared=v_cash_declared
  where id=p_session_id;
  return p_session_id;
end;
$$;

-- Supplier balance corrections are as privileged as other supplier-credit
-- management operations.
create or replace function public.post_supplier_balance_adjustment(
  p_supplier_id uuid,
  p_amount bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lines jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required';
  end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid_amount'; end if;
  perform 1 from public.customers c
  where c.id=p_supplier_id and c.company_id=v_company_id
    and c.is_supplier and c.deleted_at is null;
  if not found then raise exception 'supplier_not_found'; end if;

  if p_amount > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','BALANCE_ADJUSTMENT','debit',p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'reason',p_reason)),
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','credit',p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'reason',p_reason))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','debit',-p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'reason',p_reason)),
      jsonb_build_object('account_code','BALANCE_ADJUSTMENT','credit',-p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'reason',p_reason))
    );
  end if;
  return public.post_journal_entry(
    v_company_id, 'SupplierBalanceAdjustment', 'supplier-balance-adj-' || gen_random_uuid(),
    coalesce(p_reason, 'Supplier balance adjustment'), v_lines
  );
end;
$$;

-- Company-only advisory key serializes the first close as well as all later
-- closes. The lock row is deliberately read only after acquiring that key.
create or replace function public.close_accounting_period(p_end_date date)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lock record;
  v_period_id uuid;
  v_method record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required';
  end if;
  if p_end_date is null or p_end_date > (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'invalid_period_end: cannot close a future period';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0));
  select * into v_lock
  from public.period_locks
  where company_id = v_company_id
  for update;

  if v_lock is not null and p_end_date <= v_lock.lock_end_date then
    raise exception 'invalid_period_end: must be after the last locked period (%)', v_lock.lock_end_date;
  end if;
  if exists (
    select 1 from public.cashier_sessions
    where company_id=v_company_id and status='open'
  ) then
    raise exception 'open_sessions_exist: close cashier sessions before closing the period';
  end if;

  for v_method in
    select pm.code, pm.ledger_account_code
    from public.payment_methods pm
    where pm.company_id=v_company_id and pm.requires_reconciliation and pm.enabled
    order by pm.code
  loop
    if not exists (
      select 1
      from public.reconciliations r
      join public.reconciliation_accounts ra on ra.reconciliation_id=r.id
      where r.company_id=v_company_id and r.status='verified'
        and r.created_at > coalesce(v_lock.updated_at, '-infinity'::timestamptz)
        and ra.account_code=v_method.ledger_account_code
    ) then
      raise exception 'reconciliation_required: method % has no verified reconciliation this period', v_method.code;
    end if;
  end loop;

  insert into public.period_locks(company_id,lock_end_date,updated_at)
  values(v_company_id,p_end_date,now())
  on conflict(company_id) do update
    set lock_end_date=excluded.lock_end_date, updated_at=excluded.updated_at;
  insert into public.accounting_periods(company_id,start_date,end_date,status,created_by)
  values(v_company_id,coalesce(v_lock.lock_end_date + 1,p_end_date),p_end_date,'closed',auth.uid())
  returning id into v_period_id;
  return v_period_id;
end;
$$;

-- Idempotency is valid only for an identical economic payload.
create or replace function public.post_journal_entry(
  p_company_id uuid,
  p_source_type text,
  p_source_id text,
  p_memo text,
  p_lines jsonb,
  p_entry_date date default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_entry_id uuid;
  v_entry_date date;
  v_payload_hash text;
  v_existing_hash text;
  v_lock_end date;
  v_debit_sum bigint;
  v_credit_sum bigint;
  v_line jsonb;
  v_account_id uuid;
  v_debit bigint;
  v_credit bigint;
begin
  select coalesce(sum((l ->> 'debit')::bigint),0),
         coalesce(sum((l ->> 'credit')::bigint),0)
  into v_debit_sum,v_credit_sum
  from jsonb_array_elements(p_lines) l;
  if v_debit_sum <> v_credit_sum or v_debit_sum = 0 then
    raise exception 'unbalanced_entry: debits % <> credits %',v_debit_sum,v_credit_sum;
  end if;

  v_entry_date := coalesce(p_entry_date,(now() at time zone 'Africa/Nairobi')::date);
  v_payload_hash := public.journal_payload_hash(v_entry_date,p_memo,p_lines);

  select pl.lock_end_date into v_lock_end
  from public.period_locks pl
  where pl.company_id=p_company_id
  for key share of pl;
  if v_lock_end is not null and v_entry_date <= v_lock_end then
    raise exception 'period_locked: entry date % is within a locked period',v_entry_date;
  end if;

  begin
    insert into public.ledger_journal_entries(
      company_id,entry_date,source_type,source_id,memo,payload_hash
    ) values(
      p_company_id,v_entry_date,p_source_type,p_source_id,p_memo,v_payload_hash
    ) returning id into v_entry_id;
  exception when unique_violation then
    select e.id,e.payload_hash into v_entry_id,v_existing_hash
    from public.ledger_journal_entries e
    where e.company_id=p_company_id and e.source_type=p_source_type and e.source_id=p_source_id;
    if v_entry_id is null then raise; end if;
    if v_existing_hash is distinct from v_payload_hash then
      raise exception 'journal_idempotency_conflict: source %/% was already posted with a different payload',
        p_source_type,p_source_id;
    end if;
    return v_entry_id;
  end;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_debit:=coalesce((v_line ->> 'debit')::bigint,0);
    v_credit:=coalesce((v_line ->> 'credit')::bigint,0);
    select a.id into v_account_id
    from public.ledger_accounts a
    where a.company_id=p_company_id and a.code=v_line ->> 'account_code'
      and a.is_active and not a.is_parent;
    if v_account_id is null then raise exception 'unknown_account: %',v_line ->> 'account_code'; end if;
    insert into public.ledger_journal_lines(
      entry_id,company_id,account_id,order_id,debit,credit,meta
    ) values(
      v_entry_id,p_company_id,v_account_id,nullif(v_line ->> 'order_id','')::uuid,
      v_debit,v_credit,coalesce(v_line -> 'meta','{}'::jsonb)
    );
  end loop;
  return v_entry_id;
end;
$$;

create or replace function public.guard_ledger_entries_immutable()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if current_setting('app.allow_ledger_mutation', true) = 'on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='DELETE' then
    raise exception 'ledger_immutable: posted journal entries cannot be deleted';
  end if;
  if old.reversal_of is null and new.reversal_of is not null
     and new.id=old.id and new.company_id=old.company_id
     and new.entry_date=old.entry_date and new.posted_at=old.posted_at
     and new.source_type=old.source_type and new.source_id=old.source_id
     and new.memo is not distinct from old.memo
     and new.payload_hash is not distinct from old.payload_hash
     and new.created_at=old.created_at then
    return new;
  end if;
  raise exception 'ledger_immutable: posted journal entries cannot be modified';
end;
$$;

create or replace function public.guard_ledger_lines_immutable()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if current_setting('app.allow_ledger_mutation', true) = 'on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='DELETE' then
    raise exception 'ledger_immutable: posted journal lines cannot be deleted';
  end if;
  if new.id=old.id and new.entry_id=old.entry_id and new.company_id=old.company_id
     and new.account_id=old.account_id and new.order_id is not distinct from old.order_id
     and new.location_id is not distinct from old.location_id
     and new.debit=old.debit and new.credit=old.credit then
    return new;
  end if;
  raise exception 'ledger_immutable: posted journal lines cannot be modified';
end;
$$;

create or replace function public.cashier_session_required_for_source(p_source_type text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select p_source_type = any(array[
    'Payment','CreditSale','PaymentAllocation','Expense','PurchaseExpense',
    'InterAccountTransfer','SupplierPayment','Refund','PaymentReversal',
    'CustomerDeposit','CustomerDepositRefund','SupplierAdvance',
    'SupplierAdvanceReturn','MixedSaleTender'
  ])
$$;

revoke execute on function public.open_cashier_session_at_location(uuid,jsonb),
  public.close_cashier_session(uuid,jsonb),
  public.post_supplier_balance_adjustment(uuid,bigint,text),
  public.close_accounting_period(date)
from public, anon;
grant execute on function public.open_cashier_session_at_location(uuid,jsonb),
  public.close_cashier_session(uuid,jsonb),
  public.post_supplier_balance_adjustment(uuid,bigint,text),
  public.close_accounting_period(date)
to authenticated;

revoke execute on function public.post_journal_entry(uuid,text,text,text,jsonb,date),
  public.guard_ledger_entries_immutable(),
  public.guard_ledger_lines_immutable(),
  public.cashier_session_required_for_source(text),
  public.require_open_cashier_session(uuid)
from public, anon, authenticated;
grant execute on function public.post_journal_entry(uuid,text,text,text,jsonb,date),
  public.guard_ledger_entries_immutable(),
  public.guard_ledger_lines_immutable(),
  public.cashier_session_required_for_source(text),
  public.require_open_cashier_session(uuid)
to service_role;

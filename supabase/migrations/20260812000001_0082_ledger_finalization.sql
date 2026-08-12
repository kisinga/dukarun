-- Seal journal entries only after their complete, balanced payload is stored.
-- Period enforcement lives at the entry boundary so every insertion path is
-- serialized against accounting-period closure.

alter table public.ledger_journal_entries
  add column finalized_at timestamptz;

create or replace function public.journal_entry_payload_hash(p_entry_id uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select public.journal_payload_hash(
    e.entry_date,
    e.memo,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_code', a.code,
        'debit', l.debit,
        'credit', l.credit,
        'order_id', l.order_id,
        'meta', l.meta
      ) order by l.id)
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id=l.account_id
      where l.entry_id=e.id
    ), '[]'::jsonb)
  )
  from public.ledger_journal_entries e
  where e.id=p_entry_id
$$;

revoke execute on function public.journal_entry_payload_hash(uuid)
  from public, anon, authenticated;
grant execute on function public.journal_entry_payload_hash(uuid) to service_role;

-- Existing entries were committed under the prior balance invariant. Compute
-- any missing hashes from their persisted lines, then seal them in place.
select set_config('app.allow_ledger_mutation', 'on', true);

update public.ledger_journal_entries e
set payload_hash=public.journal_entry_payload_hash(e.id)
where e.payload_hash is null;

update public.ledger_journal_entries e
set finalized_at=coalesce(e.posted_at,e.created_at,now())
where e.finalized_at is null;

select set_config('app.allow_ledger_mutation', 'off', true);

alter table public.ledger_journal_entries
  add constraint ledger_journal_entries_finalized_hash_chk
  check(finalized_at is null or payload_hash is not null);

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

  -- Harmless no-op updates are permitted so idempotent reversal wrappers do
  -- not fail after the reversal link has already been stamped.
  if new is not distinct from old then return new; end if;

  -- Finalization is the only normal transition for a newly assembled entry.
  if old.finalized_at is null and new.finalized_at is not null
     and new.id=old.id and new.company_id=old.company_id
     and new.entry_date=old.entry_date and new.posted_at=old.posted_at
     and new.source_type=old.source_type and new.source_id=old.source_id
     and new.reversal_of is not distinct from old.reversal_of
     and new.memo is not distinct from old.memo
     and new.payload_hash is not distinct from old.payload_hash
     and new.created_at=old.created_at then
    return new;
  end if;

  -- Reversal linkage remains a narrow, one-time post-finalization exception.
  if old.finalized_at is not null
     and new.finalized_at=old.finalized_at
     and old.reversal_of is null and new.reversal_of is not null
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
declare
  v_entry_id uuid;
  v_finalized_at timestamptz;
begin
  if current_setting('app.allow_ledger_mutation', true) = 'on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  if tg_op='UPDATE' and new.entry_id<>old.entry_id then
    raise exception 'ledger_immutable: posted journal lines cannot be reparented';
  end if;

  v_entry_id:=case when tg_op='DELETE' then old.entry_id else new.entry_id end;
  select e.finalized_at into v_finalized_at
  from public.ledger_journal_entries e where e.id=v_entry_id;
  if not found then raise exception 'journal_entry_not_found: %',v_entry_id; end if;

  if v_finalized_at is not null then
    if tg_op='DELETE' then
      raise exception 'ledger_immutable: posted journal lines cannot be deleted';
    end if;
    raise exception 'ledger_immutable: finalized journal lines cannot be modified';
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists ledger_lines_immutable on public.ledger_journal_lines;
create trigger ledger_lines_immutable
  before insert or update or delete on public.ledger_journal_lines
  for each row execute function public.guard_ledger_lines_immutable();

create or replace function public.check_journal_entry_balanced()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_finalized_at timestamptz;
  v_payload_hash text;
  v_persisted_hash text;
  v_debit bigint;
  v_credit bigint;
begin
  select e.finalized_at,e.payload_hash into v_finalized_at,v_payload_hash
  from public.ledger_journal_entries e where e.id=new.id;
  if not found then return null; end if;

  if v_finalized_at is null then
    raise exception 'ledger_unfinalized: entry % must be finalized before commit',new.id;
  end if;
  if v_payload_hash is null then
    raise exception 'ledger_payload_missing: finalized entry % has no payload hash',new.id;
  end if;

  select coalesce(sum(l.debit),0),coalesce(sum(l.credit),0)
  into v_debit,v_credit
  from public.ledger_journal_lines l where l.entry_id=new.id;
  if v_debit<>v_credit or v_debit=0 then
    raise exception 'unbalanced_entry: entry % has debits % <> credits %',new.id,v_debit,v_credit;
  end if;

  v_persisted_hash:=public.journal_entry_payload_hash(new.id);
  if v_payload_hash is distinct from v_persisted_hash then
    raise exception 'journal_payload_mismatch: finalized entry % does not match its persisted lines',new.id;
  end if;
  return null;
end;
$$;

create or replace function public.enforce_journal_entry_period_lock()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_lock_end date;
begin
  if current_setting('app.allow_ledger_mutation', true) = 'on' then return new; end if;

  perform pg_advisory_xact_lock_shared(hashtextextended(new.company_id::text,0));
  select pl.lock_end_date into v_lock_end
  from public.period_locks pl
  where pl.company_id=new.company_id
  for key share of pl;
  if v_lock_end is not null and new.entry_date<=v_lock_end then
    raise exception 'period_locked: entry date % is within a locked period',new.entry_date;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_journal_entry_period_lock()
  from public, anon, authenticated;
grant execute on function public.enforce_journal_entry_period_lock() to service_role;

drop trigger if exists ledger_entries_enforce_period_lock on public.ledger_journal_entries;
create trigger ledger_entries_enforce_period_lock
  before insert on public.ledger_journal_entries
  for each row execute function public.enforce_journal_entry_period_lock();

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
  v_existing_finalized_at timestamptz;
  v_debit_sum bigint;
  v_credit_sum bigint;
  v_line jsonb;
  v_account_id uuid;
  v_debit bigint;
  v_credit bigint;
begin
  select coalesce(sum((l->>'debit')::bigint),0),
         coalesce(sum((l->>'credit')::bigint),0)
  into v_debit_sum,v_credit_sum
  from jsonb_array_elements(p_lines) l;
  if v_debit_sum<>v_credit_sum or v_debit_sum=0 then
    raise exception 'unbalanced_entry: debits % <> credits %',v_debit_sum,v_credit_sum;
  end if;

  v_entry_date:=coalesce(p_entry_date,(now() at time zone 'Africa/Nairobi')::date);
  v_payload_hash:=public.journal_payload_hash(v_entry_date,p_memo,p_lines);

  -- Serialize identical source keys so a retry waiting behind a period close
  -- can observe and return the winning entry before attempting a new insert.
  perform pg_advisory_xact_lock(hashtextextended(
    'journal-source:'||p_company_id::text||':'||p_source_type||':'||p_source_id,0
  ));

  select e.id,e.payload_hash,e.finalized_at
  into v_entry_id,v_existing_hash,v_existing_finalized_at
  from public.ledger_journal_entries e
  where e.company_id=p_company_id and e.source_type=p_source_type and e.source_id=p_source_id;
  if v_entry_id is not null then
    if v_existing_finalized_at is null then
      raise exception 'journal_unfinalized: source %/% is still being assembled',p_source_type,p_source_id;
    end if;
    if v_existing_hash is distinct from v_payload_hash then
      raise exception 'journal_idempotency_conflict: source %/% was already posted with a different payload',
        p_source_type,p_source_id;
    end if;
    return v_entry_id;
  end if;

  begin
    insert into public.ledger_journal_entries(
      company_id,entry_date,source_type,source_id,memo,payload_hash,finalized_at
    ) values(
      p_company_id,v_entry_date,p_source_type,p_source_id,p_memo,v_payload_hash,null
    ) returning id into v_entry_id;
  exception when unique_violation then
    select e.id,e.payload_hash,e.finalized_at
    into v_entry_id,v_existing_hash,v_existing_finalized_at
    from public.ledger_journal_entries e
    where e.company_id=p_company_id and e.source_type=p_source_type and e.source_id=p_source_id;
    if v_entry_id is null then raise; end if;
    if v_existing_finalized_at is null then
      raise exception 'journal_unfinalized: source %/% is still being assembled',p_source_type,p_source_id;
    end if;
    if v_existing_hash is distinct from v_payload_hash then
      raise exception 'journal_idempotency_conflict: source %/% was already posted with a different payload',
        p_source_type,p_source_id;
    end if;
    return v_entry_id;
  end;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_debit:=coalesce((v_line->>'debit')::bigint,0);
    v_credit:=coalesce((v_line->>'credit')::bigint,0);
    select a.id into v_account_id
    from public.ledger_accounts a
    where a.company_id=p_company_id and a.code=v_line->>'account_code'
      and a.is_active and not a.is_parent;
    if v_account_id is null then raise exception 'unknown_account: %',v_line->>'account_code'; end if;
    insert into public.ledger_journal_lines(
      entry_id,company_id,account_id,order_id,debit,credit,meta
    ) values(
      v_entry_id,p_company_id,v_account_id,nullif(v_line->>'order_id','')::uuid,
      v_debit,v_credit,coalesce(v_line->'meta','{}'::jsonb)
    );
  end loop;

  update public.ledger_journal_entries
  set finalized_at=now()
  where id=v_entry_id and finalized_at is null;
  if not found then raise exception 'journal_finalize_failed: %',v_entry_id; end if;
  return v_entry_id;
end;
$$;

create or replace function public.close_accounting_period(p_end_date date)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_lock record;
  v_period_id uuid;
  v_method record;
  v_first_entry_date date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required';
  end if;
  if p_end_date is null or p_end_date>(now() at time zone 'Africa/Nairobi')::date then
    raise exception 'invalid_period_end: cannot close a future period';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0));
  select * into v_lock
  from public.period_locks
  where company_id=v_company_id
  for update;
  if v_lock is not null and p_end_date<=v_lock.lock_end_date then
    raise exception 'invalid_period_end: must be after the last locked period (%)',v_lock.lock_end_date;
  end if;
  if exists(select 1 from public.cashier_sessions where company_id=v_company_id and status='open') then
    raise exception 'open_sessions_exist: close cashier sessions before closing the period';
  end if;

  for v_method in
    select pm.code,pm.ledger_account_code
    from public.payment_methods pm
    where pm.company_id=v_company_id and pm.requires_reconciliation and pm.enabled
    order by pm.code
  loop
    if not exists(
      select 1
      from public.reconciliations r
      join public.reconciliation_accounts ra on ra.reconciliation_id=r.id
      where r.company_id=v_company_id and r.status='verified'
        and r.created_at>coalesce(v_lock.updated_at,'-infinity'::timestamptz)
        and ra.account_code=v_method.ledger_account_code
    ) then
      raise exception 'reconciliation_required: method % has no verified reconciliation this period',v_method.code;
    end if;
  end loop;

  if v_lock is null then
    select min(e.entry_date) into v_first_entry_date
    from public.ledger_journal_entries e
    where e.company_id=v_company_id and e.finalized_at is not null and e.entry_date<=p_end_date;
  end if;

  insert into public.period_locks(company_id,lock_end_date,updated_at)
  values(v_company_id,p_end_date,now())
  on conflict(company_id) do update
    set lock_end_date=excluded.lock_end_date,updated_at=excluded.updated_at;
  insert into public.accounting_periods(company_id,start_date,end_date,status,created_by)
  values(
    v_company_id,coalesce(v_lock.lock_end_date+1,v_first_entry_date,p_end_date),
    p_end_date,'closed',auth.uid()
  ) returning id into v_period_id;
  return v_period_id;
end;
$$;

revoke execute on function public.post_journal_entry(uuid,text,text,text,jsonb,date),
  public.guard_ledger_entries_immutable(),
  public.guard_ledger_lines_immutable(),
  public.check_journal_entry_balanced(),
  public.journal_entry_payload_hash(uuid)
from public,anon,authenticated;
grant execute on function public.post_journal_entry(uuid,text,text,text,jsonb,date),
  public.guard_ledger_entries_immutable(),
  public.guard_ledger_lines_immutable(),
  public.check_journal_entry_balanced(),
  public.journal_entry_payload_hash(uuid)
to service_role;

revoke execute on function public.close_accounting_period(date) from public,anon;
grant execute on function public.close_accounting_period(date) to authenticated;

-- 0021_variance_review.sql
-- Variance review: reconciliation account variances can be reviewed and
-- reverted (old system: variance action items; approve = reversal with
-- reversalOf set).

alter table public.reconciliation_accounts
  add column reviewed_at timestamptz,
  add column reviewed_by uuid;

-- ---------------------------------------------------------------------------
-- revert_variance: post a mirror reversal of the original variance entry and
-- mark the reconciliation line reviewed. Idempotent per recon account row.
-- ---------------------------------------------------------------------------
create or replace function public.revert_variance(
  p_recon_account_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_recon record;
  v_recon_parent record;
  v_entry record;
  v_line record;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_entry_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  select * into v_recon
  from public.reconciliation_accounts
  where id = p_recon_account_id
  for update;

  if v_recon is null then
    raise exception 'recon_account_not_found: %', p_recon_account_id;
  end if;

  select * into v_recon_parent
  from public.reconciliations
  where id = v_recon.reconciliation_id and company_id = v_company_id;

  if v_recon_parent is null then
    raise exception 'recon_account_not_found: %', p_recon_account_id;
  end if;

  if v_recon.variance = 0 then
    raise exception 'no_variance_to_revert';
  end if;

  if v_recon.reviewed_at is not null then
    raise exception 'already_reviewed';
  end if;

  -- Find the original variance entry: source_id = {session|manual}-{account}-{countId}.
  select * into v_entry
  from public.ledger_journal_entries e
  where e.company_id = v_company_id
    and e.source_type = 'VarianceAdjustment'
    and e.source_id like '%-' || v_recon.account_code || '-' || v_recon_parent.id::text
  limit 1;

  if v_entry is null then
    raise exception 'variance_entry_not_found for account %', v_recon.account_code;
  end if;

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
      'meta', v_line.meta || jsonb_build_object('revertedAt', now()::text)
    );
  end loop;

  v_entry_id := public.post_reversal_entry(
    v_company_id, 'VarianceAdjustmentReversal', v_entry.source_id || '-reversal',
    'Variance revert: ' || v_recon.account_code || coalesce(' — ' || p_reason, ''),
    v_reversal_lines, v_entry.id
  );

  update public.reconciliation_accounts
  set reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_recon_account_id;

  return v_entry_id;
end;
$$;

revoke execute on function public.revert_variance(uuid, text) from anon, public;
grant execute on function public.revert_variance(uuid, text) to authenticated;

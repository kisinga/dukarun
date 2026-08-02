-- 0029_manual_posting_accounts.sql
-- Marks which ledger accounts humans may transact from/to manually
-- (expense "Paid from", transfers, supplier payments) and renames the M-Pesa
-- account CLEARING_MPESA -> MPESA: it is a real money account, not a clearing
-- account. Payment-method code 'mpesa' is unchanged.
--
-- allow_manual_posting is true only for the real money accounts:
-- CASH_ON_HAND, BANK_MAIN, MPESA. Everything else (AR, INVENTORY, clearing
-- accounts, liabilities, income, expense) is system-only.
--
-- Seed blocks in 0003/0016/0023 already insert the renamed MPESA row; their
-- explicit column lists are unchanged, so the backfill below is also what
-- gives freshly provisioned companies the correct flags on a fresh DB.

alter table public.ledger_accounts
  add column if not exists allow_manual_posting boolean not null default false;

-- Rename for existing companies (no-op on fresh DBs whose seeds already
-- insert MPESA). Journal lines reference account UUIDs, so history is intact.
update public.ledger_accounts
set code = 'MPESA', name = 'M-Pesa', updated_at = now()
where code = 'CLEARING_MPESA';

update public.payment_methods
set ledger_account_code = 'MPESA', updated_at = now()
where ledger_account_code = 'CLEARING_MPESA';

-- Backfill flags for every company (existing and freshly seeded alike).
update public.ledger_accounts
set allow_manual_posting = (code in ('CASH_ON_HAND', 'BANK_MAIN', 'MPESA')),
    updated_at = now()
where allow_manual_posting <> (code in ('CASH_ON_HAND', 'BANK_MAIN', 'MPESA'));

-- ---------------------------------------------------------------------------
-- Tighten the shared account validator: user-chosen manual accounts (expense
-- source, transfer endpoints, supplier payment account) must be real money
-- accounts, not just any active asset leaf. All call sites
-- (post_expense, post_transfer, pay_supplier, record_purchase) route through
-- this function, so tightening it here covers every manual-posting RPC.
-- ---------------------------------------------------------------------------
create or replace function public.require_asset_leaf_account(p_company_id uuid, p_code text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select a.id into v_id
  from public.ledger_accounts a
  where a.company_id = p_company_id
    and a.code = p_code
    and a.type = 'asset'
    and a.is_active
    and not a.is_parent
    and a.allow_manual_posting;

  if v_id is null then
    raise exception 'invalid_source_account: %', p_code;
  end if;

  return v_id;
end;
$$;

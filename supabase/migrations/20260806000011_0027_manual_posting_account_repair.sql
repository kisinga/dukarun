-- Repair companies imported after the original manual-posting backfill ran.
-- The legacy ETL inserted these rows with the column default (false) and used
-- the obsolete CLEARING_MPESA code, leaving account pickers empty.

update public.ledger_accounts
set code = 'MPESA', name = 'M-Pesa', updated_at = now()
where code = 'CLEARING_MPESA';

update public.payment_methods
set ledger_account_code = 'MPESA', updated_at = now()
where ledger_account_code = 'CLEARING_MPESA';

update public.ledger_accounts
set allow_manual_posting = (code in ('CASH_ON_HAND', 'BANK_MAIN', 'MPESA')),
    updated_at = now()
where allow_manual_posting <> (code in ('CASH_ON_HAND', 'BANK_MAIN', 'MPESA'));

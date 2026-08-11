PRAGMA foreign_keys = ON;

-- Standalone SQLite model. It mirrors Dukarun's important PostgreSQL shapes,
-- but intentionally omits RLS and PostgreSQL locking semantics.

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
) STRICT;

-- Current Dukarun model stores suppliers in customers with is_supplier=true.
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  is_supplier INTEGER NOT NULL DEFAULT 0 CHECK (is_supplier IN (0, 1)),
  is_credit_approved INTEGER NOT NULL DEFAULT 0 CHECK (is_credit_approved IN (0, 1)),
  credit_limit INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  supplier_credit_limit INTEGER NOT NULL DEFAULT 0 CHECK (supplier_credit_limit >= 0),
  UNIQUE (company_id, id)
) STRICT;

CREATE TABLE ledger_accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  allow_manual_posting INTEGER NOT NULL DEFAULT 0 CHECK (allow_manual_posting IN (0, 1)),
  UNIQUE (company_id, code)
) STRICT;

CREATE TABLE payment_methods (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  code TEXT NOT NULL,
  ledger_account_code TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  UNIQUE (company_id, code),
  FOREIGN KEY (company_id, ledger_account_code)
    REFERENCES ledger_accounts(company_id, code)
) STRICT;

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  code TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'completed', 'voided')),
  is_credit_sale INTEGER NOT NULL DEFAULT 0 CHECK (is_credit_sale IN (0, 1)),
  UNIQUE (company_id, code)
) STRICT;

CREATE TRIGGER orders_validate_customer
BEFORE INSERT ON orders
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = NEW.customer_id AND c.company_id = NEW.company_id AND c.is_supplier = 0
  ) THEN RAISE(ABORT, 'invalid_order_customer') END;
END;

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  supplier_id TEXT NOT NULL REFERENCES customers(id),
  reference TEXT NOT NULL,
  total_cost INTEGER NOT NULL CHECK (total_cost > 0),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided')),
  is_credit INTEGER NOT NULL DEFAULT 0 CHECK (is_credit IN (0, 1)),
  UNIQUE (company_id, reference)
) STRICT;

CREATE TRIGGER purchases_validate_supplier
BEFORE INSERT ON purchases
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = NEW.supplier_id AND c.company_id = NEW.company_id AND c.is_supplier = 1
  ) THEN RAISE(ABORT, 'invalid_purchase_supplier') END;
END;

-- Posted journals are immutable. A draft entry becomes posted only when its
-- lines balance, giving SQLite a close analogue of Dukarun's ledger invariant.
CREATE TABLE ledger_journal_entries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  memo TEXT NOT NULL,
  posted INTEGER NOT NULL DEFAULT 0 CHECK (posted IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, source_type, source_id)
) STRICT;

CREATE TABLE ledger_journal_lines (
  id INTEGER PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES ledger_journal_entries(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  customer_id TEXT REFERENCES customers(id),
  supplier_id TEXT REFERENCES customers(id),
  order_id TEXT REFERENCES orders(id),
  purchase_id TEXT REFERENCES purchases(id),
  debit INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
) STRICT;

CREATE TRIGGER journal_lines_validate_scope
BEFORE INSERT ON ledger_journal_lines
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM ledger_journal_entries e
    WHERE e.id = NEW.entry_id AND e.company_id = NEW.company_id AND e.posted = 0
  ) THEN RAISE(ABORT, 'journal_entry_not_open') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM ledger_accounts a
    WHERE a.id = NEW.account_id AND a.company_id = NEW.company_id
  ) THEN RAISE(ABORT, 'journal_account_scope_mismatch') END;
END;

CREATE TRIGGER journal_entry_validate_before_post
BEFORE UPDATE OF posted ON ledger_journal_entries
WHEN OLD.posted = 0 AND NEW.posted = 1
BEGIN
  SELECT CASE WHEN
    COALESCE((SELECT SUM(debit) FROM ledger_journal_lines WHERE entry_id = NEW.id), 0) = 0
    OR COALESCE((SELECT SUM(debit) FROM ledger_journal_lines WHERE entry_id = NEW.id), 0)
       <> COALESCE((SELECT SUM(credit) FROM ledger_journal_lines WHERE entry_id = NEW.id), 0)
  THEN RAISE(ABORT, 'journal_not_balanced') END;
END;

CREATE TRIGGER posted_journal_entry_immutable
BEFORE UPDATE ON ledger_journal_entries
WHEN OLD.posted = 1
BEGIN
  SELECT RAISE(ABORT, 'posted_journal_immutable');
END;

CREATE TRIGGER posted_journal_entry_not_deletable
BEFORE DELETE ON ledger_journal_entries
WHEN OLD.posted = 1
BEGIN
  SELECT RAISE(ABORT, 'posted_journal_immutable');
END;

CREATE TRIGGER posted_journal_line_immutable_update
BEFORE UPDATE ON ledger_journal_lines
WHEN EXISTS (SELECT 1 FROM ledger_journal_entries e WHERE e.id = OLD.entry_id AND e.posted = 1)
BEGIN
  SELECT RAISE(ABORT, 'posted_journal_immutable');
END;

CREATE TRIGGER posted_journal_line_immutable_delete
BEFORE DELETE ON ledger_journal_lines
WHEN EXISTS (SELECT 1 FROM ledger_journal_entries e WHERE e.id = OLD.entry_id AND e.posted = 1)
BEGIN
  SELECT RAISE(ABORT, 'posted_journal_immutable');
END;

CREATE TABLE customer_deposits (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  method_code TEXT NOT NULL,
  reference TEXT,
  client_ref TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reversed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, client_ref)
) STRICT;

CREATE TRIGGER customer_deposits_validate_party_and_method
BEFORE INSERT ON customer_deposits
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = NEW.customer_id AND c.company_id = NEW.company_id AND c.is_supplier = 0
  ) THEN RAISE(ABORT, 'invalid_deposit_customer') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM payment_methods pm
    WHERE pm.company_id = NEW.company_id AND pm.code = NEW.method_code AND pm.enabled = 1
  ) THEN RAISE(ABORT, 'invalid_deposit_method') END;
END;

CREATE TABLE customer_deposit_allocations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  deposit_id TEXT NOT NULL REFERENCES customer_deposits(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE customer_deposit_refunds (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  deposit_id TEXT NOT NULL REFERENCES customer_deposits(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  account_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE VIEW customer_deposit_balances AS
SELECT
  d.id AS deposit_id,
  d.company_id,
  d.customer_id,
  d.amount,
  CASE WHEN d.status = 'open' THEN d.amount ELSE 0 END
    - COALESCE((SELECT SUM(a.amount) FROM customer_deposit_allocations a
                WHERE a.deposit_id = d.id AND a.status = 'active'), 0)
    - COALESCE((SELECT SUM(r.amount) FROM customer_deposit_refunds r
                WHERE r.deposit_id = d.id AND r.status = 'active'), 0) AS available
FROM customer_deposits d;

CREATE TRIGGER customer_deposit_allocations_validate
BEFORE INSERT ON customer_deposit_allocations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM customer_deposits d
    JOIN orders o ON o.id = NEW.order_id
    WHERE d.id = NEW.deposit_id
      AND d.company_id = NEW.company_id
      AND o.company_id = NEW.company_id
      AND d.customer_id = o.customer_id
      AND d.status = 'open'
      AND o.status = 'completed'
  ) THEN RAISE(ABORT, 'deposit_order_mismatch') END;
  SELECT CASE WHEN NEW.amount > COALESCE(
    (SELECT available FROM customer_deposit_balances WHERE deposit_id = NEW.deposit_id), 0
  ) THEN RAISE(ABORT, 'customer_deposit_insufficient') END;
  SELECT CASE WHEN NEW.amount > (
    SELECT o.total - COALESCE((SELECT SUM(p.amount) FROM payments p
      WHERE p.order_id = o.id AND p.status = 'settled'), 0)
    FROM orders o WHERE o.id = NEW.order_id
  ) THEN RAISE(ABORT, 'order_overpayment') END;
END;

CREATE TRIGGER customer_deposit_refunds_validate
BEFORE INSERT ON customer_deposit_refunds
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customer_deposits d
    WHERE d.id = NEW.deposit_id AND d.company_id = NEW.company_id AND d.status = 'open'
  ) THEN RAISE(ABORT, 'deposit_not_open') END;
  SELECT CASE WHEN NEW.amount > COALESCE(
    (SELECT available FROM customer_deposit_balances WHERE deposit_id = NEW.deposit_id), 0
  ) THEN RAISE(ABORT, 'customer_deposit_refund_exceeds_available') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM ledger_accounts a
    WHERE a.company_id = NEW.company_id AND a.code = NEW.account_code
      AND a.type = 'asset' AND a.allow_manual_posting = 1
  ) THEN RAISE(ABORT, 'invalid_refund_account') END;
END;

CREATE TABLE supplier_advances (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  supplier_id TEXT NOT NULL REFERENCES customers(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  account_code TEXT NOT NULL,
  reference TEXT,
  client_ref TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reversed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, client_ref)
) STRICT;

CREATE TRIGGER supplier_advances_validate_party_and_account
BEFORE INSERT ON supplier_advances
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = NEW.supplier_id AND c.company_id = NEW.company_id AND c.is_supplier = 1
  ) THEN RAISE(ABORT, 'invalid_advance_supplier') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM ledger_accounts a
    WHERE a.company_id = NEW.company_id AND a.code = NEW.account_code
      AND a.type = 'asset' AND a.allow_manual_posting = 1
  ) THEN RAISE(ABORT, 'invalid_advance_account') END;
END;

CREATE TABLE supplier_advance_allocations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  advance_id TEXT NOT NULL REFERENCES supplier_advances(id),
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE supplier_advance_refunds (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  advance_id TEXT NOT NULL REFERENCES supplier_advances(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  account_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE VIEW supplier_advance_balances AS
SELECT
  a.id AS advance_id,
  a.company_id,
  a.supplier_id,
  a.amount,
  CASE WHEN a.status = 'open' THEN a.amount ELSE 0 END
    - COALESCE((SELECT SUM(x.amount) FROM supplier_advance_allocations x
                WHERE x.advance_id = a.id AND x.status = 'active'), 0)
    - COALESCE((SELECT SUM(r.amount) FROM supplier_advance_refunds r
                WHERE r.advance_id = a.id AND r.status = 'active'), 0) AS available
FROM supplier_advances a;

CREATE TRIGGER supplier_advance_allocations_validate
BEFORE INSERT ON supplier_advance_allocations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM supplier_advances a
    JOIN purchases p ON p.id = NEW.purchase_id
    WHERE a.id = NEW.advance_id
      AND a.company_id = NEW.company_id
      AND p.company_id = NEW.company_id
      AND a.supplier_id = p.supplier_id
      AND a.status = 'open'
      AND p.status = 'posted'
  ) THEN RAISE(ABORT, 'advance_purchase_mismatch') END;
  SELECT CASE WHEN NEW.amount > COALESCE(
    (SELECT available FROM supplier_advance_balances WHERE advance_id = NEW.advance_id), 0
  ) THEN RAISE(ABORT, 'supplier_advance_insufficient') END;
  SELECT CASE WHEN NEW.amount > (
    SELECT p.total_cost - COALESCE((SELECT SUM(pp.amount) FROM purchase_payments pp
      WHERE pp.purchase_id = p.id AND pp.status = 'settled'), 0)
    FROM purchases p WHERE p.id = NEW.purchase_id
  ) THEN RAISE(ABORT, 'purchase_overpayment') END;
END;

CREATE TRIGGER supplier_advance_refunds_validate
BEFORE INSERT ON supplier_advance_refunds
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM supplier_advances a
    WHERE a.id = NEW.advance_id AND a.company_id = NEW.company_id AND a.status = 'open'
  ) THEN RAISE(ABORT, 'advance_not_open') END;
  SELECT CASE WHEN NEW.amount > COALESCE(
    (SELECT available FROM supplier_advance_balances WHERE advance_id = NEW.advance_id), 0
  ) THEN RAISE(ABORT, 'supplier_advance_refund_exceeds_available') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM ledger_accounts a
    WHERE a.company_id = NEW.company_id AND a.code = NEW.account_code
      AND a.type = 'asset' AND a.allow_manual_posting = 1
  ) THEN RAISE(ABORT, 'invalid_refund_account') END;
END;

-- Existing payment tables remain document allocations. Internal deposit and
-- advance applications are explicit settlement kinds, not new cash movement.
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  settlement_kind TEXT NOT NULL CHECK (settlement_kind IN ('tender', 'customer_deposit')),
  method_code TEXT,
  deposit_allocation_id TEXT UNIQUE REFERENCES customer_deposit_allocations(id),
  status TEXT NOT NULL DEFAULT 'settled' CHECK (status IN ('settled', 'cancelled')),
  CHECK (
    (settlement_kind = 'tender' AND method_code IS NOT NULL AND deposit_allocation_id IS NULL)
    OR
    (settlement_kind = 'customer_deposit' AND method_code IS NULL AND deposit_allocation_id IS NOT NULL)
  )
) STRICT;

CREATE TABLE purchase_payments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  settlement_kind TEXT NOT NULL CHECK (settlement_kind IN ('account', 'supplier_advance')),
  account_code TEXT,
  advance_allocation_id TEXT UNIQUE REFERENCES supplier_advance_allocations(id),
  status TEXT NOT NULL DEFAULT 'settled' CHECK (status IN ('settled', 'cancelled')),
  CHECK (
    (settlement_kind = 'account' AND account_code IS NOT NULL AND advance_allocation_id IS NULL)
    OR
    (settlement_kind = 'supplier_advance' AND account_code IS NULL AND advance_allocation_id IS NOT NULL)
  )
) STRICT;

CREATE VIEW order_settlement_balances AS
SELECT
  o.id AS order_id,
  o.company_id,
  o.customer_id,
  o.total,
  COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'settled'), 0) AS settled,
  o.total - COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'settled'), 0) AS due
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
GROUP BY o.id;

CREATE VIEW purchase_settlement_balances AS
SELECT
  p.id AS purchase_id,
  p.company_id,
  p.supplier_id,
  p.total_cost,
  COALESCE(SUM(pp.amount) FILTER (WHERE pp.status = 'settled'), 0) AS settled,
  p.total_cost - COALESCE(SUM(pp.amount) FILTER (WHERE pp.status = 'settled'), 0) AS due
FROM purchases p
LEFT JOIN purchase_payments pp ON pp.purchase_id = p.id
GROUP BY p.id;

CREATE VIEW customer_ar_balances AS
SELECT
  c.id AS customer_id,
  c.company_id,
  COALESCE(SUM(CASE WHEN a.code = 'ACCOUNTS_RECEIVABLE' AND e.posted = 1
                    THEN l.debit - l.credit ELSE 0 END), 0) AS balance
FROM customers c
LEFT JOIN ledger_journal_lines l ON l.customer_id = c.id AND l.company_id = c.company_id
LEFT JOIN ledger_journal_entries e ON e.id = l.entry_id
LEFT JOIN ledger_accounts a ON a.id = l.account_id
WHERE c.is_supplier = 0
GROUP BY c.id;

CREATE VIEW supplier_ap_balances AS
SELECT
  c.id AS supplier_id,
  c.company_id,
  COALESCE(SUM(CASE WHEN a.code = 'ACCOUNTS_PAYABLE' AND e.posted = 1
                    THEN l.credit - l.debit ELSE 0 END), 0) AS balance
FROM customers c
LEFT JOIN ledger_journal_lines l ON l.supplier_id = c.id AND l.company_id = c.company_id
LEFT JOIN ledger_journal_entries e ON e.id = l.entry_id
LEFT JOIN ledger_accounts a ON a.id = l.account_id
WHERE c.is_supplier = 1
GROUP BY c.id;

CREATE VIEW customer_deposit_ledger_balances AS
SELECT
  c.id AS customer_id,
  c.company_id,
  COALESCE(SUM(CASE WHEN a.code = 'CUSTOMER_DEPOSITS' AND e.posted = 1
                    THEN l.credit - l.debit ELSE 0 END), 0) AS balance
FROM customers c
LEFT JOIN ledger_journal_lines l ON l.customer_id = c.id AND l.company_id = c.company_id
LEFT JOIN ledger_journal_entries e ON e.id = l.entry_id
LEFT JOIN ledger_accounts a ON a.id = l.account_id
WHERE c.is_supplier = 0
GROUP BY c.id;

CREATE VIEW supplier_advance_ledger_balances AS
SELECT
  c.id AS supplier_id,
  c.company_id,
  COALESCE(SUM(CASE WHEN a.code = 'SUPPLIER_ADVANCES' AND e.posted = 1
                    THEN l.debit - l.credit ELSE 0 END), 0) AS balance
FROM customers c
LEFT JOIN ledger_journal_lines l ON l.supplier_id = c.id AND l.company_id = c.company_id
LEFT JOIN ledger_journal_entries e ON e.id = l.entry_id
LEFT JOIN ledger_accounts a ON a.id = l.account_id
WHERE c.is_supplier = 1
GROUP BY c.id;

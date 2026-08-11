import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(schemaPath, 'utf8'));

let sequence = 0;
let checks = 0;
const id = prefix => `${prefix}-${++sequence}`;

function transaction(work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function accountId(companyId, code) {
  const row = db
    .prepare('SELECT id FROM ledger_accounts WHERE company_id = ? AND code = ?')
    .get(companyId, code);
  if (!row) throw new Error(`account_not_found:${code}`);
  return row.id;
}

function postJournal(companyId, sourceType, sourceId, memo, lines) {
  const existing = db
    .prepare(
      'SELECT id FROM ledger_journal_entries WHERE company_id = ? AND source_type = ? AND source_id = ?'
    )
    .get(companyId, sourceType, sourceId);
  if (existing) return existing.id;

  const entryId = id('journal');
  db.prepare(
    `INSERT INTO ledger_journal_entries(id, company_id, source_type, source_id, memo)
     VALUES (?, ?, ?, ?, ?)`
  ).run(entryId, companyId, sourceType, sourceId, memo);

  const insertLine = db.prepare(
    `INSERT INTO ledger_journal_lines(
       entry_id, company_id, account_id, customer_id, supplier_id,
       order_id, purchase_id, debit, credit
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const line of lines) {
    insertLine.run(
      entryId,
      companyId,
      accountId(companyId, line.account),
      line.customerId ?? null,
      line.supplierId ?? null,
      line.orderId ?? null,
      line.purchaseId ?? null,
      line.debit ?? 0,
      line.credit ?? 0
    );
  }
  db.prepare('UPDATE ledger_journal_entries SET posted = 1 WHERE id = ?').run(entryId);
  return entryId;
}

function recordCustomerDeposit({
  companyId,
  customerId,
  amount,
  methodCode,
  reference,
  clientRef,
}) {
  const existing = clientRef
    ? db
        .prepare(
          `SELECT id, customer_id, amount, method_code, reference
           FROM customer_deposits WHERE company_id = ? AND client_ref = ?`
        )
        .get(companyId, clientRef)
    : null;
  if (existing) {
    if (
      existing.customer_id !== customerId ||
      existing.amount !== amount ||
      existing.method_code !== methodCode ||
      existing.reference !== (reference ?? null)
    ) {
      throw new Error('customer_deposit_idempotency_conflict');
    }
    return existing.id;
  }

  return transaction(() => {
    const depositId = id('customer-deposit');
    db.prepare(
      `INSERT INTO customer_deposits(
        id, company_id, customer_id, amount, method_code, reference, client_ref
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      depositId,
      companyId,
      customerId,
      amount,
      methodCode,
      reference ?? null,
      clientRef ?? null
    );

    const method = db
      .prepare(
        'SELECT ledger_account_code FROM payment_methods WHERE company_id = ? AND code = ? AND enabled = 1'
      )
      .get(companyId, methodCode);
    postJournal(companyId, 'CustomerDeposit', depositId, `Customer deposit ${reference ?? ''}`, [
      { account: method.ledger_account_code, debit: amount, customerId },
      { account: 'CUSTOMER_DEPOSITS', credit: amount, customerId },
    ]);
    return depositId;
  });
}

function createSale({ companyId, customerId, code, total, deposits = [], creditAmount = 0 }) {
  const depositTotal = deposits.reduce((sum, item) => sum + item.amount, 0);
  if (depositTotal + creditAmount !== total) throw new Error('sale_settlement_mismatch');

  return transaction(() => {
    const customer = db
      .prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?')
      .get(customerId, companyId);
    if (!customer || customer.is_supplier) throw new Error('invalid_order_customer');
    if (creditAmount > 0) {
      if (!customer.is_credit_approved) throw new Error('credit_not_approved');
      const currentAr = db
        .prepare('SELECT balance FROM customer_ar_balances WHERE customer_id = ?')
        .get(customerId).balance;
      if (customer.credit_limit > 0 && currentAr + creditAmount > customer.credit_limit) {
        throw new Error('credit_limit_exceeded');
      }
    }

    const orderId = id('order');
    db.prepare(
      `INSERT INTO orders(id, company_id, customer_id, code, total, status, is_credit_sale)
       VALUES (?, ?, ?, ?, ?, 'completed', ?)`
    ).run(orderId, companyId, customerId, code, total, creditAmount > 0 ? 1 : 0);

    for (const item of deposits) {
      const allocationId = id('customer-deposit-allocation');
      db.prepare(
        `INSERT INTO customer_deposit_allocations(
           id, company_id, deposit_id, order_id, amount
         ) VALUES (?, ?, ?, ?, ?)`
      ).run(allocationId, companyId, item.depositId, orderId, item.amount);
      db.prepare(
        `INSERT INTO payments(
           id, company_id, order_id, amount, settlement_kind, deposit_allocation_id
         ) VALUES (?, ?, ?, ?, 'customer_deposit', ?)`
      ).run(id('payment'), companyId, orderId, item.amount, allocationId);
    }

    const lines = [];
    if (depositTotal > 0) {
      lines.push({
        account: 'CUSTOMER_DEPOSITS',
        debit: depositTotal,
        customerId,
        orderId,
      });
    }
    if (creditAmount > 0) {
      lines.push({
        account: 'ACCOUNTS_RECEIVABLE',
        debit: creditAmount,
        customerId,
        orderId,
      });
    }
    lines.push({ account: 'SALES', credit: total, customerId, orderId });
    postJournal(companyId, 'SaleSettlement', orderId, `Sale ${code}`, lines);
    return orderId;
  });
}

function applyCustomerDeposit({ companyId, depositId, orderId, amount }) {
  return transaction(() => {
    const order = db
      .prepare('SELECT * FROM orders WHERE id = ? AND company_id = ?')
      .get(orderId, companyId);
    if (!order || order.status !== 'completed') throw new Error('order_not_open');

    const allocationId = id('customer-deposit-allocation');
    db.prepare(
      `INSERT INTO customer_deposit_allocations(
         id, company_id, deposit_id, order_id, amount
       ) VALUES (?, ?, ?, ?, ?)`
    ).run(allocationId, companyId, depositId, orderId, amount);
    db.prepare(
      `INSERT INTO payments(
         id, company_id, order_id, amount, settlement_kind, deposit_allocation_id
       ) VALUES (?, ?, ?, ?, 'customer_deposit', ?)`
    ).run(id('payment'), companyId, orderId, amount, allocationId);
    postJournal(
      companyId,
      'CustomerDepositApplication',
      allocationId,
      `Apply customer deposit to ${order.code}`,
      [
        {
          account: 'CUSTOMER_DEPOSITS',
          debit: amount,
          customerId: order.customer_id,
          orderId,
        },
        {
          account: 'ACCOUNTS_RECEIVABLE',
          credit: amount,
          customerId: order.customer_id,
          orderId,
        },
      ]
    );
    return allocationId;
  });
}

function reverseSale({ companyId, orderId }) {
  return transaction(() => {
    const order = db
      .prepare('SELECT * FROM orders WHERE id = ? AND company_id = ?')
      .get(orderId, companyId);
    if (!order || order.status !== 'completed') throw new Error('sale_not_reversible');

    const totals = db
      .prepare(
        `SELECT a.code AS account,
                SUM(l.debit) AS debit,
                SUM(l.credit) AS credit
         FROM ledger_journal_lines l
         JOIN ledger_journal_entries e ON e.id = l.entry_id AND e.posted = 1
         JOIN ledger_accounts a ON a.id = l.account_id
         WHERE l.company_id = ? AND l.order_id = ?
           AND e.source_type <> 'OrderReversal'
         GROUP BY a.code`
      )
      .all(companyId, orderId);

    postJournal(
      companyId,
      'OrderReversal',
      `${orderId}-reversal`,
      `Reverse sale ${order.code}`,
      totals.flatMap(row => [
        ...(row.credit > 0
          ? [
              {
                account: row.account,
                debit: row.credit,
                customerId: order.customer_id,
                orderId,
              },
            ]
          : []),
        ...(row.debit > 0
          ? [
              {
                account: row.account,
                credit: row.debit,
                customerId: order.customer_id,
                orderId,
              },
            ]
          : []),
      ])
    );
    db.prepare(
      `UPDATE customer_deposit_allocations SET status = 'reversed'
       WHERE order_id = ? AND status = 'active'`
    ).run(orderId);
    db.prepare("UPDATE payments SET status = 'cancelled' WHERE order_id = ?").run(orderId);
    db.prepare("UPDATE orders SET status = 'voided' WHERE id = ?").run(orderId);
  });
}

function refundCustomerDeposit({ companyId, depositId, amount, accountCode }) {
  return transaction(() => {
    const deposit = db
      .prepare('SELECT * FROM customer_deposits WHERE id = ? AND company_id = ?')
      .get(depositId, companyId);
    if (!deposit) throw new Error('deposit_not_found');
    const refundId = id('customer-deposit-refund');
    db.prepare(
      `INSERT INTO customer_deposit_refunds(
         id, company_id, deposit_id, amount, account_code
       ) VALUES (?, ?, ?, ?, ?)`
    ).run(refundId, companyId, depositId, amount, accountCode);
    postJournal(companyId, 'CustomerDepositRefund', refundId, 'Refund customer deposit', [
      { account: 'CUSTOMER_DEPOSITS', debit: amount, customerId: deposit.customer_id },
      { account: accountCode, credit: amount, customerId: deposit.customer_id },
    ]);
    return refundId;
  });
}

function recordSupplierAdvance({
  companyId,
  supplierId,
  amount,
  accountCode,
  reference,
  clientRef,
}) {
  const existing = clientRef
    ? db
        .prepare(
          `SELECT id, supplier_id, amount, account_code, reference
           FROM supplier_advances WHERE company_id = ? AND client_ref = ?`
        )
        .get(companyId, clientRef)
    : null;
  if (existing) {
    if (
      existing.supplier_id !== supplierId ||
      existing.amount !== amount ||
      existing.account_code !== accountCode ||
      existing.reference !== (reference ?? null)
    ) {
      throw new Error('supplier_advance_idempotency_conflict');
    }
    return existing.id;
  }

  return transaction(() => {
    const advanceId = id('supplier-advance');
    db.prepare(
      `INSERT INTO supplier_advances(
         id, company_id, supplier_id, amount, account_code, reference, client_ref
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      advanceId,
      companyId,
      supplierId,
      amount,
      accountCode,
      reference ?? null,
      clientRef ?? null
    );
    postJournal(companyId, 'SupplierAdvance', advanceId, `Supplier advance ${reference ?? ''}`, [
      { account: 'SUPPLIER_ADVANCES', debit: amount, supplierId },
      { account: accountCode, credit: amount, supplierId },
    ]);
    return advanceId;
  });
}

function createPurchase({
  companyId,
  supplierId,
  reference,
  total,
  advances = [],
  creditAmount = 0,
}) {
  const advanceTotal = advances.reduce((sum, item) => sum + item.amount, 0);
  if (advanceTotal + creditAmount !== total) throw new Error('purchase_settlement_mismatch');

  return transaction(() => {
    const supplier = db
      .prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?')
      .get(supplierId, companyId);
    if (!supplier || !supplier.is_supplier) throw new Error('invalid_purchase_supplier');
    const currentAp = db
      .prepare('SELECT balance FROM supplier_ap_balances WHERE supplier_id = ?')
      .get(supplierId).balance;
    if (
      supplier.supplier_credit_limit > 0 &&
      currentAp + creditAmount > supplier.supplier_credit_limit
    ) {
      throw new Error('supplier_credit_limit_exceeded');
    }

    const purchaseId = id('purchase');
    db.prepare(
      `INSERT INTO purchases(
         id, company_id, supplier_id, reference, total_cost, is_credit
       ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(purchaseId, companyId, supplierId, reference, total, creditAmount > 0 ? 1 : 0);

    for (const item of advances) {
      const allocationId = id('supplier-advance-allocation');
      db.prepare(
        `INSERT INTO supplier_advance_allocations(
           id, company_id, advance_id, purchase_id, amount
         ) VALUES (?, ?, ?, ?, ?)`
      ).run(allocationId, companyId, item.advanceId, purchaseId, item.amount);
      db.prepare(
        `INSERT INTO purchase_payments(
           id, company_id, purchase_id, amount, settlement_kind, advance_allocation_id
         ) VALUES (?, ?, ?, ?, 'supplier_advance', ?)`
      ).run(id('purchase-payment'), companyId, purchaseId, item.amount, allocationId);
    }

    const lines = [{ account: 'INVENTORY', debit: total, supplierId, purchaseId }];
    if (advanceTotal > 0) {
      lines.push({
        account: 'SUPPLIER_ADVANCES',
        credit: advanceTotal,
        supplierId,
        purchaseId,
      });
    }
    if (creditAmount > 0) {
      lines.push({ account: 'ACCOUNTS_PAYABLE', credit: creditAmount, supplierId, purchaseId });
    }
    postJournal(companyId, 'PurchaseSettlement', purchaseId, `Purchase ${reference}`, lines);
    return purchaseId;
  });
}

function applySupplierAdvance({ companyId, advanceId, purchaseId, amount }) {
  return transaction(() => {
    const purchase = db
      .prepare('SELECT * FROM purchases WHERE id = ? AND company_id = ?')
      .get(purchaseId, companyId);
    if (!purchase || purchase.status !== 'posted') throw new Error('purchase_not_open');
    const allocationId = id('supplier-advance-allocation');
    db.prepare(
      `INSERT INTO supplier_advance_allocations(
         id, company_id, advance_id, purchase_id, amount
       ) VALUES (?, ?, ?, ?, ?)`
    ).run(allocationId, companyId, advanceId, purchaseId, amount);
    db.prepare(
      `INSERT INTO purchase_payments(
         id, company_id, purchase_id, amount, settlement_kind, advance_allocation_id
       ) VALUES (?, ?, ?, ?, 'supplier_advance', ?)`
    ).run(id('purchase-payment'), companyId, purchaseId, amount, allocationId);
    postJournal(
      companyId,
      'SupplierAdvanceApplication',
      allocationId,
      `Apply supplier advance to ${purchase.reference}`,
      [
        {
          account: 'ACCOUNTS_PAYABLE',
          debit: amount,
          supplierId: purchase.supplier_id,
          purchaseId,
        },
        {
          account: 'SUPPLIER_ADVANCES',
          credit: amount,
          supplierId: purchase.supplier_id,
          purchaseId,
        },
      ]
    );
    return allocationId;
  });
}

function reverseSupplierAdvanceApplication({ companyId, allocationId }) {
  return transaction(() => {
    const allocation = db
      .prepare(
        `SELECT a.*, p.supplier_id
         FROM supplier_advance_allocations a
         JOIN purchases p ON p.id = a.purchase_id
         WHERE a.id = ? AND a.company_id = ? AND a.status = 'active'`
      )
      .get(allocationId, companyId);
    if (!allocation) throw new Error('advance_application_not_reversible');
    const original = db
      .prepare(
        `SELECT a.code AS account, l.debit, l.credit
         FROM ledger_journal_entries e
         JOIN ledger_journal_lines l ON l.entry_id = e.id
         JOIN ledger_accounts a ON a.id = l.account_id
         WHERE e.company_id = ? AND e.source_type = 'SupplierAdvanceApplication'
           AND e.source_id = ? AND e.posted = 1`
      )
      .all(companyId, allocationId);
    if (original.length === 0) throw new Error('advance_application_not_separate');
    postJournal(
      companyId,
      'SupplierAdvanceApplicationReversal',
      `${allocationId}-reversal`,
      'Reverse supplier advance application',
      original.map(line => ({
        account: line.account,
        debit: line.credit,
        credit: line.debit,
        supplierId: allocation.supplier_id,
        purchaseId: allocation.purchase_id,
      }))
    );
    db.prepare("UPDATE supplier_advance_allocations SET status = 'reversed' WHERE id = ?").run(
      allocationId
    );
    db.prepare(
      "UPDATE purchase_payments SET status = 'cancelled' WHERE advance_allocation_id = ?"
    ).run(allocationId);
    db.prepare('UPDATE purchases SET is_credit = 1 WHERE id = ?').run(allocation.purchase_id);
  });
}

function refundSupplierAdvance({ companyId, advanceId, amount, accountCode }) {
  return transaction(() => {
    const advance = db
      .prepare('SELECT * FROM supplier_advances WHERE id = ? AND company_id = ?')
      .get(advanceId, companyId);
    if (!advance) throw new Error('advance_not_found');
    const refundId = id('supplier-advance-refund');
    db.prepare(
      `INSERT INTO supplier_advance_refunds(
         id, company_id, advance_id, amount, account_code
       ) VALUES (?, ?, ?, ?, ?)`
    ).run(refundId, companyId, advanceId, amount, accountCode);
    postJournal(companyId, 'SupplierAdvanceRefund', refundId, 'Supplier returned advance', [
      { account: accountCode, debit: amount, supplierId: advance.supplier_id },
      { account: 'SUPPLIER_ADVANCES', credit: amount, supplierId: advance.supplier_id },
    ]);
    return refundId;
  });
}

function scalar(sql, ...params) {
  return Object.values(db.prepare(sql).get(...params))[0];
}

function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  checks += 1;
}

function expectError(work, expectedMessage, message) {
  assert.throws(work, error => error.message.includes(expectedMessage), message);
  checks += 1;
}

function seed() {
  db.exec(`
    INSERT INTO companies VALUES ('company-1', 'Prototype Store');
    INSERT INTO companies VALUES ('company-2', 'Other Store');

    INSERT INTO customers(id, company_id, name, is_supplier, is_credit_approved, credit_limit)
    VALUES ('customer-1', 'company-1', 'Amina', 0, 1, 20000);
    INSERT INTO customers(id, company_id, name, is_supplier, is_credit_approved, credit_limit)
    VALUES ('customer-2', 'company-1', 'Kamau', 0, 1, 20000);
    INSERT INTO customers(id, company_id, name, is_supplier, supplier_credit_limit)
    VALUES ('supplier-1', 'company-1', 'Wholesale Ltd', 1, 30000);
    INSERT INTO customers(id, company_id, name, is_supplier, supplier_credit_limit)
    VALUES ('supplier-2', 'company-1', 'Other Supplier', 1, 30000);
    INSERT INTO customers(id, company_id, name, is_supplier, is_credit_approved, credit_limit)
    VALUES ('customer-other-company', 'company-2', 'Other Tenant', 0, 1, 20000);
  `);

  const accounts = [
    ['CASH_ON_HAND', 'Cash on Hand', 'asset', 1],
    ['BANK_MAIN', 'Bank', 'asset', 1],
    ['ACCOUNTS_RECEIVABLE', 'Accounts Receivable', 'asset', 0],
    ['CUSTOMER_DEPOSITS', 'Customer Deposits', 'liability', 0],
    ['INVENTORY', 'Inventory', 'asset', 0],
    ['SUPPLIER_ADVANCES', 'Supplier Advances', 'asset', 0],
    ['ACCOUNTS_PAYABLE', 'Accounts Payable', 'liability', 0],
    ['SALES', 'Sales', 'income', 0],
  ];
  const insertAccount = db.prepare(
    `INSERT INTO ledger_accounts(id, company_id, code, name, type, allow_manual_posting)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const companyId of ['company-1', 'company-2']) {
    for (const [code, name, type, manual] of accounts) {
      insertAccount.run(`${companyId}:${code}`, companyId, code, name, type, manual);
    }
    db.prepare(
      `INSERT INTO payment_methods(id, company_id, code, ledger_account_code)
       VALUES (?, ?, 'cash', 'CASH_ON_HAND')`
    ).run(`${companyId}:cash`, companyId);
  }
}

seed();

const depositId = recordCustomerDeposit({
  companyId: 'company-1',
  customerId: 'customer-1',
  amount: 10000,
  methodCode: 'cash',
  reference: 'DEP-001',
  clientRef: 'deposit-client-1',
});
equal(
  recordCustomerDeposit({
    companyId: 'company-1',
    customerId: 'customer-1',
    amount: 10000,
    methodCode: 'cash',
    reference: 'DEP-001',
    clientRef: 'deposit-client-1',
  }),
  depositId,
  'customer deposit receipt is idempotent'
);
expectError(
  () =>
    recordCustomerDeposit({
      companyId: 'company-1',
      customerId: 'customer-1',
      amount: 10001,
      methodCode: 'cash',
      reference: 'DEP-001',
      clientRef: 'deposit-client-1',
    }),
  'customer_deposit_idempotency_conflict',
  'customer deposit idempotency keys reject changed payloads'
);
equal(scalar('SELECT COUNT(*) FROM orders'), 0, 'customer deposit needs no sale');
equal(
  scalar('SELECT available FROM customer_deposit_balances WHERE deposit_id = ?', depositId),
  10000,
  'customer deposit starts fully available'
);
equal(
  scalar(
    'SELECT balance FROM customer_deposit_ledger_balances WHERE customer_id = ?',
    'customer-1'
  ),
  10000,
  'customer deposit posts a liability'
);
equal(
  scalar('SELECT balance FROM customer_ar_balances WHERE customer_id = ?', 'customer-1'),
  0,
  'unapplied customer deposit does not distort AR'
);

expectError(
  () =>
    recordCustomerDeposit({
      companyId: 'company-2',
      customerId: 'customer-1',
      amount: 100,
      methodCode: 'cash',
      clientRef: 'cross-tenant-deposit',
    }),
  'invalid_deposit_customer',
  'cross-company customer deposit is rejected'
);

const otherOrderId = createSale({
  companyId: 'company-1',
  customerId: 'customer-2',
  code: 'SALE-OTHER',
  total: 1000,
  creditAmount: 1000,
});
expectError(
  () =>
    applyCustomerDeposit({
      companyId: 'company-1',
      depositId,
      orderId: otherOrderId,
      amount: 100,
    }),
  'deposit_order_mismatch',
  'deposit cannot settle another customer sale'
);

const orderId = createSale({
  companyId: 'company-1',
  customerId: 'customer-1',
  code: 'SALE-001',
  total: 15000,
  deposits: [{ depositId, amount: 6000 }],
  creditAmount: 9000,
});
equal(
  scalar('SELECT available FROM customer_deposit_balances WHERE deposit_id = ?', depositId),
  4000,
  'sale consumes only selected customer deposit amount'
);
equal(
  scalar('SELECT balance FROM customer_ar_balances WHERE customer_id = ?', 'customer-1'),
  9000,
  'only residual sale amount enters AR'
);
equal(
  scalar('SELECT due FROM order_settlement_balances WHERE order_id = ?', orderId),
  9000,
  'order projection agrees with residual credit'
);

applyCustomerDeposit({ companyId: 'company-1', depositId, orderId, amount: 4000 });
equal(
  scalar('SELECT available FROM customer_deposit_balances WHERE deposit_id = ?', depositId),
  0,
  'later allocation consumes remaining customer deposit'
);
equal(
  scalar('SELECT balance FROM customer_ar_balances WHERE customer_id = ?', 'customer-1'),
  5000,
  'later deposit application reduces AR'
);
expectError(
  () => applyCustomerDeposit({ companyId: 'company-1', depositId, orderId, amount: 1 }),
  'customer_deposit_insufficient',
  'customer deposit cannot be over-allocated'
);

reverseSale({ companyId: 'company-1', orderId });
equal(
  scalar('SELECT available FROM customer_deposit_balances WHERE deposit_id = ?', depositId),
  10000,
  'sale reversal restores customer deposit availability'
);
equal(
  scalar('SELECT balance FROM customer_ar_balances WHERE customer_id = ?', 'customer-1'),
  0,
  'sale reversal removes residual AR'
);

refundCustomerDeposit({
  companyId: 'company-1',
  depositId,
  amount: 3000,
  accountCode: 'CASH_ON_HAND',
});
equal(
  scalar('SELECT available FROM customer_deposit_balances WHERE deposit_id = ?', depositId),
  7000,
  'customer deposit refund reduces available amount'
);
expectError(
  () =>
    refundCustomerDeposit({
      companyId: 'company-1',
      depositId,
      amount: 8000,
      accountCode: 'CASH_ON_HAND',
    }),
  'customer_deposit_refund_exceeds_available',
  'customer deposit cannot be over-refunded'
);
equal(
  scalar(
    'SELECT balance FROM customer_deposit_ledger_balances WHERE customer_id = ?',
    'customer-1'
  ),
  7000,
  'customer deposit subledger ties to liability account'
);

const advanceId = recordSupplierAdvance({
  companyId: 'company-1',
  supplierId: 'supplier-1',
  amount: 12000,
  accountCode: 'BANK_MAIN',
  reference: 'ADV-001',
  clientRef: 'advance-client-1',
});
equal(
  recordSupplierAdvance({
    companyId: 'company-1',
    supplierId: 'supplier-1',
    amount: 12000,
    accountCode: 'BANK_MAIN',
    reference: 'ADV-001',
    clientRef: 'advance-client-1',
  }),
  advanceId,
  'supplier advance is idempotent'
);
expectError(
  () =>
    recordSupplierAdvance({
      companyId: 'company-1',
      supplierId: 'supplier-1',
      amount: 12001,
      accountCode: 'BANK_MAIN',
      reference: 'ADV-001',
      clientRef: 'advance-client-1',
    }),
  'supplier_advance_idempotency_conflict',
  'supplier advance idempotency keys reject changed payloads'
);
equal(scalar('SELECT COUNT(*) FROM purchases'), 0, 'supplier advance needs no purchase');
equal(
  scalar('SELECT available FROM supplier_advance_balances WHERE advance_id = ?', advanceId),
  12000,
  'supplier advance starts fully available'
);
equal(
  scalar(
    'SELECT balance FROM supplier_advance_ledger_balances WHERE supplier_id = ?',
    'supplier-1'
  ),
  12000,
  'supplier advance posts an asset'
);
equal(
  scalar('SELECT balance FROM supplier_ap_balances WHERE supplier_id = ?', 'supplier-1'),
  0,
  'unapplied supplier advance does not distort AP'
);

const purchaseId = createPurchase({
  companyId: 'company-1',
  supplierId: 'supplier-1',
  reference: 'PUR-001',
  total: 20000,
  advances: [{ advanceId, amount: 7000 }],
  creditAmount: 13000,
});
equal(
  scalar('SELECT available FROM supplier_advance_balances WHERE advance_id = ?', advanceId),
  5000,
  'purchase consumes selected supplier advance amount'
);
equal(
  scalar('SELECT balance FROM supplier_ap_balances WHERE supplier_id = ?', 'supplier-1'),
  13000,
  'only purchase residual enters AP'
);

const laterSupplierAllocationId = applySupplierAdvance({
  companyId: 'company-1',
  advanceId,
  purchaseId,
  amount: 5000,
});
equal(
  scalar('SELECT due FROM purchase_settlement_balances WHERE purchase_id = ?', purchaseId),
  8000,
  'later supplier advance application reduces purchase due'
);
equal(
  scalar('SELECT balance FROM supplier_ap_balances WHERE supplier_id = ?', 'supplier-1'),
  8000,
  'later supplier advance application reduces AP'
);
expectError(
  () => applySupplierAdvance({ companyId: 'company-1', advanceId, purchaseId, amount: 1 }),
  'supplier_advance_insufficient',
  'supplier advance cannot be over-allocated'
);

reverseSupplierAdvanceApplication({
  companyId: 'company-1',
  allocationId: laterSupplierAllocationId,
});
equal(
  scalar('SELECT available FROM supplier_advance_balances WHERE advance_id = ?', advanceId),
  5000,
  'supplier application reversal restores advance'
);
equal(
  scalar('SELECT balance FROM supplier_ap_balances WHERE supplier_id = ?', 'supplier-1'),
  13000,
  'supplier application reversal restores AP'
);

refundSupplierAdvance({
  companyId: 'company-1',
  advanceId,
  amount: 2000,
  accountCode: 'BANK_MAIN',
});
equal(
  scalar('SELECT available FROM supplier_advance_balances WHERE advance_id = ?', advanceId),
  3000,
  'supplier refund reduces unused advance'
);
equal(
  scalar(
    'SELECT balance FROM supplier_advance_ledger_balances WHERE supplier_id = ?',
    'supplier-1'
  ),
  3000,
  'supplier advance subledger ties to asset account'
);

expectError(
  () =>
    transaction(() => {
      const entryId = id('unbalanced');
      db.prepare(
        `INSERT INTO ledger_journal_entries(id, company_id, source_type, source_id, memo)
         VALUES (?, 'company-1', 'BadEntry', ?, 'Must fail')`
      ).run(entryId, entryId);
      db.prepare(
        `INSERT INTO ledger_journal_lines(entry_id, company_id, account_id, debit, credit)
         VALUES (?, 'company-1', ?, 100, 0)`
      ).run(entryId, accountId('company-1', 'CASH_ON_HAND'));
      db.prepare('UPDATE ledger_journal_entries SET posted = 1 WHERE id = ?').run(entryId);
    }),
  'journal_not_balanced',
  'unbalanced journal cannot post'
);

const immutableLineId = scalar(
  `SELECT l.id FROM ledger_journal_lines l
   JOIN ledger_journal_entries e ON e.id = l.entry_id
   WHERE e.posted = 1 LIMIT 1`
);
expectError(
  () =>
    db
      .prepare('UPDATE ledger_journal_lines SET debit = debit + 1 WHERE id = ?')
      .run(immutableLineId),
  'posted_journal_immutable',
  'posted journal lines are immutable'
);

equal(
  scalar(
    `SELECT COUNT(*) FROM (
       SELECT e.id
       FROM ledger_journal_entries e
       JOIN ledger_journal_lines l ON l.entry_id = e.id
       WHERE e.posted = 1
       GROUP BY e.id
       HAVING SUM(l.debit) <> SUM(l.credit)
     )`
  ),
  0,
  'every posted journal remains balanced'
);
equal(
  scalar(
    `SELECT COALESCE(SUM(available), 0) FROM customer_deposit_balances
     WHERE company_id = 'company-1' AND customer_id = 'customer-1'`
  ),
  scalar(
    `SELECT balance FROM customer_deposit_ledger_balances
     WHERE company_id = 'company-1' AND customer_id = 'customer-1'`
  ),
  'customer operational subledger ties to general ledger'
);
equal(
  scalar(
    `SELECT COALESCE(SUM(available), 0) FROM supplier_advance_balances
     WHERE company_id = 'company-1' AND supplier_id = 'supplier-1'`
  ),
  scalar(
    `SELECT balance FROM supplier_advance_ledger_balances
     WHERE company_id = 'company-1' AND supplier_id = 'supplier-1'`
  ),
  'supplier operational subledger ties to general ledger'
);

console.log(`prepayment prototype: ${checks} correctness checks passed`);

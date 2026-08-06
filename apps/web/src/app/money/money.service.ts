import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';
import { LocationContextService } from '../core/location-context.service';
import { PartyCacheService } from '../core/party-cache.service';

export type LedgerAccount = Database['public']['Tables']['ledger_accounts']['Row'];
export type JournalEntry = Database['public']['Tables']['ledger_journal_entries']['Row'];
export type JournalLine = Database['public']['Tables']['ledger_journal_lines']['Row'];
export type CashierSession = Database['public']['Tables']['cashier_sessions']['Row'];
export type DrawerCount = Database['public']['Tables']['cash_drawer_counts']['Row'];
export type AccountingPeriod = Database['public']['Tables']['accounting_periods']['Row'];
export type PeriodLock = Database['public']['Tables']['period_locks']['Row'];
export type Purchase = Database['public']['Tables']['purchases']['Row'];
export type PurchasePayment = Database['public']['Tables']['purchase_payments']['Row'];
export type PurchaseDraft = Database['public']['Tables']['purchase_drafts']['Row'];
export type PurchaseLine = Database['public']['Tables']['purchase_lines']['Row'];
export type SupplierVariantPerformance =
  Database['public']['Views']['supplier_variant_performance']['Row'];
export type MoneyCustomer = Database['public']['Tables']['customers']['Row'];
export type ReconAccount = Database['public']['Tables']['reconciliation_accounts']['Row'];
export type Reconciliation = Database['public']['Tables']['reconciliations']['Row'];
export type CustomerStatementRow = {
  id: string;
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

export type ReconAccountWithParent = ReconAccount & {
  reconciliations: Pick<Reconciliation, 'id' | 'scope' | 'scope_ref_id' | 'created_at'> | null;
};

export type AgingInfo = {
  days_outstanding: number | null;
  bucket: string | null;
};

export type JournalLineWithAccount = JournalLine & {
  ledger_accounts: Pick<LedgerAccount, 'code' | 'name'> | null;
};
export type JournalEntryWithLines = JournalEntry & {
  ledger_journal_lines: JournalLineWithAccount[];
};
export type SessionWithCounts = CashierSession & { cash_drawer_counts: DrawerCount[] };
export type LedgerAccountWithBalance = LedgerAccount & { balance: number };

/** Declaration item for cashier sessions and manual reconciliation. */
export interface Declaration {
  account_code: string;
  declared: number; // shillings
  reason?: string;
}

/** Cashier-controlled account derived from an enabled payment method. */
export interface CashierAccount {
  account_code: string;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class MoneyService {
  private readonly supabase = inject(SupabaseService);
  private readonly locations = inject(LocationContextService);
  private readonly parties = inject(PartyCacheService);

  private get db() {
    return this.supabase.client;
  }

  // --- Reads ---

  /** Real money accounts (allow_manual_posting) — the account picker source. */
  async transactableAccounts(): Promise<LedgerAccount[]> {
    const { data, error } = await this.db
      .from('ledger_accounts')
      .select('*')
      .eq('allow_manual_posting', true)
      .eq('is_active', true)
      .order('code');
    if (error) throw error;
    return data;
  }

  /** Cashier-controlled accounts from enabled payment methods (cash→CASH_ON_HAND, mpesa→MPESA). */
  async cashierAccounts(): Promise<CashierAccount[]> {
    const { data, error } = await this.db.rpc('available_payment_methods', {
      p_location_id: this.locations.requireActiveId(),
    });
    if (error) throw error;
    return data
      .filter(method => method.is_cashier_controlled)
      .map(method => ({ account_code: method.ledger_account_code, label: method.name }));
  }

  /** Enabled non-credit payment method codes (for repayment/allocation selects). */
  async enabledMethodCodes(): Promise<string[]> {
    const { data, error } = await this.db.rpc('available_payment_methods', {
      p_location_id: this.locations.requireActiveId(),
    });
    if (error) throw error;
    return data.filter(method => method.code !== 'credit').map(method => method.code);
  }

  async journalBySource(sourceType: string, limit = 20): Promise<JournalEntryWithLines[]> {
    const { data, error } = await this.db
      .from('ledger_journal_entries')
      .select('*, ledger_journal_lines!entry_id(*, ledger_accounts(code, name))')
      .eq('source_type', sourceType)
      .order('posted_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async ledgerAccountsWithBalances(): Promise<LedgerAccountWithBalance[]> {
    const [{ data: accounts, error: accountError }, { data: lines, error: lineError }] =
      await Promise.all([
        this.db.from('ledger_accounts').select('*').order('code'),
        this.db.from('ledger_journal_lines').select('account_id, debit, credit'),
      ]);
    if (accountError) throw accountError;
    if (lineError) throw lineError;
    const balances = new Map<string, number>();
    for (const line of lines ?? []) {
      balances.set(
        line.account_id,
        (balances.get(line.account_id) ?? 0) + line.debit - line.credit
      );
    }
    return (accounts ?? []).map(account => ({
      ...account,
      balance: balances.get(account.id) ?? 0,
    }));
  }

  async journalPage(input: {
    page: number;
    pageSize: number;
    search?: string;
    accountCode?: string;
    sourceType?: string;
    from?: string;
    to?: string;
  }): Promise<{ rows: JournalEntryWithLines[]; count: number }> {
    // Account filter needs inner joins so only entries touching that account
    // match (and their embedded lines are that account's lines).
    const select = input.accountCode
      ? '*, ledger_journal_lines!entry_id!inner(*, ledger_accounts!inner(code, name))'
      : '*, ledger_journal_lines!entry_id(*, ledger_accounts(code, name))';
    let query = this.db.from('ledger_journal_entries').select(select, { count: 'exact' });
    if (input.accountCode) {
      query = query.eq('ledger_journal_lines.ledger_accounts.code', input.accountCode);
    }
    if (input.search?.trim()) {
      const pattern = `%${input.search.trim().replace(/[%_,()]/g, ' ')}%`;
      query = query.or(`memo.ilike.${pattern},source_id.ilike.${pattern}`);
    }
    if (input.sourceType) query = query.eq('source_type', input.sourceType);
    if (input.from) query = query.gte('posted_at', `${input.from}T00:00:00`);
    if (input.to) query = query.lt('posted_at', `${input.to}T23:59:59.999`);
    const start = (input.page - 1) * input.pageSize;
    const { data, error, count } = await query
      .order('posted_at', { ascending: false })
      .range(start, start + input.pageSize - 1);
    if (error) throw error;
    return { rows: data ?? [], count: count ?? 0 };
  }

  async openSession(): Promise<CashierSession | null> {
    const { data, error } = await this.db
      .from('cashier_sessions')
      .select('*')
      .eq('status', 'open')
      .eq('location_id', this.locations.requireActiveId())
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async recentSessions(limit = 5): Promise<SessionWithCounts[]> {
    const { data, error } = await this.db
      .from('cashier_sessions')
      .select('*, cash_drawer_counts(*)')
      .eq('location_id', this.locations.requireActiveId())
      .order('opened_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async periods(): Promise<AccountingPeriod[]> {
    const { data, error } = await this.db
      .from('accounting_periods')
      .select('*')
      .order('start_date', { ascending: false })
      .limit(12);
    if (error) throw error;
    return data;
  }

  async periodLock(): Promise<PeriodLock | null> {
    const { data, error } = await this.db.from('period_locks').select('*').limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Reconciliation account rows for a set of cashier session ids (variance review). */
  async sessionReconAccounts(sessionIds: string[]): Promise<ReconAccountWithParent[]> {
    if (sessionIds.length === 0) return [];
    // Session reconciliations use scope 'cash-session' with ref '<id>:opening|closing'.
    const keys = sessionIds.flatMap(id => [`${id}:opening`, `${id}:closing`]);
    const { data, error } = await this.db
      .from('reconciliation_accounts')
      .select('*, reconciliations!inner(id, scope, scope_ref_id, created_at)')
      .eq('reconciliations.scope', 'cash-session')
      .in('reconciliations.scope_ref_id', keys);
    if (error) throw error;
    return data;
  }

  /** Only variance lines from this reconciliation remain reversible. */
  async latestReconciliationId(): Promise<string | null> {
    const { data, error } = await this.db
      .from('reconciliations')
      .select('id')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  }

  /** Recent reconciliations with their account rows (periods screen variance review). */
  async recentReconciliations(
    limit = 10
  ): Promise<(Reconciliation & { reconciliation_accounts: ReconAccount[] })[]> {
    const { data, error } = await this.db
      .from('reconciliations')
      .select('*, reconciliation_accounts(*)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  /** ManageReconciliation-gated: post the reversal and mark the row reviewed. */
  async revertVariance(reconAccountId: string, reason?: string): Promise<string> {
    const { data, error } = await this.db.rpc('revert_variance', {
      p_recon_account_id: reconAccountId,
      ...(reason ? { p_reason: reason } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async creditOrders(customerId: string) {
    const { data, error } = await this.db
      .from('orders')
      .select('id, code, total, is_credit_sale, created_at, status')
      .eq('customer_id', customerId)
      .eq('is_credit_sale', true)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data;
  }

  async customerStatement(customerId: string): Promise<CustomerStatementRow[]> {
    const { data: orders, error: orderError } = await this.db
      .from('orders')
      .select('id, code, total, created_at')
      .eq('customer_id', customerId)
      .eq('is_credit_sale', true)
      .in('status', ['completed', 'voided'])
      .order('created_at');
    if (orderError) throw orderError;
    const ids = (orders ?? []).map(order => order.id);
    const { data: payments, error: paymentError } = ids.length
      ? await this.db
          .from('payments')
          .select('id, order_id, amount, reference, status, created_at')
          .in('order_id', ids)
          .order('created_at')
      : { data: [], error: null };
    if (paymentError) throw paymentError;
    const { data: adjustments, error: adjustmentError } = await this.db
      .from('ledger_journal_lines')
      .select(
        'id, debit, credit, meta, ledger_journal_entries!entry_id!inner(posted_at, memo, source_type, source_id), ledger_accounts!inner(code)'
      )
      .eq('ledger_journal_entries.source_type', 'BalanceAdjustment')
      .eq('ledger_accounts.code', 'ACCOUNTS_RECEIVABLE')
      .contains('meta', { customerId });
    if (adjustmentError) throw adjustmentError;
    const entries = [
      ...(orders ?? []).map(order => ({
        id: order.id,
        date: order.created_at,
        reference: order.code,
        description: 'Credit sale',
        debit: order.total,
        credit: 0,
      })),
      ...(payments ?? []).map(payment => ({
        id: payment.id,
        date: payment.created_at,
        reference: payment.reference || 'Payment',
        description: payment.status === 'reversed' ? 'Reversed payment' : 'Payment received',
        debit: payment.status === 'reversed' ? payment.amount : 0,
        credit: payment.status === 'reversed' ? 0 : payment.amount,
      })),
      ...(adjustments ?? []).map(line => ({
        id: line.id,
        date: line.ledger_journal_entries.posted_at,
        reference: line.ledger_journal_entries.source_id,
        description: line.ledger_journal_entries.memo || 'Balance adjustment',
        debit: line.debit,
        credit: line.credit,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    return entries.map(entry => ({ ...entry, balance: (balance += entry.debit - entry.credit) }));
  }

  async purchasesWithPayments(limit = 500): Promise<(Purchase & { paid: number })[]> {
    const { data: purchases, error: e1 } = await this.db
      .from('purchases')
      .select('*')
      .eq('stock_location_id', this.locations.requireActiveId())
      .order('created_at', { ascending: false })
      .limit(limit);
    if (e1) throw e1;
    if (!purchases || purchases.length === 0) return [];
    const { data: payments, error: e2 } = await this.db
      .from('purchase_payments')
      .select('*')
      .in(
        'purchase_id',
        purchases.map(p => p.id)
      );
    if (e2) throw e2;
    const paidBy = new Map<string, number>();
    for (const p of payments ?? []) {
      paidBy.set(p.purchase_id, (paidBy.get(p.purchase_id) ?? 0) + p.amount);
    }
    return purchases.map(p => ({ ...p, paid: paidBy.get(p.id) ?? 0 }));
  }

  async purchaseDrafts(): Promise<PurchaseDraft[]> {
    const { data, error } = await this.db
      .from('purchase_drafts')
      .select('*')
      .eq('status', 'draft')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async purchaseLines(purchaseId: string): Promise<PurchaseLine[]> {
    const { data, error } = await this.db
      .from('purchase_lines')
      .select('*')
      .eq('purchase_id', purchaseId)
      .order('created_at');
    if (error) throw error;
    return data;
  }

  /** Individual payments recorded against one purchase (drawer payment history). */
  async purchasePayments(purchaseId: string): Promise<PurchasePayment[]> {
    const { data, error } = await this.db
      .from('purchase_payments')
      .select('*')
      .eq('purchase_id', purchaseId)
      .order('created_at');
    if (error) throw error;
    return data;
  }

  async supplierVariantPerformance(): Promise<SupplierVariantPerformance[]> {
    const { data, error } = await this.db
      .from('supplier_variant_performance')
      .select('*')
      .order('last_purchase_date', { ascending: false });
    if (error) throw error;
    return data;
  }

  // --- RPCs (errors are P0001 with human-readable messages — display verbatim) ---

  async postExpense(
    amount: number,
    sourceAccountCode: string,
    category?: string,
    memo?: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('post_expense', {
      p_amount: amount,
      p_source_account_code: sourceAccountCode,
      ...(category ? { p_category: category } : {}),
      ...(memo ? { p_memo: memo } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async postTransfer(
    fromAccountCode: string,
    toAccountCode: string,
    principal: number,
    fee: number | null,
    transferId: string,
    memo?: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('post_transfer', {
      p_from_account_code: fromAccountCode,
      p_to_account_code: toAccountCode,
      p_principal: principal,
      ...(fee !== null && fee > 0 ? { p_fee: fee } : {}),
      p_transfer_id: transferId,
      ...(memo ? { p_memo: memo } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async openCashierSession(declarations: Declaration[]): Promise<string> {
    const { data, error } = await this.db.rpc('open_cashier_session_at_location', {
      p_location_id: this.locations.requireActiveId(),
      p_declarations: declarations as never,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async closeCashierSession(sessionId: string, declarations: Declaration[]): Promise<string> {
    const { data, error } = await this.db.rpc('close_cashier_session_at_location', {
      p_location_id: this.locations.requireActiveId(),
      p_session_id: sessionId,
      p_declarations: declarations as never,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async recordManualReconciliation(declarations: Declaration[]): Promise<string> {
    const { data, error } = await this.db.rpc('record_manual_reconciliation', {
      p_declarations: declarations as never,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async closeAccountingPeriod(endDate: string): Promise<string> {
    const { data, error } = await this.db.rpc('close_accounting_period', {
      p_end_date: endDate,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async postPaymentAllocation(
    orderId: string,
    amount: number,
    methodCode: string,
    reference?: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('post_payment_allocation', {
      p_order_id: orderId,
      p_amount: amount,
      p_method_code: methodCode,
      ...(reference ? { p_reference: reference } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async postCustomerPayment(
    customerId: string,
    amount: number,
    methodCode: string,
    reference?: string
  ): Promise<void> {
    const { error } = await this.db.rpc('post_customer_payment', {
      p_customer_id: customerId,
      p_amount: amount,
      p_method_code: methodCode,
      ...(reference ? { p_reference: reference } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
  }

  async postRefund(
    orderId: string,
    amount: number,
    methodCode: string,
    reason: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('post_refund', {
      p_order_id: orderId,
      p_amount: amount,
      p_method_code: methodCode,
      p_reason: reason,
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async reversePayment(paymentId: string): Promise<string> {
    const { data, error } = await this.db.rpc('post_payment_reversal', {
      p_payment_id: paymentId,
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async adjustCustomerBalance(customerId: string, amount: number, reason: string): Promise<string> {
    const { data, error } = await this.db.rpc('post_balance_adjustment', {
      p_customer_id: customerId,
      p_amount: amount,
      p_reason: reason,
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async adjustSupplierBalance(customerId: string, amount: number, reason: string): Promise<string> {
    const { data, error } = await this.db.rpc('post_supplier_balance_adjustment', {
      p_supplier_id: customerId,
      p_amount: amount,
      p_reason: reason,
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async updateCustomerCredit(
    customerId: string,
    creditLimit: number,
    isApproved: boolean,
    termsDays?: number
  ): Promise<string> {
    const { data, error } = await this.db.rpc('update_customer_credit', {
      p_customer_id: customerId,
      p_credit_limit: creditLimit,
      p_is_approved: isApproved,
      ...(termsDays !== undefined ? { p_terms_days: termsDays } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidate();
    return data;
  }

  async updateSupplierCredit(
    supplierId: string,
    creditLimit: number,
    termsDays?: number
  ): Promise<string> {
    const { data, error } = await this.db.rpc('update_supplier_credit', {
      p_supplier_id: supplierId,
      p_credit_limit: creditLimit,
      ...(termsDays !== undefined ? { p_terms_days: termsDays } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidate();
    return data;
  }

  async createCustomer(
    firstName: string,
    lastName?: string,
    phone?: string,
    email?: string,
    isSupplier = false
  ): Promise<string> {
    const { data, error } = await this.db.rpc('create_customer', {
      p_first_name: firstName,
      ...(lastName ? { p_last_name: lastName } : {}),
      ...(phone ? { p_phone: phone } : {}),
      ...(email ? { p_email: email } : {}),
      p_is_supplier: isSupplier,
    });
    if (error) throw rpcError(error);
    this.parties.invalidate();
    return data;
  }

  /** null/undefined fields are left unchanged by the backend. */
  async updateCustomer(
    customerId: string,
    changes: {
      first_name?: string;
      last_name?: string;
      phone?: string;
      email?: string;
      notes?: string;
    }
  ): Promise<string> {
    const { data, error } = await this.db.rpc('update_customer', {
      p_customer_id: customerId,
      ...(changes.first_name !== undefined ? { p_first_name: changes.first_name } : {}),
      ...(changes.last_name !== undefined ? { p_last_name: changes.last_name } : {}),
      ...(changes.phone !== undefined ? { p_phone: changes.phone } : {}),
      ...(changes.email !== undefined ? { p_email: changes.email } : {}),
      ...(changes.notes !== undefined ? { p_notes: changes.notes } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidate();
    return data;
  }

  async setCustomerDeleted(customerId: string, deleted: boolean): Promise<string> {
    const { data, error } = await this.db.rpc('set_customer_deleted', {
      p_customer_id: customerId,
      p_deleted: deleted,
    });
    if (error) throw rpcError(error);
    this.parties.invalidate();
    return data;
  }

  async recordPurchase(
    supplierId: string,
    lines: {
      variant_id: string;
      quantity: number;
      unit_cost: number;
      expiry_date?: string;
      batch_number?: string;
      new_wholesale_price?: number;
      new_retail_price?: number;
    }[],
    isCredit: boolean,
    reference?: string,
    accountCode?: string,
    notes?: string,
    purchaseDate?: string,
    stockLocationId?: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('record_purchase_with_prices', {
      p_supplier_id: supplierId,
      p_lines: lines as never,
      p_is_credit: isCredit,
      ...(reference ? { p_reference: reference } : {}),
      ...(accountCode ? { p_account_code: accountCode } : {}),
      ...(notes ? { p_notes: notes } : {}),
      ...(purchaseDate ? { p_purchase_date: purchaseDate } : {}),
      ...(stockLocationId ? { p_stock_location_id: stockLocationId } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async recordPurchaseWithPayment(
    supplierId: string,
    lines: {
      variant_id: string;
      quantity: number;
      unit_cost: number;
      expiry_date?: string;
      batch_number?: string;
      new_wholesale_price?: number;
      new_retail_price?: number;
    }[],
    paymentAmount: number,
    reference?: string,
    accountCode?: string,
    notes?: string,
    purchaseDate?: string,
    stockLocationId?: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('record_purchase_with_payment', {
      p_supplier_id: supplierId,
      p_lines: lines as never,
      p_payment_amount: paymentAmount,
      ...(reference ? { p_reference: reference } : {}),
      ...(accountCode ? { p_account_code: accountCode } : {}),
      ...(notes ? { p_notes: notes } : {}),
      ...(purchaseDate ? { p_purchase_date: purchaseDate } : {}),
      ...(stockLocationId ? { p_stock_location_id: stockLocationId } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async savePurchaseDraft(input: {
    draftId?: string;
    supplierId: string;
    lines: {
      variant_id: string;
      quantity: number;
      unit_cost: number;
      expiry_date?: string;
      batch_number?: string;
      new_wholesale_price?: number;
      new_retail_price?: number;
    }[];
    reference?: string;
    notes?: string;
    purchaseDate?: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('save_purchase_draft', {
      p_supplier_id: input.supplierId,
      p_lines: input.lines as never,
      ...(input.draftId ? { p_draft_id: input.draftId } : {}),
      ...(input.reference ? { p_reference: input.reference } : {}),
      ...(input.notes ? { p_notes: input.notes } : {}),
      ...(input.purchaseDate ? { p_purchase_date: input.purchaseDate } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async confirmPurchaseDraft(
    draftId: string,
    isCredit: boolean,
    accountCode?: string,
    stockLocationId?: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('confirm_purchase_draft', {
      p_draft_id: draftId,
      p_is_credit: isCredit,
      ...(accountCode ? { p_account_code: accountCode } : {}),
      ...(stockLocationId ? { p_stock_location_id: stockLocationId } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async confirmPurchaseDraftWithPayment(
    draftId: string,
    paymentAmount: number,
    accountCode?: string,
    stockLocationId?: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('confirm_purchase_draft_with_payment', {
      p_draft_id: draftId,
      p_payment_amount: paymentAmount,
      ...(accountCode ? { p_account_code: accountCode } : {}),
      ...(stockLocationId ? { p_stock_location_id: stockLocationId } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async cancelPurchaseDraft(draftId: string): Promise<void> {
    const { error } = await this.db.rpc('cancel_purchase_draft', { p_draft_id: draftId });
    if (error) throw rpcError(error);
  }

  async payPurchase(purchaseId: string, amount: number, accountCode: string): Promise<string> {
    const { data, error } = await this.db.rpc('pay_purchase', {
      p_purchase_id: purchaseId,
      p_amount: amount,
      p_account_code: accountCode,
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async paySupplier(supplierId: string, amount: number, accountCode: string): Promise<string> {
    const { data, error } = await this.db.rpc('pay_supplier', {
      p_supplier_id: supplierId,
      p_amount: amount,
      p_account_code: accountCode,
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async setSupplierActive(supplierId: string, active: boolean): Promise<string> {
    const { data, error } = await this.db.rpc('set_supplier_active', {
      p_supplier_id: supplierId,
      p_active: active,
    });
    if (error) throw rpcError(error);
    this.parties.invalidate();
    return data;
  }

  async postStockAdjustment(
    variantId: string,
    expectedQuantity: number,
    newQuantity: number,
    reason: string,
    unitCost?: number
  ): Promise<string> {
    const { data, error } = await this.db.rpc('post_stock_adjustment_at_location', {
      p_location_id: this.locations.requireActiveId(),
      p_variant_id: variantId,
      p_expected_quantity: expectedQuantity,
      p_new_quantity: newQuantity,
      p_reason: reason,
      ...(unitCost !== undefined ? { p_unit_cost: unitCost } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }
}

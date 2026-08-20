import { Injectable, inject } from '@angular/core';
import type { Database, Json } from '@dukarun/shared-types';
import type {
  PurchasePriceBasis,
  PurchaseTaxContext,
  PurchaseTaxEstimate,
} from '@dukarun/tax-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';
import { LocationContextService } from '../core/location-context.service';
import { PartyCacheService } from '../core/party-cache.service';
import { ActionExecutorService, type ActionOutcome } from '../core/action-executor.service';
import { nairobiDayEndExclusive, nairobiDayStart } from '../core/nairobi-date';
import { journalPageSelect } from './journal-query';

export type LedgerAccount = Database['public']['Tables']['ledger_accounts']['Row'];
export type JournalEntry = Database['public']['Tables']['ledger_journal_entries']['Row'];
export type JournalLine = Database['public']['Tables']['ledger_journal_lines']['Row'];
export type CashierSession = Database['public']['Tables']['cashier_sessions']['Row'];
export type DrawerCount = Database['public']['Tables']['cash_drawer_counts']['Row'];
export type AccountingPeriod = Database['public']['Tables']['accounting_periods']['Row'];
export type PeriodLock = Database['public']['Tables']['period_locks']['Row'];
export type Purchase = Database['public']['Tables']['purchases']['Row'];
export type PurchasePayment = Database['public']['Tables']['purchase_payments']['Row'];
export type SupplierPayment = Database['public']['Tables']['supplier_payments']['Row'];
export type PurchaseDraft = Database['public']['Tables']['purchase_drafts']['Row'];
export type PurchaseLine = Database['public']['Tables']['purchase_lines']['Row'];
export type PurchaseExpense = Database['public']['Tables']['purchase_expenses']['Row'];
export type PurchaseHistoryRow = Purchase & {
  goods_subtotal: number;
  expense_total: number;
  separate_expense_total: number;
  all_in_total: number;
  paid: number;
  payment_status: string;
};
export type SupplierVariantPerformance =
  Database['public']['Views']['supplier_variant_performance']['Row'];
export type SupplierPurchaseMetric =
  Database['public']['Views']['supplier_purchase_metrics']['Row'];
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
  activity_kind: string;
  receipt_id: string | null;
  details: CustomerReceiptDetails;
};
export type CustomerStatementCursor = Pick<CustomerStatementRow, 'id' | 'date'>;
export type CustomerStatementPage = {
  rows: CustomerStatementRow[];
  hasMore: boolean;
};

export type CustomerReceiptAllocation = {
  payment_id?: string;
  order_id: string;
  order_code: string;
  amount: number;
};

export type CustomerReceiptDetails = {
  receipt_id?: string;
  amount?: number;
  applied_amount?: number;
  downpayment_amount?: number;
  allocations?: CustomerReceiptAllocation[];
};

export type CustomerReceiptOutcome =
  | ({
      status: 'completed';
      resource_id: string;
      subject_id: string;
      receipt_id: string;
      amount: number;
      applied_amount: number;
      downpayment_amount: number;
      allocations: CustomerReceiptAllocation[];
    } & Record<string, unknown>)
  | ({
      status: 'approval_required';
      approval_id: string;
      subject_id: string;
      receipt_id: string;
      preview: CustomerReceiptDetails;
    } & Record<string, unknown>);

export type PrepaymentActivityRow = {
  id: string;
  occurred_at: string;
  activity_kind: string;
  amount: number;
  direction: 'increase' | 'decrease';
  reference: string | null;
  status: string;
  description: string;
};

export type ReconAccountWithParent = ReconAccount & {
  reconciliations: Pick<Reconciliation, 'id' | 'scope' | 'scope_ref_id' | 'created_at'> | null;
};

export type AgingInfo = {
  days_outstanding: number | null;
  bucket: string | null;
};

export type SupplierAccountStatus = {
  ledger_balance: number;
  document_balance: number;
  difference: number;
  is_consistent: boolean;
};

export type CreditHealthSide = 'receivables' | 'payables';

export interface CreditHealthAgingBucket {
  side: CreditHealthSide;
  bucket: 'current' | '1-30' | '31-60' | '60+' | 'unscheduled';
  amount: number;
  documents: number;
}

export interface CreditHealthUtilizationBucket {
  bucket: 'under_50' | '50_80' | '80_100' | 'over_limit';
  parties: number;
  amount: number;
}

export interface CreditHealthConcentration {
  party_id: string;
  party_name: string;
  amount: number;
  share: number;
}

export interface CreditHealthCollectionAction {
  party_id: string;
  party_name: string;
  outstanding: number;
  credit_limit: number;
  oldest_due_date: string | null;
  days_overdue: number;
  overdue_amount: number;
  reason: string;
}

export interface CreditHealthPaymentAction {
  party_id: string;
  party_name: string;
  outstanding: number;
  due_amount: number;
  next_due_date: string | null;
  days_overdue: number;
}

export interface CreditHealthTrendPoint {
  day: string;
  receivables: number;
  payables: number;
}

export interface CreditHealthDashboard {
  generated_at: string;
  metrics: {
    receivables: number;
    payables: number;
    overdue_receivables: number;
    severe_receivables: number;
    payables_due_soon: number;
    over_limit_parties: number;
    top_five_concentration: number;
  };
  aging: CreditHealthAgingBucket[];
  utilization: CreditHealthUtilizationBucket[];
  concentration: CreditHealthConcentration[];
  collect_now: CreditHealthCollectionAction[];
  pay_soon: CreditHealthPaymentAction[];
  trend: CreditHealthTrendPoint[];
}

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

/** Current location-scoped book balance for one cashier-controlled account. */
export interface CashierExpectedBalance {
  account_code: string;
  expected_balance: number;
}

/** Active real-money account whose book balance may be manually reconciled. */
export interface ReconcilableAccount {
  account_code: string;
  account_name: string;
  balance: number;
  requires_reconciliation: boolean;
  last_reconciled_at: string | null;
  balance_scope: 'company' | 'location';
  location_id: string | null;
  location_name: string | null;
  can_adjust: boolean;
  blocked_reason: string | null;
}

export interface PurchaseLineInput {
  variant_id: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  value_source: 'unit' | 'total';
  expiry_date?: string;
  batch_number?: string;
  new_wholesale_price?: number;
  new_retail_price?: number;
  price_entry_basis?: PurchasePriceBasis;
  entered_value_source?: 'unit' | 'total';
  entered_unit_cost?: number;
  entered_line_total?: number;
}

export interface PurchaseExpenseInput {
  category: 'transport' | 'loading' | 'packaging' | 'duty' | 'other';
  custom_label?: string;
  memo?: string;
  amount: number;
  settlement: 'supplier_bill' | 'separate';
  account_code?: string;
  price_entry_basis?: PurchasePriceBasis;
  entered_amount?: number;
}

@Injectable({ providedIn: 'root' })
export class MoneyService {
  private readonly supabase = inject(SupabaseService);
  private readonly locations = inject(LocationContextService);
  private readonly parties = inject(PartyCacheService);
  private readonly actions = inject(ActionExecutorService);

  private get db() {
    return this.supabase.client;
  }

  // --- Reads ---

  async creditHealthDashboard(days = 90): Promise<CreditHealthDashboard> {
    const { data, error } = await this.db.rpc('credit_health_dashboard', {
      p_days: Math.min(Math.max(Math.trunc(days), 30), 365),
    });
    if (error) throw rpcError(error);
    return data as unknown as CreditHealthDashboard;
  }

  /** Active postable asset accounts used by cash, bank, and mobile-money pickers. */
  async transactableAccounts(): Promise<LedgerAccount[]> {
    const { data, error } = await this.db
      .from('ledger_accounts')
      .select('*')
      .eq('allow_manual_posting', true)
      .eq('is_active', true)
      .eq('is_parent', false)
      .eq('type', 'asset')
      .order('code');
    if (error) throw error;
    return data;
  }

  /** Default controlled accounts plus non-default accounts used by this session. */
  async cashierAccounts(sessionId?: string | null): Promise<CashierAccount[]> {
    const { data, error } = await this.db.rpc('cashier_count_accounts', {
      p_location_id: this.locations.requireActiveId(),
      p_session_id: sessionId ?? undefined,
    });
    if (error) throw error;
    return data.map(account => ({
      account_code: account.account_code,
      label: account.account_name,
    }));
  }

  /** SettleOrder-scoped expected balances for the active location's controlled accounts. */
  async cashierExpectedBalances(sessionId?: string | null): Promise<CashierExpectedBalance[]> {
    const { data, error } = await this.db.rpc('cashier_expected_balances', {
      p_location_id: this.locations.requireActiveId(),
      p_session_id: sessionId ?? undefined,
    });
    if (error) throw rpcError(error);
    return data;
  }

  /** Real-money balances, scoped to company or active location as accounting requires. */
  async reconcilableAccounts(): Promise<ReconcilableAccount[]> {
    const { data, error } = await this.db.rpc('list_reconcilable_accounts', {
      p_location_id: this.locations.requireActiveId(),
    });
    if (error) throw rpcError(error);
    return data as ReconcilableAccount[];
  }

  /** Enabled non-credit payment method codes (for repayment/allocation selects). */
  async enabledMethodCodes(): Promise<string[]> {
    const { data, error } = await this.db.rpc('available_payment_methods', {
      p_location_id: this.locations.requireActiveId(),
    });
    if (error) throw error;
    return data.filter(method => method.code !== 'credit').map(method => method.code);
  }

  async customerDepositAvailable(customerId: string): Promise<number> {
    const { data, error } = await this.db.rpc('customer_deposit_available', {
      p_customer_id: customerId,
    });
    if (error) throw rpcError(error);
    return Number(data ?? 0);
  }

  async supplierAdvanceAvailable(supplierId: string): Promise<number> {
    const { data, error } = await this.db.rpc('supplier_advance_available', {
      p_supplier_id: supplierId,
    });
    if (error) throw rpcError(error);
    return Number(data ?? 0);
  }

  async supplierAdvanceActivity(supplierId: string): Promise<PrepaymentActivityRow[]> {
    const { data, error } = await this.db.rpc('supplier_advance_activity', {
      p_supplier_id: supplierId,
      p_limit: 50,
    });
    if (error) throw rpcError(error);
    return (data ?? []) as unknown as PrepaymentActivityRow[];
  }

  async refundCustomerDeposit(input: {
    customerId: string;
    amount: number;
    reason: string;
    methodCode?: string;
    reference?: string;
    clientRef: string;
  }): Promise<ActionOutcome> {
    const { data, error } = await this.db.rpc('post_customer_deposit_refund', {
      p_customer_id: input.customerId,
      p_amount: input.amount,
      p_reason: input.reason,
      p_location_id: this.locations.requireActiveId(),
      p_client_ref: input.clientRef,
      ...(input.methodCode ? { p_method_code: input.methodCode } : {}),
      ...(input.reference ? { p_reference: input.reference } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data as unknown as ActionOutcome;
  }

  async recordSupplierAdvance(input: {
    supplierId: string;
    amount: number;
    accountCode: string;
    reference?: string;
    clientRef: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('record_supplier_advance', {
      p_supplier_id: input.supplierId,
      p_amount: input.amount,
      p_account_code: input.accountCode,
      p_location_id: this.locations.requireActiveId(),
      p_client_ref: input.clientRef,
      ...(input.reference ? { p_reference: input.reference } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data as unknown as string;
  }

  async applySupplierAdvance(
    purchaseId: string,
    amount: number,
    clientRef: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('apply_supplier_advance', {
      p_purchase_id: purchaseId,
      p_amount: amount,
      p_client_ref: clientRef,
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data as unknown as string;
  }

  async recordSupplierAdvanceReturn(input: {
    supplierId: string;
    amount: number;
    accountCode: string;
    reason: string;
    reference?: string;
    clientRef: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('record_supplier_advance_return', {
      p_supplier_id: input.supplierId,
      p_amount: input.amount,
      p_account_code: input.accountCode,
      p_reason: input.reason,
      p_location_id: this.locations.requireActiveId(),
      p_client_ref: input.clientRef,
      ...(input.reference ? { p_reference: input.reference } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data as unknown as string;
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
    /** Mandatory account membership while `accountCode` may apply a second related-account filter. */
    requiredAccountCode?: string;
    sourceType?: string;
    from?: string;
    to?: string;
    sortBy?: 'posted_at' | 'source_type' | 'memo';
    sortDirection?: 'asc' | 'desc';
  }): Promise<{ rows: JournalEntryWithLines[]; count: number }> {
    // Filter through separate relation aliases so matching an account never
    // removes the journal entry's other side from the rendered transaction.
    const select = journalPageSelect(input);
    let query = this.db.from('ledger_journal_entries').select(select, { count: 'exact' });
    if (input.requiredAccountCode) {
      query = query.eq('required_filter.ledger_accounts.code', input.requiredAccountCode);
    }
    if (input.accountCode) {
      query = query.eq('account_filter.ledger_accounts.code', input.accountCode);
    }
    if (input.search?.trim()) {
      const pattern = `%${input.search.trim().replace(/[%_,()]/g, ' ')}%`;
      query = query.or(`memo.ilike.${pattern},source_id.ilike.${pattern}`);
    }
    if (input.sourceType) query = query.eq('source_type', input.sourceType);
    if (input.from) query = query.gte('posted_at', nairobiDayStart(input.from));
    if (input.to) query = query.lt('posted_at', nairobiDayEndExclusive(input.to));
    const start = (input.page - 1) * input.pageSize;
    const ascending = input.sortDirection === 'asc';
    const { data, error, count } = await query
      .order(input.sortBy ?? 'posted_at', { ascending })
      .order('id', { ascending })
      .range(start, start + input.pageSize - 1);
    if (error) throw error;
    return { rows: (data ?? []) as unknown as JournalEntryWithLines[], count: count ?? 0 };
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

  /** Recent reconciliations with account rows for the reconciliation workspace. */
  async recentReconciliations(
    limit = 10
  ): Promise<(Reconciliation & { reconciliation_accounts: ReconAccount[] })[]> {
    const locationId = this.locations.requireActiveId();
    const { data, error } = await this.db
      .from('reconciliations')
      .select('*, reconciliation_accounts(*)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data
      .map(reconciliation => ({
        ...reconciliation,
        reconciliation_accounts: reconciliation.reconciliation_accounts.filter(
          account =>
            account.balance_scope === 'company' || reconciliation.location_id === locationId
        ),
      }))
      .filter(reconciliation => reconciliation.reconciliation_accounts.length > 0);
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
    const orders = data ?? [];
    if (orders.length === 0) return [];
    const { data: payments, error: paymentError } = await this.db
      .from('payments')
      .select('order_id, amount')
      .in(
        'order_id',
        orders.map(order => order.id)
      )
      .eq('status', 'settled');
    if (paymentError) throw paymentError;
    const paidByOrder = new Map<string, number>();
    for (const payment of payments ?? []) {
      paidByOrder.set(payment.order_id, (paidByOrder.get(payment.order_id) ?? 0) + payment.amount);
    }
    return orders
      .map(order => {
        const paid = paidByOrder.get(order.id) ?? 0;
        return { ...order, paid, outstanding: Math.max(order.total - paid, 0) };
      })
      .filter(order => order.outstanding > 0);
  }

  async customerStatement(
    customerId: string,
    before?: CustomerStatementCursor,
    limit = 25
  ): Promise<CustomerStatementPage> {
    const { data, error } = await this.db.rpc('customer_statement', {
      p_customer_id: customerId,
      p_limit: Math.min(Math.max(Math.trunc(limit), 1), 100),
      ...(before ? { p_before_date: before.date, p_before_id: before.id } : {}),
    });
    if (error) throw rpcError(error);
    return {
      rows: (data ?? []).map(({ has_more: _hasMore, ...row }) => ({
        ...row,
        details: (row.details ?? {}) as CustomerReceiptDetails,
      })),
      hasMore: data?.[0]?.has_more ?? false,
    };
  }

  async purchasesPage(input: {
    page: number;
    pageSize: number;
    search?: string;
    supplierId?: string;
    paymentStatus?: 'paid' | 'part_paid' | 'unpaid';
    matchingSupplierIds?: string[];
    locationId?: string;
    allLocations?: boolean;
    from?: string;
    to?: string;
    sortBy?: 'created_at' | 'purchase_date' | 'total_cost' | 'reference';
    sortDirection?: 'asc' | 'desc';
  }): Promise<{ rows: PurchaseHistoryRow[]; count: number }> {
    let query = this.db
      .from('purchase_history')
      .select('*', { count: 'exact' })
      .eq('status', 'posted');
    if (!input.allLocations) {
      query = query.eq('stock_location_id', input.locationId ?? this.locations.requireActiveId());
    }
    if (input.supplierId) query = query.eq('supplier_id', input.supplierId);
    if (input.paymentStatus) query = query.eq('payment_status', input.paymentStatus);
    if (input.search?.trim()) {
      const search = input.search.trim().replace(/[%_,()]/g, ' ');
      const supplierIds = input.matchingSupplierIds ?? [];
      const clauses = [`reference.ilike.%${search}%`];
      if (supplierIds.length > 0) clauses.push(`supplier_id.in.(${supplierIds.join(',')})`);
      query = query.or(clauses.join(','));
    }
    if (input.from) query = query.gte('purchase_date', input.from);
    if (input.to) query = query.lte('purchase_date', input.to);
    const start = (input.page - 1) * input.pageSize;
    const ascending = input.sortDirection === 'asc';
    const { data, error, count } = await query
      .order(input.sortBy ?? 'created_at', { ascending })
      .order('id', { ascending })
      .range(start, start + input.pageSize - 1);
    if (error) throw error;
    return {
      rows: (data ?? []).map(purchase => purchase as PurchaseHistoryRow),
      count: count ?? 0,
    };
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

  async purchaseExpenses(purchaseId: string): Promise<PurchaseExpense[]> {
    const { data, error } = await this.db
      .from('purchase_expenses')
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
      .eq('status', 'settled')
      .order('created_at');
    if (error) throw error;
    return data;
  }

  async supplierPayments(supplierId: string, limit = 20): Promise<SupplierPayment[]> {
    const { data, error } = await this.db
      .from('supplier_payments')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async supplierAccountStatus(supplierId: string): Promise<SupplierAccountStatus> {
    const { data, error } = await this.db.rpc('supplier_account_status', {
      p_supplier_id: supplierId,
    });
    if (error) throw rpcError(error);
    const status = data?.[0];
    if (!status) throw new Error('Supplier account status was not returned');
    return status;
  }

  async customerAccountStatus(customerId: string): Promise<SupplierAccountStatus> {
    const { data, error } = await this.db.rpc('customer_account_status', {
      p_customer_id: customerId,
    });
    if (error) throw rpcError(error);
    const status = data?.[0];
    if (!status) throw new Error('Customer account status was not returned');
    return status;
  }

  async supplierVariantPerformance(): Promise<SupplierVariantPerformance[]> {
    const { data, error } = await this.db
      .from('supplier_variant_performance')
      .select('*')
      .order('last_purchase_date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async supplierPurchaseMetrics(): Promise<SupplierPurchaseMetric[]> {
    const { data, error } = await this.db.from('supplier_purchase_metrics').select('*');
    if (error) throw error;
    return data;
  }

  // --- RPCs (errors are P0001 with human-readable messages — display verbatim) ---

  async postExpense(
    amount: number,
    sourceAccountCode: string,
    category?: string,
    memo?: string,
    tax?: {
      expenseDate: string;
      claimInputVat: boolean;
      supplierTaxPin?: string;
      taxInvoiceNumber?: string;
      taxInvoiceDate?: string;
      taxCategoryId?: string;
    }
  ): Promise<string> {
    const { data, error } = await this.db.rpc('post_expense_with_tax', {
      p_amount: amount,
      p_source_account_code: sourceAccountCode,
      ...(category ? { p_category: category } : {}),
      ...(memo ? { p_memo: memo } : {}),
      ...(tax?.expenseDate ? { p_expense_date: tax.expenseDate } : {}),
      p_claim_input_vat: tax?.claimInputVat ?? false,
      ...(tax?.supplierTaxPin ? { p_supplier_tax_pin: tax.supplierTaxPin } : {}),
      ...(tax?.taxInvoiceNumber ? { p_tax_invoice_number: tax.taxInvoiceNumber } : {}),
      ...(tax?.taxInvoiceDate ? { p_tax_invoice_date: tax.taxInvoiceDate } : {}),
      ...(tax?.taxCategoryId ? { p_tax_category_id: tax.taxCategoryId } : {}),
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
      p_location_id: this.locations.requireActiveId(),
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

  async postCustomerReceipt(
    customerId: string,
    amount: number,
    methodCode: string,
    reference: string | undefined,
    clientRef: string
  ): Promise<CustomerReceiptOutcome> {
    const outcome = await this.actions.run(async () => {
      const { data, error } = await this.db.rpc('post_customer_receipt', {
        p_location_id: this.locations.requireActiveId(),
        p_customer_id: customerId,
        p_amount: amount,
        p_method_code: methodCode,
        p_client_ref: clientRef,
        ...(reference ? { p_reference: reference } : {}),
      });
      if (error) throw rpcError(error);
      return data;
    });
    this.parties.invalidateFinancials();
    return outcome as CustomerReceiptOutcome;
  }

  async postCustomerPayment(
    customerId: string,
    amount: number,
    methodCode: string,
    reference?: string,
    clientRef: string = crypto.randomUUID()
  ): Promise<CustomerReceiptOutcome> {
    return this.postCustomerReceipt(customerId, amount, methodCode, reference, clientRef);
  }

  async reverseCustomerReceipt(receiptId: string, reason: string): Promise<ActionOutcome> {
    const outcome = await this.actions.run(async () => {
      const { data, error } = await this.db.rpc('post_customer_receipt_reversal', {
        p_receipt_id: receiptId,
        p_reason: reason,
      });
      if (error) throw rpcError(error);
      return data;
    });
    if (outcome.status === 'completed') this.parties.invalidateFinancials();
    return outcome;
  }

  async postRefund(
    orderId: string,
    amount: number,
    methodCode: string,
    reason: string
  ): Promise<ActionOutcome> {
    const outcome = await this.actions.run(async () => {
      const { data, error } = await this.db.rpc('post_refund', {
        p_order_id: orderId,
        p_amount: amount,
        p_method_code: methodCode,
        p_reason: reason,
      });
      if (error) throw rpcError(error);
      return data;
    });
    if (outcome.status === 'completed') this.parties.invalidateFinancials();
    return outcome;
  }

  async postFullRefund(
    orderId: string,
    methodCode: string,
    reason: string,
    stockOutcome: 'return_to_stock' | 'write_off'
  ): Promise<ActionOutcome> {
    const outcome = await this.actions.run(async () => {
      const { data, error } = await this.db.rpc('post_full_refund', {
        p_order_id: orderId,
        p_method_code: methodCode,
        p_reason: reason,
        p_stock_outcome: stockOutcome,
      });
      if (error) throw rpcError(error);
      return data;
    });
    if (outcome.status === 'completed') this.parties.invalidateFinancials();
    return outcome;
  }

  async reversePayment(paymentId: string, reason: string): Promise<ActionOutcome> {
    const outcome = await this.actions.run(async () => {
      const { data, error } = await this.db.rpc('post_payment_reversal', {
        p_payment_id: paymentId,
        p_reason: reason,
      });
      if (error) throw rpcError(error);
      return data;
    });
    if (outcome.status === 'completed') this.parties.invalidateFinancials();
    return outcome;
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

  async changeCustomerCredit(
    customerId: string,
    creditLimit: number,
    isApproved: boolean,
    termsDays: number,
    reason: string
  ): Promise<ActionOutcome> {
    const outcome = await this.actions.run(async () => {
      const { data, error } = await this.db.rpc('change_customer_credit', {
        p_customer_id: customerId,
        p_credit_limit: creditLimit,
        p_is_approved: isApproved,
        p_terms_days: termsDays,
        p_reason: reason,
      });
      if (error) throw rpcError(error);
      return data;
    });
    this.parties.invalidate();
    return outcome;
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

  async updateCustomerTaxRegistration(
    customerId: string,
    taxRegistrationNumber: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('update_customer_tax_registration', {
      p_customer_id: customerId,
      p_tax_registration_number: taxRegistrationNumber,
    });
    if (error) throw rpcError(error);
    this.parties.invalidate();
    return data;
  }

  async updateCustomerCommunicationPreferences(
    customerId: string,
    enabled: boolean,
    smsEnabled: boolean,
    whatsappEnabled: boolean
  ): Promise<void> {
    const { error } = await this.db.rpc('update_customer_communication_preferences', {
      p_customer_id: customerId,
      p_enabled: enabled,
      p_sms_enabled: smsEnabled,
      p_whatsapp_enabled: whatsappEnabled,
    });
    if (error) throw rpcError(error);
    this.parties.invalidate();
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
    stockLocationId?: string,
    tax?: {
      claimInputVat: boolean;
      supplierTaxPin?: string;
      taxInvoiceNumber?: string;
      taxInvoiceDate?: string;
    }
  ): Promise<string> {
    return this.recordPurchaseComplete({
      supplierId,
      lines: lines.map(line => ({
        ...line,
        line_total: Math.round(line.quantity * line.unit_cost),
        value_source: 'unit' as const,
      })),
      expenses: [],
      paymentAmount,
      reference,
      accountCode,
      notes,
      purchaseDate,
      stockLocationId,
      claimInputVat: tax?.claimInputVat ?? false,
      supplierTaxPin: tax?.supplierTaxPin,
      taxInvoiceNumber: tax?.taxInvoiceNumber,
      taxInvoiceDate: tax?.taxInvoiceDate,
    });
  }

  async recordPurchaseComplete(input: {
    supplierId: string;
    lines: PurchaseLineInput[];
    expenses: PurchaseExpenseInput[];
    paymentAmount: number;
    reference?: string;
    accountCode?: string;
    notes?: string;
    purchaseDate?: string;
    stockLocationId?: string;
    claimInputVat?: boolean;
    supplierTaxPin?: string;
    taxInvoiceNumber?: string;
    taxInvoiceDate?: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('record_purchase_complete_with_tax', {
      p_supplier_id: input.supplierId,
      p_lines: input.lines as never,
      p_expenses: input.expenses as never,
      p_payment_amount: input.paymentAmount,
      ...(input.reference ? { p_reference: input.reference } : {}),
      ...(input.accountCode ? { p_account_code: input.accountCode } : {}),
      ...(input.notes ? { p_notes: input.notes } : {}),
      ...(input.purchaseDate ? { p_purchase_date: input.purchaseDate } : {}),
      ...(input.stockLocationId ? { p_stock_location_id: input.stockLocationId } : {}),
      p_claim_input_vat: input.claimInputVat ?? false,
      ...(input.supplierTaxPin ? { p_supplier_tax_pin: input.supplierTaxPin } : {}),
      ...(input.taxInvoiceNumber ? { p_tax_invoice_number: input.taxInvoiceNumber } : {}),
      ...(input.taxInvoiceDate ? { p_tax_invoice_date: input.taxInvoiceDate } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async estimatePurchaseInputVat(input: {
    lines: PurchaseLineInput[];
    expenses: PurchaseExpenseInput[];
    taxInvoiceDate: string;
  }): Promise<PurchaseTaxEstimate> {
    const { data, error } = await this.db.rpc('estimate_purchase_input_vat', {
      p_lines: input.lines as unknown as Json,
      p_expenses: input.expenses as unknown as Json,
      p_tax_invoice_date: input.taxInvoiceDate,
    });
    if (error) throw rpcError(error);
    return data as unknown as PurchaseTaxEstimate;
  }

  async purchaseTaxContext(input: {
    variantIds: string[];
    taxDate: string;
  }): Promise<PurchaseTaxContext> {
    const { data, error } = await this.db.rpc('purchase_tax_context', {
      p_variant_ids: input.variantIds,
      p_tax_date: input.taxDate,
    });
    if (error) throw rpcError(error);
    return data as unknown as PurchaseTaxContext;
  }

  async updateSupplierTaxRegistration(
    supplierId: string,
    taxRegistrationNumber: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('update_supplier_tax_registration', {
      p_supplier_id: supplierId,
      p_tax_registration_number: taxRegistrationNumber,
    });
    if (error) throw rpcError(error);
    this.parties.invalidate();
    return data;
  }

  async recordPurchaseWithAdvance(input: {
    supplierId: string;
    lines: PurchaseLineInput[];
    expenses: PurchaseExpenseInput[];
    paymentAmount: number;
    advanceAmount: number;
    creditAmount: number;
    reference?: string;
    accountCode?: string;
    notes?: string;
    purchaseDate?: string;
    stockLocationId?: string;
    clientRef: string;
    claimInputVat?: boolean;
    taxInvoiceDate?: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('record_purchase_with_advance', {
      p_supplier_id: input.supplierId,
      p_lines: input.lines as unknown as Json,
      p_expenses: input.expenses as unknown as Json,
      p_payment_amount: input.paymentAmount,
      p_advance_amount: input.advanceAmount,
      p_credit_amount: input.creditAmount,
      p_client_ref: input.clientRef,
      ...(input.reference ? { p_reference: input.reference } : {}),
      ...(input.accountCode ? { p_account_code: input.accountCode } : {}),
      ...(input.notes ? { p_notes: input.notes } : {}),
      ...(input.purchaseDate ? { p_purchase_date: input.purchaseDate } : {}),
      ...(input.stockLocationId ? { p_stock_location_id: input.stockLocationId } : {}),
      p_claim_input_vat: input.claimInputVat ?? false,
      ...(input.taxInvoiceDate ? { p_tax_invoice_date: input.taxInvoiceDate } : {}),
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data as unknown as string;
  }

  async savePurchaseDraftComplete(input: {
    draftId?: string;
    supplierId: string;
    lines: PurchaseLineInput[];
    expenses: PurchaseExpenseInput[];
    reference?: string;
    notes?: string;
    purchaseDate: string;
    stockLocationId?: string;
    paymentMode?: 'paid' | 'partial' | 'later';
    paymentAmount?: number;
    accountCode?: string;
    claimInputVat?: boolean;
    taxInvoiceDate?: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('save_purchase_draft_complete_with_tax', {
      p_supplier_id: input.supplierId,
      p_lines: input.lines as never,
      p_expenses: input.expenses as never,
      p_purchase_date: input.purchaseDate,
      ...(input.draftId ? { p_draft_id: input.draftId } : {}),
      ...(input.reference ? { p_reference: input.reference } : {}),
      ...(input.notes ? { p_notes: input.notes } : {}),
      ...(input.stockLocationId ? { p_stock_location_id: input.stockLocationId } : {}),
      ...(input.paymentMode ? { p_payment_mode: input.paymentMode } : {}),
      ...(input.paymentAmount !== undefined ? { p_payment_amount: input.paymentAmount } : {}),
      ...(input.accountCode ? { p_account_code: input.accountCode } : {}),
      p_claim_input_vat: input.claimInputVat ?? false,
      ...(input.taxInvoiceDate ? { p_tax_invoice_date: input.taxInvoiceDate } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async savePurchaseWorkspaceDraft(input: {
    draftId?: string;
    supplierId: string;
    lines: PurchaseLineInput[];
    expenses: PurchaseExpenseInput[];
    reference?: string;
    notes?: string;
    purchaseDate: string;
    stockLocationId: string;
    paymentMode: 'paid' | 'partial' | 'later';
    paymentAmount: number;
    advanceAmount: number;
    accountCode?: string;
    clientRef: string;
    claimInputVat: boolean;
    taxInvoiceDate?: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('save_purchase_workspace_draft', {
      p_supplier_id: input.supplierId,
      p_lines: input.lines as unknown as Json,
      p_expenses: input.expenses as unknown as Json,
      p_purchase_date: input.purchaseDate,
      p_stock_location_id: input.stockLocationId,
      p_payment_mode: input.paymentMode,
      p_payment_amount: input.paymentAmount,
      p_advance_amount: input.advanceAmount,
      p_client_ref: input.clientRef,
      p_claim_input_vat: input.claimInputVat,
      ...(input.draftId ? { p_draft_id: input.draftId } : {}),
      ...(input.reference ? { p_reference: input.reference } : {}),
      ...(input.notes ? { p_notes: input.notes } : {}),
      ...(input.accountCode ? { p_account_code: input.accountCode } : {}),
      ...(input.taxInvoiceDate ? { p_tax_invoice_date: input.taxInvoiceDate } : {}),
    });
    if (error) throw rpcError(error);
    return data as unknown as string;
  }

  async finalizePurchaseDraft(draftId: string): Promise<string> {
    const { data, error } = await this.db.rpc('finalize_purchase_draft', {
      p_draft_id: draftId,
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data as unknown as string;
  }

  async savePurchaseDraftWithAdvance(input: {
    draftId?: string;
    supplierId: string;
    lines: PurchaseLineInput[];
    expenses: PurchaseExpenseInput[];
    reference?: string;
    notes?: string;
    purchaseDate: string;
    stockLocationId?: string;
    paymentAmount: number;
    advanceAmount: number;
    accountCode?: string;
    clientRef: string;
    claimInputVat?: boolean;
    taxInvoiceDate?: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('save_purchase_draft_with_advance_tax', {
      p_supplier_id: input.supplierId,
      p_lines: input.lines as unknown as Json,
      p_expenses: input.expenses as unknown as Json,
      p_purchase_date: input.purchaseDate,
      p_payment_amount: input.paymentAmount,
      p_advance_amount: input.advanceAmount,
      p_client_ref: input.clientRef,
      ...(input.draftId ? { p_draft_id: input.draftId } : {}),
      ...(input.reference ? { p_reference: input.reference } : {}),
      ...(input.notes ? { p_notes: input.notes } : {}),
      ...(input.stockLocationId ? { p_stock_location_id: input.stockLocationId } : {}),
      ...(input.accountCode ? { p_account_code: input.accountCode } : {}),
      p_claim_input_vat: input.claimInputVat ?? false,
      ...(input.taxInvoiceDate ? { p_tax_invoice_date: input.taxInvoiceDate } : {}),
    });
    if (error) throw rpcError(error);
    return data as unknown as string;
  }

  async confirmPurchaseDraftWithAdvance(draftId: string): Promise<string> {
    const { data, error } = await this.db.rpc('confirm_purchase_draft_with_advance', {
      p_draft_id: draftId,
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data as unknown as string;
  }

  async confirmPurchaseDraftComplete(draftId: string): Promise<string> {
    const { data, error } = await this.db.rpc('confirm_purchase_draft_complete', {
      p_draft_id: draftId,
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

  async payPurchase(
    supplierId: string,
    purchaseId: string,
    amount: number,
    accountCode: string,
    clientRef: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('post_supplier_payment', {
      p_supplier_id: supplierId,
      p_purchase_id: purchaseId,
      p_amount: amount,
      p_account_code: accountCode,
      p_client_ref: clientRef,
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async paySupplier(
    supplierId: string,
    amount: number,
    accountCode: string,
    clientRef: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('post_supplier_fifo_payment', {
      p_supplier_id: supplierId,
      p_amount: amount,
      p_account_code: accountCode,
      p_client_ref: clientRef,
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async reverseSupplierPayment(paymentId: string, reason: string): Promise<string> {
    const { data, error } = await this.db.rpc('reverse_supplier_payment', {
      p_supplier_payment_id: paymentId,
      p_reason: reason,
    });
    if (error) throw rpcError(error);
    this.parties.invalidateFinancials();
    return data;
  }

  async reverseCreditPurchase(purchaseId: string, reason: string): Promise<string> {
    const { data, error } = await this.db.rpc('reverse_credit_purchase', {
      p_purchase_id: purchaseId,
      p_reason: reason,
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

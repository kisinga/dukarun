import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type LedgerAccount = Database['public']['Tables']['ledger_accounts']['Row'];
export type JournalEntry = Database['public']['Tables']['ledger_journal_entries']['Row'];
export type JournalLine = Database['public']['Tables']['ledger_journal_lines']['Row'];
export type CashierSession = Database['public']['Tables']['cashier_sessions']['Row'];
export type DrawerCount = Database['public']['Tables']['cash_drawer_counts']['Row'];
export type AccountingPeriod = Database['public']['Tables']['accounting_periods']['Row'];
export type PeriodLock = Database['public']['Tables']['period_locks']['Row'];
export type Purchase = Database['public']['Tables']['purchases']['Row'];
export type PurchasePayment = Database['public']['Tables']['purchase_payments']['Row'];
export type MoneyCustomer = Database['public']['Tables']['customers']['Row'];

export type JournalLineWithAccount = JournalLine & {
  ledger_accounts: Pick<LedgerAccount, 'code' | 'name'> | null;
};
export type JournalEntryWithLines = JournalEntry & {
  ledger_journal_lines: JournalLineWithAccount[];
};
export type SessionWithCounts = CashierSession & { cash_drawer_counts: DrawerCount[] };

/** Declaration item for cashier sessions and manual reconciliation. */
export interface Declaration {
  account_code: string;
  declared: number; // cents
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

  private get db() {
    return this.supabase.client;
  }

  // --- Reads ---

  /** Leaf active asset accounts — the account picker source. */
  async assetAccounts(): Promise<LedgerAccount[]> {
    const { data, error } = await this.db
      .from('ledger_accounts')
      .select('*')
      .eq('is_parent', false)
      .eq('is_active', true)
      .eq('type', 'asset')
      .order('code');
    if (error) throw error;
    return data;
  }

  /** Cashier-controlled accounts from enabled payment methods (cash→CASH_ON_HAND, mpesa→CLEARING_MPESA). */
  async cashierAccounts(): Promise<CashierAccount[]> {
    const { data, error } = await this.db
      .from('payment_methods')
      .select('name, ledger_account_code')
      .eq('is_cashier_controlled', true)
      .eq('enabled', true);
    if (error) throw error;
    return data.map(m => ({ account_code: m.ledger_account_code, label: m.name }));
  }

  /** Enabled non-credit payment method codes (for repayment/allocation selects). */
  async enabledMethodCodes(): Promise<string[]> {
    const { data, error } = await this.db
      .from('payment_methods')
      .select('code')
      .eq('enabled', true)
      .neq('code', 'credit');
    if (error) throw error;
    return data.map(m => m.code);
  }

  async journalBySource(sourceType: string, limit = 20): Promise<JournalEntryWithLines[]> {
    const { data, error } = await this.db
      .from('ledger_journal_entries')
      .select('*, ledger_journal_lines(*, ledger_accounts(code, name))')
      .eq('source_type', sourceType)
      .order('posted_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async openSession(): Promise<CashierSession | null> {
    const { data, error } = await this.db
      .from('cashier_sessions')
      .select('*')
      .eq('status', 'open')
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

  /** Non-supplier customers joined with their AR balance (client-side join on the view). */
  async customersWithAr(): Promise<(MoneyCustomer & { ar_balance: number })[]> {
    const [{ data: customers, error: e1 }, { data: balances, error: e2 }] = await Promise.all([
      this.db.from('customers').select('*').eq('is_supplier', false).order('first_name'),
      this.db.from('customer_ar_balances').select('*'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const byCustomer = new Map((balances ?? []).map(b => [b.customer_id, b.balance ?? 0]));
    return (customers ?? []).map(c => ({ ...c, ar_balance: byCustomer.get(c.id) ?? 0 }));
  }

  async suppliersWithAp(): Promise<(MoneyCustomer & { ap_balance: number })[]> {
    const [{ data: suppliers, error: e1 }, { data: balances, error: e2 }] = await Promise.all([
      this.db.from('customers').select('*').eq('is_supplier', true).order('first_name'),
      this.db.from('supplier_ap_balances').select('*'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const bySupplier = new Map((balances ?? []).map(b => [b.supplier_id, b.balance ?? 0]));
    return (suppliers ?? []).map(s => ({ ...s, ap_balance: bySupplier.get(s.id) ?? 0 }));
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

  async purchasesWithPayments(): Promise<(Purchase & { paid: number })[]> {
    const { data: purchases, error: e1 } = await this.db
      .from('purchases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
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
    const { data, error } = await this.db.rpc('open_cashier_session', {
      p_declarations: declarations as never,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async closeCashierSession(sessionId: string, declarations: Declaration[]): Promise<string> {
    const { data, error } = await this.db.rpc('close_cashier_session', {
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
    return data;
  }

  async recordPurchase(
    supplierId: string,
    lines: { product_id: string; quantity: number; unit_cost: number; expiry_date?: string }[],
    isCredit: boolean,
    reference?: string,
    accountCode?: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('record_purchase', {
      p_supplier_id: supplierId,
      p_lines: lines as never,
      p_is_credit: isCredit,
      ...(reference ? { p_reference: reference } : {}),
      ...(accountCode ? { p_account_code: accountCode } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async paySupplier(supplierId: string, amount: number, accountCode: string): Promise<string> {
    const { data, error } = await this.db.rpc('pay_supplier', {
      p_supplier_id: supplierId,
      p_amount: amount,
      p_account_code: accountCode,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async postInventoryWriteOff(
    productId: string,
    quantity: number,
    reason: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('post_inventory_write_off', {
      p_product_id: productId,
      p_quantity: quantity,
      p_reason: reason,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async postInventoryAdjustment(
    productId: string,
    valueChange: number,
    reason: string
  ): Promise<string> {
    const { data, error } = await this.db.rpc('post_inventory_adjustment', {
      p_product_id: productId,
      p_value_change: valueChange,
      p_reason: reason,
    });
    if (error) throw rpcError(error);
    return data;
  }
}

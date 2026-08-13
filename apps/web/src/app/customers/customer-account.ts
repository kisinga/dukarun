export type CustomerInvoiceBalance = {
  id: string;
  code: string;
  outstanding: number;
  created_at: string;
};

export type CustomerReceiptPlan = {
  applied: number;
  excess: number;
  allocations: { code: string; amount: number; clearsInvoice: boolean }[];
  hiddenAllocations: number;
  clearedInvoices: number;
};

export function planCustomerReceipt(
  amount: number,
  invoices: readonly CustomerInvoiceBalance[]
): CustomerReceiptPlan | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;

  let remaining = amount;
  const allAllocations: CustomerReceiptPlan['allocations'] = [];
  const oldestFirst = [...invoices].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
  for (const invoice of oldestFirst) {
    if (remaining <= 0) break;
    if (invoice.outstanding <= 0) continue;
    const applied = Math.min(remaining, invoice.outstanding);
    allAllocations.push({
      code: invoice.code,
      amount: applied,
      clearsInvoice: applied === invoice.outstanding,
    });
    remaining -= applied;
  }

  // One exact allocation is self-evident; richer cases get the transparent preview.
  if (allAllocations.length <= 1 && remaining === 0) return null;
  return {
    applied: amount - remaining,
    excess: remaining,
    allocations: allAllocations.slice(0, 3),
    hiddenAllocations: Math.max(allAllocations.length - 3, 0),
    clearedInvoices: allAllocations.filter(allocation => allocation.clearsInvoice).length,
  };
}

export function customerAccountState(netBalance: number): string {
  if (netBalance > 0) return 'Amount due';
  if (netBalance < 0) return 'Downpayment available';
  return 'Settled';
}

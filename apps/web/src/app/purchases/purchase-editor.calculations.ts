import type { PurchasePriceBasis, PurchaseTaxContext } from '@dukarun/tax-types';
import { parseKes } from '../core/money';
import type { PurchaseExpenseInput, PurchaseLineInput } from '../money/money.service';
import type { Variant } from '../pos/pos.service';
import type { PurchaseLineForm } from './purchase-line-row.component';
import type { ExpenseForm, ExpenseSettlement } from './purchase-editor.store';
import type { PurchasePaymentMode } from './purchase-payment-review.component';

export interface EnteredTaxBreakdown {
  entered: number;
  gross: number;
  net: number;
  tax: number;
  rateBps: number;
}

/** Money calculations use integer shillings at the invoice boundary. */
export function purchaseTaxBreakdown(
  entered: number,
  rateBps: number,
  basis: PurchasePriceBasis
): EnteredTaxBreakdown {
  if (basis === 'exclusive') {
    const tax = Math.round((entered * rateBps) / 10_000);
    return { entered, net: entered, tax, gross: entered + tax, rateBps };
  }
  const net = Math.round((entered * 10_000) / (10_000 + rateBps));
  return { entered, gross: entered, net, tax: entered - net, rateBps };
}

export function purchaseLineEnteredAmount(line: PurchaseLineForm): number {
  return line.valueSource === 'total'
    ? (parseKes(line.lineTotal) ?? 0)
    : Math.round(line.quantity * (parseKes(line.unitCost) ?? 0));
}

export function purchaseLineTaxBreakdown(
  line: PurchaseLineForm,
  rateBps: number,
  basis: PurchasePriceBasis
): EnteredTaxBreakdown {
  const entered = purchaseLineEnteredAmount(line);
  if (basis === 'exclusive' && line.grossAmountOverride !== undefined) {
    return {
      entered,
      gross: line.grossAmountOverride,
      net: entered,
      tax: line.grossAmountOverride - entered,
      rateBps,
    };
  }
  return purchaseTaxBreakdown(entered, rateBps, basis);
}

export function purchaseExpenseTaxBreakdown(
  expense: ExpenseForm,
  context: PurchaseTaxContext | null,
  basis: PurchasePriceBasis
): EnteredTaxBreakdown {
  const entered = parseKes(expense.amount) ?? 0;
  const supplierBill = expense.settlement === 'supplier_bill';
  const rateBps = supplierBill ? (context?.supplier_expense.tax_rate_bps ?? 0) : 0;
  if (supplierBill && basis === 'exclusive' && expense.grossAmountOverride !== undefined) {
    return {
      entered,
      gross: expense.grossAmountOverride,
      net: entered,
      tax: expense.grossAmountOverride - entered,
      rateBps,
    };
  }
  return purchaseTaxBreakdown(entered, rateBps, supplierBill ? basis : 'inclusive');
}

export function purchasePaymentProjection(input: {
  invoiceTotal: number;
  separateExpenseTotal: number;
  advanceAmount: number;
  paymentMode: PurchasePaymentMode;
  partialAmount: number;
}): { initialPayment: number; balanceDue: number; cashLeavingNow: number } {
  const initialPayment =
    input.paymentMode === 'paid'
      ? Math.max(0, input.invoiceTotal - input.advanceAmount)
      : input.paymentMode === 'later'
        ? 0
        : input.partialAmount;
  return {
    initialPayment,
    balanceDue: Math.max(0, input.invoiceTotal - initialPayment - input.advanceAmount),
    cashLeavingNow: initialPayment + input.separateExpenseTotal,
  };
}

export function buildPurchaseLineInputs(input: {
  lines: PurchaseLineForm[];
  breakdowns: ReadonlyMap<number, EnteredTaxBreakdown>;
  basis: PurchasePriceBasis;
  variants: ReadonlyMap<string, Variant>;
  includeExpiry: boolean;
  canAdjustPrices: boolean;
}): PurchaseLineInput[] {
  return input.lines.map(line => {
    const variant = input.variants.get(line.variantId)!;
    const wholesale = parseKes(line.wholesalePrice) ?? 0;
    const retail = parseKes(line.retailPrice) ?? 0;
    const enteredUnitCost = parseKes(line.unitCost)!;
    const enteredLineTotal = parseKes(line.lineTotal)!;
    const breakdown = input.breakdowns.get(line.key)!;
    const exclusive = input.basis === 'exclusive';
    return {
      variant_id: line.variantId,
      quantity: line.quantity,
      unit_cost: exclusive ? Math.round(breakdown.gross / line.quantity) : enteredUnitCost,
      line_total: exclusive ? breakdown.gross : enteredLineTotal,
      value_source: exclusive ? 'total' : line.valueSource,
      price_entry_basis: input.basis,
      entered_value_source: line.valueSource,
      entered_unit_cost: enteredUnitCost,
      entered_line_total: enteredLineTotal,
      ...(input.includeExpiry && line.expiryDate ? { expiry_date: line.expiryDate } : {}),
      ...(line.batchNumber.trim() ? { batch_number: line.batchNumber.trim() } : {}),
      ...(input.canAdjustPrices && wholesale !== (variant.wholesale_price ?? 0)
        ? { new_wholesale_price: wholesale }
        : {}),
      ...(input.canAdjustPrices && retail !== (variant.price ?? 0)
        ? { new_retail_price: retail }
        : {}),
    };
  });
}

export function buildPurchaseExpenseInputs(input: {
  expenses: ExpenseForm[];
  breakdowns: ReadonlyMap<number, EnteredTaxBreakdown>;
  basis: PurchasePriceBasis;
}): PurchaseExpenseInput[] {
  return input.expenses.map(item => {
    const enteredAmount = parseKes(item.amount)!;
    const breakdown = input.breakdowns.get(item.key)!;
    return {
      category: item.category as PurchaseExpenseInput['category'],
      ...(item.category === 'other' ? { custom_label: item.customCategory.trim() } : {}),
      ...(item.memo.trim() ? { memo: item.memo.trim() } : {}),
      amount:
        input.basis === 'exclusive' && item.settlement === 'supplier_bill'
          ? breakdown.gross
          : enteredAmount,
      settlement: item.settlement as Exclude<ExpenseSettlement, ''>,
      ...(item.settlement === 'separate' ? { account_code: item.accountCode } : {}),
      price_entry_basis: input.basis,
      entered_amount: enteredAmount,
    };
  });
}

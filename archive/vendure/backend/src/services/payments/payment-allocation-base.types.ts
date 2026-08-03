/**
 * Shared types and utilities for payment allocation
 * Used by both customer and supplier payment allocation services
 */

export interface PaymentAllocationItem {
  id: string;
  code: string; // Order code or purchase reference number
  totalAmount: number; // Total amount in smallest currency unit (cents)
  paidAmount: number; // Already paid amount in smallest currency unit (cents)
  createdAt: Date; // For sorting (oldest first)
}

export interface PaymentAllocationResult {
  itemsPaid: Array<{
    itemId: string;
    itemCode: string;
    amountPaid: number; // In smallest currency unit (cents)
  }>;
  remainingBalance: number; // In smallest currency unit (cents)
  totalAllocated: number; // In smallest currency unit (cents)
  excessPayment: number; // In smallest currency unit (cents) - amount paid beyond what's owed
}

export interface PaymentAllocationCalculation {
  itemsToPay: PaymentAllocationItem[];
  paymentAmount: number; // In smallest currency unit (cents)
  selectedItemIds?: string[]; // Optional filter
}

/**
 * Calculate payment allocation across items
 * Returns allocation details including excess payment handling
 */
export function calculatePaymentAllocation(calculation: PaymentAllocationCalculation): {
  allocations: Array<{ itemId: string; itemCode: string; amountToAllocate: number }>;
  excessPayment: number;
  totalAllocated: number;
} {
  const { itemsToPay, paymentAmount, selectedItemIds } = calculation;

  // Filter to selected items if provided
  let eligibleItems = itemsToPay;
  if (selectedItemIds && selectedItemIds.length > 0) {
    eligibleItems = itemsToPay.filter(item => selectedItemIds.includes(item.id));
  }

  // Sort by creation date (oldest first)
  eligibleItems.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const allocations: Array<{ itemId: string; itemCode: string; amountToAllocate: number }> = [];
  let remainingPayment = paymentAmount;
  let totalAllocated = 0;

  for (const item of eligibleItems) {
    if (remainingPayment <= 0) {
      break;
    }

    // Calculate amount still owed on this item
    const amountOwed = item.totalAmount - item.paidAmount;

    if (amountOwed <= 0) {
      continue; // Item is already fully paid
    }

    // Allocate payment to this item (up to what's owed)
    const amountToAllocate = Math.min(remainingPayment, amountOwed);

    allocations.push({
      itemId: item.id,
      itemCode: item.code,
      amountToAllocate,
    });

    totalAllocated += amountToAllocate;
    remainingPayment -= amountToAllocate;
  }

  // Excess payment is any remaining payment after all items are paid
  const excessPayment = Math.max(0, remainingPayment);

  return {
    allocations,
    excessPayment,
    totalAllocated,
  };
}

/**
 * Calculate remaining balance across all items
 */
export function calculateRemainingBalance(items: PaymentAllocationItem[]): number {
  return items.reduce((sum, item) => {
    const amountOwed = item.totalAmount - item.paidAmount;
    return sum + Math.max(0, amountOwed);
  }, 0);
}

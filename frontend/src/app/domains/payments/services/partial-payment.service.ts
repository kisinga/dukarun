import { Injectable } from '@angular/core';

/**
 * Partial Payment Service
 *
 * Composable utility service for payment status calculations.
 * These functions are reusable and not tied to any specific flow.
 *
 * NOTE: Payment status is a placeholder. Actual payment transactions
 * linked to purchases are the source of truth.
 */
@Injectable({
  providedIn: 'root',
})
export class PartialPaymentService {
  /**
   * Calculate payment status based on total and paid amounts
   * @param total - Total amount required
   * @param paid - Amount already paid
   * @returns Payment status: 'paid', 'partial', or 'pending'
   */
  calculatePaymentStatus(total: number, paid: number): 'paid' | 'pending' | 'partial' {
    if (paid <= 0) {
      return 'pending';
    }

    if (paid >= total) {
      return 'paid';
    }

    return 'partial';
  }

  /**
   * Calculate remaining balance
   * @param total - Total amount required
   * @param paid - Amount already paid
   * @returns Remaining balance (always >= 0)
   */
  calculateRemainingBalance(total: number, paid: number): number {
    const remaining = total - paid;
    return Math.max(0, remaining);
  }

  /**
   * Calculate paid percentage
   * @param total - Total amount required
   * @param paid - Amount already paid
   * @returns Percentage paid (0-100)
   */
  calculatePaidPercentage(total: number, paid: number): number {
    if (total <= 0) return 0;
    const percentage = (paid / total) * 100;
    return Math.min(100, Math.max(0, percentage));
  }
}

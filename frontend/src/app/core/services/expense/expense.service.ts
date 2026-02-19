import { Injectable, inject } from '@angular/core';
import { RECORD_EXPENSE } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';

export interface RecordExpenseResult {
  sourceId: string;
}

/**
 * Expense recording service.
 * Calls recordExpense mutation (debit expense account, credit source account).
 */
@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  private readonly apolloService = inject(ApolloService);

  /**
   * Record an expense.
   * @param amountCents - Amount in cents
   * @param sourceAccountCode - Account to debit (e.g. Cash, M-Pesa)
   * @param memo - Optional memo
   * @param category - Optional expense category code (defaults to 'other' if not provided)
   * @returns Result with sourceId (journal entry id) or null if failed
   */
  async recordExpense(
    amountCents: number,
    sourceAccountCode: string,
    memo?: string,
    category?: string,
  ): Promise<RecordExpenseResult | null> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate<{ recordExpense: RecordExpenseResult }>({
        mutation: RECORD_EXPENSE as any,
        variables: {
          input: {
            amount: amountCents,
            sourceAccountCode: sourceAccountCode.trim(),
            memo: memo?.trim() || undefined,
            category: category?.trim() || undefined,
          },
        },
      });

      if (result.error) {
        console.error('Record expense error:', result.error);
        return null;
      }

      const data = result.data?.recordExpense;
      if (!data) return null;
      return data;
    } catch (error: unknown) {
      console.error('Record expense error:', error);
      throw error;
    }
  }
}

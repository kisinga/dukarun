import { inject, Injectable } from '@angular/core';
import {
  APPROVE_CUSTOMER_CREDIT,
  GET_CREDIT_SUMMARY,
  GET_CUSTOMERS,
  UPDATE_CREDIT_DURATION,
  UPDATE_CUSTOMER_CREDIT_LIMIT,
  VALIDATE_CREDIT,
} from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { CreditCustomerSummary, CustomerRecord } from '../customer.service';
import { CustomerMapperService } from './customer-mapper.service';

/**
 * Customer Credit Service
 *
 * Handles all credit-related operations for customers.
 * Includes credit approval, limits, validation, and summary operations.
 *
 * ARCHITECTURE: Ledger as Single Source of Truth
 * - All financial data (balances, outstanding amounts) comes from the ledger
 * - Backend FinancialService provides ledger-based calculations
 * - No local calculations or fallbacks - backend is authoritative
 * - Outstanding amounts are computed from Accounts Receivable (AR) ledger account
 */
@Injectable({
  providedIn: 'root',
})
export class CustomerCreditService {
  private readonly apolloService = inject(ApolloService);
  private readonly mapper = inject(CustomerMapperService);

  /**
   * Search for customers eligible for credit sales.
   */
  async searchCreditCustomers(term: string, take = 50): Promise<CreditCustomerSummary[]> {
    const normalizedTerm = term.trim().toLowerCase();
    if (normalizedTerm.length === 0) {
      return [];
    }

    const client = this.apolloService.getClient();
    const result = await client.query<{ customers: { items: CustomerRecord[] } }>({
      query: GET_CUSTOMERS,
      variables: {
        options: {
          take,
          skip: 0,
          filter: {
            firstName: { contains: term },
          },
        },
      },
      fetchPolicy: 'network-only',
    });

    const items = result.data?.customers?.items ?? [];
    return items
      .filter((customer) => Boolean(customer.customFields?.isCreditApproved))
      .map((customer) => this.mapper.toCreditSummary(customer))
      .filter((customer) => {
        const phone = customer.phone?.toLowerCase() ?? '';
        return (
          customer.name.toLowerCase().includes(normalizedTerm) || phone.includes(normalizedTerm)
        );
      })
      .sort((a, b) => b.availableCredit - a.availableCredit)
      .slice(0, 20);
  }

  /**
   * Retrieve up-to-date credit summary for a customer.
   */
  async getCreditSummary(
    customerId: string,
    base?: Partial<CreditCustomerSummary>,
  ): Promise<CreditCustomerSummary> {
    const client = this.apolloService.getClient();

    try {
      const result = await client.query<{
        creditSummary: {
          customerId: string;
          isCreditApproved: boolean;
          creditLimit: number;
          outstandingAmount: number;
          availableCredit: number;
          lastRepaymentDate?: string | null;
          lastRepaymentAmount: number;
          creditDuration: number;
        };
      }>({
        query: GET_CREDIT_SUMMARY,
        variables: { customerId },
        fetchPolicy: 'network-only',
      });

      const summary = result.data?.creditSummary;
      if (!summary) {
        throw new Error('Credit summary unavailable');
      }

      const s = summary as typeof summary & { creditFrozen?: boolean };
      return {
        id: summary.customerId,
        name: base?.name ?? '',
        phone: base?.phone,
        email: base?.email,
        isCreditApproved: summary.isCreditApproved,
        creditFrozen: s.creditFrozen ?? false,
        creditLimit: summary.creditLimit,
        outstandingAmount: summary.outstandingAmount, // From ledger (AR account)
        availableCredit: summary.availableCredit, // Calculated by backend from ledger
        lastRepaymentDate: summary.lastRepaymentDate,
        lastRepaymentAmount: summary.lastRepaymentAmount,
        creditDuration: summary.creditDuration,
      };
    } catch (error) {
      // No fallback - ledger is the single source of truth
      // If backend fails, we cannot provide accurate financial data
      console.error('❌ Failed to load credit summary from ledger:', error);
      throw new Error(
        'Unable to retrieve credit information. The financial system is unavailable. ' +
          'Please try again or contact support if the problem persists.',
      );
    }
  }

  /**
   * Validate credit availability for a given order total.
   * Uses backend validation for single source of truth.
   */
  async validateCustomerCredit(
    customerId: string,
    orderTotal: number,
    base?: Partial<CreditCustomerSummary>,
  ): Promise<{ summary: CreditCustomerSummary; error?: string }> {
    const client = this.apolloService.getClient();

    try {
      // Call backend validation (single source of truth)
      const validationResult = await client.query<{
        validateCredit: {
          isValid: boolean;
          error?: string | null;
          availableCredit: number;
          estimatedOrderTotal: number;
          wouldExceedLimit: boolean;
        };
      }>({
        query: VALIDATE_CREDIT,
        variables: {
          input: {
            customerId,
            estimatedOrderTotal: orderTotal,
          },
        },
        fetchPolicy: 'network-only', // Always get fresh data
      });

      const validation = validationResult.data?.validateCredit;
      if (!validation) {
        throw new Error('Validation unavailable');
      }

      // Get updated credit summary (with latest outstanding amount)
      const summary = await this.getCreditSummary(customerId, base);

      if (!validation.isValid && validation.error) {
        return {
          summary,
          error: validation.error,
        };
      }

      return { summary };
    } catch (error) {
      // No fallback - backend validation uses ledger data
      // If backend fails, we cannot validate credit accurately
      console.error('❌ Backend credit validation failed:', error);
      throw new Error(
        'Unable to validate credit. The financial system is unavailable. ' +
          'Please try again or contact support if the problem persists.',
      );
    }
  }

  async listCreditCustomers(take = 200): Promise<CreditCustomerSummary[]> {
    const client = this.apolloService.getClient();
    const result = await client.query<{ customers: { items: CustomerRecord[] } }>({
      query: GET_CUSTOMERS,
      variables: {
        options: {
          take,
          skip: 0,
          sort: {
            createdAt: 'DESC',
          },
        },
      },
      fetchPolicy: 'network-only',
    });

    const items = result.data?.customers?.items ?? [];
    return items.map((customer) => this.mapper.toCreditSummary(customer));
  }

  async approveCustomerCredit(
    customerId: string,
    approved: boolean,
    creditLimit?: number,
    base?: Partial<CreditCustomerSummary>,
    creditDuration?: number,
  ): Promise<CreditCustomerSummary> {
    const client = this.apolloService.getClient();
    try {
      const result = await client.mutate<{
        approveCustomerCredit: {
          customerId: string;
          isCreditApproved: boolean;
          creditLimit: number;
          outstandingAmount: number;
          availableCredit: number;
          lastRepaymentDate?: string | null;
          lastRepaymentAmount: number;
          creditDuration: number;
        };
      }>({
        mutation: APPROVE_CUSTOMER_CREDIT,
        variables: {
          input: {
            customerId,
            approved,
            creditLimit,
            creditDuration,
          },
        },
      });

      if (result.error) {
        console.error('❌ GraphQL error:', result.error);
        const errorMessage = result.error.message || 'Unknown error';
        throw new Error(`Failed to update customer credit approval: ${errorMessage}`);
      }

      const summary = result.data?.approveCustomerCredit;
      if (!summary) {
        throw new Error('Failed to update customer credit approval: No data returned.');
      }

      return {
        id: summary.customerId,
        name: base?.name ?? '',
        phone: base?.phone,
        email: base?.email,
        isCreditApproved: summary.isCreditApproved,
        creditLimit: summary.creditLimit,
        outstandingAmount: summary.outstandingAmount,
        availableCredit: summary.availableCredit,
        lastRepaymentDate: summary.lastRepaymentDate,
        lastRepaymentAmount: summary.lastRepaymentAmount,
        creditDuration: summary.creditDuration,
      };
    } catch (error: any) {
      console.error('Error in approveCustomerCredit:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(
        `Failed to update customer credit approval: ${error?.message || 'Unknown error'}`,
      );
    }
  }

  async updateCustomerCreditLimit(
    customerId: string,
    creditLimit: number,
    base?: Partial<CreditCustomerSummary>,
    creditDuration?: number,
  ): Promise<CreditCustomerSummary> {
    const client = this.apolloService.getClient();
    const result = await client.mutate<{
      updateCustomerCreditLimit: {
        customerId: string;
        isCreditApproved: boolean;
        creditLimit: number;
        outstandingAmount: number;
        availableCredit: number;
        lastRepaymentDate?: string | null;
        lastRepaymentAmount: number;
        creditDuration: number;
      };
    }>({
      mutation: UPDATE_CUSTOMER_CREDIT_LIMIT,
      variables: {
        input: {
          customerId,
          creditLimit,
          creditDuration,
        },
      },
    });

    if (result.error) {
      console.error('❌ GraphQL error:', result.error);
      const errorMessage = result.error.message || 'Unknown error';
      throw new Error(`Failed to update customer credit limit: ${errorMessage}`);
    }

    const summary = result.data?.updateCustomerCreditLimit;
    if (!summary) {
      throw new Error('Failed to update customer credit limit: No data returned.');
    }

    return {
      id: summary.customerId,
      name: base?.name ?? '',
      phone: base?.phone,
      email: base?.email,
      isCreditApproved: summary.isCreditApproved,
      creditLimit: summary.creditLimit,
      outstandingAmount: summary.outstandingAmount,
      availableCredit: summary.availableCredit,
      lastRepaymentDate: summary.lastRepaymentDate,
      lastRepaymentAmount: summary.lastRepaymentAmount,
      creditDuration: summary.creditDuration,
    };
  }

  async updateCreditDuration(
    customerId: string,
    creditDuration: number,
    base?: Partial<CreditCustomerSummary>,
  ): Promise<CreditCustomerSummary> {
    const client = this.apolloService.getClient();
    const result = await client.mutate<{
      updateCreditDuration: {
        customerId: string;
        isCreditApproved: boolean;
        creditLimit: number;
        outstandingAmount: number;
        availableCredit: number;
        lastRepaymentDate?: string | null;
        lastRepaymentAmount: number;
        creditDuration: number;
      };
    }>({
      mutation: UPDATE_CREDIT_DURATION,
      variables: {
        input: {
          customerId,
          creditDuration,
        },
      },
    });

    if (result.error) {
      console.error('❌ GraphQL error:', result.error);
      const errorMessage = result.error.message || 'Unknown error';
      throw new Error(`Failed to update customer credit duration: ${errorMessage}`);
    }

    const summary = result.data?.updateCreditDuration;
    if (!summary) {
      throw new Error('Failed to update customer credit duration: No data returned.');
    }

    return {
      id: summary.customerId,
      name: base?.name ?? '',
      phone: base?.phone,
      email: base?.email,
      isCreditApproved: summary.isCreditApproved,
      creditLimit: summary.creditLimit,
      outstandingAmount: summary.outstandingAmount,
      availableCredit: summary.availableCredit,
      lastRepaymentDate: summary.lastRepaymentDate,
      lastRepaymentAmount: summary.lastRepaymentAmount,
      creditDuration: summary.creditDuration,
    };
  }
}

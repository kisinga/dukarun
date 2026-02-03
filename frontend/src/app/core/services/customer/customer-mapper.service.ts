import { Injectable } from '@angular/core';
import { extractCents, extractDisplayName } from '../../utils/data-extractors';
import { CreditCustomerSummary, CustomerRecord } from '../customer.service';

@Injectable({
  providedIn: 'root',
})
export class CustomerMapperService {
  /**
   * Transform CustomerRecord to CreditCustomerSummary.
   * Uses shared extractors for display name and numeric fields.
   */
  toCreditSummary(customer: CustomerRecord): CreditCustomerSummary {
    const creditLimit = extractCents(customer.customFields?.creditLimit ?? 0);
    const outstandingAmount = extractCents(customer.outstandingAmount ?? 0);
    const availableCredit = Math.max(creditLimit - Math.abs(outstandingAmount), 0);
    const lastRepaymentAmount = extractCents(customer.customFields?.lastRepaymentAmount ?? 0);
    const creditDuration = Number(customer.customFields?.creditDuration ?? 30);

    return {
      id: customer.id,
      name: extractDisplayName(customer.firstName, customer.lastName),
      phone: customer.phoneNumber ?? undefined,
      email: customer.emailAddress ?? undefined,
      isCreditApproved: Boolean(customer.customFields?.isCreditApproved),
      creditLimit,
      outstandingAmount,
      availableCredit,
      lastRepaymentDate: customer.customFields?.lastRepaymentDate ?? null,
      lastRepaymentAmount,
      creditDuration,
    };
  }
}

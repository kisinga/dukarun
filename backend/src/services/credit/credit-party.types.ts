import { ID } from '@vendure/core';

export type CreditPartyType = 'customer' | 'supplier';

export interface CreditFieldMap {
  isApproved: string;
  creditLimit: string;
  creditDuration: string;
  lastRepaymentDate: string;
  lastRepaymentAmount: string;
  approvedByUserId: string;
}

export const CREDIT_FIELD_MAPS: Record<CreditPartyType, CreditFieldMap> = {
  customer: {
    isApproved: 'isCreditApproved',
    creditLimit: 'creditLimit',
    creditDuration: 'creditDuration',
    lastRepaymentDate: 'lastRepaymentDate',
    lastRepaymentAmount: 'lastRepaymentAmount',
    approvedByUserId: 'creditApprovedByUserId',
  },
  supplier: {
    isApproved: 'isSupplierCreditApproved',
    creditLimit: 'supplierCreditLimit',
    creditDuration: 'supplierCreditDuration',
    lastRepaymentDate: 'supplierLastRepaymentDate',
    lastRepaymentAmount: 'supplierLastRepaymentAmount',
    approvedByUserId: 'supplierCreditApprovedByUserId',
  },
};

export interface CreditSummary {
  entityId: ID;
  partyType: CreditPartyType;
  isCreditApproved: boolean;
  creditFrozen: boolean;
  creditLimit: number;
  outstandingAmount: number;
  availableCredit: number;
  lastRepaymentDate?: Date | null;
  lastRepaymentAmount: number;
  creditDuration: number;
}

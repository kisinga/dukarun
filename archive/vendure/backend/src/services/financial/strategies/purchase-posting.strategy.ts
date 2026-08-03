import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ACCOUNT_CODES } from '../../../ledger/account-codes.constants';
import { BaseTransactionStrategy } from '../base-transaction-strategy';
import { LedgerPostingService } from '../ledger-posting.service';
import { LedgerQueryService } from '../ledger-query.service';
import { PurchasePostingContext, createSupplierPurchaseEntry } from '../posting-policy';
import {
  PostingResult,
  TransactionData,
  TransactionType,
} from '../ledger-transaction-strategy.interface';

/**
 * Purchase Transaction Data
 */
export interface PurchaseTransactionData extends TransactionData {
  purchaseId: string;
  purchaseReference: string;
  supplierId: string;
  totalCost: number; // in cents
  isCreditPurchase: boolean;
}

/**
 * Purchase Posting Strategy
 *
 * Handles posting of purchase transactions (both credit and cash purchases) to the ledger.
 * - Credit Purchase: Debit PURCHASES, Credit ACCOUNTS_PAYABLE
 * - Cash Purchase: Debit PURCHASES, Credit CASH_ON_HAND
 */
@Injectable()
export class PurchasePostingStrategy extends BaseTransactionStrategy {
  constructor(postingService: LedgerPostingService, queryService: LedgerQueryService) {
    super(postingService, queryService, 'PurchasePostingStrategy');
  }

  canHandle(data: TransactionData): boolean {
    return (
      'purchaseId' in data &&
      'supplierId' in data &&
      'totalCost' in data &&
      'isCreditPurchase' in data
    );
  }

  getTransactionType(): TransactionType {
    return TransactionType.PURCHASE;
  }

  protected async doPost(data: TransactionData): Promise<PostingResult> {
    const purchaseData = data as PurchaseTransactionData;

    // Validate purchase data
    if (purchaseData.totalCost <= 0) {
      throw new Error(
        `Purchase ${purchaseData.purchaseId} has non-positive total cost (${purchaseData.totalCost}) and cannot be posted to ledger`
      );
    }

    // Create posting context
    const context: PurchasePostingContext = {
      amount: purchaseData.totalCost,
      purchaseId: purchaseData.purchaseId,
      purchaseReference: purchaseData.purchaseReference,
      supplierId: purchaseData.supplierId,
      isCreditPurchase: purchaseData.isCreditPurchase,
    };

    // Post to ledger
    await this.postingService.postSupplierPurchase(
      purchaseData.ctx,
      purchaseData.purchaseId,
      context
    );

    this.logger.log(
      `Posted purchase ${purchaseData.purchaseReference} (${purchaseData.isCreditPurchase ? 'credit' : 'cash'}) to ledger`
    );

    return {
      success: true,
    };
  }

  protected getAffectedAccountCodes(data: TransactionData): string[] {
    const purchaseData = data as PurchaseTransactionData;
    const accounts: string[] = [ACCOUNT_CODES.PURCHASES];

    if (purchaseData.isCreditPurchase) {
      accounts.push(ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    } else {
      accounts.push(ACCOUNT_CODES.CASH_ON_HAND);
    }

    return accounts;
  }
}

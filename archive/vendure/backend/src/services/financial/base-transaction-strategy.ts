import { Logger, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ACCOUNT_CODES } from '../../ledger/account-codes.constants';
import { LedgerQueryService } from './ledger-query.service';
import { LedgerPostingService } from './ledger-posting.service';
import {
  LedgerTransactionStrategy,
  PostingResult,
  TransactionData,
  TransactionType,
} from './ledger-transaction-strategy.interface';

/**
 * Base Transaction Strategy
 *
 * Provides common functionality for all transaction posting strategies.
 * Implements template method pattern - subclasses implement specific posting logic.
 */
export abstract class BaseTransactionStrategy implements LedgerTransactionStrategy {
  protected readonly logger: Logger;

  constructor(
    protected readonly postingService: LedgerPostingService,
    protected readonly queryService: LedgerQueryService,
    strategyName: string
  ) {
    this.logger = new Logger(strategyName);
  }

  /**
   * Template method - orchestrates the posting process
   */
  async post(data: TransactionData): Promise<PostingResult> {
    try {
      // Validate transaction data
      this.validateTransactionData(data);

      // Perform the actual posting (implemented by subclasses)
      const result = await this.doPost(data);

      // Invalidate cache for affected accounts
      await this.invalidateCache(data, result);

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to post ${this.getTransactionType()} transaction ${data.sourceId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Abstract method - subclasses implement specific posting logic
   */
  protected abstract doPost(data: TransactionData): Promise<PostingResult>;

  /**
   * Abstract method - subclasses specify which accounts are affected
   */
  protected abstract getAffectedAccountCodes(data: TransactionData): string[];

  /**
   * Validate transaction data before posting
   */
  protected validateTransactionData(data: TransactionData): void {
    if (!data.ctx) {
      throw new Error('RequestContext is required');
    }
    if (!data.sourceId) {
      throw new Error('sourceId is required');
    }
    if (!data.channelId) {
      throw new Error('channelId is required');
    }
  }

  /**
   * Invalidate cache for affected accounts
   */
  protected async invalidateCache(data: TransactionData, result: PostingResult): Promise<void> {
    if (!result.success) {
      return;
    }

    const accountCodes = this.getAffectedAccountCodes(data);
    for (const accountCode of accountCodes) {
      this.queryService.invalidateCache(data.channelId, accountCode as string);
      this.logger.debug(
        `Invalidated cache for account ${accountCode} (channel: ${data.channelId})`
      );
    }
  }

  /**
   * Abstract method - subclasses must implement
   */
  abstract canHandle(data: TransactionData): boolean;

  /**
   * Abstract method - subclasses must implement
   */
  abstract getTransactionType(): TransactionType;
}

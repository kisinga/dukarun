import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { LedgerPostingService } from './ledger-posting.service';
import { LedgerQueryService } from './ledger-query.service';
import { PurchasePostingStrategy } from './strategies/purchase-posting.strategy';
import { SalePostingStrategy } from './strategies/sale-posting.strategy';
import {
  LedgerTransactionStrategy,
  PostingResult,
  TransactionData,
} from './ledger-transaction-strategy.interface';

/**
 * Ledger Transaction Service
 *
 * Orchestrates automatic posting of transactions to the ledger.
 * Uses strategy pattern to route different transaction types to appropriate handlers.
 *
 * This service ensures that all financial movements automatically trigger ledger entries
 * by design, following the principle that the ledger is the single source of truth.
 */
@Injectable()
export class LedgerTransactionService {
  private readonly logger = new Logger(LedgerTransactionService.name);
  private readonly strategies: LedgerTransactionStrategy[] = [];

  constructor(
    private readonly postingService: LedgerPostingService,
    private readonly queryService: LedgerQueryService,
    private readonly purchaseStrategy: PurchasePostingStrategy,
    private readonly saleStrategy: SalePostingStrategy
  ) {
    // Register all available strategies
    this.strategies = [this.purchaseStrategy, this.saleStrategy];
    this.logger.log(`Initialized with ${this.strategies.length} posting strategies`);
  }

  /**
   * Post a transaction to the ledger automatically
   *
   * This method automatically determines the transaction type and routes it to
   * the appropriate strategy. The posting is idempotent - posting the same
   * transaction twice will result in only one ledger entry.
   *
   * @param data Transaction data - must include ctx, sourceId, channelId, and type-specific fields
   * @returns Posting result indicating success or failure
   */
  async postTransaction(data: TransactionData): Promise<PostingResult> {
    // Ensure channelId is set from context if not provided
    if (!data.channelId && data.ctx?.channelId) {
      data.channelId = data.ctx.channelId as number;
    }

    if (!data.channelId) {
      throw new Error('channelId is required for ledger posting');
    }

    // Find appropriate strategy
    const strategy = this.findStrategy(data);

    if (!strategy) {
      const error = `No strategy found to handle transaction with sourceId: ${data.sourceId}`;
      this.logger.error(error);
      return {
        success: false,
        error,
      };
    }

    this.logger.debug(
      `Posting ${strategy.getTransactionType()} transaction ${data.sourceId} using ${strategy.constructor.name}`
    );

    try {
      const result = await strategy.post(data);

      if (result.success) {
        this.logger.log(
          `Successfully posted ${strategy.getTransactionType()} transaction ${data.sourceId} to ledger`
        );
      } else {
        this.logger.warn(
          `Failed to post ${strategy.getTransactionType()} transaction ${data.sourceId}: ${result.error}`
        );
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error posting ${strategy.getTransactionType()} transaction ${data.sourceId}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Find the appropriate strategy for the given transaction data
   */
  private findStrategy(data: TransactionData): LedgerTransactionStrategy | null {
    for (const strategy of this.strategies) {
      if (strategy.canHandle(data)) {
        return strategy;
      }
    }
    return null;
  }

  /**
   * Register a new strategy (for extensibility)
   * Useful for adding new transaction types in the future
   */
  registerStrategy(strategy: LedgerTransactionStrategy): void {
    this.strategies.push(strategy);
    this.logger.log(`Registered new strategy: ${strategy.constructor.name}`);
  }
}

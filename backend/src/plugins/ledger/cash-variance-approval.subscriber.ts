import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ApprovalRequest } from '../../domain/approval/approval-request.entity';
import { ApprovalHandlerRegistry } from '../../services/approval/approval-handler.registry';
import { LedgerPostingService } from '../../services/financial/ledger-posting.service';

/**
 * Registers the cash_variance approval handler.
 *
 * A cash_variance action item is created whenever a session open/close posts a
 * variance adjustment (the cashier's declared amount becomes the ledger balance).
 * Approving the item REVERTS that adjustment: the handler posts a negating
 * journal entry, restoring the pre-adjustment ledger balance. Rejecting keeps
 * the declared value as the source of truth (no-op).
 */
@Injectable()
export class CashVarianceApprovalSubscriber implements OnModuleInit {
  private readonly logger = new Logger(CashVarianceApprovalSubscriber.name);

  constructor(
    private readonly approvalHandlerRegistry: ApprovalHandlerRegistry,
    private readonly ledgerPostingService: LedgerPostingService
  ) {}

  onModuleInit(): void {
    this.approvalHandlerRegistry.register('cash_variance', {
      onApproved: (ctx, request) => this.handleApproved(ctx, request),
    });
  }

  private async handleApproved(ctx: RequestContext, request: ApprovalRequest): Promise<void> {
    const { sessionId, reconciliationId, accountCode } = request.metadata ?? {};
    if (!sessionId || !reconciliationId || !accountCode) {
      this.logger.warn(
        `cash_variance approval ${request.id} approved but metadata is incomplete ` +
          `(sessionId=${sessionId}, reconciliationId=${reconciliationId}, accountCode=${accountCode}); skipping reversal.`
      );
      return;
    }
    const originalSourceId = `${sessionId}-${accountCode}-${reconciliationId}`;
    const reversed = await this.ledgerPostingService.postVarianceReversal(ctx, originalSourceId);
    this.logger.log(
      `Variance adjustment ${originalSourceId} reverted via approval ${request.id} (amount: ${reversed}).`
    );
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ApprovalRequest } from '../../domain/approval/approval-request.entity';

/**
 * Handler called when an approval request is approved.
 * Register per approval type so "what happens after approve" is centralized.
 */
export interface ApprovalHandler {
  onApproved(ctx: RequestContext, request: ApprovalRequest): Promise<void>;
}

/**
 * Registry of approval type -> handler.
 * After reviewApprovalRequest saves and publishes the event, the approval service
 * invokes the registered handler for action === 'approved'.
 * Add new types by registering a handler (e.g. in your plugin's onModuleInit).
 */
@Injectable()
export class ApprovalHandlerRegistry {
  private readonly logger = new Logger(ApprovalHandlerRegistry.name);
  private readonly handlers = new Map<string, ApprovalHandler>();

  register(type: string, handler: ApprovalHandler): void {
    if (this.handlers.has(type)) {
      this.logger.warn(`Approval handler for type "${type}" already registered; overwriting.`);
    }
    this.handlers.set(type, handler);
  }

  async invokeApproved(ctx: RequestContext, request: ApprovalRequest): Promise<void> {
    const handler = this.handlers.get(request.type);
    if (!handler) {
      return;
    }
    try {
      await handler.onApproved(ctx, request);
    } catch (err) {
      this.logger.error(
        `Approval handler for type "${request.type}" failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined
      );
      throw err;
    }
  }
}
